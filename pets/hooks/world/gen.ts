// 좌표 해시 생성기(순수 모듈). 모든 값은 (시드, x, y) 의 함수라, 영역을 잘라 따로 만들어도 한 번에 만든 것과 바이트가 같다.
//
// 1. 높이 노이즈: 도메인 워핑 + value noise 여러 겹을 hmin~hmax 단으로 나눈다(세트가 levels 를 주면 baseMin 부터 levels 단).
//    세트에 따라 그 위에 지형 스탬프(언덕·봉우리·메사·능선, 셀마다 하나)와 능선 노이즈 띠 중 큰 값, 잔기복 한 겹을 더하고 호수 분지를 뺀다.
//    스탬프·분지는 제 셀 안에 들어 칸이 든 셀 하나만 본다. 결과는 hmin~hmax 로 자른다
// 2. 포락선: h(p) = min_q(h0(q) + 맨해튼 거리). 이웃 칸끼리 높이 차 ≤ 1 이 된다.
//    높이가 [바닥, hmax] 안이면(바닥은 hmin, 호수가 있으면 깊은 물 바닥 floorOf) 거리가 hmax − 바닥 이상인 칸은 최솟값이 될 수 없어,
//    영역 둘레에 여유 hmax − 바닥 − 1 칸만 붙여 계산해도 결과가 전역 계산과 같다
// 3. 장애물 후보: cell 칸 격자 셀마다 후보 하나(위치·종류·발자국·우선순위가 셀 해시. 있을 확률은 세트에 따라 셀 위치의 노이즈·호수 분지 안인지로 바뀐다).
//    우선순위가 더 높은 이웃 "후보"와 겹치거나 8-인접하면 버린다. 채택된 점이 아니라 후보와 비교하므로
//    결과가 반경 2 셀 안의 해시만으로 정해진다. 장애물 덩어리가 서로 8-인접하지 않고 구멍이 없어 걷는 칸이 끊기지 않는다
// 4. 블록 높이 = 발자국 높이 + 1 또는 + 2(발자국 높이가 모두 같을 때만 놓는다)
// 5. 지표 종류: 순서대로 첫 참. 호수(물), 호수 테(물가 종류), 블록, 눈(온도 노이즈 - 0.06 × 높이 < 눈 문턱, 높이 하한 이상),
//    돌(높이 문턱 이상), 얼룩(습도 노이즈 < 문턱 이고 잔무늬 노이즈 > 문턱, 높이 상한 이하), 나머지는 바탕 종류. 테 폭은 세트마다(기본 1 칸)
// 6. 걷는 꾸밈(꽃·풀포기·버섯·갈대·연잎·나뭇가지·조개·마른 덤불): 장애물·블록이 아닌 칸에 칸 해시로 둔다. 장애물이 아니라 걸음을 막지 않는다
// 7. 호수: 호수 종류(작은 못, 큰 호수 등)마다 제 셀 격자(기본 LAKE_CELL 칸)의 셀마다 확률로 하나(세트에 따라 중심의 분지 전 높이가 낮을 때만,
//    번호가 큰 종류의 호수 가까이에는 두지 않는다). 모양·깊이·수면이 셀 좌표와 포락선 전 높이만의 함수라 어느 영역에서 불러도 같다.
//    수면 L = 발자국을 hmax + 1 칸 넓힌 곳의 포락선 전 높이 최솟값, 바닥은 얕음 L - 1, 깊음 L - 2 로 고정하고 포락선을 돌린다.
//    포락선은 한 칸마다 한 단까지만 오르므로 테(발자국과 8 방향으로 닿는 칸)는 L 보다 낮을 수 없다(떠 있는 물이 없다).
//    물과 4 방향으로 닿은 테는 얕은 바닥 바로 옆이라 L 보다 높을 수도 없어 수면과 같은 높이로 평평하고, 대각선으로만 닿은 테는 L + 1 일 수 있다.
//    호수 발자국과 8 방향으로 닿는 장애물 후보는 버린다
// 8. 강: 워핑 좌표의 노이즈 한 겹의 0.5 등고선 둘레 띠. 포락선 전 높이를 hmin − 1 로 박아 수면이 hmin 인 얕은 물이다.
//    다른 땅은 모두 hmin 이상이라 포락선이 강 둘레를 정확히 hmin 으로 깎는다(떠 있는 물·폭포가 없고 물가가 평평하다).
//    호수 수면을 찾는 상자 안에서는 강을 끊어 호수 수면이 바뀌지 않는다. 물가 종류·장애물 둘레·물 꾸밈은 호수와 같이 다룬다
//
// 결정성: 순차 난수를 쓰지 않고, 사칙연산·floor·imul 만 쓴다(삼각·지수 함수는 엔진마다 마지막 비트가 다를 수 있다).

export type GenParams = {
  // value noise 겹마다 격자 간격(칸)과 진폭
  spacing: readonly number[]
  amp: readonly number[]
  // 도메인 워핑 세기(칸)와 간격
  warp: number
  warpSpacing: number
  // 높이 대비와 치우침
  gain: number
  bias: number
  // 지형 높이 범위(블록은 이 위로 +1·+2)
  hmin: number
  hmax: number
  // 장애물 후보 밀도와 종류 가중치
  obsP: number
  treeW: number
  rockW: number
  blockW: number
  // 이 세트의 나무 소품 번호
  tree: number
  // 지표 종류: 바탕, 블록 칸, 이 높이 이상이면 돌, 눈(문턱·높이 하한), 얼룩(종류·습도 문턱·잔무늬 문턱). 없으면 쓰지 않는다
  ground?: number
  blockKind?: number
  rockLine?: number
  snow?: { line: number; min: number }
  patch?: { kind: number; wet: number; p: number; maxH?: number }
  // 걷는 꾸밈 확률(칸당). 꽃·풀포기는 풀 칸에만, 버섯은 풀·낙엽 칸에, 갈대는 땅과 닿은 얕은 물에, 연잎은 땅과 닿지 않은 얕은 물에
  flowerP?: number
  tuftP?: number
  mushroomP?: number
  reedP?: number
  lilyP?: number
  // 나뭇가지(강아지가 물어 옮길 수 있는 꾸밈) 확률(칸당). 풀·낙엽·바탕 종류 칸에, 다른 꾸밈이 없을 때만
  branchP?: number
  // 조개(모래·젖은 모래 칸), 마른 덤불(모래 칸) 확률(칸당)
  shellP?: number
  dryBushP?: number
  // 호수: 격자 셀마다 있을 확률과 반지름 범위(칸), 셀 한 변(없으면 LAKE_CELL). lowOnly 가 있으면 중심의 분지 전 높이가 hmin + lowOnly 이하일 때만 둔다.
  // shore 는 호수 테의 지표 종류, shoreWidth 는 테 폭(발자국과 8 방향 거리, 없으면 1). 없으면 호수가 없다
  lake?: LakeSpec
  // 호수 종류를 더 둔다(큰 호수 등). 종류 번호 k 는 lake 가 0, 이 목록의 i 번째가 i + 1. 종류마다 셀 격자·해시(salt + 1000k)·캐시 키가 따로다.
  // 번호가 큰 종류가 우선: 호수는 번호가 더 큰 종류의 호수(셀 해시와 lowOnly 로 있다고 나온 것)와 발자국 상자끼리 hmax + 5 칸 안이면 두지 않는다.
  // 같은 종류 안의 이웃 셀 호수처럼 서로 hmax + 4 칸 넘게 떨어져 떠 있는 물이 생기지 않는다. lake 가 없으면 쓰지 않는다
  extraLakes?: readonly LakeSpec[]
  shore?: number
  shoreWidth?: number
  // 바탕: 높이 노이즈를 levels 단으로 나눠 baseMin(없으면 hmin)부터 쌓는다. 없으면 hmin~hmax 단 전부를 쓰고 고도가 고르게 쓰이게 편다
  levels?: number
  baseMin?: number
  // 지형 스탬프: 종류마다 cell 칸 격자 셀에 확률 p 로 하나, 크기·높이(단)는 범위 안에서 셀 해시로 고른다. 스탬프끼리 겹치면 큰 값
  forms?: readonly Landform[]
  // 능선 노이즈 띠(사구·마루 선): 워핑 좌표를 45 도 돌려 한 축을 stretch 배 늘린 value noise n 의 r = 1 − |2n − 1| 가 cut 을 넘는 칸에
  // h + ⌊(r − cut) × gain⌋ 단. 스탬프와 겹치면 큰 값
  crest?: { salt: number; spacing: number; stretch: number; cut: number; gain: number; h: number }
  // 잔기복: 워핑 좌표의 value noise 한 겹 × amp 단
  detail?: { spacing: number; amp: number }
  // 호수 분지: 칸이 든 호수 셀에 호수가 있으면 중심에서 Rb = ⌈1.25 r0⌉ + 1 + extra 안을 depth × (1 − d²/Rb²) 단 낮추고, floor 아래로는 내리지 않는다.
  // 분지가 제 셀 안에 들도록 Rb 는 호수 중심의 셀 안쪽 여백 이하여야 한다(extra ≤ ⌊hmax/2⌋ + 1 이면 된다)
  basin?: { extra: number; depth: number; floor?: number }
  // 장애물 후보 확률에 곱하는 값: obsField 는 셀 위치의 노이즈로 lo~hi, obsNear 는 후보 칸이 호수 분지 안이면 hi, 밖이면 lo
  obsField?: { spacing: number; lo: number; hi: number }
  obsNear?: { hi: number; lo: number }
  // 강: 워핑 좌표의 value noise(간격 spacing) n 의 |2n − 1| < width 인 칸이 얕은 물 띠. 바닥은 hmin − 1 이라 수면이 hmin 이고
  // 포락선이 둘레를 hmin 으로 깎는다. 호수 수면을 찾는 상자(발자국을 hmax + 1 칸 넓힌 곳) 안에서는 끊긴다
  river?: { spacing: number; width: number }
}

// 호수 한 종류: 격자 셀마다 있을 확률, 반지름 범위(칸), 셀 한 변(없으면 LAKE_CELL), 중심의 분지 전 높이 조건(hmin + lowOnly 이하일 때만)
export type LakeSpec = { p: number; r: readonly [number, number]; cell?: number; lowOnly?: number }

// dome: 둥근 언덕(가운데 h, 가장자리 0 으로 매끈하게), peak: 뾰족한 봉우리(가운데로 갈수록 가파르게), mesa: 평평한 꼭대기(반지름 안은 모두 h).
// ridge: 길이 r, 마루 높이 h 의 능선. 8 방위 중 하나로 뻗고, 마루를 따라 봉우리(h)와 고개(h − 2)가 번갈아 나며, 옆으로 한 칸에 slope(없으면 1) 단씩 내려간다.
//   shift 는 격자를 대각선으로 미는 칸 수(능선 두 벌의 셀 경계를 엇갈리게 둔다).
// 포락선이 이웃 칸 높이 차를 1 로 깎으므로 봉우리·메사의 옆은 한 칸에 한 단씩 내려가는 계단이 된다
export type Landform = { shape: 'dome' | 'peak' | 'mesa' | 'ridge'; cell: number; p: number; r: readonly [number, number]; h: readonly [number, number]; slope?: number; shift?: number }

// 소품 번호(prop 배열 값). 0 은 없음
export const PROP_NONE = 0
export const PROP_ROCK = 1
export const PROP_BROADLEAF = 2
export const PROP_PINE = 3
export const PROP_OAK = 4
export const PROP_WILLOW = 5
export const PROP_PAPER_TREE = 6
export const PROP_PALM = 7
export const PROP_SNOW_PINE = 8
export const PROP_CACTUS = 9

// 나무인지(키가 커서 동물을 가릴 수 있는 소품)
export function isTree(prop: number): boolean {
  return prop >= PROP_BROADLEAF && prop <= PROP_CACTUS
}

// 지표 종류(kind 배열 값). 종이는 모눈종이 세트 하나뿐이다
export const KIND_PAPER = 0
export const KIND_GRASS = 1
export const KIND_DIRT = 2
export const KIND_STONE = 3
export const KIND_SNOW = 4
export const KIND_LITTER = 5
export const KIND_SAND = 6
// 호수 칸. 얕은지 깊은지는 water 배열이 가른다
export const KIND_WATER = 7
export const KIND_ICE = 8
export const KIND_WET_SAND = 9

// 걷는 꾸밈(deco 배열 값). 0 은 없음
export const DECO_NONE = 0
export const DECO_FLOWER = 1
export const DECO_TUFT = 2
export const DECO_MUSHROOM = 3
export const DECO_REED = 4
export const DECO_LILY = 5
export const DECO_BRANCH = 6
export const DECO_SHELL = 7
export const DECO_DRY_BUSH = 8

// water 배열 값
export const WATER_NONE = 0
export const WATER_SHALLOW = 1
export const WATER_DEEP = 2

export const MAX_HEIGHT = 8
export const CHUNK = 32
export const OBS_CELL = 3
export const LAKE_CELL = 40
// 블록 발자국(최대 2 칸) − 1 + 둘레 1 칸. 블록을 놓을지 정할 때 발자국과 둘레 높이가 정확해야 한다
export const PAD = 2

export type GenOptions = {
  // 장애물 후보 셀 크기(칸)
  cell?: number
  // false 면 후보끼리 겹침만 막고 8-인접은 허용한다(갇힌 칸이 생기는지 보는 대조 실험용)
  ring?: boolean
  // 높이 노이즈 대신 쓸 함수(섬 가장자리 낮추기, 합성 시험)
  raw?: (x: number, y: number) => number
  // 이 칸 범위 밖으로(둘레 1 칸 포함) 걸치는 장애물 후보는 버린다(경계 있는 맵)
  inside?: { x0: number; y0: number; x1: number; y1: number }
  // 호수 셀 결과를 담아 두는 표(키 lakeKeyOf). 같은 시드·매개변수·raw·inside 로만 나눠 쓴다(경계 없는 월드의 청크들)
  lakeCache?: Map<number, Lake | null>
  // 포락선 여유(칸). 없으면 반경 reachOf. 여유를 줄이면 이음매가 어긋나는지 보는 시험용
  margin?: number
}

// water: 칸마다 WATER_*. 물 칸의 height 는 바닥 높이다
export type Region = { x0: number; y0: number; w: number; h: number; height: Uint8Array; prop: Uint8Array; block: Uint8Array; kind: Uint8Array; deco: Uint8Array; water: Uint8Array }

// 32 비트 정수 섞기
export function hash(seed: number, x: number, y: number, salt: number): number {
  let h = (seed ^ Math.imul(salt, 0x27d4eb2d)) >>> 0
  h = Math.imul(h ^ (x | 0), 0x85ebca6b)
  h = Math.imul(h ^ (h >>> 13) ^ (y | 0), 0xc2b2ae35)
  h ^= h >>> 16
  h = Math.imul(h, 0x7feb352d)
  h ^= h >>> 15
  h = Math.imul(h, 0x846ca68b)
  h ^= h >>> 16
  return h >>> 0
}

export function unit(h: number): number {
  return h / 4294967296
}

export function smooth(t: number): number {
  return t * t * (3 - 2 * t)
}

// 격자점 값이 좌표 해시라 어느 영역에서 불러도 같은 값이 나온다
export function vnoise(seed: number, salt: number, x: number, y: number, spacing: number): number {
  const gx = x / spacing
  const gy = y / spacing
  const x0 = Math.floor(gx)
  const y0 = Math.floor(gy)
  const tx = smooth(gx - x0)
  const ty = smooth(gy - y0)
  const a = unit(hash(seed, x0, y0, salt))
  const b = unit(hash(seed, x0 + 1, y0, salt))
  const c = unit(hash(seed, x0, y0 + 1, salt))
  const d = unit(hash(seed, x0 + 1, y0 + 1, salt))
  const top = a + (b - a) * tx
  const bottom = c + (d - c) * tx
  return top + (bottom - top) * ty
}

// 능선 스탬프가 뻗는 8 방위의 단위 벡터(십진 리터럴이라 삼각 함수를 부르지 않고 어느 엔진에서든 같은 수다)
const DIRS: ReadonlyArray<readonly [number, number]> = [[1, 0], [0.9239, 0.3827], [0.7071, 0.7071], [0.3827, 0.9239], [0, 1], [-0.3827, 0.9239], [-0.7071, 0.7071], [-0.9239, 0.3827]]

// 칸 (x, y) 에 지형 스탬프가 더하는 높이(단, 소수). 스탬프끼리는 큰 값. 스탬프는 제 셀 안에 들어가게 가운데를 크기만큼 안쪽에 두어 칸이 든 셀 하나만 본다
export function landformAt(seed: number, p: GenParams, x: number, y: number): number {
  let top = 0
  const forms = p.forms
  if (!forms) return 0
  for (let f = 0; f < forms.length; f++) {
    const form = forms[f]!
    const v = form.shape === 'ridge' ? ridgeAt(seed, form, f, x, y) : roundAt(seed, form, f, x, y)
    if (v > top) top = v
  }
  return top
}

// 스탬프 하나의 셀 값: 있는지, 가운데, 크기(반지름·길이), 높이(마루), 능선 방향. 스탬프 순번 f 로 salt 가 정해진다(둥근 것 600 + 10f, 능선 700 + 10f)
type Stamp = { seed: number; form: Landform | undefined; gx: number; gy: number; on: boolean; cx: number; cy: number; size: number; h: number; dx: number; dy: number }
// 스탬프 순번마다 마지막으로 본 셀. 이웃 칸은 대개 같은 셀이라 셀 해시를 다시 계산하지 않는다((시드, 스탬프, 셀) 의 함수 값을 담아 둘 뿐이라 결과는 같다)
const stamps: Stamp[] = []

function stampOf(seed: number, form: Landform, f: number, gx: number, gy: number): Stamp {
  const m = (stamps[f] ??= { seed: NaN, form: undefined, gx: NaN, gy: NaN, on: false, cx: 0, cy: 0, size: 0, h: 0, dx: 0, dy: 0 })
  if (m.seed === seed && m.form === form && m.gx === gx && m.gy === gy) return m
  m.seed = seed; m.form = form; m.gx = gx; m.gy = gy
  const ridge = form.shape === 'ridge'
  const salt = (ridge ? 700 : 600) + 10 * f
  m.on = unit(hash(seed, gx, gy, salt)) < form.p
  if (!m.on) return m
  m.size = form.r[0] + unit(hash(seed, gx, gy, salt + 1)) * (form.r[1] - form.r[0])
  m.h = form.h[0] + unit(hash(seed, gx, gy, salt + 4)) * (form.h[1] - form.h[0])
  // 가운데를 셀 가장자리에서 둥근 것은 반지름 + 1, 능선은 길이/2 + 마루 높이 + 1 안쪽에 둔다
  const inset = ridge ? Math.ceil(m.size / 2 + m.h) + 1 : Math.ceil(m.size) + 1
  const room = Math.max(0, form.cell - 2 * inset)
  m.cx = gx * form.cell + inset + Math.floor(unit(hash(seed, gx, gy, salt + 2)) * room)
  m.cy = gy * form.cell + inset + Math.floor(unit(hash(seed, gx, gy, salt + 3)) * room)
  if (ridge) [m.dx, m.dy] = DIRS[hash(seed, gx, gy, salt + 6) & 7]!
  return m
}

// 둥근 스탬프(dome·peak·mesa) 하나의 높이. f 는 스탬프 순번
function roundAt(seed: number, form: Landform, f: number, x: number, y: number): number {
  const m = stampOf(seed, form, f, Math.floor(x / form.cell), Math.floor(y / form.cell))
  if (!m.on) return 0
  const r = m.size
  const d2 = (x - m.cx) * (x - m.cx) + (y - m.cy) * (y - m.cy)
  if (d2 >= r * r) return 0
  const t = 1 - d2 / (r * r)
  return form.shape === 'mesa' ? m.h : form.shape === 'peak' ? m.h * t * t : m.h * t
}

// 능선 스탬프 하나의 높이(f 는 스탬프 순번). t 는 마루 방향 좌표, s 는 마루에서 옆으로 떨어진 거리. 마루를 따라 1 차원 노이즈로 봉우리와 고개(마루 − 2)가 나고,
// 양 끝 마루 높이 칸 안에서는 마루가 0 까지 내려간다
export function ridgeAt(seed: number, form: Landform, f: number, x: number, y: number): number {
  const sx = x + (form.shift ?? 0)
  const sy = y + (form.shift ?? 0)
  const gx = Math.floor(sx / form.cell)
  const gy = Math.floor(sy / form.cell)
  const m = stampOf(seed, form, f, gx, gy)
  if (!m.on) return 0
  const L = m.size
  const peak = m.h
  const px = sx - m.cx
  const py = sy - m.cy
  const t = px * m.dx + py * m.dy
  const s = Math.abs(py * m.dx - px * m.dy)
  if (Math.abs(t) > L / 2) return 0
  let crest = peak - 2 * vnoise(seed, 705 + 10 * f, t + L / 2, gx * 4099 + gy, 9)
  const end = (L / 2 - Math.abs(t)) / peak
  if (end < 1) crest *= end
  return Math.max(0, crest - (form.slope ?? 1) * s)
}

// 능선 노이즈 띠의 높이(단). wx, wy 는 워핑 좌표
export function crestAt(seed: number, p: GenParams, wx: number, wy: number): number {
  const c = p.crest
  if (!c) return 0
  const u = (wx + wy) * 0.7071
  const v = (wx - wy) * 0.7071
  const r = 1 - Math.abs(2 * vnoise(seed, c.salt, u / c.stretch, v, c.spacing) - 1)
  return r > c.cut ? c.h + Math.floor((r - c.cut) * c.gain) : 0
}

// 분지를 빼기 전 높이(단, 소수, 자르기 전): 바탕 + 스탬프·능선 띠 중 큰 값 + 잔기복
export function landAt(seed: number, p: GenParams, x: number, y: number): number {
  return landOf(seed, p, x, y, warpXOf(seed, p, x, y), warpYOf(seed, p, x, y))
}

function warpXOf(seed: number, p: GenParams, x: number, y: number): number {
  return p.warp > 0 ? x + (vnoise(seed, 11, x, y, p.warpSpacing) - 0.5) * 2 * p.warp : x
}

function warpYOf(seed: number, p: GenParams, x: number, y: number): number {
  return p.warp > 0 ? y + (vnoise(seed, 12, x, y, p.warpSpacing) - 0.5) * 2 * p.warp : y
}

// landAt 과 같다. wx, wy 는 워핑 좌표
function landOf(seed: number, p: GenParams, x: number, y: number, wx: number, wy: number): number {
  let s = 0
  let n = 0
  for (let o = 0; o < p.spacing.length; o++) {
    s += vnoise(seed, 20 + o, wx, wy, p.spacing[o]!) * p.amp[o]!
    n += p.amp[o]!
  }
  const v = (s / n - 0.5) * p.gain + 0.5 + p.bias
  // 가운데가 넓고 양 끝이 드문 분포라 조금 펴서 고도가 고르게 쓰이게 한다. levels 를 준 세트는 바탕을 가운데 단에 모으려고 펴지 않는다
  let h: number
  if (p.levels === undefined) h = p.hmin + Math.floor(Math.max(0, Math.min(0.9999, (v - 0.2) / 0.6)) * (p.hmax - p.hmin + 1))
  else h = (p.baseMin ?? p.hmin) + Math.floor(Math.max(0, Math.min(0.9999, v)) * p.levels)
  if (p.forms || p.crest) h += Math.max(landformAt(seed, p, x, y), crestAt(seed, p, wx, wy))
  if (p.detail) h += p.detail.amp * vnoise(seed, 21, wx, wy, p.detail.spacing)
  return h
}

// 포락선 전 높이(hmin~hmax, 강 칸은 hmin − 1)
export function rawHeight(seed: number, p: GenParams, x: number, y: number): number {
  const wx = warpXOf(seed, p, x, y)
  const wy = warpYOf(seed, p, x, y)
  if (p.river && isRiverOf(seed, p, x, y, wx, wy)) return p.hmin - 1
  let h = landOf(seed, p, x, y, wx, wy)
  if (p.basin) {
    h = Math.floor(h - basinAt(seed, p, x, y))
    if (p.basin.floor !== undefined) h = Math.max(p.basin.floor, h)
  } else h = Math.floor(h)
  return Math.max(p.hmin, Math.min(p.hmax, h))
}

// 칸 (x, y) 가 강인지
export function riverAt(seed: number, p: GenParams, x: number, y: number): boolean {
  return p.river !== undefined && isRiverOf(seed, p, x, y, warpXOf(seed, p, x, y), warpYOf(seed, p, x, y))
}

// n = 0.5 등고선 둘레 띠. 칸이 든 호수 셀과 둘레 8 셀의 호수(셀 해시로 있다고 나온 것, lowOnly·수면은 보지 않는다) 중
// 수면을 찾는 상자(중심에서 ⌈1.25 r0⌉ + 1 + hmax + 1 칸) 안이면 강이 아니다. 호수 수면과 물가 높이가 강에 흔들리지 않는다
function isRiverOf(seed: number, p: GenParams, x: number, y: number, wx: number, wy: number): boolean {
  const r = p.river!
  if (Math.abs(2 * vnoise(seed, 40, wx, wy, r.spacing) - 1) >= r.width) return false
  const kinds = lakeKindsOf(p)
  for (let kind = 0; kind < kinds; kind++) {
    const cell = lakeCellOf(p, kind)
    const gx = Math.floor(x / cell)
    const gy = Math.floor(y / cell)
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const c = lakeCenterOf(seed, p, gx + dx, gy + dy, kind)
        if (!c) continue
        const k = Math.ceil(1.25 * c.r0) + 1 + p.hmax + 1
        if (Math.abs(x - c.cx) <= k && Math.abs(y - c.cy) <= k) return false
      }
    }
  }
  return true
}

// 호수 종류 수(lake 가 없으면 0)
export function lakeKindsOf(p: GenParams): number {
  return p.lake ? 1 + (p.extraLakes?.length ?? 0) : 0
}

// 종류 kind 의 호수 매개변수
export function lakeSpecOf(p: GenParams, kind: number): LakeSpec | undefined {
  return kind === 0 ? p.lake : p.lake && p.extraLakes?.[kind - 1]
}

// 종류 kind 의 호수 격자 셀 한 변(칸)
export function lakeCellOf(p: GenParams, kind = 0): number {
  return lakeSpecOf(p, kind)?.cell ?? LAKE_CELL
}

// 종류 kind 의 호수 셀 (gx, gy) 의 호수 중심과 반지름. 셀 해시만 읽는다(lowOnly·우선 종류는 보지 않는다). 없으면 undefined.
// 중심은 셀 가장자리에서 inset 안쪽이라 이웃 셀 호수와 hmax + 4 칸 넘게 떨어진다
export function lakeCenterOf(seed: number, p: GenParams, gx: number, gy: number, kind = 0): { cx: number; cy: number; r0: number } | undefined {
  const spec = lakeSpecOf(p, kind)
  const s = 1000 * kind
  if (!spec || unit(hash(seed, gx, gy, 501 + s)) >= spec.p) return undefined
  const [rLo, rHi] = spec.r
  const r0 = rLo + Math.floor(unit(hash(seed, gx, gy, 502 + s)) * (rHi - rLo + 1))
  const cell = lakeCellOf(p, kind)
  const inset = Math.ceil(1.3 * rHi) + Math.floor(p.hmax / 2) + 2
  const room = Math.max(1, cell - 2 * inset)
  const cx = gx * cell + inset + Math.floor(unit(hash(seed, gx, gy, 503 + s)) * room)
  const cy = gy * cell + inset + Math.floor(unit(hash(seed, gx, gy, 504 + s)) * room)
  return { cx, cy, r0 }
}

// 중심 칸의 분지 전 높이가 종류 kind 의 lowOnly 조건을 넘어 호수를 두지 않는지. 칸 좌표의 함수라(raw 캐시·시험용 바꿔 끼우기를 거치지 않는다) 어느 영역에서 불러도 같다
function tooHighOf(seed: number, p: GenParams, cx: number, cy: number, kind = 0): boolean {
  const low = lakeSpecOf(p, kind)?.lowOnly
  return low !== undefined && Math.max(p.hmin, Math.min(p.hmax, Math.floor(landAt(seed, p, cx, cy)))) > p.hmin + low
}

// 종류 kind 의 호수 셀 (gx, gy) 에 호수를 두는지(셀 해시, lowOnly, 번호가 더 큰 종류의 호수에 양보). 중심과 반지름, 없으면 undefined
export function lakeSiteOf(seed: number, p: GenParams, gx: number, gy: number, kind = 0): { cx: number; cy: number; r0: number } | undefined {
  const c = lakeCenterOf(seed, p, gx, gy, kind)
  if (!c || tooHighOf(seed, p, c.cx, c.cy, kind)) return undefined
  const R = Math.ceil(1.25 * c.r0) + 1
  for (let j = kind + 1; j < lakeKindsOf(p); j++) {
    const spec = lakeSpecOf(p, j)!
    // 두 발자국 상자 사이가 hmax + 4 칸 넘게 떨어지도록: 중심 사이 체비셰프 거리 > R + Rj + hmax + 4
    const D = R + Math.ceil(1.25 * spec.r[1]) + 1 + p.hmax + 4
    const g = lakeCellsIn(c.cx - D, c.cy - D, c.cx + D, c.cy + D, lakeCellOf(p, j))
    for (let gy2 = g.gy0; gy2 <= g.gy1; gy2++) {
      for (let gx2 = g.gx0; gx2 <= g.gx1; gx2++) {
        const o = lakeSiteOf(seed, p, gx2, gy2, j)
        if (!o) continue
        const d = R + Math.ceil(1.25 * o.r0) + 1 + p.hmax + 4
        if (Math.abs(o.cx - c.cx) <= d && Math.abs(o.cy - c.cy) <= d) return undefined
      }
    }
  }
  return c
}

// 마지막으로 본 호수 셀의 분지(중심·반지름 Rb, 호수가 없거나 lowOnly 에 걸리면 Rb 0). 이웃 칸은 대개 같은 셀이라 셀 해시를 다시 계산하지 않는다.
// (시드, 매개변수, 셀) 의 함수 값을 담아 둘 뿐이라 결과는 같다
const lastBasin = { seed: NaN, p: undefined as GenParams | undefined, gx: NaN, gy: NaN, cx: 0, cy: 0, Rb: 0, high: -1 }

// 칸 (x, y) 를 호수 분지가 낮추는 깊이(단, 소수). 칸이 든 호수 셀 하나만 본다
export function basinAt(seed: number, p: GenParams, x: number, y: number): number {
  const spec = p.basin
  if (!spec) return 0
  const cell = lakeCellOf(p)
  const gx = Math.floor(x / cell)
  const gy = Math.floor(y / cell)
  const m = lastBasin
  if (m.seed !== seed || m.p !== p || m.gx !== gx || m.gy !== gy) {
    const c = lakeCenterOf(seed, p, gx, gy)
    m.seed = seed; m.p = p; m.gx = gx; m.gy = gy
    m.cx = c ? c.cx : 0; m.cy = c ? c.cy : 0; m.Rb = c ? Math.ceil(1.25 * c.r0) + 1 + spec.extra : 0
    // 중심 높이(lowOnly)는 분지 안 칸을 처음 볼 때 한 번 계산한다
    m.high = -1
  }
  if (m.Rb === 0) return 0
  const d2 = (x - m.cx) * (x - m.cx) + (y - m.cy) * (y - m.cy)
  if (d2 >= m.Rb * m.Rb) return 0
  if (m.high < 0) m.high = tooHighOf(seed, p, m.cx, m.cy) ? 1 : 0
  return m.high ? 0 : spec.depth * (1 - d2 / (m.Rb * m.Rb))
}

// 가장 낮을 수 있는 높이. 호수가 있으면 깊은 물 바닥(수면 - 2, 수면은 지형 최저 이상)까지 내려가고 0 아래로는 가지 않는다. 강만 있으면 강 바닥 hmin − 1
export function floorOf(p: GenParams): number {
  return p.lake ? Math.max(0, p.hmin - 2) : p.river ? p.hmin - 1 : p.hmin
}

// 포락선이 기대는 반경: 이보다 먼 칸은 높이를 바꾸지 못한다
export function reachOf(p: GenParams): number {
  return Math.max(0, p.hmax - floorOf(p) - 1)
}

function clampTo(p: GenParams, v: number): number {
  return Math.max(floorOf(p), Math.min(p.hmax, v))
}

// 호수 하나: 발자국 상자(왼쪽 위 x0, y0, 한 변 s)의 칸마다 WATER_*, 수면 높이 level
export type Lake = { x0: number; y0: number; s: number; cells: Uint8Array; level: number }

export function lakeCellAt(lake: Lake, x: number, y: number): number {
  const i = x - lake.x0
  const j = y - lake.y0
  return i < 0 || j < 0 || i >= lake.s || j >= lake.s ? WATER_NONE : lake.cells[j * lake.s + i]!
}

// 각도 대신 쓰는 값(0 이상 8 미만): 중심에서 본 방향을 마름모 둘레 위치로 잰다. 각도와 같은 차례로 늘어난다
function turnOf(dx: number, dy: number): number {
  const t = dy / (Math.abs(dx) + Math.abs(dy))
  return 2 * (dx >= 0 ? (dy >= 0 ? t : 4 + t) : 2 - t)
}

// 호수 셀 (gx, gy) 의 호수. 없으면 undefined.
// 모양: 방향 8 곳의 해시 값을 이어 만든 반지름 r0 × (0.75 + 0.5 × 노이즈) 안의 칸(거리는 제곱으로 비교), 가운데와 이어진 칸만 두고
// 상자 테두리에서 닿지 않는 칸(구멍)은 채운다. 깊음: 반지름 4 이상이고 수면 2 이상일 때, 8 이웃이 모두 발자국이고 가운데에서 0.6 r0 안인 칸.
// 중심은 셀 가장자리에서 inset 안쪽이라 이웃 셀 호수와 hmax + 4 칸 넘게 떨어진다. lim 이 있으면 발자국과 테가 그 안에 들 때만 둔다
export function lakeOf(seed: number, p: GenParams, gx: number, gy: number, opts: GenOptions = {}, kind = 0): Lake | undefined {
  const shape = lakeShapeOf(seed, p, gx, gy, opts, kind)
  return shape && lakeFinish(seed, p, shape, opts)
}

// 호수 모양(발자국, 수면 전). raw 캐시를 읽지 않는다(lowOnly 가 있으면 중심 칸 하나의 분지 전 높이만 직접 계산한다).
// near: 수면을 찾는 칸 범위(발자국을 hmax + 1 칸 넓힌 상자, 양 끝 포함)
export type LakeShape = { x0: number; y0: number; s: number; R: number; r0: number; cells: Uint8Array; near: { x0: number; y0: number; x1: number; y1: number } }

export function lakeShapeOf(seed: number, p: GenParams, gx: number, gy: number, opts: GenOptions = {}, kind = 0): LakeShape | undefined {
  const c = lakeSiteOf(seed, p, gx, gy, kind)
  if (!c) return undefined
  const { cx, cy, r0 } = c
  const R = Math.ceil(1.25 * r0) + 1
  const s = 2 * R + 1
  const v: number[] = []
  for (let k = 0; k < 8; k++) v.push(unit(hash(seed, gx, gy, 510 + 1000 * kind + k)))
  const shape = new Uint8Array(s * s)
  for (let j = 0; j < s; j++) {
    for (let i = 0; i < s; i++) {
      const dx = i - R
      const dy = j - R
      if (dx === 0 && dy === 0) { shape[j * s + i] = 1; continue }
      const a = turnOf(dx, dy)
      const k = Math.floor(a)
      const n = v[k & 7]! + (v[(k + 1) & 7]! - v[k & 7]!) * smooth(a - k)
      const r = r0 * (0.75 + 0.5 * n)
      if (dx * dx + dy * dy < r * r) shape[j * s + i] = 1
    }
  }
  // 가운데와 4 방향으로 이어진 칸만 남기고, 테두리에서 닿지 않는 빈칸은 채운다
  const keep = floodOf(shape, s, [R * s + R], 1)
  const outside = floodOf(keep, s, borderOf(s), 0)
  const cells = new Uint8Array(s * s)
  let bx0 = s
  let by0 = s
  let bx1 = -1
  let by1 = -1
  for (let t = 0; t < s * s; t++) {
    if (outside[t]) continue
    cells[t] = WATER_SHALLOW
    const i = t % s
    const j = (t - i) / s
    bx0 = Math.min(bx0, i); bx1 = Math.max(bx1, i); by0 = Math.min(by0, j); by1 = Math.max(by1, j)
  }
  const x0 = cx - R
  const y0 = cy - R
  const lim = opts.inside
  if (lim && (x0 + bx0 - 1 < lim.x0 || y0 + by0 - 1 < lim.y0 || x0 + bx1 + 1 > lim.x1 || y0 + by1 + 1 > lim.y1)) return undefined
  const k = p.hmax + 1
  return { x0, y0, s, R, r0, cells, near: { x0: x0 - k, y0: y0 - k, x1: x0 + s - 1 + k, y1: y0 + s - 1 + k } }
}

// 모양에 수면과 깊은 물을 더해 호수를 만든다. 수면이 1 보다 낮으면 호수가 없다
export function lakeFinish(seed: number, p: GenParams, shape: LakeShape, opts: GenOptions = {}): Lake | undefined {
  const { x0, y0, s, R, r0 } = shape
  const cells = shape.cells.slice()
  // 수면: 발자국을 hmax + 1 칸(8 방향 거리) 넓힌 곳의 포락선 전 높이 최솟값
  const k = p.hmax + 1
  const S = s + 2 * k
  // 가로로 k 칸 넓힌 뒤 세로로 k 칸 넓힌다(8 방향 거리 k 안)
  const row = new Uint8Array(S * S)
  for (let j = 0; j < s; j++) {
    for (let i = 0; i < s; i++) {
      if (!cells[j * s + i]) continue
      for (let d = 0; d <= 2 * k; d++) row[(j + k) * S + i + d] = 1
    }
  }
  const near = new Uint8Array(S * S)
  for (let j = 0; j < S; j++) {
    for (let i = 0; i < S; i++) {
      if (!row[j * S + i]) continue
      for (let d = -k; d <= k; d++) if (j + d >= 0 && j + d < S) near[(j + d) * S + i] = 1
    }
  }
  const raw = opts.raw
  let level = MAX_HEIGHT
  for (let j = 0; j < S; j++) {
    for (let i = 0; i < S; i++) {
      if (!near[j * S + i]) continue
      const x = x0 - k + i
      const y = y0 - k + j
      level = Math.min(level, clampTo(p, raw ? raw(x, y) : rawHeight(seed, p, x, y)))
    }
  }
  if (level < 1) return undefined
  if (r0 >= 4 && level >= 2) {
    const deep = (0.6 * r0) * (0.6 * r0)
    for (let j = 1; j < s - 1; j++) {
      for (let i = 1; i < s - 1; i++) {
        const dx = i - R
        const dy = j - R
        if (!cells[j * s + i] || dx * dx + dy * dy >= deep) continue
        let all = true
        for (let e = -1; e <= 1 && all; e++) for (let d = -1; d <= 1; d++) if (!cells[(j + e) * s + i + d]) { all = false; break }
        if (all) cells[j * s + i] = WATER_DEEP
      }
    }
  }
  return { x0, y0, s, cells, level }
}

function borderOf(s: number): number[] {
  const out: number[] = []
  for (let i = 0; i < s; i++) out.push(i, (s - 1) * s + i, i * s, i * s + s - 1)
  return out
}

// 칸 배열 m 에서 값이 want 인 칸만 따라 starts 로부터 4 방향으로 닿는 칸 표시
function floodOf(m: Uint8Array, s: number, starts: readonly number[], want: number): Uint8Array {
  const seen = new Uint8Array(s * s)
  const queue: number[] = []
  for (const t of starts) if (m[t] === want && !seen[t]) { seen[t] = 1; queue.push(t) }
  for (let head = 0; head < queue.length; head++) {
    const t = queue[head]!
    const i = t % s
    const j = (t - i) / s
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const ni = i + di
      const nj = j + dj
      if (ni < 0 || nj < 0 || ni >= s || nj >= s) continue
      const u = nj * s + ni
      if (seen[u] || m[u] !== want) continue
      seen[u] = 1
      queue.push(u)
    }
  }
  return seen
}

// 호수 셀 좌표를 한 수로(|셀 좌표| < 32768)
// 종류 kind 는 2^32 단위로 더한다(종류 0 은 전과 같은 키). lakeKeyParts 가 되돌린다
export function lakeKeyOf(gx: number, gy: number, kind = 0): number {
  return ((gx & 0xffff) | (gy << 16)) + kind * 4294967296
}

export function lakeKeyParts(key: number): { gx: number; gy: number; kind: number } {
  const kind = Math.floor((key + 2147483648) / 4294967296)
  const base = key - kind * 4294967296
  return { gx: (base << 16) >> 16, gy: base >> 16, kind }
}

// [x0, x1] × [y0, y1] 와 겹치는 호수 셀 범위(양 끝 포함). cell 은 호수 셀 한 변
export function lakeCellsIn(x0: number, y0: number, x1: number, y1: number, cell = LAKE_CELL): { gx0: number; gy0: number; gx1: number; gy1: number } {
  return { gx0: Math.floor(x0 / cell), gy0: Math.floor(y0 / cell), gx1: Math.floor(x1 / cell), gy1: Math.floor(y1 / cell) }
}

// [x0, x1] × [y0, y1] 와 겹치는 호수들. 호수는 제 셀 안에 들어 있어 겹치는 셀만 본다
export function lakesIn(seed: number, p: GenParams, x0: number, y0: number, x1: number, y1: number, opts: GenOptions = {}): Lake[] {
  const out: Lake[] = []
  const cache = opts.lakeCache
  for (let kind = 0; kind < lakeKindsOf(p); kind++) {
    const g = lakeCellsIn(x0, y0, x1, y1, lakeCellOf(p, kind))
    for (let gy = g.gy0; gy <= g.gy1; gy++) {
      for (let gx = g.gx0; gx <= g.gx1; gx++) {
        let lake: Lake | undefined
        if (cache) {
          const key = lakeKeyOf(gx, gy, kind)
          let v = cache.get(key)
          if (v === undefined) { v = lakeOf(seed, p, gx, gy, opts, kind) ?? null; cache.set(key, v) }
          lake = v ?? undefined
        } else lake = lakeOf(seed, p, gx, gy, opts, kind)
        if (lake && lake.x0 <= x1 && lake.y0 <= y1 && lake.x0 + lake.s > x0 && lake.y0 + lake.s > y0) out.push(lake)
      }
    }
  }
  return out
}

function wetOf(lakes: readonly Lake[], x: number, y: number): number {
  for (const lake of lakes) {
    const v = lakeCellAt(lake, x, y)
    if (v) return v
  }
  return WATER_NONE
}

// [x0, x0 + w) × [y0, y0 + h) 의 포락선 높이. 둘레 margin 칸을 더 계산해 버린다(기본은 반경 reachOf).
// lakes 가 주어지면 그 호수 칸의 포락선 전 높이를 바닥(얕음 수면 - 1, 깊음 수면 - 2)으로 바꾼 뒤 계산한다
export function envelope(seed: number, p: GenParams, x0: number, y0: number, w: number, h: number, opts: GenOptions = {}, margin = reachOf(p), lakes: readonly Lake[] = []): Uint8Array {
  const rw = w + 2 * margin
  const rh = h + 2 * margin
  const rx0 = x0 - margin
  const ry0 = y0 - margin
  const raw = opts.raw
  const H = new Int16Array(rw * rh)
  for (let j = 0; j < rh; j++) for (let i = 0; i < rw; i++) H[j * rw + i] = clampTo(p, raw ? raw(rx0 + i, ry0 + j) : rawHeight(seed, p, rx0 + i, ry0 + j))
  for (const lake of lakes) {
    for (let j = 0; j < lake.s; j++) {
      for (let i = 0; i < lake.s; i++) {
        const v = lake.cells[j * lake.s + i]!
        const li = lake.x0 + i - rx0
        const lj = lake.y0 + j - ry0
        if (v && li >= 0 && lj >= 0 && li < rw && lj < rh) H[lj * rw + li] = lake.level - v
      }
    }
  }
  // 앞뒤 두 번 쓸기를 바뀌지 않을 때까지(4 방향 거리 변환)
  for (let changed = true; changed;) {
    changed = false
    for (let j = 0; j < rh; j++) {
      for (let i = 0; i < rw; i++) {
        const t = j * rw + i
        let v = H[t]!
        if (i > 0 && H[t - 1]! + 1 < v) v = H[t - 1]! + 1
        if (j > 0 && H[t - rw]! + 1 < v) v = H[t - rw]! + 1
        if (v < H[t]!) { H[t] = v; changed = true }
      }
    }
    for (let j = rh - 1; j >= 0; j--) {
      for (let i = rw - 1; i >= 0; i--) {
        const t = j * rw + i
        let v = H[t]!
        if (i < rw - 1 && H[t + 1]! + 1 < v) v = H[t + 1]! + 1
        if (j < rh - 1 && H[t + rw]! + 1 < v) v = H[t + rw]! + 1
        if (v < H[t]!) { H[t] = v; changed = true }
      }
    }
  }
  const out = new Uint8Array(w * h)
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) out[j * w + i] = H[(j + margin) * rw + i + margin]!
  return out
}

type Candidate = { x: number; y: number; w: number; h: number; prop: number; isBlock: boolean; up: number; pri: number }

// 셀 (cx, cy) 의 장애물 후보. 없으면 undefined
export function candidateOf(seed: number, p: GenParams, cx: number, cy: number, cell = OBS_CELL): Candidate | undefined {
  const u = unit(hash(seed, cx, cy, 201))
  const plain = !p.obsField && !p.obsNear
  if (plain && u >= p.obsP * 2.2) return undefined
  const x = cx * cell + Math.floor(unit(hash(seed, cx, cy, 202)) * cell)
  const y = cy * cell + Math.floor(unit(hash(seed, cx, cy, 203)) * cell)
  if (!plain) {
    let q = p.obsP * 2.2
    const f = p.obsField
    if (f) q *= f.lo + (f.hi - f.lo) * vnoise(seed, 210, cx * cell, cy * cell, f.spacing)
    if (p.obsNear) q *= basinAt(seed, p, x, y) > 0 ? p.obsNear.hi : p.obsNear.lo
    if (u >= q) return undefined
  }
  const k = unit(hash(seed, cx, cy, 204)) * (p.treeW + p.rockW + p.blockW)
  const pri = hash(seed, cx, cy, 209)
  if (k < p.treeW) return { x, y, w: 1, h: 1, prop: p.tree, isBlock: false, up: 0, pri }
  if (k < p.treeW + p.rockW) return { x, y, w: 1, h: 1, prop: PROP_ROCK, isBlock: false, up: 0, pri }
  let w = 1
  let h = 1
  if (unit(hash(seed, cx, cy, 207)) < 0.3) {
    if (unit(hash(seed, cx, cy, 208)) < 0.5) w = 2
    else h = 2
  }
  return { x, y, w, h, prop: PROP_NONE, isBlock: true, up: unit(hash(seed, cx, cy, 206)) < 0.6 ? 1 : 2, pri }
}

function touches(a: Candidate, b: Candidate, ring: boolean): boolean {
  const e = ring ? 1 : 0
  return a.x - e <= b.x + b.w - 1 && b.x <= a.x + a.w - 1 + e && a.y - e <= b.y + b.h - 1 && b.y <= a.y + a.h - 1 + e
}

// 칸 하나의 지표 종류. 높이·블록은 그 칸의 최종 값이다
export function kindOf(seed: number, p: GenParams, x: number, y: number, height: number, isBlock: boolean): number {
  const ground = p.ground ?? KIND_PAPER
  if (isBlock) return p.blockKind ?? ground
  if (p.snow && height >= p.snow.min && vnoise(seed, 31, x, y, 36) - 0.06 * height < p.snow.line) return KIND_SNOW
  if (p.rockLine !== undefined && height >= p.rockLine) return KIND_STONE
  if (p.patch && (p.patch.maxH === undefined || height <= p.patch.maxH) && vnoise(seed, 32, x, y, 44) < p.patch.wet && vnoise(seed, 33, x, y, 7) > p.patch.p) return p.patch.kind
  return ground
}

// 물 칸(호수·강) 하나의 걷는 꾸밈: 땅과 4 방향으로 닿은 얕은 물에 갈대, 땅과 닿지 않은 얕은 물에 연잎(깊은 물 색 위에서는 연잎이 잘 안 보인다).
// wetAt 은 칸의 WATER_*
export function waterDecoOf(seed: number, p: GenParams, x: number, y: number, wet: number, wetAt: (x: number, y: number) => number): number {
  let isShore = false
  for (const [dx, dy] of [[1, 0], [0, 1], [-1, 0], [0, -1]] as const) if (!wetAt(x + dx, y + dy)) isShore = true
  if (wet === WATER_SHALLOW && isShore && unit(hash(seed, x, y, 303)) < (p.reedP ?? 0)) return DECO_REED
  if (wet === WATER_SHALLOW && !isShore && unit(hash(seed, x, y, 304)) < (p.lilyP ?? 0)) return DECO_LILY
  return DECO_NONE
}

// 물 칸(호수 발자국·강)과 8 방향 거리 w 안인 칸(물 밖)인지
function isShoreOf(wetAt: (x: number, y: number) => number, x: number, y: number, w: number): boolean {
  for (let dy = -w; dy <= w; dy++) for (let dx = -w; dx <= w; dx++) if (wetAt(x + dx, y + dy)) return true
  return false
}

// 장애물·블록이 아닌 칸 하나의 걷는 꾸밈
export function decoOf(seed: number, p: GenParams, x: number, y: number, kind: number): number {
  const u = unit(hash(seed, x, y, 301))
  if (kind === KIND_GRASS) {
    const flower = p.flowerP ?? 0
    if (u < flower) return DECO_FLOWER
    if (u < flower + (p.tuftP ?? 0)) return DECO_TUFT
  }
  if ((kind === KIND_GRASS || kind === KIND_LITTER) && unit(hash(seed, x, y, 302)) < (p.mushroomP ?? 0)) return DECO_MUSHROOM
  if ((kind === KIND_GRASS || kind === KIND_LITTER || kind === p.ground) && unit(hash(seed, x, y, 305)) < (p.branchP ?? 0)) return DECO_BRANCH
  if ((kind === KIND_SAND || kind === KIND_WET_SAND) && unit(hash(seed, x, y, 306)) < (p.shellP ?? 0)) return DECO_SHELL
  if (kind === KIND_SAND && unit(hash(seed, x, y, 307)) < (p.dryBushP ?? 0)) return DECO_DRY_BUSH
  return DECO_NONE
}

// 영역 [x0, x0 + w) × [y0, y0 + h) 를 만든다: 높이, 소품 번호(나무·바위), 블록 표시, 지표 종류, 걷는 꾸밈, 물
export function region(seed: number, p: GenParams, x0: number, y0: number, w: number, h: number, opts: GenOptions = {}): Region {
  const work = regionStart(seed, p, x0, y0, w, h, opts)
  regionRows(work, h)
  const { height, prop, block, kind, deco, water } = work
  return { x0, y0, w, h, height, prop, block, kind, deco, water }
}

// 나눠 만드는 영역. regionStart 가 높이·소품·블록까지 만들고, regionRows 가 지표 종류·꾸밈·물을 행 단위로 채운다(rows 는 채운 행 수).
// wet 은 둘레 PAD 칸까지의 WATER_*(호수 발자국과 강). 물가 띠 폭·장애물 둘레 검사가 이 안에서 끝나도록 shoreWidth ≤ PAD 다
export type RegionWork = Region & { seed: number; p: GenParams; lakes: Lake[]; wet: Uint8Array; rows: number }

export function regionStart(seed: number, p: GenParams, x0: number, y0: number, w: number, h: number, opts: GenOptions = {}): RegionWork {
  const cell = opts.cell ?? OBS_CELL
  const ring = opts.ring ?? true
  // 둘레 PAD 칸까지 정확한 높이. 포락선이 읽는 칸(여유 margin 포함)에 걸친 호수를 모두 찍는다
  const ew = w + 2 * PAD
  const eh = h + 2 * PAD
  const ex0 = x0 - PAD
  const ey0 = y0 - PAD
  const margin = opts.margin ?? reachOf(p)
  const lakes = lakesIn(seed, p, ex0 - margin, ey0 - margin, ex0 + ew - 1 + margin, ey0 + eh - 1 + margin, opts)
  const H = envelope(seed, p, ex0, ey0, ew, eh, opts, margin, lakes)
  const at = (x: number, y: number) => H[(y - ey0) * ew + (x - ex0)]!
  // 물: 호수 발자국, 그리고 강(강 바닥 hmin − 1 보다 낮은 땅은 없어 포락선 높이가 hmin 미만인 호수 밖 칸이 강이다)
  const wet = new Uint8Array(ew * eh)
  for (let j = 0; j < eh; j++) {
    for (let i = 0; i < ew; i++) {
      const t = j * ew + i
      wet[t] = wetOf(lakes, ex0 + i, ey0 + j)
      if (!wet[t] && p.river && H[t]! < p.hmin) wet[t] = WATER_SHALLOW
    }
  }
  const wetAt = (x: number, y: number) => wet[(y - ey0) * ew + (x - ex0)]!
  const height = new Uint8Array(w * h)
  const prop = new Uint8Array(w * h)
  const block = new Uint8Array(w * h)
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) height[j * w + i] = at(x0 + i, y0 + j)
  // 발자국이 영역과 겹칠 수 있는 셀과, 그 셀들과 비교할 이웃 두 셀
  const cx0 = Math.floor((x0 - 2) / cell) - 2
  const cx1 = Math.floor((x0 + w) / cell) + 2
  const cy0 = Math.floor((y0 - 2) / cell) - 2
  const cy1 = Math.floor((y0 + h) / cell) + 2
  const cw = cx1 - cx0 + 1
  const cands: Array<Candidate | undefined> = []
  for (let cy = cy0; cy <= cy1; cy++) for (let cx = cx0; cx <= cx1; cx++) cands.push(candidateOf(seed, p, cx, cy, cell))
  const lim = opts.inside
  for (let cy = cy0 + 2; cy <= cy1 - 2; cy++) {
    for (let cx = cx0 + 2; cx <= cx1 - 2; cx++) {
      const c = cands[(cy - cy0) * cw + (cx - cx0)]
      if (!c) continue
      if (c.x + c.w <= x0 || c.y + c.h <= y0 || c.x >= x0 + w || c.y >= y0 + h) continue
      if (lim && (c.x - 1 < lim.x0 || c.y - 1 < lim.y0 || c.x + c.w > lim.x1 || c.y + c.h > lim.y1)) continue
      let ok = true
      for (let y = c.y - 1; y <= c.y + c.h && ok; y++) for (let x = c.x - 1; x <= c.x + c.w; x++) if (wetAt(x, y)) { ok = false; break }
      for (let dy = -2; dy <= 2 && ok; dy++) {
        for (let dx = -2; dx <= 2 && ok; dx++) {
          if (dx === 0 && dy === 0) continue
          const o = cands[(cy + dy - cy0) * cw + (cx + dx - cx0)]
          if (o && o.pri > c.pri && touches(c, o, ring)) ok = false
        }
      }
      if (!ok) continue
      let hi = 0
      let lo = MAX_HEIGHT
      for (let y = c.y; y < c.y + c.h; y++) for (let x = c.x; x < c.x + c.w; x++) { hi = Math.max(hi, at(x, y)); lo = Math.min(lo, at(x, y)) }
      if (c.isBlock && hi !== lo) continue
      const top = c.isBlock ? Math.min(MAX_HEIGHT, hi + c.up) : hi
      for (let y = c.y; y < c.y + c.h; y++) {
        for (let x = c.x; x < c.x + c.w; x++) {
          if (x < x0 || y < y0 || x >= x0 + w || y >= y0 + h) continue
          const o = (y - y0) * w + (x - x0)
          height[o] = top
          prop[o] = c.prop
          block[o] = c.isBlock ? 1 : 0
        }
      }
    }
  }
  return { x0, y0, w, h, height, prop, block, kind: new Uint8Array(w * h), deco: new Uint8Array(w * h), water: new Uint8Array(w * h), seed, p, lakes, wet, rows: 0 }
}

// 지표 종류·꾸밈·물을 upTo 행까지 채운다
export function regionRows(work: RegionWork, upTo: number): void {
  const { seed, p, x0, y0, w, height, prop, block, kind, deco, water } = work
  const ew = w + 2 * PAD
  const wetAt = (x: number, y: number) => work.wet[(y - y0 + PAD) * ew + (x - x0 + PAD)]!
  for (let j = work.rows; j < Math.min(upTo, work.h); j++) {
    for (let i = 0; i < w; i++) {
      const o = j * w + i
      const x = x0 + i
      const y = y0 + j
      const wet = wetAt(x, y)
      if (wet) {
        water[o] = wet
        kind[o] = KIND_WATER
        deco[o] = waterDecoOf(seed, p, x, y, wet, wetAt)
        continue
      }
      kind[o] = p.shore !== undefined && isShoreOf(wetAt, x, y, p.shoreWidth ?? 1) ? p.shore : kindOf(seed, p, x, y, height[o]!, block[o] === 1)
      if (!block[o] && !prop[o]) deco[o] = decoOf(seed, p, x, y, kind[o]!)
    }
  }
  work.rows = Math.max(work.rows, Math.min(upTo, work.h))
}
