import { mock } from 'claude-code/testing'
import type { On } from 'claude-code'

export type World = {
  opened: Array<Record<string, unknown>>
  closed: string[]
  blits: Array<{ requestId: string; key: string; cells: string; columns?: number; rows?: number }>
  clock: ReturnType<typeof mock.clock>
  // 플러그인의 $.store 가 읽고 쓰는 값
  store: Map<string, unknown>
}

// store: 세션이 시작할 때 저장소에 들어 있는 값, theme: Claude Code 테마 설정 값
export function worldOf(on: On, store: Readonly<Record<string, unknown>> = {}, theme = 'dark'): World {
  const world: World = { opened: [], closed: [], blits: [], clock: mock.clock(on, { now: 1_000_000 }), store: new Map(Object.entries(store)) }
  on('store.get', ($, e) => ({ value: world.store.get(e.key) }))
  on('store.set', ($, e) => { world.store.set(e.key, e.value); return { value: undefined } })
  on('store.keys', () => ({ value: [...world.store.keys()] }))
  on('store.delete', ($, e) => { world.store.delete(e.key); return { value: undefined } })
  on('config.list', () => ({ value: [{ key: 'theme', label: 'Theme', kind: 'choice', value: theme, provider: { kind: 'engine' }, isLocked: false }] }) as never)
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
