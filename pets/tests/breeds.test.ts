import { describe, expect, test } from 'claude-code/testing'

import Band from '../hooks/band'
import Biome from '../hooks/biome'
import Pet from '../hooks/pet'
import { Palette } from '../hooks/pixel'
import Scene from '../hooks/scene'
import Species, { type BandColors } from '../hooks/species'
import Sprite from '../hooks/sprite'
import World from '../hooks/world'
import Fixtures from './fixtures'

function luminanceOf(rgb: number): number {
  const lin = (c: number) => { const v = c / 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4 }
  return 0.2126 * lin((rgb >> 16) & 255) + 0.7152 * lin((rgb >> 8) & 255) + 0.0722 * lin(rgb & 255)
}

function contrastOf(a: number, b: number): number {
  const x = luminanceOf(a)
  const y = luminanceOf(b)
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05)
}

// 띠 프레임 8 장 중 가장 나쁜 장에서, 불투명 픽셀 가운데 배경 대비 3 이상인 비율
function bandShare(colors: BandColors, bg: number): number {
  const band = Species.DOG.band
  let worst = 1
  for (const f of Object.values(band.frames)) {
    let n = 0
    let ok = 0
    for (const row of f.rows) {
      for (const ch of row) {
        const role = band.codes[ch]
        if (role === undefined) continue
        n++
        if (contrastOf(colors[role], bg) >= 3) ok++
      }
    }
    worst = Math.min(worst, ok / n)
  }
  return worst
}

describe('breeds', () => {
  test('every breed fills all twelve animal color roles, and every set × breed color table has them', async () => {
    for (const breed of Species.BREEDS) {
      for (const role of Object.keys(Palette.Role) as Palette.RoleName[]) expect(`${breed.id} ${role} ${typeof breed.bank[role] === 'number' && breed.bank[role] !== Palette.UNSET}`).toBe(`${breed.id} ${role} true`)
      for (const b of Biome.BIOMES) {
        const { rgb } = Biome.themeOf(b.id, breed.bank)
        for (let i = 0; i < Palette.BANK_SIZE; i++) expect(rgb[Palette.bank(0) + i] === Palette.UNSET).toBe(false)
      }
    }
  })

  test('every breed\'s outline stands out at least 3 : 1 on every top face of every surface kind of every set', async () => {
    for (const breed of Species.BREEDS) {
      for (const b of Biome.BIOMES) {
        const { rgb } = Biome.themeOf(b.id, breed.bank)
        b.colors.kinds.forEach((kc, slot) => {
          const k = Palette.kind(slot)
          for (let h = 0; h < 5; h++) {
            const c = contrastOf(breed.bank.outline, rgb[k + h]!)
            expect(`${breed.id} ${b.id} kind ${kc.id} ${h} ${c >= 3}`).toBe(`${breed.id} ${b.id} kind ${kc.id} ${h} true`)
          }
        })
      }
    }
  })

  test('the band dog of every breed keeps at least half its pixels at 3 : 1: the dark set on black and dark grey, the light set on white', async () => {
    for (const breed of Species.BREEDS) {
      for (const bg of [0x0c0c0c, 0x1e1e1e]) expect(`${breed.id} dark ${bg.toString(16)} ${bandShare(breed.band.dark, bg) >= 0.5}`).toBe(`${breed.id} dark ${bg.toString(16)} true`)
      expect(`${breed.id} light ${bandShare(breed.band.light, 0xffffff) >= 0.5}`).toBe(`${breed.id} light true`)
    }
  })

  test('the band of every breed, dark or light, uses at most 64 color pairs', async () => {
    const modes = ['walk', 'run', 'sniff', 'sit', 'sleep', 'idle'] as const
    for (const breed of Species.BREEDS) {
      for (const colors of [breed.band.dark, breed.band.light]) {
        for (const cols of [120, 300]) {
          for (const mode of modes) {
            const band = Band.create(1, 0, Species.lookOf(breed.id), colors)
            band.x = 30
            band.mode = mode
            const words = Fixtures.wordsOf(Band.compose(band, cols))
            const pairs = new Set<string>()
            for (let i = 0; i + 2 < words.length; i += 3) pairs.add(`${words[i + 1]},${words[i + 2]}`)
            expect(pairs.size <= 64).toBe(true)
            expect(pairs.size > 1).toBe(true)
          }
        }
      }
    }
  })

  test('the spotted dog has the white dog\'s outline with some body pixels turned into spots, and the spots follow when it turns', async () => {
    const world = World.create(7)
    const plain = Pet.create(world, 7, 0, Species.lookOf('dog'))
    const spotted = Pet.create(world, 7, 0, Species.lookOf('dalmatian'))
    const B = Palette.bank(0)
    const R = Palette.Role
    for (const pose of ['stand', 'sit', 'lie', 'sleep', 'frontSit', 'look'] as const) {
      for (const dir of ['SE', 'NW'] as const) {
        plain.pose = pose
        spotted.pose = pose
        plain.dir = dir
        spotted.dir = dir
        const a = new Map<string, number>()
        const b = new Map<string, number>()
        Sprite.paintPet(plain.species, Pet.poseOf(plain), (x, y, c) => a.set(`${x},${y}`, c))
        Sprite.paintPet(spotted.species, Pet.poseOf(spotted), (x, y, c) => b.set(`${x},${y}`, c))
        expect([...b.keys()].sort()).toEqual([...a.keys()].sort())
        let spots = 0
        for (const [key, c] of b) {
          if (c === B + R.pattern) { spots++; expect(a.get(key)).toBe(B + R.body) } else expect(c).toBe(a.get(key))
        }
        expect(`${pose} ${dir} ${spots > 0}`).toBe(`${pose} ${dir} true`)
      }
    }
  })

  test('changing the breed changes the dog colors but not the map, and changing back draws the same frame', async () => {
    const scene = Scene.create(7, 0)
    const before = Scene.compose(scene, 40, 30, 1)
    Scene.setBreed(scene, 'shiba')
    expect(scene.pet.species.breeds).toBe(Species.DOG.breeds)
    expect(Scene.compose(scene, 40, 30, 1) === before).toBe(false)
    Scene.setBreed(scene, 'dog')
    expect(Scene.compose(scene, 40, 30, 1)).toBe(before)
    const k = Palette.kind(0)
    expect(Biome.themeOf('forest', Species.breedOf('shiba').bank).rgb[k]).toBe(Biome.themeOf('forest').rgb[k])
  })
})
