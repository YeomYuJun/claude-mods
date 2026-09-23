// 게임과 토큰 미터를 고정 폭 24 열 화면 한 장으로 그린다.

import Game, { type Game as GameState } from '../game'
import Meter, { type Meter as MeterState, type Status } from '../meter'
import Names from '../names'
import { DEFAULT_COLOR, gridOf, put, text, type Grid } from './grid.js'

const HALF_TOP = 0x2580 // ▀
const SHADE = 0x2591 // ░
const H_LINE = 0x2500
const V_LINE = 0x2502
const TL = 0x250c
const TR = 0x2510
const BL = 0x2514
const BR = 0x2518
const BAR = 0x258d // ▍
const SPARK = [0x2581, 0x2582, 0x2583, 0x2584, 0x2585, 0x2586, 0x2587, 0x2588]

const WELL = 0x141414
const FRAME = 0x3d3d3d
const LABEL = 0x7a7a7a
const VALUE = 0xe8e6e1
const ACCENT = 0xecb25c
const SPARK_DIM = 0x7d6238
const WHITE = 0xf0f0eb

export const PIECE_COLORS = [0x5bc0de, 0xf2c14e, 0xb388eb, 0x8bd17c, 0xe56b6f, 0x5b8def, 0xf0a35e]

const STATUS_VIEW: Record<Status, { word: string; color: number }> = {
  streaming: { word: 'streaming', color: 0x8bd17c },
  thinking: { word: 'thinking', color: 0xb388eb },
  tool: { word: 'tool call', color: 0xf2c14e },
  waiting: { word: 'waiting', color: LABEL },
  idle: { word: 'idle', color: LABEL },
}

function mix(a: number, b: number, t: number): number {
  const ch = (shift: number) => Math.round(((a >> shift) & 255) * (1 - t) + ((b >> shift) & 255) * t)
  return (ch(16) << 16) | (ch(8) << 8) | ch(0)
}

function lighter(c: number): number {
  return mix(c, 0xffffff, 0.18)
}

export function tokensOf(count: number): string {
  const n = Math.max(0, Math.round(count))
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`
  return String(n)
}

// 보드 한 칸 = 2 열. ▀ 의 전경(위 절반)을 밝게, 배경(아래 절반)을 기본색으로 칠해 입체감을 준다
function block(g: Grid, x: number, y: number, color: number): void {
  put(g, x, y, HALF_TOP, lighter(color), color)
  put(g, x + 1, y, HALF_TOP, lighter(color), color)
}

function row(g: Grid, x0: number, y: number, label: string, value: string, color: number): void {
  text(g, x0 + 2, y, label, LABEL)
  text(g, x0 + 22 - value.length, y, value, color)
}

export type FrameInput = { game: GameState; meter: MeterState; cols: number; rows: number; now: number }

export function compose(input: FrameInput): Grid {
  const { game, meter, cols, rows, now } = input
  const g = gridOf(cols, rows)
  const x0 = Math.max(0, Math.floor((cols - Names.COLS) / 2))
  const bx = x0 + 2
  const by = 1
  const blink = Math.floor(now / 400) % 2 === 0

  // 테두리와 우물
  put(g, x0 + 1, 0, TL, FRAME)
  put(g, x0 + 22, 0, TR, FRAME)
  put(g, x0 + 1, 21, BL, FRAME)
  put(g, x0 + 22, 21, BR, FRAME)
  for (let x = x0 + 2; x < x0 + 22; x++) { put(g, x, 0, H_LINE, FRAME); put(g, x, 21, H_LINE, FRAME) }
  for (let y = 1; y < 21; y++) {
    put(g, x0 + 1, y, V_LINE, FRAME)
    put(g, x0 + 22, y, V_LINE, FRAME)
    for (let x = bx; x < bx + 20; x++) put(g, x, y, 0x20, DEFAULT_COLOR, WELL)
  }

  // 굳은 칸
  for (let y = Game.HID; y < Game.BH; y++) {
    for (let x = 0; x < Game.BW; x++) {
      const v = game.board[y * Game.BW + x]
      if (!v) continue
      let color = PIECE_COLORS[v - 1]!
      if (game.clearing?.rows.includes(y) && Math.floor(game.clearing.ms / 100) % 2 === 0) color = WHITE
      if (game.over) color = mix(color, WELL, 0.55)
      block(g, bx + x * 2, by + y - Game.HID, color)
    }
  }

  // AI 가 노리는 자리(░)와 지금 블록
  const cur = game.cur
  if (cur && !game.clearing) {
    if (Game.fits(game.board, cur.k, cur.tr, cur.tx, cur.y)) {
      let gy = cur.y
      while (Game.fits(game.board, cur.k, cur.tr, cur.tx, gy + 1)) gy++
      const ghost = mix(PIECE_COLORS[cur.k]!, WELL, 0.5)
      for (const [cx, cy] of Game.ROT[cur.k]![cur.tr]!) {
        const y = gy + cy
        if (y < Game.HID) continue
        const x = bx + (cur.tx + cx) * 2
        put(g, x, by + y - Game.HID, SHADE, ghost, WELL)
        put(g, x + 1, by + y - Game.HID, SHADE, ghost, WELL)
      }
    }
    for (const [cx, cy] of Game.ROT[cur.k]![cur.r]!) {
      const y = cur.y + cy
      if (y >= Game.HID) block(g, bx + (cur.x + cx) * 2, by + y - Game.HID, PIECE_COLORS[cur.k]!)
    }
  }
  if (game.flash) {
    const a = Math.max(0, 0.7 * (1 - game.flash.ms / Game.FLASH_MS))
    for (const [x, y] of game.flash.cells) {
      if (y < Game.HID) continue
      const v = game.board[y * Game.BW + x]
      if (v) block(g, bx + x * 2, by + y - Game.HID, mix(PIECE_COLORS[v - 1]!, WHITE, a))
    }
  }

  // 우물 안 문구: 지운 줄·콤보, 게임 오버. 가운데 맞추고 글자 뒤는 우물색으로 덮는다
  const banner = (row: number, s: string, color: number) => {
    const x = bx + Math.floor((20 - s.length) / 2)
    text(g, x - 1, by + row, ` ${s} `, color, WELL)
  }
  if (game.popup && !game.over) {
    const fade = game.popup.ms > Game.POPUP_MS * 0.7 ? 0.55 : 0
    game.popup.lines.forEach((line, i) => banner(5 + i, line, mix(i === 0 ? WHITE : ACCENT, WELL, fade)))
  }
  if (game.over) banner(9, 'GAME OVER', blink ? 0xe56b6f : 0x6b3335)

  // 보드 아래 정보. 높이가 모자라면 아래쪽 줄부터 빠진다(put 이 격자 밖을 버린다)
  let y = 23
  text(g, x0 + 2, y, 'NEXT', LABEL)
  const cells = Game.ROT[game.next]![0]!
  const minX = Math.min(...cells.map(c => c[0]))
  const maxX = Math.max(...cells.map(c => c[0]))
  const minY = Math.min(...cells.map(c => c[1]))
  const left = x0 + 22 - (maxX - minX + 1) * 2
  for (const [cx, cy] of cells) block(g, left + (cx - minX) * 2, y + cy - minY, PIECE_COLORS[game.next]!)
  y += 3
  for (let x = x0 + 2; x < x0 + 22; x++) put(g, x, y, H_LINE, 0x333333)
  y += 1
  row(g, x0, y++, 'LINES', String(game.lines), VALUE)
  row(g, x0, y++, 'SCORE', String(game.score), VALUE)
  row(g, x0, y++, 'COMBO', `${game.combo} max ${game.maxCombo}`, game.combo >= 2 ? ACCENT : VALUE)
  row(g, x0, y++, 'PIECES', String(game.pieces), VALUE)
  row(g, x0, y++, 'GAME', String(game.games), VALUE)
  y += 1
  row(g, x0, y++, 'OUT TOK', tokensOf(meter.out), ACCENT)
  row(g, x0, y++, 'IN TOK', tokensOf(meter.inp), VALUE)
  row(g, x0, y++, 'tok/s', String(Math.round(Meter.rateOf(meter))), VALUE)
  const top = Math.max(60, ...meter.bins)
  meter.bins.forEach((v, i) => {
    const level = v <= 0 ? -1 : Math.min(7, Math.floor((v / top) * 8))
    put(g, x0 + 2 + i, y, level < 0 ? 0x20 : SPARK[level]!, i === meter.bins.length - 1 ? ACCENT : SPARK_DIM)
  })
  y += 2
  const status = Meter.statusOf(meter, now)
  const view = STATUS_VIEW[status]
  const color = status === 'tool' && !blink ? mix(view.color, 0x262626, 0.5) : view.color
  put(g, x0 + 2, y, BAR, color)
  text(g, x0 + 4, y, view.word, color)
  return g
}
