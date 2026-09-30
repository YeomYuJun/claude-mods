import { describe, expect, test } from 'claude-code/testing'

import Biome from '../hooks/biome'
import Iso from '../hooks/iso'
import Names from '../hooks/names'
import Path from '../hooks/path'
import Pet from '../hooks/pet'
import Pixel, { Palette, SURF_SIDE } from '../hooks/pixel'
import Rng from '../hooks/rng'
import Scene from '../hooks/scene'
import World, { Gen, type World as WorldState } from '../hooks/world'
import Fixtures from './fixtures'

// 높이 level 의 평지 한가운데 얕은 못(바닥 level - 1), 그 안에 깊은 곳(바닥 level - 2). deepAsShallow 면 깊은 곳도 얕은 물로 표시한다(대조용)
function pond(deepAsShallow = false): WorldState {
  const w = 16
  const level = 2
  const height = new Uint8Array(w * w).fill(level)
  const water = new Uint8Array(w * w)
  for (let y = 4; y <= 11; y++) {
    for (let x = 4; x <= 11; x++) {
      const deep = x >= 6 && x <= 9 && y >= 6 && y <= 9
      height[y * w + x] = deep ? level - 2 : level - 1
      water[y * w + x] = deep && !deepAsShallow ? World.WATER_DEEP : World.WATER_SHALLOW
    }
  }
  return World.build({ w, h: w, height, water })
}

// 호수가 있는 세트의 맵 하나(호숫가, 시드 3 은 호수가 크다)
const lakeWorld = (() => {
  let w: WorldState | undefined
  return () => (w ??= World.create(3, Biome.byId('lake').gen, { size: 64, props: true }))
})()

function waterCount(world: WorldState): number {
  let n = 0
  for (let y = 0; y < world.h; y++) for (let x = 0; x < world.w; x++) if (World.isWater(world, x, y)) n++
  return n
}

// 물가 칸 가까이로 강아지를 옮긴다. 카메라도 따라 옮겨 물이 화면에 들어오게 한다
function nearWater(scene: ReturnType<typeof Scene.create>): void {
  const edge = World.waterEdgesWithin(scene.world, scene.world.spawn, 30)[0]!
  const p = scene.pet
  p.x = edge.x
  p.y = edge.y
  p.z = World.standZ(scene.world, edge.x, edge.y)
  p.path = []
  const s = Iso.screenOf(p.x, p.y, p.z)
  scene.cam = Iso.cameraOf(s.sx, s.sy - p.species.sprite.lookUpPx)
  scene.prev = { sx: s.sx, sy: s.sy - p.species.sprite.lookUpPx }
}

function waterPixels(scene: ReturnType<typeof Scene.create>): number {
  let n = 0
  for (const c of scene.buf!.px) if (c === Palette.SHALLOW || c === Palette.DEEP_WATER || c === Palette.FOAM || c === Palette.SHIMMER) n++
  return n
}

describe('water', () => {
  // 4 방향 물가는 수면과 같은 높이이고(얕은 바닥 바로 옆), 대각선으로만 닿은 칸은 한 단 높을 수 있다
  test('lakes never float: no land tile touching a lake, even diagonally, is below its surface, and the tiles beside it are exactly at the surface', async () => {
    let wet = 0
    for (const id of ['meadow', 'forest', 'lake'] as const) {
      const r = Gen.region(7, Biome.byId(id).gen, 0, 0, 64, 64)
      for (let y = 1; y < r.h - 1; y++) {
        for (let x = 1; x < r.w - 1; x++) {
          const i = y * r.w + x
          if (!r.water[i]) continue
          wet++
          const surface = r.height[i]! + r.water[i]!
          for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
              const j = (y + dy) * r.w + x + dx
              if (r.water[j]) continue
              const h = r.height[j]!
              const ok = dx === 0 || dy === 0 ? h === surface : h >= surface
              expect(`${id} ${x + dx},${y + dy} ${h} ${surface} ${ok}`).toBe(`${id} ${x + dx},${y + dy} ${h} ${surface} true`)
            }
          }
        }
      }
    }
    expect(wet > 0).toBe(true)
  })

  // 맵 보기 한 화면(120 × 60 패널에서 약 90 × 90 칸)보다 조금 넓은 창에 큰 호수가 하나는 든다
  test('the lake shore and beach sets put a big lake of at least 250 tiles in every 128 × 128 window around the start', async () => {
    const N = 128
    for (const id of ['lake', 'beach'] as const) {
      for (const seed of [1, 2, 3]) {
        const r = Gen.region(seed, Biome.byId(id).gen, -N / 2, -N / 2, N, N)
        const seen = new Uint8Array(N * N)
        let biggest = 0
        for (let s = 0; s < N * N; s++) {
          if (seen[s] || !r.water[s]) continue
          const q = [s]
          seen[s] = 1
          for (let head = 0; head < q.length; head++) {
            const t = q[head]!
            const x = t % N
            const y = (t - x) / N
            for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
              const nx = x + dx
              const ny = y + dy
              const u = ny * N + nx
              if (nx < 0 || ny < 0 || nx >= N || ny >= N || seen[u] || !r.water[u]) continue
              seen[u] = 1
              q.push(u)
            }
          }
          biggest = Math.max(biggest, q.length)
        }
        expect(`${id} ${seed} ${biggest >= 250}`).toBe(`${id} ${seed} true`)
      }
    }
  })

  test('rivers are shallow water at the lowest step: every river tile is shallow with its surface at the set floor, the land beside it is at that surface too, and beach and desert have none', async () => {
    const N = 192
    for (const b of Biome.BIOMES.filter(x => x.open)) {
      const p = b.gen
      const r = Gen.region(1, p, -N / 2, -N / 2, N, N)
      let river = 0
      for (let y = 1; y < N - 1; y++) {
        for (let x = 1; x < N - 1; x++) {
          const i = y * N + x
          if (!Gen.riverAt(1, p, x - N / 2, y - N / 2)) continue
          river++
          expect(`${b.id} ${x},${y} ${r.water[i]} ${r.height[i]! + r.water[i]!}`).toBe(`${b.id} ${x},${y} ${Gen.WATER_SHALLOW} ${p.hmin}`)
          for (const j of [i - 1, i + 1, i - N, i + N]) {
            if (!r.water[j] && !r.block[j]) expect(`${b.id} beside ${x},${y} ${r.height[j]}`).toBe(`${b.id} beside ${x},${y} ${p.hmin}`)
          }
        }
      }
      expect(`${b.id} ${river > 0}`).toBe(`${b.id} ${p.river !== undefined}`)
    }
  })

  test('the shore is flat: every walkable land tile next to shallow water is at its surface, so the pet wades in without a hop and its feet sink', async () => {
    const world = lakeWorld()
    let pairs = 0
    for (let y = 0; y < world.h; y++) {
      for (let x = 0; x < world.w; x++) {
        if (World.isWater(world, x, y) || !World.isWalkable(world, x, y)) continue
        for (const [dx, dy] of World.NEIGHBORS) {
          if (World.surfaceAt(world, x + dx, y + dy) !== 'shallow') continue
          pairs++
          expect(`${x},${y} ${World.walkHeightAt(world, x + dx, y + dy)} ${World.canStep(world, x, y, x + dx, y + dy)}`).toBe(`${x},${y} ${World.walkHeightAt(world, x, y)} true`)
        }
      }
    }
    expect(pairs > 0).toBe(true)
    // 물가에서 얕은 물로 걸어 들어간다: 뛰지 않고, 물속에서 발은 수면 아래 WADE_PX
    const w = pond()
    const p = Pet.create(w, 1, 0)
    p.x = 1
    p.y = 5
    p.z = World.standZ(w, 1, 5)
    p.path = [{ x: 2, y: 5 }, { x: 3, y: 5 }, { x: 4, y: 5 }, { x: 5, y: 5 }]
    let hops = 0
    for (let t = 0; t < 4000 && p.path.length > 0; t += Names.SIM_STEP_MS) {
      Pet.Motion.step(p, w, Names.SIM_STEP_MS)
      if (p.hop) hops++
    }
    expect(p.path.length).toBe(0)
    expect(hops).toBe(0)
    expect(p.z).toBe(World.walkHeightAt(w, 5, 5) * Names.STEP_PX - World.WADE_PX)
  })

  test('surface queries: shallow water is walked at its surface and costs more, deep water is closed to a pet that cannot swim, and shore tiles face the water', async () => {
    const w = pond()
    expect(World.surfaceAt(w, 2, 2)).toBe('ground')
    expect(World.surfaceAt(w, 4, 4)).toBe('shallow')
    expect(World.surfaceAt(w, 7, 7)).toBe('deep')
    expect(World.walkHeightAt(w, 4, 4)).toBe(2)
    expect(World.walkHeightAt(w, 7, 7)).toBe(2)
    expect(World.standZ(w, 2, 2)).toBe(2 * Names.STEP_PX)
    expect(World.standZ(w, 7, 7)).toBe(2 * Names.STEP_PX - World.SWIM_PX)
    expect(World.isWalkable(w, 4, 4)).toBe(true)
    expect(World.isWalkable(w, 7, 7)).toBe(false)
    expect(World.isWalkable(w, 7, 7, { climb: 1, swim: true })).toBe(true)
    expect(World.stepCost(w, 3, 4, 4, 4)).toBe(1 + World.WADE_COST)
    const edges = World.waterEdgesWithin(w, { x: 8, y: 8 }, 8)
    expect(edges.length).toBe(32)
    for (const e of edges) {
      expect(World.isWater(w, e.x, e.y)).toBe(false)
      expect(World.isWater(w, e.x + e.dx, e.y + e.dy)).toBe(true)
    }
    // 못을 가로지르는 길은 깊은 곳을 돌아간다
    const path = Path.find(w, { x: 2, y: 7 }, { x: 13, y: 7 })!
    expect(path.length > 0).toBe(true)
    for (const t of path) expect(World.isDeep(w, t.x, t.y)).toBe(false)
  })

  test('kicked 1,000 times toward the water, the ball always stops on a walkable tile and never rolls into deep water; with the deep part marked shallow it does stop there', async () => {
    const rng = Rng.create(12)
    const kicks = (world: WorldState, starts: Array<{ x: number; y: number; dx: number; dy: number }>) => {
      let bad = 0
      let wet = 0
      let deep = 0
      let core = 0
      for (let i = 0; i < 1000; i++) {
        const s = starts[i % starts.length]!
        const b = Pet.Ball.create(s.x, s.y, world)
        Pet.Ball.kick(b, s.dx, s.dy, Rng.range(rng, 3.5, 5.5), Rng.range(rng, -0.8, 0.8))
        for (let t = 0; t < 12_000 && Pet.Ball.isRolling(b); t += Names.SIM_STEP_MS) {
          Pet.Ball.step(b, world, Names.SIM_STEP_MS)
          const at = Pet.Ball.tileOf(b)
          if (World.isDeep(world, at.x, at.y)) deep++
        }
        const at = Pet.Ball.tileOf(b)
        if (!World.isWalkable(world, at.x, at.y, { climb: 1, swim: false }) && !World.isWalkable(world, at.x, at.y)) bad++
        if (World.isWater(world, at.x, at.y)) wet++
        if (at.x >= 6 && at.x <= 9 && at.y >= 6 && at.y <= 9) core++
      }
      return { bad, wet, deep, core }
    }
    // 못: 물가 칸에서 물 쪽으로
    const w = pond()
    const shore = World.waterEdgesWithin(w, { x: 8, y: 8 }, 8)
    const r = kicks(w, shore)
    expect(`${r.bad} ${r.deep}`).toBe('0 0')
    expect(r.wet > 0).toBe(true)
    const control = kicks(pond(true), shore)
    expect(control.core > 0).toBe(true)
    // 만든 호수 맵: 물가 칸에서 물 쪽으로
    const lake = lakeWorld()
    const edges = World.waterEdgesWithin(lake, { x: 32, y: 32 }, 32)
    expect(edges.length > 0).toBe(true)
    const g = kicks(lake, edges)
    expect(`${g.bad} ${g.deep}`).toBe('0 0')
    expect(g.wet > 0).toBe(true)
  })

  test('the water surface has no grid lines, foam where it meets land, shimmer only at 1 × and only when a phase is given, and the shore lip above it is 1 pixel', async () => {
    const w = pond()
    for (const proj of [Iso.NEAR, Iso.FAR, Iso.WIDE]) {
      expect(Iso.topZ(w, 3, 7, proj) - Iso.topZ(w, 4, 7, proj)).toBe(1)
      for (const glint of [undefined, 5]) {
        const b = Pixel.bufferOf(240, 120, 1)
        Pixel.clear(b)
        const s = Iso.screenOf(8, 8, 0, proj)
        Iso.drawWorld(b, w, { ox: Math.round(s.sx) - 120, oy: Math.round(s.sy) - 120 }, proj, Biome.themeOf('lake'), glint)
        const seen = new Set<number>()
        for (const c of b.px) seen.add(c)
        expect(seen.has(Palette.SHALLOW) && seen.has(Palette.DEEP_WATER) && seen.has(Palette.FOAM)).toBe(true)
        expect(`${proj === Iso.NEAR ? 'near' : 'far'} ${glint} ${seen.has(Palette.SHIMMER)}`).toBe(`${proj === Iso.NEAR ? 'near' : 'far'} ${glint} ${proj === Iso.NEAR && glint !== undefined}`)
        // 앞 두 이웃도 물인 물 칸의 윗면 픽셀은 모두 물 색이다(모눈선·옆면이 없다)
        const view = { ox: Math.round(s.sx) - 120, oy: Math.round(s.sy) - 120 }
        const WATER_SLOTS = [Palette.SHALLOW, Palette.DEEP_WATER, Palette.SHIMMER, Palette.FOAM]
        for (let y = 4; y <= 10; y++) {
          for (let x = 4; x <= 10; x++) {
            const tx = (x - y) * proj.hw - view.ox
            const ty = (x + y) * proj.hh - Iso.topZ(w, x, y, proj) - view.oy
            for (const q of proj.tops) {
              const i = (ty + q.dy) * b.w + tx + q.dx
              expect(`${x},${y} ${WATER_SLOTS.includes(b.px[i]!)} ${b.surf[i] === SURF_SIDE}`).toBe(`${x},${y} true false`)
            }
          }
        }
      }
    }
  })

  test('every water color a set paints has a darker shadow, and each water set fills its water, shore and splash colors', async () => {
    let sets = 0
    for (const b of Biome.BIOMES) {
      if (!b.gen.lake) continue
      sets++
      const { rgb, shadowOf } = Biome.themeOf(b.id)
      for (const c of [Palette.SHALLOW, Palette.DEEP_WATER, Palette.SHIMMER, Palette.FOAM, Palette.SHALLOW_SH, Palette.DEEP_SH, Palette.WATER_END, Palette.SPLASH]) expect(`${b.id} ${c} ${rgb[c] === Palette.UNSET}`).toBe(`${b.id} ${c} false`)
      for (const c of [Palette.SHALLOW, Palette.DEEP_WATER, Palette.SHIMMER, Palette.FOAM, Palette.SHALLOW_SH, Palette.DEEP_SH]) {
        expect(`${b.id} ${c} ${Palette.lumaOf(rgb[shadowOf[c]!]!) < Palette.lumaOf(rgb[c]!)}`).toBe(`${b.id} ${c} true`)
      }
      expect(`${b.id} shore ${b.colors.kinds.some(k => k.id === b.gen.shore)}`).toBe(`${b.id} shore true`)
    }
    expect(sets).toBe(7)
  })

  // 세트마다 물가 프레임의 쌍이 가장 많이 나온 시드(node 측정: 초원 423, 산악 470, 숲 502, 호숫가 399)
  for (const [id, seed] of [['meadow', 3], ['mountain', 8], ['forest', 7], ['lake', 3]] as const) {
  test(`a ${id} frame with water on screen stays within 512 color pairs at every zoom and panel size`, async () => {
    const scene = Scene.create(seed, 0, id)
    nearWater(scene)
    let now = 0
    let most = 0
    let wet = 0
    for (let i = 1; i <= 90; i++) {
      now += 33
      if (i === 5) Scene.onTurnStart(scene, now)
      if (i === 50) Scene.onTool(scene, now)
      Scene.step(scene, 33, now)
      if (i % 30 !== 0) continue
      for (const zoom of Scene.ZOOMS) {
        for (const [cols, rows] of [[40, 30], [120, 60], [200, 80]] as const) {
          Scene.ensureVisible(scene, cols, rows, zoom)
          const blank = scene.world.chunks?.blank ?? 0
          const words = Fixtures.wordsOf(Scene.compose(scene, cols, rows, zoom))
          expect(`${id} blank ${(scene.world.chunks?.blank ?? 0) - blank}`).toBe(`${id} blank 0`)
          const pairs = new Set<string>()
          for (let j = 0; j + 2 < words.length; j += 3) pairs.add(`${words[j + 1]},${words[j + 2]}`)
          most = Math.max(most, pairs.size)
          wet += waterPixels(scene)
        }
      }
    }
    expect(wet > 0).toBe(true)
    expect(`${id} ${most <= 512}`).toBe(`${id} true`)
  })
  }

  test('asleep by the water the shimmer holds still, so the pane is sent no more often than with the water frozen (limit: one extra frame a second)', async () => {
    const run = (freeze: boolean) => {
      const scene = Scene.create(3, 0, 'lake')
      nearWater(scene)
      scene.pet.lastSignalAt = -Names.SLEEP_AFTER_MS
      let now = 0
      let last = -Infinity
      let cells = ''
      let blits = 0
      let asleepMs = 0
      let wet = 0
      for (let t = 0; t < 70_000 && asleepMs < 12_000; t += 33) {
        now += 33
        Scene.step(scene, 33, now)
        if (freeze) scene.glint.phase = 0
        if (scene.pet.isAsleep) asleepMs += 33
        if (now - last < Scene.renderEveryMs(scene) - 1) continue
        last = now
        Scene.ensureVisible(scene, 60, 30, 1)
        const next = Scene.compose(scene, 60, 30, 1)
        if (!scene.pet.isAsleep) { cells = next; continue }
        wet = Math.max(wet, waterPixels(scene))
        if (next !== cells) blits++
        cells = next
      }
      return { blits, asleepMs, wet }
    }
    const moving = run(false)
    const frozen = run(true)
    expect(moving.wet > 0).toBe(true)
    expect(moving.asleepMs > 0).toBe(true)
    expect(moving.blits <= frozen.blits + Math.ceil(moving.asleepMs / 1000)).toBe(true)
  })
})
