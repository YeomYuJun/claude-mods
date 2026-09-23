import { describe, expect, test } from 'claude-code/testing'
import type { On } from 'claude-code'

import Fixtures from './fixtures'

const USAGE = { input_tokens: 1_000, output_tokens: 1_200, cache_read_input_tokens: 0, cache_creation_input_tokens: 0, model: 'claude-test' }

// 엔진 아래(모델 자리)에서 응답 한 번을 흘려보낸다
function modelAnswers(on: On, chunks: ReadonlyArray<Record<string, unknown>>) {
  on('turn.step', async function* ($, e) {
    for (const chunk of chunks) yield chunk as never
    return { turnId: e.turnId, index: e.index, answer: '', toolUses: [], stopReason: 'end_turn', usage: USAGE }
  })
}

async function drain(stream: AsyncIterable<unknown>) {
  for await (const _ of stream) { /* 끝까지 읽는다 */ }
}

const STEP = { turnId: 't1', index: 0, model: 'claude-test', messageCount: 1 } as const

describe('register', () => {
  test('/tetris opens the pane 24 columns wide when docked, again closes it', async ($, on) => {
    const world = Fixtures.worldOf(on)
    await $.session.start(Fixtures.START)
    const first = await $.command.run(Fixtures.TETRIS_DOCKED)
    const second = await $.command.run(Fixtures.TETRIS_DOCKED)
    expect(first.text).toBe('테트리스 패널을 열었다')
    expect(second.text).toBe('테트리스 패널을 닫았다')
    expect(world.opened[0]?.columns).toBe(24)
    expect(world.closed).toEqual(['tetris'])
  })

  test('the pane is one Raster as large as its body', async ($, on) => {
    Fixtures.worldOf(on)
    await $.session.start(Fixtures.START)
    await $.command.run(Fixtures.TETRIS_DOCKED)
    const tree = await $.ui.render(Fixtures.paneOf(24, 44))
    expect(Reflect.get(tree, 'type')).toBe('Raster')
    expect(Reflect.get(Reflect.get(tree, 'props') as object, 'columns')).toBe(24)
    expect(Reflect.get(Reflect.get(tree, 'props') as object, 'rows')).toBe(44)
  })

  test('a pane narrower than 24 columns says how large it must be', async ($, on) => {
    Fixtures.worldOf(on)
    await $.session.start(Fixtures.START)
    await $.command.run(Fixtures.TETRIS_DOCKED)
    const tree = await $.ui.render(Fixtures.paneOf(20, 44))
    expect(Fixtures.textOf(tree)).toContain('24열 × 22행 이상')
  })

  test('streamed output tokens show up and move the game', async ($, on) => {
    const world = Fixtures.worldOf(on)
    modelAnswers(on, [{ kind: 'text', index: 0, text: 'x'.repeat(400) }, { kind: 'stop', stopReason: 'end_turn', usage: USAGE }])
    await $.session.start(Fixtures.START)
    await $.command.run(Fixtures.TETRIS_DOCKED)
    await $.ui.render(Fixtures.paneOf(24, 44))
    await drain($.turn.step(STEP))
    await world.clock.advance(100)
    const last = world.blits[world.blits.length - 1]
    expect(last).toBeDefined()
    const lines = Fixtures.linesOf(last!.cells, 24)
    expect(Fixtures.valueOf(lines, 'OUT')).toBe('1.2k')
  })

  test('a tool call chunk drops the piece: the next one is out', async ($, on) => {
    const world = Fixtures.worldOf(on)
    modelAnswers(on, [{ kind: 'tool', index: 0, id: 'toolu_1', name: 'Bash' }, { kind: 'stop', stopReason: 'tool_use', usage: USAGE }])
    await $.session.start(Fixtures.START)
    await $.command.run(Fixtures.TETRIS_DOCKED)
    await $.ui.render(Fixtures.paneOf(24, 44))
    await drain($.turn.step(STEP))
    await world.clock.advance(100)
    const lines = Fixtures.linesOf(world.blits[world.blits.length - 1]!.cells, 24)
    expect(Number(Fixtures.valueOf(lines, 'PIECES'))).toBeGreaterThan(1)
  })

  test('tokens keep playing while the pane is closed', async ($, on) => {
    Fixtures.worldOf(on)
    modelAnswers(on, [{ kind: 'text', index: 0, text: 'x'.repeat(4000) }, { kind: 'stop', stopReason: 'end_turn', usage: { ...USAGE, output_tokens: 1_000 } }])
    await $.session.start(Fixtures.START)
    await drain($.turn.step(STEP))
    await $.command.run(Fixtures.TETRIS_DOCKED)
    const tree = await $.ui.render(Fixtures.paneOf(24, 44))
    const lines = Fixtures.linesOf(String(Reflect.get(Reflect.get(tree, 'props') as object, 'cells')), 24)
    expect(Number(Fixtures.valueOf(lines, 'PIECES'))).toBeGreaterThan(1)
  })
})
