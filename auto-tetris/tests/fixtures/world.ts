import { mock } from 'claude-code/testing'
import type { On } from 'claude-code'

export type World = {
  opened: Array<Record<string, unknown>>
  closed: string[]
  blits: Array<{ cells: string; columns?: number; rows?: number }>
  clock: ReturnType<typeof mock.clock>
}

export function worldOf(on: On): World {
  const world: World = { opened: [], closed: [], blits: [], clock: mock.clock(on, { now: 1_000_000 }) }
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('command.register', ($, e) => ({ value: { command: e.name } }))
  on('ui.open', ($, e) => { world.opened.push({ ...e }); return { value: undefined } })
  on('ui.close', ($, e) => { world.closed.push(e.id); return { value: undefined } })
  on('ui.invalidate', () => ({ value: undefined }))
  on('ui.blit', ($, e) => { world.blits.push({ cells: 'cells' in e ? e.cells : '', columns: e.columns, rows: e.rows }); return { value: {} } })
  return world
}

export const START = { surface: 'terminal', isInteractive: true, cwd: 'D:/work' } as const
export const TETRIS = { command: 'tetris', args: '', origin: { kind: 'composer' } } as const
export const TETRIS_DOCKED = { ...TETRIS, presentation: { isFullscreen: true, columns: 160 } } as const

export function paneOf(columns: number, rows: number, surface: 'terminal' | 'desktop' = 'terminal') {
  return {
    component: 'Pane', surface, requestId: 'tetris', viewport: { columns: 160, rows: 50 },
    props: { title: 'TETRIS', isFocused: false, bodyColumns: columns, placement: 'dock', scroll: { offset: 0, bodyRows: rows }, view: {} },
  } as const
}
