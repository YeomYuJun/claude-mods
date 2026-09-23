import { describe, expect, test } from 'claude-code/testing'

import Game from '../hooks/game'

// 빈 판에서 pieces 개를 곧장 떨어뜨리며, 배치 때마다 새로 생긴 구멍과 게임 오버를 센다
function simulate(tier: Game.Tier, seed: number, pieces: number) {
  const g = Game.create(seed)
  Game.setTier(g, tier)
  g.board.fill(0)
  g.cur = undefined
  g.clearing = { rows: [], ms: Game.CLEAR_MS }
  Game.advance(g, 0)
  let holes = 0
  let overs = 0
  const start = g.pieces
  while (g.pieces - start < pieces) {
    const before = Game.holesOf(g.board)
    const games = g.games
    Game.drop(g)
    Game.advance(g, Game.OVER_MS)
    Game.advance(g, Game.OVER_MS)
    if (g.games !== games) overs++
    else holes += Math.max(0, Game.holesOf(g.board) - before)
  }
  return { holes, overs, lines: g.lines }
}

describe('ai', () => {
  test('the model id picks the tier, an unknown model gets the default', async () => {
    expect(Game.tierOf('claude-haiku-4-5-20251001')).toBe('haiku')
    expect(Game.tierOf('claude-sonnet-5')).toBe('sonnet')
    expect(Game.tierOf('claude-opus-5-5[1m]')).toBe('opus')
    expect(Game.tierOf('us.anthropic.claude-fable-5-1')).toBe('fable')
    expect(Game.tierOf('claude-test')).toBe(Game.DEFAULT_TIER)
  })

  test('smarter tiers leave fewer holes, and even fable leaves some', async () => {
    const holes = (['haiku', 'sonnet', 'opus', 'fable'] as const).map(tier => simulate(tier, 7919, 300).holes + simulate(tier, 15838, 300).holes)
    expect(holes[0]!).toBeGreaterThan(holes[1]!)
    expect(holes[1]!).toBeGreaterThan(holes[2]!)
    expect(holes[2]!).toBeGreaterThan(holes[3]!)
    expect(holes[3]!).toBeGreaterThan(0)
  })

  test('a slip lands the piece one column off where the AI aimed', async () => {
    let slips = 0
    for (let seed = 1; seed <= 200; seed++) {
      const g = Game.create(seed)
      Game.setTier(g, 'haiku')
      g.cur = undefined
      g.clearing = { rows: [], ms: Game.CLEAR_MS }
      Game.advance(g, 0)
      const cur = g.cur!
      if (cur.tx !== cur.aimX) { slips++; expect(Math.abs(cur.tx - cur.aimX)).toBe(1) }
    }
    expect(slips).toBeGreaterThan(0)
  })
})
