import { describe, expect, test } from 'claude-code/testing'

import Fixtures from './fixtures'

const ZOOM_IN = { ...Fixtures.PETS, args: 'zoom in' } as const
const ZOOM_OUT = { ...Fixtures.PETS, args: ' Zoom  OUT ' } as const
const WORLD = (name: string) => ({ ...Fixtures.PETS, args: `world ${name}` })
const PET = (name: string) => ({ ...Fixtures.PETS, args: `pet ${name}` })

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

  test('outside the terminal the pane says so instead of drawing a Raster', async ($, on) => {
    Fixtures.worldOf(on)
    await $.session.start(Fixtures.START)
    await $.command.run(Fixtures.PETS_DOCKED)
    for (const surface of ['vscode', 'desktop'] as const) {
      const tree = await $.ui.render(Fixtures.paneOf(40, 30, surface))
      expect(Reflect.get(tree, 'type') === 'Raster').toBe(false)
      expect(Fixtures.textOf(tree)).toContain('터미널 패널에서만')
    }
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

  test('/pets band is no longer a command: it answers with the usage and no band is drawn even if an old save turned it on', async ($, on) => {
    const world = Fixtures.worldOf(on, { band: true })
    on('ui.render', () => ({ type: 'Engine', props: {}, children: [] }) as never)
    await $.session.start(Fixtures.START)
    const answer = await $.command.run(Fixtures.BAND)
    expect(answer.text).not.toContain('띠')
    expect(answer.text).toContain('/pets zoom')
    const tree = await $.ui.render(Fixtures.bandOf(100, 10))
    expect(Reflect.get(tree, 'type')).not.toBe('Raster')
    await world.clock.advance(3000)
    expect(world.blits.some(b => b.key === 'band')).toBe(false)
    expect(world.store.get('band')).toBe(true)
  })

  test('at session start only the newest seven edit keys of other sessions stay, and edit values of an unknown version or shape are neither counted nor deleted', async ($, on) => {
    const saved: Record<string, unknown> = {}
    for (let i = 0; i < 10; i++) saved[`edits:meadow:0000000${i}`] = { v: 1, at: 1000 + i, list: [] }
    saved['edits:forest:ffffffff'] = { v: 9, other: true }
    saved['edits:lake:eeeeeeee'] = 'not an edit table'
    const world = Fixtures.worldOf(on, saved)
    await $.session.start(Fixtures.START)
    const keys = [...world.store.keys()].filter(k => k.startsWith('edits:'))
    expect(world.store.get('edits:forest:ffffffff')).toEqual({ v: 9, other: true })
    expect(world.store.get('edits:lake:eeeeeeee')).toBe('not an edit table')
    for (let i = 0; i < 3; i++) expect(keys.includes(`edits:meadow:0000000${i}`)).toBe(false)
    for (let i = 3; i < 10; i++) expect(keys.includes(`edits:meadow:0000000${i}`)).toBe(true)
    expect(keys.length).toBe(9)
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

  test('/pets zoom cycles 1 → 2 → far → 1, and zoom in · out move one step and stop at the ends', async ($, on) => {
    Fixtures.worldOf(on)
    await $.session.start(Fixtures.START)
    const texts: string[] = []
    for (const e of [Fixtures.ZOOM, Fixtures.ZOOM, Fixtures.ZOOM, ZOOM_OUT, ZOOM_OUT, ZOOM_IN, ZOOM_IN, ZOOM_IN]) texts.push(String((await $.command.run(e)).text))
    expect(texts).toEqual([
      '도트 크기를 2 배로 바꿨다',
      '원거리로 넓게 보게 바꿨다',
      '도트 크기를 1 배로 바꿨다',
      '원거리로 넓게 보게 바꿨다',
      '이미 가장 넓게(원거리) 보고 있다',
      '도트 크기를 1 배로 바꿨다',
      '도트 크기를 2 배로 바꿨다',
      '이미 가장 크게(2 배) 보고 있다',
    ])
    const bad = await $.command.run({ ...Fixtures.PETS, args: 'zoom far away' })
    expect(bad.text).toContain('/pets zoom in')
  })

  test('the zoom is kept in the store: far comes back as far, and a 2 saved before far existed still reads as 2', async ($, on) => {
    Fixtures.worldOf(on)
    await $.session.start(Fixtures.START)
    await $.command.run(Fixtures.ZOOM)
    await $.session.start(Fixtures.START)
    expect((await $.command.run(ZOOM_IN)).text).toBe('이미 가장 크게(2 배) 보고 있다')
    await $.command.run(Fixtures.ZOOM)
    await $.session.start(Fixtures.START)
    expect((await $.command.run(ZOOM_OUT)).text).toBe('이미 가장 넓게(원거리) 보고 있다')
  })

  test('typing, a prompt typed during a turn, a subagent spawn, a compaction and a denied tool pass through unchanged while the pane is open', async ($, on) => {
    const world = Fixtures.worldOf(on)
    on('prompt.edit', ($, e) => ({ text: `${e.text}!`, cursor: e.cursor + 1 }))
    on('prompt.submit', ($, e) => ({ text: e.text }))
    on('agent.spawn', () => ({ model: 'm', agentId: 'a1' }))
    on('session.compact', () => ({ skip: 'kept' }))
    on('tool.call', () => ({ deny: 'no' }))
    await $.session.start(Fixtures.START)
    await $.command.run(Fixtures.PETS_DOCKED)
    await $.ui.render(Fixtures.paneOf(40, 30))
    await world.clock.advance(500)
    const box = await $.prompt.edit({ origin: { kind: 'composer' }, text: 'ab', cursor: 2, start: 2, end: 2, inputText: 'b' })
    expect(box).toEqual({ text: 'ab!', cursor: 3 })
    const sent = await $.prompt.submit({ text: 'more', turnId: 't1', wait: false, origin: { kind: 'composer' } })
    expect(sent.text).toBe('more')
    const spawned = await $.agent.spawn({ tool_use_id: 'u1', prompt: 'p', description: 'd', subagentType: 'general', provider: { kind: 'engine' } } as never)
    expect(spawned).toEqual({ model: 'm', agentId: 'a1' })
    expect(await $.session.compact({ trigger: 'manual', messages: [] })).toEqual({ skip: 'kept' })
    const denied = await $.tool.call({ tool: 'Bash', command: 'ls' } as never)
    expect(denied).toEqual({ deny: 'no' })
    await world.clock.advance(3000)
    expect(world.blits.length > 0).toBe(true)
  })

  test('/pets world lists the sets; an id or a Korean alias switches the colors and is stored; an unknown name changes nothing', async ($, on) => {
    const world = Fixtures.worldOf(on)
    await $.session.start(Fixtures.START)
    await $.command.run(Fixtures.PETS_DOCKED)
    const paper = String(propsOf(await $.ui.render(Fixtures.paneOf(40, 30))).cells)
    const list = await $.command.run(WORLD(''))
    expect(list.text).toContain('지금 맵 세트: 모눈종이')
    for (const id of ['paper', 'meadow', 'mountain', 'forest', 'lake', 'auto']) expect(list.text).toContain(id)
    expect((await $.command.run(WORLD('forest'))).text).toBe('맵 세트를 숲 세트로 바꿨다. 맵을 새로 만들고 강아지를 새 자리에 두었다')
    const forest = String(propsOf(await $.ui.render(Fixtures.paneOf(40, 30))).cells)
    expect(forest === paper).toBe(false)
    expect(world.store.get('world')).toEqual({ v: 1, set: 'forest' })
    expect((await $.command.run(WORLD('초원'))).text).toBe('맵 세트를 초원 세트로 바꿨다. 맵을 새로 만들고 강아지를 새 자리에 두었다')
    expect(world.store.get('world')).toEqual({ v: 1, set: 'meadow' })
    const bad = await $.command.run(WORLD('volcano'))
    expect(bad.text).toContain("'volcano' 라는 맵 세트는 없다")
    expect(bad.text).toContain('lake 호숫가')
    expect(world.store.get('world')).toEqual({ v: 1, set: 'meadow' })
    expect((await $.command.run(WORLD(''))).text).toContain('지금 맵 세트: 초원.')
  })

  test('/pets world auto picks a set other than graph paper from the session and keeps auto in the store', async ($, on) => {
    const world = Fixtures.worldOf(on)
    await $.session.start(Fixtures.START)
    const auto = await $.command.run(WORLD('auto'))
    expect(auto.text).toContain('자동으로 바꿨다')
    expect(auto.text.includes('모눈종이')).toBe(false)
    expect(world.store.get('world')).toEqual({ v: 1, set: 'auto' })
    await $.session.start(Fixtures.START)
    expect((await $.command.run(WORLD(''))).text).toContain('(자동)')
  })

  test('a stored set comes back next session; an unknown set, version or shape falls back to graph paper and stays in the store', async ($, on) => {
    const world = Fixtures.worldOf(on, { world: { v: 1, set: 'lake' } })
    await $.session.start(Fixtures.START)
    expect((await $.command.run(WORLD(''))).text).toContain('지금 맵 세트: 호숫가.')
    for (const value of [{ v: 1, set: 'volcano' }, { v: 9, set: 'lake' }, 'lake', null]) {
      world.store.set('world', value)
      await $.session.start(Fixtures.START)
      expect((await $.command.run(WORLD(''))).text).toContain('지금 맵 세트: 모눈종이.')
      expect(world.store.get('world')).toEqual(value)
    }
  })

  test('/pets pet lists the breeds; an id or a Korean alias switches the dog and is stored; extra names are ignored; an unknown one changes nothing', async ($, on) => {
    const world = Fixtures.worldOf(on)
    await $.session.start(Fixtures.START)
    await $.command.run(Fixtures.PETS_DOCKED)
    const white = String(propsOf(await $.ui.render(Fixtures.paneOf(40, 30))).cells)
    const list = await $.command.run(PET(''))
    expect(list.text).toContain('지금 강아지: 흰 강아지')
    for (const id of ['dog', 'shiba', 'blackdog', 'dalmatian', 'brown', 'auto']) expect(list.text).toContain(id)
    expect((await $.command.run(PET('시바'))).text).toBe('강아지를 바꿨다: 시바')
    expect(String(propsOf(await $.ui.render(Fixtures.paneOf(40, 30))).cells) === white).toBe(false)
    expect(world.store.get('pets')).toEqual({ v: 1, list: ['shiba'] })
    expect((await $.command.run(PET('dalmatian brown dog'))).text).toBe('강아지를 바꿨다: 점박이. 지금은 한 마리만 두어 첫 번째만 썼다(2 개는 무시)')
    expect(world.store.get('pets')).toEqual({ v: 1, list: ['dalmatian'] })
    expect((await $.command.run(PET('unicorn'))).text).toContain("'unicorn' 라는 품종은 없다")
    expect(world.store.get('pets')).toEqual({ v: 1, list: ['dalmatian'] })
    const auto = await $.command.run(PET('auto'))
    expect(auto.text).toContain('자동으로 바꿨다')
    expect(auto.text.includes('흰 강아지')).toBe(false)
    expect(world.store.get('pets')).toEqual({ v: 1, list: 'auto' })
  })

  test('a stored breed comes back next session; an unknown breed, version or shape falls back to the white dog and stays in the store', async ($, on) => {
    const world = Fixtures.worldOf(on, { pets: { v: 1, list: ['blackdog'] } })
    await $.session.start(Fixtures.START)
    expect((await $.command.run(PET(''))).text).toContain('지금 강아지: 검은 강아지.')
    for (const value of [{ v: 1, list: ['unicorn'] }, { v: 2, list: ['shiba'] }, ['shiba'], 'shiba']) {
      world.store.set('pets', value)
      await $.session.start(Fixtures.START)
      expect((await $.command.run(PET(''))).text).toContain('지금 강아지: 흰 강아지.')
      expect(world.store.get('pets')).toEqual(value)
    }
  })

  test('far zoom keeps the Raster size and paints a different frame from 1 ×', async ($, on) => {
    Fixtures.worldOf(on)
    await $.session.start(Fixtures.START)
    await $.command.run(Fixtures.PETS_DOCKED)
    const near = Fixtures.wordsOf(String(propsOf(await $.ui.render(Fixtures.paneOf(40, 30))).cells))
    await $.command.run(ZOOM_OUT)
    const tree = await $.ui.render(Fixtures.paneOf(40, 30))
    expect(propsOf(tree).columns).toBe(40)
    expect(propsOf(tree).rows).toBe(30)
    const far = Fixtures.wordsOf(String(propsOf(tree).cells))
    expect(far.length).toBe(near.length)
    expect(far.join(',') === near.join(',')).toBe(false)
  })
})
