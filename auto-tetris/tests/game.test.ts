import { describe, expect, test } from 'claude-code/testing'

import Game from '../hooks/game'

describe('game', () => {
  test('the AI clears lines when it is given moves', async () => {
    const g = Game.create(12345)
    for (let i = 0; i < 4000; i++) if (!Game.move(g)) Game.advance(g, Game.CLEAR_MS)
    expect(g.lines).toBeGreaterThan(0)
    expect(g.pieces).toBeGreaterThan(10)
  })

  test('nothing moves without moves: time alone does not drop the piece', async () => {
    const g = Game.create(7)
    const y = g.cur?.y
    Game.advance(g, 60_000)
    expect(g.cur?.y).toBe(y)
  })

  test('a drop lands the piece at once and the next one spawns', async () => {
    const g = Game.create(7)
    Game.drop(g)
    expect(g.pieces).toBe(2)
    expect([...g.board].some(v => v > 0)).toBe(true)
  })

  test('a drop during the line-clear animation waits for it', async () => {
    const g = Game.create(7)
    g.board.fill(1, (Game.BH - 1) * Game.BW, Game.BH * Game.BW - 1)
    g.clearing = { rows: [Game.BH - 1], ms: 0 }
    Game.drop(g)
    expect(g.pendingDrops).toBe(1)
    Game.advance(g, Game.CLEAR_MS)
    expect(g.pendingDrops).toBe(0)
  })

  test('a full well ends the game and a new one starts after the pause', async () => {
    const g = Game.create(7)
    g.board.fill(1)
    for (let x = 0; x < Game.BW; x += 2) g.board[(Game.BH - 1) * Game.BW + x] = 0
    g.cur = undefined
    g.clearing = { rows: [], ms: Game.CLEAR_MS }
    Game.advance(g, 0)
    expect(g.over).toBeDefined()
    Game.advance(g, Game.OVER_MS)
    expect(g.games).toBe(2)
    expect(g.cur).toBeDefined()
  })
})
