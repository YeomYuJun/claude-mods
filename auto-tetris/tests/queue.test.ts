import { describe, expect, test } from 'claude-code/testing'

import Queue from '../hooks/queue'

// 한 프레임씩 흘려 수를 모두 둘 때까지 프레임별 수를 모은다
function playOut(q: ReturnType<typeof Queue.create>, rate: number, frames: number): number[] {
  const perFrame: number[] = []
  for (let i = 0; i < frames && Queue.tokensOf(q) > 0; i++) perFrame.push(Queue.movesFor(q, rate, 12, 33))
  return perFrame
}

describe('queue', () => {
  test('tokens are kept as they came, and only the newest 480 stay', async () => {
    const q = Queue.create()
    Queue.addTokens(q, 30.5, 480)
    expect(Queue.tokensOf(q)).toBe(30.5)
    Queue.addTokens(q, 100_000, 480)
    expect(Queue.tokensOf(q)).toBe(480)
  })

  test('a drop waits behind the tokens that came before it', async () => {
    const q = Queue.create()
    Queue.addTokens(q, 24, 480)
    Queue.addDrop(q)
    Queue.addTokens(q, 12, 480)
    expect(q.items).toEqual([{ kind: 'tokens', n: 24 }, { kind: 'drop' }, { kind: 'tokens', n: 12 }])
    expect(Queue.takeDrop(q)).toBe(false)
    expect(playOut(q, 0, 200).reduce((a, b) => a + b, 0)).toBe(2)
    expect(Queue.takeDrop(q)).toBe(true)
  })

  test('a burst is spread over many frames instead of played at once', async () => {
    const q = Queue.create()
    Queue.addTokens(q, 480, 480)
    const perFrame = playOut(q, 0, 400)
    expect(Math.max(...perFrame)).toBeLessThanOrEqual(1)
    expect(perFrame.length).toBeGreaterThan(30)
    expect(perFrame.reduce((a, b) => a + b, 0)).toBe(40)
  })

  test('the pace follows tok/s smoothly, not in steps of one move', async () => {
    const at = (rate: number) => {
      const q = Queue.create()
      Queue.addTokens(q, 12 * 30, 480)
      return playOut(q, rate, 400).length
    }
    // 속도가 오를수록 같은 양을 더 짧게 둔다
    expect(at(60)).toBeLessThan(at(0))
    expect(at(120)).toBeLessThan(at(60))
    expect(Queue.fallRowsOf(100)).toBeGreaterThan(Queue.fallRowsOf(0))
  })

  test('moves the piece could not take go back to the head', async () => {
    const q = Queue.create()
    Queue.addTokens(q, 36, 480)
    Queue.refund(q, 2, 12)
    expect(Queue.tokensOf(q)).toBe(60)
  })
})
