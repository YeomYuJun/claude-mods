export type NodeKind = 'session' | 'subagent' | 'teammate' | 'team' | 'workflow' | 'workflowAgent' | 'shell'
export type Status = 'running' | 'done' | 'failed' | 'stopped'
export type FileOp = 'read' | 'edit' | 'write'

export type ToolCall = {
  id: string
  name: string
  summary: string
  ok?: boolean
  at?: number
  filePath?: string
}

export type SentTo = { to: string; count: number }

export type TraceNode = {
  id: string
  kind: NodeKind
  label: string
  parentId?: string
  depth: number
  status: Status
  rawStatus?: string
  agentType?: string
  model?: string
  runMode?: 'background' | 'foreground'
  tokens?: number
  contextTokens?: number
  nowTool?: string
  prompt?: string
  toolCalls: ToolCall[]
  startedAt?: number
  endedAt?: number
  transcriptPath?: string
  toolUseId?: string
  phase?: { done: number; total: number }
  sentTo?: SentTo[]
  note?: 'too-large'
}

export type FileAccess = { path: string; nodeId: string; op: FileOp; at?: number }

export type TraceModel = { rootId: string; nodes: TraceNode[]; files: FileAccess[] }
