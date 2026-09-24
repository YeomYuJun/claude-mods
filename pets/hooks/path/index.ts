// 걷는 칸 위의 길 찾기(순수 모듈). 이웃 4 방향, 이동 규칙(기본은 높이 차 ≤ 1)을 지키는 걸음만 간다.
// A* 는 단차를 오르내리는 걸음에 비용을 조금 더 매겨 되도록 평지로 돌아가게 한다.
// 탐색은 출발 칸 ±window 칸 상자(창) 안에서만 한다. 행동의 목적지는 12 걸음 안이고, 단차 비용을 넣은 최적 경로도
// 12 × 1.4 = 16.8 비용 안이라 16 걸음을 넘지 않는다. 그래서 창 ±16 이면 맵 전체를 찾은 것과 결과가 같다.

import World, { DEFAULT_RULES, type Rules, type World as WorldState } from '../world'

export type Tile = { x: number; y: number }

export const WINDOW = 16

// 출발 칸에서 창 안 칸까지의 걸음 수. dist 는 창(2r + 1 칸 정사각형)을 행 우선으로 편 것이고, 못 가는 칸은 -1
export type Reach = { from: Tile; r: number; dist: Int16Array }

// 창 크기마다 A* 버퍼를 한 번 만들어 재사용한다
type Buffers = { cost: Float32Array; prev: Int32Array; queue: Int32Array }
const buffers = new Map<number, Buffers>()

function buffersOf(r: number): Buffers {
  let b = buffers.get(r)
  if (!b) {
    const n = (2 * r + 1) * (2 * r + 1)
    b = { cost: new Float32Array(n), prev: new Int32Array(n), queue: new Int32Array(n) }
    buffers.set(r, b)
  }
  return b
}

class Heap {
  private items: number[] = []
  private keys: number[] = []

  get size(): number {
    return this.items.length
  }

  push(item: number, key: number): void {
    this.items.push(item)
    this.keys.push(key)
    let i = this.items.length - 1
    while (i > 0) {
      const p = (i - 1) >> 1
      if (this.keys[p]! <= this.keys[i]!) break
      this.swap(i, p)
      i = p
    }
  }

  pop(): number {
    const top = this.items[0]!
    const lastItem = this.items.pop()!
    const lastKey = this.keys.pop()!
    if (this.items.length > 0) {
      this.items[0] = lastItem
      this.keys[0] = lastKey
      let i = 0
      for (;;) {
        const l = i * 2 + 1
        const r = l + 1
        let m = i
        if (l < this.items.length && this.keys[l]! < this.keys[m]!) m = l
        if (r < this.items.length && this.keys[r]! < this.keys[m]!) m = r
        if (m === i) break
        this.swap(i, m)
        i = m
      }
    }
    return top
  }

  private swap(a: number, b: number): void {
    const t = this.items[a]!
    this.items[a] = this.items[b]!
    this.items[b] = t
    const k = this.keys[a]!
    this.keys[a] = this.keys[b]!
    this.keys[b] = k
  }
}

// from 에서 to 까지 지나갈 칸들(from 은 빼고 to 는 넣는다). 못 가거나 창 밖이면 null
export function find(world: WorldState, from: Tile, to: Tile, rules: Rules = DEFAULT_RULES, window: number = WINDOW): Tile[] | null {
  if (!World.isWalkable(world, to.x, to.y, rules)) return null
  if (from.x === to.x && from.y === to.y) return []
  if (Math.abs(to.x - from.x) > window || Math.abs(to.y - from.y) > window) return null
  const side = 2 * window + 1
  const x0 = from.x - window
  const y0 = from.y - window
  const { cost, prev } = buffersOf(window)
  cost.fill(Infinity)
  prev.fill(-1)
  const start = window * side + window
  const goal = (to.y - y0) * side + (to.x - x0)
  const open = new Heap()
  cost[start] = 0
  open.push(start, 0)
  while (open.size > 0) {
    const i = open.pop()
    if (i === goal) break
    const lx = i % side
    const ly = (i - lx) / side
    const x = lx + x0
    const y = ly + y0
    for (const [dx, dy] of World.NEIGHBORS) {
      const nlx = lx + dx
      const nly = ly + dy
      if (nlx < 0 || nly < 0 || nlx >= side || nly >= side) continue
      const nx = x + dx
      const ny = y + dy
      if (!World.canStep(world, x, y, nx, ny, rules)) continue
      const j = nly * side + nlx
      const c = cost[i]! + World.stepCost(world, x, y, nx, ny)
      if (c >= cost[j]!) continue
      cost[j] = c
      prev[j] = i
      open.push(j, c + Math.abs(nx - to.x) + Math.abs(ny - to.y))
    }
  }
  if (prev[goal] === -1) return null
  const out: Tile[] = []
  for (let i = goal; i !== start; i = prev[i]!) out.push({ x: (i % side) + x0, y: Math.floor(i / side) + y0 })
  return out.reverse()
}

// from 에서 maxSteps 걸음까지 BFS. maxSteps 걸음 경로는 ±maxSteps 상자 안이라 창을 그만큼 잡으면 맵 전체 BFS 와 같다
export function distancesFrom(world: WorldState, from: Tile, rules: Rules = DEFAULT_RULES, maxSteps: number = WINDOW): Reach {
  const r = maxSteps
  const side = 2 * r + 1
  const dist = new Int16Array(side * side).fill(-1)
  const reach = { from: { x: from.x, y: from.y }, r, dist }
  if (!World.isWalkable(world, from.x, from.y, rules)) return reach
  const { queue } = buffersOf(r)
  let head = 0
  let tail = 0
  const start = r * side + r
  queue[tail++] = start
  dist[start] = 0
  while (head < tail) {
    const i = queue[head++]!
    const d = dist[i]!
    if (d >= maxSteps) continue
    const lx = i % side
    const ly = (i - lx) / side
    const x = lx + from.x - r
    const y = ly + from.y - r
    for (const [dx, dy] of World.NEIGHBORS) {
      const nlx = lx + dx
      const nly = ly + dy
      if (nlx < 0 || nly < 0 || nlx >= side || nly >= side) continue
      const j = nly * side + nlx
      if (dist[j] !== -1 || !World.canStep(world, x, y, x + dx, y + dy, rules)) continue
      dist[j] = d + 1
      queue[tail++] = j
    }
  }
  return reach
}

// 칸 (x, y) 까지 걸음 수. 창 밖이거나 못 가면 -1
export function stepsAt(reach: Reach, x: number, y: number): number {
  const lx = x - reach.from.x + reach.r
  const ly = y - reach.from.y + reach.r
  const side = 2 * reach.r + 1
  if (lx < 0 || ly < 0 || lx >= side || ly >= side) return -1
  return reach.dist[ly * side + lx]!
}

// 걸음 수가 [lo, hi] 인 칸들(행 우선 순서). 없으면 hi 를 넘지 않는 가장 먼 칸들. reach 는 from 에서 잰 distancesFrom 결과(없으면 새로 잰다)
export function tilesWithin(world: WorldState, from: Tile, lo: number, hi: number, rules: Rules = DEFAULT_RULES, reach: Reach = distancesFrom(world, from, rules, Math.max(hi, 1))): Tile[] {
  const { dist, r } = reach
  const side = 2 * r + 1
  const out: Tile[] = []
  let far = 0
  for (const d of dist) if (d <= hi && d > far) far = d
  const min = Math.min(lo, far)
  for (let i = 0; i < dist.length; i++) {
    const d = dist[i]!
    if (d >= min && d <= hi && d > 0) out.push({ x: (i % side) + reach.from.x - r, y: Math.floor(i / side) + reach.from.y - r })
  }
  return out
}

export * as default from '.'
