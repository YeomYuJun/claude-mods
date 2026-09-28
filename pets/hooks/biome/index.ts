// 맵 세트(순수 모듈): 이름, 별칭, 지형 색, 생성 매개변수, 맵 크기. 세트마다 기본색 몇 개만 적고 나머지 지형 색은 규칙으로 만든다.
// 생성 매개변수(높이 범위·노이즈·장애물 밀도·나무 종류)는 world/gen.ts 가 읽는다.
//
// 세트마다 지표 종류(풀·흙·낙엽·돌·눈) 몇 개와 옆면 재질을 두고, 종류마다 가장 낮은·높은 윗면 색만 적는다.
// 만드는 규칙(채널마다 곱, 종류마다): 윗면 그림자 = 윗면 × 0.9, 모눈선 = 가장 낮은 윗면 × 0.84, 선 그림자 = 선 × 0.9,
// 앞 모서리 하이라이트 = 가장 높은 윗면과 흰색의 가운데, 윗면 색 1~3 은 0 과 4 사이를 채널마다 고르게 나눈다.
// 무늬는 풀·흙·돌이 가장 낮은 윗면 × 0.8, 낙엽은 주황 잎, 눈은 흰 반짝임.
// 세트 공통: 굵은 선 = 첫 종류(산악은 돌)의 가장 낮은 윗면 × 0.70, 흙 = 첫 재질 왼쪽 옆면 × 0.72.
// 재질마다: 오른쪽 옆면 = 왼쪽 옆면 × 0.84, 단 줄 = 그 옆면 × 0.92.
// 가장자리와 테는 어느 터미널 배경(검정·짙은 회색·흰색)에서도 대비 3 이상이 나오게 상대 휘도 약 0.20 으로 맞춘 색이다.

import { Palette } from '../pixel'
import { PROP_COLORS } from '../prop/art.js'
import World, { type Gen } from '../world'

export type BiomeId = 'paper' | 'meadow' | 'mountain' | 'forest' | 'lake'

// size: 한 변 칸 수(없으면 시드로 20~32). 모눈종이 밖의 세트는 경계 없는 월드가 생기기 전까지 64 × 64 섬이다
export type Biome = { id: BiomeId; label: string; aliases: readonly string[]; colors: Palette.SetColors; gen: Gen.GenParams; size?: number }

const WIDE = 64

// 지형 1~6 단(0 은 호수 바닥 몫으로 남긴다). 격자 간격·워핑·높이 대비와 장애물 밀도·종류 비율이 세트마다 다르다.
// 바탕은 풀, 블록은 돌. surface 는 지표 종류 규칙(돌·눈 높이, 얼룩)과 걷는 꾸밈 확률
type Surface = Pick<Gen.GenParams, 'rockLine' | 'snow' | 'patch' | 'flowerP' | 'tuftP' | 'mushroomP'>
const gen = (spacing: readonly number[], amp: readonly number[], warp: number, warpSpacing: number, gain: number, bias: number, obsP: number, treeW: number, rockW: number, blockW: number, tree: number, surface: Surface): Gen.GenParams =>
  ({ spacing, amp, warp, warpSpacing, gain, bias, hmin: 1, hmax: 6, obsP, treeW, rockW, blockW, tree, ground: World.Gen.KIND_GRASS, blockKind: World.Gen.KIND_STONE, ...surface })

// 지표 종류 하나: 맵 번호, 가장 낮은·높은 윗면 색, 옆면 재질 순번(0 흙, 1 돌, 2 눈)
type KindBase = { id: number; lo: number; hi: number; material: number }
// heavy: 굵은 모눈선을 만들 종류 순번(없으면 첫 종류). 화면 대부분을 덮는 종류로 둔다
type Base = { kinds: readonly KindBase[]; heavy?: number; side: number; edge: number; dust: number }

const K = World.Gen
// 돌·눈 옆면(왼쪽 면 색). 돌은 세로 줄을 긋는다
const STONE_SIDE = 0x8a867e
const SNOW_SIDE = 0xc4ccd4
const stone = (): KindBase => ({ id: K.KIND_STONE, lo: 0x9a968e, hi: 0xbab6ae, material: 1 })

// 높이마다 윗면 5 색 중 하나. 지형 1~6 단에 맞춰 가장 흔한 2·3·4 단은 서로 다른 색, 4·5 단은 같은 색, 6 단 이상(봉우리·높은 블록)은 가장 밝은 색.
// 0 은 호수 바닥 몫이라 1 단과 같은 색
const SIX_BAND: readonly number[] = [0, 0, 1, 2, 3, 3, 4, 4, 4]

function mix(a: number, b: number, t: number): number {
  const c = (shift: number) => Math.round(((a >> shift) & 255) * (1 - t) + ((b >> shift) & 255) * t)
  return (c(16) << 16) | (c(8) << 8) | c(0)
}

function accentOf(k: KindBase): number {
  if (k.id === K.KIND_SNOW) return 0xffffff
  if (k.id === K.KIND_LITTER) return 0xc0703a
  return Palette.scale(k.lo, 0.8)
}

function kindColorsOf(k: KindBase): Palette.KindColors {
  const top = [0, 1, 2, 3, 4].map(i => mix(k.lo, k.hi, i / 4)) as unknown as readonly [number, number, number, number, number]
  const line = Palette.scale(k.lo, 0.84)
  return { id: k.id, material: k.material, top, topSh: [Palette.scale(top[0], 0.9), Palette.scale(top[1], 0.9)], hilite: mix(top[4], 0xffffff, 0.5), line, lineSh: Palette.scale(line, 0.9), accent: accentOf(k) }
}

function materialOf(side: number, brick = false): Palette.MaterialColors {
  const sideR = Palette.scale(side, 0.84)
  return { sideL: side, sideR, lStep: Palette.scale(side, 0.92), rStep: Palette.scale(sideR, 0.92), brick }
}

function colorsOf(base: Base, props: Palette.SetColors['props']): Palette.SetColors {
  const lineHeavy = Palette.scale(base.kinds[base.heavy ?? 0]!.lo, 0.7)
  return {
    kinds: base.kinds.map(kindColorsOf),
    topBand: SIX_BAND,
    lineHeavy,
    lineHeavySh: Palette.scale(lineHeavy, 0.9),
    edge: base.edge,
    rim: base.edge,
    materials: [materialOf(base.side), materialOf(STONE_SIDE, true), materialOf(SNOW_SIDE)],
    props,
    dust: base.dust,
    dirt: Palette.scale(base.side, 0.72),
    splash: Palette.UNSET,
  }
}

// 순서가 목록·자동 선택의 순서다. 모눈종이는 팔레트의 모눈종이 색에 모눈종이 나무 색을 더한다
export const BIOMES: readonly Biome[] = [
  { id: 'paper', label: '모눈종이', aliases: ['모눈종이', '종이'], colors: { ...Palette.PAPER, props: PROP_COLORS.paper }, gen: World.PAPER_GEN },
  {
    id: 'meadow', label: '초원', aliases: ['초원'], size: WIDE,
    colors: colorsOf({ kinds: [{ id: K.KIND_GRASS, lo: 0x7fb35a, hi: 0xa6cf78, material: 0 }, { id: K.KIND_DIRT, lo: 0xa88a5c, hi: 0xc4aa7c, material: 0 }, stone()], side: 0x8a6a48, edge: 0x937657, dust: 0xc8b48c }, PROP_COLORS.meadow),
    gen: gen([28, 11, 5], [1, 0.45, 0.18], 6, 23, 1, -0.05, 0.22, 3, 1, 1, World.Gen.PROP_BROADLEAF, { patch: { kind: K.KIND_DIRT, wet: 0.4, p: 0.55 }, flowerP: 0.06, tuftP: 0.09 }),
  },
  // 낮은 곳은 풀, 3 단 이상은 돌, 5 단 이상의 추운 곳은 눈
  {
    id: 'mountain', label: '산악', aliases: ['산악', '산'], size: WIDE,
    colors: colorsOf({ kinds: [{ id: K.KIND_GRASS, lo: 0x8fae6a, hi: 0xa9bf84, material: 0 }, stone(), { id: K.KIND_SNOW, lo: 0xdde3e8, hi: 0xf4f7f9, material: 2 }], heavy: 1, side: 0x7b766f, edge: 0x807b74, dust: 0xb8b2a8 }, PROP_COLORS.mountain),
    gen: gen([36, 13, 6], [1, 0.5, 0.2], 9, 29, 1.35, 0.05, 0.28, 2, 2, 1, World.Gen.PROP_PINE, { rockLine: 3, snow: { line: 0.18, min: 5 }, flowerP: 0.03, tuftP: 0.045 }),
  },
  {
    id: 'forest', label: '숲', aliases: ['숲'], size: WIDE,
    colors: colorsOf({ kinds: [{ id: K.KIND_GRASS, lo: 0x5f9448, hi: 0x7bac5c, material: 0 }, { id: K.KIND_LITTER, lo: 0xa0804c, hi: 0xbc9c68, material: 0 }, stone()], side: 0x6b4f35, edge: 0x8e7864, dust: 0xa08a60 }, PROP_COLORS.forest),
    gen: gen([30, 12, 5], [1, 0.45, 0.18], 6, 23, 1, 0, 0.46, 6, 1, 0.3, World.Gen.PROP_OAK, { patch: { kind: K.KIND_LITTER, wet: 0.55, p: 0.45 }, tuftP: 0.03, mushroomP: 0.02 }),
  },
  {
    id: 'lake', label: '호숫가', aliases: ['호숫가', '물가', '호수'], size: WIDE,
    colors: colorsOf({ kinds: [{ id: K.KIND_GRASS, lo: 0x86b865, hi: 0xa4cf80, material: 0 }, stone()], side: 0x7a5c3e, edge: 0x90775e, dust: 0xd0c090 }, PROP_COLORS.lake),
    gen: gen([30, 12, 5], [1, 0.4, 0.15], 7, 25, 0.9, -0.1, 0.18, 2, 1, 0.5, World.Gen.PROP_WILLOW, { flowerP: 0.04, tuftP: 0.06 }),
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
    t = Palette.themeOf(byId(id).colors, [bank])
    forBank.set(id, t)
  }
  return t
}

export * as default from '.'
