import type { On, Timer } from 'claude-code'

import Frame from './frame'
import Game from './game'
import Meter from './meter'
import Names from './names'
import View from './view'

type Host = {
  now: () => Promise<number>
  every: (ms: number, fn: () => void) => Timer
  blit: (cells: string, cols: number, rows: number) => Promise<{ deny?: string }>
  invalidate: () => void
}

export function register(on: On) {
  let host: Host | undefined
  let isOpen = false
  let game = Game.create(0x1b873593)
  const meter = Meter.create()
  let timer: Timer | undefined
  let mounted: { cols: number; rows: number } | undefined
  let lastCells = ''
  let lastAt: number | undefined

  // 수를 둔다. 애니메이션 중이면 쌓아 두고, 애니메이션이 끝나 바쁘지 않으면 이어서 둔다
  function play() {
    if (Game.isBusy(game)) return
    let moves = Meter.takeMoves(meter, Names.TOKENS_PER_MOVE, Names.MAX_BACKLOG_MOVES)
    while (moves > 0) {
      if (!Game.move(game)) break
      moves--
      if (Game.isBusy(game)) break
    }
    if (moves > 0) Meter.refund(meter, moves, Names.TOKENS_PER_MOVE)
  }

  // 패널이 닫혀 있으면 애니메이션을 기다리지 않고 바로 끝낸다(보는 사람이 없다)
  function playClosed() {
    for (let i = 0; i < 4 && Game.isBusy(game); i++) Game.advance(game, Game.OVER_MS)
    play()
    if (Game.isBusy(game)) Game.advance(game, Game.OVER_MS)
  }

  function frameOf(cols: number, rows: number, now: number): string {
    return Frame.encode(Frame.compose({ game, meter, cols, rows, now }))
  }

  async function onFrame() {
    const h = host
    if (!h || !isOpen || !mounted) return
    const now = await h.now()
    const dt = lastAt === undefined ? 0 : Math.min(1000, Math.max(0, now - lastAt))
    lastAt = now
    Meter.tick(meter, now)
    Game.advance(game, dt)
    play()
    const cells = frameOf(mounted.cols, mounted.rows, now)
    if (cells === lastCells) return
    lastCells = cells
    const result = await h.blit(cells, mounted.cols, mounted.rows)
    // 크기가 바뀌었거나 아직 붙지 않았다: 다시 그려 달라고 한다
    if (result.deny !== undefined) { lastCells = ''; h.invalidate() }
  }

  function startFrames() {
    if (timer || !host) return
    timer = host.every(Names.FRAME_MS, () => { void onFrame() })
  }

  function stopFrames() {
    timer?.cancel()
    timer = undefined
    mounted = undefined
    lastAt = undefined
  }

  on('session.start', async ($, e, next) => {
    host = {
      now: () => $.clock.now(),
      every: (ms, fn) => $.clock.every(ms, fn),
      blit: (cells, columns, rows) => $.ui.blit({ requestId: Names.PANE_ID, key: Names.RASTER_KEY, cells, columns, rows }),
      invalidate: () => $.ui.invalidate('ui.render'),
    }
    game = Game.create(((await $.clock.now()) | 0) ^ 0x1b873593)
    await $.command.register({ name: Names.COMMAND_NAME, description: Names.COMMAND_DESCRIPTION })
    return next(e)
  })

  on('command.run', { command: Names.COMMAND_NAME }, async ($, e) => {
    if (isOpen) {
      await $.ui.close({ id: Names.PANE_ID })
      isOpen = false
      stopFrames()
      return { text: Names.PANEL_HIDDEN_TEXT }
    }
    const docked = e.presentation?.isFullscreen === true
    await $.ui.open(docked
      ? { id: Names.PANE_ID, title: Names.PANE_TITLE, holdToasts: true, columns: Names.COLS }
      : { id: Names.PANE_ID, title: Names.PANE_TITLE, holdToasts: true, rows: Names.INLINE_ROWS })
    isOpen = true
    Meter.resetRate(meter)
    return { text: Names.PANEL_SHOWN_TEXT }
  })

  on('ui.close', { id: Names.PANE_ID }, async ($, e, next) => {
    const result = await next(e)
    if (result.deny === undefined) { isOpen = false; stopFrames() }
    return result
  })

  on('ui.render', { component: 'Pane' }, async ($, e, next) => {
    if (e.requestId !== Names.PANE_ID) return next(e)
    const kit = $.ui.resolve(e)
    const cols = e.props.bodyColumns
    const rows = e.props.scroll.bodyRows
    if (!('Raster' in kit)) {
      mounted = undefined
      return View.noticeView(kit, View.NOT_TERMINAL_LINES)
    }
    if (cols < Names.COLS || rows < Names.MIN_ROWS) {
      mounted = undefined
      return View.noticeView(kit, View.tooSmallLines(cols, rows))
    }
    const cells = frameOf(cols, rows, await $.clock.now())
    mounted = { cols, rows }
    lastCells = cells
    if (isOpen) startFrames()
    return View.rasterView(kit.Raster, cols, rows, cells)
  })

  on('turn.start', ($, e, next) => {
    Meter.onTurn(meter, e.turnId)
    return next(e)
  })

  on('turn.step', async function* ($, e, next) {
    const step = `${e.agentId ?? 'main'}:${e.turnId}:${e.index}`
    Meter.onTurn(meter, e.turnId)
    Meter.onStepStart(meter, step, await $.clock.now())
    const stream = next(e)
    for await (const chunk of stream) {
      if (chunk.kind === 'text' || chunk.kind === 'thinking') Meter.onText(meter, step, chunk.kind, chunk.text)
      else if (chunk.kind === 'input') Meter.onInput(meter, step, chunk.json)
      else if (chunk.kind === 'tool') { Meter.onToolChunk(meter); Game.drop(game) }
      else if (chunk.kind === 'stop') Meter.onStop(meter, step, chunk.usage, await $.clock.now())
      if (!isOpen) playClosed()
      yield chunk
    }
    return await stream.result
  })

  on('turn.complete', ($, e, next) => {
    Meter.onTurnEnd(meter, e.turnId)
    return next(e)
  })

  on('tool.call', async ($, e, next) => {
    Meter.onToolStart(meter)
    try {
      return await next(e)
    } finally {
      Meter.onToolEnd(meter)
    }
  })
}
