// 걷는 칸 위의 길 찾기(순수 모듈). 이웃 4 방향, 높이 차 ≤ 1.
// A* 는 단차를 오르내리는 걸음에 비용을 조금 더 매겨 되도록 평지로 돌아가게 한다.

import World, { type World as WorldState } from '../world'

export type Tile = { x: number; y: number }

// 단차 한 번의 추가 비용. 한 칸 돌아가는 것보다 싸다
const CLIMB_COST = 0.4

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

// from 에서 to 까지 지나갈 칸들(from 은 빼고 to 는 넣는다). 못 가면 null
export function find(world: WorldState, from: Tile, to: Tile): Tile[] | null {
  if (!World.isWalkable(world, to.x, to.y)) return null
  if (from.x === to.x && from.y === to.y) return []
  const w = world.w
  const n = w * world.h
  const cost = new Float32Array(n).fill(Infinity)
  const prev = new Int32Array(n).fill(-1)
  const start = from.y * w + from.x
  const goal = to.y * w + to.x
  const open = new Heap()
  cost[start] = 0
  open.push(start, 0)
  while (open.size > 0) {
    const i = open.pop()
    if (i === goal) break
    const x = i % w
    const y = (i - x) / w
    for (const [dx, dy] of World.NEIGHBORS) {
      const nx = x + dx
      const ny = y + dy
      if (!World.canStep(world, x, y, nx, ny)) continue
      const j = ny * w + nx
      const step = 1 + (world.height[j] !== world.height[i] ? CLIMB_COST : 0)
      const c = cost[i]! + step
      if (c >= cost[j]!) continue
      cost[j] = c
      prev[j] = i
      open.push(j, c + Math.abs(nx - to.x) + Math.abs(ny - to.y))
    }
  }
  if (prev[goal] === -1) return null
  const out: Tile[] = []
  for (let i = goal; i !== start; i = prev[i]!) out.push({ x: i % w, y: Math.floor(i / w) })
  return out.reverse()
}

// from 에서 걸음 수(BFS). 못 가는 칸은 -1
export function distancesFrom(world: WorldState, from: Tile): Int16Array {
  const w = world.w
  const dist = new Int16Array(w * world.h).fill(-1)
  if (!World.isWalkable(world, from.x, from.y)) return dist
  const queue = new Int32Array(w * world.h)
  let head = 0
  let tail = 0
  queue[tail++] = from.y * w + from.x
  dist[from.y * w + from.x] = 0
  while (head < tail) {
    const i = queue[head++]!
    const x = i % w
    const y = (i - x) / w
    for (const [dx, dy] of World.NEIGHBORS) {
      const nx = x + dx
      const ny = y + dy
      if (!World.canStep(world, x, y, nx, ny)) continue
      const j = ny * w + nx
      if (dist[j] !== -1) continue
      dist[j] = dist[i]! + 1
      queue[tail++] = j
    }
  }
  return dist
}

// 걸음 수가 [lo, hi] 인 칸들. 없으면 hi 를 넘지 않는 가장 먼 칸들
export function tilesWithin(world: WorldState, from: Tile, lo: number, hi: number): Tile[] {
  const dist = distancesFrom(world, from)
  const out: Tile[] = []
  let far = 0
  for (const d of dist) if (d <= hi && d > far) far = d
  const min = Math.min(lo, far)
  for (let i = 0; i < dist.length; i++) {
    const d = dist[i]!
    if (d >= min && d <= hi && d > 0) out.push({ x: i % world.w, y: Math.floor(i / world.w) })
  }
  return out
}

export * as default from '.'
