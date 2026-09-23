// 놀이용 공: 걷어차이면 굴러가다 마찰로 멈춘다. 더 높은 칸이나 못 가는 칸에 부딪히면 튕기고,
// 낮은 칸으로는 떨어져 통통 튄다(순수 모듈).

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
}

// 굴러가는 마찰 감속(타일/s²), 튕길 때 남는 속도 비율, 중력(px/s²)
export const FRICTION = 2.4
export const RESTITUTION = 0.55
export const GRAVITY = 260

export function create(x: number, y: number, world: WorldState): Ball {
  return { x, y, z: World.heightAt(world, x, y) * Names.STEP_PX, vx: 0, vy: 0, vz: 0, roll: 0 }
}

export function isRolling(b: Ball): boolean {
  return Math.hypot(b.vx, b.vy) > 0.05 || b.vz !== 0
}

export function tileOf(b: Ball): { x: number; y: number } {
  return { x: Math.round(b.x), y: Math.round(b.y) }
}

// 공이 들어갈 수 있는 칸: 맵 안이고, 지금 높이보다 높지 않다
function canEnter(world: WorldState, x: number, y: number, z: number): boolean {
  if (!World.inside(world, x, y)) return false
  return World.heightAt(world, x, y) * Names.STEP_PX <= z + 0.5
}

export function kick(b: Ball, dirX: number, dirY: number, speed: number, side: number): void {
  b.vx = dirX * speed + dirY * side
  b.vy = dirY * speed + dirX * side
  b.vz = 40
}

export function step(b: Ball, world: WorldState, dtMs: number): void {
  const dt = dtMs / 1000
  const speed = Math.hypot(b.vx, b.vy)
  if (speed > 0) {
    const slow = Math.max(0, speed - FRICTION * dt) / speed
    b.vx *= slow
    b.vy *= slow
    if (Math.hypot(b.vx, b.vy) < 0.05) { b.vx = 0; b.vy = 0 }
  }
  const nx = b.x + b.vx * dt
  const ny = b.y + b.vy * dt
  if (Math.round(nx) !== Math.round(b.x) && !canEnter(world, Math.round(nx), Math.round(b.y), b.z)) b.vx = -b.vx * RESTITUTION
  else b.x = nx
  if (Math.round(ny) !== Math.round(b.y) && !canEnter(world, Math.round(b.x), Math.round(ny), b.z)) b.vy = -b.vy * RESTITUTION
  else b.y = ny
  b.roll += Math.hypot(b.vx, b.vy) * dt
  const ground = World.heightAt(world, Math.round(b.x), Math.round(b.y)) * Names.STEP_PX
  if (b.z > ground || b.vz !== 0) {
    b.vz -= GRAVITY * dt
    b.z += b.vz * dt
    if (b.z <= ground) {
      b.z = ground
      b.vz = Math.abs(b.vz) > 30 ? -b.vz * 0.4 : 0
    }
  }
}
