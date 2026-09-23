import { describe, expect, test } from 'claude-code/testing'

import PaneState from '../hooks/pane-state'

describe('pane-state', () => {
  test('open and back', () => {
    const opened = PaneState.reduce(PaneState.INITIAL, { type: 'open', id: 'a1' })
    expect(opened.detail).toBe('a1')
    expect(PaneState.reduce(opened, { type: 'back' }).detail).toBeUndefined()
  })

  test('toggle folds and unfolds', () => {
    const folded = PaneState.reduce(PaneState.INITIAL, { type: 'toggle', id: 'b' })
    expect(folded.collapsed.has('b')).toBe(true)
    expect(PaneState.reduce(folded, { type: 'toggle', id: 'b' }).collapsed.has('b')).toBe(false)
  })

  test('density flips from what is shown', () => {
    expect(PaneState.reduce(PaneState.INITIAL, { type: 'density', current: 'normal' }).density).toBe('compact')
    expect(PaneState.reduce(PaneState.INITIAL, { type: 'density', current: 'compact' }).density).toBe('normal')
  })

  test('scroll stays inside the content', () => {
    const down = PaneState.reduce(PaneState.INITIAL, { type: 'scroll', by: 5, max: 3 })
    expect(down.top).toBe(3)
    expect(PaneState.reduce(down, { type: 'scroll', by: -10, max: 3 }).top).toBe(0)
  })

  test('the prompt opens and closes, and a new detail starts closed', () => {
    const opened = PaneState.reduce({ ...PaneState.INITIAL, detail: 'a1' }, { type: 'prompt' })
    expect(opened.isPromptOpen).toBe(true)
    expect(PaneState.reduce(opened, { type: 'prompt' }).isPromptOpen).toBe(false)
    const copied = PaneState.reduce(opened, { type: 'copied' })
    expect(PaneState.reduce(copied, { type: 'open', id: 'a2' })).toMatchObject({ isPromptOpen: false, isCopied: false })
  })

  test('a tab change leaves the detail and the scroll', () => {
    const state = { ...PaneState.INITIAL, detail: 'a1', top: 4 }
    expect(PaneState.reduce(state, { type: 'tab', tab: 'files' })).toMatchObject({ tab: 'files', detail: undefined, top: 0 })
  })
})
