import { mock } from 'claude-code/testing'
import type { On } from 'claude-code'

export type World = {
  opened: Array<Record<string, unknown>>
  closed: string[]
  blits: Array<{ requestId: string; key: string; cells: string; columns?: number; rows?: number }>
  clock: ReturnType<typeof mock.clock>
}

export function worldOf(on: On): World {
  const world: World = { opened: [], closed: [], blits: [], clock: mock.clock(on, { now: 1_000_000 }) }
  mock.store(on)
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('command.register', ($, e) => ({ value: { command: e.name } }))
  on('ui.open', ($, e) => { world.opened.push({ ...e }); return { value: undefined } })
  on('ui.close', ($, e) => { world.closed.push(e.id); return { value: undefined } })
  on('ui.invalidate', () => ({ value: undefined }))
  on('turn.start', ($, e) => ({ turnId: e.turnId }))
  on('turn.complete', () => ({ text: '' }))
  on('ui.blit', ($, e) => { world.blits.push({ requestId: e.requestId, key: e.key, cells: 'cells' in e ? e.cells : '', columns: e.columns, rows: e.rows }); return { value: {} } })
  return world
}

export const START = { surface: 'terminal', isInteractive: true, cwd: 'D:/work' } as const
export const PETS = { command: 'pets', args: '', origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 160 } } as const
export const PETS_DOCKED = { ...PETS, presentation: { isFullscreen: true, columns: 160 } } as const
export const BAND = { ...PETS, args: 'band' } as const
export const ZOOM = { ...PETS, args: 'zoom' } as const

export function paneOf(columns: number, rows: number, surface: 'terminal' | 'desktop' | 'vscode' = 'terminal') {
  return {
    component: 'Pane', surface, requestId: 'pets', viewport: { columns: 160, rows: 50 },
    props: { title: '강아지', isFocused: false, bodyColumns: columns, placement: 'dock', scroll: { offset: 0, bodyRows: rows }, view: {} },
  } as const
}

export function bandOf(columns: number, maxRows: number, hasSurvey = false) {
  return {
    component: 'AbovePrompt', surface: 'terminal', requestId: 'above-prompt', viewport: { columns: 160, rows: 50 },
    props: { hasSurvey, isWorking: false, maxRows, bodyColumns: columns, scroll: { offset: 0, bodyRows: maxRows }, view: {} },
  } as const
}
