import Names from '../../hooks/names'
import Pet, { type ActName, type Pet as PetState, type PoseName } from '../../hooks/pet'
import World, { type World as WorldState } from '../../hooks/world'

// 한 번 돌린 기록.
// acts·endedAt: 끝났거나 신호로 끊긴 평소 행동 이름과 끝난 시각(시뮬레이션 ms). durations: 스스로 끝난 평소 행동의 길이.
// 목적지를 못 찾아 그만둔 행동은 aborted 로만 센다.
// possible: 5 초마다 가중치를 재서 한 번이라도 0 보다 컸던 평소 행동. tiles: 밟은 칸 수, walkable: 시작 칸 둘레 걷는 칸 수
export type SimLog = {
  acts: ActName[]
  durations: number[]
  endedAt: number[]
  aborted: number
  possible: Set<ActName>
  tiles: number
  walkable: number
  longestStallMs: number
  // 프롬프트 직후에 인사를 시작하지 않은 횟수(세션 대본만)
  missed: number
}

const T0 = 1_000_000
// 멈춰 있어도 되는 자세(쉬는 중). 정지 구간을 잴 때 뺀다
const RESTING = new Set<PoseName>(['sit', 'frontSit', 'lie', 'lieRest', 'sleep'])
const SAMPLE_MS = 5000

type Cue = { at: number; kind: 'prompt' | 'stream' | 'tool' | 'end' }

// 세션 대본: 90~180 초마다 프롬프트, 글 조각, 도구 3~8 회(0.3~3 초 간격), 턴 끝 순서. 시드로 정해진다
export function sessionScript(seed: number, minutes: number): Cue[] {
  let s = (seed * 2654435761) >>> 0
  const next = () => { s = (s + 0x6d2b79f5) >>> 0; let t = Math.imul(s ^ (s >>> 15), s | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296 }
  const out: Cue[] = []
  let at = 5000
  const end = minutes * 60_000
  while (at < end) {
    out.push({ at, kind: 'prompt' })
    let t = at + 800
    out.push({ at: t, kind: 'stream' })
    const tools = 3 + Math.floor(next() * 6)
    for (let i = 0; i < tools; i++) { t += 300 + next() * 2700; out.push({ at: t, kind: 'tool' }) }
    t += 1500
    out.push({ at: t, kind: 'stream' })
    out.push({ at: t + 2000, kind: 'end' })
    at += 90_000 + next() * 90_000
  }
  return out
}

function run(seed: number, minutes: number, cues: Cue[] | undefined, tweak?: (p: PetState) => void): SimLog {
  const world = World.create(seed)
  const p = Pet.create(world, seed, T0)
  tweak?.(p)
  const log: SimLog = { acts: [], durations: [], endedAt: [], aborted: 0, possible: new Set(), tiles: 0, walkable: walkableAround(world), longestStallMs: 0, missed: 0 }
  const seen = new Set<number>()
  let act = p.act
  let startedAt = 0
  let aborts = abortsOf(p)
  let still = 0
  let lastKey = ''
  let next = 0
  const steps = Math.round((minutes * 60_000) / Names.SIM_STEP_MS)
  for (let i = 1; i <= steps; i++) {
    const t = i * Names.SIM_STEP_MS
    const now = T0 + t
    if (!cues) p.lastSignalAt = now
    while (cues && next < cues.length && cues[next]!.at <= t) {
      const kind = cues[next++]!.kind
      if (kind === 'prompt') {
        Pet.onTurnStart(p, world, now)
        if (p.act.name !== 'greet') log.missed++
      } else if (kind === 'stream') Pet.onStream(p, now)
      else if (kind === 'tool') Pet.onTool(p, world, now)
      else Pet.onTurnEnd(p, world, now)
    }
    if (i % Math.round(SAMPLE_MS / Names.SIM_STEP_MS) === 0 && Pet.ACTS[p.act.name].cls === 'N') {
      for (const [name, w] of Pet.weightsOf(p, world, Pet.surveyOf(p, world), now)) if (w > 0) log.possible.add(name)
    }
    Pet.update(p, world, Names.SIM_STEP_MS, now)
    if (p.act !== act) {
      const nowAborts = abortsOf(p)
      if (nowAborts > aborts) log.aborted += nowAborts - aborts
      else if (Pet.ACTS[act.name].cls === 'N') {
        log.acts.push(act.name)
        log.endedAt.push(p.simMs)
        if (act.i >= act.steps.length) log.durations.push(p.simMs - startedAt)
      }
      aborts = nowAborts
      act = p.act
      startedAt = p.simMs
    }
    const tile = Pet.tileOf(p)
    seen.add((tile.x & 0xffff) | (tile.y << 16))
    const key = `${p.x.toFixed(3)},${p.y.toFixed(3)},${p.z.toFixed(2)},${p.pose},${p.dir}`
    still = key === lastKey && !RESTING.has(p.pose) ? still + Names.SIM_STEP_MS : 0
    lastKey = key
    log.longestStallMs = Math.max(log.longestStallMs, still)
  }
  log.tiles = seen.size
  return log
}

function abortsOf(p: PetState): number {
  return (p as { aborts?: number }).aborts ?? 0
}

function walkableAround(world: WorldState): number {
  let n = 0
  const { x, y } = world.spawn
  for (let j = y - 24; j <= y + 24; j++) for (let i = x - 24; i <= x + 24; i++) if (World.isWalkable(world, i, j)) n++
  return n
}

// 평소만: 신호 함수를 부르지 않고 매 스텝 마지막 신호 시각을 지금으로 두어 잠들지도 끊기지도 않게 한다
export function simulateQuiet(seed: number, minutes: number, tweak?: (p: PetState) => void): SimLog {
  return run(seed, minutes, undefined, tweak)
}

// 세션 대본대로
export function simulateSession(seed: number, minutes: number): SimLog {
  return run(seed, minutes, sessionScript(seed, minutes))
}

export type Metrics = {
  // 가장 많은 평소 행동의 비율, 같은 행동이 바로 이어진 비율, 3 개 묶음이 바로 앞 3 개와 같은 비율(모든 기록을 합쳐서)
  maxShare: number
  repeat: number
  triple: number
  // 합친 분포의 엔트로피 ÷ log2(어느 기록에서든 가능했던 평소 행동 수)
  entropy: number
  // 기본 가중치 ≥ 4 이고 그 기록에서 가능했던 행동이 모두 한 번 이상 나온 기록의 비율
  inclusion: number
  // 기본 가중치 ≤ 4 인 행동이 다시 나오기까지 걸린 시간의 중앙값(ms). 그런 행동이 두 번 이상 나온 적 없으면 Infinity
  rareGapMs: number
  // 끝난 행동 대비 중단된 행동 비율
  abortRate: number
  shortestMs: number
  longestStallMs: number
  // 기록마다 밟은 칸 수 ÷ min(60, 걷는 칸의 35 %) 중 가장 작은 값
  coverage: number
  missed: number
}

export function metricsOf(logs: readonly SimLog[]): Metrics {
  const counts = new Map<ActName, number>()
  let total = 0
  let repeat = 0
  let pairs = 0
  let triple = 0
  let windows = 0
  let included = 0
  let finished = 0
  let aborted = 0
  const possible = new Set<ActName>()
  const gaps: number[] = []
  for (const log of logs) {
    const a = log.acts
    for (const name of a) counts.set(name, (counts.get(name) ?? 0) + 1)
    total += a.length
    for (let i = 1; i < a.length; i++) { pairs++; if (a[i] === a[i - 1]) repeat++ }
    for (let i = 5; i < a.length; i++) { windows++; if (a[i] === a[i - 3] && a[i - 1] === a[i - 4] && a[i - 2] === a[i - 5]) triple++ }
    for (const name of log.possible) possible.add(name)
    const need = [...log.possible].filter(name => Pet.ACTS[name].base >= 4)
    if (need.every(name => a.includes(name))) included++
    finished += a.length
    aborted += log.aborted
    const lastAt = new Map<ActName, number>()
    a.forEach((name, i) => {
      if (Pet.ACTS[name].base > 4) return
      const prev = lastAt.get(name)
      if (prev !== undefined) gaps.push(log.endedAt[i]! - prev)
      lastAt.set(name, log.endedAt[i]!)
    })
  }
  let most = 0
  let h = 0
  for (const n of counts.values()) {
    most = Math.max(most, n)
    const q = n / total
    h -= q * Math.log2(q)
  }
  gaps.sort((x, y) => x - y)
  return {
    maxShare: most / total,
    repeat: repeat / Math.max(1, pairs),
    triple: triple / Math.max(1, windows),
    entropy: h / Math.log2(Math.max(2, possible.size)),
    inclusion: included / logs.length,
    rareGapMs: gaps.length > 0 ? gaps[gaps.length >> 1]! : Infinity,
    abortRate: aborted / Math.max(1, finished + aborted),
    shortestMs: Math.min(...logs.flatMap(l => l.durations)),
    longestStallMs: Math.max(...logs.map(l => l.longestStallMs)),
    coverage: Math.min(...logs.map(l => l.tiles / Math.min(60, l.walkable * 0.35))),
    missed: logs.reduce((n, l) => n + l.missed, 0),
  }
}
