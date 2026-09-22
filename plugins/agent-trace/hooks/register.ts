import type { AgentInfo, FsEntry, On, SessionMessage, Timer } from 'claude-code'

import Collect from './collect'
import type { TraceModel } from './model'
import Names from './names'
import PaneState, { type PaneAction } from './pane-state'
import Reader, { type ReadCache } from './reader'
import Views from './views'

type Host = {
  now: () => Promise<number>
  every: (ms: number, fn: () => void) => Timer
  envConfigDir: () => Promise<string | undefined>
  envUserProfile: () => Promise<string | undefined>
  envHome: () => Promise<string | undefined>
  sessionId: () => Promise<string>
  messages: () => Promise<SessionMessage[]>
  usage: () => Promise<{ context: { tokens?: number } }>
  model: () => Promise<string | undefined>
  agents: () => Promise<AgentInfo[]>
  fsExists: (path: string) => Promise<boolean>
  fsList: (path: string) => Promise<FsEntry[]>
  fsRead: (path: string) => Promise<string>
  invalidate: () => void
  taskStop: (id: string) => void
}

export function register(on: On) {
  let host: Host | undefined
  let isOpen = false
  let sessionDir: string | undefined
  let cwd = ''
  let state = PaneState.INITIAL
  let maxTop = 0
  let model: TraceModel | undefined
  let poll: Timer | undefined
  const cache: ReadCache = new Map()
  const firstSeen = new Map<string, number>()
  const nowTools = new Map<string, string>()

  async function dirOf(h: Host): Promise<string> {
    const configDir = await h.envConfigDir()
    const profile = (await h.envUserProfile()) ?? (await h.envHome()) ?? ''
    return Reader.sessionDirOf({ configDir: configDir ?? `${profile}/.claude`, cwd, sessionId: await h.sessionId() })
  }

  async function refresh(h: Host) {
    sessionDir ??= await dirOf(h)
    const [messages, usage, sessionModel, live, now] = await Promise.all([
      h.messages(), h.usage(), h.model(), h.agents(), h.now(),
    ])
    const rootId = await h.sessionId()
    const read = await Reader.readSession({ exists: path => h.fsExists(path), list: path => h.fsList(path), read: path => h.fsRead(path) }, sessionDir, cache)
    model = Collect.traceOf({
      rootId, rootLabel: 'main', model: sessionModel, contextTokens: usage.context.tokens,
      main: Collect.mainOf({ rootId, messages, firstSeen, now }),
      agents: read.agents, workflows: read.workflows, live, nowTools, now,
    })
    h.invalidate()
    const isRunning = model.nodes.some(node => node.kind !== 'session' && node.kind !== 'team' && node.status === 'running')
    if (isRunning && !poll) poll = h.every(Names.POLL_MS, () => { if (host) void refresh(host) })
    if (!isRunning && poll) { poll.cancel(); poll = undefined }
  }

  function withNowTools(current: TraceModel): TraceModel {
    return {
      ...current,
      nodes: current.nodes.map(node => node.status === 'running' && nowTools.has(node.id) ? { ...node, nowTool: nowTools.get(node.id) } : node),
    }
  }

  function act(action: PaneAction) {
    state = PaneState.reduce(state, action)
    host?.invalidate()
  }

  function reset() {
    isOpen = false
    state = PaneState.INITIAL
    model = undefined
    sessionDir = undefined
    cache.clear()
    firstSeen.clear()
    nowTools.clear()
    poll?.cancel()
    poll = undefined
  }

  on('session.start', async ($, e, next) => {
    cwd = e.cwd
    host = {
      now: () => $.clock.now(),
      every: (ms, fn) => $.clock.every(ms, fn),
      envConfigDir: () => $.env.get('CLAUDE_CONFIG_DIR'),
      envUserProfile: () => $.env.get('USERPROFILE'),
      envHome: () => $.env.get('HOME'),
      sessionId: () => $.session.id(),
      messages: () => $.session.messages(),
      usage: () => $.session.usage(),
      model: () => $.session.model(),
      agents: () => $.agent.list(),
      fsExists: path => $.fs.exists(path),
      fsList: path => $.fs.list(path),
      fsRead: path => $.fs.read(path),
      invalidate: () => $.ui.invalidate('ui.render'),
      taskStop: id => { void $.tool.call({ tool: 'TaskStop', task_id: id }) },
    }
    await $.command.register({ name: Names.COMMAND_NAME, description: Names.COMMAND_DESCRIPTION })
    return next(e)
  })

  on('command.run', { command: Names.COMMAND_NAME }, async ($, e) => {
    if (isOpen) {
      await $.ui.close({ id: Names.PANE_ID })
      isOpen = false
      poll?.cancel()
      poll = undefined
      return { text: Names.PANEL_HIDDEN_TEXT }
    }
    if (host) await refresh(host)
    const docked = e.presentation?.isFullscreen === true
    await $.ui.open(docked
      ? { id: Names.PANE_ID, title: Names.PANE_TITLE, holdToasts: true }
      : { id: Names.PANE_ID, title: Names.PANE_TITLE, holdToasts: true, focus: true, closeOnEscape: true, rows: 24 })
    isOpen = true
    return { text: Names.PANEL_SHOWN_TEXT }
  })

  on('command.run', { command: ['clear', 'resume'] }, async ($, e, next) => {
    const result = await next(e)
    if (isOpen) await $.ui.close({ id: Names.PANE_ID })
    reset()
    return result
  })

  on('ui.close', { id: Names.PANE_ID }, async ($, e, next) => {
    if (state.detail !== undefined && e.origin.kind === 'person') {
      act({ type: 'back' })
      return { deny: '상세에서 흐름으로 돌아간다' }
    }
    const result = await next(e)
    if (result.deny === undefined) {
      isOpen = false
      poll?.cancel()
      poll = undefined
    }
    return result
  })

  on('ui.render', { component: 'Pane' }, async ($, e, next) => {
    if (e.requestId !== Names.PANE_ID || !model) return next(e)
    const { Box, Text, Button, Markdown } = $.ui.resolve(e)
    const now = await $.clock.now()
    const view = Views.paneView({
      kit: { Box, Text, Button, Markdown }, model: withNowTools(model), state, width: e.props.bodyColumns, rows: e.props.scroll.bodyRows,
      now, act, canStop: true, stop: id => host?.taskStop(id),
    })
    maxTop = Math.max(0, view.maxTop)
    return view.tree
  })

  on('ui.scroll', { requestId: Names.PANE_ID }, ($, e, next) => {
    if (e.origin.kind !== 'person' || state.detail !== undefined || state.tab !== 'flow') return next(e)
    act({ type: 'scroll', by: e.by, max: maxTop })
    return {}
  })

  on('tool.call', async ($, e, next) => {
    if (e.agentId) nowTools.set(e.agentId, e.tool)
    try {
      return await next(e)
    } finally {
      if (e.agentId && nowTools.get(e.agentId) === e.tool) nowTools.delete(e.agentId)
      if (isOpen && !e.agentId && Names.REFRESH_TOOLS.includes(e.tool) && host) void refresh(host)
    }
  })
}
