import { describe, expect, test } from 'claude-code/testing'

import Fixtures from './fixtures'

function propsOf(tree: unknown): Record<string, unknown> {
  return Reflect.get(tree as object, 'props') as Record<string, unknown>
}

describe('register', () => {
  test('/pets opens the pane 40 columns wide when docked, again closes it', async ($, on) => {
    const world = Fixtures.worldOf(on)
    await $.session.start(Fixtures.START)
    const first = await $.command.run(Fixtures.PETS_DOCKED)
    const second = await $.command.run(Fixtures.PETS_DOCKED)
    expect(first.text).toBe('강아지 패널을 열었다')
    expect(second.text).toBe('강아지 패널을 닫았다')
    expect(world.opened[0]?.columns).toBe(40)
    expect(world.closed).toEqual(['pets'])
  })

  test('the pane is one Raster as large as its body, and frames are blitted', async ($, on) => {
    const world = Fixtures.worldOf(on)
    await $.session.start(Fixtures.START)
    await $.command.run(Fixtures.PETS_DOCKED)
    const tree = await $.ui.render(Fixtures.paneOf(40, 30))
    expect(Reflect.get(tree, 'type')).toBe('Raster')
    expect(propsOf(tree).columns).toBe(40)
    expect(propsOf(tree).rows).toBe(30)
    const words = Fixtures.wordsOf(String(propsOf(tree).cells))
    expect(words.length).toBe(40 * 30 * 3)
    // 가운데에는 맵이 보인다(기본색이 아닌 배경이 있다)
    const mid = (15 * 40 + 20) * 3
    expect(words[mid + 2] === 0x01000000 && words[mid + 1] === 0x01000000).toBe(false)
    await world.clock.advance(400)
    expect(world.blits.every(b => b.requestId === 'pets' && b.key === 'map')).toBe(true)
  })

  test('a pane smaller than 32 × 24 says how large it must be', async ($, on) => {
    Fixtures.worldOf(on)
    await $.session.start(Fixtures.START)
    await $.command.run(Fixtures.PETS_DOCKED)
    const tree = await $.ui.render(Fixtures.paneOf(30, 30))
    expect(Fixtures.textOf(tree)).toContain('32열 × 24행 이상')
  })

  test('a new prompt sets the dog running: the frames keep changing for a while', async ($, on) => {
    const world = Fixtures.worldOf(on)
    await $.session.start(Fixtures.START)
    await $.command.run(Fixtures.PETS_DOCKED)
    await $.ui.render(Fixtures.paneOf(40, 30))
    await world.clock.advance(2000)
    const before = world.blits.length
    await $.turn.start({ text: 'hi', turnId: 't1' })
    await world.clock.advance(1500)
    const cells = new Set(world.blits.slice(before).map(b => b.cells))
    expect(cells.size > 10).toBe(true)
  })

  test('/pets band draws a three-row Raster above the prompt and steps aside for a survey', async ($, on) => {
    const world = Fixtures.worldOf(on)
    // 엔진 자리: 플러그인이 비켜 주면 엔진이 제 것을 그린다
    on('ui.render', () => ({ type: 'Engine', props: {}, children: [] }) as never)
    await $.session.start(Fixtures.START)
    const on1 = await $.command.run(Fixtures.BAND)
    expect(on1.text).toBe('프롬프트 위 띠에 강아지를 띄웠다')
    const tree = await $.ui.render(Fixtures.bandOf(100, 10))
    expect(Reflect.get(tree, 'type')).toBe('Raster')
    expect(propsOf(tree).rows).toBe(3)
    expect(propsOf(tree).columns).toBe(100)
    await world.clock.advance(3000)
    expect(world.blits.some(b => b.requestId === 'above-prompt' && b.key === 'band')).toBe(true)
    const survey = await $.ui.render(Fixtures.bandOf(100, 10, true))
    expect(Reflect.get(survey, 'type')).not.toBe('Raster')
    const off = await $.command.run(Fixtures.BAND)
    expect(off.text).toBe('프롬프트 위 띠에서 강아지를 내렸다')
  })

  test('/pets zoom switches to two-column dots and keeps the Raster size', async ($, on) => {
    Fixtures.worldOf(on)
    await $.session.start(Fixtures.START)
    await $.command.run(Fixtures.PETS_DOCKED)
    const zoom = await $.command.run(Fixtures.ZOOM)
    expect(zoom.text).toBe('도트 크기를 2 배로 바꿨다')
    const tree = await $.ui.render(Fixtures.paneOf(40, 30))
    expect(propsOf(tree).columns).toBe(40)
    const words = Fixtures.wordsOf(String(propsOf(tree).cells))
    // 배율 2 는 모든 셀이 배경색만 쓰는 빈칸이다
    let spaces = 0
    for (let i = 0; i < words.length; i += 3) if (words[i] === 0x20) spaces++
    expect(spaces).toBe(40 * 30)
  })
})
