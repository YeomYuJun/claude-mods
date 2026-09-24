import Names from '../../hooks/names'
import Pet, { type ActName, type Pet as PetState, type PoseName } from '../../hooks/pet'
import World from '../../hooks/world'

// 한 번 돌린 기록: 끝난 평소 행동 이름과 길이(시뮬레이션 ms), 밟은 칸 수, 멈춰 있던 가장 긴 구간
export type SimLog = { acts: ActName[]; durations: number[]; tiles: number; longestStallMs: number }

// 멈춰 있어도 되는 자세(쉬는 중). 정지 구간을 잴 때 뺀다
const RESTING = new Set<PoseName>(['sit', 'frontSit', 'lie', 'lieRest', 'sleep'])

// 평소만: 신호 함수를 부르지 않고 매 스텝 마지막 신호 시각을 지금으로 두어 잠들지도 끊기지도 않게 한다
export function simulateQuiet(seed: number, minutes: number, tweak?: (p: PetState) => void): SimLog {
  const world = World.create(seed)
  const now0 = 1_000_000
  const p = Pet.create(world, seed, now0)
  tweak?.(p)
  const log: SimLog = { acts: [], durations: [], tiles: 0, longestStallMs: 0 }
  const seen = new Set<number>()
  let act = p.act
  let startedAt = 0
  let still = 0
  let lastKey = ''
  const steps = Math.round((minutes * 60_000) / Names.SIM_STEP_MS)
  for (let i = 1; i <= steps; i++) {
    const now = now0 + i * Names.SIM_STEP_MS
    p.lastSignalAt = now
    Pet.update(p, world, Names.SIM_STEP_MS, now)
    if (p.act !== act) {
      if (Pet.ACTS[act.name].cls === 'N') { log.acts.push(act.name); log.durations.push(p.simMs - startedAt) }
      act = p.act
      startedAt = p.simMs
    }
    const t = Pet.tileOf(p)
    seen.add((t.x & 0xffff) | (t.y << 16))
    const key = `${p.x.toFixed(3)},${p.y.toFixed(3)},${p.z.toFixed(2)},${p.pose},${p.dir}`
    still = key === lastKey && !RESTING.has(p.pose) ? still + Names.SIM_STEP_MS : 0
    lastKey = key
    log.longestStallMs = Math.max(log.longestStallMs, still)
  }
  log.tiles = seen.size
  return log
}

export type Metrics = {
  // 가장 많은 평소 행동의 비율, 같은 행동이 바로 이어진 비율, 3 개 묶음이 바로 앞 3 개와 같은 비율
  maxShare: number
  repeat: number
  triple: number
  // 엔트로피를 log2(평소 행동 수)로 나눈 값
  entropy: number
  shortestMs: number
  longestStallMs: number
  tiles: number
}

export function metricsOf(log: SimLog): Metrics {
  const acts = log.acts
  const counts = new Map<ActName, number>()
  for (const a of acts) counts.set(a, (counts.get(a) ?? 0) + 1)
  let most = 0
  let h = 0
  for (const n of counts.values()) {
    most = Math.max(most, n)
    const q = n / acts.length
    h -= q * Math.log2(q)
  }
  let repeat = 0
  for (let i = 1; i < acts.length; i++) if (acts[i] === acts[i - 1]) repeat++
  let triple = 0
  for (let i = 5; i < acts.length; i++) if (acts[i] === acts[i - 3] && acts[i - 1] === acts[i - 4] && acts[i - 2] === acts[i - 5]) triple++
  return {
    maxShare: most / acts.length,
    repeat: repeat / Math.max(1, acts.length - 1),
    triple: triple / Math.max(1, acts.length - 5),
    entropy: h / Math.log2(Pet.NORMAL_ACTS.length),
    shortestMs: Math.min(...log.durations),
    longestStallMs: log.longestStallMs,
    tiles: log.tiles,
  }
}
