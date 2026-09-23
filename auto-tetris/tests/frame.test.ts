import { describe, expect, test } from 'claude-code/testing'

import Frame from '../hooks/frame'
import Game from '../hooks/game'
import Meter from '../hooks/meter'
import Fixtures from './fixtures'

describe('frame', () => {
  test('the board and the stats fit 24 columns', async () => {
    const grid = Frame.compose({ game: Game.create(1), meter: Meter.create(), cols: 24, rows: 40, now: 0 })
    const lines = Fixtures.linesOf(Frame.encode(grid), 24)
    expect(lines[0]).toBe(' ┌────────────────────┐ ')
    expect(Fixtures.valueOf(lines, 'LINES')).toBe('0')
    expect(Fixtures.valueOf(lines, 'PIECES')).toBe('1')
    expect(lines.join('\n')).toContain('▍ idle')
  })

  test('a wider pane centres the fixed-width board', async () => {
    const grid = Frame.compose({ game: Game.create(1), meter: Meter.create(), cols: 40, rows: 22, now: 0 })
    expect(Frame.lineOf(grid, 0)).toBe(`${' '.repeat(9)}┌${'─'.repeat(20)}┐${' '.repeat(9)}`)
  })

  test('every cell is a width-1 BMP character', async () => {
    const grid = Frame.compose({ game: Game.create(1), meter: Meter.create(), cols: 24, rows: 48, now: 0 })
    for (let i = 0; i < grid.words.length; i += 3) {
      const cp = grid.words[i]!
      expect(cp >= 0x20 && cp <= 0xffff).toBe(true)
    }
  })
})
