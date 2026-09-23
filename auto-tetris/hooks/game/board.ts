// 판과 블록 모양, 판 위에서 블록이 들어가는지·찬 줄을 보는 함수(순수 모듈).

export const BW = 10
export const BH = 22
export const HID = 2

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

export function fits(board: Uint8Array, k: number, r: number, x: number, y: number): boolean {
  for (const [cx, cy] of ROT[k]![r]!) {
    const X = x + cx
    const Y = y + cy
    if (X < 0 || X >= BW || Y >= BH) return false
    if (Y >= 0 && board[Y * BW + X]) return false
  }
  return true
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
