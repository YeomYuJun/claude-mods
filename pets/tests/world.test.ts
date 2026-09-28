import { describe, expect, test } from 'claude-code/testing'

import Biome from '../hooks/biome'
import Names from '../hooks/names'
import Path from '../hooks/path'
import Pet from '../hooks/pet'
import World from '../hooks/world'
import Fixtures from './fixtures'

// 창 ±16 결과와 비교할 때 쓰는 넓은 창. 지금 맵(한 변 ≤ 32)을 다 덮어 창이 없는 것과 같다
const WIDE = 64

describe('world', () => {
  test('the same seed makes the same map, another seed another', async () => {
    const a = World.create(42)
    const b = World.create(42)
    const c = World.create(43)
    const heights = (w: typeof a) => {
      const out: number[] = []
      for (let y = 0; y < 40; y++) for (let x = 0; x < 40; x++) out.push(World.heightAt(w, x, y))
      return out
    }
    expect(heights(a)).toEqual(heights(b))
    expect(heights(a).join('') === heights(c).join('')).toBe(false)
  })

  test('graph-paper maps stay within 20 to 32 tiles and 4 steps; the wider sets within 8', async () => {
    for (let seed = 1; seed <= 20; seed++) {
      const w = World.create(seed)
      const { x0, y0, x1, y1 } = World.bounds(w)
      const cols = x1 - x0 + 1
      const rows = y1 - y0 + 1
      expect(cols >= 20 && cols <= 32 && rows >= 20 && rows <= 32).toBe(true)
      for (const t of Fixtures.tilesAround(w)) expect(World.heightAt(w, t.x, t.y) <= 4).toBe(true)
    }
    for (const b of Biome.BIOMES) {
      const w = World.create(3, b.gen, { size: b.size })
      for (let i = 0; i < w.w * w.h; i++) expect(w.height[i]! <= World.MAX_HEIGHT).toBe(true)
    }
  })

  test('terrain without blocks never steps by more than one', async () => {
    for (let seed = 1; seed <= 10; seed++) {
      const w = World.create(seed)
      for (const t of Fixtures.tilesAround(w)) {
        for (const [dx, dy] of [[1, 0], [0, 1]] as const) {
          const nx = t.x + dx
          const ny = t.y + dy
          if (!World.inside(w, t.x, t.y) || !World.inside(w, nx, ny)) continue
          if (World.isBlock(w, t.x, t.y) || World.isBlock(w, nx, ny)) continue
          expect(Math.abs(World.heightAt(w, t.x, t.y) - World.heightAt(w, nx, ny)) <= 1).toBe(true)
        }
      }
    }
  })

  test('with trees in place every tile that is not a tree or a block is walkable and reachable from the spawn', async () => {
    for (const b of Biome.BIOMES) {
      for (const seed of [1, 2]) {
        const w = World.create(seed, b.gen, { size: b.size, props: true })
        expect(World.isWalkable(w, w.spawn.x, w.spawn.y)).toBe(true)
        let missed = 0
        for (let y = 0; y < w.h; y++) {
          for (let x = 0; x < w.w; x++) {
            if (World.isBlock(w, x, y) || World.isObstacle(w, x, y)) continue
            if (!World.isWalkable(w, x, y)) missed++
          }
        }
        expect(`${b.id} ${seed} ${missed}`).toBe(`${b.id} ${seed} 0`)
        const reach = Path.distancesFrom(w, w.spawn, World.DEFAULT_RULES, WIDE)
        for (let y = w.spawn.y - 8; y <= w.spawn.y + 8; y++) {
          for (let x = w.spawn.x - 8; x <= w.spawn.x + 8; x++) if (World.isWalkable(w, x, y)) expect(Path.stepsAt(reach, x, y) >= 0).toBe(true)
        }
      }
    }
  })
})

describe('sleeping spot', () => {
  test('a higher tile behind (x - 1 or y - 1) makes a spot cozy, a higher tile in front (x + 1 or y + 1) does not', async () => {
    const at = (raise: ReadonlyArray<readonly [number, number, number]>) => World.cozinessOf(Fixtures.flatWorld(7, 7, raise), 3, 3)
    expect(at([])).toBe(0)
    expect(at([[4, 3, 1]])).toBe(0)
    expect(at([[3, 4, 2]])).toBe(0)
    expect(at([[4, 3, 1], [3, 4, 1]])).toBe(0)
    expect(at([[2, 3, 1]])).toBe(1)
    expect(at([[3, 2, 2]])).toBe(1)
    expect(at([[2, 3, 1], [3, 2, 1], [4, 3, 2], [3, 4, 2]])).toBe(2)
  })

  test('a tree up to four diagonals in front and one tile to either side counts as in front, a tree behind or further off does not', async () => {
    const at = (tx: number, ty: number) => World.hasTreeInFront(Fixtures.flatWorld(12, 12, [], [[tx, ty]]), 4, 4, 4)
    for (const [x, y] of [[5, 4], [4, 5], [5, 5], [6, 5], [5, 6], [6, 6]]) expect(`${x},${y} ${at(x, y)}`).toBe(`${x},${y} true`)
    for (const [x, y] of [[3, 4], [4, 3], [3, 3], [6, 4], [4, 6], [7, 7], [8, 6]]) expect(`${x},${y} ${at(x, y)}`).toBe(`${x},${y} false`)
    expect(World.hasTreeInFront(Fixtures.flatWorld(12, 12, [], [[5, 4, World.Gen.PROP_ROCK]]), 4, 4, 4)).toBe(false)
  })

  test('going to bed skips the coziest spot when a tree stands in front of it', async () => {
    // (5, 6) 는 뒤쪽 (4, 6) 이 높아 가장 아늑하다. 나무 (6, 7) 은 그 칸의 두 대각선 앞
    const bedIn = (world: ReturnType<typeof Fixtures.flatWorld>) => {
      const p = Pet.create(world, 7, 0)
      const act = Pet.build('bedtime', p, world)
      const go = act.steps.find(s => s.k === 'go') as { to: { x: number; y: number } }
      return `${go.to.x},${go.to.y}`
    }
    expect(bedIn(Fixtures.flatWorld(12, 12, [[4, 6, 1]]))).toBe('5,6')
    expect(bedIn(Fixtures.flatWorld(12, 12, [[4, 6, 1]], [[6, 7]])) === '5,6').toBe(false)
  })
})

describe('path', () => {
  test('a path moves one tile at a time and never climbs more than one step', async () => {
    const w = World.create(7)
    const far = Path.tilesWithin(w, w.spawn, 10, 14)
    expect(far.length > 0).toBe(true)
    const path = Path.find(w, w.spawn, far[0]!)
    expect(path).not.toBeNull()
    let prev = w.spawn
    for (const t of path!) {
      expect(Math.abs(t.x - prev.x) + Math.abs(t.y - prev.y)).toBe(1)
      expect(World.canStep(w, prev.x, prev.y, t.x, t.y)).toBe(true)
      prev = t
    }
    expect(prev).toEqual(far[0]!)
  })

  test('a tile that is not walkable has no path', async () => {
    const w = World.create(7)
    const blocked = Fixtures.tilesAround(w, 10).find(t => World.inside(w, t.x, t.y) && !World.isWalkable(w, t.x, t.y))
    if (!blocked) return
    expect(Path.find(w, w.spawn, blocked)).toBeNull()
  })

  test('searching only ±16 tiles around the start finds the same paths and step counts as searching the whole map', async () => {
    let pairs = 0
    for (let seed = 1; seed <= 6; seed++) {
      const w = World.create(seed)
      const starts = [w.spawn, ...Path.tilesWithin(w, w.spawn, 6, 6).slice(0, 2)]
      for (const from of starts) {
        const near = Path.distancesFrom(w, from)
        const wide = Path.distancesFrom(w, from, World.DEFAULT_RULES, WIDE)
        for (const t of Fixtures.tilesAround(w, 16).map(t => ({ x: t.x - w.spawn.x + from.x, y: t.y - w.spawn.y + from.y }))) {
          const d = Path.stepsAt(wide, t.x, t.y)
          if (d < 1 || d > 16) continue
          expect(Path.stepsAt(near, t.x, t.y)).toBe(d)
          // 목적지는 1~16 걸음 전부를 본다. 곧게는 가깝지만 돌아가야 하는 칸도 여기에 든다
          const inWindow = Path.find(w, from, t)
          expect(inWindow).not.toBeNull()
          expect(inWindow).toEqual(Path.find(w, from, t, World.DEFAULT_RULES, WIDE))
          pairs++
        }
      }
    }
    expect(pairs > 1000).toBe(true)
  })

  test('a destination outside the window has no path', async () => {
    const w = Fixtures.flatWorld(40, 3)
    expect(Path.find(w, { x: 1, y: 1 }, { x: 17, y: 1 })).not.toBeNull()
    expect(Path.find(w, { x: 1, y: 1 }, { x: 18, y: 1 })).toBeNull()
  })
})

describe('obstacles', () => {
  // 12 × 12 평지, (5, 6) 에 나무
  const TREE = { x: 5, y: 6 }
  const withTree = () => Fixtures.flatWorld(12, 12, [], [[TREE.x, TREE.y]])

  test('no species can stand on or step into a tree tile, whatever it can climb or swim', async () => {
    const w = withTree()
    for (const rules of [World.DEFAULT_RULES, { climb: 2, swim: false }, { climb: 2, swim: true }]) {
      expect(World.isWalkable(w, TREE.x, TREE.y, rules)).toBe(false)
      expect(World.canStep(w, TREE.x, TREE.y - 1, TREE.x, TREE.y, rules)).toBe(false)
    }
    expect(World.isObstacle(w, TREE.x, TREE.y)).toBe(true)
  })

  test('paths, step counts and picked destinations go around the tree', async () => {
    const w = withTree()
    const path = Path.find(w, { x: 5, y: 5 }, { x: 5, y: 7 })
    expect(path).not.toBeNull()
    expect(path!.length).toBe(4)
    expect(path!.some(t => t.x === TREE.x && t.y === TREE.y)).toBe(false)
    const reach = Path.distancesFrom(w, { x: 5, y: 5 })
    expect(Path.stepsAt(reach, TREE.x, TREE.y)).toBe(-1)
    expect(Path.stepsAt(reach, 5, 7)).toBe(4)
    for (let hi = 1; hi <= 8; hi++) expect(Path.tilesWithin(w, { x: 5, y: 5 }, 0, hi).some(t => t.x === TREE.x && t.y === TREE.y)).toBe(false)
  })

  test('the spawn and the ball never start on a tree', async () => {
    // 가운데 칸(시작 칸 후보)과 그 둘레를 나무로 덮은 맵
    const trees: Array<[number, number]> = []
    for (let y = 2; y < 12; y += 2) for (let x = 2; x < 12; x += 2) trees.push([x, y])
    trees.push([6, 6])
    const w = Fixtures.flatWorld(13, 13, [], trees)
    expect(World.isObstacle(w, w.spawn.x, w.spawn.y)).toBe(false)
    for (let seed = 1; seed <= 30; seed++) {
      const p = Pet.create(w, seed, 0)
      const b = Pet.Ball.tileOf(p.ball)
      expect(World.isObstacle(w, b.x, b.y)).toBe(false)
    }
  })

  test('a pounce toward a tree stays in place', async () => {
    const w = withTree()
    const p = Pet.create(w, 1, 0)
    p.x = 5
    p.y = 5
    Pet.Motion.pounce(p, w, 0, 1)
    expect([p.hop!.tx, p.hop!.ty]).toEqual([5, 5])
  })

  test('a ball kicked at a tree bounces back instead of rolling through it', async () => {
    const w = withTree()
    const b = Pet.Ball.create(5, 5, w)
    Pet.Ball.kick(b, 0, 1, 5, 0)
    let entered = false
    for (let t = 0; t < 4000; t += Names.SIM_STEP_MS) {
      Pet.Ball.step(b, w, Names.SIM_STEP_MS)
      const at = Pet.Ball.tileOf(b)
      if (at.x === TREE.x && at.y === TREE.y) entered = true
    }
    expect(entered).toBe(false)
    expect(b.y < TREE.y - 0.5).toBe(true)
  })
})
