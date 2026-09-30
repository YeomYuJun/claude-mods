import { describe, expect, test } from 'claude-code/testing'

import Biome from '../hooks/biome'
import World, { Gen } from '../hooks/world'

const C = Gen.CHUNK

function same(a: Gen.Region, b: Gen.Region): boolean {
  for (const k of ['height', 'prop', 'block', 'kind', 'deco', 'water'] as const) {
    const x = a[k]
    const y = b[k]
    if (x.length !== y.length) return false
    for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return false
  }
  return true
}

// 2 × 2 청크를 따로 만들어 붙인 것
function stitched(seed: number, p: Gen.GenParams, x0: number, y0: number): Gen.Region {
  const w = 2 * C
  const out: Gen.Region = { x0, y0, w, h: w, height: new Uint8Array(w * w), prop: new Uint8Array(w * w), block: new Uint8Array(w * w), kind: new Uint8Array(w * w), deco: new Uint8Array(w * w), water: new Uint8Array(w * w) }
  for (let cy = 0; cy < 2; cy++) {
    for (let cx = 0; cx < 2; cx++) {
      const r = Gen.region(seed, p, x0 + cx * C, y0 + cy * C, C, C)
      for (let j = 0; j < C; j++) {
        for (let i = 0; i < C; i++) {
          const o = (cy * C + j) * w + cx * C + i
          out.height[o] = r.height[j * C + i]!
          out.prop[o] = r.prop[j * C + i]!
          out.block[o] = r.block[j * C + i]!
          out.kind[o] = r.kind[j * C + i]!
          out.deco[o] = r.deco[j * C + i]!
          out.water[o] = r.water[j * C + i]!
        }
      }
    }
  }
  return out
}

// 기본 이동 규칙(오르기 1, 헤엄 못 함)으로, 소품 장애물과 깊은 물을 뺀 칸을 걷는 높이(물이면 수면)로 4 방향으로 묶었을 때
// 가장 큰 덩어리 밖에 남는 지형 칸(블록·깊은 물 아님) 수. 가장자리에서 잘려 생긴 조각을 세지 않도록 안쪽(둘레 inset 칸 제외)만 센다
function stranded(r: Gen.Region, inset: number): number {
  const obstacle = new Uint8Array(r.w * r.h)
  const walk = new Uint8Array(r.w * r.h)
  for (let i = 0; i < obstacle.length; i++) {
    if (r.prop[i] || r.water[i] === Gen.WATER_DEEP) obstacle[i] = 1
    walk[i] = r.height[i]! + r.water[i]!
  }
  const [label, sizes] = World.componentsOf(walk, r.w, r.h, obstacle)
  let best = 0
  for (let i = 1; i < sizes.length; i++) if (sizes[i]! > sizes[best]!) best = i
  let n = 0
  for (let y = inset; y < r.h - inset; y++) {
    for (let x = inset; x < r.w - inset; x++) {
      const i = y * r.w + x
      if (!r.block[i] && !r.prop[i] && r.water[i] !== Gen.WATER_DEEP && label[i] !== best) n++
    }
  }
  return n
}

describe('generator', () => {
  for (const b of Biome.BIOMES) {
    test(`${b.id}: four chunks made one by one match the same area made at once, byte for byte, also at negative coordinates`, async () => {
      for (const [seed, x0, y0] of [[7, 0, 0], [99, -40, 17]] as const) {
        expect(same(stitched(seed, b.gen, x0, y0), Gen.region(seed, b.gen, x0, y0, 2 * C, 2 * C))).toBe(true)
      }
    })
  }

  test('the height envelope needs exactly its reach: a low tile that far away still lowers the edge, and one tile less of margin misses it', async () => {
    for (const b of Biome.BIOMES) {
      const p = b.gen
      const r = Gen.reachOf(p)
      if (r === 0) continue
      // 가장 높은 땅 한가운데 가장 낮을 수 있는 칸(호수가 있는 세트는 깊은 물 바닥) 하나를, 영역 왼쪽 끝에서 r 칸 밖에 둔다
      const raw = (x: number, y: number) => (x === -r && y === 5 ? Gen.floorOf(p) : p.hmax)
      const wide = Gen.envelope(1, p, 0, 0, 12, 12, { raw }, r + 6)
      const exact = Gen.envelope(1, p, 0, 0, 12, 12, { raw }, r)
      const short = Gen.envelope(1, p, 0, 0, 12, 12, { raw }, r - 1)
      expect(`${b.id} ${exact.join(',') === wide.join(',')}`).toBe(`${b.id} true`)
      expect(`${b.id} ${wide[5 * 12]}`).toBe(`${b.id} ${p.hmax - 1}`)
      expect(`${b.id} ${short.join(',') === wide.join(',')}`).toBe(`${b.id} false`)
    }
  })

  test('terrain stays within each set\'s range (a lake\'s surface too, its floor down to the set floor), neighbours that are not blocks differ by at most one step, and nothing is above 8', async () => {
    let wet = 0
    for (const b of Biome.BIOMES) {
      const r = Gen.region(3, b.gen, -20, -20, 96, 96)
      for (let y = 0; y < r.h; y++) {
        for (let x = 0; x < r.w; x++) {
          const i = y * r.w + x
          const h = r.height[i]!
          if (h > Gen.MAX_HEIGHT) expect(`${b.id} too high ${h}`).toBe('')
          const top = h + r.water[i]!
          if (r.water[i]) { wet++; if (h < Gen.floorOf(b.gen)) expect(`${b.id} lake floor ${h}`).toBe('') }
          if (!r.block[i] && (top < b.gen.hmin || top > b.gen.hmax)) expect(`${b.id} terrain ${h} water ${r.water[i]}`).toBe('')
          if (r.block[i] && h > b.gen.hmax + 2) expect(`${b.id} block ${h}`).toBe('')
          for (const j of [x + 1 < r.w ? i + 1 : -1, y + 1 < r.h ? i + r.w : -1]) {
            if (j < 0 || r.block[i] || r.block[j]) continue
            if (Math.abs(h - r.height[j]!) > 1) expect(`${b.id} slope at ${x},${y}`).toBe('')
          }
        }
      }
    }
    expect(wet > 0).toBe(true)
  })

  for (const b of Biome.BIOMES) {
    test(`${b.id}: with trees and rocks in place every terrain tile stays reachable`, async () => {
      for (const seed of [1, 2, 3]) {
        const r = Gen.region(seed, b.gen, 0, 0, 96, 96)
        expect(`${b.id} ${seed} ${stranded(r, 16)}`).toBe(`${b.id} ${seed} 0`)
      }
    })
  }

  // 셀이 2 칸 이상이면 한 칸의 네 이웃 중 둘 이상이 그 칸의 셀 안이라(셀마다 후보 하나) 1 × 1 장애물로는 칸을 가두지 못한다.
  // 그래서 대조는 후보가 칸마다 있을 수 있는 1 칸 격자에서 한다
  test('the control: on a one-tile candidate grid, letting obstacles touch diagonally strands tiles, and the rule keeps every tile reachable', async () => {
    let off = 0
    let on = 0
    for (const id of ['meadow', 'forest'] as const) {
      const p = { ...Biome.byId(id).gen, obsP: 0.15 }
      for (const seed of [1, 2]) {
        off += stranded(Gen.region(seed, p, 0, 0, 64, 64, { cell: 1, ring: false }), 8)
        on += stranded(Gen.region(seed, p, 0, 0, 64, 64, { cell: 1 }), 8)
      }
    }
    expect(off > 0).toBe(true)
    expect(on).toBe(0)
  })

  test('the generator uses no trigonometric, exponential or power functions', async () => {
    for (const fn of [Gen.hash, Gen.unit, Gen.smooth, Gen.vnoise, Gen.landformAt, Gen.ridgeAt, Gen.crestAt, Gen.landAt, Gen.basinAt, Gen.lakeCenterOf, Gen.riverAt, Gen.rawHeight, Gen.floorOf, Gen.reachOf, Gen.envelope, Gen.candidateOf, Gen.lakeOf, Gen.lakeShapeOf, Gen.lakeFinish, Gen.lakesIn, Gen.lakeCellAt, Gen.kindOf, Gen.decoOf, Gen.waterDecoOf, Gen.region, Gen.regionStart, Gen.regionRows, World.create, World.createOpen, World.Chunks.nextUnit, World.Chunks.rawAt]) {
      const src = String(fn)
      expect(src.length > 20).toBe(true)
      expect(/Math\.(sin|cos|tan|asin|acos|atan|atan2|hypot|exp|expm1|pow|log|log2|log10|cbrt)\b|\*\*/.test(src)).toBe(false)
    }
  })

  test('the graph-paper island is 20 to 32 tiles, terrain 0 to 2 with blocks up to 4, and hiding trees leaves the blocks where they were', async () => {
    let trees = 0
    for (let seed = 1; seed <= 12; seed++) {
      const off = World.create(seed)
      const on = World.create(seed, World.PAPER_GEN, { props: true })
      expect(off.w >= 20 && off.w <= 32 && off.h >= 20 && off.h <= 32).toBe(true)
      for (let i = 0; i < off.w * off.h; i++) {
        const block = (off.flags[i]! & World.BLOCK) !== 0
        expect(off.height[i]! <= (block ? 4 : 2)).toBe(true)
        expect(off.prop[i]).toBe(0)
        expect(on.height[i]).toBe(off.height[i])
        expect(on.flags[i]! & World.BLOCK).toBe(off.flags[i]! & World.BLOCK)
        if (on.prop[i]) { trees++; expect(World.isObstacle(on, i % on.w, Math.floor(i / on.w))).toBe(true) }
      }
      expect(World.isWalkable(on, on.spawn.x, on.spawn.y)).toBe(true)
    }
    expect(trees > 0).toBe(true)
  })

  test('surface kinds follow the rules: lake tiles are water, the ring around a lake is the shore kind, blocks are the block kind, the rest ground or patch, other snow only at 5 steps or more and other stone from the rock line; decorations only on open ground of the right kind, reeds and lilies only on shallow water', async () => {
    for (const b of Biome.BIOMES) {
      const p = b.gen
      const r = Gen.region(3, p, -20, -20, 96, 96)
      const seen = new Set<number>()
      for (let i = 0; i < r.w * r.h; i++) {
        const k = r.kind[i]!
        const h = r.height[i]!
        seen.add(k)
        const at = `${b.id} ${i}`
        const x = i % r.w
        const y = (i - x) / r.w
        // 테는 발자국과 8 방향 거리 shoreWidth 안. 영역 끝 shoreWidth 칸은 밖의 호수를 볼 수 없어 테 판정에서 뺀다
        const sw = p.shoreWidth ?? 1
        const isEdge = x < sw || y < sw || x >= r.w - sw || y >= r.h - sw
        let isShore = false
        for (let dy = -sw; dy <= sw; dy++) for (let dx = -sw; dx <= sw; dx++) if (!isEdge && r.water[(y + dy) * r.w + x + dx]) isShore = true
        const d = r.deco[i]!
        if (r.water[i]) {
          seen.add(k)
          expect(`${at} ${k}`).toBe(`${at} ${Gen.KIND_WATER}`)
          if (d !== Gen.DECO_NONE) expect(`${at} ${(d === Gen.DECO_REED || d === Gen.DECO_LILY) && r.water[i] === Gen.WATER_SHALLOW}`).toBe(`${at} true`)
          continue
        }
        if (isShore) { expect(`${at} shore ${k}`).toBe(`${at} shore ${p.shore}`); continue }
        if (isEdge && k === p.shore) continue
        if (r.block[i]) expect(`${at} ${k}`).toBe(`${at} ${p.blockKind ?? p.ground ?? Gen.KIND_PAPER}`)
        else if (k === (p.ground ?? Gen.KIND_PAPER) || k === p.patch?.kind) { /* 바탕·얼룩 */ }
        else if (k === Gen.KIND_SNOW) expect(`${at} snow ${p.snow !== undefined && h >= p.snow.min}`).toBe(`${at} snow true`)
        else if (k === Gen.KIND_STONE) expect(`${at} stone ${p.rockLine !== undefined && h >= p.rockLine}`).toBe(`${at} stone true`)
        else expect(`${at} kind ${k}`).toBe(`${at} kind ground`)
        if (d === Gen.DECO_NONE) continue
        expect(`${at} deco on open ground ${!r.block[i] && !r.prop[i]}`).toBe(`${at} deco on open ground true`)
        if (d === Gen.DECO_MUSHROOM) expect(`${at} ${k === Gen.KIND_GRASS || k === Gen.KIND_LITTER}`).toBe(`${at} true`)
        else if (d === Gen.DECO_BRANCH) expect(`${at} ${k === Gen.KIND_GRASS || k === Gen.KIND_LITTER || k === p.ground}`).toBe(`${at} true`)
        else if (d === Gen.DECO_SHELL) expect(`${at} ${k === Gen.KIND_SAND || k === Gen.KIND_WET_SAND}`).toBe(`${at} true`)
        else if (d === Gen.DECO_DRY_BUSH) expect(`${at} ${k}`).toBe(`${at} ${Gen.KIND_SAND}`)
        else expect(`${at} ${k}`).toBe(`${at} ${Gen.KIND_GRASS}`)
      }
      // 모눈종이는 종이 하나, 다른 세트는 바탕과 (블록이 있는 세트는) 블록 종류가 적어도 나온다
      if (b.id === Biome.DEFAULT) expect([...seen]).toEqual([Gen.KIND_PAPER])
      else expect(`${b.id} ${seen.has(p.ground!) && (p.blockW === 0 || seen.has(p.blockKind!))}`).toBe(`${b.id} true`)
    }
  })

  test('beach, snow and desert lay their own ground, second surface kind, tree and decoration', async () => {
    const want = [
      ['beach', Gen.KIND_SAND, Gen.KIND_WET_SAND, Gen.PROP_PALM, Gen.DECO_SHELL],
      ['snow', Gen.KIND_SNOW, Gen.KIND_ICE, Gen.PROP_SNOW_PINE, Gen.DECO_BRANCH],
      ['desert', Gen.KIND_SAND, Gen.KIND_GRASS, Gen.PROP_CACTUS, Gen.DECO_DRY_BUSH],
    ] as const
    for (const [id, ground, second, tree, deco] of want) {
      const count = new Map<string, number>()
      const add = (k: string) => count.set(k, (count.get(k) ?? 0) + 1)
      for (const seed of [1, 2, 3]) {
        const r = Gen.region(seed, Biome.byId(id).gen, -96, -96, 192, 192)
        for (let i = 0; i < r.w * r.h; i++) {
          add(`kind ${r.kind[i]}`)
          if (r.prop[i]) add(`prop ${r.prop[i]}`)
          if (r.deco[i]) add(`deco ${r.deco[i]}`)
        }
      }
      const n = (k: string) => count.get(k) ?? 0
      // 바탕이 가장 흔한 종류
      const most = [...count].filter(([k]) => k.startsWith('kind ')).sort((a, b) => b[1] - a[1])[0]![0]
      expect(`${id} ${most}`).toBe(`${id} kind ${ground}`)
      expect(`${id} ${n(`kind ${second}`) > 0} ${n(`prop ${tree}`) > 0} ${n(`deco ${deco}`) > 0}`).toBe(`${id} true true true`)
    }
  })

  // 192² 는 맵 보기 200 × 80 한 화면(약 130 × 130 칸)의 1.5 배. 128² 에서는 큰 덩어리가 하나뿐인 시드가 있다(시드 2·4)
  test('mountains are long ridges between valleys: in a 192 × 192 window around the start at least two high blocks of 30 tiles or more at 5 steps and up, and at least 60 % of the land at 1 or 2 steps', async () => {
    const N = 192
    for (const seed of [1, 2, 3]) {
      const r = Gen.region(seed, Biome.byId('mountain').gen, -N / 2, -N / 2, N, N)
      let low = 0
      for (let i = 0; i < N * N; i++) if (!r.block[i] && r.height[i]! <= 2) low++
      const high = (i: number) => !r.block[i] && r.height[i]! >= 5
      const seen = new Uint8Array(N * N)
      let big = 0
      for (let s = 0; s < N * N; s++) {
        if (seen[s] || !high(s)) continue
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
            if (nx < 0 || ny < 0 || nx >= N || ny >= N || seen[u] || !high(u)) continue
            seen[u] = 1
            q.push(u)
          }
        }
        if (q.length >= 30) big++
      }
      expect(`${seed} ridges ${big >= 2} valleys ${low / (N * N) >= 0.6}`).toBe(`${seed} ridges true valleys true`)
    }
  })

  test('meadow, forest and snow are wide flats with scattered hills: over 256 × 256 tiles at least 75 % of tiles are level with all four neighbours, and at least five blocks reach 5 steps', async () => {
    const N = 256
    for (const id of ['meadow', 'forest', 'snow'] as const) {
      const r = Gen.region(1, Biome.byId(id).gen, -N / 2, -N / 2, N, N)
      const h = (i: number) => r.height[i]! + r.water[i]!
      let flat = 0
      for (let y = 1; y < N - 1; y++) {
        for (let x = 1; x < N - 1; x++) {
          const i = y * N + x
          if (h(i - 1) === h(i) && h(i + 1) === h(i) && h(i - N) === h(i) && h(i + N) === h(i)) flat++
        }
      }
      const high = (i: number) => !r.block[i] && r.height[i]! >= 5
      const seen = new Uint8Array(N * N)
      let hills = 0
      for (let s = 0; s < N * N; s++) {
        if (seen[s] || !high(s)) continue
        hills++
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
            if (nx < 0 || ny < 0 || nx >= N || ny >= N || seen[u] || !high(u)) continue
            seen[u] = 1
            q.push(u)
          }
        }
      }
      expect(`${id} flat ${flat / ((N - 2) * (N - 2)) >= 0.75} hills ${hills >= 5}`).toBe(`${id} flat true hills true`)
    }
  })

  test('the desert is low sand with mesas: over 256 × 256 tiles at least 75 % of the land at 1 or 2 steps and at least three separate red-rock tops at 4 steps or more', async () => {
    const N = 256
    const r = Gen.region(1, Biome.byId('desert').gen, -N / 2, -N / 2, N, N)
    const top = (i: number) => !r.block[i] && r.height[i]! >= 4 && r.kind[i] === Gen.KIND_STONE
    let low = 0
    for (let i = 0; i < N * N; i++) if (!r.block[i] && r.height[i]! + r.water[i]! <= 2) low++
    const seen = new Uint8Array(N * N)
    let mesas = 0
    for (let s = 0; s < N * N; s++) {
      if (seen[s] || !top(s)) continue
      mesas++
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
          if (nx < 0 || ny < 0 || nx >= N || ny >= N || seen[u] || !top(u)) continue
          seen[u] = 1
          q.push(u)
        }
      }
    }
    expect(`low ${low / (N * N) >= 0.75} mesas ${mesas >= 3}`).toBe('low true mesas true')
  })

  test('the sets other than graph paper are worlds without edges whose top reaches within a step of the height limit of the set, above the graph-paper range, with the start on dry walkable ground', async () => {
    const open = Biome.BIOMES.filter(x => x.open === true)
    expect(open.map(b => b.id)).toEqual(['meadow', 'mountain', 'forest', 'lake', 'beach', 'snow', 'desert'])
    for (const b of open) {
      const w = World.create(5, b.gen, { open: true })
      expect(`${b.id} ${World.isOpen(w)} ${World.inside(w, -5000, 7000)}`).toBe(`${b.id} true true`)
      let top = 0
      for (let y = -64; y < 64; y++) for (let x = -64; x < 64; x++) top = Math.max(top, World.heightAt(w, x, y))
      expect(`${b.id} ${top >= b.gen.hmax - 1 && top > 2}`).toBe(`${b.id} true`)
      const f = World.flagsAt(w, w.spawn.x, w.spawn.y)
      expect(`${b.id} ${(f & World.WALK) !== 0 && (f & (World.WATER | World.BLOCK)) === 0}`).toBe(`${b.id} true`)
    }
  })
})
