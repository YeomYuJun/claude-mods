// 맵 세트(순수 모듈): 이름, 별칭, 지형 색. 세트마다 기본색 몇 개만 적고 나머지 지형 색은 규칙으로 만든다.
// 지금은 색만 세트마다 다르다. 맵 모양(높이·블록)은 모든 세트가 같은 생성기를 쓴다.
//
// 만드는 규칙(채널마다 곱): 윗면 그림자 = 윗면 × 0.9, 모눈선 = 가장 낮은 윗면 × 0.84, 굵은 선 = 가장 낮은 윗면 × 0.70,
// 선 그림자 = 선 × 0.9, 오른쪽 옆면 = 왼쪽 옆면 × 0.84, 단 줄 = 그 옆면 × 0.92, 흙 = 왼쪽 옆면 × 0.72,
// 앞 모서리 하이라이트 = 가장 높은 윗면과 흰색의 가운데. 윗면 높이 1~3 은 0 과 4 사이를 채널마다 고르게 나눈다.
// 가장자리와 테는 어느 터미널 배경(검정·짙은 회색·흰색)에서도 대비 3 이상이 나오게 상대 휘도 약 0.20 으로 맞춘 색이다.

import { Palette } from '../pixel'

export type BiomeId = 'paper' | 'meadow' | 'mountain' | 'forest' | 'lake'

export type Biome = { id: BiomeId; label: string; aliases: readonly string[]; colors: Palette.SetColors }

type Base = { top: readonly number[]; side: number; edge: number; dust: number }

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
  { id: 'paper', label: '모눈종이', aliases: ['모눈종이', '종이'], colors: Palette.PAPER },
  { id: 'meadow', label: '초원', aliases: ['초원'], colors: colorsOf({ top: [0x7fb35a, 0xa6cf78], side: 0x8a6a48, edge: 0x937657, dust: 0xc8b48c }) },
  // 풀·바위·눈이 높이로 바뀌지만 지표 종류가 하나라, 높을수록 밝아지게 가운데 바위 색을 조금 밝혔다
  { id: 'mountain', label: '산악', aliases: ['산악', '산'], colors: colorsOf({ top: [0x8fae6a, 0x9aa77a, 0xa6a298, 0xb0aca6, 0xeef2f5], side: 0x7b766f, edge: 0x807b74, dust: 0xb8b2a8 }) },
  { id: 'forest', label: '숲', aliases: ['숲'], colors: colorsOf({ top: [0x5f9448, 0x7bac5c], side: 0x6b4f35, edge: 0x8e7864, dust: 0xa08a60 }) },
  { id: 'lake', label: '호숫가', aliases: ['호숫가', '물가', '호수'], colors: colorsOf({ top: [0x86b865, 0xa4cf80], side: 0x7a5c3e, edge: 0x90775e, dust: 0xd0c090 }) },
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
