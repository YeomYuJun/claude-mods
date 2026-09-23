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

  test('a drop falls row by row at the given speed, then the next one spawns', async () => {
    const g = Game.create(7)
    const y0 = g.cur!.y
    expect(Game.drop(g)).toBe(true)
    expect(Game.move(g)).toBe(false)
    Game.advance(g, 100, 30)
    expect(g.cur!.y).toBe(y0 + 3)
    expect(g.pieces).toBe(1)
    Game.advance(g, 2000, 30)
    expect(g.pieces).toBe(2)
    expect([...g.board].some(v => v > 0)).toBe(true)
  })

  test('a drop during the line-clear animation is refused', async () => {
    const g = Game.create(7)
    g.clearing = { rows: [], ms: 0 }
    expect(Game.drop(g)).toBe(false)
  })

  test('clears in a row build a combo with a bonus, a placement without a clear resets it', async () => {
    const g = Game.create(7)
    const clearOne = () => {
      g.board.fill(0)
      g.board.fill(1, (Game.BH - 1) * Game.BW, Game.BH * Game.BW - 1)
      g.cur = { k: Game.I_PIECE, r: 1, x: Game.BW - 3, y: Game.BH - 4, tr: 1, tx: Game.BW - 3, aimX: Game.BW - 3, falling: false, fallAcc: 0 }
      Game.move(g)
      Game.advance(g, Game.CLEAR_MS)
    }
    clearOne()
    expect(g.combo).toBe(1)
    expect(g.popup?.lines).toEqual(['SINGLE'])
    const before = g.score
    clearOne()
    expect(g.combo).toBe(2)
    expect(g.score - before).toBe(100 + Game.COMBO_BONUS)
    expect(g.popup?.lines).toEqual(['SINGLE', 'COMBO x2'])
    g.board.fill(0)
    g.cur = { k: Game.O_PIECE, r: 0, x: 0, y: Game.BH - 2, tr: 0, tx: 0, aimX: 0, falling: false, fallAcc: 0 }
    Game.move(g)
    expect(g.combo).toBe(0)
    expect(g.maxCombo).toBe(2)
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
