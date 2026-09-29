// 행동 고르기와 세션 신호 반응(순수 모듈).
//
// 행동(Activity)은 단계(Step) 목록이다: 어디로 가기, 자세 몇 ms, 제자리 돌기, 폴짝, 공 차기·쫓기·물기·놓기, 나뭇가지 물기·놓기, 구덩이 흔적 남기기.
// 행동마다 정의(ActDef)가 하나씩 있다: 부류, 기본 가중치, 욕구 계수, 대기 시간, 가중치 배율, 할 수 있는지, 단계 만들기.
//
// 평소 행동은 점수에 비례해 난수로 뽑는다(가장 높은 점수를 고르지 않아 같은 욕구 상태에서도 행동이 갈린다).
//   점수 = 기본 가중치 × 종 배율 × 할 수 있는지 × 대기 시간이 지났는지 × 반복 벌점 × 기운·들뜸·바쁨 배율 × 욕구 항
//   반복 벌점 = max(0.1, 1 - 최근 6 개 중 같은 행동 자리마다 0.65, 0.30, 0.15, 0.08, 0.04, 0.02 를 더한 값)
//   욕구 항 = min(3, 0.35 + Σ 욕구 계수 × 욕구). 욕구는 호기심·놀고 싶음·사람 곁·목마름과 쉬고 싶음(1 - 기운)
// 기운이 아주 낮으면 뽑기 전에 낮잠을 고르고, 모든 점수가 0 이면 가만히 선다.
// 세션 신호가 지금 행동에 하는 일은 신호 종류 × 지금 행동 부류 표(RULES)가 정한다: 끊고 시작, 대기열 앞·뒤, 늘리기, 되돌려 놓고 끊기, 버리기, 얼굴만 돌리기.
// 도구 호출·서브에이전트 도구 호출·타이핑·도구 실패는 토큰 통을 거쳐, 몰려 와도 행동이 몇 번만 바뀐다.
// 한 번 고를 때 BFS 는 한 번만 돌리고(Survey), 그 선택의 판정과 목적지가 모두 그 결과를 쓴다.

import Iso from '../iso'
import Names from '../names'
import Path, { type Tile } from '../path'
import Rng from '../rng'
import World, { type WaterEdge, type World as WorldState } from '../world'
import * as Ball from './ball.js'
import * as Fx from './fx.js'
import * as Motion from './motion.js'
import {
  BUCKETS, DIR_VEC, DIRS, dirOf, HISTORY_SIZE, isMoving, isRight, keyOf, tileOf,
  type ActClass, type ActName, type Activity, type BucketName, type Dir, type Needs, type Pet, type PlayName, type PoseName, type Step, type Survey,
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
// 도구 반응 중에 또 도구 호출이 오면 그 자세를 이만큼 늘린다(최대 GROW_MAX_MS)
const GROW_MS = 900
const GROW_MAX_MS = 4000
// 메인 도구가 이만큼 넘게 돌면 앞쪽에 와서 앉아 기다린다
const WAIT_AFTER_MS = 4000
// 권한 대기가 이만큼 넘으면 조르기를 그만두고 엎드려 기다린다
const BEG_FOR_MS = 90_000
// 이 시간 안에 두 번째 도구 실패가 오면 풀이 죽는다
const FAIL_STREAK_MS = 20_000
// 메인 루프가 글·도구 없이 이만큼 넘게 생각하면 앉아서 생각한다. 생각 자세는 최대 PONDER_MAX_MS
const PONDER_AFTER_MS = 3000
const PONDER_MAX_MS = 20_000
const PONDER_DOTS_MS = 2500
// 이보다 짧은 프롬프트에는 속보로 조금만 간다
const SHORT_PROMPT = 40
// 이보다 긴 턴이 답으로 끝나면 자리잡기 전에 기지개를 켜고 턴다
const LONG_TURN_MS = 120_000
// 턴이 이만큼 넘게 이어지면 앉기·눕기 비중을 LONG_TURN_REST 배로 줄인다
const BUSY_TURN_MS = 90_000
const LONG_TURN_REST = 0.8
// 대기열 최대 길이. 넘으면 뒤쪽의 가벼운 반응부터 버린다
const QUEUE_MAX = 3
// 얼굴만 돌리는 반응의 길이
const GLANCE_MS = 400
const CHASE_REPATH_MS = 300
const CHASE_GIVEUP_MS = 8000
const EXCITE_TAU_S = 40
// 공을 물었을 때 공의 자리(내려놓을 곳): 보는 쪽으로 이만큼(타일), 발에서 이만큼 위(px). 그림은 그리는 쪽이 입 칸에 그린다
const MOUTH_TILES = 0.45
const MOUTH_PX = 4
// 목마름: 물가가 처음 가까워졌을 때의 값, 늘 오르는 빠르기, 속보·달리기 중 더 오르는 빠르기, 마시는 동안 내리는 빠르기(초당)
const THIRST_START = 0.1
const THIRST_RATE = 0.0015
const THIRST_MOVING = 0.006
const THIRST_DRINK = 0.15
// 이 목마름 이상이면 오래 도는 도구를 기다리기 전에 물부터 마시러 간다
const THIRST_URGENT = 0.85
// 물보라 뒤에 물에서 이만큼(맨해튼 거리) 떨어진 땅으로 나온다
const SPLASH_OUT = 2
// 씹을 나뭇가지를 찾는 걸음 수
const CHEW_REACH = 12

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

// 물이 아닌 칸만. 쉬러 가는 자리(잠자리, 자리잡기, 앞쪽 칸)는 물에 두지 않는다
function dry(world: WorldState, tiles: Tile[]): Tile[] {
  return tiles.filter(t => !World.isWater(world, t.x, t.y))
}

function pickDry(p: Pet, world: WorldState, s: Survey, lo: number, hi: number): Tile | undefined {
  const tiles = dry(world, tilesAt(p, world, s, lo, hi))
  return tiles.length > 0 ? Rng.pick(p.rng, tiles) : undefined
}

// 화면 앞쪽(x + y 가 가장 큰) 물이 아닌 칸. 같으면 난수로
function frontTile(p: Pet, world: WorldState, s: Survey, lo: number, hi: number): Tile | undefined {
  const tiles = dry(world, tilesAt(p, world, s, lo, hi))
  if (tiles.length === 0) return undefined
  const best = Math.max(...tiles.map(t => t.x + t.y))
  return Rng.pick(p.rng, tiles.filter(t => t.x + t.y === best))
}

function go(p: Pet, world: WorldState, s: Survey, lo: number, hi: number, gait: 'walk' | 'trot' | 'run' | 'sniff'): Step[] {
  const to = pickTile(p, world, s, lo, hi)
  return to ? [{ k: 'go', to, gait }] : []
}

function pose(pose: PoseName, ms: number, extra: { face?: Dir; emote?: Fx.EmoteKind; grow?: boolean } = {}): Step {
  return { k: 'pose', pose, ms, ...extra }
}

function ms(p: Pet, lo: number, hi: number): number {
  return Math.round(Rng.range(p.rng, lo, hi))
}

// 잠자리에서 뺄 앞쪽 나무의 거리(대각선 수). 더 먼 나무는 누운 동물의 아래쪽만 조금 덮고, 나무 뒤 동물은 한 칸 걸러 비쳐 보인다.
// 4 로 넓혀도 잠든 동물이 절반 넘게 가린 시간이 줄지 않았다(세트 5 × 시드 3 × 한 시간)
const BED_CLEAR = 2

// 자기 전 아늑한 자리: 6 걸음 안의 물이 아닌 칸 중 뒤쪽(화면 위쪽)에 높은 칸을 등진 곳. 앞쪽에 나무가 있는 칸은 빼고, 다 빠지면 전부에서 고른다
function bedOf(p: Pet, world: WorldState, s: Survey): Tile | undefined {
  const near = dry(world, tilesAt(p, world, s, 0, 6))
  const open = near.filter(t => !World.hasTreeInFront(world, t.x, t.y, BED_CLEAR))
  const tiles = open.length > 0 ? open : near
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

// 선택의 BFS 범위(16 걸음) 안에서 갈 수 있는 물가 칸과 물 쪽 방향(행 우선)
function edgesOf(p: Pet, world: WorldState, s: Survey): WaterEdge[] {
  return memo(s, 'edges', () => World.waterEdgesWithin(world, s.from, s.reach.r, p.species.abilities).filter(e => Path.stepsAt(s.reach, e.x, e.y) >= 0))
}

// 한 걸음 이상 떨어진, 갈 수 있는 얕은 물 칸(행 우선)
function shallowsOf(world: WorldState, s: Survey): Tile[] {
  return memo(s, 'shallow', () => {
    const { dist, r, from } = s.reach
    const side = 2 * r + 1
    const out: Tile[] = []
    for (let i = 0; i < dist.length; i++) {
      if (dist[i]! <= 0) continue
      const t = { x: (i % side) + from.x - r, y: Math.floor(i / side) + from.y - r }
      if (World.surfaceAt(world, t.x, t.y) === 'shallow') out.push(t)
    }
    return out
  })
}

// 칸에서 가장 가까운 물까지의 맨해튼 거리. SPLASH_OUT 보다 멀면 SPLASH_OUT + 1
function waterDistOf(world: WorldState, x: number, y: number): number {
  for (let d = 0; d <= SPLASH_OUT; d++) {
    for (let i = -d; i <= d; i++) {
      const j = d - Math.abs(i)
      if (World.isWater(world, x + i, y + j) || World.isWater(world, x + i, y - j)) return d
    }
  }
  return SPLASH_OUT + 1
}

// 물보라 뒤에 나올 땅: 물에 들어간 칸 둘레 ±3 칸의 물이 아닌 걷는 칸 중, 물에서 SPLASH_OUT 만큼 떨어진 칸(없으면 더 먼 칸, 그다음 물가)으로
// 들어간 칸에 가장 가까운 칸. 같으면 난수로
function shoreOf(p: Pet, world: WorldState, s: Survey, into: Tile): Tile | undefined {
  let best: Tile[] = []
  let score = Infinity
  for (let y = into.y - 3; y <= into.y + 3; y++) {
    for (let x = into.x - 3; x <= into.x + 3; x++) {
      if (World.isWater(world, x, y) || !World.isWalkable(world, x, y, p.species.abilities) || Path.stepsAt(s.reach, x, y) < 0) continue
      const d = waterDistOf(world, x, y)
      const v = (d === SPLASH_OUT ? 0 : d > SPLASH_OUT ? 10 : 20) + Math.abs(x - into.x) + Math.abs(y - into.y)
      if (v < score) { score = v; best = [{ x, y }] } else if (v === score) best.push({ x, y })
    }
  }
  return best.length > 0 ? Rng.pick(p.rng, best) : undefined
}

// 물가를 다시 판정한다. 16 걸음 안에 물가가 없으면 목마름을 0 에 묶고, 처음 가까워지면 THIRST_START 부터 오른다
function judgeWater(p: Pet, world: WorldState, s: Survey): void {
  const near = edgesOf(p, world, s).length > 0
  if (!near) p.needs.thirst = 0
  else if (!p.waterNear) p.needs.thirst = Math.max(p.needs.thirst, THIRST_START)
  p.waterNear = near
}

// 12 걸음 안에서 갈 수 있는 나뭇가지 칸(행 우선)
function branchesOf(world: WorldState, s: Survey): Tile[] {
  return memo(s, 'branches', () => {
    const { dist, r, from } = s.reach
    const side = 2 * r + 1
    const out: Tile[] = []
    for (let i = 0; i < dist.length; i++) {
      const d = dist[i]!
      if (d < 0 || d > CHEW_REACH) continue
      const t = { x: (i % side) + from.x - r, y: Math.floor(i / side) + from.y - r }
      if (World.decoAt(world, t.x, t.y) === World.Gen.DECO_BRANCH) out.push(t)
    }
    return out
  })
}

// 나뭇가지를 내려놓을 수 있는 칸: 걷는 땅(물·블록이 아님)이고 소품·꾸밈이 없는 칸
function canLay(world: WorldState, x: number, y: number): boolean {
  const f = World.flagsAt(world, x, y)
  return (f & World.WALK) !== 0 && (f & (World.WATER | World.BLOCK | World.OBSTACLE)) === 0 && World.propAt(world, x, y) === 0 && World.decoAt(world, x, y) === 0
}

// 문 나뭇가지를 선 칸(안 되면 네 이웃)에 내려놓는다. 둘 곳이 없거나 편집 표가 꽉 찼으면 집어 든 칸에 되돌린다
function putBranch(p: Pet, world: WorldState): void {
  const hold = p.holding
  if (!hold) return
  p.holding = undefined
  const t = tileOf(p)
  const spots = [t, ...World.NEIGHBORS.map(([dx, dy]) => ({ x: t.x + dx, y: t.y + dy }))]
  for (const c of spots) if (canLay(world, c.x, c.y) && World.setDeco(world, c.x, c.y, World.Gen.DECO_BRANCH)) return
  World.setDeco(world, hold.from.x, hold.from.y, World.Gen.DECO_BRANCH)
}

// 구덩이를 팔 칸: 2~5 걸음 안의 걷는 땅(물·블록이 아님) 중 구덩이·나뭇가지가 없는 칸
function digSpotsOf(p: Pet, world: WorldState, s: Survey): Tile[] {
  return memo(s, 'digSpots', () => tilesAt(p, world, s, 2, 5).filter(t =>
    (World.flagsAt(world, t.x, t.y) & (World.WATER | World.BLOCK)) === 0 && !World.hasPit(world, t.x, t.y) && World.decoAt(world, t.x, t.y) !== World.Gen.DECO_BRANCH))
}

// 공이 길 찾기 창 밖이면 칸을 읽지 않고 false(멀리 두고 온 공의 청크를 다시 만들지 않는다)
function ballReachable(p: Pet, world: WorldState): boolean {
  if (p.carrying) return false
  const t = Ball.tileOf(p.ball)
  const at = tileOf(p)
  if (Math.abs(t.x - at.x) > Path.WINDOW || Math.abs(t.y - at.y) > Path.WINDOW) return false
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
      // 공을 물고 화면 앞쪽(사람 쪽)으로 가져와 내려놓고 앉는다. 문 공은 그리는 쪽이 입 칸에 그린다
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
      // 몸을 낮춰 살금살금 다가가 덮친다
      return act('play', [pose('bow', 300), { k: 'go', pick: { lo: 2, hi: 4 }, gait: 'creep' }, pose('bow', ms(p, 600, 1200)), { k: 'pounce' }, pose('stand', 400)])
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
  // 엎드렸다가 배를 보이며 뒹굴고, 일어나 턴다
  rollOver: {
    name: 'rollOver', cls: 'N', base: 4, drive: { play: 1 }, cooldownMs: 90_000,
    feasible: p => p.excite > 0.2 || p.needs.play > 0.2,
    adjust: FLAT,
    build: p => act('rollOver', [pose('lie', ms(p, 600, 900)), pose('roll', ms(p, 1200, 2000)), pose('stand', 200), pose('shake', 500)]),
  },
  // 화면 앞쪽 칸으로 와서 사람 쪽을 보고 앉는다. 반은 끝에 고개를 갸웃한다
  watch: {
    name: 'watch', cls: 'N', base: 6, drive: { social: 1.5 }, cooldownMs: 40_000, feasible: ALWAYS, adjust: FLAT,
    build: (p, world, s) => act('watch', [
      { k: 'go', to: frontTile(p, world, s, 0, 5), gait: 'walk', must: true },
      pose('frontSit', ms(p, 4000, 8000)),
      ...(Rng.chance(p.rng, 0.5) ? [pose('tilt', 700)] : []),
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
  // 가장 가까운 물가로 가서 물 쪽을 보고 마신다
  drink: {
    name: 'drink', cls: 'N', base: 6, drive: { thirst: 2.5 }, cooldownMs: 60_000,
    feasible: (p, world, s) => p.needs.thirst > 0.4 && edgesOf(p, world, s).length > 0,
    adjust: FLAT,
    build: (p, world, s) => {
      const edges = edgesOf(p, world, s)
      const near = Math.min(...edges.map(e => Path.stepsAt(s.reach, e.x, e.y)))
      const e = Rng.pick(p.rng, edges.filter(c => Path.stepsAt(s.reach, c.x, c.y) === near))
      const steps: Step[] = [
        { k: 'go', to: { x: e.x, y: e.y }, gait: 'walk', must: true },
        pose('drink', ms(p, 2500, 5000), { face: dirOf(e.dx, e.dy) }),
        pose('stand', 300),
      ]
      if (Rng.chance(p.rng, 0.3)) steps.push(pose('shake', 400))
      return act('drink', steps)
    },
  },
  // 얕은 물로 뛰어들어 발 둘레에 물보라를 튀기고, 물에서 조금 떨어진 땅으로 나와 몸을 턴다
  splash: {
    name: 'splash', cls: 'N', base: 2, drive: { play: 0.8 }, cooldownMs: 180_000,
    feasible: (p, world, s) => p.excite > 0.4 && p.energy > 0.4 && shallowsOf(world, s).length > 0,
    adjust: FLAT,
    build: (p, world, s) => {
      const into = Rng.pick(p.rng, shallowsOf(world, s))
      const out = shoreOf(p, world, s, into)
      return act('splash', [
        { k: 'go', to: into, gait: 'run', must: true },
        pose('stand', ms(p, 400, 800), { splash: true }),
        ...(out ? [{ k: 'go', to: out, gait: 'trot' } as Step] : []),
        pose('shake', 600),
      ])
    },
  },
  // 12 걸음 안의 나뭇가지로 가서 물고 몇 걸음 옮긴 뒤 엎드려 씹고, 그 자리에 내려놓는다. 옮긴 자리는 편집 표에 남는다.
  chew: {
    name: 'chew', cls: 'N', base: 3, drive: { play: 0.6, rest: 0.4 }, cooldownMs: 120_000,
    feasible: (p, world, s) => branchesOf(world, s).length > 0,
    adjust: FLAT,
    build: (p, world, s) => {
      const list = branchesOf(world, s)
      const near = Math.min(...list.map(t => Path.stepsAt(s.reach, t.x, t.y)))
      const to = Rng.pick(p.rng, list.filter(t => Path.stepsAt(s.reach, t.x, t.y) === near))
      return act('chew', [
        { k: 'go', to, gait: 'walk', must: true },
        pose('sniff', 400), { k: 'take' },
        { k: 'go', pick: { lo: 3, hi: 6 }, gait: 'walk' },
        pose('lie', 400), pose('chew', ms(p, 5000, 10_000)), { k: 'put' }, pose('stand', 300),
      ])
    },
  },
  // 2~5 걸음 가서 땅을 파고 킁킁댄다. 판 자리에 구덩이 흔적이 남는다(PIT_MS 동안)
  digSpot: {
    name: 'digSpot', cls: 'N', base: 3, drive: { curiosity: 0.4, play: 0.3 }, cooldownMs: 90_000,
    feasible: (p, world, s) => p.energy > 0.3 && digSpotsOf(p, world, s).length > 0,
    adjust: FLAT,
    build: (p, world, s) => act('digSpot', [
      { k: 'go', to: Rng.pick(p.rng, digSpotsOf(p, world, s)), gait: 'walk', must: true },
      pose('dig', ms(p, 2000, 3200)), { k: 'pit' }, pose('sniff', 600),
    ]),
  },
  greet: {
    name: 'greet', cls: 'G', base: 0, drive: NONE, cooldownMs: 0, feasible: ALWAYS, adjust: FLAT,
    build: (p, world, s) => greetOf(p, world, s),
  },
  dig: {
    name: 'dig', cls: 'T', base: 0, drive: NONE, cooldownMs: 0, feasible: ALWAYS, adjust: FLAT,
    build: p => act('dig', [pose('dig', ms(p, 1300, 1900), { emote: '?', grow: true }), pose('sniff', 600)]),
  },
  settle: {
    name: 'settle', cls: 'E', base: 0, drive: NONE, cooldownMs: 0, feasible: ALWAYS, adjust: FLAT,
    build: (p, world, s) => {
      const to = pickDry(p, world, s, 1, 3)
      return act('settle', [...(to ? [{ k: 'go', to, gait: 'walk' } as Step] : []), pose('frontSit', ms(p, 5000, 9000), { emote: 'heart' })])
    },
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
  // 아래는 신호만 부르는 반응이다
  // 사람 쪽을 본다(타이핑, 턴 도중 입력). 가끔 고개를 갸웃한다
  attend: {
    name: 'attend', cls: 'A', base: 0, drive: NONE, cooldownMs: 0, feasible: ALWAYS, adjust: FLAT,
    build: p => act('attend', [pose('look', ms(p, 800, 1400)), ...(Rng.chance(p.rng, 0.4) ? [pose('tilt', 700)] : [])]),
  },
  // 왼쪽 위를 보고 앉아 생각한다. 말줄임표를 PONDER_DOTS_MS 마다 띄운다. 생각이 끝나면 멈춘다
  ponder: {
    name: 'ponder', cls: 'A', base: 0, drive: NONE, cooldownMs: 0, feasible: ALWAYS, adjust: FLAT,
    build: () => act('ponder', Array.from({ length: PONDER_MAX_MS / PONDER_DOTS_MS }, () => pose('sit', PONDER_DOTS_MS, { face: 'NW', emote: 'dots' }))),
  },
  // 서브에이전트를 오른쪽 위로 배웅한다
  seeOff: {
    name: 'seeOff', cls: 'A', base: 0, drive: NONE, cooldownMs: 0, feasible: ALWAYS, adjust: FLAT,
    build: () => act('seeOff', [pose('stand', 400, { face: 'NE' }), pose('look', 400, { emote: 'note' })]),
  },
  // 대화를 압축하면 몸을 털고 기지개
  shakeOff: {
    name: 'shakeOff', cls: 'A', base: 0, drive: NONE, cooldownMs: 0, feasible: ALWAYS, adjust: FLAT,
    build: () => act('shakeOff', [pose('shake', 700), pose('stretch', 900)]),
  },
  // 읽기·찾기 도구: 한 걸음 안에서 코를 박는다
  nose: {
    name: 'nose', cls: 'T', base: 0, drive: NONE, cooldownMs: 0, feasible: ALWAYS, adjust: FLAT,
    build: (p, world, s) => act('nose', [...go(p, world, s, 0, 1, 'sniff'), pose('sniff', ms(p, 800, 1400), { grow: true })]),
  },
  // 바깥 도구(웹, MCP): 오른쪽 위를 보고 귀를 세웠다가 한두 칸 가 본다
  alert: {
    name: 'alert', cls: 'T', base: 0, drive: NONE, cooldownMs: 0, feasible: ALWAYS, adjust: FLAT,
    build: (p, world, s) => act('alert', [pose('alert', ms(p, 1200, 2000), { face: 'NE', grow: true }), ...go(p, world, s, 1, 2, 'trot')]),
  },
  // 도구 오류: 귀를 세우고 입을 두 번 벌려 짖는다
  bark: {
    name: 'bark', cls: 'T', base: 0, drive: NONE, cooldownMs: 0, feasible: ALWAYS, adjust: FLAT,
    build: () => act('bark', [pose('alert', 200), pose('alert', 600, { emote: 'bark' }), pose('stand', 400)]),
  },
  // 오래 도는 도구: 앞쪽 칸에 와서 사람 쪽을 보고 앉아 기다린다. 도구가 끝나면 멈춘다
  wait: {
    name: 'wait', cls: 'T', base: 0, drive: NONE, cooldownMs: 0, feasible: ALWAYS, adjust: FLAT,
    build: () => act('wait', [{ k: 'go', pick: { lo: 1, hi: 3, front: true }, gait: 'walk' }, pose('frontSit', 6000)]),
  },
  // 권한 대기: 앞쪽 칸에서 사람 쪽을 보고 앞발을 들어 조른다
  beg: {
    name: 'beg', cls: 'P', base: 0, drive: NONE, cooldownMs: 0, feasible: ALWAYS, adjust: FLAT,
    build: p => act('beg', [{ k: 'go', pick: { lo: 1, hi: 3, front: true }, gait: 'walk' }, pose('beg', ms(p, 2500, 3500), { emote: '?' }), pose('frontSit', 3000)]),
  },
  // 턴 오류·연속 실패: 귀를 처뜨리고 엎드려 있다가 기지개
  sulk: {
    name: 'sulk', cls: 'E', base: 0, drive: NONE, cooldownMs: 0, feasible: ALWAYS, adjust: FLAT,
    build: p => act('sulk', [pose('droop', ms(p, 3000, 5000)), pose('stretch', 900)]),
  },
  // 턴 중단: 제자리에서 솟았다가 사람 쪽을 본다
  startle: {
    name: 'startle', cls: 'E', base: 0, drive: NONE, cooldownMs: 0, feasible: ALWAYS, adjust: FLAT,
    build: () => act('startle', [{ k: 'hop', peakPx: 6, ms: 300 }, pose('look', 600, { emote: '!' })]),
  },
  // 거절: 사람 쪽을 보고 앉아 있다가 고개를 갸웃하며 물음표
  puzzled: {
    name: 'puzzled', cls: 'E', base: 0, drive: NONE, cooldownMs: 0, feasible: ALWAYS, adjust: FLAT,
    build: () => act('puzzled', [pose('frontSit', 2000), pose('tilt', 700, { emote: '?' })]),
  },
}

// 인사: 자고 있었으면 깨어나 털고, 사람 쪽을 보며 ! 를 띄운 뒤 달려간다. 짧은 프롬프트(글자 수를 알 때)에는 속보로 조금만 간다
function greetOf(p: Pet, world: WorldState, s: Survey, text?: string): Activity {
  const steps: Step[] = p.isAsleep ? [pose('wake', 700), pose('stretch', 900), pose('shake', 500)] : []
  const isShort = text !== undefined && text.length < SHORT_PROMPT
  steps.push(pose('look', 350, { emote: '!' }), ...(isShort ? go(p, world, s, 3, 6, 'trot') : go(p, world, s, 5, 12, 'run')), pose('pant', ms(p, 900, 1400)))
  return act('greet', steps)
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
  const longTurn = p.turnStartedAt !== undefined && now - p.turnStartedAt > BUSY_TURN_MS
  return NORMAL_ACTS.map(name => {
    const def = ACTS[name]
    const end = p.lastEndAt[name]
    const isCooling = (end !== undefined && p.simMs - end < def.cooldownMs) || p.simMs < (p.blockedUntil[name] ?? -Infinity)
    if (isCooling) return [name, 0] as const
    const rest = longTurn && (name === 'sit' || name === 'lie') ? LONG_TURN_REST : 1
    const w = def.base * (p.species.behavior.actMul[name] ?? 1) * penaltyOf(name, p.history, REPEAT_PENALTY) * def.adjust(p, busy) * rest * driveOf(p, def)
    return [name, w > 0 && def.feasible(p, world, s) ? w : 0] as const
  })
}

function choose(p: Pet, world: WorldState, now: number): Activity {
  const queued = p.queue.shift()
  if (queued) return queued
  if (p.permissionSince !== undefined) return begOf(p, world, now)
  const s = surveyOf(p, world)
  judgeWater(p, world, s)
  // 목마름이 급하면 오래 도는 도구를 기다리기 전에 마시러 간다
  if (p.needs.thirst >= THIRST_URGENT && !(p.simMs < (p.blockedUntil.drink ?? -Infinity)) && ACTS.drink.feasible(p, world, s)) return ACTS.drink.build(p, world, s)
  if (isWaiting(p, now)) return build('wait', p, world)
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
  b.settled = false
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

// 행동을 멈춘다: 걷던 길과 문 공을 버리고 남은 단계를 건너뛴다. 다음 스텝에 대기열이나 새 선택으로 넘어간다
function end(p: Pet): void {
  release(p)
  p.path = []
  p.crouchMs = 0
  if (p.hop) p.hop.isPath = false
  p.act.i = p.act.steps.length
}

// 신호 반응을 정하는 부류. 잠자리로 가는 중(아직 잠들지 않음)은 평소로 친다.
// 그래야 그 사이에 온 도구 호출에도 반응하고, 도구가 도는 동안 잠들지 않는다
function classOf(p: Pet): ActClass {
  if (p.isAsleep) return 'S'
  const cls = ACTS[p.act.name].cls
  return cls === 'S' ? 'N' : cls
}

// 신호가 지금 행동에 하는 일.
// cut: 끊고 반응 시작, queueFront·queueBack: 대기열 앞·뒤에 넣기(같은 이름이 있으면 안 넣음), extend: 도구 반응 자세 늘리기,
// resume: 지금 행동의 남은 단계를 대기열 앞에 되돌려 놓고 끊기, drop: 시각만 적고 버리기, ear: 얼굴만 잠깐 돌리기(자면 z 하나 건너뛰기)
export type Rule = 'cut' | 'queueFront' | 'queueBack' | 'extend' | 'resume' | 'drop' | 'ear'
export type Signal = 'tool' | 'subTool' | 'fail' | 'permission' | 'turnEnd' | 'think' | 'typing' | 'spawn' | 'compact'

function row(N: Rule, S: Rule, A: Rule, T: Rule, P: Rule, E: Rule, G: Rule): Readonly<Record<ActClass, Rule>> {
  return { N, S, A, T, P, E, G }
}

// 신호 × 지금 행동 부류(평소, 잠, 가벼운 반응, 도구 반응, 권한 대기, 턴 결과, 사람 직접).
// 프롬프트는 이 표 밖이다: 어느 부류든 끊고 대기열을 비운다(자고 있었으면 깨어나는 단계부터)
export const RULES: Readonly<Record<Signal, Readonly<Record<ActClass, Rule>>>> = {
  tool: row('cut', 'drop', 'cut', 'extend', 'drop', 'resume', 'queueFront'),
  subTool: row('ear', 'drop', 'drop', 'drop', 'drop', 'drop', 'drop'),
  fail: row('cut', 'drop', 'cut', 'cut', 'drop', 'drop', 'queueBack'),
  permission: row('cut', 'drop', 'cut', 'cut', 'extend', 'queueFront', 'queueBack'),
  turnEnd: row('cut', 'drop', 'cut', 'queueBack', 'queueBack', 'cut', 'queueBack'),
  think: row('cut', 'drop', 'drop', 'drop', 'drop', 'drop', 'drop'),
  typing: row('cut', 'ear', 'drop', 'drop', 'drop', 'drop', 'drop'),
  spawn: row('cut', 'drop', 'drop', 'drop', 'drop', 'drop', 'drop'),
  compact: row('cut', 'drop', 'queueBack', 'queueBack', 'queueBack', 'queueBack', 'queueBack'),
}

// 토큰 통에서 하나를 꺼낸다. 비었으면 false
function take(p: Pet, name: BucketName, now: number): boolean {
  const b = p.buckets[name]
  const { cap, everyMs } = BUCKETS[name]
  b.tokens = Math.min(cap, b.tokens + Math.max(0, now - b.at) / everyMs)
  b.at = now
  if (b.tokens < 1) return false
  b.tokens -= 1
  return true
}

function enqueue(p: Pet, a: Activity, front: boolean): void {
  if (front) p.queue.unshift(a)
  else p.queue.push(a)
  while (p.queue.length > QUEUE_MAX) {
    let i = p.queue.length - 1
    while (i >= 0 && ACTS[p.queue[i]!.name].cls !== 'A') i--
    p.queue.splice(i >= 0 ? i : p.queue.length - 1, 1)
  }
}

function grow(p: Pet): void {
  const step = p.act.steps[p.act.i]
  if (step?.k === 'pose' && step.grow && step.ms < GROW_MAX_MS) step.ms = Math.min(GROW_MAX_MS, step.ms + GROW_MS)
}

function ear(p: Pet, dir?: Dir): void {
  if (p.isAsleep) { p.skipZ = true; return }
  if (!dir || isMoving(p) || p.glance) return
  p.glance = { dir, back: p.dir, ms: GLANCE_MS }
  Motion.faceTo(p, ...DIR_VEC[dir])
}

// 돌린 얼굴을 되돌린다. 그 사이 행동이 방향을 바꿨거나 걷기 시작했으면 그대로 둔다
function settleGlance(p: Pet, dtMs: number): void {
  const g = p.glance
  if (!g) return
  g.ms -= dtMs
  if (g.ms > 0 && !isMoving(p)) return
  if (!isMoving(p) && p.dir === g.dir) Motion.faceTo(p, ...DIR_VEC[g.back])
  p.glance = undefined
}

// 표대로 반응한다. make 는 반응 행동이 실제로 필요할 때만 부른다(난수를 쓰므로)
function react(p: Pet, world: WorldState, signal: Signal, name: ActName, make: () => Activity = () => build(name, p, world), dir?: Dir): Rule {
  const rule = RULES[signal][classOf(p)]
  switch (rule) {
    case 'cut':
      interrupt(p, make())
      break
    case 'resume': {
      const cur = p.act
      enqueue(p, act(cur.name, cur.steps.slice(cur.i).map(step => step.k === 'pose' ? { ...step, emote: undefined } : step)), true)
      interrupt(p, make())
      break
    }
    case 'queueFront':
    case 'queueBack':
      if (!p.queue.some(a => a.name === name)) enqueue(p, make(), rule === 'queueFront')
      break
    case 'extend':
      grow(p)
      break
    case 'ear':
      ear(p, dir)
      break
    case 'drop':
      break
  }
  return rule
}

function isWaiting(p: Pet, now: number): boolean {
  return p.toolSince !== undefined && now - p.toolSince >= WAIT_AFTER_MS
}

// 권한 대기가 오래 가면 조르기를 그만두고 앞쪽 칸에서 엎드려 기다린다(잠은 아니다)
function begOf(p: Pet, world: WorldState, now: number): Activity {
  if (now - (p.permissionSince ?? now) < BEG_FOR_MS) return build('beg', p, world)
  return act('beg', [{ k: 'go', pick: { lo: 1, hi: 3, front: true }, gait: 'walk' }, pose('lieRest', 10_000)])
}

// 도구 이름에 따른 반응. 이름을 모르거나 없으면 판다
const READ_TOOLS: ReadonlySet<string> = new Set(['Read', 'Grep', 'Glob', 'ToolSearch', 'TaskOutput', 'ListAgents'])
const OUTSIDE_TOOLS: ReadonlySet<string> = new Set(['WebFetch', 'WebSearch'])

export function toolReaction(tool?: string): 'nose' | 'alert' | 'dig' {
  if (tool === undefined) return 'dig'
  if (READ_TOOLS.has(tool)) return 'nose'
  if (OUTSIDE_TOOLS.has(tool) || tool.startsWith('mcp__')) return 'alert'
  return 'dig'
}

// 프롬프트: 무엇을 하든 끊고 대기열을 비운다. 글이 빈 턴(이어 하기)은 달려가지 않고 사람 쪽만 본다
export function onTurnStart(p: Pet, world: WorldState, now: number, text?: string): void {
  p.lastSignalAt = now
  p.lastHumanAt = now
  p.turnStartedAt = now
  // 앞 턴이 생각 도중 끝났으면 그 생각 시작 시각이 남아 있다
  p.thinkSince = undefined
  p.excite = Math.min(1, p.excite + p.species.behavior.exciteGain.turnStart)
  p.needs.social = Math.max(0, p.needs.social - 0.3)
  p.queue = []
  const s = surveyOf(p, world)
  if (text === '') {
    const wake: Step[] = p.isAsleep ? [pose('wake', 700), pose('stretch', 900)] : []
    interrupt(p, act('attend', [...wake, ...ACTS.attend.build(p, world, s).steps]))
  } else {
    interrupt(p, greetOf(p, world, s, text))
  }
  p.isAsleep = false
}

// 메인 루프의 도구 호출. 도구 반응 중이면 자세를 늘리고, 아니면 통에 토큰이 있을 때만 반응한다
export function onTool(p: Pet, world: WorldState, now: number, tool?: string): void {
  p.lastSignalAt = now
  const rule = RULES.tool[classOf(p)]
  if (rule === 'drop') return
  if (rule === 'extend') { grow(p); return }
  if (!take(p, 'toolMain', now)) return
  react(p, world, 'tool', toolReaction(tool))
}

// 서브에이전트의 도구 호출: 평소 행동 중일 때만 오른쪽 위로 얼굴을 잠깐 돌린다
export function onSubTool(p: Pet, now: number): void {
  p.lastSignalAt = now
  if (RULES.subTool[classOf(p)] === 'drop' || !take(p, 'toolSub', now)) return
  ear(p, 'NE')
}

// 메인 도구의 오류(error)나 거부(deny). 20 초 안의 두 번째 실패면 풀이 죽는다
export function onToolFail(p: Pet, world: WorldState, now: number, kind: 'error' | 'deny'): void {
  p.lastSignalAt = now
  if (RULES.fail[classOf(p)] === 'drop' || !take(p, 'error', now)) return
  const name = now - p.lastFailAt < FAIL_STREAK_MS ? 'sulk' : kind === 'error' ? 'bark' : 'puzzled'
  p.lastFailAt = now
  react(p, world, 'fail', name)
}

// 권한 대기 시작·끝. 대기가 이어지는 동안은 행동을 고를 때마다 조르기를 고른다
export function onPermission(p: Pet, world: WorldState, now: number): void {
  p.lastSignalAt = now
  p.permissionSince ??= now
  react(p, world, 'permission', 'beg', () => begOf(p, world, now))
}

export function onPermissionEnd(p: Pet): void {
  p.permissionSince = undefined
  p.queue = p.queue.filter(a => a.name !== 'beg')
  if (p.act.name === 'beg') end(p)
}

export type TurnEnd = 'answer' | 'aborted' | 'error' | 'refusal'

// 메인 턴 끝: 답했으면 자리잡기(2 분 넘은 턴이면 기지개·털기 먼저), 중단이면 놀람, 오류면 풀 죽기, 거절이면 갸웃
export function onTurnEnd(p: Pet, world: WorldState, now: number, reason: TurnEnd = 'answer', durationMs = 0): void {
  p.lastSignalAt = now
  p.turnStartedAt = undefined
  p.thinkSince = undefined
  if (classOf(p) === 'S') return
  p.excite = Math.min(1, p.excite + p.species.behavior.exciteGain.turnEnd)
  p.queue = p.queue.filter(a => ACTS[a.name].cls !== 'E')
  const name = reason === 'aborted' ? 'startle' : reason === 'error' ? 'sulk' : reason === 'refusal' ? 'puzzled' : 'settle'
  const make = () => {
    const a = build(name, p, world)
    if (name === 'settle' && durationMs >= LONG_TURN_MS) a.steps.unshift(pose('stretch', 900), pose('shake', 500))
    return a
  }
  react(p, world, 'turnEnd', name, make)
}

export function onStream(p: Pet, now: number): void {
  p.lastSignalAt = now
  p.busyUntil = now + 2500
}

// 메인 루프 생각 조각(첫 조각과 그 뒤 몇 조각마다 시각을 받는다). 글·도구 조각 없이 3 초가 넘으면 앉아서 생각한다
export function onThinkPiece(p: Pet, world: WorldState, now: number): void {
  p.lastSignalAt = now
  if (p.thinkSince === undefined) { p.thinkSince = now; return }
  if (now - p.thinkSince < PONDER_AFTER_MS || p.act.name === 'ponder') return
  react(p, world, 'think', 'ponder')
}

// 메인 루프의 글이나 도구 조각: 생각이 끝났다
export function onThinkEnd(p: Pet): void {
  p.thinkSince = undefined
  if (p.act.name === 'ponder') end(p)
}

// 사람이 프롬프트 칸에 타이핑한다. 4 초에 한 번까지 사람 쪽을 본다. 자고 있으면 z 하나만 건너뛴다
export function onTyping(p: Pet, world: WorldState, now: number): void {
  p.lastSignalAt = now
  p.lastHumanAt = now
  if (RULES.typing[classOf(p)] === 'drop' || !take(p, 'attend', now)) return
  p.needs.social = Math.max(0, p.needs.social - 0.03)
  react(p, world, 'typing', 'attend')
}

// 턴이 도는 중에 사람이 프롬프트를 더 보냈다: 사람 쪽을 보고 !
export function onPromptQueued(p: Pet, world: WorldState, now: number): void {
  p.lastSignalAt = now
  p.lastHumanAt = now
  react(p, world, 'typing', 'attend', () => act('attend', [pose('look', ms(p, 800, 1400), { emote: '!' })]))
}

// 서브에이전트가 떠날 때 배웅하고, 끝나면 잠깐 사람 쪽을 본다(평소 행동 중일 때만)
export function onSubagentStart(p: Pet, world: WorldState, now: number): void {
  p.lastSignalAt = now
  react(p, world, 'spawn', 'seeOff')
}

export function onSubagentEnd(p: Pet, world: WorldState, now: number): void {
  p.lastSignalAt = now
  react(p, world, 'spawn', 'seeOff', () => act('seeOff', [pose('look', 500, { emote: 'note' })]))
}

// 대화 압축: 오래된 방문 기록 절반을 잊고 몸을 턴다
export function onCompact(p: Pet, world: WorldState, now: number): void {
  p.lastSignalAt = now
  let drop = p.visits.size >> 1
  for (const key of p.visits.keys()) {
    if (drop-- <= 0) break
    p.visits.delete(key)
  }
  react(p, world, 'compact', 'shakeOff')
}

// 도구 시작·끝. 서브에이전트 것도 세어 잠들지 않게 하고, 메인 것만 기다리기 시계를 잰다
export function onToolStart(p: Pet, now: number, isMain = true): void {
  p.lastSignalAt = now
  p.toolsRunning++
  if (isMain && p.mainTools++ === 0) p.toolSince = now
}

export function onToolEnd(p: Pet, now: number, isMain = true): void {
  p.lastSignalAt = now
  p.toolsRunning = Math.max(0, p.toolsRunning - 1)
  if (!isMain) return
  p.mainTools = Math.max(0, p.mainTools - 1)
  if (p.mainTools > 0) return
  p.toolSince = undefined
  if (p.act.name === 'wait') end(p)
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

// 단계 하나를 돌린다. 끝났으면 true. now 는 실제 시각(구덩이 흔적이 사라질 때를 잰다)
function runStep(p: Pet, world: WorldState, step: Step, a: Activity, dtMs: number, isStart: boolean, now: number): boolean {
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
    case 'hop': {
      if (isStart && !p.hop) Motion.hopInPlace(p, step.peakPx, step.ms)
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
    case 'take': {
      const t = tileOf(p)
      if (World.decoAt(world, t.x, t.y) === World.Gen.DECO_BRANCH && World.setDeco(world, t.x, t.y, 0)) p.holding = { from: t }
      else end(p)
      return true
    }
    case 'put': {
      putBranch(p, world)
      return true
    }
    case 'pit': {
      const t = tileOf(p)
      if ((World.flagsAt(world, t.x, t.y) & (World.WATER | World.BLOCK)) === 0) World.addPit(world, t.x, t.y, now)
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
// 사람 곁은 사람 신호가 30 초 넘게 없으면 오르고, 있거나 사람 쪽을 보고 앉아 있으면 내린다.
// 목마름은 늘 조금씩 오르고 속보·달리기 중에는 더 오르며, 마시는 행동에서 멈춰 마시는 자세로 있는 동안 내린다. 16 걸음 안에 물가가 없으면 0 에 묶는다
function updateNeeds(p: Pet, dtMs: number, now: number): void {
  const dt = dtMs / 1000
  const n = p.needs
  const moving = isMoving(p)
  const sniffing = moving ? p.gait === 'sniff' : p.pose === 'sniff'
  n.curiosity = clamp01(n.curiosity + (0.005 - (sniffing ? 0.01 : 0)) * dt)
  const playing = p.act.name === 'play' || p.act.name === 'run' || p.act.name === 'rollOver' || p.act.name === 'splash' || p.act.name === 'chew'
  n.play = clamp01(n.play + (0.003 + 0.006 * p.excite - (playing ? 0.015 : 0)) * dt)
  const alone = now - p.lastHumanAt > SOCIAL_QUIET_MS
  const facing = !moving && (p.pose === 'frontSit' || p.pose === 'tilt') && p.act.name === 'watch'
  n.social = clamp01(n.social + ((alone ? 0.004 : -0.01) - (facing ? 0.06 : 0)) * dt)
  if (!p.waterNear) {
    n.thirst = 0
    return
  }
  const fast = moving && (p.gait === 'trot' || p.gait === 'run')
  const drinking = !moving && p.act.name === 'drink' && p.pose === 'drink'
  n.thirst = clamp01(n.thirst + (THIRST_RATE + (fast ? THIRST_MOVING : 0) - (drinking ? THIRST_DRINK : 0)) * dt)
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
  b.settled = false
}

// 고정 스텝 한 번. now 는 실제 시각(잠들기 판정에 쓴다)
export function update(p: Pet, world: WorldState, dtMs: number, now: number): void {
  p.simMs += dtMs
  if (p.toolsRunning > 0) p.lastSignalAt = now
  if (!p.isAsleep && !isEvent(p.act) && now - p.lastSignalAt >= Names.SLEEP_AFTER_MS) {
    p.queue = []
    interrupt(p, build('bedtime', p, world))
  }
  // 마시는 중이면 다 마시고 나서 기다리러 온다(목마름이 급하면 기다리기보다 마시기를 먼저 고르므로)
  if (isWaiting(p, now) && classOf(p) === 'N' && p.act.name !== 'drink') interrupt(p, build('wait', p, world))
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
    if (!runStep(p, world, step, a, isStart ? 0 : dtMs, isStart, now)) break
    a.i++
  }
  // 씹기가 끊겼으면 문 나뭇가지를 그 자리에 내려놓는다
  if (p.holding && p.act.name !== 'chew') putBranch(p, world)
  settleGlance(p, dtMs)
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

// 제자리 자세가 내는 효과: 파면 흙이 뒤로 튀고, 털면 물방울이 옆으로, 물에서 첨벙대면 물보라가 발 둘레로, 자면 z 가 하나씩 떠오른다
function emit(p: Pet, dtMs: number): void {
  const step = p.act.steps[p.act.i]
  const splashing = step?.k === 'pose' && step.splash === true
  const every = splashing ? 70 : p.pose === 'dig' ? 80 : p.pose === 'shake' ? 60 : p.pose === 'sleep' ? 1700 : 0
  if (every === 0) return
  p.fxClock += dtMs
  if (p.fxClock < every) return
  p.fxClock = 0
  // 자는 중 신호가 왔으면 z 하나를 건너뛴다
  if (p.pose === 'sleep' && p.skipZ) { p.skipZ = false; return }
  const s = Iso.screenOf(p.x, p.y, p.z)
  const back = isRight(p.dir) ? -1 : 1
  if (splashing) {
    const side = Rng.chance(p.fxRng, 0.5) ? 1 : -1
    Fx.spawn(p.particles, { kind: 'splash', x: s.sx + side * Rng.range(p.fxRng, 1, 5), y: s.sy - 1, vx: side * Rng.range(p.fxRng, 10, 30), vy: -Rng.range(p.fxRng, 30, 55), g: 220, life: 380 })
  } else if (p.pose === 'dig') {
    Fx.spawn(p.particles, { kind: 'dirt', x: s.sx - back * 3, y: s.sy - 1, vx: back * Rng.range(p.fxRng, 25, 50), vy: -Rng.range(p.fxRng, 45, 75), g: 280, life: 420 })
  } else if (p.pose === 'shake') {
    const side = Rng.chance(p.fxRng, 0.5) ? 1 : -1
    Fx.spawn(p.particles, { kind: 'drop', x: s.sx + side * 5, y: s.sy - 5 - Rng.int(p.fxRng, 0, 2), vx: side * Rng.range(p.fxRng, 20, 40), vy: -Rng.range(p.fxRng, 10, 30), g: 160, life: 350 })
  } else {
    Fx.spawn(p.particles, { kind: 'z', x: s.sx - back * 4, y: s.sy - 7, vx: -back * 4, vy: -7, g: 0, life: 2200 })
  }
}
