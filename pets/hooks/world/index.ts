// 시드 하나로 높이 맵을 만들고, 칸 값을 묻는 함수를 둔다(순수 모듈).
// 1. value noise 두 겹 + 가장자리 감쇠로 지형 높이 0~2 단
// 2. 이웃과 2 단 이상 차이 나는 지형 칸을 깎아 지형끼리는 늘 걸어 다닐 수 있게 한다
// 3. 작은 블록(1×1, 2×1)을 +1·+2 단으로 흩뿌린다. +1 은 뛰어오르고 +2 는 돌아간다
// 4. 걸을 수 있는 칸(이웃과 높이 차 ≤ 1, 장애물 소품이 아닌 칸)을 BFS 로 묶어 가장 큰 덩어리만 걷는 칸으로 둔다
//
// 다른 모듈은 World 의 배열을 직접 읽지 않고 아래 질의 함수(heightAt, flagsAt, isWalkable, canStep 등)만 쓴다.
// 칸 플래그는 물리 사실(물, 깊은 물, 장애물 소품, 블록)만 담고, 종마다 다른 통과 여부는 이동 규칙(Rules)으로 계산한다.

import Names from '../names'
import Rng from '../rng'

// 칸 플래그. WALK 는 기본 이동 규칙으로 계산해 둔 값이다
export const WALK = 1
export const WATER = 2
export const DEEP = 4
// 나무·바위처럼 어느 종도 들어가지 못하고 공도 튕겨 나오는 소품
export const OBSTACLE = 8
export const BLOCK = 16

// 이동 규칙: 한 걸음에 오르내릴 수 있는 단 수, 깊은 물을 건널 수 있는지
export type Rules = { climb: number; swim: boolean }
export const DEFAULT_RULES: Rules = { climb: 1, swim: false }

export type World = {
  w: number
  h: number
  // 칸마다 높이(단)와 플래그
  height: Uint8Array
  flags: Uint8Array
  spawn: { x: number; y: number }
  seed: number
}

// 칸 좌표 범위(양 끝 포함)
export type Bounds = { x0: number; y0: number; x1: number; y1: number }

export const MAX_TERRAIN = 2
export const MAX_HEIGHT = 4
// 가장 큰 덩어리가 이 비율보다 작으면 다음 난수로 다시 만든다
const MIN_WALK_RATIO = 0.55
const TRIES = 8
// 단차를 오르내리는 걸음의 추가 비용. 한 칸 돌아가는 것보다 싸다
export const CLIMB_COST = 0.4

export function inside(world: World, x: number, y: number): boolean {
  return x >= 0 && y >= 0 && x < world.w && y < world.h
}

export function bounds(world: World): Bounds {
  return { x0: 0, y0: 0, x1: world.w - 1, y1: world.h - 1 }
}

export function heightAt(world: World, x: number, y: number): number {
  return inside(world, x, y) ? world.height[y * world.w + x]! : 0
}

export function flagsAt(world: World, x: number, y: number): number {
  return inside(world, x, y) ? world.flags[y * world.w + x]! : 0
}

// 걸을 때 발이 닿는 높이. 물 칸은 수면(바닥 + 1, 깊으면 + 2)
export function walkHeightAt(world: World, x: number, y: number): number {
  const f = flagsAt(world, x, y)
  const h = heightAt(world, x, y)
  return f & WATER ? h + 1 + (f & DEEP ? 1 : 0) : h
}

export function isBlock(world: World, x: number, y: number): boolean {
  return (flagsAt(world, x, y) & BLOCK) !== 0
}

export function isObstacle(world: World, x: number, y: number): boolean {
  return (flagsAt(world, x, y) & OBSTACLE) !== 0
}

// 규칙과 상관없이 칸 자체가 들어갈 수 있는 곳인지: 맵 안, 장애물 소품이 아니고, 깊은 물이면 헤엄칠 수 있을 때
export function passable(world: World, x: number, y: number, rules: Rules = DEFAULT_RULES): boolean {
  if (!inside(world, x, y)) return false
  const f = flagsAt(world, x, y)
  return (f & OBSTACLE) === 0 && ((f & DEEP) === 0 || rules.swim)
}

function isDefault(rules: Rules): boolean {
  return rules.climb === DEFAULT_RULES.climb && rules.swim === DEFAULT_RULES.swim
}

// 기본 규칙이면 가장 큰 덩어리(WALK), 다른 규칙이면 들어갈 수 있는 칸 전부
export function isWalkable(world: World, x: number, y: number, rules: Rules = DEFAULT_RULES): boolean {
  if (isDefault(rules)) return (flagsAt(world, x, y) & WALK) !== 0
  return passable(world, x, y, rules)
}

export function canStep(world: World, x0: number, y0: number, x1: number, y1: number, rules: Rules = DEFAULT_RULES): boolean {
  return isWalkable(world, x1, y1, rules) && Math.abs(walkHeightAt(world, x1, y1) - walkHeightAt(world, x0, y0)) <= rules.climb
}

// 한 걸음의 경로 비용: 1, 단차가 있으면 CLIMB_COST 를 더한다
export function stepCost(world: World, x0: number, y0: number, x1: number, y1: number): number {
  return 1 + (walkHeightAt(world, x1, y1) !== walkHeightAt(world, x0, y0) ? CLIMB_COST : 0)
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

// 높이 차 ≤ 1 로 이어진 덩어리마다 번호를 매긴다. 장애물 칸(obstacle[i] = 1)은 어느 덩어리에도 넣지 않고 -1 로 둔다.
// 돌려주는 값은 [번호 배열, 덩어리별 칸 수]
export function componentsOf(height: Uint8Array, w: number, h: number, obstacle?: Uint8Array): [Int32Array, number[]] {
  const label = new Int32Array(w * h).fill(-1)
  const sizes: number[] = []
  const queue = new Int32Array(w * h)
  const isOpen = (i: number) => !obstacle || obstacle[i] !== 1
  for (let start = 0; start < w * h; start++) {
    if (label[start] !== -1 || !isOpen(start)) continue
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
        if (label[j] !== -1 || !isOpen(j) || Math.abs(height[j]! - height[i]!) > 1) continue
        label[j] = id
        queue[tail++] = j
      }
    }
    sizes.push(tail)
  }
  return [label, sizes]
}

// 높이와 블록·장애물 표시로 월드를 만든다. 걷는 칸은 가장 큰 덩어리, 시작 칸은 가운데에서 가장 가까운 걷는 칸
export type Spec = { w: number; h: number; height: Uint8Array; block?: Uint8Array; obstacle?: Uint8Array; seed?: number }

export function build(spec: Spec): World {
  const { w, h, height } = spec
  const flags = new Uint8Array(w * h)
  for (let i = 0; i < w * h; i++) {
    if (spec.block?.[i]) flags[i]! |= BLOCK
    if (spec.obstacle?.[i]) flags[i]! |= OBSTACLE
  }
  const [label, sizes] = componentsOf(height, w, h, spec.obstacle)
  let best = 0
  for (let i = 1; i < sizes.length; i++) if (sizes[i]! > sizes[best]!) best = i
  if (sizes.length > 0) for (let i = 0; i < w * h; i++) if (label[i] === best) flags[i]! |= WALK
  let spawn = { x: 0, y: 0 }
  let near = Infinity
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!(flags[y * w + x]! & WALK)) continue
      const d = Math.abs(x - w / 2) + Math.abs(y - h / 2)
      if (d < near) { near = d; spawn = { x, y } }
    }
  }
  return { w, h, height, flags, spawn, seed: spec.seed ?? 0 }
}

function attempt(rng: Rng.Rng, seed: number): World {
  const w = Rng.int(rng, Names.MAP_MIN, Names.MAP_MAX)
  const h = Rng.int(rng, Names.MAP_MIN, Names.MAP_MAX)
  const height = terrainOf(rng, w, h)
  const block = new Uint8Array(w * h)
  scatterBlocks(rng, height, block, w, h)
  return build({ w, h, height, block, seed })
}

function walkCount(world: World): number {
  let n = 0
  for (const f of world.flags) if (f & WALK) n++
  return n
}

export function create(seed: number): World {
  const rng = Rng.create(seed)
  let world = attempt(rng, seed)
  for (let i = 1; i < TRIES; i++) {
    if (walkCount(world) >= world.w * world.h * MIN_WALK_RATIO) break
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
