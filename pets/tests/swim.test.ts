import { describe, expect, test } from 'claude-code/testing'

import Biome from '../hooks/biome'
import Iso from '../hooks/iso'
import Names from '../hooks/names'
import Path from '../hooks/path'
import Pet, { type Pet as PetState } from '../hooks/pet'
import Pixel, { Palette } from '../hooks/pixel'
import Scene from '../hooks/scene'
import Species, { type BreedId, type SpeciesDef } from '../hooks/species'
import Sprite from '../hooks/sprite'
import World, { type World as WorldState } from '../hooks/world'
import Fixtures from './fixtures'
import { sessionScript } from './fixtures/sim'

const T0 = 1_000_000
const SWIMMERS: readonly SpeciesDef[] = [Species.TURTLE, Species.DUCK, Species.PENGUIN]

// 높이 2 평지 30 × 30 에 얕은 못(8..21)과 그 안의 깊은 물(10..19)
const POND = () => Fixtures.pondWorld(30, 30, 2, { x0: 8, y0: 8, x1: 21, y1: 21 }, { x0: 10, y0: 10, x1: 19, y1: 19 })

function run(p: PetState, world: WorldState, ms: number, from: number, each?: () => void): number {
  let now = from
  for (let t = 0; t < ms; t += Names.SIM_STEP_MS) {
    now += Names.SIM_STEP_MS
    p.lastSignalAt = now
    Pet.update(p, world, Names.SIM_STEP_MS, now)
    each?.()
  }
  return now
}

// 물이 있는 세트에서 세션 대본 10 분: 깊은 물 칸에 선 스텝 수, 물 칸에 뜬 스텝 수
function sessionOf(biome: 'meadow' | 'forest' | 'lake', seed: number, breed: BreedId): { deep: number; swimming: number } {
  const scene = Scene.create(seed, T0, biome, breed)
  const cues = sessionScript(seed, 10)
  const out = { deep: 0, swimming: 0 }
  let next = 0
  for (let i = 1; i <= Math.round(600_000 / Names.SIM_STEP_MS); i++) {
    const t = i * Names.SIM_STEP_MS
    const now = T0 + t
    while (next < cues.length && cues[next]!.at <= t) {
      const kind = cues[next++]!.kind
      if (kind === 'prompt') Scene.onTurnStart(scene, now)
      else if (kind === 'stream') Pet.onStream(scene.pet, now)
      else if (kind === 'tool') Scene.onTool(scene, now)
      else Scene.onTurnEnd(scene, now)
    }
    Scene.step(scene, Names.SIM_STEP_MS, now)
    const p = scene.pet
    if (World.isDeep(scene.world, Math.round(p.x), Math.round(p.y))) out.deep++
    if (p.swimming) out.swimming++
  }
  return out
}

describe('swim', () => {
  test('only swimming species reach deep water; the dog and the cat have no path into it and go around it', async () => {
    const world = POND()
    // 길 찾기 창(±16) 안에서 못 건너편
    const from = { x: 6, y: 15 }
    for (const species of [Species.DOG, Species.CAT]) {
      const path = Path.find(world, from, { x: 22, y: 15 }, species.abilities)
      expect(path !== null && path.every(t => !World.isDeep(world, t.x, t.y))).toBe(true)
      expect(Path.find(world, from, { x: 15, y: 15 }, species.abilities)).toBeNull()
    }
    for (const species of SWIMMERS) {
      const path = Path.find(world, from, { x: 15, y: 15 }, species.abilities)
      expect(path !== null && path.some(t => World.isDeep(world, t.x, t.y))).toBe(true)
    }
  })

  for (const breed of ['dog', 'cat', 'claude'] as const) {
    test(`over ten-minute sessions on sets with water the ${breed} never stands in deep water nor floats`, async () => {
      const wrong: string[] = []
      for (const biome of ['meadow', 'forest', 'lake'] as const) {
        for (const seed of [1, 2]) {
          const s = sessionOf(biome, seed, breed)
          if (s.deep > 0 || s.swimming > 0) wrong.push(`${biome} ${seed}: deep ${s.deep}, swimming ${s.swimming}`)
        }
      }
      expect(wrong).toEqual([])
    })
  }

  test('over a ten-minute session by the lake the swimming species float in water', async () => {
    let floated = 0
    // 시드는 이 세션에서 헤엄이 나오는 값으로 고른 것이다(호숫가 시드 1~8 중 6 개에서 나온다). 지형·길 비용이 바뀌면 어느 시드가 0 인지도 바뀌어 다시 고른다
    for (const breed of ['turtle', 'duck', 'penguin'] as const) floated += sessionOf('lake', 3, breed).swimming
    expect(floated > 0).toBe(true)
  })

  test('swimming species float in shallow and deep water: the floating body, the swim pace, feet SWIM_PX under the surface, and back on its feet on land', async () => {
    const world = POND()
    for (const species of SWIMMERS) {
      const p = Pet.create(world, 7, T0, species)
      p.x = 5; p.y = 15; p.z = 2 * Names.STEP_PX
      p.act = Pet.build('swim', p, world)
      expect(p.act.name).toBe('swim')
      let deepSeen = false
      let shallowSeen = false
      let bad = ''
      let now = T0
      for (let i = 0; i < 4000 && !bad; i++) {
        now = run(p, world, Names.SIM_STEP_MS, now)
        const tx = Math.round(p.x)
        const ty = Math.round(p.y)
        const wet = World.isWater(world, tx, ty)
        const pose = Pet.poseOf(p)
        if (wet !== p.swimming) bad = `swimming ${p.swimming} on ${World.surfaceAt(world, tx, ty)}`
        else if (wet && !p.hop && pose.body !== 'swim') bad = `body ${pose.body} in water`
        else if (!wet && !p.hop && pose.body === 'swim') bad = 'floating on land'
        if (wet && Pet.isMoving(p) && p.speed > species.gaits.swim!.speed + 1e-6) bad = `speed ${p.speed} over the swim pace`
        if (World.isDeep(world, tx, ty)) deepSeen = true
        else if (wet) shallowSeen = true
        // 물에 머문 뒤에는 발이 수면 SWIM_PX 아래로 가라앉는다
        if (wet && !Pet.isMoving(p) && p.act.name === 'swim' && Math.abs(p.z - (World.walkHeightAt(world, tx, ty) * Names.STEP_PX - World.SWIM_PX)) > 1e-6 && p.act.t > 1000) bad = `z ${p.z} while floating`
        if (p.act.name !== 'swim') break
      }
      expect(bad).toBe('')
      expect(deepSeen && shallowSeen).toBe(true)
      expect(World.isWater(world, Math.round(p.x), Math.round(p.y))).toBe(false)
    }
  })

  test('the dog and the cat never pick the swim act; a swimming species far from water cannot either', async () => {
    const world = POND()
    for (const species of [Species.DOG, Species.CAT]) {
      const p = Pet.create(world, 7, T0, species)
      p.x = 5; p.y = 15
      expect(Pet.ACTS.swim.feasible(p, world, Pet.surveyOf(p, world))).toBe(false)
    }
    const dry = Fixtures.flatWorld(40, 40)
    const duck = Pet.create(dry, 7, T0, Species.DUCK)
    expect(Pet.ACTS.swim.feasible(duck, dry, Pet.surveyOf(duck, dry))).toBe(false)
    const wet = Pet.create(world, 7, T0, Species.DUCK)
    wet.x = 5; wet.y = 15
    expect(Pet.ACTS.swim.feasible(wet, world, Pet.surveyOf(wet, world))).toBe(true)
  })

  test('below the waterline the floating body is hidden by the water in front at every zoom; drawn without depth it would show', async () => {
    const world = POND()
    const wrong: string[] = []
    for (const zoom of Scene.ZOOMS) {
      const proj = Scene.projOf(zoom)
      let control = 0
      for (const species of SWIMMERS) {
        for (const [tx, ty] of [[15, 15], [12, 17], [9, 15], [20, 12]] as const) {
          for (const dir of ['SE', 'SW', 'NW', 'NE'] as const) {
            const p = Pet.create(world, 7, T0, species)
            p.x = tx; p.y = ty; p.dir = dir
            // 물에 뜬 뒤 발 높이가 수면 아래로 가라앉을 때까지
            run(p, world, 600, T0)
            const b = Pixel.bufferOf(60, 40, 1)
            const alone = Pixel.bufferOf(60, 40, 1)
            Pixel.clear(b)
            Pixel.clear(alone)
            const view = Iso.viewOf(Iso.cameraOf(Iso.screenOf(p.x, p.y, p.z).sx, Iso.screenOf(p.x, p.y, p.z).sy), b, proj)
            Iso.drawWorld(b, world, view, proj)
            const { x, y } = Scene.figureAt(p, world, view, proj)
            const depth = p.x + p.y + 0.4 - (view.dz ?? 0)
            Sprite.drawPet(alone, p.species, Pet.poseOf(p), x, y, depth)
            const water = Math.round(Iso.screenOf(p.x, p.y, World.walkHeightAt(world, tx, ty) * Names.STEP_PX, proj).sy) - view.oy
            let shown = 0
            for (let i = 0; i < alone.px.length; i++) {
              if (alone.px[i] === Palette.VOID || Math.floor(i / alone.w) < water + 2) continue
              control++
              if (depth > b.depth[i]!) shown++
            }
            if (shown > 0) wrong.push(`${zoom} ${species.id} ${tx},${ty} ${dir}: ${shown} px below the waterline`)
          }
        }
      }
      if (control === 0) wrong.push(`${zoom}: nothing drawn below the waterline to hide`)
    }
    expect(wrong).toEqual([])
  })
})

// 모습 하나를 칠한 픽셀(바닥 점 기준)
function pixelsOf(species: SpeciesDef, pose: ReturnType<typeof Pet.poseOf>): Map<string, number> {
  const m = new Map<string, number>()
  Sprite.paintPet(species, pose, (x, y, c) => m.set(`${x},${y}`, c))
  return m
}

function walking(species: SpeciesDef, gait: 'walk' | 'run', stride: number): PetState {
  const p = Pet.create(Fixtures.flatWorld(8, 8), 7, T0, species)
  p.speed = 1
  p.gait = gait
  p.stride = stride
  return p
}

// 세트 5 개 × 세션 대본 10 분: 장애물 칸에 선 스텝, 목적지를 못 찾아 그만둔 행동 수와 시작한 행동 수. 초마다 모습을 그려 본다(없는 몸이면 오류)
function longRun(breed: BreedId): string[] {
  const wrong: string[] = []
  for (const b of Biome.BIOMES) {
    const scene = Scene.create(4, T0, b.id, breed)
    const p = scene.pet
    const cues = sessionScript(4, 10)
    let next = 0
    let acts = 0
    let last = p.act
    for (let i = 1; i <= Math.round(600_000 / Names.SIM_STEP_MS); i++) {
      const t = i * Names.SIM_STEP_MS
      const now = T0 + t
      while (next < cues.length && cues[next]!.at <= t) {
        const kind = cues[next++]!.kind
        if (kind === 'prompt') Scene.onTurnStart(scene, now)
        else if (kind === 'stream') Pet.onStream(scene.pet, now)
        else if (kind === 'tool') Scene.onTool(scene, now)
        else Scene.onTurnEnd(scene, now)
      }
      Scene.step(scene, Names.SIM_STEP_MS, now)
      if (p.act !== last) { last = p.act; acts++ }
      if (!p.hop && World.isObstacle(scene.world, Math.round(p.x), Math.round(p.y))) { wrong.push(`${b.id}: on obstacle`); break }
      if (i % 30 === 0) Sprite.boundsOf(p.species, Pet.poseOf(p))
    }
    if (p.aborts > 0.02 * acts) wrong.push(`${b.id}: ${p.aborts} aborted of ${acts}`)
  }
  return wrong
}

describe('swimming species over ten minutes', () => {
  for (const breed of ['turtle', 'duck', 'penguin'] as const) {
    test(`in every set a ${breed} through a ten-minute session never stands on a tree or rock, draws every second and seldom gives up a destination`, async () => {
      expect(longRun(breed)).toEqual([])
    })
  }
})

describe('waddling and head-in-body species', () => {
  test('the duck and the penguin waddle one pixel forward every other half stride; the dog and the turtle keep their body still', async () => {
    for (const species of [Species.DUCK, Species.PENGUIN]) {
      expect(Pet.poseOf(walking(species, 'walk', 0.1)).bodyDx).toBe(1)
      expect(Pet.poseOf(walking(species, 'walk', 0.6)).bodyDx).toBe(0)
    }
    for (const species of [Species.DOG, Species.TURTLE]) {
      expect(Pet.poseOf(walking(species, 'walk', 0.1)).bodyDx).toBe(0)
      expect(Pet.poseOf(walking(species, 'walk', 0.6)).bodyDx).toBe(0)
    }
  })

  test('the running penguin slides on its belly without legs; walking it stands on two legs', async () => {
    const slide = Pet.poseOf(walking(Species.PENGUIN, 'run', 0.3))
    expect(slide.body).toBe('lie')
    expect(slide.legs.length).toBe(0)
    const walk = Pet.poseOf(walking(Species.PENGUIN, 'walk', 0.3))
    expect(walk.body).toBe('stand')
    expect(walk.legs.length).toBe(2)
  })

  test('a head-in-body species blinks on its body, shows no eye from behind, lowers its head to sniff and holds the ball at its beak', async () => {
    const B = Palette.bank(0)
    const eye = B + Palette.Role.eye
    for (const species of [Species.DUCK, Species.PENGUIN]) {
      const p = Pet.create(Fixtures.flatWorld(8, 8), 7, T0, species)
      p.pose = 'stand'
      p.dir = 'SE'
      p.blinkMs = 0
      expect([...pixelsOf(species, Pet.poseOf(p)).values()].includes(eye)).toBe(true)
      p.blinkMs = 50
      expect([...pixelsOf(species, Pet.poseOf(p)).values()].includes(eye)).toBe(false)
      p.blinkMs = 0
      p.dir = 'NE'
      expect([...pixelsOf(species, Pet.poseOf(p)).values()].includes(eye)).toBe(false)
      expect(Sprite.mouthOf(species, Pet.poseOf(p))?.facing).toBe(false)
      p.dir = 'SE'
      const mouth = Sprite.mouthOf(species, Pet.poseOf(p))
      expect(mouth !== undefined && mouth.facing).toBe(true)
      p.pose = 'sniff'
      expect(Pet.poseOf(p).body).toBe('stoop')
    }
  })
})
