import type { Messages } from './types.js'

export const ko = {
  commandDescription: '토큰으로 움직이는 자동 테트리스 패널을 열고 닫는다',
  panelShown: '테트리스 패널을 열었다',
  panelHidden: '테트리스 패널을 닫았다',
  tooSmall: (minCols, minRows, cols, rows) => [`패널이 ${minCols}열 × ${minRows}행 이상이어야 한다`, `지금 ${cols}열 × ${rows}행`],
  notTerminal: '테트리스는 터미널 패널에서만 그린다',
} satisfies Messages
