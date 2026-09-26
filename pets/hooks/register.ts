import type { On, Timer } from 'claude-code'

import Band from './band'
import Names from './names'
import Pet from './pet'
import Rng from './rng'
import Scene, { type Zoom } from './scene'
import View from './view'

type Host = {
  now: () => Promise<number>
  every: (ms: number, fn: () => void) => Timer
  blit: (requestId: string, key: string, cells: string, cols: number, rows: number) => Promise<{ deny?: string }>
  invalidate: () => void
  store: (key: string, value: unknown) => Promise<void>
}

type Mount = { requestId: string; cols: number; rows: number; lastCells: string; lastAt: number }

// 세션 신호로 강아지를 움직이는 일은 부가 기능이다. 여기서 난 오류가 세션의 스트림·도구 호출을 막지 않게 삼킨다
function safely(fn: () => void): void {
  try { fn() } catch { /* 강아지 쪽 오류는 무시한다 */ }
}

export function register(on: On) {
  let host: Host | undefined
  let isOpen = false
  let isBandOn = false
  let zoom: Zoom = 1
  let scene = Scene.create(0x5eed, 0)
  let band = Band.create(0x5eed, 0)
  let timer: Timer | undefined
  let timerMs = 0
  let pane: Mount | undefined
  let strip: Mount | undefined
  let isWorking = false
  let lastAt: number | undefined

  // 패널이 열려 있으면 강아지가 반응하고, 닫혀 있으면 신호 시각만 적는다(시뮬레이션도 멈춰 있다)
  function signal(now: number, react: () => void): void {
    safely(() => {
      if (isOpen) react()
      else scene.pet.lastSignalAt = now
    })
  }

  async function paint(h: Host, m: Mount, key: string, cells: string, now: number): Promise<void> {
    m.lastAt = now
    if (cells === m.lastCells) return
    m.lastCells = cells
    const result = await h.blit(m.requestId, key, cells, m.cols, m.rows)
    // 크기가 바뀌었거나 아직 붙지 않았다: 다시 그려 달라고 한다
    if (result.deny !== undefined) { m.lastCells = ''; h.invalidate() }
  }

  async function onFrame() {
    const h = host
    if (!h) return
    const now = await h.now()
    const dt = lastAt === undefined ? 0 : now - lastAt
    lastAt = now
    const p = pane
    if (isOpen && p) {
      Scene.step(scene, dt, now)
      if (now - p.lastAt >= Scene.renderEveryMs(scene) - 1) await paint(h, p, Names.RASTER_KEY, Scene.compose(scene, p.cols, p.rows, zoom), now)
    }
    const s = strip
    if (isBandOn && s) {
      Band.step(band, dt, now, isWorking)
      if (now - s.lastAt >= Band.renderEveryMs(band) - 1) await paint(h, s, Names.BAND_KEY, Band.compose(band, s.cols), now)
    }
  }

  // 타이머는 하나만 둔다. 패널이 열려 있으면 33 ms, 띠만 있으면 66 ms, 둘 다 없으면 멈춘다
  function syncTimer() {
    const want = isOpen && pane ? Names.FRAME_MS : isBandOn && strip ? Names.BAND_ONLY_FRAME_MS : 0
    if (want === timerMs) return
    timer?.cancel()
    timer = undefined
    timerMs = want
    lastAt = undefined
    if (want > 0 && host) timer = host.every(want, () => { void onFrame() })
  }

  on('session.start', async ($, e, next) => {
    host = {
      now: () => $.clock.now(),
      every: (ms, fn) => $.clock.every(ms, fn),
      blit: (requestId, key, cells, columns, rows) => $.ui.blit({ requestId, key, cells, columns, rows }),
      invalidate: () => $.ui.invalidate('ui.render'),
      store: (key, value) => $.store.set(key, value),
    }
    const now = await $.clock.now()
    let seed = (now | 0) ^ 0x5eed
    try { seed = Rng.hashOf(await $.session.id()) } catch { /* 시각으로 만든 시드 그대로 */ }
    scene = Scene.create(seed, now)
    band = Band.create(seed, now)
    try {
      isBandOn = (await $.store.get(Names.STORE_BAND)) === true
      zoom = Scene.zoomOf(await $.store.get(Names.STORE_SCALE))
    } catch { /* 저장한 값이 없으면 기본값 */ }
    await $.command.register({ name: Names.COMMAND_NAME, description: Names.COMMAND_DESCRIPTION })
    return next(e)
  })

  on('command.run', { command: Names.COMMAND_NAME }, async ($, e) => {
    const [arg = '', sub = '', ...rest] = e.args.trim().toLowerCase().split(/\s+/)
    if (arg === 'band' && sub === '') {
      isBandOn = !isBandOn
      if (!isBandOn) strip = undefined
      await host?.store(Names.STORE_BAND, isBandOn)
      $.ui.invalidate('ui.render')
      syncTimer()
      return { text: isBandOn ? Names.BAND_SHOWN_TEXT : Names.BAND_HIDDEN_TEXT }
    }
    // zoom 은 원거리 → 1 배 → 2 배 를 돌고, zoom in · out 은 한 단계씩 가다 끝에서 멈춘다
    if (arg === 'zoom' && (sub === '' || sub === 'in' || sub === 'out') && rest.length === 0) {
      const next = sub === '' ? Scene.zoomNext(zoom) : Scene.zoomBy(zoom, sub === 'in' ? 1 : -1)
      if (next === zoom) return { text: Names.ZOOM_LIMIT_TEXT(zoom) }
      zoom = next
      await host?.store(Names.STORE_SCALE, zoom)
      if (pane) pane.lastCells = ''
      $.ui.invalidate('ui.render')
      return { text: Names.ZOOM_TEXT(zoom) }
    }
    if (arg !== '') return { text: Names.USAGE_TEXT }
    if (isOpen) {
      await $.ui.close({ id: Names.PANE_ID })
      isOpen = false
      pane = undefined
      syncTimer()
      return { text: Names.PANEL_HIDDEN_TEXT }
    }
    const docked = e.presentation?.isFullscreen === true
    await $.ui.open(docked
      ? { id: Names.PANE_ID, title: Names.PANE_TITLE, holdToasts: true, columns: Names.COLS }
      : { id: Names.PANE_ID, title: Names.PANE_TITLE, holdToasts: true, rows: Names.INLINE_ROWS })
    isOpen = true
    // 패널을 여는 것도 신호로 친다. 오래 닫아 두었다 열었을 때 강아지가 보자마자 잠자리로 가지 않는다
    scene.pet.lastSignalAt = await $.clock.now()
    return { text: Names.PANEL_SHOWN_TEXT }
  })

  on('ui.close', { id: Names.PANE_ID }, async ($, e, next) => {
    const result = await next(e)
    if (result.deny === undefined) { isOpen = false; pane = undefined; syncTimer() }
    return result
  })

  on('ui.render', { component: 'Pane' }, async ($, e, next) => {
    if (e.requestId !== Names.PANE_ID) return next(e)
    const cols = e.props.bodyColumns
    const rows = e.props.scroll.bodyRows
    // Raster 는 터미널 표면에만 있다. 요소 표에 이름이 있는지로는 가를 수 없어 표면으로 가른다
    if (e.surface !== 'terminal') {
      pane = undefined
      syncTimer()
      return View.noticeView($.ui.resolve(e), View.NOT_TERMINAL_LINES)
    }
    const kit = $.ui.resolve(e)
    if (cols < Names.MIN_COLS || rows < Names.MIN_ROWS) {
      pane = undefined
      syncTimer()
      return View.noticeView(kit, View.tooSmallLines(cols, rows))
    }
    const now = await $.clock.now()
    const cells = Scene.compose(scene, cols, rows, zoom)
    pane = { requestId: e.requestId, cols, rows, lastCells: cells, lastAt: now }
    if (isOpen) syncTimer()
    return View.rasterView(kit.Raster, Names.RASTER_KEY, cols, rows, cells)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    isWorking = e.props.isWorking
    // 설문이 띠를 쓰는 동안이나 띠가 3 행이 안 될 때는 비켜 준다
    if (!isBandOn || e.props.hasSurvey || e.props.maxRows < Names.BAND_ROWS) {
      strip = undefined
      syncTimer()
      return next(e)
    }
    if (e.surface !== 'terminal') return next(e)
    const kit = $.ui.resolve(e)
    const cols = Math.max(1, Math.min(512, e.props.bodyColumns))
    const now = await $.clock.now()
    const cells = Band.compose(band, cols)
    strip = { requestId: e.requestId, cols, rows: Names.BAND_ROWS, lastCells: cells, lastAt: now }
    syncTimer()
    return View.rasterView(kit.Raster, Names.BAND_KEY, cols, Names.BAND_ROWS, cells)
  })

  on('turn.start', async ($, e, next) => {
    try {
      const now = await $.clock.now()
      isWorking = true
      signal(now, () => Scene.onTurnStart(scene, now, e.text))
      safely(() => Band.onTurnStart(band, now))
    } catch { /* 강아지 쪽 오류는 무시한다 */ }
    return next(e)
  })

  // 글이 흐르는 동안은 바쁜 것으로 본다(걷기·킁킁 비중이 오른다). 조각마다 시계를 읽지 않고 응답 시작과 조각 16 개마다 적는다
  async function markBusy(now: () => Promise<number>): Promise<void> {
    try {
      const t = await now()
      safely(() => { Pet.onStream(scene.pet, t); band.lastSignalAt = t })
    } catch { /* 시계를 못 읽으면 이번에는 건너뛴다 */ }
  }

  // 메인 루프 생각 조각은 첫 조각과 16 개마다 시각을 읽어 넘긴다. 글·도구 조각이 오면 생각이 끝난 것이다
  async function markThinking(now: () => Promise<number>): Promise<void> {
    try {
      const t = await now()
      signal(t, () => Pet.onThinkPiece(scene.pet, scene.world, t))
    } catch { /* 시계를 못 읽으면 이번에는 건너뛴다 */ }
  }

  on('turn.step', async function* ($, e, next) {
    const clock = () => $.clock.now()
    const isMain = e.agentId === undefined
    await markBusy(clock)
    const stream = next(e)
    let pieces = 0
    let thoughts = 0
    for await (const chunk of stream) {
      if ((chunk.kind === 'text' || chunk.kind === 'thinking' || chunk.kind === 'input') && ++pieces % 16 === 0) await markBusy(clock)
      if (isMain && chunk.kind === 'thinking' && thoughts++ % 16 === 0) await markThinking(clock)
      if (isMain && (chunk.kind === 'text' || chunk.kind === 'tool') && thoughts > 0) {
        thoughts = 0
        safely(() => Pet.onThinkEnd(scene.pet))
      }
      yield chunk
    }
    return await stream.result
  })

  // 메인 턴 끝에는 끝난 이유대로 반응하고, 서브에이전트의 턴 끝에는 잠깐 사람 쪽만 본다
  on('turn.complete', async ($, e, next) => {
    try {
      const now = await $.clock.now()
      if (e.agentId === undefined) {
        isWorking = false
        signal(now, () => Scene.onTurnEnd(scene, now, e.reason, e.durationMs))
        safely(() => Band.onTurnEnd(band, now))
      } else {
        signal(now, () => Pet.onSubagentEnd(scene.pet, scene.world, now))
      }
    } catch { /* 강아지 쪽 오류는 무시한다 */ }
    return next(e)
  })

  // 타이핑·턴 도중 입력은 키 입력 경로라 시계를 기다리지 않고 마지막 프레임 시각을 쓴다. 패널이 닫혀 있으면 아무것도 하지 않는다
  on('prompt.edit', async ($, e, next) => {
    const t = lastAt
    if (isOpen && t !== undefined) safely(() => Pet.onTyping(scene.pet, scene.world, t))
    return next(e)
  })

  on('prompt.submit', async ($, e, next) => {
    const t = lastAt
    if (isOpen && t !== undefined && e.turnId !== undefined && e.origin.kind === 'composer') safely(() => Pet.onPromptQueued(scene.pet, scene.world, t))
    return next(e)
  })

  on('agent.spawn', async ($, e, next) => {
    try {
      const now = await $.clock.now()
      signal(now, () => Pet.onSubagentStart(scene.pet, scene.world, now))
    } catch { /* 강아지 쪽 오류는 무시한다 */ }
    return next(e)
  })

  // 사람이 부른 압축과 자동 압축만. 미리 계산해 두는 압축과 서브에이전트의 압축은 넘긴다
  on('session.compact', async ($, e, next) => {
    if (e.agentId === undefined && (e.trigger === 'manual' || e.trigger === 'auto')) {
      try {
        const now = await $.clock.now()
        signal(now, () => Pet.onCompact(scene.pet, scene.world, now))
      } catch { /* 강아지 쪽 오류는 무시한다 */ }
    }
    return next(e)
  })

  // 메인 루프 도구는 이름에 따라 반응하고 오류·거부에도 반응한다. 서브에이전트 도구는 얼굴만 돌린다
  on('tool.call', async ($, e, next) => {
    const isMain = e.agentId === undefined
    let started = false
    try {
      const now = await $.clock.now()
      safely(() => Pet.onToolStart(scene.pet, now, isMain))
      signal(now, () => isMain ? Scene.onTool(scene, now, e.tool) : Pet.onSubTool(scene.pet, now))
      safely(() => { Band.onToolStart(band, now); Band.onTool(band, now) })
      started = true
    } catch { /* 강아지 쪽 오류는 무시한다 */ }
    try {
      const result = await next(e)
      const fail = result.deny !== undefined ? 'deny' : result.isError === true ? 'error' : undefined
      if (isMain && fail) {
        try {
          const now = await $.clock.now()
          signal(now, () => Pet.onToolFail(scene.pet, scene.world, now, fail))
        } catch { /* 강아지 쪽 오류는 무시한다 */ }
      }
      return result
    } finally {
      // 도구가 도는 동안은 프레임마다 마지막 신호 시각이 갱신되므로 끝날 때는 세기만 줄인다
      if (started) {
        safely(() => {
          Pet.onToolEnd(scene.pet, scene.pet.lastSignalAt, isMain)
          Band.onToolEnd(band, band.lastSignalAt)
        })
      }
    }
  })
}
