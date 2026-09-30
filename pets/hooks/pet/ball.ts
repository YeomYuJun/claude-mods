// 놀이용 공: 걷어차이면 굴러가다 마찰로 멈춘다. 더 높은 칸, 맵 밖, 장애물 소품, 깊은 물에 부딪히면 튕기고,
// 낮은 칸으로는 떨어져 통통 튄다. 얕은 물에서는 수면 1 픽셀 아래에 떠서 마찰이 크다(순수 모듈).
// 높이는 걷는 높이(물이면 수면)로 비교해, 물에 뜬 공도 같은 높이의 물가로 굴러 나온다.
// 경사 칸에서는 바닥이 선 자리의 경사 윗면이고(World.surfaceZ), 내리막 쪽으로 SLOPE_ACCEL 로 가속해 굴러 내려간다.
// 경사 아래 끝은 늘 들어갈 수 있는 칸이라(world/slope.ts) 공은 경사 위에서 멈추지 않고 평지까지 내려가 멈춘다

import Names from '../names'
import World, { type World as WorldState } from '../world'

export type Ball = {
  x: number
  y: number
  z: number
  vx: number
  vy: number
  vz: number
  // 굴러간 거리. 공 무늬를 돌리는 데 쓴다
  roll: number
  // 땅에 멈춰 있다. 멈춘 공은 스텝을 건너뛴다(값이 바뀌지 않는다). 강아지가 멀리 가 공의 청크가 캐시에서 빠져도 공 때문에 청크를 다시 만들지 않는다
  settled?: boolean
}

// 굴러가는 마찰 감속(타일/s²), 튕길 때 남는 속도 비율, 중력(px/s²)
export const FRICTION = 2.4
export const WATER_FRICTION = 6
export const RESTITUTION = 0.55
export const GRAVITY = 260
// 경사 칸의 내리막 가속(타일/s²). 마찰보다 커야 멈춘 공이 굴러 내려간다: 한 칸 경사를 다 내려가면 √(2 × 2.4) = 2.2 타일/s
export const SLOPE_ACCEL = 4.8
// 굴러가다 바닥이 이만큼(픽셀) 이하로 낮아지면 떨어지지 않고 바닥에 붙는다. 경사를 내려가는 바닥과 경사 옆 변의 반 단(2 픽셀)이 여기에 든다
const STICK_PX = 2.5

// 실수 좌표 (x, y) 의 걷는 면 높이(px): 땅은 윗면(경사면 포함), 물은 수면
function levelOf(world: WorldState, x: number, y: number): number {
  const tx = Math.round(x)
  const ty = Math.round(y)
  return World.isWater(world, tx, ty) ? World.walkHeightAt(world, tx, ty) * Names.STEP_PX : World.surfaceZ(world, x, y)
}

// 공이 놓이는 높이(px): 땅은 윗면, 물은 수면 1 픽셀 아래
function floorOf(world: WorldState, x: number, y: number): number {
  return levelOf(world, x, y) - (World.isWater(world, Math.round(x), Math.round(y)) ? 1 : 0)
}

export function create(x: number, y: number, world: WorldState): Ball {
  return { x, y, z: floorOf(world, x, y), vx: 0, vy: 0, vz: 0, roll: 0 }
}

export function isRolling(b: Ball): boolean {
  return Math.hypot(b.vx, b.vy) > 0.05 || b.vz !== 0
}

export function tileOf(b: Ball): { x: number; y: number } {
  return { x: Math.round(b.x), y: Math.round(b.y) }
}

// 공이 (fx, fy) 로 들어갈 수 있는지: 그 칸이 맵 안이고, 나무 같은 장애물 소품·깊은 물이 아니고, 그 자리의 걷는 면이 지금 공 높이(물에 떠 있으면 수면)보다 높지 않다
function canEnter(world: WorldState, b: Ball, fx: number, fy: number): boolean {
  const x = Math.round(fx)
  const y = Math.round(fy)
  if (!World.inside(world, x, y) || World.isObstacle(world, x, y) || World.isDeep(world, x, y)) return false
  return levelOf(world, fx, fy) <= Math.max(b.z, levelOf(world, b.x, b.y)) + 0.5
}

export function kick(b: Ball, dirX: number, dirY: number, speed: number, side: number): void {
  b.vx = dirX * speed + dirY * side
  b.vy = dirY * speed + dirX * side
  b.vz = 40
  b.settled = false
}

export function step(b: Ball, world: WorldState, dtMs: number): void {
  if (b.settled && b.vx === 0 && b.vy === 0 && b.vz === 0) return
  const dt = dtMs / 1000
  const slope = World.slopeDirAt(world, Math.round(b.x), Math.round(b.y))
  const grounded = b.vz === 0 && b.z <= floorOf(world, b.x, b.y) + 0.01
  const onRamp = slope !== 0 && grounded
  const speed = Math.hypot(b.vx, b.vy)
  if (speed > 0) {
    const wet = World.isWater(world, Math.round(b.x), Math.round(b.y)) && b.vz === 0
    const slow = Math.max(0, speed - (wet ? WATER_FRICTION : FRICTION) * dt) / speed
    b.vx *= slow
    b.vy *= slow
    if (Math.hypot(b.vx, b.vy) < 0.05 && !onRamp) { b.vx = 0; b.vy = 0 }
  }
  // 경사에 닿아 있으면 내리막 쪽으로 가속한다(마찰 다음이라 멈춘 공도 움직이기 시작한다)
  if (onRamp) {
    const [dx, dy] = World.Slope.DIRS[slope - 1]!
    b.vx -= dx * SLOPE_ACCEL * dt
    b.vy -= dy * SLOPE_ACCEL * dt
  }
  const nx = b.x + b.vx * dt
  const ny = b.y + b.vy * dt
  if (Math.round(nx) !== Math.round(b.x) && !canEnter(world, b, nx, b.y)) b.vx = -b.vx * RESTITUTION
  else b.x = nx
  if (Math.round(ny) !== Math.round(b.y) && !canEnter(world, b, b.x, ny)) b.vy = -b.vy * RESTITUTION
  else b.y = ny
  b.roll += Math.hypot(b.vx, b.vy) * dt
  const ground = floorOf(world, b.x, b.y)
  // 경사를 오르면 바닥이 공보다 높아진다. 굴러가던 공은 조금 낮아진 바닥에 붙는다(경사를 내려가는 동안 떠서 튀지 않는다)
  if (b.z < ground) { b.z = ground; b.vz = Math.max(0, b.vz) }
  else if (grounded && b.z - ground <= STICK_PX) b.z = ground
  if (b.z > ground || b.vz !== 0) {
    b.vz -= GRAVITY * dt
    b.z += b.vz * dt
    if (b.z <= ground) {
      b.z = ground
      b.vz = Math.abs(b.vz) > 30 ? -b.vz * 0.4 : 0
    }
  }
  b.settled = b.vx === 0 && b.vy === 0 && b.vz === 0 && b.z === ground
}
