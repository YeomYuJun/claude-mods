import type { Density } from '../layout'

export type Tab = 'flow' | 'files'
export type PaneState = { tab: Tab; detail?: string; collapsed: ReadonlySet<string>; density?: Density; top: number }
export type PaneAction =
  | { type: 'tab'; tab: Tab }
  | { type: 'open'; id: string }
  | { type: 'back' }
  | { type: 'toggle'; id: string }
  | { type: 'density'; current: Density }
  | { type: 'scroll'; by: number; max: number }

export const INITIAL: PaneState = { tab: 'flow', collapsed: new Set(), top: 0 }

export function reduce(state: PaneState, action: PaneAction): PaneState {
  switch (action.type) {
    case 'tab':
      return { ...state, tab: action.tab, detail: undefined, top: 0 }
    case 'open':
      return { ...state, detail: action.id, top: 0 }
    case 'back':
      return { ...state, detail: undefined, top: 0 }
    case 'toggle': {
      const collapsed = new Set(state.collapsed)
      if (collapsed.has(action.id)) collapsed.delete(action.id)
      else collapsed.add(action.id)
      return { ...state, collapsed }
    }
    case 'density':
      return { ...state, density: action.current === 'normal' ? 'compact' : 'normal' }
    case 'scroll':
      return { ...state, top: Math.min(Math.max(0, state.top + action.by), Math.max(0, action.max)) }
  }
}
