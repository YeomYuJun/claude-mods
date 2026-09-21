import { mock } from 'claude-code/testing'
import type { AgentInfo, On, SessionMessage } from 'claude-code'

export type World = {
  files: Record<string, string>
  messages: SessionMessage[]
  live: AgentInfo[]
  opened: string[]
  closed: string[]
  toolCalls: Array<Record<string, unknown>>
  calls: Record<string, number>
  clock: ReturnType<typeof mock.clock>
}

export type Seed = Partial<Pick<World, 'files' | 'messages' | 'live'>>

export const CWD = 'D:/work'
export const SESSION_ID = 'S1'
export const PROFILE = 'C:/Users/u'
export const SESSION_DIR = `${PROFILE}/.claude/projects/D--work/${SESSION_ID}`

function childrenOf(files: Record<string, string>, dir: string) {
  const prefix = `${dir}/`
  const seen = new Map<string, { name: string; kind: 'file' | 'dir'; size: number; isLink: false }>()
  for (const [path, text] of Object.entries(files)) {
    if (!path.startsWith(prefix)) continue
    const rest = path.slice(prefix.length)
    const [name, ...deeper] = rest.split('/')
    if (!name) continue
    seen.set(name, deeper.length > 0
      ? { name, kind: 'dir', size: 0, isLink: false }
      : { name, kind: 'file', size: text.length, isLink: false })
  }
  return [...seen.values()]
}

function isDirIn(files: Record<string, string>, path: string) {
  return Object.keys(files).some(key => key.startsWith(`${path}/`))
}

export function worldOf(on: On, seed: Seed = {}): World {
  const world: World = {
    files: seed.files ?? {},
    messages: seed.messages ?? [],
    live: seed.live ?? [],
    opened: [],
    closed: [],
    toolCalls: [],
    calls: {},
    clock: mock.clock(on, { now: 1_000_000 }),
  }
  const counted = (name: string) => { world.calls[name] = (world.calls[name] ?? 0) + 1 }
  mock.env(on, { USERPROFILE: PROFILE })
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('command.register', ($, e) => ({ value: { command: e.name } }))
  on('session.id', () => ({ value: SESSION_ID }))
  on('session.messages', () => ({ value: world.messages }))
  on('session.model', () => ({ value: 'claude-opus-5[1m]' }))
  on('session.usage', () => ({ value: { context: { tokens: 262_300, window: 1_000_000 }, rateLimits: [] } }))
  on('agent.list', () => { counted('agent.list'); return { value: world.live } })
  on('fs.exists', ($, e) => ({ value: e.path in world.files || isDirIn(world.files, e.path) }))
  on('fs.list', ($, e) => ({ value: childrenOf(world.files, e.path) }))
  on('fs.read', ($, e) => ({ value: world.files[e.path] ?? '' }))
  on('ui.open', ($, e) => { world.opened.push(e.id); return { value: undefined } })
  on('ui.close', ($, e) => { world.closed.push(e.id); return { value: undefined } })
  on('ui.invalidate', () => ({ value: undefined }))
  on('ui.focus', () => ({}))
  on('tool.call', { tool: 'TaskStop' }, ($, e) => { world.toolCalls.push(e); return { result: { message: 'stopped', task_id: String(e.task_id), task_type: 'local_agent' } } })
  return world
}

export const START = { surface: 'terminal', isInteractive: true, cwd: CWD } as const
export const TRACE = { command: 'trace', args: '', origin: { kind: 'composer' } } as const
