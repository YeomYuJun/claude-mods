const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'

// Raster 의 cells(base64 u32 세 개씩)를 줄 글자로 되돌린다
export function linesOf(cells: string, columns: number): string[] {
  const clean = cells.replace(/=+$/, '')
  const bytes: number[] = []
  for (let i = 0; i < clean.length; i += 4) {
    const v = (B64.indexOf(clean[i]!) << 18) | (B64.indexOf(clean[i + 1] ?? 'A') << 12) | (B64.indexOf(clean[i + 2] ?? 'A') << 6) | B64.indexOf(clean[i + 3] ?? 'A')
    bytes.push((v >>> 16) & 255, (v >>> 8) & 255, v & 255)
  }
  const chars: string[] = []
  for (let i = 0; i + 11 < bytes.length; i += 12) {
    const cp = bytes[i]! | (bytes[i + 1]! << 8) | (bytes[i + 2]! << 16) | (bytes[i + 3]! << 24)
    chars.push(String.fromCodePoint(cp >>> 0))
  }
  const lines: string[] = []
  for (let i = 0; i < chars.length; i += columns) lines.push(chars.slice(i, i + columns).join(''))
  return lines
}

export function valueOf(lines: readonly string[], label: string): string | undefined {
  const line = lines.find(item => item.trimStart().startsWith(`${label} `))
  return line?.trim().split(/\s+/).pop()
}

export function textOf(tree: unknown): string {
  if (typeof tree === 'string' || typeof tree === 'number') return String(tree)
  if (Array.isArray(tree)) return tree.map(textOf).join('')
  if (typeof tree !== 'object' || !tree) return ''
  return textOf(Reflect.get(tree, 'children') ?? [])
}
