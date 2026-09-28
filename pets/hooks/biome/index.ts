// 맵 세트(순수 모듈): 이름, 별칭, 지형 색, 생성 매개변수, 맵 크기. 세트마다 기본색 몇 개만 적고 나머지 지형 색은 규칙으로 만든다.
// 생성 매개변수(높이 범위·노이즈·장애물 밀도·나무 종류)는 world/gen.ts 가 읽는다.
//
// 만드는 규칙(채널마다 곱): 윗면 그림자 = 윗면 × 0.9, 모눈선 = 가장 낮은 윗면 × 0.84, 굵은 선 = 가장 낮은 윗면 × 0.70,
// 선 그림자 = 선 × 0.9, 오른쪽 옆면 = 왼쪽 옆면 × 0.84, 단 줄 = 그 옆면 × 0.92, 흙 = 왼쪽 옆면 × 0.72,
// 앞 모서리 하이라이트 = 가장 높은 윗면과 흰색의 가운데. 윗면 색 1~3 은 0 과 4 사이를 채널마다 고르게 나눈다.
// 가장자리와 테는 어느 터미널 배경(검정·짙은 회색·흰색)에서도 대비 3 이상이 나오게 상대 휘도 약 0.20 으로 맞춘 색이다.

import { Palette } from '../pixel'
import World, { type Gen } from '../world'

export type BiomeId = 'paper' | 'meadow' | 'mountain' | 'forest' | 'lake'

// size: 한 변 칸 수(없으면 시드로 20~32). 모눈종이 밖의 세트는 경계 없는 월드가 생기기 전까지 64 × 64 섬이다
export type Biome = { id: BiomeId; label: string; aliases: readonly string[]; colors: Palette.SetColors; gen: Gen.GenParams; size?: number }

const WIDE = 64

// 지형 1~6 단(0 은 호수 바닥 몫으로 남긴다). 격자 간격·워핑·높이 대비와 장애물 밀도·종류 비율이 세트마다 다르다
const gen = (spacing: readonly number[], amp: readonly number[], warp: number, warpSpacing: number, gain: number, bias: number, obsP: number, treeW: number, rockW: number, blockW: number, tree: number): Gen.GenParams =>
  ({ spacing, amp, warp, warpSpacing, gain, bias, hmin: 1, hmax: 6, obsP, treeW, rockW, blockW, tree })

type Base = { top: readonly number[]; side: number; edge: number; dust: number }

// 높이마다 윗면 5 색 중 하나. 지형 1~6 단에 맞춰 가장 흔한 2·3·4 단은 서로 다른 색, 4·5 단은 같은 색, 6 단 이상(봉우리·높은 블록)은 가장 밝은 색.
// 0 은 호수 바닥 몫이라 1 단과 같은 색
const SIX_BAND: readonly number[] = [0, 0, 1, 2, 3, 3, 4, 4, 4]

function mix(a: number, b: number, t: number): number {
  const c = (shift: number) => Math.round(((a >> shift) & 255) * (1 - t) + ((b >> shift) & 255) * t)
  return (c(16) << 16) | (c(8) << 8) | c(0)
}

function colorsOf(base: Base): Palette.SetColors {
  const [lo, hi] = [base.top[0]!, base.top[base.top.length - 1]!]
  const top = (base.top.length === 5 ? base.top : [0, 1, 2, 3, 4].map(i => mix(lo, hi, i / 4))) as unknown as readonly [number, number, number, number, number]
  const line = Palette.scale(lo, 0.84)
  const lineHeavy = Palette.scale(lo, 0.7)
  const sideR = Palette.scale(base.side, 0.84)
  return {
    kinds: [{ top, topSh: [Palette.scale(top[0], 0.9), Palette.scale(top[1], 0.9)], hilite: mix(top[4], 0xffffff, 0.5), line, lineSh: Palette.scale(line, 0.9), accent: Palette.UNSET }],
    topBand: SIX_BAND,
    lineHeavy,
    lineHeavySh: Palette.scale(lineHeavy, 0.9),
    edge: base.edge,
    rim: base.edge,
    materials: [{ sideL: base.side, sideR, lStep: Palette.scale(base.side, 0.92), rStep: Palette.scale(sideR, 0.92) }],
    dust: base.dust,
    dirt: Palette.scale(base.side, 0.72),
    splash: Palette.UNSET,
  }
}

// 순서가 목록·자동 선택의 순서다. 모눈종이는 지금 화면 그대로의 색이다
export const BIOMES: readonly Biome[] = [
  { id: 'paper', label: '모눈종이', aliases: ['모눈종이', '종이'], colors: Palette.PAPER, gen: World.PAPER_GEN },
  {
    id: 'meadow', label: '초원', aliases: ['초원'], size: WIDE,
    colors: colorsOf({ top: [0x7fb35a, 0xa6cf78], side: 0x8a6a48, edge: 0x937657, dust: 0xc8b48c }),
    gen: gen([28, 11, 5], [1, 0.45, 0.18], 6, 23, 1, -0.05, 0.22, 3, 1, 1, World.Gen.PROP_BROADLEAF),
  },
  // 풀·바위·눈이 높이로 바뀌지만 지표 종류가 하나라, 높을수록 밝아지게 가운데 바위 색을 조금 밝혔다
  {
    id: 'mountain', label: '산악', aliases: ['산악', '산'], size: WIDE,
    colors: colorsOf({ top: [0x8fae6a, 0x9aa77a, 0xa6a298, 0xb0aca6, 0xeef2f5], side: 0x7b766f, edge: 0x807b74, dust: 0xb8b2a8 }),
    gen: gen([36, 13, 6], [1, 0.5, 0.2], 9, 29, 1.35, 0.05, 0.28, 2, 2, 1, World.Gen.PROP_PINE),
  },
  {
    id: 'forest', label: '숲', aliases: ['숲'], size: WIDE,
    colors: colorsOf({ top: [0x5f9448, 0x7bac5c], side: 0x6b4f35, edge: 0x8e7864, dust: 0xa08a60 }),
    gen: gen([30, 12, 5], [1, 0.45, 0.18], 6, 23, 1, 0, 0.46, 6, 1, 0.3, World.Gen.PROP_OAK),
  },
  {
    id: 'lake', label: '호숫가', aliases: ['호숫가', '물가', '호수'], size: WIDE,
    colors: colorsOf({ top: [0x86b865, 0xa4cf80], side: 0x7a5c3e, edge: 0x90775e, dust: 0xd0c090 }),
    gen: gen([30, 12, 5], [1, 0.4, 0.15], 7, 25, 0.9, -0.1, 0.18, 2, 1, 0.5, World.Gen.PROP_WILLOW),
  },
]

export const DEFAULT: BiomeId = 'paper'

export function byId(id: BiomeId): Biome {
  return BIOMES.find(b => b.id === id)!
}

// 명령 인자(id 나 한국어 별칭, 소문자로 받는다)로 세트를 찾는다
export function find(word: string): Biome | undefined {
  return BIOMES.find(b => b.id === word || b.aliases.includes(word))
}

export function isId(value: unknown): value is BiomeId {
  return BIOMES.some(b => b.id === value)
}

// 자동: 세션 시드로 모눈종이를 뺀 세트 중 하나. 같은 세션이면 같은 세트다
export function autoOf(seed: number): BiomeId {
  const choices = BIOMES.filter(b => b.id !== DEFAULT)
  return choices[((seed ^ 0xb10e) >>> 0) % choices.length]!.id
}

const themes = new Map<Palette.BankColors, Map<BiomeId, Palette.Theme>>()

// 세트 색과 동물 뱅크 0 의 품종 색으로 만든 색 표. 세트·품종 조합마다 한 번만 만든다
export function themeOf(id: BiomeId, bank: Palette.BankColors = Palette.WHITE_DOG): Palette.Theme {
  let forBank = themes.get(bank)
  if (!forBank) { forBank = new Map(); themes.set(bank, forBank) }
  let t = forBank.get(id)
  if (!t) {
    t = id === DEFAULT && bank === Palette.WHITE_DOG ? Palette.PAPER_THEME : Palette.themeOf(byId(id).colors, [bank])
    forBank.set(id, t)
  }
  return t
}

export * as default from '.'
