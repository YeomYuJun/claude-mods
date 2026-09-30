import { describe, expect, test } from 'claude-code/testing'

import Biome from '../hooks/biome'
import Iso, { type Proj } from '../hooks/iso'
import Pixel, { Palette, type Buffer } from '../hooks/pixel'
import Prop, { type PropArtId } from '../hooks/prop'
import Species from '../hooks/species'
import Sprite, { type PetPose } from '../hooks/sprite'
import World, { type World as WorldState } from '../hooks/world'
import Fixtures from './fixtures'

const RGB = Palette.PAPER_THEME.rgb
const TOP = Palette.kind(0) + Palette.Top.TOP0
const SIDE = Palette.material(0) + Palette.Side.SIDE_L
const BODY = Palette.bank(0) + Palette.Role.body

const flatWorld = Fixtures.flatWorld

const STAND: PetPose = {
  body: 'stand', flip: false, back: false, bodyDx: 0, bodyDy: 0, tilt: 0, head: 'face', headKind: 'plain', headDx: 0, headDy: 0,
  eyeClosed: false, tongue: false, mouthOpen: false, tailAngle: 0.8, tailLen: 3, scratch: 0,
  legs: [[-3, false], [-2, true], [2, false], [3, true]].map(([hipX, far]) => ({ hipX: hipX as number, far: far as boolean, dx: 0, lift: false, len: 2 })),
}

describe('pixel', () => {
  test('the fallback base64 encoder matches the engine one for every tail length', async () => {
    for (const n of [0, 1, 2, 3, 4, 5, 12, 257]) {
      const bytes = new Uint8Array(n).map((_, i) => (i * 37 + 11) & 0xff)
      const native = (bytes as unknown as { toBase64?: () => string }).toBase64
      if (typeof native === 'function') expect(Pixel.encodeBytes(bytes)).toBe(native.call(bytes))
      else expect(Pixel.encodeBytes(bytes).length).toBe(Math.ceil(n / 3) * 4)
    }
  })

  test('two pixels fold into one cell: ▀ top over bottom, ▄ when the top is empty, a space when both match', async () => {
    const b = Pixel.bufferOf(3, 1, 1)
    Pixel.clear(b)
    Pixel.plot(b, 0, 0, TOP)
    Pixel.plot(b, 0, 1, SIDE)
    Pixel.plot(b, 1, 1, SIDE)
    Pixel.plot(b, 2, 0, TOP)
    Pixel.plot(b, 2, 1, TOP)
    const g = Pixel.gridOf(3, 1)
    Pixel.fold(b, g, RGB)
    const words = Fixtures.wordsOf(Pixel.encode(g))
    expect(words.slice(0, 3)).toEqual([0x2580, RGB[TOP]!, RGB[SIDE]!])
    expect(words.slice(3, 6)).toEqual([0x2584, RGB[SIDE]!, 0x01000000])
    expect(words.slice(6, 9)).toEqual([0x20, 0x01000000, RGB[TOP]!])
  })

  test('shrink by 2 keeps a 2 × 2 cell when half of it is covered, paints its heaviest color, and counts weak colors at 0.45', async () => {
    const O = 1
    const W = 2
    // 기준점 (2, 3). rowShift 0: 줄 0 이 줄인 줄 -2, 줄 1·2 가 줄인 줄 -1, 줄 3 이 줄인 줄 0
    const src = { w: 4, h: 4, px: Uint8Array.from([
      0, 0, 0, 0,
      O, O, W, O,
      O, W, O, 0,
      0, 0, 0, W,
    ]) }
    const small = Pixel.shrink(src, 2, 3, 0, { by: 2, minCover: 0.5, rowShift: 0, weak: [O] })
    expect([small.w, small.h, small.ax, small.ay]).toEqual([2, 3, 1, 2])
    // 칸 (-1, -1): O 3 개(1.35) · W 1 개 → O. 칸 (0, -1): O 2 개(0.9) · W 1 개 → W. 칸 (0, 0) 은 넓이 1/4 만 덮여 비운다
    expect(Array.from(small.px)).toEqual([0, 0, O, W, 0, 0])
    // rowShift 1: 기준점 줄과 그 위 줄이 줄인 줄 0 이다. 같은 무게면 먼저 나온 색(위 줄, 왼쪽)
    const shifted = Pixel.shrink(src, 2, 3, 0, { by: 2, minCover: 0, rowShift: 1 })
    expect([shifted.h, shifted.ay]).toEqual([2, 1])
    expect(Array.from(shifted.px)).toEqual([O, W, O, O])
  })

  test('shrink by 1.5 turns 3 × 3 pixels into 2 × 2, weighing each pixel by the area it shares with the smaller pixel', async () => {
    const A = 1
    const B = 2
    // 기준점 (0, 3): 세 줄이 줄인 줄 -2([-3, -1.5))와 -1([-1.5, 0))로, 세 열이 줄인 열 0([0, 1.5))과 1([1.5, 3))로 나뉜다
    const src = { w: 3, h: 3, px: Uint8Array.from([
      B, B, A,
      B, B, A,
      A, A, A,
    ]) }
    const small = Pixel.shrink(src, 0, 3, 0, { by: 1.5, minCover: 0.5, rowShift: 0 })
    expect([small.w, small.h, small.ax, small.ay]).toEqual([2, 2, 0, 2])
    // 왼쪽 위: B 1 + 0.5 + 0.5 + 0.25 = 2.25. 오른쪽 위: B 0.5 + 0.25 = 0.75, A 1 + 0.5 = 1.5
    expect(Array.from(small.px)).toEqual([B, A, A, A])
  })

  test('scale 2 paints one logical pixel over two columns and a whole row', async () => {
    const b = Pixel.bufferOf(4, 2, 2)
    expect([b.w, b.h]).toEqual([2, 2])
    Pixel.clear(b)
    Pixel.plot(b, 1, 0, BODY)
    const g = Pixel.gridOf(4, 2)
    Pixel.fold(b, g, RGB)
    const words = Fixtures.wordsOf(Pixel.encode(g))
    expect(words[2 * 3 + 2]).toBe(RGB[BODY]!)
    expect(words[3 * 3 + 2]).toBe(RGB[BODY]!)
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
    const front = flatWorld(12, 12, [[5, 6, 3]]) // (5, 6): 강아지 (5, 5) 의 바로 앞(+y)
    const behind = flatWorld(12, 12, [[5, 4, 3]]) // (5, 4): 바로 뒤(-y)
    const visible = (world: WorldState) => {
      const b = Pixel.bufferOf(40, 20, 1)
      Pixel.clear(b)
      const s = Iso.screenOf(5, 5, 0)
      const view = { ox: Math.round(s.sx) - 20, oy: Math.round(s.sy) - 30 }
      Iso.drawWorld(b, world, view)
      Sprite.drawPet(b, Species.DOG, { ...STAND, flip: true }, 20, 30, 10.4)
      let n = 0
      for (const c of b.px) if (c === BODY) n++
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

// 세 투영에 똑같이 거는 기하 검사
const PROJS: ReadonlyArray<readonly [string, Proj]> = [['near', Iso.NEAR], ['far', Iso.FAR], ['wide', Iso.WIDE]]

// 시작 칸 둘레 ±24 칸이 모두 들어가는 버퍼와 그 원점
const fullOf = (world: WorldState, proj: Proj) => Fixtures.drawAround(world, proj)

// 세트마다 시드 7 맵 하나(패널과 같은 맵). 맵 만들기가 무거워 이 파일에서 한 번만 만든다
let sets: Array<readonly [string, WorldState]> | undefined
function setWorlds(): ReadonlyArray<readonly [string, WorldState]> {
  sets ??= Biome.BIOMES.map(b => [b.id, Biome.worldOf(b.id, 7)] as const)
  return sets
}

describe('iso projections', () => {
  test('diamond tops of every projection tile the plane: every pixel is covered exactly once', async () => {
    for (const [, proj] of PROJS) {
      const cover = new Map<string, number>()
      for (let x = -6; x <= 6; x++) {
        for (let y = -6; y <= 6; y++) {
          for (const p of proj.tops) {
            const key = `${(x - y) * proj.hw + p.dx},${(x + y) * proj.hh + p.dy}`
            cover.set(key, (cover.get(key) ?? 0) + 1)
          }
        }
      }
      for (let sy = -3 * proj.hh; sy < 3 * proj.hh; sy++) {
        for (let sx = -3 * proj.hw; sx < 3 * proj.hw; sx++) expect(cover.get(`${sx},${sy}`) ?? 0).toBe(1)
      }
    }
  })

  test('far flat tiles fill the view without gaps', async () => {
    const world = flatWorld(16, 16)
    const b = Pixel.bufferOf(40, 20, 1)
    Pixel.clear(b)
    const s = Iso.screenOf(8, 8, 0, Iso.FAR)
    Iso.drawWorld(b, world, { ox: Math.round(s.sx) - 20, oy: Math.round(s.sy) - 20 }, Iso.FAR)
    for (let i = 0; i < b.px.length; i++) expect(b.px[i] === Palette.VOID).toBe(false)
  })

  test('map-view flat tiles fill the view without gaps', async () => {
    const world = flatWorld(48, 48)
    const b = Pixel.bufferOf(40, 20, 1)
    Pixel.clear(b)
    const s = Iso.screenOf(24, 24, 0, Iso.WIDE)
    Iso.drawWorld(b, world, { ox: Math.round(s.sx) - 20, oy: Math.round(s.sy) - 20 }, Iso.WIDE)
    for (let i = 0; i < b.px.length; i++) expect(b.px[i] === Palette.VOID).toBe(false)
  })

  test('culling drops no visible tile or prop: a small view equals the same crop of the whole map, on graph paper and on the taller sets', async () => {
    const paper = (seed: number) => World.create(seed, World.PAPER_GEN, { props: true })
    const worlds = [paper(3), paper(11), ...setWorlds().filter(([id]) => id !== Biome.DEFAULT).map(([, w]) => w)]
    for (const [, proj] of PROJS) {
      for (const world of worlds) {
        const full = fullOf(world, proj)
        const sw = 40
        const sh = 60
        const spanX = full.b.w - sw
        const spanY = full.b.h - sh
        const views = [[0, 0], [spanX, 0], [0, spanY], [spanX, spanY], [spanX >> 1, spanY >> 1], [spanX >> 2, (spanY * 3) >> 2]]
        for (const [dx, dy] of views) {
          const b = Pixel.bufferOf(sw, sh / 2, 1)
          Pixel.clear(b)
          const view = { ox: full.view.ox + dx!, oy: full.view.oy + dy! }
          const drawn = Iso.drawWorld(b, world, view, proj)
          Prop.drawProps(b, world, view, proj)
          expect(drawn < Fixtures.tilesAround(world).filter(t => World.inside(world, t.x, t.y)).length).toBe(true)
          let same = true
          for (let y = 0; y < sh && same; y++) {
            for (let x = 0; x < sw; x++) {
              const i = y * sw + x
              const j = (y + dy!) * full.b.w + (x + dx!)
              if (b.px[i] !== full.b.px[j] || b.depth[i] !== full.b.depth[j]) { same = false; break }
            }
          }
          expect(same).toBe(true)
        }
      }
    }
  })

  test('only tiles whose screen box meets the buffer are drawn, and a 120 × 60 panel draws at most 720 tiles at 1 ×', async () => {
    for (const [id, world] of setWorlds()) {
      for (const [name, proj] of PROJS) {
        // 120 열 × 60 행 패널 = 120 × 120 픽셀, 시작 칸이 가운데
        // 경계 없는 월드는 시작 칸 ±r 칸을 훑는다(원거리 120 × 120 픽셀 화면은 대각선 ±30 칸 안, 맵 보기는 대각선 ±60 칸 안). 그 안의 청크를 먼저 만든다
        const r = proj === Iso.WIDE ? 72 : 48
        Fixtures.loadAround(world, r)
        const b = Pixel.bufferOf(120, 60, 1)
        Pixel.clear(b)
        const s = Iso.screenOf(world.spawn.x, world.spawn.y, 0, proj)
        const view = { ox: Math.round(s.sx) - 60, oy: Math.round(s.sy) - 60 }
        const drawn = Iso.drawWorld(b, world, view, proj)
        let meets = 0
        const all = World.bounds(world)
        const x0 = Math.max(all.x0, world.spawn.x - r)
        const x1 = Math.min(all.x1, world.spawn.x + r)
        const y0 = Math.max(all.y0, world.spawn.y - r)
        const y1 = Math.min(all.y1, world.spawn.y + r)
        for (let y = y0; y <= y1; y++) {
          for (let x = x0; x <= x1; x++) {
            const z = Iso.topZ(world, x, y, proj)
            const tx = (x - y) * proj.hw - view.ox
            const ty = (x + y) * proj.hh - z - view.oy
            // 경사 윗면은 위 꼭짓점이 한 단까지 더 위다
            const rise = World.slopeDirAt(world, x, y) ? proj.step : 0
            if (tx - proj.hw < b.w && tx + proj.hw > 0 && ty - rise < b.h && ty + 2 * proj.hh + z + proj.base > 0) meets++
          }
        }
        expect(`${id} ${name} ${drawn}`).toBe(`${id} ${name} ${meets}`)
        if (proj === Iso.NEAR) expect(`${id} ${drawn <= 720}`).toBe(`${id} true`)
      }
    }
  })

  test('each set paints the top of a tile of height 0 to 8 with the top color its height table picks, never darker for a higher tile', async () => {
    const k = Palette.kind(0)
    for (const biome of Biome.BIOMES) {
      const theme = Biome.themeOf(biome.id)
      expect(theme.topBand.length).toBe(World.MAX_HEIGHT + 1)
      if (biome.id === Biome.DEFAULT) expect(theme.topBand).toEqual([0, 1, 2, 3, 4, 4, 4, 4, 4])
      let luma = -1
      for (let h = 0; h <= World.MAX_HEIGHT; h++) {
        const b = Pixel.bufferOf(40, 40, 1)
        Pixel.clear(b)
        Iso.drawWorld(b, flatWorld(3, 3, [[1, 1, h]]), { ox: -20, oy: -40 }, Iso.NEAR, theme)
        // 칸 (1, 1) 윗면 가운데: 위 꼭짓점 (0, 2hh - z) 에서 hh 아래
        const c = b.px[(2 * Iso.NEAR.hh - h * Iso.NEAR.step + Iso.NEAR.hh + 40) * b.w + 20]!
        const band = theme.topBand[h]!
        expect(`${biome.id} ${h} ${c}`).toBe(`${biome.id} ${h} ${k + band}`)
        const l = Palette.lumaOf(theme.rgb[c]!)
        expect(`${biome.id} ${h} ${l >= luma}`).toBe(`${biome.id} ${h} true`)
        luma = l
      }
      expect(theme.topBand[World.MAX_HEIGHT]).toBe(4)
    }
  })

  test('tree sprites stay within 9 × 14 (pines 7 × 15) at 1 × and 6 × 9 (pines 5 × 10) far, rocks within 7 × 5 and 5 × 3, and every tree is taller than 8 px', async () => {
    const limits: ReadonlyArray<readonly [PropArtId, number, number, number, number]> = [
      ['broadleaf', 9, 14, 6, 9], ['oak', 9, 14, 6, 9], ['willow', 9, 14, 6, 9], ['paperTree', 9, 14, 6, 9], ['pine', 7, 15, 5, 10], ['rock', 7, 5, 5, 3],
      ['palm', 9, 14, 6, 9], ['snowPine', 7, 15, 5, 10], ['cactus', 9, 14, 6, 9],
    ]
    for (const [art, nw, nh, fw, fh] of limits) {
      const near = Prop.sizeOf(art, false)!
      const far = Prop.sizeOf(art, true)!
      expect(`${art} ${near.w <= nw && near.h <= nh} ${far.w <= fw && far.h <= fh}`).toBe(`${art} true true`)
      if (art !== 'rock') expect(`${art} ${near.h > Prop.TALL_PX}`).toBe(`${art} true`)
    }
  })

  test('a dog behind a tree shows through every other pixel (its colors on odd cells, its outline on even ones), a dog in front hides the tree, and short props are never hollowed', async () => {
    // 맵 보기 나무(3 × 5 픽셀 안팎)는 두 대각선 뒤 원래 크기 개를 가리지 않아 1 배·원거리 투영만 본다
    for (const [name, proj] of PROJS.filter(([, q]) => q !== Iso.WIDE)) {
      // 강아지 (5, 5). 나무는 두 대각선 앞 (6, 6) 이나 뒤 (4, 4), 바위는 바로 앞 (5, 6)
      const draw = (world: WorldState, hollow: boolean) => {
        const b = Pixel.bufferOf(40, 20, 1)
        Pixel.clear(b)
        const s = Iso.screenOf(5, 5, 0, proj)
        const view = { ox: Math.round(s.sx) - 20, oy: Math.round(s.sy) - 30 }
        Iso.drawWorld(b, world, view, proj)
        const box = Sprite.boundsOf(Species.DOG, STAND)
        Prop.drawProps(b, world, view, proj, hollow ? { x0: 20 + box.x0, y0: 30 + box.y0, x1: 20 + box.x1, y1: 30 + box.y1, depth: 10.4 } : undefined)
        Sprite.drawPet(b, Species.DOG, STAND, 20, 30, 10.4)
        return b
      }
      const alone = Pixel.bufferOf(40, 20, 1)
      Pixel.clear(alone)
      Sprite.drawPet(alone, Species.DOG, STAND, 20, 30, 10.4)
      const dogPixels = (b: Buffer) => { let n = 0; for (let i = 0; i < b.px.length; i++) if (alone.px[i] !== Palette.VOID && b.px[i] === alone.px[i]) n++; return n }
      const behind = Fixtures.flatWorld(12, 12, [], [[6, 6]])
      const cut = draw(behind, true)
      expect(`${name} ${dogPixels(cut) > dogPixels(draw(behind, false))}`).toBe(`${name} true`)
      for (let i = 0; i < cut.px.length; i++) {
        if (alone.px[i] === Palette.VOID || cut.px[i] === alone.px[i]) continue
        const X = i % cut.w
        const Y = Math.floor(i / cut.w)
        expect(`${name} hidden at odd cell ${((X + Y) & 1) === 1}`).toBe(`${name} hidden at odd cell false`)
      }
      const front = Fixtures.flatWorld(12, 12, [], [[4, 4]])
      expect(`${name} ${dogPixels(draw(front, true))}`).toBe(`${name} ${dogPixels(alone)}`)
      const rock = Fixtures.flatWorld(12, 12, [], [[5, 6, World.Gen.PROP_ROCK]])
      expect(`${name} ${draw(rock, true).px.join(',') === draw(rock, false).px.join(',')}`).toBe(`${name} true`)
    }
  })

  test('far: a tall block in front of the dog hides it, one behind it does not', async () => {
    const front = flatWorld(12, 12, [[5, 6, 3]])
    const behind = flatWorld(12, 12, [[5, 4, 3]])
    const visible = (world: WorldState) => {
      const b = Pixel.bufferOf(40, 20, 1)
      Pixel.clear(b)
      const s = Iso.screenOf(5, 5, 0, Iso.FAR)
      Iso.drawWorld(b, world, { ox: Math.round(s.sx) - 20, oy: Math.round(s.sy) - 30 }, Iso.FAR)
      Sprite.drawPet(b, Species.DOG, { ...STAND, flip: true }, 20, 30, 10.4)
      let n = 0
      for (const c of b.px) if (c === BODY) n++
      return n
    }
    const open = visible(flatWorld(12, 12))
    expect(visible(behind)).toBe(open)
    expect(visible(front) < open).toBe(true)
  })

  test('on flat ground the dog is drawn whole in every projection (the tiles in front do not clip its feet)', async () => {
    for (const [, proj] of PROJS) {
      const alone = Pixel.bufferOf(40, 20, 1)
      Pixel.clear(alone)
      Sprite.drawPet(alone, Species.DOG, STAND, 20, 30, 10.4)
      const b = Pixel.bufferOf(40, 20, 1)
      Pixel.clear(b)
      const s = Iso.screenOf(5, 5, 0, proj)
      Iso.drawWorld(b, flatWorld(12, 12), { ox: Math.round(s.sx) - 20, oy: Math.round(s.sy) - 30 }, proj)
      Sprite.drawPet(b, Species.DOG, STAND, 20, 30, 10.4)
      for (let i = 0; i < alone.px.length; i++) if (alone.px[i] !== Palette.VOID) expect(b.px[i]).toBe(alone.px[i]!)
    }
  })

  test('far screen positions scale the near ones: x by the tile width, height by the step', async () => {
    const near = Iso.screenOf(7, 3, 0)
    const far = Iso.screenOf(7, 3, 0, Iso.FAR)
    expect(far.sx).toBe(near.sx * Iso.FAR.hw / Iso.NEAR.hw)
    expect(far.sy).toBe(near.sy * Iso.FAR.hh / Iso.NEAR.hh)
    const up = Iso.screenOf(7, 3, 2 * Iso.NEAR.step, Iso.FAR)
    expect(far.sy - up.sy).toBe(2 * Iso.FAR.step)
  })
})

describe('small animal', () => {
  // 원래 크기 개(선 모습)를 반전하지 않고 그린 버퍼. 바닥 점 (20, 32)
  const figOf = () => {
    const fig = Pixel.bufferOf(40, 20, 1)
    Pixel.clear(fig)
    Sprite.drawPet(fig, Species.DOG, STAND, 20, 32, 0)
    return fig
  }
  const painted = (b: Buffer) => {
    const out: Array<[number, number, number]> = []
    for (let i = 0; i < b.px.length; i++) if (b.px[i] !== Palette.VOID) out.push([i % b.w, Math.floor(i / b.w), b.px[i]!])
    return out
  }
  const drawn = (by: number, flip: boolean) => {
    const b = Pixel.bufferOf(40, 20, 1)
    Pixel.clear(b)
    Sprite.drawSmall(b, figOf(), 20, 32, 20, 30, flip, 1, Species.DOG, by)
    return b
  }

  test('far and map view draw the animal at 1/2 or 2/3 size with its feet one row above the ground point', async () => {
    const full = painted(figOf())
    const span = (list: Array<[number, number, number]>, k: 0 | 1) => Math.max(...list.map(p => p[k])) - Math.min(...list.map(p => p[k])) + 1
    for (const by of [2, 1.5]) {
      const small = painted(drawn(by, false))
      expect(`${by} ${small.length > 0}`).toBe(`${by} true`)
      expect(`${by} ${span(small, 0) <= Math.ceil(span(full, 0) / by) + 1} ${span(small, 1) <= Math.ceil(span(full, 1) / by) + 1}`).toBe(`${by} true true`)
      expect(`${by} ${Math.max(...small.map(p => p[1]))}`).toBe(`${by} 29`)
    }
    expect(painted(drawn(1.5, false)).length > painted(drawn(2, false)).length).toBe(true)
  })

  test('the small animal facing left is the mirror of the one facing right about the ground point column', async () => {
    for (const by of [2, 1.5]) {
      const right = drawn(by, false)
      const left = drawn(by, true)
      for (const [x, y, c] of painted(right)) expect(`${by} ${x},${y} ${left.px[y * left.w + (40 - x)]}`).toBe(`${by} ${x},${y} ${c}`)
      expect(painted(left).length).toBe(painted(right).length)
    }
  })
})
