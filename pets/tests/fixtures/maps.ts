import Iso, { type Proj } from '../../hooks/iso'
import Pixel, { type Buffer } from '../../hooks/pixel'
import Prop from '../../hooks/prop'
import World, { type World as WorldState } from '../../hooks/world'

type Tile = { x: number; y: number }

// 테스트는 월드의 배열을 직접 만들거나 읽지 않는다. 합성 맵은 World.build 로 만들고, 칸은 질의 함수로 읽는다.
// 맵 전체 대신 시작 칸 둘레 고정 창을 훑어, 맵에 경계가 없어져도 같은 테스트가 돈다

// 모든 칸이 높이 0 인 w × h 맵. raise 는 [x, y, 높이], obstacles 는 나무처럼 못 지나는 칸 [x, y, 소품 번호(없으면 활엽수)]
export function flatWorld(w: number, h: number, raise: ReadonlyArray<readonly [number, number, number]> = [], obstacles: ReadonlyArray<readonly [number, number, number?]> = []): WorldState {
  const height = new Uint8Array(w * h)
  for (const [x, y, v] of raise) height[y * w + x] = v
  const obstacle = new Uint8Array(w * h)
  const prop = new Uint8Array(w * h)
  for (const [x, y, id] of obstacles) { obstacle[y * w + x] = 1; prop[y * w + x] = id ?? World.Gen.PROP_BROADLEAF }
  return World.build({ w, h, height, obstacle, prop })
}

// 칸 사각형(양 끝 포함)
export type Rect = { x0: number; y0: number; x1: number; y1: number }

function inRect(r: Rect | undefined, x: number, y: number): boolean {
  return r !== undefined && x >= r.x0 && x <= r.x1 && y >= r.y0 && y <= r.y1
}

// 높이 level 인 평평한 w × h 땅에 얕은 못(pond)을 판 맵. deep 은 못 안의 깊은 물(못 둘레 한 줄 이상은 얕게 남겨야 한다).
// 물가 땅이 수면 높이 level 이 되게 얕은 물 바닥은 level - 1, 깊은 물 바닥은 level - 2. walls 는 못 지나는 칸 [x, y](바위)
export function pondWorld(w: number, h: number, level: number, pond: Rect, deep?: Rect, walls: ReadonlyArray<readonly [number, number]> = []): WorldState {
  const height = new Uint8Array(w * h)
  const water = new Uint8Array(w * h)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x
      height[i] = level
      if (inRect(deep, x, y)) { water[i] = World.WATER_DEEP; height[i] = level - 2 } else if (inRect(pond, x, y)) { water[i] = World.WATER_SHALLOW; height[i] = level - 1 }
    }
  }
  const obstacle = new Uint8Array(w * h)
  const prop = new Uint8Array(w * h)
  for (const [x, y] of walls) { obstacle[y * w + x] = 1; prop[y * w + x] = World.Gen.PROP_ROCK }
  return World.build({ w, h, height, obstacle, prop, water })
}

// 시작 칸 둘레 ±r 칸(행 우선)
export function tilesAround(world: WorldState, r = 24): Tile[] {
  const out: Tile[] = []
  const { x, y } = world.spawn
  for (let j = y - r; j <= y + r; j++) for (let i = x - r; i <= x + r; i++) out.push({ x: i, y: j })
  return out
}

// 경계 없는 월드면 시작 칸 둘레 ±(r + 16) 칸에 걸친 청크를 만든다. 그리기는 없는 청크를 만들지 않으므로 그리기 전에 부른다
// (16 칸은 화면 위로 솟는 높이·소품과 버퍼 여유)
export function loadAround(world: WorldState, r = 24): void {
  const s = world.chunks
  if (!s) return
  const m = r + 16
  const { x, y } = world.spawn
  const C = World.Chunks
  // 만드는 청크가 캐시에서 밀려나지 않게 상한을 늘린다
  s.cap = Math.max(s.cap, s.chunks.size + (C.chunkOf(y + m) - C.chunkOf(y - m) + 1) * (C.chunkOf(x + m) - C.chunkOf(x - m) + 1))
  for (let cy = C.chunkOf(y - m); cy <= C.chunkOf(y + m); cy++) for (let cx = C.chunkOf(x - m); cx <= C.chunkOf(x + m); cx++) C.make(s, cx, cy)
}

// 시작 칸 둘레 ±r 칸이 모두 들어가는 버퍼에 지형과 소품을 그린다
export function drawAround(world: WorldState, proj: Proj, r = 24): { b: Buffer; view: { ox: number; oy: number } } {
  const maxZ = World.MAX_HEIGHT * proj.step
  const { x, y } = world.spawn
  const cols = 4 * r * proj.hw + 2 * proj.hw + 8
  const rows = Math.ceil((4 * r * proj.hh + 2 * proj.hh + maxZ + proj.base + 8) / 2)
  loadAround(world, r)
  const b = Pixel.bufferOf(cols, rows, 1)
  Pixel.clear(b)
  const view = { ox: (x - y - 2 * r) * proj.hw - proj.hw - 4, oy: (x + y - 2 * r) * proj.hh - maxZ - 4 }
  Iso.drawWorld(b, world, view, proj)
  Prop.drawProps(b, world, view, proj)
  return { b, view }
}
