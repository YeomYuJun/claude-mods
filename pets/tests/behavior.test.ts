import { describe, expect, test } from 'claude-code/testing'

import Names from '../hooks/names'
import Pet, { type ActName, type Pet as PetState } from '../hooks/pet'
import Rng from '../hooks/rng'
import World from '../hooks/world'
import { metricsOf, simulateQuiet } from './fixtures/sim'

const T0 = 1_000_000

// 신호 대본: [시각(ms), 신호]
type Cue = [number, 'prompt' | 'tool' | 'end']
const SCRIPT: Cue[] = [[2000, 'prompt'], [3000, 'tool'], [3500, 'tool'], [5200, 'tool'], [9000, 'end'], [85_000, 'prompt'], [88_000, 'tool'], [95_000, 'end']]

// 대본대로 두 분을 돌려 행동이 바뀔 때마다 이름을 적는다
function play(seed: number, tweak?: (p: PetState) => void): { names: ActName[]; p: PetState } {
  const world = World.create(seed)
  const p = Pet.create(world, seed, T0)
  tweak?.(p)
  const names: ActName[] = [p.act.name]
  let act = p.act
  let next = 0
  for (let t = Names.SIM_STEP_MS; t <= 120_000; t += Names.SIM_STEP_MS) {
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

  test('ten quiet minutes keep the everyday mix varied (the current weighted pick, seeds 1 to 4)', async () => {
    for (let seed = 1; seed <= 4; seed++) {
      const m = metricsOf(simulateQuiet(seed, 10))
      expect(m.maxShare <= 0.5).toBe(true)
      expect(m.repeat <= 0.2).toBe(true)
      expect(m.entropy >= 0.7).toBe(true)
    }
  })
})
