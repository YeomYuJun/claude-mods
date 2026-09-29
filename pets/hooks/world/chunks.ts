// 경계 없는 월드의 청크 저장소(순수 모듈). 32 × 32 칸 청크를 좌표 해시 생성기로 만들어 캐시에 둔다.
//
// 생성은 작은 일 단위로 나뉜다. 한 틱에 몇 단위만 하고 다음 틱에 이어 하며, 어느 순서로 나눠 해도 결과는 한 번에 만든 것과 바이트가 같다
// (모든 값이 좌표의 함수이고, 캐시는 같은 함수의 값을 담아 둘 뿐이다).
// 1. 포락선 전 높이(raw): 32 × 32 블록마다 캐시하고, 필요한 칸만 RAW_CELLS 칸씩 채운다(행마다 채운 칸 비트). 이웃 청크와 호수 수면 탐색이 같은 값을 나눠 쓴다
// 2. 호수 모양: 호수 셀마다 한 번(수면 전)
// 3. 호수 수면·깊은 물: 호수 셀마다 한 번. 수면 탐색 범위의 raw 가 다 채워진 뒤
// 4. 영역 시작: 청크 둘레 2 칸을 더한 36 × 36 영역의 높이·소품·블록(regionStart, raw·호수는 캐시에서)
// 5. 영역 행: 지표 종류·꾸밈·물을 ROWS_PER 행씩(regionRows)
// 6. 걷는 칸을 정하고 가운데 32 × 32 를 청크로 남긴다
//
// 걷는 칸은 맵 전체 BFS 대신 칸마다 정한다. 생성기가 장애물 덩어리를 서로 떨어뜨리고 구멍 없이 두므로(gen.ts 3) 장애물·깊은 물이 아닌
// 지형 칸과 얕은 물은 모두 한 덩어리로 이어진다. 블록 칸만 둘레의 걷는 칸과 걷는 높이 차 ≤ 1 일 때(블록이 2 칸이면 짝 칸을 거쳐도) 걷는 칸이다.

import { BLOCK, DEEP, OBSTACLE, WALK, WATER } from './flags.js'
import * as Gen from './gen.js'

export const SIZE = Gen.CHUNK
const SHIFT = 5
const MASK = SIZE - 1
// 조립 영역 둘레(블록 짝 칸의 이웃까지 보려면 2 칸)
const RIM = 2
const AREA = SIZE + 2 * RIM
// raw 한 단위가 채우는 칸 수(대략), 영역 행 한 단위가 채우는 행 수
const RAW_CELLS = 128
const ROWS_PER = 9

export type Chunk = { cx: number; cy: number; height: Uint8Array; flags: Uint8Array; prop: Uint8Array; kind: Uint8Array; deco: Uint8Array; maxHeight: number }

// mask[j] 의 비트 i: 칸 (i, j) 를 채웠다
type RawBlock = { v: Uint8Array; mask: Uint32Array }

// 일 단위의 무게(점, 엔진 테스트 하네스에서 잰 가운데 값 0.1 ms 를 1 점으로 잡았다). 한 틱에 BUDGET 점까지 한다
export const COST = { raw: 5, shape: 3, lake: 2, start: 8, rows: 4, flags: 3 } as const
export const BUDGET = 12

export type Store = {
  seed: number
  gen: Gen.GenParams
  props: boolean
  source?: (x: number, y: number) => number
  chunks: Map<number, Chunk>
  raw: Map<number, RawBlock>
  shapes: Map<number, Gen.LakeShape | null>
  lakes: Map<number, Gen.Lake | null>
  // 시작한 청크 영역(행을 다 채우면 청크가 된다)
  works: Map<number, Gen.RegionWork>
  opts: Gen.GenOptions
  // 청크 좌표 아래 2 비트씩으로 고르는 16 칸 바로 찾기 표(이웃 청크를 오가며 읽을 때 Map 을 찾지 않는다)
  slots: Array<Chunk | undefined>
  // 그리는 중: 없는 청크를 만들지 않고 빈 청크를 돌려준다
  peek: boolean
  // 캐시 기준: 이 청크에서 먼 것부터 버린다. keep 은 버리지 않을 청크 키(보이는 청크 + 한 겹)
  center: { cx: number; cy: number }
  keep: ReadonlySet<number>
  cap: number
  // 만든 청크 수, 그중 질의가 없는 청크에 닿아 그 자리에서 만든 수, 그리다 없는 청크를 만난 칸 수
  made: number
  syncMade: number
  // 마지막으로 그 자리에서 만든 청크(미리 만들기가 놓친 곳을 찾을 때 본다)
  lastSync?: [number, number]
  blank: number
  // 지금까지 만든 청크에서 가장 높은 칸
  maxHeight: number
}

// 캐시 상한의 바닥값. 실제 상한은 화면에 보이는 청크 + 한 겹과 이것 중 큰 값
export const CAP_MIN = 25

const EMPTY: Chunk = { cx: 0, cy: 0, height: new Uint8Array(SIZE * SIZE), flags: new Uint8Array(SIZE * SIZE), prop: new Uint8Array(SIZE * SIZE), kind: new Uint8Array(SIZE * SIZE), deco: new Uint8Array(SIZE * SIZE), maxHeight: 0 }

export function keyOf(cx: number, cy: number): number {
  return (cx & 0xffff) | (cy << 16)
}

export function chunkOf(v: number): number {
  return v >> SHIFT
}

export function idx(x: number, y: number): number {
  return ((y & MASK) << SHIFT) | (x & MASK)
}

// 시험용 바꿔 끼우기: source 는 포락선 전 높이 대신 쓸 함수, margin 은 포락선 여유(없으면 반경)
export type StoreOptions = { source?: (x: number, y: number) => number; margin?: number }

export function create(seed: number, gen: Gen.GenParams, props: boolean, test: StoreOptions = {}): Store {
  const store: Store = {
    seed, gen, props, source: test.source, slots: new Array(16).fill(undefined), chunks: new Map(), raw: new Map(), shapes: new Map(), lakes: new Map(), works: new Map(), opts: {},
    peek: false, center: { cx: 0, cy: 0 }, keep: new Set(), cap: CAP_MIN, made: 0, syncMade: 0, blank: 0, maxHeight: 0,
  }
  store.opts = { raw: (x, y) => rawAt(store, x, y), lakeCache: store.lakes, margin: test.margin }
  return store
}

// 포락선 전 높이. 아직 안 채운 칸이면 여기서 채운다
let lastRawKey = NaN
let lastRaw: RawBlock | undefined
let lastRawStore: Store | undefined

function blockOf(store: Store, bx: number, by: number): RawBlock {
  const key = keyOf(bx, by)
  if (lastRawStore === store && key === lastRawKey && lastRaw) return lastRaw
  let b = store.raw.get(key)
  if (!b) { b = { v: new Uint8Array(SIZE * SIZE), mask: new Uint32Array(SIZE) }; store.raw.set(key, b) }
  lastRawStore = store
  lastRawKey = key
  lastRaw = b
  return b
}

function fillCell(store: Store, b: RawBlock, bx: number, by: number, i: number, j: number): void {
  const x = (bx << SHIFT) + i
  const y = (by << SHIFT) + j
  b.v[(j << SHIFT) | i] = store.source ? store.source(x, y) : Gen.rawHeight(store.seed, store.gen, x, y)
  b.mask[j] = (b.mask[j]! | (1 << i)) >>> 0
}

export function rawAt(store: Store, x: number, y: number): number {
  const bx = x >> SHIFT
  const by = y >> SHIFT
  const b = blockOf(store, bx, by)
  const i = x & MASK
  const j = y & MASK
  if (((b.mask[j]! >>> i) & 1) === 0) fillCell(store, b, bx, by, i, j)
  return b.v[(j << SHIFT) | i]!
}

// 열 i0..i1 비트
function bitsOf(i0: number, i1: number): number {
  const n = i1 - i0 + 1
  return (n >= SIZE ? 0xffffffff : ((1 << n) - 1) << i0) >>> 0
}

type Box = { x0: number; y0: number; x1: number; y1: number }
export type Unit = { kind: keyof typeof COST; run: () => void }

// 상자 안 raw 중 아직 안 채운 칸이 있는 첫 블록의 칸을 RAW_CELLS 칸 안팎 채우는 일(블록 행 우선, 블록 안은 행 순)
function rawUnit(store: Store, box: Box): Unit | undefined {
  for (let by = box.y0 >> SHIFT; by <= box.y1 >> SHIFT; by++) {
    const j0 = by === box.y0 >> SHIFT ? box.y0 & MASK : 0
    const j1 = by === box.y1 >> SHIFT ? box.y1 & MASK : MASK
    for (let bx = box.x0 >> SHIFT; bx <= box.x1 >> SHIFT; bx++) {
      const i0 = bx === box.x0 >> SHIFT ? box.x0 & MASK : 0
      const i1 = bx === box.x1 >> SHIFT ? box.x1 & MASK : MASK
      const want = bitsOf(i0, i1)
      const b = blockOf(store, bx, by)
      let j = j0
      while (j <= j1 && ((b.mask[j]! & want) >>> 0) === want) j++
      if (j > j1) continue
      return {
        kind: 'raw',
        run: () => {
          let n = 0
          for (let r = j; r <= j1 && n < RAW_CELLS; r++) {
            for (let i = i0; i <= i1; i++) {
              if (((b.mask[r]! >>> i) & 1) !== 0) continue
              fillCell(store, b, bx, by, i, r)
              n++
            }
          }
        },
      }
    }
  }
  return undefined
}

// 청크 (cx, cy) 를 만드는 다음 일 단위. 이미 있으면 undefined
export function nextUnit(store: Store, cx: number, cy: number): Unit | undefined {
  if (store.chunks.has(keyOf(cx, cy))) return undefined
  const { seed, gen, opts } = store
  const m = opts.margin ?? Gen.reachOf(gen)
  // 조립 영역(둘레 RIM)에 region 이 붙이는 둘레 PAD 와 포락선 여유 m. 호수 찾기와 포락선이 읽는 범위가 같다
  const pad = RIM + Gen.PAD + m
  const x0 = cx << SHIFT
  const y0 = cy << SHIFT
  const box: Box = { x0: x0 - pad, y0: y0 - pad, x1: x0 + SIZE - 1 + pad, y1: y0 + SIZE - 1 + pad }
  if (gen.lake) {
    const g = Gen.lakeCellsIn(box.x0, box.y0, box.x1, box.y1)
    for (let gy = g.gy0; gy <= g.gy1; gy++) {
      for (let gx = g.gx0; gx <= g.gx1; gx++) {
        const key = Gen.lakeKeyOf(gx, gy)
        if (store.lakes.has(key)) continue
        const shape = store.shapes.get(key)
        if (shape === undefined) return { kind: 'shape', run: () => { store.shapes.set(key, Gen.lakeShapeOf(seed, gen, gx, gy, opts) ?? null) } }
        if (shape === null) { store.lakes.set(key, null); store.shapes.delete(key); continue }
        const r = rawUnit(store, shape.near)
        if (r) return r
        return { kind: 'lake', run: () => { store.lakes.set(key, Gen.lakeFinish(seed, gen, shape, opts) ?? null); store.shapes.delete(key) } }
      }
    }
  }
  const r = rawUnit(store, box)
  if (r) return r
  const key = keyOf(cx, cy)
  const work = store.works.get(key)
  if (!work) return { kind: 'start', run: () => { store.works.set(key, Gen.regionStart(seed, gen, x0 - RIM, y0 - RIM, AREA, AREA, opts)) } }
  if (work.rows < AREA) return { kind: 'rows', run: () => Gen.regionRows(work, work.rows + ROWS_PER) }
  return { kind: 'flags', run: () => { store.works.delete(key); insert(store, assemble(store, cx, cy, work)) } }
}

// 다 채운 36 × 36 영역에서 걷는 칸을 정해 가운데 32 × 32 를 청크로
function assemble(store: Store, cx: number, cy: number, r: Gen.Region): Chunk {
  const n = AREA * AREA
  const f = new Uint8Array(n)
  const walkH = new Uint8Array(n)
  for (let i = 0; i < n; i++) {
    if (r.block[i]) f[i]! |= BLOCK
    if (store.props && r.prop[i]) f[i]! |= OBSTACLE
    const wet = r.water[i]!
    if (wet) f[i]! |= wet === Gen.WATER_DEEP ? WATER | DEEP : WATER
    walkH[i] = r.height[i]! + wet
  }
  const closed = (i: number) => (f[i]! & (OBSTACLE | DEEP)) !== 0
  // 블록이 아닌 걷는 칸 이웃과 높이 차 ≤ 1 인 블록 칸
  const reaches = (i: number) => {
    const x = i % AREA
    const y = (i - x) / AREA
    for (const [dx, dy] of NEIGHBORS) {
      const nx = x + dx
      const ny = y + dy
      if (nx < 0 || ny < 0 || nx >= AREA || ny >= AREA) continue
      const j = ny * AREA + nx
      if (!closed(j) && !(f[j]! & BLOCK) && Math.abs(walkH[j]! - walkH[i]!) <= 1) return true
    }
    return false
  }
  const out: Chunk = { cx, cy, height: new Uint8Array(SIZE * SIZE), flags: new Uint8Array(SIZE * SIZE), prop: new Uint8Array(SIZE * SIZE), kind: new Uint8Array(SIZE * SIZE), deco: new Uint8Array(SIZE * SIZE), maxHeight: 0 }
  for (let j = 0; j < SIZE; j++) {
    for (let i = 0; i < SIZE; i++) {
      const a = (j + RIM) * AREA + i + RIM
      let fl = f[a]!
      if (!closed(a)) {
        if (!(fl & BLOCK)) fl |= WALK
        else if (reaches(a)) fl |= WALK
        else {
          // 2 칸 블록의 짝 칸을 거쳐 닿는지
          for (const [dx, dy] of NEIGHBORS) {
            const b = a + dy * AREA + dx
            if (f[b]! & BLOCK && !closed(b) && Math.abs(walkH[b]! - walkH[a]!) <= 1 && reaches(b)) { fl |= WALK; break }
          }
        }
      }
      const o = (j << SHIFT) | i
      out.height[o] = r.height[a]!
      out.flags[o] = fl
      out.prop[o] = store.props ? r.prop[a]! : 0
      out.kind[o] = r.kind[a]!
      out.deco[o] = r.deco[a]!
      out.maxHeight = Math.max(out.maxHeight, r.height[a]!)
    }
  }
  return out
}

const NEIGHBORS: ReadonlyArray<readonly [number, number]> = [[1, 0], [0, 1], [-1, 0], [0, -1]]

function distOf(store: Store, key: number): number {
  const cx = (key << 16) >> 16
  const cy = key >> 16
  return Math.max(Math.abs(cx - store.center.cx), Math.abs(cy - store.center.cy))
}

// 넣고, 상한을 넘으면 keep 밖에서 기준 청크와 가장 먼 것부터 버린다. 방금 넣은 청크는 버리지 않는다
// (keep 밖 칸을 질의해 만든 청크가 바로 버려지면 그 질의가 청크를 끝없이 다시 만든다)
function insert(store: Store, c: Chunk): void {
  const fresh = keyOf(c.cx, c.cy)
  store.chunks.set(fresh, c)
  store.made++
  store.maxHeight = Math.max(store.maxHeight, c.maxHeight)
  while (store.chunks.size > store.cap) {
    let worst: number | undefined
    let far = -1
    for (const key of store.chunks.keys()) {
      if (key === fresh || store.keep.has(key)) continue
      const d = distOf(store, key)
      if (d > far) { far = d; worst = key }
    }
    if (worst === undefined) break
    const gone = store.chunks.get(worst)!
    const slot = slotOf(gone.cx, gone.cy)
    if (store.slots[slot] === gone) store.slots[slot] = undefined
    store.chunks.delete(worst)
  }
  pruneCaches(store)
}

// raw 블록·호수 캐시는 기준 청크에서 keep 범위 + 3 청크 밖을 버린다
function pruneCaches(store: Store): void {
  let reach = 1
  for (const key of store.keep) reach = Math.max(reach, distOf(store, key))
  const lim = reach + 3
  for (const key of store.raw.keys()) if (distOf(store, key) > lim) store.raw.delete(key)
  for (const key of store.works.keys()) if (distOf(store, key) > lim) store.works.delete(key)
  if (lastRaw && !store.raw.has(lastRawKey)) lastRaw = undefined
  const cellLim = Math.ceil(((lim + 1) * SIZE) / Gen.LAKE_CELL) + 1
  const gcx = Math.floor((store.center.cx * SIZE) / Gen.LAKE_CELL)
  const gcy = Math.floor((store.center.cy * SIZE) / Gen.LAKE_CELL)
  for (const map of [store.lakes, store.shapes] as Array<Map<number, unknown>>) {
    for (const key of map.keys()) {
      const gx = (key << 16) >> 16
      const gy = key >> 16
      if (Math.max(Math.abs(gx - gcx), Math.abs(gy - gcy)) > cellLim) map.delete(key)
    }
  }
}

function slotOf(cx: number, cy: number): number {
  return ((cy & 3) << 2) | (cx & 3)
}

export function has(store: Store, cx: number, cy: number): boolean {
  const c = store.slots[slotOf(cx, cy)]
  return (c !== undefined && c.cx === cx && c.cy === cy) || store.chunks.has(keyOf(cx, cy))
}

// 캐시를 비운다(시험용: 청크를 모두 버렸다 다시 만들 때)
export function clear(store: Store): void {
  store.chunks.clear()
  store.slots.fill(undefined)
}

// 청크를 끝까지 만든다(첫 생성, 질의가 없는 청크에 닿았을 때)
export function make(store: Store, cx: number, cy: number): Chunk {
  for (let u = nextUnit(store, cx, cy); u; u = nextUnit(store, cx, cy)) u.run()
  return store.chunks.get(keyOf(cx, cy))!
}

// 칸 (x, y) 의 청크. 그리는 중이면 없는 청크를 빈 청크로, 아니면 그 자리에서 만든다(syncMade 로 센다)
export function at(store: Store, x: number, y: number): Chunk {
  const cx = x >> SHIFT
  const cy = y >> SHIFT
  const slot = slotOf(cx, cy)
  const hit = store.slots[slot]
  if (hit !== undefined && hit.cx === cx && hit.cy === cy) return hit
  let c = store.chunks.get(keyOf(cx, cy))
  if (!c) {
    if (store.peek) { store.blank++; return EMPTY }
    store.syncMade++
    store.lastSync = [cx, cy]
    c = make(store, cx, cy)
  }
  store.slots[slot] = c
  return c
}

// 한 틱의 미리 만들기: wanted(가까운 순 청크 좌표) 중 없는 첫 청크부터 BUDGET 점까지 일 단위를 한다. 한 일의 점 합을 돌려준다
export function pump(store: Store, wanted: ReadonlyArray<readonly [number, number]>, budget = BUDGET): number {
  let spent = 0
  for (const [cx, cy] of wanted) {
    while (spent < budget) {
      const u = nextUnit(store, cx, cy)
      if (!u) break
      u.run()
      spent += COST[u.kind]
    }
    if (spent >= budget) break
  }
  return spent
}
