// 강아지 상태(순수 모듈). 이동(motion.ts), 행동 고르기(brain.ts), 그릴 모습(pose.ts)이 이 값을 나눠 쓴다.

import Rng from '../rng'
import type { Reach, Tile } from '../path'
import World, { type World as WorldState } from '../world'
import Names from '../names'
import Species, { type SpeciesDef } from '../species'
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

// go: to 가 있으면 그 칸, pick 이 있으면 단계를 시작할 때 지금 자리에서 걸음 수 [lo, hi] 인 칸을 고른다(front 면 화면 앞쪽 칸).
// must 면 길이 없을 때 행동 전체를 그만둔다(목적지가 핵심인 행동). 아니면 그 단계만 건너뛴다
export type Step =
  | { k: 'go'; to?: Tile; pick?: { lo: number; hi: number; front?: boolean }; gait: Gait; must?: boolean }
  | { k: 'pose'; pose: PoseName; ms: number; face?: Dir; emote?: Emote['kind'] }
  | { k: 'spin'; quarters: number; msPer: number }
  | { k: 'pounce' }
  | { k: 'kick' }
  | { k: 'chase' }
  // 공을 입에 문다(가까이 있을 때), 내려놓는다
  | { k: 'grab' }
  | { k: 'drop' }

export type ActName =
  | 'idle' | 'walk' | 'run' | 'sniff' | 'play' | 'sit' | 'lie'
  | 'explore' | 'patrol' | 'perch' | 'rollOver' | 'watch' | 'nap'
  | 'greet' | 'dig' | 'settle' | 'bedtime'

// 놀이 변형
export type PlayName = 'ball' | 'fetch' | 'spin' | 'pounce' | 'stalk' | 'chaseTail' | 'zoomies'

// 욕구 0~1. 쉬고 싶은 정도는 1 - energy 로 따로 계산한다
export type Needs = { curiosity: number; play: number; social: number; thirst: number }

// started: 시작 처리를 마친 단계 번호. i 와 다르면 그 단계를 막 시작한 것이다. aborted: 목적지를 못 찾아 그만뒀다
export type Activity = { name: ActName; steps: Step[]; i: number; t: number; started: number; aborted?: boolean }

// 행동 부류. 신호가 지금 행동을 끊을지는 부류로 정한다.
// N 평소, S 잠, A 가벼운 반응, T 도구 반응, P 권한 대기, E 턴 결과, G 사람 직접
export type ActClass = 'N' | 'S' | 'A' | 'T' | 'P' | 'E' | 'G'

// 행동을 고를 때 한 번 돌리는 BFS. 그 선택에서 만드는 모든 목적지가 이것을 나눠 쓴다
// memo: 여러 행동이 같은 선택 안에서 다시 쓰는 질의 결과(높은 칸, 블록 둘레 등)
export type Survey = { from: Tile; reach: Reach; memo: Map<string, unknown> }

// 최근 평소 행동을 이만큼 기억한다([0] 이 직전)
export const HISTORY_SIZE = 6

export type Hop = { fx: number; fy: number; tx: number; ty: number; z0: number; z1: number; t: number; dur: number; peak: number; isPath: boolean }

export type Pet = {
  // 종 정의. 걸음·그림·기운 수치를 여기서 읽는다
  species: SpeciesDef
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
  // 끝났거나 끊긴 평소 행동, [0] 이 직전. 그 행동이 끝난 시뮬레이션 시각
  history: ActName[]
  lastEndAt: Partial<Record<ActName, number>>
  // 시뮬레이션 시각(ms). 고정 스텝마다 늘어난다. 행동의 대기 시간·기록은 실제 시각이 아니라 이것으로 잰다
  simMs: number
  // 목적지를 못 찾아 그만둔 행동은 이 시각(시뮬레이션 ms)까지 다시 고르지 않는다. aborts 는 그만둔 횟수
  blockedUntil: Partial<Record<ActName, number>>
  aborts: number
  needs: Needs
  // 최근 놀이 변형, [0] 이 직전
  playHistory: PlayName[]
  // 칸 키마다 마지막으로 서 있던 시뮬레이션 시각. 새 칸을 고르는 데 쓴다. 가장 오래된 것부터 버린다
  visits: Map<number, number>
  tileKey: number
  // 사람이 직접 보낸 신호(프롬프트)의 실제 시각
  lastHumanAt: number
  // 공을 입에 물고 있다
  carrying: boolean
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
  // 행동 난수. 깜빡임·파티클은 fxRng 를 써서, 그리기 쪽을 바꿔도 행동 순서가 달라지지 않는다
  rng: Rng.Rng
  fxRng: Rng.Rng
  // 실제 시각(ms). 신호가 마지막으로 온 때, 흐름(스트리밍)이 이어지는 동안
  lastSignalAt: number
  busyUntil: number
  toolsRunning: number
  lastDigAt: number
}

function idleActivity(): Activity {
  return { name: 'idle', steps: [{ k: 'pose', pose: 'stand', ms: 1500 }], i: 0, t: 0, started: -1 }
}

export function create(world: WorldState, seed: number, now: number, species: SpeciesDef = Species.DOG): Pet {
  const rng = Rng.create(seed ^ 0x9e3779b9)
  const { x, y } = world.spawn
  // 공은 시작 자리에서 몇 칸 떨어진 걷는 칸에 둔다
  let bx = x
  let by = y
  for (let i = 0; i < 60; i++) {
    const cx = x + Rng.int(rng, -5, 5)
    const cy = y + Rng.int(rng, -5, 5)
    if (World.isWalkable(world, cx, cy, species.abilities) && (cx !== x || cy !== y)) { bx = cx; by = cy; break }
  }
  return {
    species, x, y, z: World.heightAt(world, x, y) * Names.STEP_PX,
    dir: 'SE', speed: 0, gait: 'walk', path: [], crouchMs: 0, landMs: 0, stride: 0, turnMs: 0,
    act: idleActivity(), queue: [], history: [], lastEndAt: {}, simMs: 0, blockedUntil: {}, aborts: 0,
    needs: { curiosity: 0.4, play: 0.3, social: 0.3, thirst: 0 }, playHistory: [], visits: new Map(), tileKey: keyOf(x, y), lastHumanAt: now, carrying: false,
    pose: 'stand',
    energy: species.behavior.initial.energy, excite: species.behavior.initial.excite, isAsleep: false,
    tail: 0, breath: 0, blinkIn: 2500, blinkMs: 0,
    particles: [], fxClock: 0,
    ball: Ball.create(bx, by, world),
    rng, fxRng: Rng.create(seed ^ 0x51f15e), lastSignalAt: now, busyUntil: 0, toolsRunning: 0, lastDigAt: -Infinity,
  }
}

// 칸 좌표를 한 수로. |좌표| < 32768 에서 겹치지 않는다
export function keyOf(x: number, y: number): number {
  return (x & 0xffff) | (y << 16)
}

export function tileOf(p: Pet): Tile {
  return { x: Math.round(p.x), y: Math.round(p.y) }
}

export function isMoving(p: Pet): boolean {
  return p.speed > 0.05 || p.hop !== undefined || p.crouchMs > 0
}
