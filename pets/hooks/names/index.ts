export const PLUGIN_NAME = 'pets'
export const PANE_ID = 'pets'
export const COMMAND_NAME = 'pets'
export const COMMAND_DESCRIPTION = '강아지 패널을 열고 닫는다. band: 프롬프트 위 띠, zoom: 도트 크기 1·2 배'
export const PANE_TITLE = '강아지'
export const PANEL_SHOWN_TEXT = '강아지 패널을 열었다'
export const PANEL_HIDDEN_TEXT = '강아지 패널을 닫았다'
export const BAND_SHOWN_TEXT = '프롬프트 위 띠에 강아지를 띄웠다'
export const BAND_HIDDEN_TEXT = '프롬프트 위 띠에서 강아지를 내렸다'
export const ZOOM_TEXT = (scale: number) => `도트 크기를 ${scale} 배로 바꿨다`
export const USAGE_TEXT = '/pets (패널 열고 닫기), /pets band (띠 켜고 끄기), /pets zoom (도트 1·2 배)'
export const RASTER_KEY = 'map'
export const BAND_KEY = 'band'
export const STORE_BAND = 'band'
export const STORE_SCALE = 'scale'

// 패널: 요청 폭과 최소 크기(셀). 사람이 끈 폭이 이긴다
export const COLS = 40
export const MIN_COLS = 32
export const MIN_ROWS = 24
// 인라인(전체 화면 레이아웃이 아닐 때) 패널이 원하는 높이
export const INLINE_ROWS = 30

// 띠: 3 행 = 세로 6 픽셀(강아지 5 + 바닥 1)
export const BAND_ROWS = 3

// 타일: 12 × 6 픽셀 다이아몬드, 높이 한 단 4 픽셀, 맵 밑판 두께 3 픽셀
export const TILE_W = 12
export const TILE_H = 6
export const STEP_PX = 4
export const BASE_PX = 3

// 맵 크기(타일): 시드로 MIN~MAX 사이에서 정한다
export const MAP_MIN = 20
export const MAP_MAX = 32

// 프레임 타이머. 그리기는 상태에 따라 더 드물게 한다(scene 의 renderEveryMs)
export const FRAME_MS = 33
export const BAND_ONLY_FRAME_MS = 66
// 시뮬레이션 고정 스텝. 프레임 사이 시간을 이 크기로 잘라 돌린다(목적지·홉 호를 넘지 않게)
export const SIM_STEP_MS = 1000 / 60
// 한 프레임에 따라잡는 시간의 상한. 패널을 다시 열었을 때 한꺼번에 몰리지 않게 한다
export const MAX_CATCHUP_MS = 1000

// 신호 없이 이만큼 지나면 잠든다. 도구가 실행 중인 동안은 신호가 이어지는 것으로 본다
export const SLEEP_AFTER_MS = 60_000

export * as default from '.'
