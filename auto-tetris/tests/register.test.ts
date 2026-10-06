import { describe, expect, test } from 'claude-code/testing'
import type { On } from 'claude-code'

import Messages from '../hooks/messages'
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

// 우물(1~20 행)에서 블록 글자(▀)가 있는 가장 위 행. 빈 판에서는 지금 블록의 위치다
function topOf(lines: readonly string[]): number {
  for (let y = 1; y <= 20; y++) if (lines[y]?.includes('▀')) return y
  return -1
}

// 33 ms 씩 흘리며 blit 마다 (블록 위치, PIECES) 를 모은다
async function framesOf(world: ReturnType<typeof Fixtures.worldOf>, count: number) {
  const out: Array<{ top: number; pieces: number; well: string }> = []
  for (let i = 0; i < count; i++) {
    const before = world.blits.length
    await world.clock.advance(33)
    if (world.blits.length === before) continue
    const lines = Fixtures.linesOf(world.blits[world.blits.length - 1]!.cells, 24)
    out.push({ top: topOf(lines), pieces: Number(Fixtures.valueOf(lines, 'PIECES')), well: lines.slice(1, 21).join('') })
  }
  return out
}

describe('register', () => {
  for (const [language, shown, hidden] of [['ko', '테트리스 패널을 열었다', '테트리스 패널을 닫았다'], ['en', 'Opened the Tetris panel', 'Closed the Tetris panel']] as const) {
    test(`/tetris opens the pane 24 columns wide when docked, again closes it (${language})`, { options: { language } }, async ($, on) => {
      const world = Fixtures.worldOf(on)
      await $.session.start(Fixtures.START)
      const first = await $.command.run(Fixtures.TETRIS_DOCKED)
      const second = await $.command.run(Fixtures.TETRIS_DOCKED)
      expect(first.text).toBe(shown)
      expect(second.text).toBe(hidden)
      expect(world.opened[0]?.columns).toBe(24)
      expect(world.closed).toEqual(['tetris'])
    })
  }

  test('the pane is one Raster as large as its body', async ($, on) => {
    Fixtures.worldOf(on)
    await $.session.start(Fixtures.START)
    await $.command.run(Fixtures.TETRIS_DOCKED)
    const tree = await $.ui.render(Fixtures.paneOf(24, 44))
    expect(Reflect.get(tree, 'type')).toBe('Raster')
    expect(Reflect.get(Reflect.get(tree, 'props') as object, 'columns')).toBe(24)
    expect(Reflect.get(Reflect.get(tree, 'props') as object, 'rows')).toBe(44)
  })

  for (const [language, notice] of [['ko', '24열 × 22행 이상'], ['en', 'at least 24 columns × 22 rows']] as const) {
    test(`a pane narrower than 24 columns says how large it must be (${language})`, { options: { language } }, async ($, on) => {
      Fixtures.worldOf(on)
      await $.session.start(Fixtures.START)
      await $.command.run(Fixtures.TETRIS_DOCKED)
      const tree = await $.ui.render(Fixtures.paneOf(20, 44))
      expect(Fixtures.textOf(tree)).toContain(notice)
    })
  }

  test('en and ko messages carry the same keys of the same kind', () => {
    const { en, ko } = Messages.MESSAGES
    expect(Object.keys(en).sort()).toEqual(Object.keys(ko).sort())
    for (const key of Object.keys(en) as Array<keyof typeof en>) expect(typeof en[key]).toBe(typeof ko[key])
  })

  test('auto reads the settings language, then LC_ALL, then LANG, and falls back to English', () => {
    expect(Messages.languageOf('auto', ['Korean', 'en_US.UTF-8'])).toBe('ko')
    expect(Messages.languageOf('auto', [undefined, 'en_US.UTF-8', 'ko_KR.UTF-8'])).toBe('en')
    expect(Messages.languageOf('auto', [undefined, undefined, 'ko_KR.UTF-8'])).toBe('ko')
    expect(Messages.languageOf('auto', [undefined, 'C', undefined])).toBe('en')
    expect(Messages.languageOf('ko', ['english'])).toBe('ko')
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

  test('a tool call chunk drops the piece row by row over several frames, then the next one is out', async ($, on) => {
    const world = Fixtures.worldOf(on)
    modelAnswers(on, [{ kind: 'tool', index: 0, id: 'toolu_1', name: 'Bash' }, { kind: 'stop', stopReason: 'tool_use', usage: { ...USAGE, output_tokens: 0 } }])
    await $.session.start(Fixtures.START)
    await $.command.run(Fixtures.TETRIS_DOCKED)
    await $.ui.render(Fixtures.paneOf(24, 44))
    await drain($.turn.step(STEP))
    const frames = await framesOf(world, 60)
    const falling = frames.filter(f => f.pieces === 1).map(f => f.top)
    // 한 프레임에 바닥으로 가지 않고, 같은 블록이 여러 위치를 거친다
    expect(new Set(falling).size).toBeGreaterThan(5)
    expect(frames[frames.length - 1]!.pieces).toBe(2)
  })

  test('tokens settled only at the stop are played over many frames, not at once', async ($, on) => {
    const world = Fixtures.worldOf(on)
    modelAnswers(on, [{ kind: 'stop', stopReason: 'end_turn', usage: { ...USAGE, output_tokens: 240 } }])
    await $.session.start(Fixtures.START)
    await $.command.run(Fixtures.TETRIS_DOCKED)
    await $.ui.render(Fixtures.paneOf(24, 44))
    await drain($.turn.step(STEP))
    const frames = await framesOf(world, 90)
    let changes = 0
    for (let i = 1; i < frames.length; i++) if (frames[i]!.well !== frames[i - 1]!.well) changes++
    // 240 토큰 = 20 수. 한 프레임에 몰리지 않고 프레임마다 거의 한 수씩 보인다
    expect(changes).toBeGreaterThan(15)
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
