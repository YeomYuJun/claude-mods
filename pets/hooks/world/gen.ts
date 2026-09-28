// 좌표 해시 생성기(순수 모듈). 모든 값은 (시드, x, y) 의 함수라, 영역을 잘라 따로 만들어도 한 번에 만든 것과 바이트가 같다.
//
// 1. 높이 노이즈: 도메인 워핑 + value noise 여러 겹을 hmin~hmax 단으로 나눈다
// 2. 포락선: h(p) = min_q(h0(q) + 맨해튼 거리). 이웃 칸끼리 높이 차 ≤ 1 이 된다.
//    높이가 [hmin, hmax] 안이면 거리가 hmax − hmin 이상인 칸은 최솟값이 될 수 없어,
//    영역 둘레에 여유 hmax − hmin − 1 칸만 붙여 계산해도 결과가 전역 계산과 같다
// 3. 장애물 후보: cell 칸 격자 셀마다 후보 하나(위치·종류·발자국·우선순위가 셀 해시).
//    우선순위가 더 높은 이웃 "후보"와 겹치거나 8-인접하면 버린다. 채택된 점이 아니라 후보와 비교하므로
//    결과가 반경 2 셀 안의 해시만으로 정해진다. 장애물 덩어리가 서로 8-인접하지 않고 구멍이 없어 걷는 칸이 끊기지 않는다
// 4. 블록 높이 = 발자국 높이 + 1 또는 + 2(발자국 높이가 모두 같을 때만 놓는다)
// 5. 지표 종류: 순서대로 첫 참. 블록, 눈(온도 노이즈 - 0.06 × 높이 < 눈 문턱, 높이 하한 이상), 돌(높이 문턱 이상),
//    얼룩(습도 노이즈 < 문턱 이고 잔무늬 노이즈 > 문턱), 나머지는 바탕 종류
// 6. 걷는 꾸밈(꽃·풀포기·버섯): 장애물·블록이 아닌 칸에 칸 해시로 둔다. 장애물이 아니라 걸음을 막지 않는다
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
  // 걷는 꾸밈 확률(칸당). 꽃·풀포기는 풀 칸에만, 버섯은 풀·낙엽 칸에
  flowerP?: number
  tuftP?: number
  mushroomP?: number
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

// 걷는 꾸밈(deco 배열 값). 0 은 없음
export const DECO_NONE = 0
export const DECO_FLOWER = 1
export const DECO_TUFT = 2
export const DECO_MUSHROOM = 3

export const MAX_HEIGHT = 8
export const CHUNK = 32
export const OBS_CELL = 3
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
}

export type Region = { x0: number; y0: number; w: number; h: number; height: Uint8Array; prop: Uint8Array; block: Uint8Array; kind: Uint8Array; deco: Uint8Array }

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

// 포락선이 기대는 반경: 이보다 먼 칸은 높이를 바꾸지 못한다
export function reachOf(p: GenParams): number {
  return Math.max(0, p.hmax - p.hmin - 1)
}

function clampTo(p: GenParams, v: number): number {
  return Math.max(p.hmin, Math.min(p.hmax, v))
}

// [x0, x0 + w) × [y0, y0 + h) 의 포락선 높이. 둘레 margin 칸을 더 계산해 버린다(기본은 반경 reachOf)
export function envelope(seed: number, p: GenParams, x0: number, y0: number, w: number, h: number, opts: GenOptions = {}, margin = reachOf(p)): Uint8Array {
  const rw = w + 2 * margin
  const rh = h + 2 * margin
  const rx0 = x0 - margin
  const ry0 = y0 - margin
  const raw = opts.raw
  const H = new Int16Array(rw * rh)
  for (let j = 0; j < rh; j++) for (let i = 0; i < rw; i++) H[j * rw + i] = clampTo(p, raw ? raw(rx0 + i, ry0 + j) : rawHeight(seed, p, rx0 + i, ry0 + j))
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

// 장애물·블록이 아닌 칸 하나의 걷는 꾸밈
export function decoOf(seed: number, p: GenParams, x: number, y: number, kind: number): number {
  const u = unit(hash(seed, x, y, 301))
  if (kind === KIND_GRASS) {
    const flower = p.flowerP ?? 0
    if (u < flower) return DECO_FLOWER
    if (u < flower + (p.tuftP ?? 0)) return DECO_TUFT
  }
  if ((kind === KIND_GRASS || kind === KIND_LITTER) && unit(hash(seed, x, y, 302)) < (p.mushroomP ?? 0)) return DECO_MUSHROOM
  return DECO_NONE
}

// 영역 [x0, x0 + w) × [y0, y0 + h) 를 만든다: 높이, 소품 번호(나무·바위), 블록 표시, 지표 종류, 걷는 꾸밈
export function region(seed: number, p: GenParams, x0: number, y0: number, w: number, h: number, opts: GenOptions = {}): Region {
  const cell = opts.cell ?? OBS_CELL
  const ring = opts.ring ?? true
  // 둘레 PAD 칸까지 정확한 높이
  const ew = w + 2 * PAD
  const ex0 = x0 - PAD
  const ey0 = y0 - PAD
  const H = envelope(seed, p, ex0, ey0, ew, h + 2 * PAD, opts)
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
  const kind = new Uint8Array(w * h)
  const deco = new Uint8Array(w * h)
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      const o = j * w + i
      kind[o] = kindOf(seed, p, x0 + i, y0 + j, height[o]!, block[o] === 1)
      if (!block[o] && !prop[o]) deco[o] = decoOf(seed, p, x0 + i, y0 + j, kind[o]!)
    }
  }
  return { x0, y0, w, h, height, prop, block, kind, deco }
}
