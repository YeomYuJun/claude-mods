import { describe, expect, mock, test } from 'claude-code/testing'

import Messages from '../hooks/messages'
import Fixtures from './fixtures'

const KO = { options: { language: 'ko' } } as const
const EN = { options: { language: 'en' } } as const

const ZOOM_IN = { ...Fixtures.PETS, args: 'zoom in' } as const
const ZOOM_OUT = { ...Fixtures.PETS, args: ' Zoom  OUT ' } as const
const WORLD = (name: string) => ({ ...Fixtures.PETS, args: `world ${name}` })
const PET = (name: string) => ({ ...Fixtures.PETS, args: `pet ${name}` })

function propsOf(tree: unknown): Record<string, unknown> {
  return Reflect.get(tree as object, 'props') as Record<string, unknown>
}

describe('register', () => {
  test('/pets opens the pane 40 columns wide when docked, again closes it', KO, async ($, on) => {
    const world = Fixtures.worldOf(on)
    await $.session.start(Fixtures.START)
    const first = await $.command.run(Fixtures.PETS_DOCKED)
    const second = await $.command.run(Fixtures.PETS_DOCKED)
    expect(first.text).toBe('동물 패널을 열었다')
    expect(second.text).toBe('동물 패널을 닫았다')
    expect(world.opened[0]?.columns).toBe(40)
    expect(world.closed).toEqual(['pets'])
  })

  test('the pane is one Raster as large as its body, and frames are blitted', KO, async ($, on) => {
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

  test('a pane smaller than 32 × 24 says how large it must be', KO, async ($, on) => {
    Fixtures.worldOf(on)
    await $.session.start(Fixtures.START)
    await $.command.run(Fixtures.PETS_DOCKED)
    const tree = await $.ui.render(Fixtures.paneOf(30, 30))
    expect(Fixtures.textOf(tree)).toContain('32열 × 24행 이상')
  })

  test('outside the terminal the pane says so instead of drawing a Raster', KO, async ($, on) => {
    Fixtures.worldOf(on)
    await $.session.start(Fixtures.START)
    await $.command.run(Fixtures.PETS_DOCKED)
    for (const surface of ['vscode', 'desktop'] as const) {
      const tree = await $.ui.render(Fixtures.paneOf(40, 30, surface))
      expect(Reflect.get(tree, 'type') === 'Raster').toBe(false)
      expect(Fixtures.textOf(tree)).toContain('터미널 패널에서만')
    }
  })

  test('a new prompt sets the dog running: the frames keep changing for a while', KO, async ($, on) => {
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

  test('/pets band is no longer a command: it answers with the usage and no band is drawn even if an old save turned it on', KO, async ($, on) => {
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

  test('at session start only the newest seven edit keys of other sessions stay, and edit values of an unknown version or shape are neither counted nor deleted', KO, async ($, on) => {
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

  test('/pets zoom switches to two-column dots and keeps the Raster size', KO, async ($, on) => {
    Fixtures.worldOf(on)
    await $.session.start(Fixtures.START)
    await $.command.run(Fixtures.PETS_DOCKED)
    await $.command.run(Fixtures.ZOOM)
    await $.command.run(Fixtures.ZOOM)
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

  test('/pets zoom starts at map view and cycles map view → far → 1 → 2 → map view, and zoom in · out move one step and stop at the ends', KO, async ($, on) => {
    Fixtures.worldOf(on)
    await $.session.start(Fixtures.START)
    const texts: string[] = []
    for (const e of [Fixtures.ZOOM, Fixtures.ZOOM, Fixtures.ZOOM, Fixtures.ZOOM, ZOOM_OUT, ZOOM_IN, ZOOM_IN, ZOOM_IN, ZOOM_IN]) texts.push(String((await $.command.run(e)).text))
    expect(texts).toEqual([
      '원거리로 넓게 보게 바꿨다',
      '도트 크기를 1 배로 바꿨다',
      '도트 크기를 2 배로 바꿨다',
      '맵 보기로 가장 넓게 보게 바꿨다',
      '이미 가장 넓게(맵 보기) 보고 있다',
      '원거리로 넓게 보게 바꿨다',
      '도트 크기를 1 배로 바꿨다',
      '도트 크기를 2 배로 바꿨다',
      '이미 가장 크게(2 배) 보고 있다',
    ])
    const bad = await $.command.run({ ...Fixtures.PETS, args: 'zoom far away' })
    expect(bad.text).toContain('/pets zoom in')
  })

  test('/pets zoom wide · far · 1 · 2 go straight to that step and save it, the same step says so, and another word shows the usage', KO, async ($, on) => {
    const world = Fixtures.worldOf(on)
    await $.session.start(Fixtures.START)
    const texts: string[] = []
    for (const args of ['zoom far', 'zoom 2', 'zoom 2', 'zoom 1', 'zoom wide', 'ZOOM  Far']) texts.push(String((await $.command.run({ ...Fixtures.PETS, args })).text))
    expect(texts).toEqual([
      '원거리로 넓게 보게 바꿨다',
      '도트 크기를 2 배로 바꿨다',
      '이미 2 배로 보고 있다',
      '도트 크기를 1 배로 바꿨다',
      '맵 보기로 가장 넓게 보게 바꿨다',
      '원거리로 넓게 보게 바꿨다',
    ])
    expect(world.store.get('scale')).toBe('far')
    expect((await $.command.run({ ...Fixtures.PETS, args: 'zoom 3' })).text).toContain('/pets zoom wide')
    expect(world.store.get('scale')).toBe('far')
  })

  test('the zoom is kept in the store: 2 and map view come back, a 1 or far saved before map view existed still reads as saved, and an unknown value is map view', KO, async ($, on) => {
    const world = Fixtures.worldOf(on)
    await $.session.start(Fixtures.START)
    for (let i = 0; i < 3; i++) await $.command.run(ZOOM_IN)
    await $.session.start(Fixtures.START)
    expect((await $.command.run(ZOOM_IN)).text).toBe('이미 가장 크게(2 배) 보고 있다')
    await $.command.run(Fixtures.ZOOM)
    expect(world.store.get('scale')).toBe('wide')
    await $.session.start(Fixtures.START)
    expect((await $.command.run(ZOOM_OUT)).text).toBe('이미 가장 넓게(맵 보기) 보고 있다')
    for (const [saved, out] of [[1, '원거리로 넓게 보게 바꿨다'], ['far', '맵 보기로 가장 넓게 보게 바꿨다'], ['huge', '이미 가장 넓게(맵 보기) 보고 있다']] as const) {
      world.store.set('scale', saved)
      await $.session.start(Fixtures.START)
      expect(`${saved} ${(await $.command.run(ZOOM_OUT)).text}`).toBe(`${saved} ${out}`)
    }
  })

  test('typing, a prompt typed during a turn, a subagent spawn, a compaction and a denied tool pass through unchanged while the pane is open', KO, async ($, on) => {
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

  test('/pets world lists the sets; an id or a Korean alias switches the colors and is stored; an unknown name changes nothing', KO, async ($, on) => {
    const world = Fixtures.worldOf(on)
    await $.session.start(Fixtures.START)
    await $.command.run(Fixtures.PETS_DOCKED)
    const paper = String(propsOf(await $.ui.render(Fixtures.paneOf(40, 30))).cells)
    const list = await $.command.run(WORLD(''))
    expect(list.text).toContain('지금 맵 세트: 모눈종이')
    for (const id of ['paper', 'meadow', 'mountain', 'forest', 'lake', 'beach', 'snow', 'desert', 'auto']) expect(list.text).toContain(id)
    expect((await $.command.run(WORLD('forest'))).text).toBe('맵 세트를 숲 세트로 바꿨다. 맵을 새로 만들고 동물을 새 자리에 두었다')
    const forest = String(propsOf(await $.ui.render(Fixtures.paneOf(40, 30))).cells)
    expect(forest === paper).toBe(false)
    expect(world.store.get('world')).toEqual({ v: 1, set: 'forest' })
    expect((await $.command.run(WORLD('초원'))).text).toBe('맵 세트를 초원 세트로 바꿨다. 맵을 새로 만들고 동물을 새 자리에 두었다')
    expect(world.store.get('world')).toEqual({ v: 1, set: 'meadow' })
    const bad = await $.command.run(WORLD('volcano'))
    expect(bad.text).toContain("'volcano' 라는 맵 세트는 없다")
    expect(bad.text).toContain('lake 호숫가')
    expect(world.store.get('world')).toEqual({ v: 1, set: 'meadow' })
    expect((await $.command.run(WORLD(''))).text).toContain('지금 맵 세트: 초원.')
  })

  test('/pets world auto picks a set other than graph paper from the session and keeps auto in the store', KO, async ($, on) => {
    const world = Fixtures.worldOf(on)
    await $.session.start(Fixtures.START)
    const auto = await $.command.run(WORLD('auto'))
    expect(auto.text).toContain('자동으로 바꿨다')
    expect(auto.text.includes('모눈종이')).toBe(false)
    expect(world.store.get('world')).toEqual({ v: 1, set: 'auto' })
    await $.session.start(Fixtures.START)
    expect((await $.command.run(WORLD(''))).text).toContain('(자동)')
  })

  test('a stored set comes back next session; an unknown set, version or shape falls back to graph paper and stays in the store', KO, async ($, on) => {
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

  test('/pets pet lists the breeds; an id or a Korean alias switches the dog and is stored; extra names are ignored; an unknown one changes nothing', KO, async ($, on) => {
    const world = Fixtures.worldOf(on)
    await $.session.start(Fixtures.START)
    await $.command.run(Fixtures.PETS_DOCKED)
    const white = String(propsOf(await $.ui.render(Fixtures.paneOf(40, 30))).cells)
    const list = await $.command.run(PET(''))
    expect(list.text).toContain('지금 동물: 흰 강아지')
    for (const id of ['dog', 'shiba', 'blackdog', 'dalmatian', 'brown', 'auto']) expect(list.text).toContain(id)
    expect((await $.command.run(PET('시바'))).text).toBe('동물을 바꿨다: 시바')
    expect(String(propsOf(await $.ui.render(Fixtures.paneOf(40, 30))).cells) === white).toBe(false)
    expect(world.store.get('pets')).toEqual({ v: 1, list: ['shiba'] })
    expect((await $.command.run(PET('dalmatian brown dog'))).text).toBe('동물을 바꿨다: 점박이. 지금은 한 마리만 두어 첫 번째만 썼다(2 개는 무시)')
    expect(world.store.get('pets')).toEqual({ v: 1, list: ['dalmatian'] })
    expect((await $.command.run(PET('unicorn'))).text).toContain("'unicorn' 라는 품종은 없다")
    expect(world.store.get('pets')).toEqual({ v: 1, list: ['dalmatian'] })
    const auto = await $.command.run(PET('auto'))
    expect(auto.text).toContain('자동으로 바꿨다')
    expect(auto.text.includes('흰 강아지')).toBe(false)
    expect(world.store.get('pets')).toEqual({ v: 1, list: 'auto' })
  })

  test('/pets pet 고양이 turns the pet into a cat that is stored and comes back next session, and the pane title stays pets', KO, async ($, on) => {
    const world = Fixtures.worldOf(on)
    await $.session.start(Fixtures.START)
    const list = await $.command.run(PET(''))
    for (const id of ['cat', 'cheese']) expect(list.text).toContain(id)
    await $.command.run(Fixtures.PETS_DOCKED)
    expect(world.opened.at(-1)?.title).toBe('pets')
    const dog = String(propsOf(await $.ui.render(Fixtures.paneOf(40, 30))).cells)
    expect((await $.command.run(PET('고양이'))).text).toBe('동물을 바꿨다: 회색 줄무늬 고양이')
    expect(String(propsOf(await $.ui.render(Fixtures.paneOf(40, 30))).cells) === dog).toBe(false)
    expect(world.store.get('pets')).toEqual({ v: 1, list: ['cat'] })
    expect((await $.command.run(Fixtures.PETS_DOCKED)).text).toBe('동물 패널을 닫았다')
    await $.session.start(Fixtures.START)
    expect((await $.command.run(PET(''))).text).toContain('지금 동물: 회색 줄무늬 고양이.')
    await $.command.run(Fixtures.PETS_DOCKED)
    expect(world.opened.at(-1)?.title).toBe('pets')
  })

  test('/pets pet 거북이, 오리, 펭귄 turn the pet into that swimming species, stored, and the pane title stays pets', KO, async ($, on) => {
    const world = Fixtures.worldOf(on)
    await $.session.start(Fixtures.START)
    const list = await $.command.run(PET(''))
    for (const id of ['turtle', 'duck', 'penguin']) expect(list.text).toContain(id)
    for (const [word, id, label] of [['거북이', 'turtle', '거북이'], ['오리', 'duck', '오리'], ['penguin', 'penguin', '펭귄']] as const) {
      expect((await $.command.run(PET(word))).text).toBe(`동물을 바꿨다: ${label}`)
      expect(world.store.get('pets')).toEqual({ v: 1, list: [id] })
      await $.command.run(Fixtures.PETS_DOCKED)
      expect(world.opened.at(-1)?.title).toBe('pets')
      expect((await $.command.run(Fixtures.PETS_DOCKED)).text).toBe('동물 패널을 닫았다')
    }
  })

  test('/pets pet 클로드 and 마스코트 turn the pet into the Claude mascot, stored, and the pane title stays pets', KO, async ($, on) => {
    const world = Fixtures.worldOf(on)
    await $.session.start(Fixtures.START)
    expect((await $.command.run(PET(''))).text).toContain('claude')
    for (const word of ['클로드', '마스코트', 'claude']) {
      expect((await $.command.run(PET(word))).text).toBe('동물을 바꿨다: Claude 마스코트')
      expect(world.store.get('pets')).toEqual({ v: 1, list: ['claude'] })
      await $.command.run(Fixtures.PETS_DOCKED)
      expect(world.opened.at(-1)?.title).toBe('pets')
      expect((await $.command.run(Fixtures.PETS_DOCKED)).text).toBe('동물 패널을 닫았다')
    }
  })

  test('a stored breed comes back next session; an unknown breed, version or shape falls back to the white dog and stays in the store', KO, async ($, on) => {
    const world = Fixtures.worldOf(on, { pets: { v: 1, list: ['blackdog'] } })
    await $.session.start(Fixtures.START)
    expect((await $.command.run(PET(''))).text).toContain('지금 동물: 검은 강아지.')
    for (const value of [{ v: 1, list: ['unicorn'] }, { v: 2, list: ['shiba'] }, ['shiba'], 'shiba']) {
      world.store.set('pets', value)
      await $.session.start(Fixtures.START)
      expect((await $.command.run(PET(''))).text).toContain('지금 동물: 흰 강아지.')
      expect(world.store.get('pets')).toEqual(value)
    }
  })

  test('map view and far zoom keep the Raster size and paint frames different from each other and from 1 ×', KO, async ($, on) => {
    Fixtures.worldOf(on)
    await $.session.start(Fixtures.START)
    await $.command.run(Fixtures.PETS_DOCKED)
    const frames: string[] = []
    for (let i = 0; i < 3; i++) {
      if (i > 0) await $.command.run(ZOOM_IN)
      const tree = await $.ui.render(Fixtures.paneOf(40, 30))
      expect(propsOf(tree).columns).toBe(40)
      expect(propsOf(tree).rows).toBe(30)
      frames.push(String(propsOf(tree).cells))
    }
    expect(frames.map(f => Fixtures.wordsOf(f).length)).toEqual([3600, 3600, 3600])
    expect(new Set(frames).size).toBe(3)
  })
})

const DO = (name: string) => ({ ...Fixtures.PETS, args: `do ${name}` })
const IDLE = (word: string) => ({ ...Fixtures.PETS, args: `idle ${word}` })

describe('register in English', () => {
  test('/pets opens and closes the pane with English replies', EN, async ($, on) => {
    Fixtures.worldOf(on)
    await $.session.start(Fixtures.START)
    expect((await $.command.run(Fixtures.PETS_DOCKED)).text).toBe('Opened the pets panel')
    expect((await $.command.run(Fixtures.PETS_DOCKED)).text).toBe('Closed the pets panel')
  })

  test('zoom, an unknown word and the size and surface notices are in English', EN, async ($, on) => {
    Fixtures.worldOf(on)
    await $.session.start(Fixtures.START)
    expect((await $.command.run(Fixtures.ZOOM)).text).toBe('Switched to far view')
    expect((await $.command.run({ ...Fixtures.PETS, args: 'zoom 2' })).text).toBe('Set the pixel size to 2x')
    expect((await $.command.run({ ...Fixtures.PETS, args: 'zoom 2' })).text).toBe('Already in 2x')
    expect((await $.command.run(ZOOM_IN)).text).toBe('Already at the largest view (2x)')
    expect((await $.command.run({ ...Fixtures.PETS, args: 'fly' })).text).toContain('/pets (open or close the panel)')
    await $.command.run(Fixtures.PETS_DOCKED)
    expect(Fixtures.textOf(await $.ui.render(Fixtures.paneOf(30, 30)))).toContain('at least 32 columns × 24 rows')
    expect(Fixtures.textOf(await $.ui.render(Fixtures.paneOf(40, 30, 'desktop')))).toContain('only in a terminal panel')
  })

  test('/pets world lists sets as id (label) and takes English and Korean aliases', EN, async ($, on) => {
    Fixtures.worldOf(on)
    await $.session.start(Fixtures.START)
    const list = (await $.command.run(WORLD(''))).text
    expect(list).toContain('Map set: grid paper. Sets: paper (grid paper), meadow, mountain, forest, lake (lakeside)')
    expect((await $.command.run(WORLD('grass'))).text).toBe('Switched the map set to meadow. Built a new map and placed the animal anew')
    expect((await $.command.run(WORLD('해변'))).text).toBe('Switched the map set to beach. Built a new map and placed the animal anew')
    expect((await $.command.run(WORLD('sea'))).text).toBe('Switched the map set to beach. Built a new map and placed the animal anew')
    expect((await $.command.run(WORLD('volcano'))).text).toContain("No map set named 'volcano'. Sets: ")
  })

  test('/pets pet lists breeds and takes English and Korean aliases', EN, async ($, on) => {
    Fixtures.worldOf(on)
    await $.session.start(Fixtures.START)
    expect((await $.command.run(PET(''))).text).toContain('Animal: white puppy. Breeds: dog (white puppy), shiba, blackdog (black puppy)')
    expect((await $.command.run(PET('ginger'))).text).toBe('Switched the animal to the ginger cat')
    expect((await $.command.run(PET('고양이'))).text).toBe('Switched the animal to the gray tabby cat')
    expect((await $.command.run(PET('dalmatian brown'))).text).toBe('Switched the animal to the spotted puppy. Only one animal is kept for now, so the first was used (1 ignored)')
    expect((await $.command.run(PET('unicorn'))).text).toContain("No breed named 'unicorn'")
  })

  test('/pets idle reports and switches stay-awake in English', EN, async ($, on) => {
    Fixtures.worldOf(on)
    await $.session.start(Fixtures.START)
    expect((await $.command.run(IDLE(''))).text).toBe('Stay-awake is off. After 3 min without signals the animal falls asleep and wakes 1 min later (turn it on with /pets idle on)')
    expect((await $.command.run(IDLE('on'))).text).toBe('Turned stay-awake on. The animal does not fall asleep without signals')
    expect((await $.command.run(IDLE('maybe'))).text).toBe('/pets idle (current state), /pets idle on · off')
  })

  test('auto with a Korean LANG and no settings language replies in Korean', async ($, on) => {
    Fixtures.worldOf(on)
    mock.env(on, { LANG: 'ko_KR.UTF-8' })
    await $.session.start(Fixtures.START)
    expect((await $.command.run(Fixtures.PETS_DOCKED)).text).toBe('동물 패널을 열었다')
  })

  test('en and ko messages carry the same keys of the same kind, and every label table covers every id', () => {
    const { en, ko } = Messages.MESSAGES
    expect(Object.keys(en).sort()).toEqual(Object.keys(ko).sort())
    for (const key of Object.keys(en) as Array<keyof typeof en>) expect(typeof en[key]).toBe(typeof ko[key])
    for (const table of ['setLabels', 'breedLabels', 'orderLabels'] as const) expect(Object.keys(en[table]).sort()).toEqual(Object.keys(ko[table]).sort())
  })
})

describe('/pets do', () => {
  test('without an action it lists the actions; an unknown one is refused; with the pane closed it asks to open it', EN, async ($, on) => {
    Fixtures.worldOf(on)
    await $.session.start(Fixtures.START)
    expect((await $.command.run(DO(''))).text).toBe('/pets do <action>. Actions: sleep, wake (wake up), sit, lie (lie down), play, ball (kick the ball), fetch (fetch the ball), zoomies (do zoomies), roam (wander far), explore (look around), come (come and sit)')
    expect((await $.command.run(DO('dance'))).text).toContain("No action named 'dance'. Actions: sleep")
    expect((await $.command.run(DO('sit'))).text).toBe('The pets panel is closed. Open it with /pets, then give the order again')
  })

  test('an id or an English or Korean alias gives the order; a refusal says why', EN, async ($, on) => {
    Fixtures.worldOf(on)
    await $.session.start(Fixtures.START)
    await $.command.run(Fixtures.PETS_DOCKED)
    expect((await $.command.run(DO('앉아'))).text).toBe('Ordered the animal to sit')
    expect((await $.command.run(DO('down'))).text).toBe('Ordered the animal to lie down')
    expect((await $.command.run(DO('wake'))).text).toBe('Already awake')
  })

  test('the Korean replies name the action by its Korean label', KO, async ($, on) => {
    Fixtures.worldOf(on)
    await $.session.start(Fixtures.START)
    await $.command.run(Fixtures.PETS_DOCKED)
    expect((await $.command.run(DO('sit'))).text).toBe('동물에게 시켰다: 앉기')
    expect((await $.command.run(DO('깨기'))).text).toBe('이미 깨어 있다')
    expect((await $.command.run(DO(''))).text).toContain('/pets do <행동>. 시킬 수 있는 행동: sleep 자기, wake 깨기')
  })
})
