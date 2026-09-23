import { describe, expect, test } from 'claude-code/testing'

import Meter from '../hooks/meter'

const USAGE = { input_tokens: 100, output_tokens: 40, cache_read_input_tokens: 5000, cache_creation_input_tokens: 0 }

describe('meter', () => {
  test('streamed text gives moves at once and the stop settles on the real count', async () => {
    const m = Meter.create()
    Meter.onText(m, 's1', 'text', 'x'.repeat(48))
    expect(Meter.takeMoves(m, 12, 40)).toBe(1)
    Meter.onStop(m, 's1', USAGE)
    expect(m.out).toBe(40)
    expect(m.inp).toBe(5100)
    expect(Meter.takeMoves(m, 12, 40)).toBe(2)
  })

  test('the status follows what the session is doing', async () => {
    const m = Meter.create()
    expect(Meter.statusOf(m, 0)).toBe('idle')
    Meter.onTurn(m, 't1')
    expect(Meter.statusOf(m, 0)).toBe('waiting')
    Meter.onText(m, 's1', 'thinking', 'hmm')
    Meter.tick(m, 100)
    expect(Meter.statusOf(m, 200)).toBe('thinking')
    Meter.onText(m, 's1', 'text', 'hi')
    Meter.tick(m, 300)
    expect(Meter.statusOf(m, 400)).toBe('streaming')
    Meter.onToolStart(m)
    expect(Meter.statusOf(m, 5000)).toBe('tool')
    Meter.onToolEnd(m)
    Meter.onTurnEnd(m, 't1')
    expect(Meter.statusOf(m, 5000)).toBe('idle')
  })

  test('the backlog is capped so a long closed stretch does not replay forever', async () => {
    const m = Meter.create()
    Meter.onText(m, 's1', 'text', 'x'.repeat(100_000))
    expect(Meter.takeMoves(m, 12, 40)).toBe(40)
    expect(Meter.takeMoves(m, 12, 40)).toBe(40)
    expect(Meter.takeMoves(m, 12, 40)).toBe(0)
  })
})
