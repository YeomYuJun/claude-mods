// 블록을 어디에 둘지 고르는 AI(순수 모듈). 세션이 쓰는 모델에 따라 실력이 다르다.
// 놓기: 회전 × 열마다 곧장 내려 닿는 자리를 모두 나열한다.
// 고르기: 자리마다 판을 평가해 가장 좋은 것. 상위 등급은 다음 블록(NEXT)까지 두 수를 본다.
// 실수: 판단 실수(상위 후보 중 최선이 아닌 것), 평가 잡음, 실행 실수(목표 열에서 한 칸 빗나감).

import { BH, BW, O_PIECE, ROT, collapse, fits, fullRowsOf } from './board.js'

export type Tier = 'haiku' | 'sonnet' | 'opus' | 'fable'

export type TierParams = {
  // classic: 높이·지운 줄·구멍·울퉁불퉁함 4 가중치. dellacherie: 착지 높이·깎인 칸·행 전이·열 전이·구멍·우물 6 특징
  evaluator: 'classic' | 'dellacherie'
  // 다음 블록까지 보는가. 볼 때는 한 수 평가 상위 LOOKAHEAD_WIDTH 개만 더 본다
  lookahead: boolean
  // 평가값에 더하는 균등 잡음의 폭
  noise: number
  // 상위 MISJUDGE_POOL 개 중 최선이 아닌 것을 고를 확률
  misjudge: number
  // 목표 열에서 한 칸 옆으로 두는 확률(AI 가 노린 자리 ░ 와 실제 자리가 어긋난다)
  slip: number
}

export const TIERS: Record<Tier, TierParams> = {
  haiku: { evaluator: 'classic', lookahead: false, noise: 0.35, misjudge: 0.1, slip: 0.06 },
  sonnet: { evaluator: 'dellacherie', lookahead: false, noise: 2, misjudge: 0.05, slip: 0.03 },
  opus: { evaluator: 'dellacherie', lookahead: true, noise: 1, misjudge: 0.025, slip: 0.015 },
  fable: { evaluator: 'dellacherie', lookahead: true, noise: 0.3, misjudge: 0.01, slip: 0.005 },
}

export const DEFAULT_TIER: Tier = 'sonnet'
export const LOOKAHEAD_WIDTH = 6
export const MISJUDGE_POOL = 4

// 모델 id 에서 등급을 읽는다(claude-opus-5-5[1m], us.anthropic.claude-haiku-4-5 등). 모르는 모델은 DEFAULT_TIER
export function tierOf(model: string | undefined): Tier {
  const m = (model ?? '').toLowerCase()
  if (m.includes('fable')) return 'fable'
  if (m.includes('opus')) return 'opus'
  if (m.includes('sonnet')) return 'sonnet'
  if (m.includes('haiku')) return 'haiku'
  return DEFAULT_TIER
}

export type Placement = { r: number; x: number; y: number; board: Uint8Array; lines: number; eroded: number }

// 회전 × 열마다 fromY 에서 곧장 내려 닿는 자리와 그 뒤의 판(찬 줄을 지운 뒤)
export function placementsOf(board: Uint8Array, k: number, fromY: number): Placement[] {
  const out: Placement[] = []
  for (let r = 0; r < (k === O_PIECE ? 1 : 4); r++) {
    for (let x = -2; x < BW; x++) {
      if (!fits(board, k, r, x, fromY)) continue
      let y = fromY
      while (fits(board, k, r, x, y + 1)) y++
      const b = board.slice()
      for (const [cx, cy] of ROT[k]![r]!) { const Y = y + cy; if (Y >= 0) b[Y * BW + x + cx] = k + 1 }
      const full = fullRowsOf(b)
      let eroded = 0
      for (const [, cy] of ROT[k]![r]!) if (full.includes(y + cy)) eroded++
      collapse(b, full)
      out.push({ r, x, y, board: b, lines: full.length, eroded: full.length * eroded })
    }
  }
  return out
}

function heightsOf(b: Uint8Array): number[] {
  const hs: number[] = []
  for (let x = 0; x < BW; x++) {
    let h = 0
    for (let y = 0; y < BH; y++) if (b[y * BW + x]) { h = BH - y; break }
    hs.push(h)
  }
  return hs
}

export function holesOf(b: Uint8Array): number {
  let holes = 0
  for (let x = 0; x < BW; x++) {
    let seen = false
    for (let y = 0; y < BH; y++) {
      if (b[y * BW + x]) seen = true
      else if (seen) holes++
    }
  }
  return holes
}

function classic(p: Placement): number {
  const hs = heightsOf(p.board)
  let agg = 0
  let bump = 0
  hs.forEach((h, i) => { agg += h; if (i > 0) bump += Math.abs(h - hs[i - 1]!) })
  return -0.510066 * agg + 0.760666 * p.lines - 0.35663 * holesOf(p.board) - 0.184483 * bump
}

// Pierre Dellacherie 의 6 특징과 El-Tetris 가중치
function dellacherie(p: Placement, k: number): number {
  const b = p.board
  const cells = ROT[k]![p.r]!
  const top = Math.min(...cells.map(c => p.y + c[1]))
  const bottom = Math.max(...cells.map(c => p.y + c[1]))
  const landing = BH - (top + bottom) / 2
  const filled = (x: number, y: number) => x < 0 || x >= BW || y >= BH || (y >= 0 && b[y * BW + x]! > 0)
  let rowT = 0
  for (let y = 0; y < BH; y++) for (let x = -1; x < BW; x++) if (filled(x, y) !== filled(x + 1, y)) rowT++
  let colT = 0
  for (let x = 0; x < BW; x++) for (let y = -1; y < BH; y++) if ((y >= 0 && filled(x, y)) !== filled(x, y + 1)) colT++
  let wells = 0
  for (let x = 0; x < BW; x++) {
    let depth = 0
    for (let y = 0; y < BH; y++) {
      if (!filled(x, y) && filled(x - 1, y) && filled(x + 1, y)) { depth++; wells += depth } else if (filled(x, y)) depth = 0
    }
  }
  return -4.500158825082766 * landing + 3.4181268101392694 * p.eroded - 3.2178882868487753 * rowT
    - 9.348695305445199 * colT - 7.899265427351652 * holesOf(b) - 3.3855972247263626 * wells
}

function evaluate(p: Placement, k: number, params: TierParams): number {
  return params.evaluator === 'classic' ? classic(p) : dellacherie(p, k)
}

export type Choice = { r: number; aimX: number; x: number }

// 블록 k 를 fromY 에서 둘 자리를 고른다. aimX 는 AI 가 노린 열, x 는 실행 실수까지 반영한 실제 열
export function choose(board: Uint8Array, k: number, next: number, fromY: number, tier: Tier, random: () => number): Choice {
  const params = TIERS[tier]
  const options = placementsOf(board, k, fromY)
  if (options.length === 0) return { r: 0, aimX: 3, x: 3 }
  let scored = options.map(p => ({ p, sc: evaluate(p, k, params) + random() * params.noise }))
  scored.sort((a, b) => b.sc - a.sc)
  if (params.lookahead) {
    scored = scored.slice(0, LOOKAHEAD_WIDTH).map(({ p, sc }) => {
      let best = -Infinity
      for (const q of placementsOf(p.board, next, fromY)) best = Math.max(best, evaluate(q, next, params))
      return { p, sc: sc + (best === -Infinity ? -1e6 : best) }
    })
    scored.sort((a, b) => b.sc - a.sc)
  }
  let pick = scored[0]!
  if (scored.length > 1 && random() < params.misjudge) {
    const pool = Math.min(MISJUDGE_POOL, scored.length)
    pick = scored[1 + Math.floor(random() * (pool - 1))]!
  }
  const { r, x } = pick.p
  let actual = x
  if (random() < params.slip) {
    const side = random() < 0.5 ? -1 : 1
    for (const d of [side, -side]) if (fits(board, k, r, x + d, fromY)) { actual = x + d; break }
  }
  return { r, aimX: x, x: actual }
}
