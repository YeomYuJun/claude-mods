import { describe, expect, test } from 'claude-code/testing'

import Meter from '../hooks/meter'

const USAGE = { input_tokens: 100, output_tokens: 40, cache_read_input_tokens: 5000, cache_creation_input_tokens: 0 }

describe('meter', () => {
  test('streamed text is credited at once and the stop credits only what the estimate missed', async () => {
    const m = Meter.create()
    expect(Meter.onText(m, 's1', 'text', 'x'.repeat(48))).toBe(12)
    expect(Meter.onStop(m, 's1', USAGE)).toBe(28)
    expect(m.out).toBe(40)
    expect(m.inp).toBe(5100)
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

  test('tool input JSON counts as output at once and is not counted twice at the stop', async () => {
    const m = Meter.create()
    Meter.onInput(m, 's1', 'x'.repeat(80))
    expect(m.out).toBe(20)
    expect(Meter.statusOf(m, 0)).toBe('idle')
    Meter.tick(m, 0)
    expect(Meter.statusOf(m, 100)).toBe('tool')
    Meter.onStop(m, 's1', { ...USAGE, output_tokens: 20 })
    expect(m.out).toBe(20)
  })

  test('tokens the stream did not show are spread over the time the response took', async () => {
    const m = Meter.create()
    Meter.tick(m, 0)
    Meter.onStepStart(m, 's1', 0)
    Meter.tick(m, 4000)
    Meter.onStop(m, 's1', { ...USAGE, output_tokens: 400 }, 4000)
    // 4 초 동안 400 토큰: 끝난 막대 여덟 개에 50 씩, 최근 2 초 평균은 100 tok/s
    expect(m.bins.slice(-8).map(v => Math.round(v))).toEqual([50, 50, 50, 50, 50, 50, 50, 50])
    expect(Math.round(Meter.rateOf(m))).toBe(100)
  })
})
