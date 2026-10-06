export const PLUGIN_NAME = 'auto-tetris'
export const PANE_ID = 'tetris'
export const COMMAND_NAME = 'tetris'
export const PANE_TITLE = 'TETRIS'
export const RASTER_KEY = 'board'

// 고정 가로: 보드 한 칸 = 2열 × 1행, 보드 20열 + 테두리 2열 + 여백 2열
export const COLS = 24
// 보드와 테두리까지는 반드시 보여야 한다. 그 아래 정보 줄은 남는 만큼만 그린다
export const MIN_ROWS = 22
// 인라인(전체 화면 레이아웃이 아닐 때) 패널이 원하는 높이
export const INLINE_ROWS = 40

export const FRAME_MS = 33
export const TOKENS_PER_MOVE = 12
// 패널이 닫혀 있거나 애니메이션 중에 쌓아 둘 수 있는 수의 상한
export const MAX_BACKLOG_MOVES = 40

export * as default from '.'
