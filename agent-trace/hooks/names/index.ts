export const PLUGIN_NAME = 'agent-trace'
export const PANE_ID = 'trace'
export const COMMAND_NAME = 'trace'
export const PANE_TITLE = 'agent trace'

export const POLL_MS = 2000
export const DONE_IDLE_MS = 60_000
export const MAX_READ_BYTES = 4 * 1024 * 1024
export const COMPACT_OVER = 20
export const MIN_COLUMN = 24
export const GAP = 3
export const INDENT = 4

export const AUTO_OPEN_COLUMNS = 144
export const AUTO_OPEN_TOOLS: readonly string[] = ['Agent', 'Task', 'Workflow']

export const REFRESH_TOOLS: readonly string[] = ['Agent', 'Task', 'Workflow', 'SendMessage', 'TaskStop', 'Bash', 'PowerShell']

export * as default from '.'
