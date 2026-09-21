import { describe, expect, test } from 'claude-code/testing'

import Model from '../hooks/model'
import Text from '../hooks/text'

describe('text', () => {
  test('hangul counts two cells', () => {
    expect(Text.widthOf('ab')).toBe(2)
    expect(Text.widthOf('전환')).toBe(4)
  })

  test('clip keeps width and ends with an ellipsis', () => {
    expect(Text.clip('lea ARIA tests admin1', 30)).toBe('lea ARIA tests admin1')
    expect(Text.clip('lea ARIA tests admin1', 10)).toBe('lea ARIA …')
    expect(Text.widthOf(Text.clip('Cnd-lea-be ARIA 전환 테스트', 12))).toBeLessThanOrEqual(12)
    expect(Text.clip('a\nb   c', 10)).toBe('a b c')
  })

  test('duration reads like the reference map', () => {
    expect(Text.durationOf(762_000)).toBe('12m 42s')
    expect(Text.durationOf(9_000)).toBe('9s')
    expect(Text.durationOf(3_720_000)).toBe('1h 2m')
  })

  test('tokens read in k and M', () => {
    expect(Text.tokensOf(289_000)).toBe('289.0k')
    expect(Text.tokensOf(1_250_000)).toBe('1.3M')
    expect(Text.tokensOf(512)).toBe('512')
  })

  test('engine statuses map to four', () => {
    expect(Model.statusOf('running')).toBe('running')
    expect(Model.statusOf('completed')).toBe('done')
    expect(Model.statusOf('done')).toBe('done')
    expect(Model.statusOf('failed')).toBe('failed')
    expect(Model.statusOf('killed')).toBe('stopped')
    expect(Model.statusOf('pending')).toBe('running')
    expect(Model.statusOf(undefined)).toBeUndefined()
  })
})
