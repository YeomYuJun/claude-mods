// 픽셀 버퍼는 색 대신 이 표의 번호를 담는다. 화면에 나가는 색 쌍이 이 표 안에서만 생겨
// Raster 의 1024 쌍 한도를 넘지 않는다(번호 32 개면 쌍은 최대 1024).

export const VOID = 0
// 모눈종이 지형
export const TOP = 1
export const LINE = 2
export const LINE_HEAVY = 3
export const LEFT = 4
export const RIGHT = 5
export const EDGE = 6
// 그림자가 진 윗면·선
export const TOP_SH = 7
export const LINE_SH = 8
export const LINE_HEAVY_SH = 9
// 강아지
export const OUTLINE = 10
export const WHITE = 11
export const SHADE = 12
export const FAR = 13
export const BLACK = 14
export const PINK = 15
export const EAR = 16
// 효과
export const DUST = 17
export const DIRT = 18
export const ZZZ = 19
export const BALL = 20
export const BALL_HI = 21
export const FLOOR = 22

export const DEFAULT_COLOR = 0x01000000

export const RGB: readonly number[] = [
  DEFAULT_COLOR,
  0xececec, 0xc6c3c4, 0xa29ea0, 0xc4c1c2, 0xa5a1a3, 0x8a8688,
  0xd6d4d5, 0xb2afb0, 0x928e90,
  0x3b3838, 0xfdfdfd, 0xd9d6d7, 0x6f6b6c, 0x141212, 0xe38a9b, 0xbdb9bb,
  0xdcdadb, 0x8b8587, 0x6d6a6b, 0x5c5859, 0xf6f6f6, 0x8f8b8d,
]

// 강아지 그림자가 윗면에 떨어지면 이 번호로 바꾼다
export const SHADOW_OF: readonly number[] = RGB.map((_, i) => i === TOP ? TOP_SH : i === LINE ? LINE_SH : i === LINE_HEAVY ? LINE_HEAVY_SH : i)
