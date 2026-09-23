import { describe, expect, test } from 'claude-code/testing'

import Band from '../hooks/band'
import Names from '../hooks/names'
import Pet, { type Pet as PetState } from '../hooks/pet'
import Scene from '../hooks/scene'
import World from '../hooks/world'
import Fixtures from './fixtures'

const T0 = 1_000_000

function run(p: PetState, world: ReturnType<typeof World.create>, ms: number, from: number): number {
  let now = from
  for (let t = 0; t < ms; t += Names.SIM_STEP_MS) {
    now += Names.SIM_STEP_MS
    Pet.update(p, world, Names.SIM_STEP_MS, now)
  }
  return now
}

function setup(seed = 7) {
  const world = World.create(seed)
  const p = Pet.create(world, seed, T0)
  return { world, p }
}

describe('pet', () => {
  test('a new prompt makes the dog look up and run off at least four tiles away', async () => {
    const { world, p } = setup()
    let now = run(p, world, 500, T0)
    const from = Pet.tileOf(p)
    Pet.onTurnStart(p, world, now)
    expect(p.act.name).toBe('greet')
    expect(p.emote === undefined || p.emote.kind === '!').toBe(true)
    let sawRun = false
    for (let i = 0; i < 400 && p.act.name === 'greet'; i++) {
      now = run(p, world, 50, now)
      if (Pet.isMoving(p) && p.gait === 'run') sawRun = true
    }
    expect(sawRun).toBe(true)
    const to = Pet.tileOf(p)
    expect(Math.abs(to.x - from.x) + Math.abs(to.y - from.y) >= 4).toBe(true)
  })

  test('a tool call digs with a question mark; a burst extends the dig instead of restarting it', async () => {
    const { world, p } = setup()
    let now = run(p, world, 300, T0)
    Pet.onTool(p, world, now)
    now = run(p, world, 50, now)
    expect(p.act.name).toBe('dig')
    expect(p.pose).toBe('dig')
    expect(p.emote?.kind).toBe('?')
    const step = p.act.steps[0]
    const before = step?.k === 'pose' ? step.ms : 0
    Pet.onTool(p, world, now + 100)
    expect(step?.k === 'pose' ? step.ms : 0).toBe(before + 900)
    now = run(p, world, 400, now)
    expect(p.particles.some(q => q.kind === 'dirt')).toBe(true)
  })

  test('a tool call during the greeting run waits until the run ends', async () => {
    const { world, p } = setup()
    const now = run(p, world, 300, T0)
    Pet.onTurnStart(p, world, now)
    Pet.onTool(p, world, now + 10)
    expect(p.act.name).toBe('greet')
    expect(p.queue.map(a => a.name)).toEqual(['dig'])
  })

  test('the end of a turn walks a little and sits facing the viewer with a heart', async () => {
    const { world, p } = setup()
    let now = run(p, world, 300, T0)
    Pet.onTurnEnd(p, world, now)
    expect(p.act.name).toBe('settle')
    for (let i = 0; i < 200 && p.pose !== 'frontSit'; i++) now = run(p, world, 50, now)
    expect(p.pose).toBe('frontSit')
    expect(p.emote?.kind).toBe('heart')
  })

  test('sixty seconds without signals puts the dog to sleep; the next prompt wakes it', async () => {
    const { world, p } = setup()
    let now = run(p, world, Names.SLEEP_AFTER_MS + 30_000, T0)
    expect(p.isAsleep).toBe(true)
    expect(p.pose).toBe('sleep')
    now = run(p, world, 3000, now)
    expect(p.particles.some(q => q.kind === 'z')).toBe(true)
    Pet.onTurnEnd(p, world, now)
    expect(p.isAsleep).toBe(true)
    Pet.onTurnStart(p, world, now)
    expect(p.isAsleep).toBe(false)
    now = run(p, world, 100, now)
    expect(p.pose).toBe('wake')
  })

  test('a running tool keeps the dog awake', async () => {
    const { world, p } = setup()
    Pet.onToolStart(p, T0)
    run(p, world, Names.SLEEP_AFTER_MS + 10_000, T0)
    expect(p.isAsleep).toBe(false)
  })

  test('running tires the dog and lying down rests it', async () => {
    const { world, p } = setup()
    const e0 = p.energy
    p.act = Pet.build('run', p, world)
    let now = run(p, world, 3000, T0)
    const tired = p.energy
    expect(tired < e0).toBe(true)
    p.path = []
    p.act = { name: 'lie', steps: [{ k: 'pose', pose: 'lie', ms: 10_000 }], i: 0, t: 0, started: -1 }
    now = run(p, world, 5000, now)
    expect(p.pose).toBe('lie')
    expect(p.energy > tired).toBe(true)
  })

  test('a sleeping dog is drawn every 150 ms even while a z floats up', async () => {
    const scene = Scene.create(7, T0)
    let now = T0
    for (let t = 0; t < Names.SLEEP_AFTER_MS + 40_000; t += 100) { now += 100; Scene.step(scene, 100, now) }
    expect(scene.pet.isAsleep).toBe(true)
    expect(scene.pet.particles.some(q => q.kind === 'z')).toBe(true)
    expect(Scene.renderEveryMs(scene)).toBe(150)
  })

  test('the pose drawn while moving follows the stride, so the feet change as the dog walks', async () => {
    const { world, p } = setup()
    p.path = [{ x: p.x + 1, y: p.y }, { x: p.x + 2, y: p.y }]
    p.gait = 'walk'
    const feet = new Set<string>()
    let now = T0
    for (let i = 0; i < 30; i++) {
      now = run(p, world, 33, now)
      if (Pet.isMoving(p)) feet.add(JSON.stringify(Pet.poseOf(p).legs.map(l => [l.dx, l.lift])))
    }
    expect(feet.size >= 3).toBe(true)
  })
})

describe('band', () => {
  test('the band is three rows with a dotted floor and a dog on it', async () => {
    const band = Band.create(1, T0)
    const lines = Fixtures.linesOf(Band.compose(band, 60), 60)
    expect(lines.length).toBe(3)
    expect(lines[2]!.includes('▀') || lines[2]!.includes('▄')).toBe(true)
  })

  test('the band dog runs on a new prompt and falls asleep after sixty quiet seconds', async () => {
    const band = Band.create(1, T0)
    Band.compose(band, 80)
    Band.onTurnStart(band, T0)
    expect(band.mode).toBe('run')
    Band.step(band, 100, T0 + 100, false)
    let now = T0 + 100
    for (let i = 0; i < 70; i++) { now += 1000; Band.step(band, 1000, now, false) }
    expect(band.mode).toBe('sleep')
  })
})
