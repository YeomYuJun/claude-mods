import type { FsStat, On, Timer } from 'claude-code'

import Names from './names'
import Parse from './parse'
import Target, { type Target as TargetValue } from './target'
import Views, { type TodoView } from './views'

type Host = {
  cwd: () => Promise<string>
  stat: (path: string) => Promise<FsStat | undefined>
  read: (path: string) => Promise<string>
  every: (ms: number, fn: () => void) => Timer
  invalidate: () => void
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export function register(on: On) {
  let host: Host | undefined
  let isOpen = false
  let target: TargetValue = { kind: 'cwd' }
  let view: TodoView | undefined
  let signature = ''
  let poll: Timer | undefined
  let isReading = false
  let isForcePending = false

  async function pathOf(h: Host): Promise<string> {
    return target.kind === 'cwd' ? Target.join(await h.cwd(), Names.FILE_NAME) : target.path
  }

  // 수정 시각과 크기가 그대로면 다시 읽지 않는다. 경로가 바뀌었거나 force 면 읽는다.
  // 타이머의 읽기가 도는 중에 온 force 는 버리지 않고 그 읽기가 끝난 뒤 한 번 더 읽는다.
  async function refresh(h: Host, force = false) {
    if (isReading) {
      if (force) isForcePending = true
      return
    }
    isReading = true
    try {
      const path = await pathOf(h)
      const stat = await h.stat(path)
      const next = stat ? `${stat.kind}:${stat.mtimeMs}:${stat.size}` : 'missing'
      if (!force && view?.path === path && next === signature) return
      signature = next
      if (!stat || stat.kind !== 'file') view = { kind: 'missing', path }
      else if (stat.size > Names.MAX_READ_BYTES) view = { kind: 'large', path, size: stat.size }
      else {
        try {
          view = { kind: 'doc', path, doc: Parse.todoOf(await h.read(path)) }
        } catch (error) {
          view = { kind: 'error', path, message: messageOf(error) }
        }
      }
      h.invalidate()
    } finally {
      isReading = false
    }
    if (isForcePending) {
      isForcePending = false
      await refresh(h, true)
    }
  }

  function stopPoll() {
    poll?.cancel()
    poll = undefined
  }

  function startPoll(h: Host) {
    poll ??= h.every(Names.POLL_MS, () => { void refresh(h) })
  }

  async function afterEdit(path: string) {
    if (isOpen && host && view && Target.isSameFile(path, view.path)) await refresh(host, true)
  }

  on('session.start', async ($, e, next) => {
    host = {
      cwd: () => $.session.cwd(),
      stat: async path => {
        try {
          return await $.fs.stat(path)
        } catch {
          return undefined
        }
      },
      read: path => $.fs.read(path),
      every: (ms, fn) => $.clock.every(ms, fn),
      invalidate: () => $.ui.invalidate('ui.render'),
    }
    await $.command.register({ name: Names.COMMAND_NAME, description: Names.COMMAND_DESCRIPTION })
    return next(e)
  })

  // 인자 없이 부르면 cwd 의 TODO.md 를 보고, 이미 그것을 보고 있으면 닫는다.
  // 경로를 주면 감시 대상을 그 파일 하나로 바꾼다. 폴더를 주면 그 안의 TODO.md 를 본다.
  on('command.run', { command: Names.COMMAND_NAME }, async ($, e) => {
    if (!host) return { text: Names.PANEL_HIDDEN_TEXT }
    const arg = Target.argOf(e.args)
    if (arg === '') {
      if (isOpen && target.kind === 'cwd') {
        await $.ui.close({ id: Names.PANE_ID })
        isOpen = false
        stopPoll()
        return { text: Names.PANEL_HIDDEN_TEXT }
      }
      target = { kind: 'cwd' }
    } else {
      const path = Target.resolve(await host.cwd(), arg)
      const stat = await host.stat(path)
      target = { kind: 'file', path: stat?.kind === 'dir' ? Target.join(path, Names.FILE_NAME) : path }
    }
    await refresh(host, true)
    await $.ui.open({ id: Names.PANE_ID, title: Names.PANE_TITLE })
    isOpen = true
    startPoll(host)
    return { text: `${Names.PANEL_SHOWN_TEXT}: ${await pathOf(host)}` }
  })

  on('ui.close', { id: Names.PANE_ID }, async ($, e, next) => {
    const result = await next(e)
    if (result.deny === undefined) {
      isOpen = false
      stopPoll()
    }
    return result
  })

  on('ui.render', { component: 'Pane' }, ($, e, next) => {
    if (e.requestId !== Names.PANE_ID || !view) return next(e)
    const { Box, Text } = $.ui.resolve(e)
    return Views.todoView({ kit: { Box, Text }, view })
  })

  on('tool.call', { tool: 'Edit' }, async ($, e, next) => {
    const result = await next(e)
    await afterEdit(e.file_path)
    return result
  })

  on('tool.call', { tool: 'Write' }, async ($, e, next) => {
    const result = await next(e)
    await afterEdit(e.file_path)
    return result
  })
}
