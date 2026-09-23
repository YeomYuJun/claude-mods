// 강아지 상태(순수 모듈). 이동(motion.ts), 행동 고르기(brain.ts), 그릴 모습(pose.ts)이 이 값을 나눠 쓴다.

import Rng from '../rng'
import type { Tile } from '../path'
import World, { type World as WorldState } from '../world'
import Names from '../names'
import * as Ball from './ball.js'
import type { Ball as BallState } from './ball.js'
import type { Emote, Particle } from './fx.js'

// 세계 축 방향. 화면에서 SE 는 오른쪽 아래, SW 는 왼쪽 아래, NW 는 왼쪽 위, NE 는 오른쪽 위
export type Dir = 'SE' | 'SW' | 'NW' | 'NE'

export const DIR_VEC: Record<Dir, readonly [number, number]> = { SE: [1, 0], SW: [0, 1], NW: [-1, 0], NE: [0, -1] }
export const DIRS: readonly Dir[] = ['SE', 'SW', 'NW', 'NE']

export function isRight(d: Dir): boolean {
  return d === 'SE' || d === 'NE'
}

export function isBack(d: Dir): boolean {
  return d === 'NE' || d === 'NW'
}

export function dirOf(dx: number, dy: number): Dir {
  if (Math.abs(dx) >= Math.abs(dy)) return dx >= 0 ? 'SE' : 'NW'
  return dy >= 0 ? 'SW' : 'NE'
}

export type Gait = 'walk' | 'trot' | 'run' | 'sniff'

// 멈춰서 하는 자세
export type PoseName =
  | 'stand' | 'look' | 'pant' | 'sniff' | 'dig' | 'bow' | 'shake' | 'scratch' | 'yawn' | 'stretch'
  | 'sit' | 'frontSit' | 'lie' | 'lieRest' | 'sleep' | 'wake'

export type Step =
  | { k: 'go'; to: Tile; gait: Gait }
  | { k: 'pose'; pose: PoseName; ms: number; face?: Dir; emote?: Emote['kind'] }
  | { k: 'spin'; quarters: number; msPer: number }
  | { k: 'pounce' }
  | { k: 'kick' }
  | { k: 'chase' }

export type ActName =
  | 'idle' | 'walk' | 'run' | 'sniff' | 'play' | 'sit' | 'lie'
  | 'greet' | 'dig' | 'settle' | 'bedtime'

// started: 시작 처리를 마친 단계 번호. i 와 다르면 그 단계를 막 시작한 것이다
export type Activity = { name: ActName; steps: Step[]; i: number; t: number; started: number }

export type Hop = { fx: number; fy: number; tx: number; ty: number; z0: number; z1: number; t: number; dur: number; peak: number; isPath: boolean }

export type Pet = {
  // 위치(타일 좌표, 칸 가운데가 정수)와 발 높이(px)
  x: number
  y: number
  z: number
  dir: Dir
  speed: number
  gait: Gait
  // 남은 경유 칸. 첫 칸이 지금 가는 곳
  path: Tile[]
  hop?: Hop
  // 뛰기 전 웅크림, 착지 뒤 눌림(ms)
  crouchMs: number
  landMs: number
  // 걸음 위상: 걸은 거리 ÷ 보폭. 발이 바닥에서 미끄러지지 않게 시간이 아니라 거리로 돈다
  stride: number
  // 좌우가 뒤집힐 때 정면 모습을 잠깐 보인다
  turnMs: number
  act: Activity
  // 이벤트가 만든 행동. 지금 이벤트 행동이 끝나면 차례로 한다
  queue: Activity[]
  last: ActName
  pose: PoseName
  // 0~1. 뛰고 놀면 줄고 쉬고 자면 찬다. 낮으면 앉고 눕는 쪽을 고른다
  energy: number
  // 0~1. 세션 신호가 오면 오르고 시간이 지나면 식는다. 높으면 뛰고 논다
  excite: number
  isAsleep: boolean
  // 꼬리·숨·깜빡임 시계(ms)
  tail: number
  breath: number
  blinkIn: number
  blinkMs: number
  emote?: Emote
  particles: Particle[]
  fxClock: number
  ball: BallState
  rng: Rng.Rng
  // 실제 시각(ms). 신호가 마지막으로 온 때, 흐름(스트리밍)이 이어지는 동안
  lastSignalAt: number
  busyUntil: number
  toolsRunning: number
  lastDigAt: number
}

function idleActivity(): Activity {
  return { name: 'idle', steps: [{ k: 'pose', pose: 'stand', ms: 1500 }], i: 0, t: 0, started: -1 }
}

export function create(world: WorldState, seed: number, now: number): Pet {
  const rng = Rng.create(seed ^ 0x9e3779b9)
  const { x, y } = world.spawn
  // 공은 시작 자리에서 몇 칸 떨어진 걷는 칸에 둔다
  let bx = x
  let by = y
  for (let i = 0; i < 60; i++) {
    const cx = x + Rng.int(rng, -5, 5)
    const cy = y + Rng.int(rng, -5, 5)
    if (World.isWalkable(world, cx, cy) && (cx !== x || cy !== y)) { bx = cx; by = cy; break }
  }
  return {
    x, y, z: World.heightAt(world, x, y) * Names.STEP_PX,
    dir: 'SE', speed: 0, gait: 'walk', path: [], crouchMs: 0, landMs: 0, stride: 0, turnMs: 0,
    act: idleActivity(), queue: [], last: 'idle', pose: 'stand',
    energy: 0.8, excite: 0.3, isAsleep: false,
    tail: 0, breath: 0, blinkIn: 2500, blinkMs: 0,
    particles: [], fxClock: 0,
    ball: Ball.create(bx, by, world),
    rng, lastSignalAt: now, busyUntil: 0, toolsRunning: 0, lastDigAt: -Infinity,
  }
}

export function tileOf(p: Pet): Tile {
  return { x: Math.round(p.x), y: Math.round(p.y) }
}

export function isMoving(p: Pet): boolean {
  return p.speed > 0.05 || p.hop !== undefined || p.crouchMs > 0
}
