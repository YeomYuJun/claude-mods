import type { AgentInfo, FsEntry, On, SessionMessage, Timer } from 'claude-code'

import Collect from './collect'
import type { StopNote, TraceModel } from './model'
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
  taskStop: (target: string, label: string) => Promise<StopNote>
}

// TaskStop 은 결과를 { message, task_id, ... } 로 주고, 엔진의 text 는 그 JSON 문자열이다.
function messageOf(value: unknown): string | undefined {
  if (typeof value === 'string') {
    try {
      return messageOf(JSON.parse(value) as unknown) ?? value
    } catch {
      return value
    }
  }
  if (value && typeof value === 'object') {
    const message = Reflect.get(value, 'message')
    return typeof message === 'string' ? message : undefined
  }
  return undefined
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
  let hint: { isFullscreen: boolean; columns: number } | undefined
  let closedByPerson = false
  const cache: ReadCache = new Map()
  const firstSeen = new Map<string, number>()
  const nowTools = new Map<string, string>()
  const stopNotes = new Map<string, StopNote>()
  const stopped = new Map<string, number>()

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
      agents: read.agents, workflows: read.workflows, live, nowTools, stopped, now,
    })
    h.invalidate()
    const isRunning = model.nodes.some(node => node.kind !== 'session' && node.kind !== 'team' && node.status === 'running')
    if (isRunning && !poll) poll = h.every(Names.POLL_MS, () => { if (host) void refresh(host) })
    if (!isRunning && poll) { poll.cancel(); poll = undefined }
  }

  function withNowTools(current: TraceModel): TraceModel {
    return {
      ...current,
      nodes: current.nodes.map(node => {
        const withTool = node.status === 'running' && nowTools.has(node.id) ? { ...node, nowTool: nowTools.get(node.id) } : node
        const stopNote = stopNotes.get(node.id)
        return stopNote ? { ...withTool, stopNote } : withTool
      }),
    }
  }

  async function stop(id: string) {
    const node = model?.nodes.find(item => item.id === id)
    if (!host || !node) return
    // 팀원을 기록 파일 이름의 id 로 부르면 TaskStop 이 검증 오류를 낸다. 이름이 있으면 이름으로 부른다.
    const note = await host.taskStop(node.name ?? id, node.label)
    stopNotes.set(id, note)
    if (!note.isError) stopped.set(id, await host.now())
    await refresh(host)
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
    stopNotes.clear()
    stopped.clear()
    closedByPerson = false
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
      taskStop: async (target, label) => {
        const result = await $.tool.call({ tool: 'TaskStop', task_id: target, consent: `The user pressed "Stop agent" for ${label} in the agent-trace panel` })
        if (result.deny !== undefined) return { text: result.deny, isError: true }
        const text = messageOf(result.result) ?? messageOf(result.text) ?? ''
        return { text: text.trim().split('\n')[0] ?? '', isError: result.isError === true }
      },
    }
    await $.command.register({ name: Names.COMMAND_NAME, description: Names.COMMAND_DESCRIPTION })
    return next(e)
  })

  on('command.run', { command: Names.COMMAND_NAME }, async ($, e) => {
    if (isOpen) {
      await $.ui.close({ id: Names.PANE_ID })
      isOpen = false
      closedByPerson = true
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
    closedByPerson = false
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
      if (e.origin.kind === 'person') closedByPerson = true
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
      now, act, canStop: true, stop: id => { void stop(id) },
    })
    maxTop = Math.max(0, view.maxTop)
    return view.tree
  })

  on('ui.scroll', { requestId: Names.PANE_ID }, ($, e, next) => {
    if (e.origin.kind !== 'person' || state.detail !== undefined || state.tab !== 'flow') return next(e)
    act({ type: 'scroll', by: e.by, max: maxTop })
    return {}
  })

  on('ui.render', { component: 'PromptHint' }, ($, e, next) => {
    if (e.viewport) hint = { isFullscreen: e.viewport.isFullscreen === true, columns: e.viewport.columns }
    return next(e)
  })

  on('tool.call', async ($, e, next) => {
    if (e.agentId) nowTools.set(e.agentId, e.tool)
    try {
      return await next(e)
    } finally {
      if (e.agentId && nowTools.get(e.agentId) === e.tool) nowTools.delete(e.agentId)
      if (isOpen && !e.agentId && Names.REFRESH_TOOLS.includes(e.tool) && host) void refresh(host)
      if (isOpen && e.agentId && !poll && host) void refresh(host)
      const shouldOpen = !isOpen && !closedByPerson && !e.agentId && Names.AUTO_OPEN_TOOLS.includes(e.tool)
        && hint?.isFullscreen === true && hint.columns >= Names.AUTO_OPEN_COLUMNS
      if (shouldOpen && host) {
        isOpen = true
        const opening = host
        void refresh(opening).then(() => $.ui.open({ id: Names.PANE_ID, title: Names.PANE_TITLE, holdToasts: true }))
      }
    }
  })
}
