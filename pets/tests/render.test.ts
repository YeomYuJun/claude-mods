import { describe, expect, test } from 'claude-code/testing'

import Iso from '../hooks/iso'
import Pixel, { Palette } from '../hooks/pixel'
import Sprite, { type DogPose } from '../hooks/sprite'
import World, { type World as WorldState } from '../hooks/world'
import Fixtures from './fixtures'

function flatWorld(w: number, h: number): WorldState {
  const world = World.create(1)
  return { ...world, w, h, height: new Uint8Array(w * h), walk: new Uint8Array(w * h).fill(1), block: new Uint8Array(w * h), spawn: { x: 5, y: 5 } }
}

const STAND: DogPose = {
  body: 'stand', flip: false, back: false, bodyDx: 0, bodyDy: 0, tilt: 0, head: 'face', headDx: 0, headDy: 0,
  eyeClosed: false, tongue: false, mouthOpen: false, tailAngle: 0.8, tailLen: 3, scratch: 0,
  legs: [[-3, false], [-2, true], [2, false], [3, true]].map(([hipX, far]) => ({ hipX: hipX as number, far: far as boolean, dx: 0, lift: false, len: 2 })),
}

describe('pixel', () => {
  test('two pixels fold into one cell: ▀ top over bottom, ▄ when the top is empty, a space when both match', async () => {
    const b = Pixel.bufferOf(3, 1, 1)
    Pixel.clear(b)
    Pixel.plot(b, 0, 0, Palette.TOP)
    Pixel.plot(b, 0, 1, Palette.LEFT)
    Pixel.plot(b, 1, 1, Palette.LEFT)
    Pixel.plot(b, 2, 0, Palette.TOP)
    Pixel.plot(b, 2, 1, Palette.TOP)
    const g = Pixel.gridOf(3, 1)
    Pixel.fold(b, g)
    const words = Fixtures.wordsOf(Pixel.encode(g))
    expect(words.slice(0, 3)).toEqual([0x2580, Palette.RGB[Palette.TOP]!, Palette.RGB[Palette.LEFT]!])
    expect(words.slice(3, 6)).toEqual([0x2584, Palette.RGB[Palette.LEFT]!, 0x01000000])
    expect(words.slice(6, 9)).toEqual([0x20, 0x01000000, Palette.RGB[Palette.TOP]!])
  })

  test('scale 2 paints one logical pixel over two columns and a whole row', async () => {
    const b = Pixel.bufferOf(4, 2, 2)
    expect([b.w, b.h]).toEqual([2, 2])
    Pixel.clear(b)
    Pixel.plot(b, 1, 0, Palette.WHITE)
    const g = Pixel.gridOf(4, 2)
    Pixel.fold(b, g)
    const words = Fixtures.wordsOf(Pixel.encode(g))
    expect(words[2 * 3 + 2]).toBe(Palette.RGB[Palette.WHITE]!)
    expect(words[3 * 3 + 2]).toBe(Palette.RGB[Palette.WHITE]!)
    expect(words[0 * 3 + 2]).toBe(0x01000000)
  })
})

describe('iso', () => {
  test('flat tiles meet without gaps or overlaps inside the map', async () => {
    const world = flatWorld(12, 12)
    const b = Pixel.bufferOf(40, 20, 1)
    Pixel.clear(b)
    const s = Iso.screenOf(6, 6, 0)
    Iso.drawWorld(b, world, { ox: Math.round(s.sx) - 20, oy: Math.round(s.sy) - 20 })
    for (let i = 0; i < b.px.length; i++) expect(b.px[i] === Palette.VOID).toBe(false)
  })

  test('only tiles near the view are drawn', async () => {
    const world = flatWorld(32, 32)
    const b = Pixel.bufferOf(40, 30, 1)
    Pixel.clear(b)
    const s = Iso.screenOf(16, 16, 0)
    const drawn = Iso.drawWorld(b, world, { ox: Math.round(s.sx) - 20, oy: Math.round(s.sy) - 30 })
    expect(drawn < 32 * 32 / 3).toBe(true)
    expect(drawn > 40).toBe(true)
  })

  test('a tall block in front of the dog hides it, one behind it does not', async () => {
    const front = flatWorld(12, 12)
    front.height[6 * 12 + 5] = 3 // (5, 6): 강아지 (5, 5) 의 바로 앞(+y)
    const behind = flatWorld(12, 12)
    behind.height[4 * 12 + 5] = 3 // (5, 4): 바로 뒤(-y)
    const visible = (world: WorldState) => {
      const b = Pixel.bufferOf(40, 20, 1)
      Pixel.clear(b)
      const s = Iso.screenOf(5, 5, 0)
      const view = { ox: Math.round(s.sx) - 20, oy: Math.round(s.sy) - 30 }
      Iso.drawWorld(b, world, view)
      Sprite.drawDog(b, { ...STAND, flip: true }, 20, 30, 10.4)
      let n = 0
      for (const c of b.px) if (c === Palette.WHITE) n++
      return n
    }
    const open = visible(flatWorld(12, 12))
    expect(visible(behind)).toBe(open)
    expect(visible(front) < open).toBe(true)
  })

  test('the camera stays put while the target moves inside the dead zone', async () => {
    const cam = Iso.cameraOf(0, 0)
    Iso.follow(cam, Iso.DEAD_X - 1, Iso.DEAD_Y - 1, 1000)
    expect([cam.x, cam.y]).toEqual([0, 0])
    Iso.follow(cam, 40, 0, 1000)
    expect(cam.x > 30).toBe(true)
  })
})
