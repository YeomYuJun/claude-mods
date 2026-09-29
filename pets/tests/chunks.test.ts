import { describe, expect, test } from 'claude-code/testing'

import Biome from '../hooks/biome'
import Iso from '../hooks/iso'
import Names from '../hooks/names'
import Pet from '../hooks/pet'
import Pixel, { Palette } from '../hooks/pixel'
import Scene from '../hooks/scene'
import World, { type World as WorldState } from '../hooks/world'
import Fixtures from './fixtures'

const C = World.Chunks
const G = World.Gen
const OPEN = Biome.BIOMES.filter(b => b.open === true)
const T0 = 1_000_000

// 청크 하나의 칸 값이 한 번에 만든 영역(r, 원점 rx0·ry0)과 같은지. 다른 첫 칸을 돌려준다
function diffOf(c: World.Chunks.Chunk, r: World.Gen.Region, props: boolean): string | undefined {
  for (let j = 0; j < C.SIZE; j++) {
    for (let i = 0; i < C.SIZE; i++) {
      const x = c.cx * C.SIZE + i
      const y = c.cy * C.SIZE + j
      const a = (y - r.y0) * r.w + (x - r.x0)
      const o = j * C.SIZE + i
      const f = c.flags[o]!
      const wet = f & World.DEEP ? G.WATER_DEEP : f & World.WATER ? G.WATER_SHALLOW : G.WATER_NONE
      const got = [c.height[o], c.prop[o], f & World.BLOCK ? 1 : 0, c.kind[o], c.deco[o], wet].join(',')
      const want = [r.height[a], props ? r.prop[a] : 0, r.block[a], r.kind[a], r.deco[a], r.water[a]].join(',')
      if (got !== want) return `${x},${y} ${got} != ${want}`
    }
  }
  return undefined
}

function sameChunk(a: World.Chunks.Chunk, b: World.Chunks.Chunk): boolean {
  for (const k of ['height', 'flags', 'prop', 'kind', 'deco'] as const) for (let i = 0; i < a[k].length; i++) if (a[k][i] !== b[k][i]) return false
  return true
}

describe('chunks', () => {
  for (const b of OPEN) {
    test(`${b.id}: chunks made one by one in any order equal one 96 × 96 region made at once (heights, props, blocks, kinds, decorations, water), negative coordinates included`, async () => {
      const store = C.create(7, b.gen, true)
      for (const [cx, cy] of [[0, 0], [-2, -1], [-1, -2], [-2, -2], [0, -2], [-1, 0], [-1, -1], [0, -1], [-2, 0]] as const) C.make(store, cx, cy)
      const r = G.region(7, b.gen, -64, -64, 96, 96)
      let wet = 0
      let branches = 0
      for (let cy = -2; cy <= 0; cy++) {
        for (let cx = -2; cx <= 0; cx++) {
          const c = store.chunks.get(C.keyOf(cx, cy))!
          expect(`${b.id} ${cx},${cy} ${diffOf(c, r, true) ?? 'same'}`).toBe(`${b.id} ${cx},${cy} same`)
          for (let i = 0; i < c.flags.length; i++) {
            if (c.flags[i]! & World.WATER) wet++
            if (c.deco[i] === G.DECO_BRANCH) branches++
          }
        }
      }
      expect(`${b.id} branches ${branches > 0}`).toBe(`${b.id} branches true`)
      if (b.id === 'lake') expect(wet > 0).toBe(true)
    })
  }

  test('generation cut into small units and resumed over later ticks makes the same chunk as making it at once, in every open set', async () => {
    for (const b of OPEN) {
      const once = C.create(11, b.gen, true)
      const whole = C.make(once, 1, -1)
      const sliced = C.create(11, b.gen, true)
      let ticks = 0
      while (!C.has(sliced, 1, -1) && ticks < 500) {
        C.pump(sliced, [[1, -1]], 1)
        ticks++
      }
      expect(`${b.id} ${ticks > 4} ${sameChunk(whole, sliced.chunks.get(C.keyOf(1, -1))!)}`).toBe(`${b.id} true true`)
    }
  })

  // 청크는 둘레 RIM 2 칸 + 블록 판정 PAD 2 칸 + 포락선 여유를 더 읽는다. 여유 하나만 줄이면 이 4 칸 덕에 청크 값이 바뀌지 않으므로,
  // 읽는 범위 전체(RIM + PAD + 여유)가 반경보다 하나 작아지게 여유를 줄였을 때 반드시 달라지는지 본다
  test('chunk seams: with a pit just outside the chunk, chunks equal one region when everything the chunk reads spans the envelope radius, and differ when it spans one less', async () => {
    const lake = Biome.byId('lake').gen
    const gen: World.Gen.GenParams = { ...lake, obsP: 0, lake: { p: 0, r: [4, 4] } }
    const reach = G.reachOf(gen)
    expect(reach).toBe(5)
    const pit = { x: -reach, y: 16 }
    const source = (x: number, y: number) => (x === pit.x && y === pit.y ? 0 : gen.hmax)
    const whole = G.region(1, gen, -32, -32, 96, 96, { raw: source })
    const heightDiffs = (margin: number) => {
      const c = C.make(C.create(1, gen, false, { source, margin }), 0, 0)
      let n = 0
      for (let j = 0; j < C.SIZE; j++) for (let i = 0; i < C.SIZE; i++) if (c.height[j * C.SIZE + i] !== whole.height[(j + 32) * 96 + i + 32]) n++
      return n
    }
    // RIM + PAD = 4 칸이라 여유 1 이면 읽는 범위가 반경 5 와 같고, 여유 0 이면 4
    expect(heightDiffs(reach - 4)).toBe(0)
    expect(heightDiffs(reach - 5) > 0).toBe(true)
    expect(heightDiffs(reach)).toBe(0)
  })

  test('walkable tiles decided tile by tile in chunks equal the largest connected area of a 96 × 96 map built from the same region, away from its edge', async () => {
    for (const b of OPEN) {
      for (const seed of [5, 9]) {
        const r = G.region(seed, b.gen, -48, -48, 96, 96)
        const obstacle = new Uint8Array(96 * 96)
        for (let i = 0; i < obstacle.length; i++) obstacle[i] = r.prop[i] ? 1 : 0
        const bfs = World.build({ w: 96, h: 96, height: r.height, block: r.block, obstacle, prop: r.prop, kind: r.kind, deco: r.deco, water: r.water })
        const open = World.create(seed, b.gen, { open: true, props: true })
        let diff = 0
        for (let y = -36; y < 36; y++) {
          for (let x = -36; x < 36; x++) {
            const a = World.flagsAt(bfs, x + 48, y + 48) & World.WALK
            if (a !== (World.flagsAt(open, x, y) & World.WALK)) diff++
          }
        }
        expect(`${b.id} ${seed} ${diff}`).toBe(`${b.id} ${seed} 0`)
      }
    }
  })

  test('the start is the first dry, walkable, non-block tile on a spiral out from (0, 0)', async () => {
    for (const b of OPEN) {
      const w = World.create(3, b.gen, { open: true, props: true })
      const ground = (x: number, y: number) => { const f = World.flagsAt(w, x, y); return (f & World.WALK) !== 0 && (f & (World.WATER | World.BLOCK)) === 0 }
      const order: Array<[number, number]> = [[0, 0]]
      for (let r = 1; r <= 8; r++) {
        for (let x = -r; x <= r; x++) order.push([x, -r])
        for (let y = -r + 1; y <= r; y++) order.push([r, y])
        for (let x = r - 1; x >= -r; x--) order.push([x, r])
        for (let y = r - 1; y >= -r + 1; y--) order.push([-r, y])
      }
      const first = order.find(([x, y]) => ground(x, y))!
      expect(`${b.id} ${w.spawn.x},${w.spawn.y}`).toBe(`${b.id} ${first[0]},${first[1]}`)
    }
  })

  test('drawing never makes a chunk: tiles of a chunk not yet made stay empty and the next prefetch ticks make it; a query from the dog makes it on the spot and is counted', async () => {
    const scene = Scene.create(3, T0, 'meadow')
    const s = scene.world.chunks!
    expect(s.chunks.size >= 9).toBe(true)
    const before = s.chunks.size
    const buf = Pixel.bufferOf(200, 80, 1)
    Pixel.clear(buf)
    const view = Iso.viewOf(scene.cam, buf, Iso.FAR)
    const want = Scene.chunksFor(scene, 200, 80, 'far')
    const missing = want.visible.filter(([x, y]) => !C.has(s, x, y))
    expect(missing.length > 0).toBe(true)
    Iso.drawWorld(buf, scene.world, view, Iso.FAR, scene.theme)
    expect(s.chunks.size).toBe(before)
    expect(s.blank > 0).toBe(true)
    let empty = 0
    for (const c of buf.px) if (c === Palette.VOID) empty++
    expect(empty > 0).toBe(true)
    // 다음 틱들의 미리 만들기가 보이는 청크부터 만든다
    for (let i = 0; i < 400 && missing.some(([x, y]) => !C.has(s, x, y)); i++) Scene.prefetch(scene, 200, 80, 'far')
    expect(missing.every(([x, y]) => C.has(s, x, y))).toBe(true)
    // 캐시에 없는 먼 칸을 질의하면 그 자리에서 만들고 센다
    const sync = s.syncMade
    World.heightAt(scene.world, 40 * C.SIZE, 40 * C.SIZE)
    expect(s.syncMade).toBe(sync + 1)
    Pixel.clear(buf)
    Iso.drawWorld(buf, scene.world, Iso.viewOf(scene.cam, buf, Iso.FAR), Iso.FAR, scene.theme)
    let still = 0
    for (const c of buf.px) if (c === Palette.VOID) still++
    expect(still).toBe(0)
  })

  test('loading the plugin makes no chunk: the default scene is the graph-paper island', async () => {
    expect(Biome.DEFAULT).toBe('paper')
    const scene = Scene.create(0x5eed, 0)
    expect(scene.world.chunks).toBe(undefined)
    expect(World.isOpen(scene.world)).toBe(false)
  })

  for (const b of OPEN) {
    test(`${b.id}: an hour with a 120 × 60 panel prefetching every tick runs without error, keeps at most 25 chunks and never makes one on the spot`, async () => {
      const scene = Scene.create(7, T0, b.id)
      const s = scene.world.chunks!
      Scene.ensureVisible(scene, 120, 60, 1)
      const sync = s.syncMade
      const steps = Math.round((60 * 60_000) / Names.SIM_STEP_MS)
      let most = 0
      for (let i = 1; i <= steps; i++) {
        const now = T0 + i * Names.SIM_STEP_MS
        scene.pet.lastSignalAt = now
        Scene.step(scene, Names.SIM_STEP_MS, now)
        Scene.prefetch(scene, 120, 60, 1)
        most = Math.max(most, s.chunks.size)
      }
      expect(`${b.id} most ${most <= C.CAP_MIN} sync ${s.syncMade - sync}`).toBe(`${b.id} most true sync 0`)
    })
  }

  test('edits outlive their chunk: a branch moved away and a pit stay after every chunk is dropped and made again', async () => {
    const w = World.create(5, Biome.byId('forest').gen, { open: true, props: true })
    const s = w.chunks!
    let from: { x: number; y: number } | undefined
    for (let y = -20; y <= 20 && !from; y++) for (let x = -20; x <= 20 && !from; x++) if (World.decoAt(w, x, y) === G.DECO_BRANCH) from = { x, y }
    expect(from !== undefined).toBe(true)
    const to = { x: from!.x + 40, y: from!.y }
    expect(World.decoAt(w, to.x, to.y) === G.DECO_BRANCH).toBe(false)
    World.setDeco(w, from!.x, from!.y, 0)
    World.setDeco(w, to.x, to.y, G.DECO_BRANCH)
    World.addPit(w, to.x, to.y + 1, T0)
    C.clear(s)
    expect(World.decoAt(w, from!.x, from!.y)).toBe(0)
    expect(World.decoAt(w, to.x, to.y)).toBe(G.DECO_BRANCH)
    expect(World.hasPit(w, to.x, to.y + 1)).toBe(true)
    // 생성기 값으로 되돌리면 편집이 빠진다
    World.setDeco(w, from!.x, from!.y, G.DECO_BRANCH)
    expect(w.edits.has(World.cellKeyOf(from!.x, from!.y))).toBe(false)
    // 구덩이는 30 분 뒤 사라진다
    World.expireEdits(w, T0 + World.PIT_MS)
    expect(World.hasPit(w, to.x, to.y + 1)).toBe(false)
  })

  test('the edit table holds at most 256 cells: pits go first, and a branch that finds no room goes back where it was picked up', async () => {
    const w = Fixtures.flatWorld(40, 40)
    for (let i = 0; i < World.EDITS_MAX; i++) expect(World.addPit(w, i % 40, Math.floor(i / 40), T0)).toBe(true)
    expect(w.edits.size).toBe(World.EDITS_MAX)
    expect(World.setDeco(w, 39, 39, G.DECO_BRANCH)).toBe(true)
    expect(w.edits.size).toBe(World.EDITS_MAX)
    expect(World.hasPit(w, 0, 0)).toBe(false)
    const full = Fixtures.flatWorld(40, 40)
    for (let i = 0; i < World.EDITS_MAX; i++) World.setDeco(full, i % 40, Math.floor(i / 40), G.DECO_BRANCH)
    expect(World.setDeco(full, 39, 39, G.DECO_BRANCH)).toBe(false)
  })

  test('saved edits come back the same, and an unknown version or shape reads as no edits', async () => {
    const w = Fixtures.flatWorld(20, 20)
    World.setDeco(w, 3, 4, G.DECO_BRANCH)
    World.addPit(w, 5, 6, T0)
    const saved = World.editsToSave(w, T0)
    expect(saved.v).toBe(1)
    const back = World.editsFromSave(JSON.parse(JSON.stringify(saved)))!
    expect([...back.entries()]).toEqual([...w.edits.entries()])
    for (const bad of [undefined, 3, { v: 2, list: [] }, { v: 1 }, { list: [] }, [[1, 2, 1, 6]]]) expect(World.editsFromSave(bad)).toBe(undefined)
    expect(World.editsFromSave({ v: 1, list: [[1, 2, 9, 0], ['a', 2, 1, 6], [1, 2, 1, 6]] })!.size).toBe(1)
  })
})

describe('chew and pits', () => {
  // 12 걸음 안에 나뭇가지가 있는 숲 맵을 찾는다
  function forestWithBranch(): { world: WorldState; pet: Pet.Pet } {
    for (let seed = 1; seed < 60; seed++) {
      const world = World.create(seed, Biome.byId('forest').gen, { open: true, props: true })
      const pet = Pet.create(world, seed, T0)
      if (Pet.ACTS.chew.feasible(pet, world, Pet.surveyOf(pet, world))) return { world, pet }
    }
    throw new Error('no forest seed with a branch within 12 steps')
  }

  test('chew walks to a branch, carries it a few steps, lies down with it and leaves it where it lay; the move stays in the edit table', async () => {
    const { world, pet } = forestWithBranch()
    pet.act = Pet.build('chew', pet, world)
    const target = pet.act.steps[0]!
    expect(target.k).toBe('go')
    const from = (target as { to: { x: number; y: number } }).to
    let held = 0
    let lying = 0
    let now = T0
    for (let i = 0; i < 2000 && pet.act.name === 'chew'; i++) {
      now += Names.SIM_STEP_MS
      pet.lastSignalAt = now
      Pet.update(pet, world, Names.SIM_STEP_MS, now)
      if (pet.holding) held++
      if (pet.holding && pet.pose === 'lie') lying++
    }
    expect(pet.act.name === 'chew').toBe(false)
    expect(held > 0 && lying > 0).toBe(true)
    expect(pet.holding).toBe(undefined)
    expect(World.decoAt(world, from.x, from.y)).toBe(0)
    const placed = [...world.edits.entries()].filter(([, e]) => e.deco === G.DECO_BRANCH)
    expect(placed.length).toBe(1)
  })

  test('a chew cut short by a prompt drops the branch at the dog instead of losing it', async () => {
    const { world, pet } = forestWithBranch()
    pet.act = Pet.build('chew', pet, world)
    let now = T0
    // 문 채로 집어 든 칸에서 한 칸 넘게 옮겨 갈 때까지 돌린다
    const moved = () => pet.holding !== undefined && (Math.round(pet.x) !== pet.holding.from.x || Math.round(pet.y) !== pet.holding.from.y)
    for (let i = 0; i < 2000 && !moved(); i++) {
      now += Names.SIM_STEP_MS
      pet.lastSignalAt = now
      Pet.update(pet, world, Names.SIM_STEP_MS, now)
    }
    expect(moved()).toBe(true)
    const from = pet.holding!.from
    Pet.onTurnStart(pet, world, now, 'hi')
    Pet.update(pet, world, Names.SIM_STEP_MS, now + Names.SIM_STEP_MS)
    expect(pet.holding).toBe(undefined)
    const placed = [...world.edits.entries()].filter(([, e]) => e.deco === G.DECO_BRANCH).map(([k]) => World.cellOfKey(k))
    expect(placed.length).toBe(1)
    expect(World.decoAt(world, from.x, from.y)).toBe(0)
    // 내려놓은 칸은 강아지가 선 칸이거나 그 네 이웃
    const t = { x: Math.round(pet.x), y: Math.round(pet.y) }
    expect(Math.abs(placed[0]!.x - t.x) + Math.abs(placed[0]!.y - t.y) <= 1).toBe(true)
  })

  test('the everyday dig leaves a pit on the tile it dug, drawn on the top face in the pit color, and the pit has a darker shadow', async () => {
    const world = Fixtures.flatWorld(24, 24)
    const pet = Pet.create(world, 3, T0)
    pet.energy = 0.8
    pet.act = Pet.build('digSpot', pet, world)
    let now = T0
    for (let i = 0; i < 2000 && pet.act.name === 'digSpot'; i++) {
      now += Names.SIM_STEP_MS
      pet.lastSignalAt = now
      Pet.update(pet, world, Names.SIM_STEP_MS, now)
    }
    const t = { x: Math.round(pet.x), y: Math.round(pet.y) }
    expect(World.hasPit(world, t.x, t.y)).toBe(true)
    for (const proj of [Iso.NEAR, Iso.FAR]) {
      const { b } = Fixtures.drawAround(world, proj, 8)
      expect(b.px.includes(Palette.PIT)).toBe(true)
    }
    for (const biome of Biome.BIOMES) {
      const { rgb, shadowOf } = Biome.themeOf(biome.id)
      expect(Palette.lumaOf(rgb[shadowOf[Palette.PIT]!]!) < Palette.lumaOf(rgb[Palette.PIT]!)).toBe(true)
    }
  })
})

describe('depth far from the origin', () => {
  // 깊이 버퍼는 Float32 다. x + y 가 16,384 를 넘으면 간격이 0.002 로 벌어져, 여러 마리를 0.001 씩 떼어 놓는 깊이(16 단계)가 뭉개진다.
  // 그래서 버퍼에는 카메라 쪽 대각선 dz 를 뺀 작은 값을 담는다. 한 마리일 때 타일·소품·동물의 깊이 차(0.05 이상)는 이 범위에서 뭉개지지 않는다
  test('near x + y = 20,000 the depths written to the buffer are small and camera-relative, so a 0.001 step between two depths survives Float32', async () => {
    const flat: World.Gen.GenParams = { ...World.PAPER_GEN, hmin: 1, hmax: 1, obsP: 0 }
    const world = World.create(1, flat, { open: true })
    const px = 10_000.3
    const py = 10_000.1
    for (let cy = C.chunkOf(py - 40); cy <= C.chunkOf(py + 40); cy++) for (let cx = C.chunkOf(px - 40); cx <= C.chunkOf(px + 40); cx++) C.make(world.chunks!, cx, cy)
    const s = Iso.screenOf(px, py, World.standZ(world, 10_000, 10_000))
    const b = Pixel.bufferOf(60, 30, 1)
    Pixel.clear(b)
    const view = Iso.viewOf(Iso.cameraOf(s.sx, s.sy - 8), b, Iso.NEAR)
    Iso.drawWorld(b, world, view, Iso.NEAR)
    let far = 0
    for (let i = 0; i < b.px.length; i++) if (b.px[i] !== Palette.VOID) far = Math.max(far, Math.abs(b.depth[i]!))
    expect(far > 0 && far < 64).toBe(true)
    const dz = view.dz ?? 0
    const pet = px + py + 0.4
    expect(Math.fround(pet + 0.001 - dz) > Math.fround(pet - dz)).toBe(true)
    // 기준을 빼지 않으면 같은 값이 된다
    expect(Math.fround(pet + 0.001) > Math.fround(pet)).toBe(false)
  })
})
