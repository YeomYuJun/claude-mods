import { statusOf, type TraceNode } from '../model'
import type { Row } from './rows.js'

type Progress = {
  type?: string
  index?: number
  title?: string
  label?: string
  phaseIndex?: number
  agentId?: string
  model?: string
  state?: string
  startedAt?: number
  lastToolName?: string
  promptPreview?: string
}

const text = (value: unknown) => typeof value === 'string' ? value : undefined
const number = (value: unknown) => typeof value === 'number' ? value : undefined

export function workflowOf(input: { json: Row; parentId: string; now: number }): TraceNode[] {
  const { json, parentId } = input
  const runId = text(json.runId) ?? 'workflow'
  const progress = (Array.isArray(json.workflowProgress) ? json.workflowProgress : []) as Progress[]
  const agents = progress.filter(item => item.type === 'workflow_agent' && item.agentId)
  const phaseCount = Array.isArray(json.phases) ? json.phases.length : progress.filter(item => item.type === 'workflow_phase').length
  const phasesDone = new Set<number>()
  for (const phase of new Set(agents.map(agent => agent.phaseIndex ?? 0))) {
    const inPhase = agents.filter(agent => (agent.phaseIndex ?? 0) === phase)
    if (inPhase.length > 0 && inPhase.every(agent => statusOf(agent.state) === 'done')) phasesDone.add(phase)
  }
  const startedAt = number(json.startTime)
  const duration = number(json.durationMs)
  const status = statusOf(text(json.status)) ?? 'running'

  const flow: TraceNode = {
    id: runId,
    kind: 'workflow',
    label: text(json.workflowName) ?? runId,
    parentId,
    depth: 1,
    status,
    rawStatus: text(json.status),
    model: text(json.defaultModel),
    tokens: number(json.totalTokens),
    toolCalls: [],
    startedAt,
    endedAt: status !== 'running' && startedAt !== undefined && duration ? startedAt + duration : undefined,
    phase: { done: phasesDone.size, total: phaseCount },
  }

  const children = agents.map((agent): TraceNode => {
    const agentStatus = statusOf(agent.state) ?? 'running'
    return {
      id: agent.agentId ?? `${runId}:${agent.index}`,
      kind: 'workflowAgent',
      label: agent.label ?? agent.agentId ?? '?',
      parentId: runId,
      depth: 2,
      status: agentStatus,
      rawStatus: agent.state,
      model: agent.model,
      runMode: 'background',
      nowTool: agentStatus === 'running' ? agent.lastToolName : undefined,
      prompt: agent.promptPreview,
      toolCalls: [],
      startedAt: agent.startedAt,
    }
  })

  return [flow, ...children]
}
