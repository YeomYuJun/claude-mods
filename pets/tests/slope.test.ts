import { describe, expect, test } from 'claude-code/testing'

import Biome from '../hooks/biome'
import Iso, { type Proj } from '../hooks/iso'
import Names from '../hooks/names'
import Pet from '../hooks/pet'
import Pixel, { Palette } from '../hooks/pixel'
import World from '../hooks/world'

const C = World.Chunks
const G = World.Gen
const OPEN = Biome.BIOMES.filter(b => b.open === true)

// 칸 플래그 비트 5~7 의 경사 방향(0 평지, 1 +x, 2 +y, 3 −x, 4 −y). 질의 함수 대신 비트를 직접 읽어, 경사가 없는 코드에서도 단언으로 실패한다
function formOf(flags: number): number {
  return (flags >> 5) & 7
}

type Cell = readonly [number, number]
type Extra = { block?: Cell[]; obstacle?: Cell[]; water?: Cell[]; slopes?: boolean; kind?: number }

// 높이 함수로 w × h 합성 맵. water 칸은 높이를 바닥(걷는 높이 − 1)으로 낮춘 얕은 물
function mapOf(w: number, h: number, heightOf: (x: number, y: number) => number, extra: Extra = {}): World.World {
  const height = new Uint8Array(w * h)
  const block = new Uint8Array(w * h)
  const obstacle = new Uint8Array(w * h)
  const water = new Uint8Array(w * h)
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) height[y * w + x] = heightOf(x, y)
  for (const [x, y] of extra.block ?? []) block[y * w + x] = 1
  for (const [x, y] of extra.obstacle ?? []) obstacle[y * w + x] = 1
  for (const [x, y] of extra.water ?? []) { water[y * w + x] = G.WATER_SHALLOW; height[y * w + x]!-- }
  return World.build({ w, h, height, block, obstacle, water, slopes: extra.slopes ?? true, kind: new Uint8Array(w * h).fill(extra.kind ?? 0) })
}

function formsOf(world: World.World, x0: number, y0: number, x1: number, y1: number): number[] {
  const out: number[] = []
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) out.push(formOf(World.flagsAt(world, x, y)))
  return out
}

describe('slope', () => {
  test('a straight rise makes every tile below the top a slope toward the higher neighbor, in all four directions; map-edge tiles stay flat', async () => {
    const run = [1, 1, 2, 3, 3, 3, 3]
    const px = mapOf(7, 7, x => run[x]!)
    expect(formsOf(px, 0, 3, 6, 3)).toEqual([0, 1, 1, 0, 0, 0, 0])
    const nx = mapOf(7, 7, x => run[6 - x]!)
    expect(formsOf(nx, 0, 3, 6, 3)).toEqual([0, 0, 0, 0, 3, 3, 0])
    const py = mapOf(7, 7, (_x, y) => run[y]!)
    expect(formsOf(py, 3, 0, 3, 6)).toEqual([0, 2, 2, 0, 0, 0, 0])
    const ny = mapOf(7, 7, (_x, y) => run[6 - y]!)
    expect(formsOf(ny, 3, 0, 3, 6)).toEqual([0, 0, 0, 0, 4, 4, 0])
  })

  test('a corner tile with two higher neighbors stays a step; a tile with one higher neighbor next to it is a slope', async () => {
    const w = mapOf(7, 7, (x, y) => (x >= 4 || y >= 4 ? 2 : 1))
    expect(formOf(World.flagsAt(w, 3, 3))).toBe(0)
    expect(formOf(World.flagsAt(w, 3, 2))).toBe(1)
    expect(formOf(World.flagsAt(w, 2, 3))).toBe(2)
  })

  test('a slope needs a slope of the same direction beside it: a lone rise stays a step, a rise two tiles wide gets two slopes', async () => {
    const lone = mapOf(9, 9, (x, y) => (x === 4 && y === 4 ? 2 : 1))
    expect(formsOf(lone, 0, 0, 8, 8).every(f => f === 0)).toBe(true)
    const pair = mapOf(9, 9, (x, y) => (x === 4 && (y === 4 || y === 5) ? 2 : 1))
    expect([formOf(World.flagsAt(pair, 3, 4)), formOf(World.flagsAt(pair, 3, 5)), formOf(World.flagsAt(pair, 5, 4)), formOf(World.flagsAt(pair, 4, 3))]).toEqual([1, 1, 3, 0])
  })

  test('no slope on water, blocks or trees, none rising into a block, and none whose low end is a block or a tree', async () => {
    const run = [1, 1, 2, 3, 3, 3, 3]
    const w = mapOf(7, 7, x => run[x]!, { block: [[3, 1]], obstacle: [[2, 2], [1, 3]], water: [[1, 5]] })
    // (2, 1): 높은 이웃이 블록. (2, 2): 나무 칸. (2, 3): 아래 끝(1, 3)이 나무. (1, 3): 나무 칸. (1, 5): 물 칸
    expect([1, 2, 3].map(y => formOf(World.flagsAt(w, 2, y)))).toEqual([0, 0, 0])
    expect(formOf(World.flagsAt(w, 1, 3))).toBe(0)
    expect(formOf(World.flagsAt(w, 1, 5))).toBe(0)
    // 물가(2, 5)는 경사일 수 있다: 아래 끝이 물(걷는 높이 1)
    expect(formOf(World.flagsAt(w, 2, 5))).toBe(1)
    expect(formOf(World.flagsAt(w, 2, 4))).toBe(1)
  })

  test('a built map without the slopes option has no slopes', async () => {
    const run = [1, 1, 2, 3, 3, 3, 3]
    const w = mapOf(7, 7, x => run[x]!, { slopes: false })
    expect(formsOf(w, 0, 0, 6, 6).every(f => f === 0)).toBe(true)
  })

  for (const b of OPEN) {
    test(`${b.id}: slope bits are the same whichever order chunks are made in, and every slope rises one level into its higher neighbor, also next to chunk seams`, async () => {
      const cells = [[0, 0], [-2, -1], [-1, -2], [-2, -2], [0, -2], [-1, 0], [-1, -1], [0, -1], [-2, 0]] as const
      const a = C.create(7, b.gen, true)
      for (const [cx, cy] of cells) C.make(a, cx, cy)
      const z = C.create(7, b.gen, true)
      for (const [cx, cy] of [...cells].reverse()) C.make(z, cx, cy)
      let slopes = 0
      let differ = 0
      for (const [cx, cy] of cells) {
        const fa = a.chunks.get(C.keyOf(cx, cy))!.flags
        const fz = z.chunks.get(C.keyOf(cx, cy))!.flags
        for (let i = 0; i < fa.length; i++) {
          if (formOf(fa[i]!) !== formOf(fz[i]!)) differ++
          if (formOf(fa[i]!)) slopes++
        }
      }
      expect(`${b.id} differ ${differ} slopes ${slopes > 0}`).toBe(`${b.id} differ 0 slopes true`)
      const w = World.create(7, b.gen, { open: true, props: true })
      w.chunks!.cap = 100
      let bad = 0
      let seam = 0
      for (let y = -64; y < 32; y++) {
        for (let x = -64; x < 32; x++) {
          const d = formOf(World.flagsAt(w, x, y))
          if (!d) continue
          const [dx, dy] = World.NEIGHBORS[d - 1]!
          const h = World.heightAt(w, x, y)
          if (World.walkHeightAt(w, x + dx, y + dy) !== h + 1 || World.walkHeightAt(w, x - dx, y - dy) > h) bad++
          // 규칙이 읽는 네 이웃(높은 쪽, 낮은 쪽, 양옆) 중 하나라도 다른 청크에 있으면 이음매 위의 경사
          if (C.chunkOf(x - 1) !== C.chunkOf(x + 1) || C.chunkOf(y - 1) !== C.chunkOf(y + 1)) seam++
        }
      }
      expect(`${b.id} bad ${bad} seam slopes ${seam > 0}`).toBe(`${b.id} bad 0 seam slopes true`)
    })

    test(`${b.id}: slopes do not depend on whether trees are drawn, and equal those of a map built at once from the same region`, async () => {
      const on = World.create(5, b.gen, { open: true, props: true })
      const off = World.create(5, b.gen, { open: true, props: false })
      on.chunks!.cap = 100
      off.chunks!.cap = 100
      const r = G.region(5, b.gen, -48, -48, 96, 96)
      const obstacle = new Uint8Array(96 * 96)
      for (let i = 0; i < obstacle.length; i++) obstacle[i] = r.prop[i] ? 1 : 0
      const built = World.build({ w: 96, h: 96, height: r.height, block: r.block, obstacle, prop: r.prop, kind: r.kind, deco: r.deco, water: r.water, slopes: true })
      let slopes = 0
      let byProps = 0
      let byBuild = 0
      for (let y = -40; y < 40; y++) {
        for (let x = -40; x < 40; x++) {
          const f = formOf(World.flagsAt(on, x, y))
          if (f) slopes++
          if (f !== formOf(World.flagsAt(off, x, y))) byProps++
          if (f !== formOf(World.flagsAt(built, x + 48, y + 48))) byBuild++
        }
      }
      expect(`${b.id} slopes ${slopes > 0} byProps ${byProps} byBuild ${byBuild}`).toBe(`${b.id} slopes true byProps 0 byBuild 0`)
    })

    test(`${b.id}: slopes change neither walkable tiles nor which steps any mover can take`, async () => {
      const r = G.region(9, b.gen, -32, -32, 64, 64)
      const obstacle = new Uint8Array(64 * 64)
      for (let i = 0; i < obstacle.length; i++) obstacle[i] = r.prop[i] ? 1 : 0
      const spec = { w: 64, h: 64, height: r.height, block: r.block, obstacle, prop: r.prop, kind: r.kind, deco: r.deco, water: r.water }
      const sl = World.build({ ...spec, slopes: true })
      const flat = World.build(spec)
      let slopes = 0
      let diff = 0
      for (let y = 1; y < 63; y++) {
        for (let x = 1; x < 63; x++) {
          if (formOf(World.flagsAt(sl, x, y))) slopes++
          if ((World.flagsAt(sl, x, y) & World.WALK) !== (World.flagsAt(flat, x, y) & World.WALK)) diff++
          for (const rules of [{ climb: 1, swim: false }, { climb: 2, swim: false }, { climb: 1, swim: true }]) {
            for (const [dx, dy] of World.NEIGHBORS) if (World.canStep(sl, x, y, x + dx, y + dy, rules) !== World.canStep(flat, x, y, x + dx, y + dy, rules)) diff++
          }
        }
      }
      expect(`${b.id} slopes ${slopes > 0} diff ${diff}`).toBe(`${b.id} slopes true diff 0`)
    })
  }

  test('slope top templates cover the parallelogram area: 1 × 12/12/60/60, far 4/4/28/28, map view 0/0/8/8 pixels (+x, +y, −x, −y)', async () => {
    expect([Iso.NEAR, Iso.FAR, Iso.WIDE].map(p => [p.tops.length, ...p.slopes.map(t => t.length)])).toEqual([[36, 12, 12, 60, 60], [16, 4, 4, 28, 28], [4, 0, 0, 8, 8]])
  })

  // 피라미드(체비셰프 거리): 네 옆구리가 네 방향 경사, 모서리는 단. 물 한 칸
  function hillMap(): World.World {
    return mapOf(18, 18, (x, y) => Math.max(1, 5 - Math.max(Math.abs(x - 8), Math.abs(y - 8))), { water: [[15, 3]] })
  }

  test('a hill with slopes in all four directions draws with no unpainted pixel inside the map, in 1 ×, far and map view', async () => {
    const w = hillMap()
    const dirs = [0, 0, 0, 0, 0]
    for (let y = 0; y < 18; y++) for (let x = 0; x < 18; x++) dirs[formOf(World.flagsAt(w, x, y))]!++
    expect(dirs.slice(1).every(n => n > 0)).toBe(true)
    for (const proj of [Iso.NEAR, Iso.FAR, Iso.WIDE]) {
      const b = Pixel.bufferOf(240, 90, 1)
      Pixel.clear(b)
      Iso.drawWorld(b, w, { ox: -120, oy: -30 }, proj)
      // 열마다 칠한 첫 픽셀과 마지막 픽셀 사이에 빈 픽셀이 없다(섬 전체가 화면 안이라 열마다 칠한 곳이 한 덩어리)
      let holes = 0
      let painted = 0
      for (let X = 0; X < b.w; X++) {
        let lo = -1
        let hi = -1
        for (let Y = 0; Y < b.h; Y++) if (b.px[Y * b.w + X] !== Palette.VOID) { if (lo < 0) lo = Y; hi = Y }
        if (lo < 0) continue
        painted++
        for (let Y = lo; Y <= hi; Y++) if (b.px[Y * b.w + X] === Palette.VOID) holes++
      }
      expect(`${proj.hw} painted ${painted > 0} holes ${holes}`).toBe(`${proj.hw} painted true holes 0`)
    }
  })

  test('a ramp rising away from the viewer replaces the step faces of the plain map with its top, in 1 × and far', async () => {
    const run = [3, 3, 3, 2, 1, 1, 1]
    const sides = (slopes: boolean, proj: Proj) => {
      const w = mapOf(7, 7, x => run[x]!, { slopes })
      const b = Pixel.bufferOf(120, 40, 1)
      Pixel.clear(b)
      Iso.drawWorld(b, w, { ox: -60, oy: -20 }, proj)
      let n = 0
      for (let i = 0; i < b.surf.length; i++) if (b.surf[i] === Pixel.SURF_SIDE) n++
      return n
    }
    for (const proj of [Iso.NEAR, Iso.FAR]) expect(`${proj.hw} ${sides(true, proj) < sides(false, proj)}`).toBe(`${proj.hw} true`)
  })

  // 비탈 맵: 2~6 행은 x 를 따라 1, 1, 2, 3, 3, 3, 3 으로 올라 (1, y)·(2, y) 가 +x 경사, 0·1 행은 평지 1
  function rampMap(): World.World {
    const run = [1, 1, 2, 3, 3, 3, 3]
    return mapOf(7, 8, (x, y) => (y >= 2 ? run[x]! : 1))
  }

  // 길을 따라 걸린다. 스텝마다 발 높이 변화의 최댓값과 뛴 스텝 수
  function walk(w: World.World, from: { x: number; y: number }, path: Array<{ x: number; y: number }>, gait: 'walk' | 'run') {
    const p = Pet.create(w, 1, 0)
    p.x = from.x
    p.y = from.y
    p.z = World.surfaceZ(w, from.x, from.y)
    p.gait = gait
    p.path = path.map(t => ({ ...t }))
    let hops = 0
    let most = 0
    for (let t = 0; t < 6000 && (p.path.length > 0 || p.hop); t += Names.SIM_STEP_MS) {
      const z = p.z
      Pet.Motion.step(p, w, Names.SIM_STEP_MS)
      if (p.hop) hops++
      else most = Math.max(most, Math.abs(p.z - z))
    }
    return { p, hops, most }
  }

  test('a pet walks and runs up and down a ramp without hopping, its feet rising with the surface by at most half a pixel a step', async () => {
    const w = rampMap()
    for (const gait of ['walk', 'run'] as const) {
      const up = walk(w, { x: 0, y: 4 }, [{ x: 1, y: 4 }, { x: 2, y: 4 }, { x: 3, y: 4 }, { x: 4, y: 4 }], gait)
      expect(`${gait} up hops ${up.hops} small ${up.most <= 0.5} z ${up.p.z}`).toBe(`${gait} up hops 0 small true z ${3 * Names.STEP_PX}`)
      const down = walk(w, { x: 4, y: 4 }, [{ x: 3, y: 4 }, { x: 2, y: 4 }, { x: 1, y: 4 }, { x: 0, y: 4 }], gait)
      expect(`${gait} down hops ${down.hops} small ${down.most <= 0.5} z ${down.p.z}`).toBe(`${gait} down hops 0 small true z ${Names.STEP_PX}`)
    }
  })

  test('stepping off the side of a ramp onto a tile of its height walks down half a level; onto a tile one lower it hops', async () => {
    const w = rampMap()
    // (1, 2): h 1 경사, 옆 변 가운데 1.5 단. (1, 1) 평지 1 → 반 단
    const side = walk(w, { x: 1, y: 2 }, [{ x: 1, y: 1 }], 'walk')
    expect(`hops ${side.hops} step ${side.most <= Names.STEP_PX / 2 + 0.01} z ${side.p.z}`).toBe(`hops 0 step true z ${Names.STEP_PX}`)
    // (2, 2): h 2 경사, 옆 변 2.5 단. (2, 1) 평지 1 → 한 단 반
    const drop = walk(w, { x: 2, y: 2 }, [{ x: 2, y: 1 }], 'walk')
    expect(`hops ${drop.hops > 0} z ${drop.p.z}`).toBe(`hops true z ${Names.STEP_PX}`)
  })

  // 공을 굴린다. 멈추면(settled) 그 스텝까지
  function roll(w: World.World, b: ReturnType<typeof Pet.Ball.create>, ms: number): number {
    let t = 0
    for (; t < ms; t += Names.SIM_STEP_MS) {
      Pet.Ball.step(b, w, Names.SIM_STEP_MS)
      if (b.settled) break
    }
    return t
  }

  test('a ball left on a ramp rolls down and stops on the flat tile below; a ball kicked up the ramp comes back down', async () => {
    const w = rampMap()
    const b = Pet.Ball.create(2, 4, w)
    const t = roll(w, b, 8000)
    expect(`settled ${b.settled === true} low ${b.x < 0.5} z ${b.z}`).toBe(`settled true low true z ${Names.STEP_PX}`)
    expect(t < 8000).toBe(true)
    const k = Pet.Ball.create(0, 5, w)
    Pet.Ball.kick(k, 1, 0, 3, 0)
    let top = 0
    for (let i = 0; i < 480 && !k.settled; i++) { Pet.Ball.step(k, w, Names.SIM_STEP_MS); top = Math.max(top, k.x) }
    expect(`went up ${top > 1} back ${k.x < 0.5} settled ${k.settled === true}`).toBe('went up true back true settled true')
  })

  for (const b of OPEN) {
    test(`${b.id}: balls kicked in eight directions from the start settle within 15 seconds`, async () => {
      for (const seed of [1, 2, 3]) {
        const w = World.create(seed, b.gen, { open: true, props: true })
        let late = 0
        for (let d = 0; d < 8; d++) {
          const a = (d * Math.PI) / 4
          const ball = Pet.Ball.create(w.spawn.x, w.spawn.y, w)
          Pet.Ball.kick(ball, Math.cos(a), Math.sin(a), 5.5, 0.5)
          if (roll(w, ball, 15_000) >= 15_000) late++
        }
        expect(`${b.id} ${seed} late ${late}`).toBe(`${b.id} ${seed} late 0`)
      }
    })
  }

  test('walking along a ramp costs one per step with no climbing cost; a step that hops still costs 1.4', async () => {
    const w = rampMap()
    expect([World.stepCost(w, 0, 4, 1, 4), World.stepCost(w, 1, 4, 2, 4), World.stepCost(w, 2, 4, 3, 4), World.stepCost(w, 3, 4, 2, 4)]).toEqual([1, 1, 1, 1])
    expect(World.stepCost(w, 2, 2, 2, 1)).toBe(1 + World.CLIMB_COST)
    expect(World.stepCost(w, 1, 2, 1, 1)).toBe(1)
  })

  test('naps, digging and the first spot of the ball never pick a ramp tile', async () => {
    // x 8~12 가 +x 경사인 오르막(높이 1 → 6), 나머지는 평지
    const w = mapOf(24, 24, x => 1 + Math.max(0, Math.min(5, x - 8)))
    let ramps = 0
    let picked = 0
    for (let seed = 1; seed <= 30; seed++) {
      const p = Pet.create(w, seed, 0)
      if (World.slopeDirAt(w, Math.round(p.ball.x), Math.round(p.ball.y))) picked++
      p.energy = 0.2
      for (const name of ['nap', 'digSpot'] as const) {
        const step = Pet.build(name, p, w).steps[0]
        if (step?.k !== 'go') continue
        if (step.to && World.slopeDirAt(w, step.to.x, step.to.y)) picked++
      }
    }
    for (let y = 0; y < 24; y++) for (let x = 0; x < 24; x++) if (World.slopeDirAt(w, x, y)) ramps++
    expect(`ramps ${ramps > 0} picked ${picked}`).toBe('ramps true picked 0')
  })

  test('stone ramps are drawn as stairs: nosing lines in the stone grid-line color at 1 × and far, none in map view; other ramps have none', async () => {
    const theme = Biome.themeOf('mountain')
    const lines = (kind: number, proj: Proj) => {
      const w = mapOf(9, 9, (_x, y) => [1, 1, 2, 3, 4, 4, 4, 4, 4][y]!, { kind })
      const b = Pixel.bufferOf(120, 40, 1)
      Pixel.clear(b)
      Iso.drawWorld(b, w, { ox: -60, oy: -20 }, proj, theme)
      const line = Palette.kind(theme.kindSlot[kind]!) + Palette.Top.LINE
      let n = 0
      for (let i = 0; i < b.px.length; i++) if (b.px[i] === line) n++
      return n
    }
    const G_ = World.Gen
    const near = [lines(G_.KIND_STONE, Iso.NEAR), lines(G_.KIND_GRASS, Iso.NEAR)]
    const far = [lines(G_.KIND_STONE, Iso.FAR), lines(G_.KIND_GRASS, Iso.FAR)]
    const wide = [lines(G_.KIND_STONE, Iso.WIDE), lines(G_.KIND_GRASS, Iso.WIDE)]
    expect(`near ${near[0]! > near[1]!} far ${far[0]! > far[1]!} wide ${wide[0] === wide[1]}`).toBe('near true far true wide true')
  })

  test('surface height rises across a slope from its low edge to its high edge, and edge heights meet the neighbors', async () => {
    const run = [1, 1, 2, 3, 3, 3, 3]
    const w = mapOf(7, 7, x => run[x]!)
    // (2, 3): h 2, +x 로 오름
    expect(World.slopeDirAt(w, 2, 3)).toBe(1)
    expect(World.surfaceZ(w, 1.5, 3)).toBe(2 * 4)
    expect(World.surfaceZ(w, 2, 3)).toBe(2.5 * 4)
    expect(Math.abs(World.surfaceZ(w, 2.49, 3.3) - 2.99 * 4) < 1e-9).toBe(true)
    expect(World.edgeHeightAt(w, 2, 3, 1, 0)).toBe(3)
    expect(World.edgeHeightAt(w, 2, 3, -1, 0)).toBe(2)
    expect(World.edgeHeightAt(w, 2, 3, 0, 1)).toBe(2.5)
    expect(World.edgeHeightAt(w, 3, 3, -1, 0)).toBe(3)
    expect(World.edgeHeightAt(w, 4, 3, -1, 0)).toBe(3)
  })
})
