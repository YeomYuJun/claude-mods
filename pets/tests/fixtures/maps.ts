import Iso, { type Proj } from '../../hooks/iso'
import Pixel, { type Buffer } from '../../hooks/pixel'
import World, { type World as WorldState } from '../../hooks/world'

type Tile = { x: number; y: number }

// 테스트는 월드의 배열을 직접 만들거나 읽지 않는다. 합성 맵은 World.build 로 만들고, 칸은 질의 함수로 읽는다.
// 맵 전체 대신 시작 칸 둘레 고정 창을 훑어, 맵에 경계가 없어져도 같은 테스트가 돈다

// 모든 칸이 높이 0 인 w × h 맵. raise 는 [x, y, 높이], obstacles 는 나무처럼 못 지나는 칸 [x, y]
export function flatWorld(w: number, h: number, raise: ReadonlyArray<readonly [number, number, number]> = [], obstacles: ReadonlyArray<readonly [number, number]> = []): WorldState {
  const height = new Uint8Array(w * h)
  for (const [x, y, v] of raise) height[y * w + x] = v
  const obstacle = new Uint8Array(w * h)
  for (const [x, y] of obstacles) obstacle[y * w + x] = 1
  return World.build({ w, h, height, obstacle })
}

// 시작 칸 둘레 ±r 칸(행 우선)
export function tilesAround(world: WorldState, r = 24): Tile[] {
  const out: Tile[] = []
  const { x, y } = world.spawn
  for (let j = y - r; j <= y + r; j++) for (let i = x - r; i <= x + r; i++) out.push({ x: i, y: j })
  return out
}

// 시작 칸 둘레 ±r 칸이 모두 들어가는 버퍼에 지형을 그린다
export function drawAround(world: WorldState, proj: Proj, r = 24): { b: Buffer; view: { ox: number; oy: number } } {
  const maxZ = World.MAX_HEIGHT * proj.step
  const { x, y } = world.spawn
  const cols = 4 * r * proj.hw + 2 * proj.hw + 8
  const rows = Math.ceil((4 * r * proj.hh + 2 * proj.hh + maxZ + proj.base + 8) / 2)
  const b = Pixel.bufferOf(cols, rows, 1)
  Pixel.clear(b)
  const view = { ox: (x - y - 2 * r) * proj.hw - proj.hw - 4, oy: (x + y - 2 * r) * proj.hh - maxZ - 4 }
  Iso.drawWorld(b, world, view, proj)
  return { b, view }
}
