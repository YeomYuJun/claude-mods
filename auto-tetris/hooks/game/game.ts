// 테트리스 규칙과 스스로 두는 AI. 시간과 입력은 바깥에서 받는다(순수 모듈).

export const BW = 10
export const BH = 22
export const HID = 2

export const CLEAR_MS = 400
export const OVER_MS = 2500
export const FLASH_MS = 330
// 속도를 주지 않은 advance 의 낙하: 한 번에 바닥까지
export const INSTANT_ROWS = 1_000_000

type Shape = number[][]
const SHAPES: Shape[] = [
  [[0, 0, 0, 0], [1, 1, 1, 1], [0, 0, 0, 0], [0, 0, 0, 0]], // I
  [[1, 1], [1, 1]], // O
  [[0, 1, 0], [1, 1, 1], [0, 0, 0]], // T
  [[0, 1, 1], [1, 1, 0], [0, 0, 0]], // S
  [[1, 1, 0], [0, 1, 1], [0, 0, 0]], // Z
  [[1, 0, 0], [1, 1, 1], [0, 0, 0]], // J
  [[0, 0, 1], [1, 1, 1], [0, 0, 0]], // L
]
export const O_PIECE = 1
export const I_PIECE = 0

function rotate(m: Shape): Shape {
  return m.map((row, y) => row.map((_, x) => m[m.length - 1 - x]![y]!))
}

function cellsOf(m: Shape): Array<[number, number]> {
  const out: Array<[number, number]> = []
  m.forEach((row, y) => row.forEach((v, x) => { if (v) out.push([x, y]) }))
  return out
}

// ROT[piece][rotation] = 칸 좌표 목록
export const ROT: Array<Array<Array<[number, number]>>> = SHAPES.map(shape => {
  const turns: Shape[] = [shape]
  for (let i = 1; i < 4; i++) turns.push(rotate(turns[i - 1]!))
  return turns.map(cellsOf)
})

// falling: 도구 호출로 떨어지는 중. fallAcc 는 아직 내려가지 않은 행의 몫
export type Piece = { k: number; r: number; x: number; y: number; tr: number; tx: number; falling: boolean; fallAcc: number }

export type Game = {
  board: Uint8Array
  bag: number[]
  next: number
  cur?: Piece
  clearing?: { rows: number[]; ms: number }
  over?: { ms: number }
  flash?: { cells: Array<[number, number]>; ms: number }
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

export function fits(board: Uint8Array, k: number, r: number, x: number, y: number): boolean {
  for (const [cx, cy] of ROT[k]![r]!) {
    const X = x + cx
    const Y = y + cy
    if (X < 0 || X >= BW || Y >= BH) return false
    if (Y >= 0 && board[Y * BW + X]) return false
  }
  return true
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

export function fullRowsOf(board: Uint8Array): number[] {
  const full: number[] = []
  for (let y = 0; y < BH; y++) {
    let isFull = true
    for (let x = 0; x < BW; x++) if (!board[y * BW + x]) { isFull = false; break }
    if (isFull) full.push(y)
  }
  return full
}

export function collapse(board: Uint8Array, rows: number[]): void {
  for (const r of rows) {
    board.copyWithin(BW, 0, r * BW)
    board.fill(0, 0, BW)
  }
}

// 고전 가중치(높이·지운 줄·구멍·울퉁불퉁함). 한 수 앞만 본다.
export function scoreOf(board: Uint8Array, lines: number): number {
  let agg = 0
  let holes = 0
  let bump = 0
  let prev = -1
  for (let x = 0; x < BW; x++) {
    let h = 0
    let seen = false
    for (let y = 0; y < BH; y++) {
      const v = board[y * BW + x]
      if (v && !seen) { seen = true; h = BH - y } else if (!v && seen) holes++
    }
    agg += h
    if (prev >= 0) bump += Math.abs(h - prev)
    prev = h
  }
  return -0.510066 * agg + 0.760666 * lines - 0.35663 * holes - 0.184483 * bump
}

export function plan(g: Game, k: number, fromY: number): { r: number; x: number } {
  let best: { sc: number; r: number; x: number } | undefined
  for (let r = 0; r < (k === O_PIECE ? 1 : 4); r++) {
    for (let x = -2; x < BW; x++) {
      if (!fits(g.board, k, r, x, fromY)) continue
      let y = fromY
      while (fits(g.board, k, r, x, y + 1)) y++
      const b = g.board.slice()
      for (const [cx, cy] of ROT[k]![r]!) { const Y = y + cy; if (Y >= 0) b[Y * BW + x + cx] = k + 1 }
      const full = fullRowsOf(b)
      collapse(b, full)
      // 약간의 잡음: 가끔 최선이 아닌 수를 둬서 판이 끝나기도 한다
      const sc = scoreOf(b, full.length) + rnd(g) * 0.35
      if (!best || sc > best.sc) best = { sc, r, x }
    }
  }
  return best ? { r: best.r, x: best.x } : { r: 0, x: 3 }
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
  const target = plan(g, k, y)
  g.cur = { k, r: 0, x, y, tr: target.r, tx: target.x, falling: false, fallAcc: 0 }
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
    g.score += [0, 100, 300, 500, 800][full.length] ?? 800
  } else spawn(g)
}

export function create(seed: number): Game {
  const g: Game = { board: new Uint8Array(BW * BH), bag: [], next: 0, lines: 0, score: 0, pieces: 0, games: 1, seed: seed | 0 || 0x1b873593 }
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
    g.games++
    g.bag = []
    g.next = drawBag(g)
    spawn(g)
  }
}
