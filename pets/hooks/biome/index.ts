// 맵 세트(순수 모듈): 이름, 별칭, 지형 색, 생성 매개변수, 맵 모양(경계 있는 섬 또는 경계 없는 월드). 세트마다 기본색 몇 개만 적고 나머지 지형 색은 규칙으로 만든다.
// 생성 매개변수(높이 범위·노이즈·장애물 밀도·나무 종류·호수)는 world/gen.ts 가 읽는다.
//
// 세트마다 지표 종류(풀·흙·낙엽·돌·눈, 호수 둘레 모래) 몇 개와 옆면 재질을 두고, 종류마다 가장 낮은·높은 윗면 색만 적는다.
// 물 색(얕음·깊음·반짝임·거품)은 세트가 적고, 수면 그림자는 팔레트가 얕음·깊음 × 0.8 로 만든다. 물보라는 반짝임 색이다.
// 만드는 규칙(채널마다 곱, 종류마다): 윗면 그림자 = 윗면 × 0.9, 모눈선 = 가장 낮은 윗면 × 0.84, 선 그림자 = 선 × 0.9,
// 앞 모서리 하이라이트 = 가장 높은 윗면과 흰색의 가운데, 윗면 색 1~3 은 0 과 4 사이를 채널마다 고르게 나눈다.
// 무늬는 풀·흙·돌이 가장 낮은 윗면 × 0.8, 낙엽은 주황 잎, 눈은 흰 반짝임.
// 세트 공통: 굵은 선 = 첫 종류(산악은 돌)의 가장 낮은 윗면 × 0.70, 흙 = 첫 재질 왼쪽 옆면 × 0.72.
// 재질마다: 오른쪽 옆면 = 왼쪽 옆면 × 0.84, 단 줄 = 그 옆면 × 0.92.
// 가장자리와 테는 어느 터미널 배경(검정·짙은 회색·흰색)에서도 대비 3 이상이 나오게 상대 휘도 약 0.20 으로 맞춘 색이다.

import { Palette } from '../pixel'
import { PROP_COLORS } from '../prop/art.js'
import World, { type Gen, type World as WorldState } from '../world'

export type BiomeId = 'paper' | 'meadow' | 'mountain' | 'forest' | 'lake' | 'beach' | 'snow' | 'desert'

// open: 경계 없는 월드(모눈종이 밖의 세트). 아니면 경계 있는 섬이고 size 는 한 변 칸 수(없으면 시드로 20~32)
export type Biome = { id: BiomeId; label: string; aliases: readonly string[]; colors: Palette.SetColors; gen: Gen.GenParams; size?: number; open?: boolean }

// 지형 1~6 단(0 은 호수 바닥). 격자 간격·워핑·높이 대비와 장애물 밀도·종류 비율이 세트마다 다르다.
// 바탕은 풀, 블록은 돌, 호수 둘레는 모래(surface 가 바탕·물가 종류·높이 상한을 바꿀 수 있다).
// surface 는 지표 종류 규칙(돌·눈 높이, 얼룩), 걷는 꾸밈 확률, 호수(셀당 확률·반지름)
type Surface = Partial<Pick<Gen.GenParams, 'ground' | 'shore' | 'hmax'>> & Pick<Gen.GenParams, 'rockLine' | 'snow' | 'patch' | 'flowerP' | 'tuftP' | 'mushroomP' | 'lake' | 'reedP' | 'lilyP' | 'branchP' | 'shellP' | 'dryBushP'>
const gen = (spacing: readonly number[], amp: readonly number[], warp: number, warpSpacing: number, gain: number, bias: number, obsP: number, treeW: number, rockW: number, blockW: number, tree: number, surface: Surface): Gen.GenParams =>
  ({ spacing, amp, warp, warpSpacing, gain, bias, hmin: 1, hmax: 6, obsP, treeW, rockW, blockW, tree, ground: World.Gen.KIND_GRASS, blockKind: World.Gen.KIND_STONE, shore: World.Gen.KIND_SAND, ...surface })

// 지표 종류 하나: 맵 번호, 가장 낮은·높은 윗면 색, 옆면 재질 순번(0 세트 옆면, 1 돌, 2 눈)
type KindBase = { id: number; lo: number; hi: number; material: number }
// heavy: 굵은 모눈선을 만들 종류 순번(없으면 첫 종류). 화면 대부분을 덮는 종류로 둔다
// water: 호수 수면 색(얕음·깊음·반짝임·거품), sand: 호수 테 모래의 가장 낮은·높은 윗면 색(물가 종류가 kinds 에 있으면 없다). 물보라는 반짝임 색
// stoneSide: 돌 재질 옆면(없으면 회색)
type Base = { kinds: readonly KindBase[]; heavy?: number; side: number; stoneSide?: number; edge: number; dust: number; water: Palette.WaterColors; sand?: readonly [number, number] }

const K = World.Gen
// 돌·눈 옆면(왼쪽 면 색). 돌은 세로 줄을 긋는다
const STONE_SIDE = 0x8a867e
const SNOW_SIDE = 0xc4ccd4
const stone = (): KindBase => ({ id: K.KIND_STONE, lo: 0x9a968e, hi: 0xbab6ae, material: 1 })

// 높이마다 윗면 5 색 중 하나. 지형 1~6 단에 맞춰 가장 흔한 2·3·4 단은 서로 다른 색, 4·5 단은 같은 색, 6 단 이상(봉우리·높은 블록)은 가장 밝은 색.
// 0 은 호수 바닥이라(물 칸은 수면만 그린다) 1 단과 같은 색
const SIX_BAND: readonly number[] = [0, 0, 1, 2, 3, 3, 4, 4, 4]

function mix(a: number, b: number, t: number): number {
  const c = (shift: number) => Math.round(((a >> shift) & 255) * (1 - t) + ((b >> shift) & 255) * t)
  return (c(16) << 16) | (c(8) << 8) | c(0)
}

function accentOf(k: KindBase): number {
  if (k.id === K.KIND_SNOW || k.id === K.KIND_ICE) return 0xffffff
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
  const sand: KindBase[] = base.sand ? [{ id: K.KIND_SAND, lo: base.sand[0], hi: base.sand[1], material: 0 }] : []
  return {
    kinds: [...base.kinds, ...sand].map(kindColorsOf),
    topBand: SIX_BAND,
    lineHeavy,
    lineHeavySh: Palette.scale(lineHeavy, 0.9),
    edge: base.edge,
    rim: base.edge,
    materials: [materialOf(base.side), materialOf(base.stoneSide ?? STONE_SIDE, true), materialOf(SNOW_SIDE)],
    props,
    water: base.water,
    dust: base.dust,
    dirt: Palette.scale(base.side, 0.72),
    splash: base.water.shimmer,
  }
}

// 순서가 목록·자동 선택의 순서다. 모눈종이는 팔레트의 모눈종이 색에 모눈종이 나무 색을 더한다
export const BIOMES: readonly Biome[] = [
  { id: 'paper', label: '모눈종이', aliases: ['모눈종이', '종이'], colors: { ...Palette.PAPER, props: PROP_COLORS.paper }, gen: World.PAPER_GEN },
  {
    id: 'meadow', label: '초원', aliases: ['초원'], open: true,
    colors: colorsOf({ kinds: [{ id: K.KIND_GRASS, lo: 0x7fb35a, hi: 0xa6cf78, material: 0 }, { id: K.KIND_DIRT, lo: 0xa88a5c, hi: 0xc4aa7c, material: 0 }, stone()], side: 0x8a6a48, edge: 0x937657, dust: 0xc8b48c, water: { shallow: 0x3f7fb8, deep: 0x2c6096, shimmer: 0xcfeaff, foam: 0x9cc2e2 }, sand: [0xd8c890, 0xebdfb2] }, PROP_COLORS.meadow),
    gen: gen([28, 11, 5], [1, 0.45, 0.18], 6, 23, 1, -0.05, 0.22, 3, 1, 1, World.Gen.PROP_BROADLEAF, { patch: { kind: K.KIND_DIRT, wet: 0.4, p: 0.55 }, flowerP: 0.06, tuftP: 0.09, branchP: 0.004, lake: { p: 0.35, r: [3, 6] } }),
  },
  // 낮은 곳은 풀, 3 단 이상은 돌, 5 단 이상의 추운 곳은 눈
  {
    id: 'mountain', label: '산악', aliases: ['산악', '산'], open: true,
    colors: colorsOf({ kinds: [{ id: K.KIND_GRASS, lo: 0x8fae6a, hi: 0xa9bf84, material: 0 }, stone(), { id: K.KIND_SNOW, lo: 0xdde3e8, hi: 0xf4f7f9, material: 2 }], heavy: 1, side: 0x7b766f, edge: 0x807b74, dust: 0xb8b2a8, water: { shallow: 0x4f82a6, deep: 0x3f6c8c, shimmer: 0xd8ecf6, foam: 0xa4c0d4 }, sand: [0xcfc6a6, 0xe2dcc4] }, PROP_COLORS.mountain),
    gen: gen([36, 13, 6], [1, 0.5, 0.2], 9, 29, 1.35, 0.05, 0.28, 2, 2, 1, World.Gen.PROP_PINE, { rockLine: 3, snow: { line: 0.18, min: 5 }, flowerP: 0.03, tuftP: 0.045, branchP: 0.003, lake: { p: 0.2, r: [3, 5] } }),
  },
  {
    id: 'forest', label: '숲', aliases: ['숲'], open: true,
    colors: colorsOf({ kinds: [{ id: K.KIND_GRASS, lo: 0x5f9448, hi: 0x7bac5c, material: 0 }, { id: K.KIND_LITTER, lo: 0xa0804c, hi: 0xbc9c68, material: 0 }, stone()], side: 0x6b4f35, edge: 0x8e7864, dust: 0xa08a60, water: { shallow: 0x3f6f94, deep: 0x305a7c, shimmer: 0xc8e0f0, foam: 0x92b0c8 }, sand: [0xccb482, 0xdfcca0] }, PROP_COLORS.forest),
    gen: gen([30, 12, 5], [1, 0.45, 0.18], 6, 23, 1, 0, 0.46, 6, 1, 0.3, World.Gen.PROP_OAK, { patch: { kind: K.KIND_LITTER, wet: 0.55, p: 0.45 }, tuftP: 0.03, mushroomP: 0.02, branchP: 0.008, lake: { p: 0.25, r: [3, 5] } }),
  },
  {
    id: 'lake', label: '호숫가', aliases: ['호숫가', '물가', '호수'], open: true,
    colors: colorsOf({ kinds: [{ id: K.KIND_GRASS, lo: 0x86b865, hi: 0xa4cf80, material: 0 }, stone()], side: 0x7a5c3e, edge: 0x90775e, dust: 0xd0c090, water: { shallow: 0x3f86c6, deep: 0x2c6aa4, shimmer: 0xcfeaff, foam: 0xa0c8e8 }, sand: [0xdccb94, 0xece0b4] }, PROP_COLORS.lake),
    gen: gen([30, 12, 5], [1, 0.4, 0.15], 7, 25, 0.9, -0.1, 0.18, 2, 1, 0.5, World.Gen.PROP_WILLOW, { flowerP: 0.04, tuftP: 0.06, branchP: 0.004, lake: { p: 0.8, r: [4, 8] }, reedP: 0.35, lilyP: 0.12 }),
  },
  // 바탕이 모래이고 높이가 낮다. 큰 호수(바다 대신, 끝이 있어 헤엄 못 하는 동물도 돌아간다)의 테는 젖은 모래. 블록이 없어 돌 종류를 두지 않는다.
  // 밝은 바탕에서 만든 굵은 선은 그림자가 다른 선보다 밝아지므로 굵은 선은 젖은 모래(설원·사막은 돌)에서 만든다
  {
    id: 'beach', label: '해변', aliases: ['해변', '바다', '모래사장'], open: true,
    colors: colorsOf({ kinds: [{ id: K.KIND_SAND, lo: 0xeadba8, hi: 0xf5ecc8, material: 0 }, { id: K.KIND_WET_SAND, lo: 0xcdb88a, hi: 0xdcc9a0, material: 0 }], heavy: 1, side: 0xcdb57c, edge: 0x8a7a54, dust: 0xe8dcb4, water: { shallow: 0x3a9ccc, deep: 0x2c7eae, shimmer: 0xf4fbff, foam: 0xa8dcf0 } }, PROP_COLORS.beach),
    gen: gen([34, 13, 6], [1, 0.4, 0.15], 6, 25, 0.8, -0.1, 0.12, 3, 1, 0, World.Gen.PROP_PALM, { ground: K.KIND_SAND, shore: K.KIND_WET_SAND, hmax: 5, lake: { p: 0.9, r: [7, 11] }, reedP: 0.08, shellP: 0.03, branchP: 0.004 }),
  },
  // 바탕이 눈이고 얼음 얼룩이 걷는 지표로 깔린다. 작은 호수(열린 물)의 테도 얼음
  {
    id: 'snow', label: '설원', aliases: ['설원', '눈', '눈밭'], open: true,
    colors: colorsOf({ kinds: [{ id: K.KIND_SNOW, lo: 0xe2e9ef, hi: 0xf7fafc, material: 0 }, { id: K.KIND_ICE, lo: 0xbfe0f0, hi: 0xd6ecf6, material: 0 }, stone()], heavy: 2, side: 0x9fb3c4, edge: 0x6f7d89, dust: 0xf4f8fb, water: { shallow: 0x5b90b8, deep: 0x467aa0, shimmer: 0xffffff, foam: 0xd8ecf6 } }, PROP_COLORS.snow),
    gen: gen([32, 12, 5], [1, 0.45, 0.18], 7, 25, 1.1, 0, 0.26, 4, 2, 1, World.Gen.PROP_SNOW_PINE, { ground: K.KIND_SNOW, shore: K.KIND_ICE, patch: { kind: K.KIND_ICE, wet: 0.45, p: 0.55 }, lake: { p: 0.15, r: [3, 5] }, branchP: 0.004 }),
  },
  // 바탕이 모래, 5 단 이상은 붉은 바위. 드문 작은 호수(오아시스)의 테는 풀이고 풀포기·갈대가 난다
  {
    id: 'desert', label: '사막', aliases: ['사막'], open: true,
    colors: colorsOf({ kinds: [{ id: K.KIND_SAND, lo: 0xe3c07e, hi: 0xefd89c, material: 0 }, { id: K.KIND_STONE, lo: 0xb07850, hi: 0xc89468, material: 1 }, { id: K.KIND_GRASS, lo: 0x7fa84a, hi: 0x9cc466, material: 0 }], heavy: 1, side: 0xc49a5a, stoneSide: 0x9a6a48, edge: 0x967645, dust: 0xe0c89a, water: { shallow: 0x2c7a94, deep: 0x236478, shimmer: 0xd8f4f8, foam: 0xa8dce4 } }, PROP_COLORS.desert),
    gen: gen([36, 13, 6], [1, 0.5, 0.2], 8, 27, 1, -0.05, 0.14, 3, 3, 1, World.Gen.PROP_CACTUS, { ground: K.KIND_SAND, shore: K.KIND_GRASS, rockLine: 5, lake: { p: 0.12, r: [3, 4] }, reedP: 0.3, tuftP: 0.3, flowerP: 0.05, dryBushP: 0.02, branchP: 0.004 }),
  },
]

export const DEFAULT: BiomeId = 'paper'

export function byId(id: BiomeId): Biome {
  return BIOMES.find(b => b.id === id)!
}

// 세트의 맵(나무·바위를 둔다). 경계 없는 월드는 시작 칸의 청크만 만든다
export function worldOf(id: BiomeId, seed: number): WorldState {
  const b = byId(id)
  return World.create(seed, b.gen, { size: b.size, open: b.open, props: true })
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
