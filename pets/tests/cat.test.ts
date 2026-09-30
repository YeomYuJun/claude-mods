import { describe, expect, test } from 'claude-code/testing'

import Biome from '../hooks/biome'
import Names from '../hooks/names'
import Path from '../hooks/path'
import Pet, { type Activity, type Pet as PetState, type PoseName } from '../hooks/pet'
import Scene from '../hooks/scene'
import Species, { type SpeciesDef } from '../hooks/species'
import Sprite from '../hooks/sprite'
import World, { type World as WorldState } from '../hooks/world'
import Fixtures from './fixtures'

const T0 = 1_000_000

function run(p: PetState, world: WorldState, ms: number, from: number, each?: () => void): number {
  let now = from
  for (let t = 0; t < ms; t += Names.SIM_STEP_MS) {
    now += Names.SIM_STEP_MS
    Pet.update(p, world, Names.SIM_STEP_MS, now)
    each?.()
  }
  return now
}

function one(pose: PoseName): Activity {
  return { name: 'sit', steps: [{ k: 'pose', pose, ms: 10_000 }], i: 0, t: 0, started: -1 }
}

// 걸어가는 동물을 경로 끝까지 움직이고, 도중에 뛴 호의 높이들을 돌려준다
function walk(p: PetState, world: WorldState, path: ReadonlyArray<{ x: number; y: number }>): number[] {
  const peaks: number[] = []
  p.path = [...path]
  p.gait = 'trot'
  p.speed = p.species.gaits.trot.speed
  for (let i = 0; i < 400 && (p.path.length > 0 || p.hop); i++) {
    Pet.Motion.step(p, world, Names.SIM_STEP_MS)
    if (p.hop && !peaks.includes(p.hop.peak)) peaks.push(p.hop.peak)
  }
  return peaks
}

describe('cat', () => {
  test('a species that swaps a pose does the swapped pose as soon as it starts: no dirt when digging becomes grooming, lying instead of rolling', async () => {
    const swapper: SpeciesDef = { ...Species.DOG, behavior: { ...Species.DOG.behavior, poseMap: { dig: 'groom', roll: 'lie' } } }
    const world = World.create(7)
    const wrong: string[] = []
    for (const [asked, want] of [['dig', 'groom'], ['roll', 'lie']] as const) {
      const p = Pet.create(world, 7, T0, swapper)
      p.act = one(asked)
      let dirt = 0
      const poses = new Set<PoseName>()
      run(p, world, 2000, T0, () => { poses.add(p.pose); dirt += p.particles.filter(q => q.kind === 'dirt').length })
      if (poses.has(asked) || !poses.has(want) || dirt > 0) wrong.push(`${asked}: poses ${[...poses].join(',')}, dirt ${dirt}`)
    }
    expect(wrong).toEqual([])
  })

  test('climbing two steps in one jump uses the two-step arc; one step keeps the one-step arc', async () => {
    const climber: SpeciesDef = { ...Species.DOG, abilities: { climb: 2, swim: false }, jump: { ...Species.DOG.jump, up2Px: 11 } }
    const wrong: string[] = []
    for (const [species, rise, want] of [[climber, 2, 11], [climber, 1, Species.DOG.jump.upPx], [Species.DOG, 1, Species.DOG.jump.upPx]] as const) {
      const w = Fixtures.flatWorld(8, 3, [[4, 1, rise]])
      const p = Pet.create(w, 7, T0, species)
      p.x = 2; p.y = 1; p.z = 0
      const peaks = walk(p, w, [{ x: 3, y: 1 }, { x: 4, y: 1 }])
      const top = Math.round(p.x) === 4 && p.z === rise * Names.STEP_PX
      if (peaks.length !== 1 || peaks[0] !== want || !top) wrong.push(`climb ${species.abilities.climb} rise ${rise}: peaks ${peaks.join(',')} want ${want}, at ${p.x},${p.z}`)
    }
    expect(wrong).toEqual([])
  })

  test('the cat reaches a tile two steps up that the dog cannot, and neither enters a tree', async () => {
    const w = Fixtures.flatWorld(9, 5, [[4, 2, 2]], [[6, 2]])
    expect(Path.find(w, { x: 1, y: 2 }, { x: 4, y: 2 }, Species.DOG.abilities)).toBeNull()
    const path = Path.find(w, { x: 1, y: 2 }, { x: 4, y: 2 }, Species.CAT.abilities)
    expect(path).not.toBeNull()
    const cat = Pet.create(w, 7, T0, Species.CAT)
    cat.x = 1; cat.y = 2; cat.z = 0
    const peaks = walk(cat, w, path!)
    expect(Math.round(cat.x) === 4 && Math.round(cat.y) === 2 && cat.z === 2 * Names.STEP_PX).toBe(true)
    expect(peaks).toEqual([Species.CAT.jump.up2Px!])
    for (const rules of [Species.DOG.abilities, Species.CAT.abilities]) {
      expect(World.isWalkable(w, 6, 2, rules)).toBe(false)
      expect(Path.find(w, { x: 7, y: 2 }, { x: 6, y: 2 }, rules)).toBeNull()
    }
  })

  test('in every set a cat left alone for ten minutes never stands on a tree or rock, and draws every step', async () => {
    const wrong: string[] = []
    for (const b of Biome.BIOMES) {
      const scene = Scene.create(3, T0, b.id, 'cat')
      const p = scene.pet
      let now = T0
      for (let t = 0; t < 600_000; t += Names.SIM_STEP_MS) {
        now += Names.SIM_STEP_MS
        Scene.step(scene, Names.SIM_STEP_MS, now)
        const x = Math.round(p.x)
        const y = Math.round(p.y)
        if (!p.hop && World.isObstacle(scene.world, x, y)) { wrong.push(`${b.id}: on obstacle ${x},${y}`); break }
      }
      expect(Sprite.boundsOf(p.species, Pet.poseOf(p)).x1 >= 0).toBe(true)
    }
    expect(wrong).toEqual([])
  })

  test('striped breeds paint stripes on the cat bitmaps, the same columns facing either way', async () => {
    for (const id of ['cat', 'cheese'] as const) {
      const look = Species.lookOf(id)
      expect(look === Species.CAT).toBe(false)
      expect(look.id).toBe('cat')
      for (const spec of [look.sprite.bodies.stand, look.sprite.bodies.sit, look.sprite.heads!.face]) {
        const cols = new Set<number>()
        spec.rows.forEach(row => [...row].forEach((ch, x) => { if (ch === 'P') cols.add(x - spec.ax) }))
        expect(cols.size > 0).toBe(true)
        for (const x of cols) expect(((x % 3) + 3) % 3).toBe(0)
      }
    }
    // 무늬 없는 품종은 종 정의를 그대로 쓴다
    expect(Species.lookOf('dog')).toBe(Species.DOG)
  })

  test('choosing a cat breed turns the pet into a cat in place, with the cat abilities and poses', async () => {
    const scene = Scene.create(3, T0, 'paper', 'dog')
    const at = { x: scene.pet.x, y: scene.pet.y }
    scene.pet.pose = 'roll'
    Scene.setBreed(scene, 'cheese')
    expect(scene.pet.species.id).toBe('cat')
    expect(scene.pet.species.abilities.climb).toBe(2)
    expect(scene.pet.pose).toBe('lie')
    expect({ x: scene.pet.x, y: scene.pet.y }).toEqual(at)
    expect(Species.speciesOf('cheese')).toBe(Species.CAT)
    // 맵 세트를 바꿔 동물을 새로 만들어도 고양이다
    Scene.setBiome(scene, 'forest', T0)
    expect(scene.pet.species.id).toBe('cat')
    expect(scene.pet.species).toBe(Species.lookOf('cheese'))
    Scene.setBreed(scene, 'shiba')
    expect(scene.pet.species.id).toBe('dog')
  })

  test('by a pond the cat gets thirsty and drinks from a shore tile facing the water, like the dog', async () => {
    const world = Fixtures.pondWorld(30, 30, 2, { x0: 12, y0: 12, x1: 17, y1: 17 }, { x0: 14, y0: 14, x1: 15, y1: 15 })
    const p = Pet.create(world, 3, T0, Species.CAT)
    let drinks = 0
    let bad = 0
    let was = false
    let now = T0
    for (let t = 0; t < 10 * 60_000; t += Names.SIM_STEP_MS) {
      now += Names.SIM_STEP_MS
      p.lastSignalAt = now
      Pet.update(p, world, Names.SIM_STEP_MS, now)
      const drinking = p.act.name === 'drink' && p.pose === 'drink' && !Pet.isMoving(p)
      if (drinking && !was) {
        drinks++
        const at = Pet.tileOf(p)
        const [dx, dy] = Pet.DIR_VEC[p.dir]
        if (World.isWater(world, at.x, at.y) || !World.isWater(world, at.x + dx, at.y + dy)) bad++
      }
      was = drinking
    }
    expect(drinks > 0).toBe(true)
    expect(bad).toBe(0)
  })
})
