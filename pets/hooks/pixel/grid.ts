// Raster 의 셀 격자: 셀마다 [코드 포인트, 전경, 배경] 세 u32, 행 우선. auto-tetris 의 grid 와 같다.

export const DEFAULT_COLOR = 0x01000000
export const SPACE = 0x20

export type Grid = { cols: number; rows: number; words: Uint32Array }

export function gridOf(cols: number, rows: number): Grid {
  const words = new Uint32Array(cols * rows * 3)
  for (let i = 0; i < cols * rows; i++) {
    words[i * 3] = SPACE
    words[i * 3 + 1] = DEFAULT_COLOR
    words[i * 3 + 2] = DEFAULT_COLOR
  }
  return { cols, rows, words }
}

export function put(g: Grid, x: number, y: number, ch: number, fg: number, bg: number = DEFAULT_COLOR): void {
  if (x < 0 || y < 0 || x >= g.cols || y >= g.rows) return
  const i = (y * g.cols + x) * 3
  g.words[i] = ch
  g.words[i + 1] = fg
  g.words[i + 2] = bg
}

// 글자는 ASCII 와 폭 1 기호만 쓴다(Raster 는 폭 1 BMP 문자만 받는다)
export function text(g: Grid, x: number, y: number, s: string, fg: number, bg: number = DEFAULT_COLOR): void {
  let col = x
  for (const ch of s) put(g, col++, y, ch.codePointAt(0) ?? SPACE, fg, bg)
}

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'

type ToBase64 = (this: Uint8Array) => string
// 엔진의 훅 환경에는 Uint8Array.prototype.toBase64 가 있어 200 × 80 셀에서 직접 인코딩(약 5 ms)보다 60 배쯤 빠르다.
// 그 메서드가 없는 환경이면 직접 인코딩한다
const nativeToBase64 = (Uint8Array.prototype as { toBase64?: ToBase64 }).toBase64

// u32 는 little-endian 으로 편다
export function encode(g: Grid): string {
  const n = g.words.length * 4
  const bytes = new Uint8Array(n)
  for (let i = 0; i < g.words.length; i++) {
    const w = g.words[i]!
    bytes[i * 4] = w & 0xff
    bytes[i * 4 + 1] = (w >>> 8) & 0xff
    bytes[i * 4 + 2] = (w >>> 16) & 0xff
    bytes[i * 4 + 3] = (w >>> 24) & 0xff
  }
  return typeof nativeToBase64 === 'function' ? nativeToBase64.call(bytes) : encodeBytes(bytes)
}

export function encodeBytes(bytes: Uint8Array): string {
  const n = bytes.length
  const parts: string[] = []
  let i = 0
  for (; i + 2 < n; i += 3) {
    const v = (bytes[i]! << 16) | (bytes[i + 1]! << 8) | bytes[i + 2]!
    parts.push(B64[(v >>> 18) & 63]! + B64[(v >>> 12) & 63]! + B64[(v >>> 6) & 63]! + B64[v & 63]!)
  }
  if (i < n) {
    const a = bytes[i]!
    const b = i + 1 < n ? bytes[i + 1]! : 0
    const v = (a << 16) | (b << 8)
    parts.push(B64[(v >>> 18) & 63]! + B64[(v >>> 12) & 63]! + (i + 1 < n ? B64[(v >>> 6) & 63]! : '=') + '=')
  }
  return parts.join('')
}
