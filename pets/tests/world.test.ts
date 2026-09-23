import { describe, expect, test } from 'claude-code/testing'

import Path from '../hooks/path'
import World from '../hooks/world'

describe('world', () => {
  test('the same seed makes the same map, another seed another', async () => {
    const a = World.create(42)
    const b = World.create(42)
    const c = World.create(43)
    expect(a.w).toBe(b.w)
    expect(Array.from(a.height)).toEqual(Array.from(b.height))
    expect(Array.from(a.height).join('') === Array.from(c.height).join('') && a.w === c.w).toBe(false)
  })

  test('sizes stay within 20 to 32 tiles and heights within 0 to 4', async () => {
    for (let seed = 1; seed <= 20; seed++) {
      const w = World.create(seed)
      expect(w.w >= 20 && w.w <= 32 && w.h >= 20 && w.h <= 32).toBe(true)
      expect(Math.max(...w.height) <= World.MAX_HEIGHT).toBe(true)
    }
  })

  test('terrain without blocks never steps by more than one', async () => {
    for (let seed = 1; seed <= 10; seed++) {
      const w = World.create(seed)
      for (let y = 0; y < w.h; y++) {
        for (let x = 0; x + 1 < w.w; x++) {
          const i = y * w.w + x
          if (w.block[i] || w.block[i + 1]) continue
          expect(Math.abs(w.height[i]! - w.height[i + 1]!) <= 1).toBe(true)
        }
      }
    }
  })

  test('every walkable tile is reachable from the spawn, and the spawn is walkable', async () => {
    for (let seed = 1; seed <= 10; seed++) {
      const w = World.create(seed)
      expect(World.isWalkable(w, w.spawn.x, w.spawn.y)).toBe(true)
      const dist = Path.distancesFrom(w, w.spawn)
      let walk = 0
      for (let i = 0; i < w.walk.length; i++) {
        if (!w.walk[i]) continue
        walk++
        expect(dist[i]! >= 0).toBe(true)
      }
      expect(walk >= w.w * w.h * 0.55).toBe(true)
    }
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
    let blocked = -1
    for (let i = 0; i < w.walk.length; i++) if (!w.walk[i]) { blocked = i; break }
    if (blocked < 0) return
    expect(Path.find(w, w.spawn, { x: blocked % w.w, y: Math.floor(blocked / w.w) })).toBeNull()
  })
})
