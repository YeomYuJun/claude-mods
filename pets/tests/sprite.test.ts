import { describe, expect, test } from 'claude-code/testing'

import Pet, { type Pet as PetState, type PoseName, type Gait, type Dir } from '../hooks/pet'
import Pixel, { Palette } from '../hooks/pixel'
import Species, { type SpeciesDef } from '../hooks/species'
import Sprite, { type PetPose } from '../hooks/sprite'
import World from '../hooks/world'

const B = Palette.bank(0)
const R = Palette.Role

const POSES: readonly PoseName[] = [
  'stand', 'look', 'pant', 'sniff', 'dig', 'bow', 'shake', 'scratch', 'yawn', 'stretch',
  'sit', 'frontSit', 'lie', 'lieRest', 'sleep', 'wake',
]
const GAITS: readonly Gait[] = ['walk', 'trot', 'run', 'sniff']
const DIRS: readonly Dir[] = ['SE', 'SW', 'NW', 'NE']

function petOfSpecies(species: SpeciesDef): PetState {
  const world = World.create(7)
  return Pet.create(world, 7, 0, species)
}

const petOf = () => petOfSpecies(Species.DOG)

// 자세 × 방향 × 시계(꼬리·숨·단계 시간) × 걸음을 훑어 scene 이 그릴 수 있는 모습을 모은다
function allPoses(species: SpeciesDef = Species.DOG): Array<{ name: string; pose: PetPose }> {
  const petOf = () => petOfSpecies(species)
  const out: Array<{ name: string; pose: PetPose }> = []
  for (const dir of DIRS) {
    for (let ms = 0; ms < 3000; ms += 37) {
      for (const name of POSES) {
        const p = petOf()
        p.dir = dir
        p.pose = name
        p.breath = ms
        p.act.t = ms % 900
        p.excite = ms % 2 === 0 ? 0.9 : 0.2
        p.blinkMs = ms % 3 === 0 ? 50 : 0
        out.push({ name, pose: Pet.poseOf(p) })
      }
      for (const gait of GAITS) {
        const p = petOf()
        p.dir = dir
        p.speed = 2
        p.gait = gait
        p.stride = ms / 400
        p.breath = ms
        p.landMs = ms % 5 === 0 ? 50 : 0
        out.push({ name: gait, pose: Pet.poseOf(p) })
      }
    }
    const hop = petOf()
    hop.dir = dir
    for (const t of [10, 60, 90]) {
      hop.hop = { fx: 0, fy: 0, tx: 1, ty: 0, z0: 0, z1: 0, t, dur: 100, peak: 5, isPath: true }
      out.push({ name: 'hop', pose: Pet.poseOf(hop) })
    }
    const crouch = petOf()
    crouch.dir = dir
    crouch.crouchMs = 50
    out.push({ name: 'crouch', pose: Pet.poseOf(crouch) })
  }
  return out
}

function pixelsOf(pose: PetPose, species: SpeciesDef = Species.DOG): Map<string, number> {
  const m = new Map<string, number>()
  Sprite.paintPet(species, pose, (x, y, c) => m.set(`${x},${y}`, c))
  return m
}

describe('sprite', () => {
  test('every species draws every pose, direction and gait inside 16 × 13 pixels, above the floor and never empty', async () => {
    for (const species of Object.values(Species.SPECIES)) {
      for (const { name, pose } of allPoses(species)) {
        let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity
        const painted = pixelsOf(pose, species)
        for (const key of painted.keys()) {
          const [x, y] = key.split(',').map(Number) as [number, number]
          x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y)
        }
        const fits = painted.size >= 20 && x1 - x0 + 1 <= 16 && y1 - y0 + 1 <= 13 && y1 <= -1
        if (!fits) throw new Error(`${species.id} ${name}: ${painted.size} px, x ${x0}..${x1}, y ${y0}..${y1}`)
        expect(fits).toBe(true)
      }
    }
  })

  test('every painted color has a real RGB value', async () => {
    for (const { name, pose } of allPoses()) {
      for (const c of pixelsOf(pose).values()) {
        const rgb = Palette.PAPER_THEME.rgb[c]
        if (rgb === undefined || rgb === 0xff00ff) throw new Error(`${name}: palette ${c}`)
      }
    }
  })

  test('the brown ear and the collar show in every pose, including the back view and the curled sleep', async () => {
    for (const { name, pose } of allPoses()) {
      const colors = new Set(pixelsOf(pose).values())
      if (!colors.has(B + R.ear) || !colors.has(B + R.collar)) throw new Error(`${name}: ear or collar missing`)
      expect(colors.has(B + R.ear) && colors.has(B + R.collar)).toBe(true)
    }
  })

  test('facing left is the mirror image of facing right', async () => {
    for (const name of POSES) {
      const p = petOf()
      p.pose = name
      p.dir = 'SE'
      const right = Pet.poseOf(p)
      const mirrored = new Map<string, number>()
      for (const [k, c] of pixelsOf(right)) {
        const [x, y] = k.split(',').map(Number)
        mirrored.set(`${-x!},${y}`, c)
      }
      const left = pixelsOf({ ...right, flip: true })
      // 정면 모습은 반전하지 않는다
      if (right.body.startsWith('front')) continue
      expect([...left.entries()].sort()).toEqual([...mirrored.entries()].sort())
    }
  })

  test('closing the eyes removes the black eye pixels, and the tongue adds pink', async () => {
    const p = petOf()
    const open = Pet.poseOf(p)
    const count = (pose: PetPose, c: number) => [...pixelsOf(pose).values()].filter(v => v === c).length
    expect(count({ ...open, eyeClosed: true }, B + R.eye) < count(open, B + R.eye)).toBe(true)
    expect(count({ ...open, eyeClosed: true }, B + R.lid) > 0).toBe(true)
    expect(count(open, B + R.tongue)).toBe(0)
    expect(count({ ...open, tongue: true }, B + R.tongue)).toBe(1)
    expect(count({ ...open, mouthOpen: true }, B + R.tongue)).toBe(2)
  })

  test('behind a nearer surface only the dark edges show through, every other pixel', async () => {
    const b = Pixel.bufferOf(30, 12, 1)
    Pixel.clear(b)
    b.px.fill(Palette.kind(0))
    b.depth.fill(100)
    const p = petOf()
    Sprite.drawPet(b, p.species, Pet.poseOf(p), 15, 20, 10)
    let heavy = 0
    for (let i = 0; i < b.px.length; i++) {
      const c = b.px[i]!
      expect(c === Palette.kind(0) || c === Palette.LINE_HEAVY).toBe(true)
      if (c === Palette.LINE_HEAVY) {
        heavy++
        const x = i % b.w
        const y = Math.floor(i / b.w)
        expect((x + y) & 1).toBe(0)
      }
    }
    expect(heavy > 10).toBe(true)
  })
})
