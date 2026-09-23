// 시드 하나로 높이 맵을 만든다(순수 모듈).
// 1. value noise 두 겹 + 가장자리 감쇠로 지형 높이 0~2 단
// 2. 이웃과 2 단 이상 차이 나는 지형 칸을 깎아 지형끼리는 늘 걸어 다닐 수 있게 한다
// 3. 작은 블록(1×1, 2×1)을 +1·+2 단으로 흩뿌린다. +1 은 뛰어오르고 +2 는 돌아간다
// 4. 걸을 수 있는 칸(이웃과 높이 차 ≤ 1)을 BFS 로 묶어 가장 큰 덩어리만 걷는 칸으로 둔다

import Names from '../names'
import Rng from '../rng'

export type World = {
  w: number
  h: number
  // 칸마다 높이(단)
  height: Uint8Array
  // 1 = 강아지가 서거나 지나갈 수 있는 칸(가장 큰 연결 덩어리)
  walk: Uint8Array
  // 1 = 블록(지형 위에 얹은 것)
  block: Uint8Array
  spawn: { x: number; y: number }
  seed: number
}

export const MAX_TERRAIN = 2
export const MAX_HEIGHT = 4
// 가장 큰 덩어리가 이 비율보다 작으면 다음 난수로 다시 만든다
const MIN_WALK_RATIO = 0.55
const TRIES = 8

export function inside(world: World, x: number, y: number): boolean {
  return x >= 0 && y >= 0 && x < world.w && y < world.h
}

export function heightAt(world: World, x: number, y: number): number {
  return inside(world, x, y) ? world.height[y * world.w + x]! : 0
}

export function isWalkable(world: World, x: number, y: number): boolean {
  return inside(world, x, y) && world.walk[y * world.w + x] === 1
}

export function canStep(world: World, x0: number, y0: number, x1: number, y1: number): boolean {
  return isWalkable(world, x1, y1) && Math.abs(heightAt(world, x1, y1) - heightAt(world, x0, y0)) <= 1
}

export const NEIGHBORS: ReadonlyArray<readonly [number, number]> = [[1, 0], [0, 1], [-1, 0], [0, -1]]

function smooth(t: number): number {
  return t * t * (3 - 2 * t)
}

// 격자점마다 난수를 두고 부드럽게 잇는다. spacing 칸마다 한 점
function valueNoise(rng: Rng.Rng, w: number, h: number, spacing: number): Float32Array {
  const gw = Math.ceil(w / spacing) + 2
  const gh = Math.ceil(h / spacing) + 2
  const grid = new Float32Array(gw * gh)
  for (let i = 0; i < grid.length; i++) grid[i] = Rng.next(rng)
  const out = new Float32Array(w * h)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const gx = x / spacing
      const gy = y / spacing
      const x0 = Math.floor(gx)
      const y0 = Math.floor(gy)
      const tx = smooth(gx - x0)
      const ty = smooth(gy - y0)
      const at = (i: number, j: number) => grid[j * gw + i]!
      const top = at(x0, y0) * (1 - tx) + at(x0 + 1, y0) * tx
      const bottom = at(x0, y0 + 1) * (1 - tx) + at(x0 + 1, y0 + 1) * tx
      out[y * w + x] = top * (1 - ty) + bottom * ty
    }
  }
  return out
}

function terrainOf(rng: Rng.Rng, w: number, h: number): Uint8Array {
  const coarse = valueNoise(rng, w, h, 7)
  const fine = valueNoise(rng, w, h, 3)
  const height = new Uint8Array(w * h)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x
      const edge = Math.min(x, y, w - 1 - x, h - 1 - y)
      const fall = smooth(Math.min(1, edge / 3))
      const n = ((coarse[i]! + fine[i]! * 0.45) / 1.45) * (0.25 + 0.75 * fall)
      height[i] = n < 0.36 ? 0 : n < 0.5 ? 1 : 2
    }
  }
  // 이웃보다 2 단 이상 높은 칸을 깎는다. 깎은 칸이 또 이웃을 만들 수 있어 바뀌지 않을 때까지
  for (let changed = true; changed;) {
    changed = false
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let low = height[y * w + x]!
        for (const [dx, dy] of NEIGHBORS) {
          const nx = x + dx
          const ny = y + dy
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue
          low = Math.min(low, height[ny * w + nx]! + 1)
        }
        if (low < height[y * w + x]!) { height[y * w + x] = low; changed = true }
      }
    }
  }
  return height
}

function scatterBlocks(rng: Rng.Rng, height: Uint8Array, block: Uint8Array, w: number, h: number): void {
  const count = Math.floor((w * h) / 45)
  for (let n = 0, tries = 0; n < count && tries < count * 20; tries++) {
    const long = Rng.chance(rng, 0.3)
    const across = Rng.chance(rng, 0.5)
    const bw = long && across ? 2 : 1
    const bh = long && !across ? 2 : 1
    const x = Rng.int(rng, 2, w - 3 - bw)
    const y = Rng.int(rng, 2, h - 3 - bh)
    // 블록끼리 붙어 벽이 되지 않게 한 칸씩 띄운다
    let free = true
    for (let j = y - 1; j <= y + bh && free; j++) for (let i = x - 1; i <= x + bw && free; i++) if (block[j * w + i]) free = false
    if (!free) continue
    let base = 0
    for (let j = y; j < y + bh; j++) for (let i = x; i < x + bw; i++) base = Math.max(base, height[j * w + i]!)
    const top = Math.min(MAX_HEIGHT, base + (Rng.chance(rng, 0.6) ? 1 : 2))
    for (let j = y; j < y + bh; j++) for (let i = x; i < x + bw; i++) { height[j * w + i] = top; block[j * w + i] = 1 }
    n++
  }
}

// 높이 차 ≤ 1 로 이어진 덩어리마다 번호를 매긴다. 돌려주는 값은 [번호 배열, 덩어리별 칸 수]
export function componentsOf(height: Uint8Array, w: number, h: number): [Int32Array, number[]] {
  const label = new Int32Array(w * h).fill(-1)
  const sizes: number[] = []
  const queue = new Int32Array(w * h)
  for (let start = 0; start < w * h; start++) {
    if (label[start] !== -1) continue
    const id = sizes.length
    let head = 0
    let tail = 0
    queue[tail++] = start
    label[start] = id
    while (head < tail) {
      const i = queue[head++]!
      const x = i % w
      const y = (i - x) / w
      for (const [dx, dy] of NEIGHBORS) {
        const nx = x + dx
        const ny = y + dy
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue
        const j = ny * w + nx
        if (label[j] !== -1 || Math.abs(height[j]! - height[i]!) > 1) continue
        label[j] = id
        queue[tail++] = j
      }
    }
    sizes.push(tail)
  }
  return [label, sizes]
}

function attempt(rng: Rng.Rng, seed: number): World {
  const w = Rng.int(rng, Names.MAP_MIN, Names.MAP_MAX)
  const h = Rng.int(rng, Names.MAP_MIN, Names.MAP_MAX)
  const height = terrainOf(rng, w, h)
  const block = new Uint8Array(w * h)
  scatterBlocks(rng, height, block, w, h)
  const [label, sizes] = componentsOf(height, w, h)
  let best = 0
  for (let i = 1; i < sizes.length; i++) if (sizes[i]! > sizes[best]!) best = i
  const walk = new Uint8Array(w * h)
  for (let i = 0; i < w * h; i++) walk[i] = label[i] === best ? 1 : 0
  // 가운데에서 가장 가까운 걷는 칸에서 시작한다
  let spawn = { x: 0, y: 0 }
  let near = Infinity
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!walk[y * w + x]) continue
      const d = Math.abs(x - w / 2) + Math.abs(y - h / 2)
      if (d < near) { near = d; spawn = { x, y } }
    }
  }
  return { w, h, height, walk, block, spawn, seed }
}

export function create(seed: number): World {
  const rng = Rng.create(seed)
  let world = attempt(rng, seed)
  for (let i = 1; i < TRIES; i++) {
    let count = 0
    for (const v of world.walk) count += v
    if (count >= world.w * world.h * MIN_WALK_RATIO) break
    world = attempt(rng, seed)
  }
  return world
}

// 걷는 칸 가운데 곁에 블록이나 높은 칸이 있는 곳(아늑한 곳). 잠잘 자리를 고를 때 쓴다
export function cozinessOf(world: World, x: number, y: number): number {
  let n = 0
  const here = heightAt(world, x, y)
  for (const [dx, dy] of NEIGHBORS) {
    const nx = x + dx
    const ny = y + dy
    if (!inside(world, nx, ny)) continue
    if (heightAt(world, nx, ny) > here) n++
  }
  return n
}

export * as default from '.'
