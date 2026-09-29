// 좌표 해시 생성기(순수 모듈). 모든 값은 (시드, x, y) 의 함수라, 영역을 잘라 따로 만들어도 한 번에 만든 것과 바이트가 같다.
//
// 1. 높이 노이즈: 도메인 워핑 + value noise 여러 겹을 hmin~hmax 단으로 나눈다
// 2. 포락선: h(p) = min_q(h0(q) + 맨해튼 거리). 이웃 칸끼리 높이 차 ≤ 1 이 된다.
//    높이가 [바닥, hmax] 안이면(바닥은 hmin, 호수가 있으면 깊은 물 바닥 floorOf) 거리가 hmax − 바닥 이상인 칸은 최솟값이 될 수 없어,
//    영역 둘레에 여유 hmax − 바닥 − 1 칸만 붙여 계산해도 결과가 전역 계산과 같다
// 3. 장애물 후보: cell 칸 격자 셀마다 후보 하나(위치·종류·발자국·우선순위가 셀 해시).
//    우선순위가 더 높은 이웃 "후보"와 겹치거나 8-인접하면 버린다. 채택된 점이 아니라 후보와 비교하므로
//    결과가 반경 2 셀 안의 해시만으로 정해진다. 장애물 덩어리가 서로 8-인접하지 않고 구멍이 없어 걷는 칸이 끊기지 않는다
// 4. 블록 높이 = 발자국 높이 + 1 또는 + 2(발자국 높이가 모두 같을 때만 놓는다)
// 5. 지표 종류: 순서대로 첫 참. 호수(물), 호수 테(물가 종류), 블록, 눈(온도 노이즈 - 0.06 × 높이 < 눈 문턱, 높이 하한 이상),
//    돌(높이 문턱 이상), 얼룩(습도 노이즈 < 문턱 이고 잔무늬 노이즈 > 문턱), 나머지는 바탕 종류
// 6. 걷는 꾸밈(꽃·풀포기·버섯·갈대·연잎·나뭇가지): 장애물·블록이 아닌 칸에 칸 해시로 둔다. 장애물이 아니라 걸음을 막지 않는다
// 7. 호수: LAKE_CELL 칸 격자 셀마다 확률로 하나. 모양·깊이·수면이 셀 좌표와 포락선 전 높이만의 함수라 어느 영역에서 불러도 같다.
//    수면 L = 발자국을 hmax + 1 칸 넓힌 곳의 포락선 전 높이 최솟값, 바닥은 얕음 L - 1, 깊음 L - 2 로 고정하고 포락선을 돌린다.
//    포락선은 한 칸마다 한 단까지만 오르므로 테(발자국과 8 방향으로 닿는 칸)는 L 보다 낮을 수 없다(떠 있는 물이 없다).
//    물과 4 방향으로 닿은 테는 얕은 바닥 바로 옆이라 L 보다 높을 수도 없어 수면과 같은 높이로 평평하고, 대각선으로만 닿은 테는 L + 1 일 수 있다.
//    호수 발자국과 8 방향으로 닿는 장애물 후보는 버린다
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
  patch?: { kind: number; wet: number; p: number }
  // 걷는 꾸밈 확률(칸당). 꽃·풀포기는 풀 칸에만, 버섯은 풀·낙엽 칸에, 갈대는 땅과 닿은 얕은 물에, 연잎은 땅과 닿지 않은 얕은 물에
  flowerP?: number
  tuftP?: number
  mushroomP?: number
  reedP?: number
  lilyP?: number
  // 나뭇가지(강아지가 물어 옮길 수 있는 꾸밈) 확률(칸당). 풀·낙엽 칸에, 다른 꾸밈이 없을 때만
  branchP?: number
  // 호수: 격자 셀마다 있을 확률과 반지름 범위(칸). shore 는 호수 테의 지표 종류. 없으면 호수가 없다
  lake?: { p: number; r: readonly [number, number] }
  shore?: number
}

// 소품 번호(prop 배열 값). 0 은 없음
export const PROP_NONE = 0
export const PROP_ROCK = 1
export const PROP_BROADLEAF = 2
export const PROP_PINE = 3
export const PROP_OAK = 4
export const PROP_WILLOW = 5
export const PROP_PAPER_TREE = 6

// 나무인지(키가 커서 동물을 가릴 수 있는 소품)
export function isTree(prop: number): boolean {
  return prop >= PROP_BROADLEAF && prop <= PROP_PAPER_TREE
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

// 걷는 꾸밈(deco 배열 값). 0 은 없음
export const DECO_NONE = 0
export const DECO_FLOWER = 1
export const DECO_TUFT = 2
export const DECO_MUSHROOM = 3
export const DECO_REED = 4
export const DECO_LILY = 5
export const DECO_BRANCH = 6

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

// 포락선 전 높이(hmin~hmax)
export function rawHeight(seed: number, p: GenParams, x: number, y: number): number {
  const wx = p.warp > 0 ? x + (vnoise(seed, 11, x, y, p.warpSpacing) - 0.5) * 2 * p.warp : x
  const wy = p.warp > 0 ? y + (vnoise(seed, 12, x, y, p.warpSpacing) - 0.5) * 2 * p.warp : y
  let s = 0
  let n = 0
  for (let o = 0; o < p.spacing.length; o++) {
    s += vnoise(seed, 20 + o, wx, wy, p.spacing[o]!) * p.amp[o]!
    n += p.amp[o]!
  }
  // 가운데가 넓고 양 끝이 드문 분포라 조금 펴서 고도가 고르게 쓰이게 한다
  let v = (s / n - 0.5) * p.gain + 0.5 + p.bias
  v = Math.max(0, Math.min(0.9999, (v - 0.2) / 0.6))
  return p.hmin + Math.floor(v * (p.hmax - p.hmin + 1))
}

// 가장 낮을 수 있는 높이. 호수가 있으면 깊은 물 바닥(수면 - 2, 수면은 지형 최저 이상)까지 내려가고 0 아래로는 가지 않는다
export function floorOf(p: GenParams): number {
  return p.lake ? Math.max(0, p.hmin - 2) : p.hmin
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
export function lakeOf(seed: number, p: GenParams, gx: number, gy: number, opts: GenOptions = {}): Lake | undefined {
  const shape = lakeShapeOf(seed, p, gx, gy, opts)
  return shape && lakeFinish(seed, p, shape, opts)
}

// 호수 모양(발자국, 수면 전). 포락선 전 높이를 읽지 않는다. near: 수면을 찾는 칸 범위(발자국을 hmax + 1 칸 넓힌 상자, 양 끝 포함)
export type LakeShape = { x0: number; y0: number; s: number; R: number; r0: number; cells: Uint8Array; near: { x0: number; y0: number; x1: number; y1: number } }

export function lakeShapeOf(seed: number, p: GenParams, gx: number, gy: number, opts: GenOptions = {}): LakeShape | undefined {
  const spec = p.lake
  if (!spec || unit(hash(seed, gx, gy, 501)) >= spec.p) return undefined
  const [rLo, rHi] = spec.r
  const r0 = rLo + Math.floor(unit(hash(seed, gx, gy, 502)) * (rHi - rLo + 1))
  const inset = Math.ceil(1.3 * rHi) + Math.floor(p.hmax / 2) + 2
  const room = Math.max(1, LAKE_CELL - 2 * inset)
  const cx = gx * LAKE_CELL + inset + Math.floor(unit(hash(seed, gx, gy, 503)) * room)
  const cy = gy * LAKE_CELL + inset + Math.floor(unit(hash(seed, gx, gy, 504)) * room)
  const R = Math.ceil(1.25 * r0) + 1
  const s = 2 * R + 1
  const v: number[] = []
  for (let k = 0; k < 8; k++) v.push(unit(hash(seed, gx, gy, 510 + k)))
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
export function lakeKeyOf(gx: number, gy: number): number {
  return (gx & 0xffff) | (gy << 16)
}

// [x0, x1] × [y0, y1] 와 겹치는 호수 셀 범위(양 끝 포함)
export function lakeCellsIn(x0: number, y0: number, x1: number, y1: number): { gx0: number; gy0: number; gx1: number; gy1: number } {
  return { gx0: Math.floor(x0 / LAKE_CELL), gy0: Math.floor(y0 / LAKE_CELL), gx1: Math.floor(x1 / LAKE_CELL), gy1: Math.floor(y1 / LAKE_CELL) }
}

// [x0, x1] × [y0, y1] 와 겹치는 호수들. 호수는 제 셀 안에 들어 있어 겹치는 셀만 본다
export function lakesIn(seed: number, p: GenParams, x0: number, y0: number, x1: number, y1: number, opts: GenOptions = {}): Lake[] {
  const out: Lake[] = []
  if (!p.lake) return out
  const cache = opts.lakeCache
  const g = lakeCellsIn(x0, y0, x1, y1)
  for (let gy = g.gy0; gy <= g.gy1; gy++) {
    for (let gx = g.gx0; gx <= g.gx1; gx++) {
      let lake: Lake | undefined
      if (cache) {
        const key = lakeKeyOf(gx, gy)
        let v = cache.get(key)
        if (v === undefined) { v = lakeOf(seed, p, gx, gy, opts) ?? null; cache.set(key, v) }
        lake = v ?? undefined
      } else lake = lakeOf(seed, p, gx, gy, opts)
      if (lake && lake.x0 <= x1 && lake.y0 <= y1 && lake.x0 + lake.s > x0 && lake.y0 + lake.s > y0) out.push(lake)
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
  if (unit(hash(seed, cx, cy, 201)) >= p.obsP * 2.2) return undefined
  const x = cx * cell + Math.floor(unit(hash(seed, cx, cy, 202)) * cell)
  const y = cy * cell + Math.floor(unit(hash(seed, cx, cy, 203)) * cell)
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
  if (p.patch && vnoise(seed, 32, x, y, 44) < p.patch.wet && vnoise(seed, 33, x, y, 7) > p.patch.p) return p.patch.kind
  return ground
}

// 호수 칸 하나의 걷는 꾸밈: 땅과 4 방향으로 닿은 얕은 물에 갈대, 땅과 닿지 않은 얕은 물에 연잎(깊은 물 색 위에서는 연잎이 잘 안 보인다)
export function waterDecoOf(seed: number, p: GenParams, x: number, y: number, wet: number, lakes: readonly Lake[]): number {
  let isShore = false
  for (const [dx, dy] of [[1, 0], [0, 1], [-1, 0], [0, -1]] as const) if (!wetOf(lakes, x + dx, y + dy)) isShore = true
  if (wet === WATER_SHALLOW && isShore && unit(hash(seed, x, y, 303)) < (p.reedP ?? 0)) return DECO_REED
  if (wet === WATER_SHALLOW && !isShore && unit(hash(seed, x, y, 304)) < (p.lilyP ?? 0)) return DECO_LILY
  return DECO_NONE
}

// 호수 발자국과 8 방향으로 닿는 칸(발자국 밖)인지
function isShoreOf(lakes: readonly Lake[], x: number, y: number): boolean {
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (wetOf(lakes, x + dx, y + dy)) return true
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
  if ((kind === KIND_GRASS || kind === KIND_LITTER) && unit(hash(seed, x, y, 305)) < (p.branchP ?? 0)) return DECO_BRANCH
  return DECO_NONE
}

// 영역 [x0, x0 + w) × [y0, y0 + h) 를 만든다: 높이, 소품 번호(나무·바위), 블록 표시, 지표 종류, 걷는 꾸밈, 물
export function region(seed: number, p: GenParams, x0: number, y0: number, w: number, h: number, opts: GenOptions = {}): Region {
  const work = regionStart(seed, p, x0, y0, w, h, opts)
  regionRows(work, h)
  const { height, prop, block, kind, deco, water } = work
  return { x0, y0, w, h, height, prop, block, kind, deco, water }
}

// 나눠 만드는 영역. regionStart 가 높이·소품·블록까지 만들고, regionRows 가 지표 종류·꾸밈·물을 행 단위로 채운다(rows 는 채운 행 수)
export type RegionWork = Region & { seed: number; p: GenParams; lakes: Lake[]; rows: number }

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
      for (let y = c.y - 1; y <= c.y + c.h && ok; y++) for (let x = c.x - 1; x <= c.x + c.w; x++) if (wetOf(lakes, x, y)) { ok = false; break }
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
  return { x0, y0, w, h, height, prop, block, kind: new Uint8Array(w * h), deco: new Uint8Array(w * h), water: new Uint8Array(w * h), seed, p, lakes, rows: 0 }
}

// 지표 종류·꾸밈·물을 upTo 행까지 채운다
export function regionRows(work: RegionWork, upTo: number): void {
  const { seed, p, lakes, x0, y0, w, height, prop, block, kind, deco, water } = work
  for (let j = work.rows; j < Math.min(upTo, work.h); j++) {
    for (let i = 0; i < w; i++) {
      const o = j * w + i
      const x = x0 + i
      const y = y0 + j
      const wet = wetOf(lakes, x, y)
      if (wet) {
        water[o] = wet
        kind[o] = KIND_WATER
        deco[o] = waterDecoOf(seed, p, x, y, wet, lakes)
        continue
      }
      kind[o] = p.shore !== undefined && isShoreOf(lakes, x, y) ? p.shore : kindOf(seed, p, x, y, height[o]!, block[o] === 1)
      if (!block[o] && !prop[o]) deco[o] = decoOf(seed, p, x, y, kind[o]!)
    }
  }
  work.rows = Math.max(work.rows, Math.min(upTo, work.h))
}
