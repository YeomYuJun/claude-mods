import { describe, expect, test } from 'claude-code/testing'

import Names from '../hooks/names'
import Pet, { type ActName, type Pet as PetState } from '../hooks/pet'
import Rng from '../hooks/rng'
import World from '../hooks/world'
import Fixtures from './fixtures'
import { metricsOf, simulateQuiet, simulateSession, type SimLog } from './fixtures/sim'

const T0 = 1_000_000

// 신호 대본: [시각(ms), 신호]. 첫 턴 끝 뒤 신호 없는 시간이 잠들 시간을 넘어, 두 번째 프롬프트 전에 잠자리로 간다
type Cue = [number, 'prompt' | 'tool' | 'end']
const LATER = 20_000 + Names.SLEEP_AFTER_MS
const SCRIPT: Cue[] = [[2000, 'prompt'], [3000, 'tool'], [3500, 'tool'], [5200, 'tool'], [9000, 'end'], [LATER, 'prompt'], [LATER + 3000, 'tool'], [LATER + 10_000, 'end']]
const SCRIPT_MS = LATER + 25_000

// 대본대로 SCRIPT_MS 를 돌려 행동이 바뀔 때마다 이름을 적는다
function play(seed: number, tweak?: (p: PetState) => void): { names: ActName[]; p: PetState } {
  const world = World.create(seed)
  const p = Pet.create(world, seed, T0)
  tweak?.(p)
  const names: ActName[] = [p.act.name]
  let act = p.act
  let next = 0
  for (let t = Names.SIM_STEP_MS; t <= SCRIPT_MS; t += Names.SIM_STEP_MS) {
    const now = T0 + t
    while (next < SCRIPT.length && SCRIPT[next]![0] <= t) {
      const kind = SCRIPT[next++]![1]
      if (kind === 'prompt') Pet.onTurnStart(p, world, now)
      else if (kind === 'tool') Pet.onTool(p, world, now)
      else Pet.onTurnEnd(p, world, now)
    }
    Pet.update(p, world, Names.SIM_STEP_MS, now)
    if (p.act !== act) { act = p.act; names.push(act.name) }
  }
  return { names, p }
}

describe('behavior', () => {
  test('the same seed and the same signals give the same actions and end state', async () => {
    for (const seed of [7, 42]) {
      const a = play(seed)
      const b = play(seed)
      expect(a.names).toEqual(b.names)
      expect([a.p.x, a.p.y, a.p.energy, a.p.rng.s, a.p.simMs]).toEqual([b.p.x, b.p.y, b.p.energy, b.p.rng.s, b.p.simMs])
      expect(a.names.includes('greet') && a.names.includes('dig') && a.names.includes('settle') && a.names.includes('bedtime')).toBe(true)
    }
  })

  test('changing how the dog blinks or throws particles does not change what it does', async () => {
    for (const seed of [7, 42]) {
      const a = play(seed)
      const b = play(seed, p => { p.fxRng = Rng.create(0xdecaf); p.blinkIn = 17 })
      expect(b.names).toEqual(a.names)
      expect(b.p.rng.s).toBe(a.p.rng.s)
    }
  })

  test('a finished or interrupted everyday action is remembered, newest first, six at most', async () => {
    const world = World.create(3)
    const p = Pet.create(world, 3, T0)
    for (let t = Names.SIM_STEP_MS; t <= 120_000; t += Names.SIM_STEP_MS) { p.lastSignalAt = T0 + t; Pet.update(p, world, Names.SIM_STEP_MS, T0 + t) }
    expect(p.history.length).toBe(6)
    for (const name of p.history) expect(Pet.ACTS[name].cls).toBe('N')
    const interrupted = p.act.name
    expect(Pet.ACTS[interrupted].cls).toBe('N')
    Pet.onTurnStart(p, world, T0 + 120_100)
    expect(p.history[0]).toBe(interrupted)
    expect(p.history.length).toBe(6)
    expect(p.lastEndAt[interrupted]).toBe(p.simMs)
    // 이벤트 행동(인사)은 기록하지 않는다
    for (let t = 0; t < 20_000 && p.act.name === 'greet'; t += Names.SIM_STEP_MS) Pet.update(p, world, Names.SIM_STEP_MS, T0 + 120_100 + t)
    expect(p.history.includes('greet')).toBe(false)
  })

  test('a fetch that a prompt interrupts drops the ball, which then rests on a walkable tile', async () => {
    const world = World.create(7)
    const p = Pet.create(world, 7, T0)
    p.act = { name: 'play', steps: [{ k: 'chase' }, { k: 'pose', pose: 'bow', ms: 300 }, { k: 'grab' }, { k: 'go', pick: { lo: 3, hi: 6, front: true }, gait: 'trot' }, { k: 'pose', pose: 'bow', ms: 300 }, { k: 'drop' }, { k: 'pose', pose: 'frontSit', ms: 2000 }], i: 0, t: 0, started: -1 }
    let now = T0
    for (let t = 0; t < 12_000 && !p.carrying; t += Names.SIM_STEP_MS) { now += Names.SIM_STEP_MS; p.lastSignalAt = now; Pet.update(p, world, Names.SIM_STEP_MS, now) }
    expect(p.carrying).toBe(true)
    for (let t = 0; t < 300; t += Names.SIM_STEP_MS) { now += Names.SIM_STEP_MS; Pet.update(p, world, Names.SIM_STEP_MS, now) }
    expect(Math.hypot(p.ball.x - p.x, p.ball.y - p.y) < 0.6).toBe(true)
    Pet.onTurnStart(p, world, now)
    expect(p.carrying).toBe(false)
    for (let t = 0; t < 3000; t += Names.SIM_STEP_MS) { now += Names.SIM_STEP_MS; Pet.update(p, world, Names.SIM_STEP_MS, now) }
    const at = Pet.Ball.tileOf(p.ball)
    expect(Pet.Ball.isRolling(p.ball)).toBe(false)
    expect(World.isWalkable(world, at.x, at.y)).toBe(true)
  })

  test('an action whose destination cannot be reached is dropped, not recorded, and not picked again for 30 seconds', async () => {
    const world = Fixtures.flatWorld(12, 12, [[9, 9, 3]])
    const p = Pet.create(world, 1, T0)
    p.act = { name: 'explore', steps: [{ k: 'go', to: { x: 9, y: 9 }, gait: 'trot', must: true }, { k: 'pose', pose: 'sniff', ms: 1000 }], i: 0, t: 0, started: -1 }
    p.lastSignalAt = T0 + Names.SIM_STEP_MS
    Pet.update(p, world, Names.SIM_STEP_MS, T0 + Names.SIM_STEP_MS)
    expect(p.aborts).toBe(1)
    expect(p.act.name === 'explore').toBe(false)
    expect(p.history.includes('explore')).toBe(false)
    const weights = new Map(Pet.weightsOf(p, world, Pet.surveyOf(p, world), T0 + Names.SIM_STEP_MS))
    expect(weights.get('explore')).toBe(0)
  })
})

// 20 시드 × 10 분을 평소만·세션 대본 두 가지로 돌려 모든 기록을 합쳐 잰다. 테스트 하나가 5 초를 넘지 않게 5 시드씩 나눠 돌린다
const quiet: SimLog[] = []
const session: SimLog[] = []

describe('behavior over ten minutes', () => {
  for (const from of [1, 6, 11, 16]) {
    test(`quiet and session runs, seeds ${from} to ${from + 4}`, async () => {
      for (let seed = from; seed < from + 5; seed++) {
        quiet.push(simulateQuiet(seed, 10))
        session.push(simulateSession(seed, 10))
      }
    })
  }

  test('the everyday mix stays varied: no act over 30 %, repeats under 8 %, entropy at least 0.8, rarely possible acts still show up', async () => {
    const m = metricsOf(quiet)
    expect(m.maxShare <= 0.3).toBe(true)
    expect(m.repeat <= 0.08).toBe(true)
    expect(m.triple <= 0.05).toBe(true)
    expect(m.entropy >= 0.8).toBe(true)
    expect(m.inclusion >= 0.9).toBe(true)
    expect(m.rareGapMs >= 90_000).toBe(true)
    expect(m.coverage >= 1).toBe(true)
  })

  test('actions rarely fail for lack of a destination, last at least half a second, and the dog never freezes for more than 12 s', async () => {
    for (const logs of [quiet, session]) {
      const m = metricsOf(logs)
      expect(m.abortRate <= 0.02).toBe(true)
      expect(m.shortestMs >= 500).toBe(true)
      expect(m.longestStallMs <= 12_000).toBe(true)
    }
  })

  test('every prompt starts a greeting at once', async () => {
    expect(metricsOf(session).missed).toBe(0)
  })
})
