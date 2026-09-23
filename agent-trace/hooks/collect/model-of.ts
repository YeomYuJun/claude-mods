import type { AgentInfo } from 'claude-code'

import { statusOf, type FileAccess, type TraceModel, type TraceNode } from '../model'
import { agentOf, type AgentFacts, type AgentMeta } from './agent-of.js'
import type { MainFacts } from './main-of.js'
import type { Row } from './rows.js'
import { workflowOf } from './workflow-of.js'

export type AgentFile = { id: string; meta: AgentMeta; rows: Row[]; transcriptPath: string; workflowRunId?: string; tooLarge?: boolean }

export type ModelInput = {
  rootId: string
  rootLabel: string
  model?: string
  contextTokens?: number
  startedAt?: number
  main: MainFacts
  agents: AgentFile[]
  workflows: Row[]
  live: AgentInfo[]
  nowTools: Map<string, string>
  stopped?: Map<string, number>
  now: number
}

export function traceOf(input: ModelInput): TraceModel {
  const { rootId, main, live, nowTools, now } = input
  const root: TraceNode = {
    id: rootId, kind: 'session', label: input.rootLabel, depth: 0, status: 'running',
    model: input.model, contextTokens: input.contextTokens, toolCalls: [], startedAt: input.startedAt,
  }

  const facts = new Map<string, AgentFacts>()
  const files: FileAccess[] = [...main.files]
  for (const agent of input.agents) {
    const fact = agentOf({ id: agent.id, meta: agent.meta, rows: agent.rows, transcriptPath: agent.transcriptPath, now, tooLarge: agent.tooLarge })
    facts.set(agent.id, fact)
    files.push(...fact.files)
  }

  const callOwner = new Map<string, string>()
  for (const [id, fact] of facts) for (const callId of fact.agentCallIds) callOwner.set(callId, id)

  const nodes = new Map<string, TraceNode>([[rootId, root]])
  for (const json of input.workflows) {
    for (const node of workflowOf({ json, parentId: rootId, now })) nodes.set(node.id, node)
  }

  for (const agent of input.agents) {
    const fact = facts.get(agent.id)
    if (!fact) continue
    const existing = nodes.get(agent.id)
    if (agent.workflowRunId && existing) {
      nodes.set(agent.id, { ...existing, tokens: fact.node.tokens, toolCalls: fact.node.toolCalls, transcriptPath: fact.node.transcriptPath, endedAt: fact.node.endedAt })
      continue
    }
    let parentId = agent.meta.parentAgentId
      ?? (agent.meta.toolUseId ? callOwner.get(agent.meta.toolUseId) : undefined)
    // 이 세션이 저절로 만든 팀(session-<세션 id 앞 8자>)은 노드로 세우지 않는다. 좁은 패널에서 한 단을 먹기만 한다.
    const isOwnTeam = agent.meta.teamName === `session-${rootId.slice(0, 8)}`
    if (!parentId && agent.meta.taskKind === 'in_process_teammate' && agent.meta.teamName && !isOwnTeam) {
      const teamId = `team:${agent.meta.teamName}`
      if (!nodes.has(teamId)) {
        nodes.set(teamId, { id: teamId, kind: 'team', label: agent.meta.teamName, parentId: rootId, depth: 1, status: 'running', toolCalls: [], startedAt: fact.node.startedAt })
      }
      parentId = teamId
    }
    nodes.set(agent.id, { ...fact.node, parentId: parentId ?? agent.workflowRunId ?? rootId })
  }

  for (const shell of main.shells) nodes.set(shell.id, shell)

  const liveById = new Map(live.map(agent => [agent.id, agent]))
  for (const [id, node] of nodes) {
    if (node.kind === 'session' || node.kind === 'team' || node.kind === 'workflow' || node.kind === 'shell') continue
    const liveAgent = liveById.get(id)
    const notified = node.toolUseId ? main.notified.get(node.toolUseId) : undefined
    const liveStatus = statusOf(liveAgent?.status)
    const isWaiting = node.kind === 'teammate' && node.status === 'idle' && (liveStatus === undefined || liveStatus === 'running')
    const judged = isWaiting ? 'idle' : liveStatus ?? statusOf(notified) ?? node.status
    // 정지된 팀원은 목록에서 빠지고 기록은 끝나지 않은 도구 호출로 멈춰 있다. 정지 성공을 기억해 둔 값이 이긴다.
    const stoppedAt = input.stopped?.get(id)
    const isStopped = stoppedAt !== undefined && (judged === 'running' || judged === 'idle')
    const status = isStopped ? 'stopped' : judged
    const nowTool = status === 'running' ? nowTools.get(id) ?? node.nowTool : undefined
    const name = liveAgent?.name ?? node.name
    nodes.set(id, { ...node, ...(name ? { name } : {}), status, rawStatus: isStopped ? undefined : liveAgent?.status ?? notified ?? node.rawStatus, nowTool, ...(isStopped ? { endedAt: stoppedAt } : {}) })
  }

  for (const [id, node] of nodes) {
    if (node.kind !== 'team') continue
    const members = [...nodes.values()].filter(member => member.parentId === id)
    const status = members.some(member => member.status === 'running') ? 'running' : members.some(member => member.status === 'idle') ? 'idle' : 'done'
    nodes.set(id, { ...node, status })
  }

  for (const [id, node] of nodes) {
    if (id !== rootId && node.parentId && !nodes.has(node.parentId)) nodes.set(id, { ...node, parentId: rootId })
  }

  const labelByKey = new Map<string, string>()
  for (const node of nodes.values()) labelByKey.set(node.id, node.label)
  for (const agent of input.agents) if (agent.meta.name) labelByKey.set(agent.meta.name, nodes.get(agent.id)?.label ?? agent.meta.name)
  for (const [id, fact] of facts) {
    if (fact.sends.length === 0) continue
    const counts = new Map<string, number>()
    for (const to of fact.sends) {
      const label = labelByKey.get(to) ?? to
      counts.set(label, (counts.get(label) ?? 0) + 1)
    }
    const node = nodes.get(id)
    if (node) nodes.set(id, { ...node, sentTo: [...counts].map(([to, count]) => ({ to, count })) })
  }

  return { rootId, nodes: ordered(nodes, rootId), files }
}

function ordered(nodes: Map<string, TraceNode>, rootId: string): TraceNode[] {
  const children = new Map<string, TraceNode[]>()
  for (const node of nodes.values()) {
    if (node.id === rootId || !node.parentId) continue
    const list = children.get(node.parentId) ?? []
    list.push(node)
    children.set(node.parentId, list)
  }
  const out: TraceNode[] = []
  const visit = (node: TraceNode, depth: number) => {
    out.push({ ...node, depth })
    const kids = (children.get(node.id) ?? []).sort((a, b) => (a.startedAt ?? 0) - (b.startedAt ?? 0))
    for (const kid of kids) visit(kid, depth + 1)
  }
  const root = nodes.get(rootId)
  if (root) visit(root, 0)
  return out
}
