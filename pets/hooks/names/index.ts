export const PLUGIN_NAME = 'pets'
export const PANE_ID = 'pets'
export const COMMAND_NAME = 'pets'
export const PANE_TITLE = 'pets'
export const RASTER_KEY = 'map'
export const BAND_KEY = 'band'
// 줌 단계('wide' | 'far' | 1 | 2). 값이 없거나 모르는 값이면 맵 보기이고, 이 키에 숫자 1·2 만 저장된 세션도 그대로 읽는다(scene 의 zoomOf)
export const STORE_SCALE = 'scale'
// 맵 세트: { v: 1, set: 세트 id | 'auto' }. 모르는 모양·버전·id 면 모눈종이로 보고 지우지 않는다
export const STORE_WORLD = 'world'
export const STORE_WORLD_VERSION = 1
// 동물 품종: { v: 1, list: [품종 id] | 'auto' }. 지금은 한 마리. 모르는 모양·버전·id 면 흰 강아지로 보고 지우지 않는다
export const STORE_PETS = 'pets'
export const STORE_PETS_VERSION = 1
// 잠들지 않기: { v: 1, on: boolean }. 모르는 모양·버전이면 꺼진 것으로 보고 지우지 않는다
export const STORE_IDLE = 'idle'
export const STORE_IDLE_VERSION = 1
// 강아지가 바꾼 칸(옮긴 나뭇가지, 구덩이 흔적): 'edits:<세트>:<세션 시드 16 진 8 자>' 키에 { v: 1, at, list }. 키는 가장 최근 것 EDITS_KEYS 개까지 남기고,
// 바뀌었으면 EDITS_SAVE_MS 에 한 번과 세션 끝에 쓴다. 모르는 모양·버전이면 빈 표로 보고 그 키에는 쓰지도 지우지도 않는다
export const STORE_EDITS_PREFIX = 'edits:'
export const STORE_EDITS_KEY = (set: string, seed: number) => `${STORE_EDITS_PREFIX}${set}:${(seed >>> 0).toString(16).padStart(8, '0')}`
export const EDITS_KEYS = 8
export const EDITS_SAVE_MS = 60_000

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
// 맵 보기 줌(가장 넓게, 처음 단계): 그릴 때만 쓰는 4 × 2 픽셀 다이아몬드, 한 단 2 픽셀, 밑판 1 픽셀. 모눈선은 6 칸마다만 긋는다
export const WIDE_TILE_W = 4
export const WIDE_TILE_H = 2
export const WIDE_STEP_PX = 2
export const WIDE_BASE_PX = 1
export const WIDE_LINE_EVERY = 6
// 원거리·맵 보기에서 동물을 그리는 크기. 개발용 전환이다: 명령·저장값이 없어 사용자는 바꿀 수 없고, 이 줄을 고쳐 바꾼다.
// 'full' 원래 크기, 'twoThirds' 2/3(3 × 3 픽셀을 2 × 2 로), 'half' 절반(2 × 2 픽셀을 한 픽셀로). 1 배·2 배는 늘 원래 크기다.
// 바꾸면 tests/frames.test.ts 의 원거리·맵 보기 셀 해시 18 개가 달라져 다시 기록해야 한다
export type PetScale = 'full' | 'twoThirds' | 'half'
export const FAR_PET_SCALE: PetScale = 'full'

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
export const SLEEP_AFTER_MS = 180_000
// 잠든 지 이만큼 지나고 기운이 가득 차면 스스로 깬다. 깨면 신호 없는 시간을 새로 잰다
export const SLEEP_MS = 60_000

export * as default from '.'
