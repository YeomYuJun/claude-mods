import { describe, expect, test } from 'claude-code/testing'

import Names from '../hooks/names'
import Pet, { type ActName, type Pet as PetState, type Step } from '../hooks/pet'
import World, { type World as WorldState } from '../hooks/world'
import Fixtures from './fixtures'

const T0 = 1_000_000
const STEP = Names.SIM_STEP_MS

// 둘레 땅 높이 2, 가운데 6 × 6 얕은 못, 그 안 2 × 2 깊은 물
function pond(): WorldState {
  return Fixtures.pondWorld(30, 30, 2, { x0: 12, y0: 12, x1: 17, y1: 17 }, { x0: 14, y0: 14, x1: 15, y1: 15 })
}

// 칸이 물이 아닌 걷는 칸이고 4 방향 이웃에 물이 있는지
function isEdge(world: WorldState, x: number, y: number): boolean {
  if (World.isWater(world, x, y) || !World.isWalkable(world, x, y)) return false
  return World.NEIGHBORS.some(([dx, dy]) => World.isWater(world, x + dx, y + dy))
}

// 신호 없이 ms 동안 돌린다(잠들지 않게 매 스텝 마지막 신호 시각을 지금으로 둔다). 스텝마다 look 을 부른다
function quiet(p: PetState, world: WorldState, ms: number, from: number, look?: (p: PetState) => void): number {
  let now = from
  for (let t = 0; t < ms; t += STEP) {
    now += STEP
    p.lastSignalAt = now
    Pet.update(p, world, STEP, now)
    look?.(p)
  }
  return now
}

// 지금 행동을 끝낸 것으로 두어 다음 스텝에 새로 고르게 한다
function finish(p: PetState): void {
  p.path = []
  p.act.i = p.act.steps.length
}

function goTargets(steps: Step[]): Array<{ x: number; y: number }> {
  return steps.flatMap(s => s.k === 'go' && s.to ? [s.to] : [])
}

describe('thirst and water', () => {
  test('on a dry map thirst stays exactly 0 for ten minutes, even after a set change copied a thirst over, and the dog never drinks or splashes', async () => {
    const world = Fixtures.flatWorld(30, 30, [[10, 10, 1], [11, 10, 1], [20, 18, 2]])
    const p = Pet.create(world, 5, T0)
    // 세트를 바꾸면 장면이 옛 동물의 욕구를 옮겨 적는다. 물이 없으면 첫 스텝부터 0 이어야 한다
    p.needs.thirst = 0.7
    let bad = 0
    const acts = new Set<ActName>()
    quiet(p, world, 10 * 60_000, T0, q => {
      // 물보라를 고를 수 있는지 판정까지 가도록 들뜸을 높게 둔다
      q.excite = 0.9
      if (q.needs.thirst !== 0) bad++
      acts.add(q.act.name)
    })
    expect(bad).toBe(0)
    expect(acts.has('drink')).toBe(false)
    expect(acts.has('splash')).toBe(false)
  })

  test('by a pond thirst rises, the dog drinks from a shore tile facing the water, and thirst falls while it drinks', async () => {
    const world = pond()
    const p = Pet.create(world, 3, T0)
    let rose = false
    let drinks = 0
    let badTile = 0
    let badFace = 0
    let before = -1
    let fell = 0
    let wasDrinking = false
    quiet(p, world, 10 * 60_000, T0, q => {
      if (q.needs.thirst > 0.2) rose = true
      const drinking = q.act.name === 'drink' && q.pose === 'drink' && !Pet.isMoving(q)
      if (drinking && !wasDrinking) {
        drinks++
        before = q.needs.thirst
        const t = Pet.tileOf(q)
        if (!isEdge(world, t.x, t.y)) badTile++
        const [dx, dy] = Pet.DIR_VEC[q.dir]
        if (!World.isWater(world, t.x + dx, t.y + dy)) badFace++
      }
      if (!drinking && wasDrinking && q.needs.thirst < before - 0.2) fell++
      wasDrinking = drinking
    })
    expect(rose).toBe(true)
    expect(drinks > 0).toBe(true)
    expect(badTile).toBe(0)
    expect(badFace).toBe(0)
    expect(fell).toBe(drinks)
  })

  test('water more than sixteen steps away on foot keeps thirst at 0; next to the pond it starts rising after the next choice', async () => {
    // 못은 강아지 둘레 ±16 칸 상자 안이지만, 바위 벽을 돌아가야 해서 걸어서는 16 걸음보다 멀다
    const walls: Array<[number, number]> = []
    for (let y = 0; y < 39; y++) walls.push([20, y])
    const world = Fixtures.pondWorld(40, 40, 1, { x0: 22, y0: 3, x1: 24, y1: 5 }, undefined, walls)
    const p = Pet.create(world, 2, T0)
    p.x = 12
    p.y = 4
    finish(p)
    expect(World.waterEdgesWithin(world, { x: 12, y: 4 }, 16).length > 0).toBe(true)
    let bad = 0
    let now = quiet(p, world, 30_000, T0, q => { if (q.needs.thirst !== 0) bad++ })
    expect(bad).toBe(0)
    expect(p.waterNear).toBe(false)
    // 벽 너머 물가로 옮기고 새로 고르게 한다
    p.x = 21
    p.y = 8
    finish(p)
    now = quiet(p, world, STEP, now)
    expect(p.waterNear).toBe(true)
    const t0 = p.needs.thirst
    expect(t0 >= 0.1).toBe(true)
    quiet(p, world, 3000, now)
    expect(p.needs.thirst > t0).toBe(true)
  })

  test('a thirst of 0.85 or more makes the next choice a drink, ahead of waiting for a long tool, and the wait does not cut the drink', async () => {
    const world = pond()
    const p = Pet.create(world, 4, T0)
    let now = quiet(p, world, 2000, T0)
    p.needs.thirst = 0.9
    finish(p)
    now = quiet(p, world, STEP, now)
    expect(p.act.name).toBe('drink')
    // 오래 도는 도구: 4 초가 지나면 기다리러 온다. 그때 목마름이 급하면 먼저 마신다
    const q = Pet.create(world, 4, T0)
    now = quiet(q, world, 2000, T0)
    Pet.onToolStart(q, now)
    now = quiet(q, world, 4500, now)
    expect(q.act.name).toBe('wait')
    q.needs.thirst = 0.9
    finish(q)
    now = quiet(q, world, STEP, now)
    expect(q.act.name).toBe('drink')
    const a = q.act
    quiet(q, world, 1500, now)
    expect(q.act).toBe(a)
  })

  test('a splash runs into a shallow tile, throws splash particles there, comes out onto dry land and shakes; the dog never stands in deep water', async () => {
    const world = pond()
    const p = Pet.create(world, 6, T0)
    const now = quiet(p, world, 2000, T0)
    p.excite = 1
    p.energy = 1
    p.act = Pet.build('splash', p, world)
    const into = goTargets(p.act.steps)[0]!
    expect(World.surfaceAt(world, into.x, into.y)).toBe('shallow')
    const a = p.act
    let splashes = 0
    let wetSplash = 0
    let shakeTile: { x: number; y: number } | undefined
    quiet(p, world, 20_000, now, q => {
      if (q.act !== a) return
      const t = Pet.tileOf(q)
      const step = q.act.steps[q.act.i]
      if (step?.k === 'pose' && step.splash && q.particles.some(f => f.kind === 'splash')) {
        splashes++
        if (World.surfaceAt(world, t.x, t.y) === 'shallow') wetSplash++
      }
      if (q.pose === 'shake' && !Pet.isMoving(q)) shakeTile = t
    })
    expect(splashes > 0).toBe(true)
    expect(wetSplash).toBe(splashes)
    expect(shakeTile !== undefined && !World.isWater(world, shakeTile.x, shakeTile.y)).toBe(true)
    // 들뜬 강아지를 못가에서 오래 돌려도 깊은 물 칸에 서지 않는다. 그동안 물보라는 고를 수 있는 행동이다(5 초마다 가중치를 잰다)
    let deep = 0
    let possible = 0
    for (const seed of [1, 2]) {
      const q = Pet.create(world, seed, T0)
      let n = 0
      quiet(q, world, 10 * 60_000, T0, r => {
        r.excite = 0.9
        const t = Pet.tileOf(r)
        if (!r.hop && World.isDeep(world, t.x, t.y)) deep++
        if (++n % 300 === 0 && (new Map(Pet.weightsOf(r, world, Pet.surveyOf(r, world), 0)).get('splash') ?? 0) > 0) possible++
      })
    }
    expect(deep).toBe(0)
    expect(possible > 0).toBe(true)
  })

  test('beds, settling, watching, waiting and begging spots next to a pond are never water tiles', async () => {
    const world = pond()
    let wet = 0
    let built = 0
    // 못 안 얕은 물 칸과 물가 칸에서 여러 번 만들어 본다
    const from: Array<{ x: number; y: number }> = []
    for (let y = 10; y <= 19; y++) for (let x = 10; x <= 19; x++) if (World.surfaceAt(world, x, y) === 'shallow' || isEdge(world, x, y)) from.push({ x, y })
    from.forEach((t, k) => {
      const p = Pet.create(world, 100 + k, T0)
      p.x = t.x
      p.y = t.y
      for (const name of ['nap', 'bedtime', 'settle', 'watch'] as const) {
        for (const to of goTargets(Pet.build(name, p, world).steps)) {
          built++
          if (World.isWater(world, to.x, to.y)) wet++
        }
      }
      // 기다리기·조르기는 걷기 시작할 때 앞쪽 칸을 고른다
      for (const name of ['wait', 'beg'] as const) {
        p.path = []
        p.act = Pet.build(name, p, world)
        Pet.update(p, world, STEP, T0 + STEP)
        const end = p.path[p.path.length - 1]
        if (end) {
          built++
          if (World.isWater(world, end.x, end.y)) wet++
        }
        p.x = t.x
        p.y = t.y
      }
    })
    expect(built > from.length * 4).toBe(true)
    expect(wet).toBe(0)
  })
})
