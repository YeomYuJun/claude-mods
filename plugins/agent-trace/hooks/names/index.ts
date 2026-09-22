export const PLUGIN_NAME = 'agent-trace'
export const PANE_ID = 'trace'
export const COMMAND_NAME = 'trace'
export const COMMAND_DESCRIPTION = '병행 에이전트 흐름 패널을 열고 닫는다'
export const PANE_TITLE = 'Agent trace'
export const PANEL_SHOWN_TEXT = 'Agent trace panel shown'
export const PANEL_HIDDEN_TEXT = 'Agent trace panel hidden'

export const POLL_MS = 2000
export const DONE_IDLE_MS = 60_000
export const MAX_READ_BYTES = 4 * 1024 * 1024
export const COMPACT_OVER = 20
export const MIN_COLUMN = 24
export const GAP = 3
export const INDENT = 4

export const REFRESH_TOOLS: readonly string[] = ['Agent', 'Task', 'Workflow', 'SendMessage', 'TaskStop', 'Bash', 'PowerShell']

export * as default from '.'
