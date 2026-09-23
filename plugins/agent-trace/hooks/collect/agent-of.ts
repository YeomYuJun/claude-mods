import Names from '../names'
import type { FileAccess, ToolCall, TraceNode } from '../model'
import { atOf, blocksOf, fileOpOf, filePathOf, modelOf, plainTextOf, summaryOf, usageTotalOf, type Row } from './rows.js'

export type AgentMeta = {
  agentType?: string
  description?: string
  name?: string
  toolUseId?: string
  spawnDepth?: number
  parentAgentId?: string
  requestShape?: string
  model?: string
  taskKind?: string
  teamName?: string
  stoppedByUser?: boolean
}

export type AgentFacts = { node: TraceNode; files: FileAccess[]; agentCallIds: string[]; sends: string[] }

const AGENT_TOOLS = new Set(['Agent', 'Task'])

export function agentOf(input: { id: string; meta: AgentMeta; rows: Row[]; transcriptPath: string; now: number; tooLarge?: boolean }): AgentFacts {
  const { id, meta, rows, transcriptPath, now } = input
  const calls = new Map<string, ToolCall>()
  const files: FileAccess[] = []
  const agentCallIds: string[] = []
  const sends: string[] = []
  let prompt: string | undefined
  let model = meta.model
  let tokens: number | undefined
  let startedAt: number | undefined
  let endedAt: number | undefined
  let lastWasFinalText = false

  for (const row of rows) {
    const at = atOf(row)
    if (at !== undefined) {
      startedAt ??= at
      endedAt = at
    }
    if (row.type === 'user' && prompt === undefined) {
      const text = plainTextOf(row)
      if (text !== undefined && blocksOf(row).every(block => block.type !== 'tool_result')) prompt = text
    }
    if (row.type === 'assistant') {
      model = modelOf(row) ?? model
      tokens = usageTotalOf(row) ?? tokens
      const uses = blocksOf(row).filter(block => block.type === 'tool_use')
      lastWasFinalText = uses.length === 0
      for (const use of uses) {
        const name = use.name ?? '?'
        const filePath = filePathOf(use.input)
        calls.set(use.id ?? `${calls.size}`, { id: use.id ?? `${calls.size}`, name, summary: summaryOf(use.input), at, ...(filePath ? { filePath } : {}) })
        const op = fileOpOf(name)
        if (op && filePath) files.push({ path: filePath, nodeId: id, op, at })
        if (AGENT_TOOLS.has(name) && use.id) agentCallIds.push(use.id)
        if (name === 'SendMessage' && typeof use.input?.to === 'string') sends.push(use.input.to)
      }
    }
    if (row.type === 'user') {
      for (const block of blocksOf(row)) {
        if (block.type !== 'tool_result' || !block.tool_use_id) continue
        const call = calls.get(block.tool_use_id)
        if (call) call.ok = block.is_error !== true
      }
      lastWasFinalText = false
    }
  }

  const toolCalls = [...calls.values()]
  const pending = [...toolCalls].reverse().find(call => call.ok === undefined)
  const isIdle = endedAt !== undefined && now - endedAt > Names.DONE_IDLE_MS
  const isTeammate = meta.taskKind === 'in_process_teammate'
  // 팀원은 답을 낸 뒤에도 끝나지 않고 다음 메시지를 기다린다. 마지막 줄이 답이면 대기다.
  const status = meta.stoppedByUser ? 'stopped' : !lastWasFinalText ? 'running' : isTeammate ? 'idle' : isIdle ? 'done' : 'running'

  const node: TraceNode = {
    id,
    kind: isTeammate ? 'teammate' : 'subagent',
    label: meta.description ?? meta.name ?? id,
    ...(meta.name ? { name: meta.name } : {}),
    depth: meta.spawnDepth ?? 1,
    status,
    agentType: meta.agentType,
    model,
    runMode: meta.requestShape === 'background' ? 'background' : 'foreground',
    tokens,
    nowTool: status === 'running' ? pending?.name : undefined,
    prompt,
    toolCalls,
    startedAt,
    endedAt,
    transcriptPath,
    toolUseId: meta.toolUseId,
    ...(input.tooLarge ? { note: 'too-large' as const } : {}),
  }
  return { node, files, agentCallIds, sends }
}
