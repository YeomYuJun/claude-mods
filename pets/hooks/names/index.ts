export const PLUGIN_NAME = 'pets'
export const PANE_ID = 'pets'
export const COMMAND_NAME = 'pets'
export const COMMAND_DESCRIPTION = '강아지 패널을 열고 닫는다. band: 프롬프트 위 띠, zoom [in|out]: 원거리·1 배·2 배, world [세트|auto]: 맵 세트, pet [품종|auto]: 강아지 품종'
export const ARGUMENT_HINT = 'band | zoom [in|out] | world [세트|auto] | pet [품종|auto]'
export const PANE_TITLE = '강아지'
export const PANEL_SHOWN_TEXT = '강아지 패널을 열었다'
export const PANEL_HIDDEN_TEXT = '강아지 패널을 닫았다'
export const BAND_SHOWN_TEXT = '프롬프트 위 띠에 강아지를 띄웠다'
export const BAND_HIDDEN_TEXT = '프롬프트 위 띠에서 강아지를 내렸다'
export const ZOOM_TEXT = (zoom: 'far' | 1 | 2) => zoom === 'far' ? '원거리로 넓게 보게 바꿨다' : `도트 크기를 ${zoom} 배로 바꿨다`
export const ZOOM_LIMIT_TEXT = (zoom: 'far' | 1 | 2) => zoom === 'far' ? '이미 가장 넓게(원거리) 보고 있다' : '이미 가장 크게(2 배) 보고 있다'
export const USAGE_TEXT = '/pets (패널 열고 닫기), /pets band (띠 켜고 끄기), /pets zoom (원거리 → 1 배 → 2 배 순환), /pets zoom in · out (한 단계씩), /pets world (맵 세트 보기·바꾸기), /pets pet (강아지 품종 보기·바꾸기)'
// 세트 목록 글: "paper 모눈종이, meadow 초원, …, auto(세션마다 모눈종이 밖에서 고름)"
export const WORLD_CHOICES = (sets: ReadonlyArray<{ id: string; label: string }>) => `${sets.map(s => `${s.id} ${s.label}`).join(', ')}, auto(세션마다 모눈종이 밖에서 고름)`
export const WORLD_NOW_TEXT = (label: string, isAuto: boolean, choices: string) => `지금 맵 세트: ${label}${isAuto ? '(자동)' : ''}. 고를 수 있는 세트: ${choices}`
export const WORLD_TEXT = (label: string, isAuto: boolean) => `맵 세트를 ${isAuto ? `자동으로 바꿨다(이 세션은 ${label} 세트)` : `${label} 세트로 바꿨다`}. 맵을 새로 만들고 강아지를 새 자리에 두었다`
export const PET_CHOICES = (breeds: ReadonlyArray<{ id: string; label: string }>) => `${breeds.map(b => `${b.id} ${b.label}`).join(', ')}, auto(세션마다 흰 강아지 밖에서 고름)`
export const PET_NOW_TEXT = (label: string, isAuto: boolean, choices: string) => `지금 강아지: ${label}${isAuto ? '(자동)' : ''}. 고를 수 있는 품종: ${choices}`
export const PET_TEXT = (label: string, isAuto: boolean, dropped: number) =>
  `강아지를 ${isAuto ? `자동으로 바꿨다(이 세션은 ${label})` : `바꿨다: ${label}`}${dropped > 0 ? `. 지금은 한 마리만 두어 첫 번째만 썼다(${dropped} 개는 무시)` : ''}`
export const PET_UNKNOWN_TEXT = (word: string, choices: string) => `'${word}' 라는 품종은 없다. 고를 수 있는 품종: ${choices}`
export const WORLD_UNKNOWN_TEXT = (word: string, choices: string) => `'${word}' 라는 맵 세트는 없다. 고를 수 있는 세트: ${choices}`
export const RASTER_KEY = 'map'
export const BAND_KEY = 'band'
export const STORE_BAND = 'band'
// 줌 단계('far' | 1 | 2). 이 키에 숫자 1·2 만 저장된 세션도 그대로 읽는다(scene 의 zoomOf)
export const STORE_SCALE = 'scale'
// 맵 세트: { v: 1, set: 세트 id | 'auto' }. 모르는 모양·버전·id 면 모눈종이로 보고 지우지 않는다
export const STORE_WORLD = 'world'
export const STORE_WORLD_VERSION = 1
// 강아지 품종: { v: 1, list: [품종 id] | 'auto' }. 지금은 한 마리. 모르는 모양·버전·id 면 흰 강아지로 보고 지우지 않는다
export const STORE_PETS = 'pets'
export const STORE_PETS_VERSION = 1

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
// 원거리 줌: 그릴 때만 쓰는 8 × 4 픽셀 다이아몬드, 한 단 3 픽셀, 밑판 2 픽셀. 모눈선은 3 칸마다만 긋는다
export const FAR_TILE_W = 8
export const FAR_TILE_H = 4
export const FAR_STEP_PX = 3
export const FAR_BASE_PX = 2
export const FAR_LINE_EVERY = 3

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
