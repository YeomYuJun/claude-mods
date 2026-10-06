import type { Messages } from './types.js'

export const en = {
  commandDescription: 'Open or close the auto-playing Tetris panel driven by tokens',
  panelShown: 'Opened the Tetris panel',
  panelHidden: 'Closed the Tetris panel',
  tooSmall: (minCols, minRows, cols, rows) => [`The panel needs at least ${minCols} columns × ${minRows} rows`, `Now ${cols} columns × ${rows} rows`],
  notTerminal: 'Tetris draws only in a terminal panel',
} satisfies Messages
