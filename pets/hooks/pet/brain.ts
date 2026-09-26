// 행동 고르기와 세션 신호 반응(순수 모듈).
//
// 행동(Activity)은 단계(Step) 목록이다: 어디로 가기, 자세 몇 ms, 제자리 돌기, 폴짝, 공 차기·쫓기·물기·놓기.
// 행동마다 정의(ActDef)가 하나씩 있다: 부류, 기본 가중치, 욕구 계수, 대기 시간, 가중치 배율, 할 수 있는지, 단계 만들기.
//
// 평소 행동은 점수에 비례해 난수로 뽑는다(가장 높은 점수를 고르지 않아 같은 욕구 상태에서도 행동이 갈린다).
//   점수 = 기본 가중치 × 종 배율 × 할 수 있는지 × 대기 시간이 지났는지 × 반복 벌점 × 기운·들뜸·바쁨 배율 × 욕구 항
//   반복 벌점 = max(0.1, 1 - 최근 6 개 중 같은 행동 자리마다 0.65, 0.30, 0.15, 0.08, 0.04, 0.02 를 더한 값)
//   욕구 항 = min(3, 0.35 + Σ 욕구 계수 × 욕구). 욕구는 호기심·놀고 싶음·사람 곁·목마름과 쉬고 싶음(1 - 기운)
// 기운이 아주 낮으면 뽑기 전에 낮잠을 고르고, 모든 점수가 0 이면 가만히 선다.
// 세션 신호는 지금 행동을 끊고 들어온다(인사 > 턴 끝 자리잡기 > 파기).
// 한 번 고를 때 BFS 는 한 번만 돌리고(Survey), 그 선택의 판정과 목적지가 모두 그 결과를 쓴다.

import Iso from '../iso'
import Names from '../names'
import Path, { type Tile } from '../path'
import Rng from '../rng'
import World, { type World as WorldState } from '../world'
import * as Ball from './ball.js'
import * as Fx from './fx.js'
import * as Motion from './motion.js'
import {
  DIR_VEC, DIRS, HISTORY_SIZE, isMoving, isRight, keyOf, tileOf,
  type ActClass, type ActName, type Activity, type Dir, type Needs, type Pet, type PlayName, type PoseName, type Step, type Survey,
} from './state.js'

type Drive = keyof Needs | 'rest'

export type ActDef = {
  name: ActName
  cls: ActClass
  // 평소에 고를 때의 기본 가중치. 평소 행동이 아니면 0
  base: number
  // 욕구 계수: 욕구 항에 계수 × 욕구로 더한다
  drive: Readonly<Partial<Record<Drive, number>>>
  // 끝난 뒤 이 시뮬레이션 시간 동안은 다시 고르지 않는다
  cooldownMs: number
  // 지금 기운·들뜸·바쁨에 따른 배율
  adjust: (p: Pet, busy: boolean) => number
  feasible: (p: Pet, world: WorldState, s: Survey) => boolean
  build: (p: Pet, world: WorldState, s: Survey) => Activity
}

const REPEAT_PENALTY = [0.65, 0.3, 0.15, 0.08, 0.04, 0.02] as const
const PLAY_PENALTY = [0.7, 0.35, 0.15] as const
const PLAY_HISTORY_SIZE = PLAY_PENALTY.length
const DRIVE_FLOOR = 0.35
const DRIVE_CAP = 3
// 목적지를 못 찾아 그만둔 행동을 다시 고르지 않는 시간
const ABORT_COOLDOWN_MS = 30_000
// 이 기운 아래면 뽑기 전에 낮잠
const NAP_NOW = 0.12
// 이보다 오래 안 간 칸이 "새 칸"
const FRESH_MS = 120_000
const VISITS_MAX = 512
// 사람 신호가 이만큼 없으면 사람 곁에 가고 싶어진다
const SOCIAL_QUIET_MS = 30_000
// 도구 호출이 몰려 와도 파기를 다시 시작하지 않고 늘리기만 하는 간격, 늘리는 양, 한 번에 파는 최대 시간
const DIG_GAP_MS = 1500
const DIG_EXTEND_MS = 900
const DIG_MAX_MS = 4000
const CHASE_REPATH_MS = 300
const CHASE_GIVEUP_MS = 8000
const EXCITE_TAU_S = 40
// 공을 물었을 때 입 자리: 보는 쪽으로 이만큼(타일), 발에서 이만큼 위(px)
const MOUTH_TILES = 0.45
const MOUTH_PX = 4

function act(name: ActName, steps: Step[]): Activity {
  return { name, steps, i: 0, t: 0, started: -1 }
}

export function surveyOf(p: Pet, world: WorldState): Survey {
  const from = tileOf(p)
  return { from, reach: Path.distancesFrom(world, from, p.species.abilities), memo: new Map() }
}

function tilesAt(p: Pet, world: WorldState, s: Survey, lo: number, hi: number): Tile[] {
  return Path.tilesWithin(world, s.from, lo, hi, p.species.abilities, s.reach)
}

// 걸음 수가 정확히 [lo, hi] 안인 칸이 있는지(tilesWithin 은 없으면 더 가까운 칸을 돌려준다)
function hasTilesAt(s: Survey, lo: number, hi: number): boolean {
  for (const d of s.reach.dist) if (d >= lo && d <= hi) return true
  return false
}

function memo<T>(s: Survey, key: string, make: () => T): T {
  if (!s.memo.has(key)) s.memo.set(key, make())
  return s.memo.get(key) as T
}

function pickTile(p: Pet, world: WorldState, s: Survey, lo: number, hi: number): Tile | undefined {
  const tiles = tilesAt(p, world, s, lo, hi)
  return tiles.length > 0 ? Rng.pick(p.rng, tiles) : undefined
}

// 오래 안 간 칸일수록 잘 뽑힌다: 가중치 1 + fresh × min(1, 안 간 시간 / 120 s), 한 번도 안 간 칸은 1 + fresh
function pickFresh(p: Pet, world: WorldState, s: Survey, lo: number, hi: number, fresh: number): Tile | undefined {
  const tiles = tilesAt(p, world, s, lo, hi)
  if (tiles.length === 0) return undefined
  const weights = tiles.map(t => {
    const at = p.visits.get(keyOf(t.x, t.y))
    return 1 + fresh * (at === undefined ? 1 : Math.min(1, (p.simMs - at) / FRESH_MS))
  })
  let x = Rng.next(p.rng) * weights.reduce((a, b) => a + b, 0)
  for (let i = 0; i < tiles.length; i++) {
    x -= weights[i]!
    if (x < 0) return tiles[i]
  }
  return tiles[tiles.length - 1]
}

// 화면 앞쪽(x + y 가 가장 큰) 칸. 같으면 난수로
function frontTile(p: Pet, world: WorldState, s: Survey, lo: number, hi: number): Tile | undefined {
  const tiles = tilesAt(p, world, s, lo, hi)
  if (tiles.length === 0) return undefined
  const best = Math.max(...tiles.map(t => t.x + t.y))
  return Rng.pick(p.rng, tiles.filter(t => t.x + t.y === best))
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
  const tiles = tilesAt(p, world, s, 0, 6)
  let best: Tile | undefined
  let score = -1
  for (const t of tiles) {
    const v = World.cozinessOf(world, t.x, t.y) + Rng.next(p.rng) * 0.8
    if (v > score) { score = v; best = t }
  }
  return best
}

// 10 걸음 안에서 지금보다 한 단 이상 높은 칸 중 가장 높은 칸들
function highSpots(p: Pet, world: WorldState, s: Survey): Tile[] {
  return memo(s, 'high', () => {
    const here = World.walkHeightAt(world, s.from.x, s.from.y)
    const tiles = tilesAt(p, world, s, 1, 10).filter(t => Path.stepsAt(s.reach, t.x, t.y) <= 10 && World.walkHeightAt(world, t.x, t.y) >= here + 1)
    if (tiles.length === 0) return []
    const top = Math.max(...tiles.map(t => World.walkHeightAt(world, t.x, t.y)))
    return tiles.filter(t => World.walkHeightAt(world, t.x, t.y) === top)
  })
}

// 6 걸음 안에 있는 가장 가까운 블록의 둘레에서 갈 수 있는 칸들을 한 바퀴 도는 순서로. 최대 4 칸
function patrolRoute(p: Pet, world: WorldState, s: Survey): Tile[] {
  return memo(s, 'patrol', () => {
    let near: Tile | undefined
    let nearSteps = Infinity
    for (const t of tilesAt(p, world, s, 0, 6)) {
      const d = Path.stepsAt(s.reach, t.x, t.y)
      if (d > 6 || d >= nearSteps) continue
      for (const [dx, dy] of World.NEIGHBORS) {
        if (World.isBlock(world, t.x + dx, t.y + dy)) { near = { x: t.x + dx, y: t.y + dy }; nearSteps = d; break }
      }
    }
    if (!near) return []
    // 블록 덩어리(1×1, 2×1)와 그 둘레
    const cells: Tile[] = [near]
    for (const [dx, dy] of World.NEIGHBORS) if (World.isBlock(world, near.x + dx, near.y + dy)) cells.push({ x: near.x + dx, y: near.y + dy })
    const cx = cells.reduce((a, c) => a + c.x, 0) / cells.length
    const cy = cells.reduce((a, c) => a + c.y, 0) / cells.length
    const ring: Tile[] = []
    for (let y = Math.floor(cy) - 1; y <= Math.ceil(cy) + 1; y++) {
      for (let x = Math.floor(cx) - 1; x <= Math.ceil(cx) + 1; x++) {
        if (cells.some(c => c.x === x && c.y === y)) continue
        if (Path.stepsAt(s.reach, x, y) < 0) continue
        ring.push({ x, y })
      }
    }
    if (ring.length < 2) return []
    // 블록 가운데를 도는 각도 순으로 늘어놓고, 가장 가까운 칸부터 고르게 4 칸
    ring.sort((a, b) => Math.atan2(a.y - cy, a.x - cx) - Math.atan2(b.y - cy, b.x - cx))
    let start = 0
    for (let i = 1; i < ring.length; i++) if (Path.stepsAt(s.reach, ring[i]!.x, ring[i]!.y) < Path.stepsAt(s.reach, ring[start]!.x, ring[start]!.y)) start = i
    const n = Math.min(4, ring.length)
    const out: Tile[] = []
    for (let i = 0; i < n; i++) out.push(ring[(start + Math.floor((i * ring.length) / n)) % ring.length]!)
    return out
  })
}

function ballReachable(p: Pet, world: WorldState): boolean {
  if (p.carrying) return false
  const t = Ball.tileOf(p.ball)
  return World.isWalkable(world, t.x, t.y, p.species.abilities) && Path.find(world, tileOf(p), t, p.species.abilities) !== null
}

function penaltyOf<T>(name: T, recent: readonly T[], weights: readonly number[]): number {
  let sum = 0
  for (let i = 0; i < weights.length && i < recent.length; i++) if (recent[i] === name) sum += weights[i]!
  return Math.max(0.1, 1 - sum)
}

// 놀이 변형 고르기: 변형 가중치 × 최근 3 개 반복 벌점
function playVariant(p: Pet, world: WorldState): PlayName {
  const canBall = ballReachable(p, world)
  const base: ReadonlyArray<readonly [PlayName, number]> = [
    ['ball', canBall ? 25 : 0], ['fetch', canBall ? 15 : 0], ['spin', 20], ['pounce', 15], ['stalk', 15],
    ['chaseTail', p.energy > 0.4 ? 12 : 0], ['zoomies', p.energy > 0.5 ? 15 : 0],
  ]
  const v = Rng.weighted(p.rng, base.map(([name, w]) => [name, w * penaltyOf(name, p.playHistory, PLAY_PENALTY)] as const))
  p.playHistory.unshift(v)
  if (p.playHistory.length > PLAY_HISTORY_SIZE) p.playHistory.length = PLAY_HISTORY_SIZE
  return v
}

function buildPlay(p: Pet, world: WorldState): Activity {
  const r = p.rng
  switch (playVariant(p, world)) {
    case 'ball': {
      const steps: Step[] = []
      const kicks = Rng.int(r, 2, 3)
      for (let i = 0; i < kicks; i++) steps.push({ k: 'chase' }, pose('bow', ms(p, 250, 450)), { k: 'kick' }, pose('stand', 300))
      steps.push(pose('pant', ms(p, 1200, 2000)))
      return act('play', steps)
    }
    case 'fetch':
      // 공을 물고 화면 앞쪽(사람 쪽)으로 가져와 내려놓고 앉는다. 입에 문 공을 그리는 그림은 아직 없어 공을 입 자리에 붙여 그린다
      return act('play', [
        { k: 'chase' }, pose('bow', 300), { k: 'grab' },
        { k: 'go', pick: { lo: 3, hi: 6, front: true }, gait: 'trot' },
        pose('bow', 300), { k: 'drop' }, pose('frontSit', ms(p, 1500, 2500)),
      ])
    case 'spin':
      return act('play', [pose('bow', 400), { k: 'spin', quarters: Rng.int(r, 8, 12), msPer: 110 }, pose('stand', 300, { emote: 'note' })])
    case 'pounce':
      return act('play', [pose('bow', ms(p, 700, 1000)), { k: 'pounce' }, pose('bow', 400), { k: 'pounce' }, pose('stand', 300)])
    case 'stalk':
      // 살금살금 다가가 덮친다. 살금 걸음이 생기기 전까지는 킁킁 걸음으로 다가간다
      return act('play', [pose('bow', 300), { k: 'go', pick: { lo: 2, hi: 4 }, gait: 'sniff' }, pose('bow', ms(p, 600, 1200)), { k: 'pounce' }, pose('stand', 400)])
    case 'chaseTail':
      return act('play', [pose('bow', 300), { k: 'spin', quarters: Rng.int(r, 12, 20), msPer: 70 }, pose('stand', 400, { emote: 'note' })])
    case 'zoomies': {
      const steps: Step[] = []
      const n = Rng.int(r, 3, 5)
      // 연달아 뛰는 구간은 앞 구간이 끝난 자리에서 다시 고른다(go 단계가 시작할 때 목적지를 정한다)
      for (let i = 0; i < n; i++) steps.push({ k: 'go', pick: { lo: 2, hi: 5 }, gait: 'run' })
      steps.push(pose('pant', ms(p, 1500, 2200)))
      return act('play', steps)
    }
  }
}

const ALWAYS = () => true
const FLAT = () => 1
const NONE = {}

// 평소 행동은 이 순서로 가중치 무작위에 들어간다. 순서를 바꾸면 같은 시드의 행동 열이 바뀐다
export const ACTS: Record<ActName, ActDef> = {
  walk: {
    name: 'walk', cls: 'N', base: 30, drive: { curiosity: 0.5 }, cooldownMs: 0, feasible: ALWAYS,
    adjust: (p, busy) => busy ? 1.5 : 1,
    build: (p, world, s) => {
      const to = pickFresh(p, world, s, 3, 8, 2)
      return act('walk', [...(to ? [{ k: 'go', to, gait: 'walk' } as Step] : []), pose('stand', ms(p, 600, 1400))])
    },
  },
  idle: {
    name: 'idle', cls: 'N', base: 18, drive: { rest: 0.3 }, cooldownMs: 0, feasible: ALWAYS, adjust: FLAT,
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
    name: 'sniff', cls: 'N', base: 15, drive: { curiosity: 1 }, cooldownMs: 0, feasible: ALWAYS,
    adjust: (p, busy) => busy ? 1.6 : 1,
    build: (p, world, s) => {
      const steps: Step[] = []
      const n = Rng.int(p.rng, 1, 3)
      for (let i = 0; i < n; i++) steps.push(...go(p, world, s, 1, 2, 'sniff'), pose('sniff', ms(p, 1200, 2600)))
      return act('sniff', steps)
    },
  },
  play: {
    name: 'play', cls: 'N', base: 15, drive: { play: 1.4 }, cooldownMs: 0, feasible: ALWAYS,
    adjust: p => (0.3 + p.energy) * (1 + p.excite),
    build: (p, world) => buildPlay(p, world),
  },
  sit: {
    name: 'sit', cls: 'N', base: 10, drive: { rest: 0.7, social: 0.3 }, cooldownMs: 0, feasible: ALWAYS,
    adjust: (p, busy) => busy ? 0.5 : 1,
    build: p => act('sit', [pose(Rng.chance(p.rng, 0.5) ? 'frontSit' : 'sit', ms(p, 3000, 8000))]),
  },
  run: {
    name: 'run', cls: 'N', base: 5, drive: { play: 0.6 }, cooldownMs: 0, feasible: ALWAYS,
    adjust: p => (p.energy < 0.4 ? 0.2 : 1) * (1 + 2 * p.excite),
    build: (p, world, s) => act('run', [...go(p, world, s, 6, 12, 'run'), pose('pant', ms(p, 1200, 2200))]),
  },
  lie: {
    name: 'lie', cls: 'N', base: 8, drive: { rest: 1.2 }, cooldownMs: 0, feasible: ALWAYS,
    adjust: (p, busy) => busy ? 0.3 : 1,
    build: p => {
      const steps: Step[] = [pose('lie', ms(p, 4000, 9000))]
      if (p.energy < 0.35) steps.push(pose('lieRest', ms(p, 6000, 14000)), pose('stretch', 900))
      return act('lie', steps)
    },
  },
  // 안 가 본 칸(8~14 걸음)으로 속보로 가서 다른 쪽을 둘러보고 킁킁
  explore: {
    name: 'explore', cls: 'N', base: 10, drive: { curiosity: 1.5 }, cooldownMs: 20_000,
    feasible: (p, world, s) => p.energy > 0.3 && hasTilesAt(s, 8, 14),
    adjust: FLAT,
    build: (p, world, s) => {
      const to = pickFresh(p, world, s, 8, 14, 5)
      return act('explore', [
        { k: 'go', to, gait: 'trot', must: true },
        pose('stand', ms(p, 600, 1000), { face: Rng.pick(p.rng, DIRS) }),
        pose('sniff', ms(p, 1200, 2000)),
      ])
    },
  },
  // 가까운 블록 둘레를 한 바퀴 걸어 돈다
  patrol: {
    name: 'patrol', cls: 'N', base: 6, drive: { curiosity: 0.8 }, cooldownMs: 45_000,
    feasible: (p, world, s) => patrolRoute(p, world, s).length >= 2,
    adjust: FLAT,
    build: (p, world, s) => act('patrol', [
      ...patrolRoute(p, world, s).map(to => ({ k: 'go', to, gait: 'walk', must: true }) as Step),
      pose('stand', ms(p, 500, 900)),
    ]),
  },
  // 10 걸음 안에서 가장 높은 칸에 올라가 사람 쪽을 보다가 앉는다
  perch: {
    name: 'perch', cls: 'N', base: 5, drive: { curiosity: 0.5, social: 0.3 }, cooldownMs: 60_000,
    feasible: (p, world, s) => p.energy > 0.35 && highSpots(p, world, s).length > 0,
    adjust: FLAT,
    build: (p, world, s) => act('perch', [
      { k: 'go', to: Rng.pick(p.rng, highSpots(p, world, s)), gait: 'walk', must: true },
      pose('look', ms(p, 3000, 6000)),
      pose('sit', ms(p, 2000, 4000), { face: 'SE' }),
    ]),
  },
  // 누워 뒹굴다 일어나 턴다. 배를 보이는 그림이 생기기 전까지는 엎드린 모습으로 대신한다
  rollOver: {
    name: 'rollOver', cls: 'N', base: 4, drive: { play: 1 }, cooldownMs: 90_000,
    feasible: p => p.excite > 0.2 || p.needs.play > 0.3,
    adjust: FLAT,
    build: p => act('rollOver', [pose('lie', ms(p, 600, 900)), pose('lie', ms(p, 1200, 2000)), pose('stand', 200), pose('shake', 500)]),
  },
  // 화면 앞쪽 칸으로 와서 사람 쪽을 보고 앉는다
  watch: {
    name: 'watch', cls: 'N', base: 6, drive: { social: 1.5 }, cooldownMs: 40_000, feasible: ALWAYS, adjust: FLAT,
    build: (p, world, s) => act('watch', [
      { k: 'go', to: frontTile(p, world, s, 0, 5), gait: 'walk', must: true },
      pose('frontSit', ms(p, 4000, 8000)),
    ]),
  },
  // 잠자리로 가서 하품하고 엎드려 존다. 잠(isAsleep)이 아니라서 어떤 신호에도 깬다
  nap: {
    name: 'nap', cls: 'N', base: 6, drive: { rest: 2 }, cooldownMs: 120_000,
    feasible: p => p.energy < 0.3,
    adjust: FLAT,
    build: (p, world, s) => act('nap', [
      { k: 'go', to: bedOf(p, world, s) ?? s.from, gait: 'walk', must: true },
      pose('yawn', 800), pose('lie', 1000), pose('lieRest', ms(p, 10_000, 25_000)), pose('stretch', 900),
    ]),
  },
  greet: {
    name: 'greet', cls: 'G', base: 0, drive: NONE, cooldownMs: 0, feasible: ALWAYS, adjust: FLAT,
    build: (p, world, s) => {
      const steps: Step[] = p.isAsleep ? [pose('wake', 700), pose('stretch', 900), pose('shake', 500)] : []
      steps.push(pose('look', 350, { emote: '!' }), ...go(p, world, s, 5, 12, 'run'), pose('pant', ms(p, 900, 1400)))
      return act('greet', steps)
    },
  },
  dig: {
    name: 'dig', cls: 'T', base: 0, drive: NONE, cooldownMs: 0, feasible: ALWAYS, adjust: FLAT,
    build: p => act('dig', [pose('dig', ms(p, 1300, 1900), { emote: '?' }), pose('sniff', 600)]),
  },
  settle: {
    name: 'settle', cls: 'E', base: 0, drive: NONE, cooldownMs: 0, feasible: ALWAYS, adjust: FLAT,
    build: (p, world, s) => act('settle', [...go(p, world, s, 1, 3, 'walk'), pose('frontSit', ms(p, 5000, 9000), { emote: 'heart' })]),
  },
  bedtime: {
    name: 'bedtime', cls: 'S', base: 0, drive: NONE, cooldownMs: 0, feasible: ALWAYS, adjust: FLAT,
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

function driveOf(p: Pet, def: ActDef): number {
  let d = DRIVE_FLOOR
  for (const [need, k] of Object.entries(def.drive) as Array<[Drive, number]>) d += k * (need === 'rest' ? 1 - p.energy : p.needs[need])
  return Math.min(DRIVE_CAP, d)
}

export function weightsOf(p: Pet, world: WorldState, s: Survey, now: number): Array<readonly [ActName, number]> {
  const busy = now < p.busyUntil
  return NORMAL_ACTS.map(name => {
    const def = ACTS[name]
    const end = p.lastEndAt[name]
    const isCooling = (end !== undefined && p.simMs - end < def.cooldownMs) || p.simMs < (p.blockedUntil[name] ?? -Infinity)
    if (isCooling) return [name, 0] as const
    const w = def.base * (p.species.behavior.actMul[name] ?? 1) * penaltyOf(name, p.history, REPEAT_PENALTY) * def.adjust(p, busy) * driveOf(p, def)
    return [name, w > 0 && def.feasible(p, world, s) ? w : 0] as const
  })
}

function choose(p: Pet, world: WorldState, now: number): Activity {
  const queued = p.queue.shift()
  if (queued) return queued
  const s = surveyOf(p, world)
  if (p.energy <= NAP_NOW && !(p.simMs < (p.blockedUntil.nap ?? -Infinity)) && ACTS.nap.feasible(p, world, s)) return ACTS.nap.build(p, world, s)
  const weights = weightsOf(p, world, s, now)
  if (weights.every(([, w]) => w <= 0)) return ACTS.idle.build(p, world, s)
  return ACTS[Rng.weighted(p.rng, weights)].build(p, world, s)
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

// 문 공을 내려놓는다: 발 앞에 두고 땅으로 떨어지게 한다
function release(p: Pet): void {
  if (!p.carrying) return
  p.carrying = false
  const b = p.ball
  const [vx, vy] = DIR_VEC[p.dir]
  b.x = p.x + vx * 0.3
  b.y = p.y + vy * 0.3
  b.vx = 0
  b.vy = 0
  b.vz = 0
}

// 걷던 길은 버리되 공중에 뜬 홉은 마저 내려온다. 그 홉은 이제 길의 한 칸이 아니라서 착지해도 새 길을 줄이지 않는다
function interrupt(p: Pet, next: Activity): void {
  record(p, p.act)
  release(p)
  p.path = []
  p.crouchMs = 0
  if (p.hop) p.hop.isPath = false
  p.act = next
}

// 목적지를 못 찾은 행동을 그만둔다. 기록하지 않고, 30 초 동안 다시 고르지 않는다
function abort(p: Pet, a: Activity): void {
  release(p)
  p.aborts++
  p.blockedUntil[a.name] = p.simMs + ABORT_COOLDOWN_MS
  a.aborted = true
  a.i = a.steps.length
}

export function onTurnStart(p: Pet, world: WorldState, now: number): void {
  p.lastSignalAt = now
  p.lastHumanAt = now
  p.excite = Math.min(1, p.excite + p.species.behavior.exciteGain.turnStart)
  p.needs.social = Math.max(0, p.needs.social - 0.3)
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
  p.excite = Math.min(1, p.excite + p.species.behavior.exciteGain.turnEnd)
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
        if (step.pick) {
          const s = surveyOf(p, world)
          to = step.pick.front ? frontTile(p, world, s, step.pick.lo, step.pick.hi) : pickTile(p, world, s, step.pick.lo, step.pick.hi)
          to ??= step.must ? undefined : tileOf(p)
        }
        const path = to ? Path.find(world, tileOf(p), to, p.species.abilities) : null
        if (!path) {
          if (step.must) abort(p, a)
          return true
        }
        if (path.length === 0) return true
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
        p.needs.play = Math.max(0, p.needs.play - 0.05)
      }
      return true
    }
    case 'grab': {
      if (Math.hypot(p.ball.x - p.x, p.ball.y - p.y) < 1.3 && !Ball.isRolling(p.ball)) p.carrying = true
      return true
    }
    case 'drop': {
      release(p)
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
        const path = Path.find(world, tileOf(p), target, p.species.abilities)
        if (!path) return true
        p.path = path
        p.gait = 'run'
      }
      if (near) p.path = []
      return false
    }
  }
}

function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v))
}

// 욕구: 호기심은 늘 오르고 킁킁대면 내린다. 놀고 싶음은 들뜰수록 빨리 오르고 놀면 내린다.
// 사람 곁은 사람 신호가 30 초 넘게 없으면 오르고, 있거나 사람 쪽을 보고 앉아 있으면 내린다. 목마름은 물이 생기기 전까지 0
function updateNeeds(p: Pet, dtMs: number, now: number): void {
  const dt = dtMs / 1000
  const n = p.needs
  const moving = isMoving(p)
  const sniffing = moving ? p.gait === 'sniff' : p.pose === 'sniff'
  n.curiosity = clamp01(n.curiosity + (0.005 - (sniffing ? 0.01 : 0)) * dt)
  const playing = p.act.name === 'play' || p.act.name === 'run' || p.act.name === 'rollOver'
  n.play = clamp01(n.play + (0.003 + 0.006 * p.excite - (playing ? 0.015 : 0)) * dt)
  const alone = now - p.lastHumanAt > SOCIAL_QUIET_MS
  const facing = !moving && p.pose === 'frontSit' && p.act.name === 'watch'
  n.social = clamp01(n.social + ((alone ? 0.004 : -0.01) - (facing ? 0.06 : 0)) * dt)
  n.thirst = 0
}

// 선 칸이 바뀌면 방문 기록을 적는다. 걸어 다니는 행동 중 오래 안 간 칸에 들어서면 호기심이 풀린다
function visit(p: Pet): void {
  const t = tileOf(p)
  const key = keyOf(t.x, t.y)
  if (key === p.tileKey) return
  p.visits.delete(p.tileKey)
  p.visits.set(p.tileKey, p.simMs)
  const seen = p.visits.get(key)
  const roaming = p.act.name === 'explore' || p.act.name === 'walk' || p.act.name === 'patrol' || p.act.name === 'perch'
  if (roaming && (seen === undefined || p.simMs - seen > FRESH_MS)) p.needs.curiosity = clamp01(p.needs.curiosity - 0.01)
  p.visits.delete(key)
  p.visits.set(key, p.simMs)
  p.tileKey = key
  while (p.visits.size > VISITS_MAX) p.visits.delete(p.visits.keys().next().value!)
}

function updateBody(p: Pet, dtMs: number): void {
  const dt = dtMs / 1000
  const rate = isMoving(p) ? p.species.gaits[p.gait].energyPerS : p.species.behavior.energyRate[p.pose] ?? 0
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

// 문 공은 굴리지 않고 입 자리에 붙여 둔다
function holdBall(p: Pet): void {
  const b = p.ball
  const [vx, vy] = DIR_VEC[p.dir]
  b.x = p.x + vx * MOUTH_TILES
  b.y = p.y + vy * MOUTH_TILES
  b.z = p.z + MOUTH_PX
  b.vx = 0
  b.vy = 0
  b.vz = 0
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
      if (!a.aborted) record(p, a)
      release(p)
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
  if (p.carrying) holdBall(p)
  else Ball.step(p.ball, world, dtMs)
  Fx.step(p.particles, dtMs)
  updateBody(p, dtMs)
  updateNeeds(p, dtMs, now)
  visit(p)
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
