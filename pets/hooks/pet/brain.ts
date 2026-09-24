// 행동 고르기와 세션 신호 반응(순수 모듈).
//
// 행동(Activity)은 단계(Step) 목록이다: 어디로 가기, 자세 몇 ms, 제자리 돌기, 폴짝, 공 차기, 공 쫓기.
// 행동마다 정의(ActDef)가 하나씩 있다: 부류, 평소 기본 가중치, 대기 시간, 가중치 배율, 할 수 있는지, 단계 만들기.
// 평소에는 가중치 무작위로 다음 행동을 고른다. 가중치는 기운(energy)·들뜸(excite)·세션이 바쁜지에 따라 바뀌고,
// 바로 앞에 한 행동은 낮춘다. 세션 신호는 지금 행동을 끊고 들어온다(인사 > 턴 끝 자리잡기 > 파기).
// 한 번 고를 때 BFS 는 한 번만 돌리고(Survey), 그 선택에서 만드는 목적지가 모두 그 결과를 쓴다.

import Iso from '../iso'
import Names from '../names'
import Path, { type Tile } from '../path'
import Rng from '../rng'
import World, { type World as WorldState } from '../world'
import * as Ball from './ball.js'
import * as Fx from './fx.js'
import * as Motion from './motion.js'
import { DIR_VEC, DIRS, HISTORY_SIZE, isMoving, isRight, tileOf, type ActClass, type ActName, type Activity, type Dir, type Pet, type PoseName, type Step, type Survey } from './state.js'

export type ActDef = {
  name: ActName
  cls: ActClass
  // 평소에 고를 때의 기본 가중치. 평소 행동이 아니면 0
  base: number
  // 끝난 뒤 이 시뮬레이션 시간 동안은 다시 고르지 않는다
  cooldownMs: number
  // 지금 기운·들뜸·바쁨에 따른 배율
  adjust: (p: Pet, busy: boolean) => number
  feasible: (p: Pet, world: WorldState, s: Survey) => boolean
  build: (p: Pet, world: WorldState, s: Survey) => Activity
}

const REPEAT_FACTOR = 0.35
// 도구 호출이 몰려 와도 파기를 다시 시작하지 않고 늘리기만 하는 간격, 늘리는 양, 한 번에 파는 최대 시간
const DIG_GAP_MS = 1500
const DIG_EXTEND_MS = 900
const DIG_MAX_MS = 4000
const CHASE_REPATH_MS = 300
const CHASE_GIVEUP_MS = 8000

// 자세·걸음별 기운 변화(초당)
const ENERGY_RATE: Partial<Record<PoseName, number>> = {
  stand: 0.002, look: 0.002, pant: 0.004, sniff: -0.001, dig: -0.01, bow: -0.01, shake: -0.006, scratch: 0,
  yawn: 0.002, stretch: 0, sit: 0.006, frontSit: 0.006, lie: 0.012, lieRest: 0.016, sleep: 0.03, wake: 0.01,
}
const MOVE_RATE = { walk: -0.004, trot: -0.01, run: -0.025, sniff: -0.002 } as const
const EXCITE_TAU_S = 40

function act(name: ActName, steps: Step[]): Activity {
  return { name, steps, i: 0, t: 0, started: -1 }
}

export function surveyOf(p: Pet, world: WorldState): Survey {
  const from = tileOf(p)
  return { from, reach: Path.distancesFrom(world, from) }
}

function pickTile(p: Pet, world: WorldState, s: Survey, lo: number, hi: number): Tile | undefined {
  const tiles = Path.tilesWithin(world, s.from, lo, hi, World.DEFAULT_RULES, s.reach)
  return tiles.length > 0 ? Rng.pick(p.rng, tiles) : undefined
}

function go(p: Pet, world: WorldState, s: Survey, lo: number, hi: number, gait: 'walk' | 'trot' | 'run' | 'sniff'): Step[] {
  const to = pickTile(p, world, s, lo, hi)
  return to ? [{ k: 'go', to, gait }] : []
}

function pose(pose: PoseName, ms: number, extra: { face?: Dir; emote?: 'heart' | '!' | '?' | 'note' } = {}): Step {
  return { k: 'pose', pose, ms, ...extra }
}

function ms(p: Pet, lo: number, hi: number): number {
  return Math.round(Rng.range(p.rng, lo, hi))
}

// 자기 전 아늑한 자리: 6 걸음 안에서 곁에 높은 칸이 많은 곳
function bedOf(p: Pet, world: WorldState, s: Survey): Tile | undefined {
  const tiles = Path.tilesWithin(world, s.from, 0, 6, World.DEFAULT_RULES, s.reach)
  let best: Tile | undefined
  let score = -1
  for (const t of tiles) {
    const v = World.cozinessOf(world, t.x, t.y) + Rng.next(p.rng) * 0.8
    if (v > score) { score = v; best = t }
  }
  return best
}

function ballReachable(p: Pet, world: WorldState): boolean {
  const t = Ball.tileOf(p.ball)
  return World.isWalkable(world, t.x, t.y) && Path.find(world, tileOf(p), t) !== null
}

const ALWAYS = () => true
const FLAT = () => 1

// 평소 행동은 이 순서로 가중치 무작위에 들어간다. 순서를 바꾸면 같은 시드의 행동 열이 바뀐다
export const ACTS: Record<ActName, ActDef> = {
  walk: {
    name: 'walk', cls: 'N', base: 35, cooldownMs: 0, feasible: ALWAYS,
    adjust: (p, busy) => busy ? 1.5 : 1,
    build: (p, world, s) => act('walk', [...go(p, world, s, 3, 8, 'walk'), pose('stand', ms(p, 600, 1400))]),
  },
  idle: {
    name: 'idle', cls: 'N', base: 20, cooldownMs: 0, feasible: ALWAYS, adjust: FLAT,
    build: p => {
      const r = p.rng
      const steps: Step[] = [pose('stand', ms(p, 1500, 3500))]
      // 두리번거린다: 다른 쪽으로 몸을 돌려 잠깐 본다
      if (Rng.chance(r, 0.5)) steps.push(pose('stand', ms(p, 800, 1800), { face: Rng.pick(r, DIRS) }))
      if (Rng.chance(r, 0.3)) steps.push(pose('look', ms(p, 900, 1800)))
      if (Rng.chance(r, 0.1)) steps.push(pose('scratch', ms(p, 1000, 1500)))
      if (p.energy < 0.4 && Rng.chance(r, 0.4)) steps.push(pose('yawn', 800))
      return act('idle', steps)
    },
  },
  sniff: {
    name: 'sniff', cls: 'N', base: 15, cooldownMs: 0, feasible: ALWAYS,
    adjust: (p, busy) => busy ? 1.6 : 1,
    build: (p, world, s) => {
      const steps: Step[] = []
      const n = Rng.int(p.rng, 1, 3)
      for (let i = 0; i < n; i++) steps.push(...go(p, world, s, 1, 2, 'sniff'), pose('sniff', ms(p, 1200, 2600)))
      return act('sniff', steps)
    },
  },
  play: {
    name: 'play', cls: 'N', base: 15, cooldownMs: 0, feasible: ALWAYS,
    adjust: p => (0.3 + p.energy) * (1 + p.excite),
    build: (p, world) => {
      const r = p.rng
      const variant = Rng.weighted(r, [['ball', ballReachable(p, world) ? 40 : 0], ['spin', 25], ['pounce', 20], ['zoomies', p.energy > 0.5 ? 15 : 0]] as const)
      if (variant === 'ball') {
        const steps: Step[] = []
        const kicks = Rng.int(r, 2, 3)
        for (let i = 0; i < kicks; i++) steps.push({ k: 'chase' }, pose('bow', ms(p, 250, 450)), { k: 'kick' }, pose('stand', 300))
        steps.push(pose('pant', ms(p, 1200, 2000)))
        return act('play', steps)
      }
      if (variant === 'spin') return act('play', [pose('bow', 400), { k: 'spin', quarters: Rng.int(r, 8, 12), msPer: 110 }, pose('stand', 300, { emote: 'note' })])
      if (variant === 'pounce') return act('play', [pose('bow', ms(p, 700, 1000)), { k: 'pounce' }, pose('bow', 400), { k: 'pounce' }, pose('stand', 300)])
      const steps: Step[] = []
      const n = Rng.int(r, 3, 5)
      // 연달아 뛰는 구간은 앞 구간이 끝난 자리에서 다시 고른다(go 단계가 시작할 때 목적지를 정한다)
      for (let i = 0; i < n; i++) steps.push({ k: 'go', to: { x: -1, y: -1 }, gait: 'run' })
      steps.push(pose('pant', ms(p, 1500, 2200)))
      return act('play', steps)
    },
  },
  sit: {
    name: 'sit', cls: 'N', base: 10, cooldownMs: 0, feasible: ALWAYS,
    adjust: (p, busy) => (busy ? 0.5 : 1) * (p.energy < 0.5 ? 1.6 : 1),
    build: p => act('sit', [pose(Rng.chance(p.rng, 0.5) ? 'frontSit' : 'sit', ms(p, 3000, 8000))]),
  },
  run: {
    name: 'run', cls: 'N', base: 5, cooldownMs: 0, feasible: ALWAYS,
    adjust: p => (p.energy < 0.4 ? 0.2 : 1) * (1 + 2 * p.excite),
    build: (p, world, s) => act('run', [...go(p, world, s, 6, 12, 'run'), pose('pant', ms(p, 1200, 2200))]),
  },
  lie: {
    name: 'lie', cls: 'N', base: 8, cooldownMs: 0, feasible: ALWAYS,
    adjust: (p, busy) => (busy ? 0.3 : 1) * (p.energy < 0.35 ? 3 : 1),
    build: p => {
      const steps: Step[] = [pose('lie', ms(p, 4000, 9000))]
      if (p.energy < 0.35) steps.push(pose('lieRest', ms(p, 6000, 14000)), pose('stretch', 900))
      return act('lie', steps)
    },
  },
  greet: {
    name: 'greet', cls: 'G', base: 0, cooldownMs: 0, feasible: ALWAYS, adjust: FLAT,
    build: (p, world, s) => {
      const steps: Step[] = p.isAsleep ? [pose('wake', 700), pose('stretch', 900), pose('shake', 500)] : []
      steps.push(pose('look', 350, { emote: '!' }), ...go(p, world, s, 5, 12, 'run'), pose('pant', ms(p, 900, 1400)))
      return act('greet', steps)
    },
  },
  dig: {
    name: 'dig', cls: 'T', base: 0, cooldownMs: 0, feasible: ALWAYS, adjust: FLAT,
    build: p => act('dig', [pose('dig', ms(p, 1300, 1900), { emote: '?' }), pose('sniff', 600)]),
  },
  settle: {
    name: 'settle', cls: 'E', base: 0, cooldownMs: 0, feasible: ALWAYS, adjust: FLAT,
    build: (p, world, s) => act('settle', [...go(p, world, s, 1, 3, 'walk'), pose('frontSit', ms(p, 5000, 9000), { emote: 'heart' })]),
  },
  bedtime: {
    name: 'bedtime', cls: 'S', base: 0, cooldownMs: 0, feasible: ALWAYS, adjust: FLAT,
    build: (p, world, s) => {
      const bed = bedOf(p, world, s)
      const steps: Step[] = bed ? [{ k: 'go', to: bed, gait: 'walk' }] : []
      steps.push(pose('yawn', 800), { k: 'spin', quarters: 6, msPer: 220 }, pose('lie', 1200), pose('sleep', Infinity))
      return act('bedtime', steps)
    },
  },
}

export const NORMAL_ACTS: readonly ActName[] = (Object.keys(ACTS) as ActName[]).filter(name => ACTS[name].cls === 'N')

// 행동 하나를 지금 자리에서 만든다(신호가 부르는 행동처럼 선택 밖에서 만들 때)
export function build(name: ActName, p: Pet, world: WorldState): Activity {
  return ACTS[name].build(p, world, surveyOf(p, world))
}

export function weightsOf(p: Pet, world: WorldState, s: Survey, now: number): Array<readonly [ActName, number]> {
  const busy = now < p.busyUntil
  return NORMAL_ACTS.map(name => {
    const def = ACTS[name]
    const end = p.lastEndAt[name]
    const isCooling = end !== undefined && p.simMs - end < def.cooldownMs
    let w = def.base * def.adjust(p, busy)
    if (name === p.history[0]) w *= REPEAT_FACTOR
    if (isCooling || !def.feasible(p, world, s)) w = 0
    return [name, w] as const
  })
}

function choose(p: Pet, world: WorldState, now: number): Activity {
  const queued = p.queue.shift()
  if (queued) return queued
  const s = surveyOf(p, world)
  return ACTS[Rng.weighted(p.rng, weightsOf(p, world, s, now))].build(p, world, s)
}

function isEvent(a: Activity): boolean {
  return ACTS[a.name].cls !== 'N'
}

// 끝났거나 끊긴 평소 행동을 기록한다. 끊긴 것도 적어야 신호가 잦을 때도 반복 벌점·대기 시간이 걸린다
function record(p: Pet, a: Activity): void {
  if (isEvent(a)) return
  p.history.unshift(a.name)
  if (p.history.length > HISTORY_SIZE) p.history.length = HISTORY_SIZE
  p.lastEndAt[a.name] = p.simMs
}

// 걷던 길은 버리되 공중에 뜬 홉은 마저 내려온다. 그 홉은 이제 길의 한 칸이 아니라서 착지해도 새 길을 줄이지 않는다
function interrupt(p: Pet, next: Activity): void {
  record(p, p.act)
  p.path = []
  p.crouchMs = 0
  if (p.hop) p.hop.isPath = false
  p.act = next
}

export function onTurnStart(p: Pet, world: WorldState, now: number): void {
  p.lastSignalAt = now
  p.excite = Math.min(1, p.excite + 0.45)
  p.queue = []
  interrupt(p, build('greet', p, world))
  p.isAsleep = false
}

export function onTool(p: Pet, world: WorldState, now: number): void {
  p.lastSignalAt = now
  if (p.isAsleep) return
  const cur = p.act
  if (cur.name === 'dig') {
    const step = cur.steps[cur.i]
    if (step?.k === 'pose' && step.pose === 'dig' && step.ms < DIG_MAX_MS) step.ms = Math.min(DIG_MAX_MS, step.ms + DIG_EXTEND_MS)
    return
  }
  if (now - p.lastDigAt < DIG_GAP_MS) return
  p.lastDigAt = now
  if (cur.name === 'greet') {
    if (!p.queue.some(a => a.name === 'dig')) p.queue.unshift(build('dig', p, world))
    return
  }
  // 자리잡기 중이었으면 파고 나서 다시 자리잡는다
  if (cur.name === 'settle') p.queue.unshift(act('settle', cur.steps.slice(cur.i).map(step => step.k === 'pose' ? { ...step, emote: undefined } : step)))
  interrupt(p, build('dig', p, world))
}

export function onTurnEnd(p: Pet, world: WorldState, now: number): void {
  p.lastSignalAt = now
  if (p.isAsleep) return
  p.excite = Math.min(1, p.excite + 0.15)
  p.queue = p.queue.filter(a => a.name !== 'settle')
  if (p.act.name === 'greet' || p.act.name === 'dig') { p.queue.push(build('settle', p, world)); return }
  interrupt(p, build('settle', p, world))
}

export function onStream(p: Pet, now: number): void {
  p.lastSignalAt = now
  p.busyUntil = now + 2500
}

export function onToolStart(p: Pet, now: number): void {
  p.lastSignalAt = now
  p.toolsRunning++
}

export function onToolEnd(p: Pet, now: number): void {
  p.lastSignalAt = now
  p.toolsRunning = Math.max(0, p.toolsRunning - 1)
}

function nearestTo(p: Pet, dx: number, dy: number): Dir {
  let best: Dir = p.dir
  let score = -Infinity
  for (const d of DIRS) {
    const [vx, vy] = DIR_VEC[d]
    const s = vx * dx + vy * dy
    if (s > score) { score = s; best = d }
  }
  return best
}

// 단계 하나를 돌린다. 끝났으면 true
function runStep(p: Pet, world: WorldState, step: Step, a: Activity, dtMs: number, isStart: boolean): boolean {
  switch (step.k) {
    case 'go': {
      if (isStart) {
        let to = step.to
        if (to.x < 0) to = pickTile(p, world, surveyOf(p, world), 2, 5) ?? tileOf(p)
        const path = Path.find(world, tileOf(p), to)
        if (!path || path.length === 0) return true
        p.path = path
        p.gait = step.gait
      }
      return p.path.length === 0 && !p.hop && p.crouchMs <= 0
    }
    case 'pose': {
      if (isStart) {
        p.pose = step.pose
        if (step.face) Motion.faceTo(p, ...DIR_VEC[step.face])
        if (step.emote) p.emote = Fx.emoteOf(step.emote, 1100)
        if (step.pose === 'sleep') p.isAsleep = true
      }
      a.t += dtMs
      return a.t >= step.ms
    }
    case 'spin': {
      const before = Math.floor(a.t / step.msPer)
      a.t += dtMs
      const after = Math.floor(a.t / step.msPer)
      // 화면 시계 방향으로 한 번에 90 도씩
      for (let k = before; k < after; k++) Motion.faceTo(p, ...DIR_VEC[DIRS[(DIRS.indexOf(p.dir) + 1) % 4]!])
      p.pose = 'stand'
      return after >= step.quarters
    }
    case 'pounce': {
      if (isStart) Motion.pounce(p, world, ...DIR_VEC[p.dir])
      return !p.hop
    }
    case 'kick': {
      const dx = p.ball.x - p.x
      const dy = p.ball.y - p.y
      if (Math.hypot(dx, dy) < 1.3) {
        const d = nearestTo(p, dx, dy)
        p.dir = d
        const [vx, vy] = DIR_VEC[d]
        Ball.kick(p.ball, vx, vy, Rng.range(p.rng, 3.5, 5.5), Rng.range(p.rng, -0.8, 0.8))
      }
      return true
    }
    case 'chase': {
      if (isStart) a.t = 0
      a.t += dtMs
      const b = p.ball
      const near = Math.hypot(b.x - p.x, b.y - p.y) < 0.85
      if (near && !Ball.isRolling(b)) {
        p.path = []
        p.dir = nearestTo(p, b.x - p.x, b.y - p.y)
        return true
      }
      if (a.t > CHASE_GIVEUP_MS) return true
      const target = Ball.tileOf(b)
      const last = p.path[p.path.length - 1]
      const stale = !last || last.x !== target.x || last.y !== target.y
      if ((stale && Math.floor(a.t / CHASE_REPATH_MS) !== Math.floor((a.t - dtMs) / CHASE_REPATH_MS)) || isStart) {
        const path = Path.find(world, tileOf(p), target)
        if (!path) return true
        p.path = path
        p.gait = 'run'
      }
      if (near) p.path = []
      return false
    }
  }
}

function updateBody(p: Pet, dtMs: number): void {
  const dt = dtMs / 1000
  const rate = isMoving(p) ? MOVE_RATE[p.gait] : ENERGY_RATE[p.pose] ?? 0
  p.energy = Math.min(1, Math.max(0, p.energy + rate * dt))
  p.excite *= Math.exp(-dt / EXCITE_TAU_S)
  p.breath += dtMs
  p.blinkMs = Math.max(0, p.blinkMs - dtMs)
  p.blinkIn -= dtMs
  if (p.blinkIn <= 0) {
    p.blinkMs = 130
    p.blinkIn = Rng.chance(p.fxRng, 0.2) ? 260 : Rng.range(p.fxRng, 1800, 5200)
  }
  if (p.emote) {
    p.emote.age += dtMs
    if (p.emote.age >= p.emote.life) p.emote = undefined
  }
}

// 고정 스텝 한 번. now 는 실제 시각(잠들기 판정에 쓴다)
export function update(p: Pet, world: WorldState, dtMs: number, now: number): void {
  p.simMs += dtMs
  if (p.toolsRunning > 0) p.lastSignalAt = now
  if (!p.isAsleep && !isEvent(p.act) && now - p.lastSignalAt >= Names.SLEEP_AFTER_MS) {
    p.queue = []
    interrupt(p, build('bedtime', p, world))
  }
  // 한 스텝에 여러 단계가 끝날 수 있다(길이 0 인 go 등). 무한 반복을 막으려고 몇 번까지만
  for (let guard = 0; guard < 6; guard++) {
    const a = p.act
    const step = a.steps[a.i]
    if (!step) {
      record(p, a)
      p.act = choose(p, world, now)
      continue
    }
    const isStart = a.started !== a.i
    a.started = a.i
    if (isStart) a.t = 0
    if (!runStep(p, world, step, a, isStart ? 0 : dtMs, isStart)) break
    a.i++
  }
  Motion.step(p, world, dtMs)
  if (isMoving(p)) p.pose = 'stand'
  Ball.step(p.ball, world, dtMs)
  Fx.step(p.particles, dtMs)
  updateBody(p, dtMs)
  if (!isMoving(p)) emit(p, dtMs)
}

// 제자리 자세가 내는 효과: 파면 흙이 뒤로 튀고, 털면 물방울이 옆으로, 자면 z 가 하나씩 떠오른다
function emit(p: Pet, dtMs: number): void {
  const every = p.pose === 'dig' ? 80 : p.pose === 'shake' ? 60 : p.pose === 'sleep' ? 1700 : 0
  if (every === 0) return
  p.fxClock += dtMs
  if (p.fxClock < every) return
  p.fxClock = 0
  const s = Iso.screenOf(p.x, p.y, p.z)
  const back = isRight(p.dir) ? -1 : 1
  if (p.pose === 'dig') {
    Fx.spawn(p.particles, { kind: 'dirt', x: s.sx - back * 3, y: s.sy - 1, vx: back * Rng.range(p.fxRng, 25, 50), vy: -Rng.range(p.fxRng, 45, 75), g: 280, life: 420 })
  } else if (p.pose === 'shake') {
    const side = Rng.chance(p.fxRng, 0.5) ? 1 : -1
    Fx.spawn(p.particles, { kind: 'drop', x: s.sx + side * 5, y: s.sy - 5 - Rng.int(p.fxRng, 0, 2), vx: side * Rng.range(p.fxRng, 20, 40), vy: -Rng.range(p.fxRng, 10, 30), g: 160, life: 350 })
  } else {
    Fx.spawn(p.particles, { kind: 'z', x: s.sx - back * 4, y: s.sy - 7, vx: -back * 4, vy: -7, g: 0, life: 2200 })
  }
}
