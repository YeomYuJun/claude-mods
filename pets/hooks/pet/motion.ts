// 경로 따라가기와 단차 뛰기(순수 모듈). 고정 스텝(약 16.7 ms)마다 한 번 부른다.
// - 속도는 가속·감속 한도 안에서 목표 속도로 다가간다. 끝 칸에 가까우면 v = √(2·감속·남은 거리) 로 줄여 미끄러지지 않고 선다
// - 꺾이는 칸은 가운데까지 가지 않고 조금 앞에서 다음 칸으로 넘어가 모서리를 둥글게 돈다(세 칸 높이가 같을 때만)
// - 걷는 높이가 다른 칸으로 넘어갈 때는 경계 앞에서 웅크렸다가(걷기만) 포물선으로 뛰고, 착지하면 잠깐 눌리고 먼지가 인다.
//   물 칸의 걷는 높이는 수면이라 물가에서 얕은 물로는 뛰지 않고 걸어 들어가며, 발은 수면 아래로 잠긴다(World.standZ).
//   헤엄치는 종은 얕은 물에서도 깊은 물처럼 떠서 헤엄치고(발이 수면 SWIM_PX 아래), 물에 들고 날 때 발 높이를 SINK_PX_S 로 옮긴다

import Names from '../names'
import Iso from '../iso'
import World, { type World as WorldState } from '../world'
import * as Fx from './fx.js'
import { dirOf, isRight, type Pet } from './state.js'


// 헤엄치는 종이 물에 들고 날 때 발 높이를 옮기는 빠르기(px/초)
const SINK_PX_S = 24

function groundOf(p: Pet, world: WorldState, x: number, y: number): number {
  const tx = Math.round(x)
  const ty = Math.round(y)
  if (p.species.abilities.swim && World.isWater(world, tx, ty)) return World.walkHeightAt(world, tx, ty) * Names.STEP_PX - World.SWIM_PX
  return World.standZ(world, tx, ty)
}

// 선 자리의 발 높이로 맞춘다. 헤엄치는 종이 물에 들고 날 때(높이 차가 SWIM_PX 이하)는 한 번에 옮기지 않는다
function settle(p: Pet, world: WorldState, dt: number): void {
  const z = groundOf(p, world, p.x, p.y)
  if (!p.species.abilities.swim || Math.abs(z - p.z) > World.SWIM_PX) { p.z = z; return }
  const k = SINK_PX_S * dt
  p.z = z > p.z ? Math.min(z, p.z + k) : Math.max(z, p.z - k)
}

function face(p: Pet, dx: number, dy: number): void {
  const next = dirOf(dx, dy)
  if (isRight(next) !== isRight(p.dir)) p.turnMs = p.species.motion.turnMs
  p.dir = next
}

export function faceTo(p: Pet, dx: number, dy: number): void {
  if (dx === 0 && dy === 0) return
  face(p, dx, dy)
}

function puff(p: Pet, count: number, spread: number): void {
  const s = Iso.screenOf(p.x, p.y, p.z)
  for (let i = 0; i < count; i++) {
    const side = i % 2 === 0 ? -1 : 1
    Fx.spawn(p.particles, { kind: 'dust', x: s.sx + side * (2 + (i >> 1) * 2), y: s.sy - 0.5, vx: side * spread * (0.6 + 0.2 * i), vy: -8 - 3 * i, g: 0, life: 380 + 40 * i })
  }
}

function startHop(p: Pet, world: WorldState, tx: number, ty: number, isPath: boolean): void {
  const z1 = groundOf(p, world, tx, ty)
  const up = z1 > p.z
  const dist = Math.hypot(tx - p.x, ty - p.y)
  const j = p.species.jump
  const v = Math.max(p.speed, j.minSpeed)
  // 한 단보다 높이 오르면(오르기 2 인 종) 두 단 호 높이
  const upPx = z1 - p.z > Names.STEP_PX && j.up2Px !== undefined ? j.up2Px : j.upPx
  p.hop = {
    fx: p.x, fy: p.y, tx, ty, z0: p.z, z1, t: 0,
    dur: Math.min(j.maxMs, Math.max(j.minMs, (dist / v) * 1000)),
    peak: (up ? upPx : j.downPx) + (p.gait === 'run' ? j.runBonusPx : 0),
    isPath,
  }
}

// 제자리에서 앞으로 한 칸(가능하면) 폴짝. 못 가면 제자리에서 솟는다
export function pounce(p: Pet, world: WorldState, dx: number, dy: number): void {
  const x0 = Math.round(p.x)
  const y0 = Math.round(p.y)
  const ok = World.canStep(world, x0, y0, x0 + dx, y0 + dy, p.species.abilities)
  const { peakPx, ms } = p.species.jump.pounce
  p.gait = 'trot'
  p.speed = 0
  p.hop = {
    fx: p.x, fy: p.y, tx: ok ? x0 + dx : p.x, ty: ok ? y0 + dy : p.y, z0: p.z,
    z1: ok ? groundOf(p, world, x0 + dx, y0 + dy) : p.z, t: 0, dur: ms, peak: peakPx, isPath: false,
  }
}

// 제자리에서 솟았다 내려온다(놀랐을 때)
export function hopInPlace(p: Pet, peakPx: number, ms: number): void {
  p.speed = 0
  p.hop = { fx: p.x, fy: p.y, tx: p.x, ty: p.y, z0: p.z, z1: p.z, t: 0, dur: ms, peak: peakPx, isPath: false }
}

// 한 스텝 움직이고, 헤엄치는 종이 물 칸에 있는지 다시 정한다
export function step(p: Pet, world: WorldState, dtMs: number): void {
  move(p, world, dtMs)
  p.swimming = p.species.abilities.swim && World.isWater(world, Math.round(p.x), Math.round(p.y))
}

function move(p: Pet, world: WorldState, dtMs: number): void {
  const dt = dtMs / 1000
  p.turnMs = Math.max(0, p.turnMs - dtMs)
  p.landMs = Math.max(0, p.landMs - dtMs)
  const m = p.species.motion
  if (p.hop) {
    const h = p.hop
    h.t += dtMs
    const u = Math.min(1, h.t / h.dur)
    p.x = h.fx + (h.tx - h.fx) * u
    p.y = h.fy + (h.ty - h.fy) * u
    p.z = h.z0 + (h.z1 - h.z0) * u + 4 * h.peak * u * (1 - u)
    p.stride += (dtMs / h.dur) * 0.5
    if (u >= 1) {
      p.z = h.z1
      p.hop = undefined
      p.landMs = m.landMs
      puff(p, 4, 14)
      if (h.isPath) p.path.shift()
    }
    return
  }
  if (p.crouchMs > 0) {
    p.crouchMs -= dtMs
    if (p.crouchMs <= 0) {
      const wp = p.path[0]
      if (wp) startHop(p, world, wp.x, wp.y, true)
    }
    return
  }
  const wp = p.path[0]
  if (!wp) {
    p.speed = 0
    settle(p, world, dt)
    return
  }
  const dx = wp.x - p.x
  const dy = wp.y - p.y
  const dist = Math.hypot(dx, dy)
  const here = World.walkHeightAt(world, Math.round(p.x), Math.round(p.y))
  const there = World.walkHeightAt(world, wp.x, wp.y)
  if (there !== here && dist <= m.hopAt) {
    faceTo(p, dx, dy)
    // 걷다가 오를 때는 멈칫 웅크리고, 뛰는 중에는 속도 그대로 뛰어오른다
    if (p.gait === 'run' || p.gait === 'trot') startHop(p, world, wp.x, wp.y, true)
    else { p.crouchMs = m.crouchMs; p.speed *= 0.4 }
    return
  }
  let remaining = dist
  let prev = wp
  for (let i = 1; i < p.path.length; i++) {
    const q = p.path[i]!
    remaining += Math.abs(q.x - prev.x) + Math.abs(q.y - prev.y)
    prev = q
  }
  // 물에서는 행동이 고른 걸음 대신 헤엄 걸음
  const g = (p.swimming ? p.species.gaits.swim : undefined) ?? p.species.gaits[p.gait]
  const target = Math.min(g.speed, Math.sqrt(2 * g.decel * remaining))
  if (p.speed < target) p.speed = Math.min(target, p.speed + g.accel * dt)
  else p.speed = Math.max(target, p.speed - g.decel * dt)
  p.speed = Math.max(p.speed, 0.35)
  const move = Math.min(dist, p.speed * dt)
  if (dist > 1e-6) {
    p.x += (dx / dist) * move
    p.y += (dy / dist) * move
    faceTo(p, dx, dy)
  }
  p.stride += move / g.stride
  settle(p, world, dt)
  if (p.gait === 'run' && m.runDustMs > 0) {
    p.fxClock += dtMs
    if (p.fxClock >= m.runDustMs) { p.fxClock = 0; puff(p, 1, 6) }
  }
  const next = p.path[1]
  const left = dist - move
  // 다음 구간이 지금 가는 축과 다른 축이면 꺾는 칸이다
  const isTurn = next !== undefined && (next.x !== wp.x) !== (Math.abs(dx) > Math.abs(dy))
  const flat = next !== undefined && World.walkHeightAt(world, next.x, next.y) === there && here === there
  if (left <= 1e-4 || (isTurn && flat && left < m.corner)) {
    p.path.shift()
    if (p.path.length === 0) { p.x = wp.x; p.y = wp.y; p.speed = 0 }
  }
}
