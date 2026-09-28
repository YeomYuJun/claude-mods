// 시드와 세트 생성 매개변수로 경계 있는 맵을 만들고, 칸 값을 묻는 함수를 둔다(순수 모듈).
// 1. 좌표 해시 생성기(gen.ts)로 높이·장애물(나무·바위·블록)·지표 종류·걷는 꾸밈·호수를 만든다. 맵 가장자리로 갈수록 지형이 낮아져 섬 모양이 된다
// 2. 나무·바위는 켤 때만 두고(패널의 맵은 켠다), 켜지 않으면 빈 땅으로 둔다(블록 자리는 켜든 끄든 같다)
// 3. 걸을 수 있는 칸(이웃과 걷는 높이 차 ≤ 1, 장애물 소품·깊은 물이 아닌 칸)을 BFS 로 묶어 가장 큰 덩어리만 걷는 칸으로 둔다.
//    걷는 높이는 땅이면 높이, 물이면 수면이다. 생성기가 장애물 덩어리를 서로 떨어뜨려 두므로 지형 칸과 얕은 물은 모두 이 덩어리에 들고,
//    빠지는 것은 오를 수 없는 블록과 깊은 물뿐이다
//
// 다른 모듈은 World 의 배열을 직접 읽지 않고 아래 질의 함수(heightAt, flagsAt, isWalkable, canStep 등)만 쓴다.
// 칸 플래그는 물리 사실(물, 깊은 물, 장애물 소품, 블록)만 담고, 종마다 다른 통과 여부는 이동 규칙(Rules)으로 계산한다.

import Names from '../names'
import * as Gen from './gen.js'

export { Gen }

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
  // 칸마다 장애물 소품 번호(Gen.PROP_*, 나무·바위). 0 은 없음
  prop: Uint8Array
  // 칸마다 지표 종류(Gen.KIND_*)와 걷는 꾸밈(Gen.DECO_*, 걸음을 막지 않는다)
  kind: Uint8Array
  deco: Uint8Array
  spawn: { x: number; y: number }
  seed: number
  // 맵에서 가장 높은 칸의 높이. 그릴 때 화면 밖 타일을 거르는 여유로 쓴다
  maxHeight: number
}

// 칸 좌표 범위(양 끝 포함)
export type Bounds = { x0: number; y0: number; x1: number; y1: number }

export const MAX_HEIGHT = Gen.MAX_HEIGHT
// 단차를 오르내리는 걸음의 추가 비용. 한 칸 돌아가는 것보다 싸다
export const CLIMB_COST = 0.4

export function inside(world: World, x: number, y: number): boolean {
  return x >= 0 && y >= 0 && x < world.w && y < world.h
}

export function bounds(world: World): Bounds {
  return { x0: 0, y0: 0, x1: world.w - 1, y1: world.h - 1 }
}

// 맵 전체의 가장 높은 칸 높이(단)
export function maxHeightOf(world: World): number {
  return world.maxHeight
}

export function heightAt(world: World, x: number, y: number): number {
  return inside(world, x, y) ? world.height[y * world.w + x]! : 0
}

export function flagsAt(world: World, x: number, y: number): number {
  return inside(world, x, y) ? world.flags[y * world.w + x]! : 0
}

export function propAt(world: World, x: number, y: number): number {
  return inside(world, x, y) ? world.prop[y * world.w + x]! : 0
}

export function kindAt(world: World, x: number, y: number): number {
  return inside(world, x, y) ? world.kind[y * world.w + x]! : 0
}

export function decoAt(world: World, x: number, y: number): number {
  return inside(world, x, y) ? world.deco[y * world.w + x]! : 0
}

// 걸을 때 발이 닿는 높이. 물 칸은 수면(바닥 + 1, 깊으면 + 2)
export function walkHeightAt(world: World, x: number, y: number): number {
  const f = flagsAt(world, x, y)
  const h = heightAt(world, x, y)
  return f & WATER ? h + 1 + (f & DEEP ? 1 : 0) : h
}

export function isWater(world: World, x: number, y: number): boolean {
  return (flagsAt(world, x, y) & WATER) !== 0
}

export function isDeep(world: World, x: number, y: number): boolean {
  return (flagsAt(world, x, y) & DEEP) !== 0
}

// 칸의 겉: 땅, 얕은 물(걷는다), 깊은 물(헤엄치는 종만), 블록, 막힘(맵 밖·나무·바위)
export type Surface = 'ground' | 'shallow' | 'deep' | 'block' | 'blocked'

export function surfaceAt(world: World, x: number, y: number): Surface {
  if (!inside(world, x, y)) return 'blocked'
  const f = flagsAt(world, x, y)
  if (f & OBSTACLE) return 'blocked'
  if (f & WATER) return f & DEEP ? 'deep' : 'shallow'
  return f & BLOCK ? 'block' : 'ground'
}

// 얕은 물에 선 동물은 다리 아래가, 깊은 물에서 헤엄치는 동물은 몸 아래가 수면에 잠긴다(1 배 픽셀)
export const WADE_PX = 3
export const SWIM_PX = 6

// 칸 가운데에 선 발의 높이(1 배 픽셀): 땅은 높이 × 한 단, 물은 수면에서 잠기는 만큼 아래
export function standZ(world: World, x: number, y: number): number {
  const f = flagsAt(world, x, y)
  const z = walkHeightAt(world, x, y) * Names.STEP_PX
  return f & WATER ? z - (f & DEEP ? SWIM_PX : WADE_PX) : z
}

// 물가: 물이 아닌 걷는 칸 중 4 방향 이웃에 물이 있는 칸과 그 물 쪽 방향(이웃 순서 NEIGHBORS 의 첫 물).
// from 둘레 ±r 칸 상자를 행 우선으로 훑는다
export type WaterEdge = { x: number; y: number; dx: number; dy: number }

export function waterEdgesWithin(world: World, from: { x: number; y: number }, r: number, rules: Rules = DEFAULT_RULES): WaterEdge[] {
  const out: WaterEdge[] = []
  for (let y = from.y - r; y <= from.y + r; y++) {
    for (let x = from.x - r; x <= from.x + r; x++) {
      if (isWater(world, x, y) || !isWalkable(world, x, y, rules)) continue
      for (const [dx, dy] of NEIGHBORS) {
        if (isWater(world, x + dx, y + dy)) { out.push({ x, y, dx, dy }); break }
      }
    }
  }
  return out
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

// 한 걸음의 경로 비용: 1, 단차가 있으면 CLIMB_COST, 얕은 물로 들어가면 WADE_COST, 깊은 물(헤엄)이면 SWIM_COST 를 더한다
export const WADE_COST = 0.5
export const SWIM_COST = 2

export function stepCost(world: World, x0: number, y0: number, x1: number, y1: number): number {
  const f = flagsAt(world, x1, y1)
  const wet = f & WATER ? (f & DEEP ? SWIM_COST : WADE_COST) : 0
  return 1 + (walkHeightAt(world, x1, y1) !== walkHeightAt(world, x0, y0) ? CLIMB_COST : 0) + wet
}

export const NEIGHBORS: ReadonlyArray<readonly [number, number]> = [[1, 0], [0, 1], [-1, 0], [0, -1]]

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

// 높이와 블록·장애물·물 표시로 월드를 만든다. 걷는 칸은 가장 큰 덩어리(깊은 물은 빼고 수면 높이로 이웃을 잇는다),
// 시작 칸은 가운데에서 가장 가까운 걷는 칸(물이 아닌 칸이 있으면 그중에서).
// water: 칸마다 0 땅, WATER_SHALLOW 얕은 물, WATER_DEEP 깊은 물. 물 칸의 height 는 바닥 높이다
export const WATER_SHALLOW = Gen.WATER_SHALLOW
export const WATER_DEEP = Gen.WATER_DEEP
export type Spec = { w: number; h: number; height: Uint8Array; block?: Uint8Array; obstacle?: Uint8Array; prop?: Uint8Array; kind?: Uint8Array; deco?: Uint8Array; water?: Uint8Array; seed?: number }

export function build(spec: Spec): World {
  const { w, h, height } = spec
  const flags = new Uint8Array(w * h)
  const walkH = new Uint8Array(w * h)
  const closed = new Uint8Array(w * h)
  for (let i = 0; i < w * h; i++) {
    if (spec.block?.[i]) flags[i]! |= BLOCK
    if (spec.obstacle?.[i]) { flags[i]! |= OBSTACLE; closed[i] = 1 }
    const wet = spec.water?.[i] ?? 0
    if (wet) flags[i]! |= wet === WATER_DEEP ? WATER | DEEP : WATER
    if (wet === WATER_DEEP) closed[i] = 1
    walkH[i] = height[i]! + (wet ? wet : 0)
  }
  const [label, sizes] = componentsOf(walkH, w, h, closed)
  let best = 0
  for (let i = 1; i < sizes.length; i++) if (sizes[i]! > sizes[best]!) best = i
  if (sizes.length > 0) for (let i = 0; i < w * h; i++) if (label[i] === best) flags[i]! |= WALK
  let spawn = { x: 0, y: 0 }
  let near = Infinity
  for (const dry of [true, false]) {
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const f = flags[y * w + x]!
        if (!(f & WALK) || (dry && f & WATER)) continue
        const d = Math.abs(x - w / 2) + Math.abs(y - h / 2)
        if (d < near) { near = d; spawn = { x, y } }
      }
    }
    if (near < Infinity) break
  }
  let maxHeight = 0
  for (let i = 0; i < w * h; i++) maxHeight = Math.max(maxHeight, height[i]!)
  return { w, h, height, flags, prop: spec.prop ?? new Uint8Array(w * h), kind: spec.kind ?? new Uint8Array(w * h), deco: spec.deco ?? new Uint8Array(w * h), spawn, seed: spec.seed ?? 0, maxHeight }
}

// 모눈종이 기본 세트의 생성 매개변수: 지형 0~2 단, 블록 +1·+2(최대 4 단), 나무는 드물게
export const PAPER_GEN: Gen.GenParams = {
  spacing: [7, 3], amp: [1, 0.45], warp: 0, warpSpacing: 16, gain: 1, bias: 0.05, hmin: 0, hmax: 2,
  obsP: 0.16, treeW: 1, rockW: 0, blockW: 2, tree: Gen.PROP_PAPER_TREE,
}

// size: 한 변 칸 수. 없으면 시드로 MAP_MIN~MAP_MAX 에서 가로·세로를 따로 고른다.
// props: 나무·바위를 둘지(패널의 맵은 켠다. 합성·행동 테스트 맵은 기본값 끔)
export type CreateOptions = { size?: number; props?: boolean }

export function create(seed: number, gen: Gen.GenParams = PAPER_GEN, opts: CreateOptions = {}): World {
  const span = Names.MAP_MAX - Names.MAP_MIN + 1
  const w = opts.size ?? Names.MAP_MIN + (Gen.hash(seed, 0, 0, 1) % span)
  const h = opts.size ?? Names.MAP_MIN + (Gen.hash(seed, 0, 0, 2) % span)
  // 맵 밖은 가장 낮게, 안쪽은 가장자리에서 한 칸마다 한 단까지만 오른다
  const raw = (x: number, y: number) => {
    const edge = Math.min(x, y, w - 1 - x, h - 1 - y)
    return edge < 0 ? gen.hmin : Math.min(Gen.rawHeight(seed, gen, x, y), gen.hmin + edge)
  }
  const r = Gen.region(seed, gen, 0, 0, w, h, { raw, inside: { x0: 0, y0: 0, x1: w - 1, y1: h - 1 } })
  const obstacle = new Uint8Array(w * h)
  const prop = new Uint8Array(w * h)
  if (opts.props) for (let i = 0; i < w * h; i++) if (r.prop[i]) { obstacle[i] = 1; prop[i] = r.prop[i]! }
  return build({ w, h, height: r.height, block: r.block, obstacle, prop, kind: r.kind, deco: r.deco, water: r.water, seed })
}

// 칸 (x, y) 앞쪽(화면 아래) reach 대각선 안, 좌우로 한 칸 폭 안에 나무가 있는지.
// 대각선 d 앞의 칸은 d × (반높이) 픽셀 아래에 서므로, 나무 키가 그만큼보다 크면 그 칸에 누운 동물을 가린다
export function hasTreeInFront(world: World, x: number, y: number, reach: number): boolean {
  for (let d = 1; d <= reach; d++) {
    for (let e = -1; e <= 1; e++) {
      if (((d + e) & 1) !== 0) continue
      if (Gen.isTree(propAt(world, x + (d + e) / 2, y + (d - e) / 2))) return true
    }
  }
  return false
}

// 화면에서 뒤쪽인 두 이웃(NW = x - 1, NE = y - 1)
const BACK: ReadonlyArray<readonly [number, number]> = [[-1, 0], [0, -1]]

// 뒤쪽에 블록이나 높은 칸을 등진 곳(아늑한 곳). 잠잘 자리를 고를 때 쓴다.
// 앞쪽 이웃은 세지 않는다. 앞이 높은 칸은 화면에서 그 칸이 강아지를 가려서다
export function cozinessOf(world: World, x: number, y: number): number {
  let n = 0
  const here = heightAt(world, x, y)
  for (const [dx, dy] of BACK) {
    const nx = x + dx
    const ny = y + dy
    if (!inside(world, nx, ny)) continue
    if (heightAt(world, nx, ny) > here) n++
  }
  return n
}

export * as default from '.'
