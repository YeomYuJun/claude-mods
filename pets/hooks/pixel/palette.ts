// 픽셀 버퍼는 색 대신 번호를 담는다. 번호 자리는 아래 배치표 하나로 고정하고, 색(RGB)은 세트(지형)와 품종(동물)이 채운 Theme 가 정한다.
// 버퍼가 Uint8Array 라 번호는 0~254 를 쓰고 255 는 비트맵의 투명이다.
// Raster 는 한 번에 서로 다른 (전경, 배경) 쌍 1024 개까지 정확히 칠하고 나머지는 가까운 색으로 칠한다.
// 규칙: 한 프레임에 나가는 서로 다른 색 쌍은 512 개 이하(tests/palette.test.ts 가 시드·줌·패널 크기별로 센다).
//
// 배치표
//   0          VOID(터미널 기본색)
//   1~55       지표 종류 5 개 × 11: 높이별 윗면 5, 윗면 그림자 2, 앞 모서리 하이라이트, 모눈선, 모눈선 그림자, 무늬
//   56~59      세트 공통 지형: 굵은 모눈선, 그 그림자, 가장자리(밑판 맨 아래 줄), 테(맵 뒤쪽 변의 선)
//   60~71      옆면 재질 3 개 × 4: 왼쪽 면, 오른쪽 면, 왼쪽 단 줄, 오른쪽 단 줄
//   72~79      물
//   80~99      소품
//   100~111    효과
//   112~159    동물 뱅크 4 개 × 12 역할
//   160        그림자 사슬 끝: 가장자리 색이 굵은 선 그림자보다 밝은 세트에서 굵은 선 그림자를 한 번 더 어둡게 할 색
//   161~254    예약

export const VOID = 0
export const TRANSPARENT = 255
export const DEFAULT_COLOR = 0x01000000
// 세트·품종이 채우지 않은 자리. 화면에 나오면 테스트가 잡는다
export const UNSET = 0xff00ff

// 지표 종류 묶음 안의 자리
export const KIND_SIZE = 11
export const KIND_COUNT = 5
export const Top = { TOP0: 0, TOP1: 1, TOP2: 2, TOP3: 3, TOP4: 4, TOP0_SH: 5, TOP1_SH: 6, HILITE: 7, LINE: 8, LINE_SH: 9, ACCENT: 10 } as const

export function kind(k: number): number {
  return 1 + KIND_SIZE * k
}

export const LINE_HEAVY = 56
export const LINE_HEAVY_SH = 57
export const EDGE = 58
export const RIM = 59
export const SHADE_END = 160

// 옆면 재질 묶음 안의 자리
export const MATERIAL_COUNT = 3
export const Side = { SIDE_L: 0, SIDE_R: 1, L_STEP: 2, R_STEP: 3 } as const

export function material(m: number): number {
  return 60 + 4 * m
}

export const WATER = 72
export const PROP = 80
export const PROP_COUNT = 20

// 효과. 흙·먼지·물방울은 세트가 칠하고 나머지는 고정 색이다
export const DUST = 100
export const DIRT = 101
export const SPLASH = 102
export const ZZZ = 103
export const EMOTE_INK = 104
export const HEART = 105
export const BALL = 106
export const BALL_HI = 107

// 동물 뱅크 묶음 안의 역할
export const BANK_SIZE = 12
export const BANK_COUNT = 4
export const Role = { outline: 0, body: 1, under: 2, far: 3, farLight: 4, eye: 5, lid: 6, tongue: 7, ear: 8, earDark: 9, collar: 10, pattern: 11 } as const
export type RoleName = keyof typeof Role

export function bank(k: number): number {
  return 112 + BANK_SIZE * k
}

// 세트 색: 지표 종류마다 윗면 5·그림자 2·하이라이트·선·선 그림자·무늬, 세트 공통 4, 옆면 재질마다 4, 흙·먼지·물방울
export type KindColors = { top: readonly [number, number, number, number, number]; topSh: readonly [number, number]; hilite: number; line: number; lineSh: number; accent: number }
export type MaterialColors = { sideL: number; sideR: number; lStep: number; rStep: number }
export type SetColors = {
  kinds: readonly KindColors[]
  lineHeavy: number
  lineHeavySh: number
  edge: number
  rim: number
  materials: readonly MaterialColors[]
  dust: number
  dirt: number
  splash: number
}
export type BankColors = Record<RoleName, number>

export type Theme = {
  // 번호마다 RGB. 256 칸
  rgb: readonly number[]
  // 윗면에 그림자가 떨어지면 칠할 번호. 사슬이 없는 번호는 자기 자신
  shadowOf: readonly number[]
}

// 모눈종이: 높을수록 밝은 윗면, 푸른 기 도는 회색 옆면
export const PAPER: SetColors = {
  kinds: [{ top: [0xdcdad5, 0xe5e3df, 0xedece8, 0xf4f3f0, 0xfafaf8], topSh: [0xc9c6c1, 0xd2cfca], hilite: 0xffffff, line: 0xc6c3c4, lineSh: 0xb2afb0, accent: UNSET }],
  lineHeavy: 0xa29ea0,
  lineHeavySh: 0x928e90,
  edge: 0x8a8688,
  rim: 0xa29ea0,
  materials: [{ sideL: 0xc1c2c8, sideR: 0xa2a3ab, lStep: 0xb1b2b9, rStep: 0x92939c }],
  dust: 0xdcdadb,
  dirt: 0x8b8587,
  splash: UNSET,
}

// 흰 비글: 흰 몸, 늘어진 갈색 귀, 빨간 목줄
export const WHITE_DOG: BankColors = {
  outline: 0x2b2426, body: 0xfdfdfd, under: 0xd9d6d7, far: 0x7d7274, farLight: 0xb3abac, eye: 0x141212,
  lid: 0x625a5c, tongue: 0xe38a9b, ear: 0xc47f4a, earDark: 0x8e5433, collar: 0xe2433b, pattern: 0xfdfdfd,
}

// 세트·품종과 상관없는 효과 색
const FIXED: ReadonlyArray<readonly [number, number]> = [
  [ZZZ, 0x6d6a6b], [EMOTE_INK, 0x2b2426], [HEART, 0xe38a9b], [BALL, 0x5c5859], [BALL_HI, 0xf6f6f6],
]

// 밝기(0~255). 그림자 색이 원래 색보다 어두운지 이것으로 가른다
export function lumaOf(rgb: number): number {
  return 0.299 * ((rgb >> 16) & 255) + 0.587 * ((rgb >> 8) & 255) + 0.114 * (rgb & 255)
}

// 채널마다 k 배
export function scale(rgb: number, k: number): number {
  const c = (shift: number) => Math.round(((rgb >> shift) & 255) * k)
  return (c(16) << 16) | (c(8) << 8) | c(0)
}

export function themeOf(set: SetColors, banks: readonly BankColors[]): Theme {
  const rgb: number[] = new Array(256).fill(UNSET)
  rgb[VOID] = DEFAULT_COLOR
  rgb[TRANSPARENT] = DEFAULT_COLOR
  const shadowOf: number[] = rgb.map((_, i) => i)
  set.kinds.slice(0, KIND_COUNT).forEach((c, k) => {
    const base = kind(k)
    c.top.forEach((v, i) => { rgb[base + i] = v })
    rgb[base + Top.TOP0_SH] = c.topSh[0]
    rgb[base + Top.TOP1_SH] = c.topSh[1]
    rgb[base + Top.HILITE] = c.hilite
    rgb[base + Top.LINE] = c.line
    rgb[base + Top.LINE_SH] = c.lineSh
    rgb[base + Top.ACCENT] = c.accent
    // 그림자는 같은 종류 안에서 두 단 아래 윗면 색을 빌리고, 선은 세트 공통 굵은 선 그림자로 이어진다
    const chain: ReadonlyArray<readonly [number, number]> = [
      [Top.TOP0, Top.TOP0_SH], [Top.TOP1, Top.TOP1_SH], [Top.TOP2, Top.TOP0], [Top.TOP3, Top.TOP1], [Top.TOP4, Top.TOP2],
      [Top.HILITE, Top.TOP3], [Top.TOP1_SH, Top.LINE], [Top.TOP0_SH, Top.LINE_SH], [Top.LINE, Top.LINE_SH],
    ]
    for (const [from, to] of chain) shadowOf[base + from] = base + to
    shadowOf[base + Top.LINE_SH] = LINE_HEAVY_SH
  })
  rgb[LINE_HEAVY] = set.lineHeavy
  rgb[LINE_HEAVY_SH] = set.lineHeavySh
  rgb[EDGE] = set.edge
  rgb[RIM] = set.rim
  shadowOf[LINE_HEAVY] = LINE_HEAVY_SH
  shadowOf[RIM] = LINE_HEAVY_SH
  // 가장자리 색이 더 어두우면 그것으로 사슬을 끝내고(모눈종이), 아니면 굵은 선 그림자를 한 번 더 어둡게 한 색으로 끝낸다
  if (lumaOf(set.edge) < lumaOf(set.lineHeavySh)) shadowOf[LINE_HEAVY_SH] = EDGE
  else {
    rgb[SHADE_END] = scale(set.lineHeavySh, 0.9)
    shadowOf[LINE_HEAVY_SH] = SHADE_END
  }
  set.materials.slice(0, MATERIAL_COUNT).forEach((c, m) => {
    const base = material(m)
    rgb[base + Side.SIDE_L] = c.sideL
    rgb[base + Side.SIDE_R] = c.sideR
    rgb[base + Side.L_STEP] = c.lStep
    rgb[base + Side.R_STEP] = c.rStep
  })
  rgb[DUST] = set.dust
  rgb[DIRT] = set.dirt
  rgb[SPLASH] = set.splash
  for (const [i, v] of FIXED) rgb[i] = v
  banks.slice(0, BANK_COUNT).forEach((c, k) => {
    for (const role of Object.keys(Role) as RoleName[]) rgb[bank(k) + Role[role]] = c[role]
  })
  return { rgb, shadowOf }
}

export const PAPER_THEME: Theme = themeOf(PAPER, [WHITE_DOG])
