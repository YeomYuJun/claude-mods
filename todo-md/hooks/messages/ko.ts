import type { Messages } from './types.js'

export const ko = {
  commandDescription: 'TODO.md 체크리스트 패널을 연다. 인자로 md 파일 경로를 주면 그 파일을 본다',
  argumentHint: '[경로]',
  panelShown: path => `TODO 패널을 열었다: ${path}`,
  panelHidden: 'TODO 패널을 닫았다',
  notReady: '아직 플러그인을 불러오는 중이다. 잠시 뒤 다시 부른다',
  progress: (done, total) => `${done}/${total} 완료`,
  missing: '파일이 없다. 만들면 바로 보인다',
  tooLarge: kib => `파일이 ${kib} KiB 라 읽지 않는다`,
  readFailed: message => `읽지 못했다: ${message}`,
  noItems: '체크리스트 항목이 없다',
} satisfies Messages
