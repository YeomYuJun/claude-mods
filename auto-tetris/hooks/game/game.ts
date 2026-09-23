// 테트리스 규칙. 블록을 둘 자리는 ai.ts 가 고른다. 시간과 입력은 바깥에서 받는다(순수 모듈).

import { BH, BW, HID, I_PIECE, O_PIECE, ROT, collapse, fits, fullRowsOf } from './board.js'
import { DEFAULT_TIER, choose, type Tier } from './ai.js'

export * from './board.js'
export { DEFAULT_TIER, TIERS, holesOf, tierOf, type Tier } from './ai.js'

export const CLEAR_MS = 400
export const OVER_MS = 2500
export const FLASH_MS = 330
export const POPUP_MS = 1200
// 콤보 가산점: 이어진 두 번째 배치부터 COMBO_BONUS × (콤보 - 1)
export const COMBO_BONUS = 50
const CLEAR_NAMES = ['', 'SINGLE', 'DOUBLE', 'TRIPLE', 'TETRIS']
// 속도를 주지 않은 advance 의 낙하: 한 번에 바닥까지
export const INSTANT_ROWS = 1_000_000

// falling: 도구 호출로 떨어지는 중. fallAcc 는 아직 내려가지 않은 행의 몫
// tr·tx: 실제로 가는 회전·열. aimX: AI 가 노린 열(░ 로 그린다). 실행 실수가 나면 tx 와 다르다
export type Piece = { k: number; r: number; x: number; y: number; tr: number; tx: number; aimX: number; falling: boolean; fallAcc: number }

export type Game = {
  board: Uint8Array
  bag: number[]
  next: number
  cur?: Piece
  clearing?: { rows: number[]; ms: number }
  over?: { ms: number }
  flash?: { cells: Array<[number, number]>; ms: number }
  // 우물 안에 잠깐 띄우는 문구(지운 줄 이름, 콤보)
  popup?: { lines: string[]; ms: number }
  // 줄을 지운 배치가 몇 번 이어졌는가. 줄을 못 지운 배치에서 0
  combo: number
  maxCombo: number
  // 블록을 두는 AI 의 등급. 다음에 나오는 블록부터 적용된다
  tier: Tier
  lines: number
  score: number
  pieces: number
  games: number
  seed: number
}

function rnd(g: Game): number {
  let s = g.seed | 0
  s ^= s << 13
  s ^= s >>> 17
  s ^= s << 5
  g.seed = s
  return (s >>> 0) / 4294967296
}

function drawBag(g: Game): number {
  if (g.bag.length === 0) {
    g.bag = [0, 1, 2, 3, 4, 5, 6]
    for (let i = 6; i > 0; i--) {
      const j = Math.floor(rnd(g) * (i + 1))
      const t = g.bag[i]!
      g.bag[i] = g.bag[j]!
      g.bag[j] = t
    }
  }
  return g.bag.pop()!
}

function spawn(g: Game): void {
  const k = g.next
  g.next = drawBag(g)
  const y = k === I_PIECE ? HID - 1 : HID
  const x = k === I_PIECE ? 3 : k === O_PIECE ? 4 : 3
  if (!fits(g.board, k, 0, x, y)) {
    g.cur = undefined
    g.over = { ms: 0 }
    return
  }
  const target = choose(g.board, k, g.next, y, g.tier, () => rnd(g))
  g.cur = { k, r: 0, x, y, tr: target.r, tx: target.x, aimX: target.aimX, falling: false, fallAcc: 0 }
  g.pieces++
}

function lock(g: Game): void {
  const cur = g.cur
  if (!cur) return
  for (const [cx, cy] of ROT[cur.k]![cur.r]!) {
    const Y = cur.y + cy
    if (Y >= 0) g.board[Y * BW + cur.x + cx] = cur.k + 1
  }
  g.cur = undefined
  const full = fullRowsOf(g.board)
  if (full.length > 0) {
    g.clearing = { rows: full, ms: 0 }
    g.lines += full.length
    g.combo++
    g.maxCombo = Math.max(g.maxCombo, g.combo)
    g.score += ([0, 100, 300, 500, 800][full.length] ?? 800) + COMBO_BONUS * Math.max(0, g.combo - 1)
    const lines = [CLEAR_NAMES[full.length] ?? 'TETRIS']
    if (g.combo >= 2) lines.push(`COMBO x${g.combo}`)
    g.popup = { lines, ms: 0 }
  } else {
    g.combo = 0
    spawn(g)
  }
}

export function setTier(g: Game, tier: Tier): void {
  g.tier = tier
}

export function create(seed: number): Game {
  const g: Game = { board: new Uint8Array(BW * BH), bag: [], next: 0, tier: DEFAULT_TIER, combo: 0, maxCombo: 0, lines: 0, score: 0, pieces: 0, games: 1, seed: seed | 0 || 0x1b873593 }
  g.next = drawBag(g)
  spawn(g)
  return g
}

// 줄 지우기·게임 오버·낙하 중에는 수를 받지 않는다
export function isBusy(g: Game): boolean {
  return g.clearing !== undefined || g.over !== undefined || g.cur?.falling === true
}

// 한 수: 목표 회전으로 한 번 돌리거나, 목표 열로 한 칸 옮기거나, 한 칸 내린다(닿으면 굳는다)
export function move(g: Game): boolean {
  const cur = g.cur
  if (!cur || isBusy(g)) return false
  if (cur.r !== cur.tr) {
    const nr = (cur.r + 1) % 4
    if (fits(g.board, cur.k, nr, cur.x, cur.y)) cur.r = nr
    else if (fits(g.board, cur.k, nr, cur.x - 1, cur.y)) { cur.r = nr; cur.x-- }
    else if (fits(g.board, cur.k, nr, cur.x + 1, cur.y)) { cur.r = nr; cur.x++ }
    else cur.tr = cur.r
    return true
  }
  if (cur.x !== cur.tx) {
    const d = Math.sign(cur.tx - cur.x)
    if (fits(g.board, cur.k, cur.r, cur.x + d, cur.y)) cur.x += d
    else cur.tx = cur.x
    return true
  }
  if (fits(g.board, cur.k, cur.r, cur.x, cur.y + 1)) cur.y++
  else lock(g)
  return true
}

// 도구 호출 한 번: 지금 블록을 계획한 회전·열로 맞추고 떨어뜨리기 시작한다. 내려가는 것은 advance 가 행 단위로 한다
export function drop(g: Game): boolean {
  const cur = g.cur
  if (!cur || isBusy(g)) return false
  if (fits(g.board, cur.k, cur.tr, cur.tx, cur.y)) { cur.r = cur.tr; cur.x = cur.tx }
  cur.falling = true
  cur.fallAcc = 0
  return true
}

function land(g: Game, cur: Piece): void {
  g.flash = { cells: ROT[cur.k]![cur.r]!.map(([cx, cy]) => [cur.x + cx, cur.y + cy] as [number, number]), ms: 0 }
  lock(g)
}

// 시간이 흐른다: 낙하·줄 지우기·게임 오버·번쩍임 애니메이션을 진행한다. fallRows 는 낙하 속도(행/초)
export function advance(g: Game, dtMs: number, fallRows: number = INSTANT_ROWS): void {
  const cur = g.cur
  if (cur?.falling) {
    cur.fallAcc += (dtMs / 1000) * fallRows
    while (cur.fallAcc >= 1) {
      cur.fallAcc--
      if (fits(g.board, cur.k, cur.r, cur.x, cur.y + 1)) cur.y++
      else { land(g, cur); break }
    }
  }
  if (g.flash) { g.flash.ms += dtMs; if (g.flash.ms >= FLASH_MS) g.flash = undefined }
  if (g.popup) { g.popup.ms += dtMs; if (g.popup.ms >= POPUP_MS) g.popup = undefined }
  if (g.clearing) {
    g.clearing.ms += dtMs
    if (g.clearing.ms < CLEAR_MS) return
    collapse(g.board, g.clearing.rows)
    g.clearing = undefined
    spawn(g)
  }
  if (g.over) {
    g.over.ms += dtMs
    if (g.over.ms < OVER_MS) return
    g.board.fill(0)
    g.over = undefined
    g.combo = 0
    g.games++
    g.bag = []
    g.next = drawBag(g)
    spawn(g)
  }
}
