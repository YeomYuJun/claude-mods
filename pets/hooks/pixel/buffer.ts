// 픽셀 버퍼(팔레트 번호)와 깊이·면 버퍼, 그리고 셀로 접기.
// 배율 1: 셀 하나 = ▀ 한 글자 = 위아래 픽셀 2 개. 버퍼는 cols × rows*2.
// 배율 2: 논리 픽셀 하나 = 2 열 × 1 행. 버퍼는 ceil(cols/2) × rows.

import { DEFAULT_COLOR, SPACE, type Grid } from './grid.js'
import { RGB, VOID } from './palette.js'

const HALF_TOP = 0x2580 // ▀
const HALF_BOTTOM = 0x2584 // ▄

// 면 종류: 그림자는 윗면에만 떨어진다
export const SURF_NONE = 0
export const SURF_TOP = 1
export const SURF_SIDE = 2

export type Buffer = {
  w: number
  h: number
  scale: 1 | 2
  px: Uint8Array
  // 보는 쪽으로 가까울수록 크다(fx + fy). 타일이 쓰고 강아지·공이 비교한다
  depth: Float32Array
  surf: Uint8Array
  // 윗면일 때 그 칸의 높이 + 1. 그림자가 같은 높이 윗면에만 떨어지게 한다
  level: Uint8Array
}

export function bufferOf(cols: number, rows: number, scale: 1 | 2): Buffer {
  const w = scale === 1 ? cols : Math.ceil(cols / 2)
  const h = scale === 1 ? rows * 2 : rows
  return { w, h, scale, px: new Uint8Array(w * h), depth: new Float32Array(w * h), surf: new Uint8Array(w * h), level: new Uint8Array(w * h) }
}

export function clear(b: Buffer): void {
  b.px.fill(VOID)
  b.depth.fill(-1e9)
  b.surf.fill(SURF_NONE)
  b.level.fill(0)
}

// 깊이 비교 없이 칠한다
export function plot(b: Buffer, x: number, y: number, color: number): void {
  if (x < 0 || y < 0 || x >= b.w || y >= b.h) return
  b.px[y * b.w + x] = color
}

// 깊이가 더 가까울 때만 칠한다(가려질 수 있는 것: 강아지, 공)
export function plotDepth(b: Buffer, x: number, y: number, color: number, depth: number): void {
  if (x < 0 || y < 0 || x >= b.w || y >= b.h) return
  const i = y * b.w + x
  if (depth <= b.depth[i]!) return
  b.px[i] = color
}

// 버퍼를 셀 격자로 접는다. 격자는 호출하는 쪽이 크기를 맞춰 넘긴다
export function fold(b: Buffer, g: Grid): void {
  const words = g.words
  if (b.scale === 2) {
    for (let cy = 0; cy < g.rows; cy++) {
      for (let cx = 0; cx < g.cols; cx++) {
        const c = RGB[b.px[cy * b.w + (cx >> 1)]!]!
        const i = (cy * g.cols + cx) * 3
        words[i] = SPACE
        words[i + 1] = DEFAULT_COLOR
        words[i + 2] = c
      }
    }
    return
  }
  for (let cy = 0; cy < g.rows; cy++) {
    const top = cy * 2 * b.w
    const bottom = top + b.w
    for (let cx = 0; cx < g.cols; cx++) {
      const t = b.px[top + cx]!
      const u = b.px[bottom + cx]!
      const i = (cy * g.cols + cx) * 3
      if (t === u) {
        words[i] = SPACE
        words[i + 1] = DEFAULT_COLOR
        words[i + 2] = RGB[t]!
      } else if (t === VOID) {
        // 전경의 기본색은 터미널 글자색이라 비워 둘 수 없다. 아래 반쪽 글자로 뒤집는다
        words[i] = HALF_BOTTOM
        words[i + 1] = RGB[u]!
        words[i + 2] = DEFAULT_COLOR
      } else {
        words[i] = HALF_TOP
        words[i + 1] = RGB[t]!
        words[i + 2] = RGB[u]!
      }
    }
  }
}
