// 프롬프트 위 띠(AbovePrompt): 3 행 = 세로 6 픽셀짜리 옆모습 강아지가 가로로 걷고, 앉고, 킁킁대고, 잔다(순수 모듈).
// 패널의 강아지와 상태를 나누지 않는다. 세션 신호는 같은 것을 받는다.

import Names from '../names'
import Pixel, { Palette, type Buffer, type Grid } from '../pixel'
import Rng from '../rng'

type Mode = 'idle' | 'walk' | 'run' | 'sit' | 'sniff' | 'sleep'

export type Band = {
  x: number
  // 1 = 오른쪽, -1 = 왼쪽
  dir: 1 | -1
  mode: Mode
  targetX: number
  // 지금 모드가 끝나는 시각까지 남은 시간(ms). 걷기·뛰기는 목적지에 닿으면 끝난다
  left: number
  // 걸은 거리(px). 발 모양을 거리로 바꾼다
  walked: number
  clock: number
  zAt: number
  rng: Rng.Rng
  lastSignalAt: number
  toolsRunning: number
  lastSniffAt: number
  width: number
  buf?: Buffer
  grid?: Grid
}

const H = Names.BAND_ROWS * 2
const FLOOR_Y = H - 1
const WALK_PX_S = 9
const RUN_PX_S = 24
const SNIFF_GAP_MS = 1500

// 띠는 패널 세트·품종 색 표를 빌리지 않고 자기 번호 표와 색 표로 접는다
export const FLOOR = 1
export const BODY = 2
export const UNDER = 3
export const LINE = 4
export const EYE = 5
export const EAR = 6
export const EAR_DARK = 7
export const COLLAR = 8
export const Z = 9
// 띠의 바탕은 터미널 기본색(대개 어둡다)이라 패널처럼 진한 윤곽을 쓰면 묻힌다.
// 몸은 흰색·밝은 회색으로 채우고 다리는 중간 회색으로 그려 어두운 바탕과 밝은 바탕 모두에서 읽히게 한다.
// 패널 강아지와 같은 개로 보이도록 늘어진 귀·꼬리는 갈색(두 칸 꼬리의 끝은 짙은 갈색), 목줄은 빨간색이다
export const RGB: readonly number[] = [
  Palette.DEFAULT_COLOR, 0x8f8b8d, 0xfdfdfd, 0xd9d6d7, 0xa29ea0, 0x141212, 0xc47f4a, 0x8e5433, 0xe2433b, 0xa29ea0,
]
const CODE: Record<string, number> = { w: BODY, s: UNDER, l: LINE, k: EYE, e: EAR, d: EAR_DARK, c: COLLAR }

type Frame = { w: number; rows: readonly string[] }

// 오른쪽 보기, 아래 줄이 바닥 바로 위(y = 4). 가로 가운데가 x.
// 글자: . 투명  w 흰 털  s 그늘  l 다리  k 눈·코  e 귀·꼬리(갈색)  d 꼬리 끝(짙은 갈색)  c 목줄
const WALK_A: Frame = { w: 9, rows: ['......ww.', 'd....wekw', '.ewwwcewk', '.sssssss.', '.l.l..l.l'] }
const WALK_B: Frame = { w: 9, rows: ['......ww.', 'd....wekw', '.ewwwcewk', '.sssssss.', '..l.l.l.l'] }
const RUN_A: Frame = { w: 9, rows: ['......ww.', '.....wekw', 'ewwwwcewk', '.sssssss.', 'l.......l'] }
const RUN_B: Frame = { w: 9, rows: ['......ww.', 'd....wekw', '.ewwwcewk', '.sssssss.', '...ll.l..'] }
const SNIFF: Frame = { w: 9, rows: ['.........', 'd........', '.ewwwcew.', '.sssssewk', '.l.l..l..'] }
const SIT_A: Frame = { w: 8, rows: ['.....ww.', '....wekw', '...wcewk', 'e.swwws.', '.ssssss.'] }
const SIT_B: Frame = { w: 8, rows: ['.....ww.', '....wekw', '...wcewk', '..swwws.', 'essssss.'] }
const SLEEP: Frame = { w: 9, rows: ['.........', '.........', '...wwwew.', '.ewwwcewk', '.sssssss.'] }

export function create(seed: number, now: number): Band {
  const rng = Rng.create(seed ^ 0xba5d)
  return { x: 20, dir: 1, mode: 'idle', targetX: 20, left: 1500, walked: 0, clock: 0, zAt: 0, rng, lastSignalAt: now, toolsRunning: 0, lastSniffAt: -Infinity, width: 80 }
}

function go(band: Band, mode: 'walk' | 'run', minFrac: number): void {
  const lo = 6
  const hi = Math.max(lo + 1, band.width - 7)
  let x = Rng.range(band.rng, lo, hi)
  for (let i = 0; i < 6 && Math.abs(x - band.x) < band.width * minFrac; i++) x = Rng.range(band.rng, lo, hi)
  band.targetX = x
  band.dir = x >= band.x ? 1 : -1
  band.mode = mode
}

function next(band: Band, isWorking: boolean): void {
  const pick = Rng.weighted(band.rng, [['walk', isWorking ? 50 : 35], ['idle', 25], ['sit', isWorking ? 8 : 20], ['sniff', 15]] as const)
  if (pick === 'walk') { go(band, 'walk', 0.1); return }
  band.mode = pick
  band.left = pick === 'idle' ? Rng.range(band.rng, 1500, 4000) : pick === 'sit' ? Rng.range(band.rng, 3000, 6000) : Rng.range(band.rng, 1200, 2200)
}

export function onTurnStart(band: Band, now: number): void {
  band.lastSignalAt = now
  go(band, 'run', 0.25)
}

export function onTool(band: Band, now: number): void {
  band.lastSignalAt = now
  if (band.mode === 'sleep' || band.mode === 'run' || now - band.lastSniffAt < SNIFF_GAP_MS) return
  band.lastSniffAt = now
  band.mode = 'sniff'
  band.left = 1000
}

export function onTurnEnd(band: Band, now: number): void {
  band.lastSignalAt = now
  if (band.mode === 'sleep') return
  band.mode = 'sit'
  band.left = 5000
}

export function onToolStart(band: Band, now: number): void {
  band.lastSignalAt = now
  band.toolsRunning++
}

export function onToolEnd(band: Band, now: number): void {
  band.lastSignalAt = now
  band.toolsRunning = Math.max(0, band.toolsRunning - 1)
}

export function step(band: Band, dtMs: number, now: number, isWorking: boolean): void {
  const dt = Math.min(Names.MAX_CATCHUP_MS, Math.max(0, dtMs))
  band.clock += dt
  if (band.toolsRunning > 0 || isWorking) band.lastSignalAt = Math.max(band.lastSignalAt, now - 1)
  band.x = Math.min(Math.max(band.x, 5), Math.max(5, band.width - 6))
  if (band.mode !== 'sleep' && now - band.lastSignalAt >= Names.SLEEP_AFTER_MS) { band.mode = 'sleep'; band.zAt = band.clock }
  if (band.mode === 'walk' || band.mode === 'run') {
    const v = band.mode === 'run' ? RUN_PX_S : WALK_PX_S
    const move = Math.min(Math.abs(band.targetX - band.x), (v * dt) / 1000)
    band.x += band.dir * move
    band.walked += move
    if (Math.abs(band.targetX - band.x) < 0.01) { band.mode = 'idle'; band.left = Rng.range(band.rng, 800, 2000) }
    return
  }
  if (band.mode === 'sleep') return
  band.left -= dt
  if (band.left <= 0) next(band, isWorking)
}

function frameOf(band: Band): Frame {
  switch (band.mode) {
    case 'walk': return Math.floor(band.walked / 3) % 2 === 0 ? WALK_A : WALK_B
    case 'run': return Math.floor(band.walked / 4) % 2 === 0 ? RUN_A : RUN_B
    case 'sniff': return SNIFF
    case 'sit': return Math.floor(band.clock / 250) % 2 === 0 ? SIT_A : SIT_B
    case 'sleep': return SLEEP
    case 'idle': return Math.floor(band.clock / 600) % 5 === 0 ? WALK_B : WALK_A
  }
}

// 다음 그리기까지 간격
export function renderEveryMs(band: Band): number {
  if (band.mode === 'walk' || band.mode === 'run') return 66
  if (band.mode === 'sleep') return 400
  return 150
}

function buffersFor(band: Band, cols: number): [Buffer, Grid] {
  const b = band.buf
  const g = band.grid
  if (b && g && g.cols === cols) return [b, g]
  const nb = Pixel.bufferOf(cols, Names.BAND_ROWS, 1)
  const ng = Pixel.gridOf(cols, Names.BAND_ROWS)
  band.buf = nb
  band.grid = ng
  return [nb, ng]
}

export function compose(band: Band, cols: number): string {
  band.width = cols
  const [b, g] = buffersFor(band, cols)
  Pixel.clear(b)
  // 바닥 점선
  for (let x = 0; x < cols; x += 2) Pixel.plot(b, x, FLOOR_Y, FLOOR)
  const f = frameOf(band)
  const left = Math.round(band.x) - Math.floor(f.w / 2)
  const top = FLOOR_Y - f.rows.length
  f.rows.forEach((row, y) => {
    for (let i = 0; i < row.length; i++) {
      const c = CODE[row[i]!]
      if (c === undefined) continue
      const x = band.dir === 1 ? left + i : left + (f.w - 1 - i)
      Pixel.plot(b, x, top + y, c)
    }
  })
  if (band.mode === 'sleep') {
    // z 가 머리 위로 한 칸씩 올라갔다 사라진다
    const phase = Math.floor((band.clock - band.zAt) / 700) % 3
    const hx = Math.round(band.x) + band.dir * 3
    if (phase < 2) Pixel.plot(b, hx + band.dir * phase, 1 - phase, Z)
  }
  Pixel.fold(b, g, RGB)
  return Pixel.encode(g)
}

export * as default from '.'
