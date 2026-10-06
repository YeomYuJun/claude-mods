import { describe, expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'

import Messages, { type Language } from '../hooks/messages'
import Views, { type TodoView } from '../hooks/views'

function el(type: string) {
  return (props: Record<string, unknown> | null) => {
    const { children, ...rest } = (props ?? {}) as Record<string, unknown> & { children?: unknown }
    const kids = children === undefined ? [] : Array.isArray(children) ? children : [children]
    return { type, props: rest, children: kids }
  }
}
const KIT = { Box: el('Box'), Text: el('Text') } as unknown as Parameters<typeof Views.todoView>[0]['kit']

function textOf(node: unknown): string {
  if (node === null || node === undefined || typeof node === 'boolean') return ''
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(textOf).join('')
  const { children } = node as { children?: unknown }
  return textOf(children)
}

const DOC: TodoView = {
  kind: 'doc',
  path: 'D:/work/TODO.md',
  doc: { done: 1, total: 2, lines: [{ kind: 'item', text: 'a', isDone: true, depth: 0 }, { kind: 'item', text: 'b', isDone: false, depth: 0 }] },
} as unknown as TodoView

function viewText(language: Language, view: TodoView): string {
  return textOf(Views.todoView({ kit: KIT, messages: Messages.messagesOf(language), view }))
}

const START = { surface: 'terminal', isInteractive: true, cwd: 'D:/work' } as const

function worldOf(on: On, settings: Record<string, unknown> = {}) {
  const registered: Array<{ description: string; argumentHint?: string }> = []
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('settings.read', () => ({ value: settings }))
  on('command.register', ($, e) => {
    registered.push({ description: e.description, argumentHint: e.argumentHint })
    return { value: { command: e.name } }
  })
  return registered
}

describe('messages', () => {
  test('en and ko carry the same keys of the same kind', () => {
    const { en, ko } = Messages.MESSAGES
    expect(Object.keys(en).sort()).toEqual(Object.keys(ko).sort())
    for (const key of Object.keys(en) as Array<keyof typeof en>) expect(typeof en[key]).toBe(typeof ko[key])
  })

  test('languageOfText reads names and LANG values by their start', () => {
    expect(Messages.languageOfText('ko_KR.UTF-8')).toBe('ko')
    expect(Messages.languageOfText('Korean')).toBe('ko')
    expect(Messages.languageOfText('한국어')).toBe('ko')
    expect(Messages.languageOfText('en_US.UTF-8')).toBe('en')
    expect(Messages.languageOfText('English')).toBe('en')
    expect(Messages.languageOfText('C.UTF-8')).toBeUndefined()
    expect(Messages.languageOfText('japanese')).toBeUndefined()
    expect(Messages.languageOfText('kok')).toBeUndefined()
    expect(Messages.languageOfText(undefined)).toBeUndefined()
  })

  test('languageOf takes a fixed option first, then the first candidate it can read, then English', () => {
    expect(Messages.languageOf('ko', ['English'])).toBe('ko')
    expect(Messages.languageOf('auto', [undefined, 'C', 'ko_KR.UTF-8'])).toBe('ko')
    expect(Messages.languageOf('auto', ['english', 'ko_KR.UTF-8'])).toBe('en')
    expect(Messages.languageOf('auto', [undefined, undefined, undefined])).toBe('en')
    expect(Messages.languageOf(undefined)).toBe('en')
  })
})

describe('view in both languages', () => {
  test('the head line counts done items in each language', () => {
    expect(viewText('ko', DOC)).toContain('D:/work/TODO.md · 1/2 완료')
    expect(viewText('en', DOC)).toContain('D:/work/TODO.md · 1/2 done')
  })

  test('missing, large and unreadable files are told in each language', () => {
    expect(viewText('ko', { kind: 'missing', path: 'x' })).toContain('파일이 없다')
    expect(viewText('en', { kind: 'missing', path: 'x' })).toContain('File not found')
    expect(viewText('ko', { kind: 'large', path: 'x', size: 2 * 1024 * 1024 })).toContain('파일이 2048 KiB 라 읽지 않는다')
    expect(viewText('en', { kind: 'large', path: 'x', size: 2 * 1024 * 1024 })).toContain('File is 2048 KiB, too large to read')
    expect(viewText('en', { kind: 'error', path: 'x', message: 'EACCES' })).toContain('Could not read: EACCES')
  })
})

describe('command language', () => {
  test('language ko registers the Korean description and hint', { options: { language: 'ko' } }, async ($, on) => {
    const registered = worldOf(on)
    await $.session.start(START)
    expect(registered[0]?.description).toBe(Messages.MESSAGES.ko.commandDescription)
    expect(registered[0]?.argumentHint).toBe('[경로]')
  })

  test('language en registers the English description even under a Korean LANG', { options: { language: 'en' } }, async ($, on) => {
    const registered = worldOf(on)
    mock.env(on, { LANG: 'ko_KR.UTF-8' })
    await $.session.start(START)
    expect(registered[0]?.description).toBe(Messages.MESSAGES.en.commandDescription)
    expect(registered[0]?.argumentHint).toBe('[path]')
  })

  test('auto follows the settings language before LANG', async ($, on) => {
    const registered = worldOf(on, { language: 'korean' })
    mock.env(on, { LANG: 'en_US.UTF-8' })
    await $.session.start(START)
    expect(registered[0]?.description).toBe(Messages.MESSAGES.ko.commandDescription)
  })

  test('auto reads LC_ALL before LANG', async ($, on) => {
    const registered = worldOf(on)
    mock.env(on, { LC_ALL: 'en_US.UTF-8', LANG: 'ko_KR.UTF-8' })
    await $.session.start(START)
    expect(registered[0]?.description).toBe(Messages.MESSAGES.en.commandDescription)
  })

  test('auto reads LANG when LC_ALL is unset', async ($, on) => {
    const registered = worldOf(on)
    mock.env(on, { LANG: 'ko_KR.UTF-8' })
    await $.session.start(START)
    expect(registered[0]?.description).toBe(Messages.MESSAGES.ko.commandDescription)
  })

  test('auto with nothing to read is English', async ($, on) => {
    const registered = worldOf(on)
    mock.env(on, {})
    await $.session.start(START)
    expect(registered[0]?.description).toBe(Messages.MESSAGES.en.commandDescription)
  })
})

describe('before the session starts', () => {
  test('/todo says the plugin is still loading instead of claiming it closed the panel', { options: { language: 'ko' } }, async ($) => {
    const { text } = await $.command.run({ command: 'todo', args: '', origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 120 } })
    expect(text).toBe(Messages.MESSAGES.ko.notReady)
  })
})
