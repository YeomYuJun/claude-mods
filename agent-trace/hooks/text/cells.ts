const WIDE: Array<[number, number]> = [
  [0x1100, 0x115f], [0x2e80, 0xa4cf], [0xac00, 0xd7a3], [0xf900, 0xfaff],
  [0xfe30, 0xfe4f], [0xff00, 0xff60], [0xffe0, 0xffe6],
]

export function cellsOf(char: string): number {
  const code = char.codePointAt(0) ?? 0
  return WIDE.some(([low, high]) => code >= low && code <= high) ? 2 : 1
}

export function widthOf(text: string): number {
  let width = 0
  for (const char of text) width += cellsOf(char)
  return width
}

export function clip(text: string, width: number): string {
  const line = text.replace(/\s+/g, ' ').trim()
  if (widthOf(line) <= width) return line
  if (width <= 0) return ''
  let out = ''
  let used = 0
  for (const char of line) {
    const cells = cellsOf(char)
    if (used + cells > width - 1) break
    out += char
    used += cells
  }
  return `${out}…`
}

export function clipStart(text: string, width: number): string {
  const line = text.replace(/\s+/g, ' ').trim()
  if (widthOf(line) <= width) return line
  if (width <= 0) return ''
  let out = ''
  let used = 0
  for (const char of [...line].reverse()) {
    const cells = cellsOf(char)
    if (used + cells > width - 1) break
    out = char + out
    used += cells
  }
  return `…${out}`
}

export function clipRows(text: string, width: number, rows: number): { text: string; rows: number; isCut: boolean } {
  const lines = text.replace(/\n\s*\n(\s*\n)+/g, '\n\n').trim().split('\n')
  const kept: string[] = []
  let used = 0
  let total = 0
  for (const line of lines) {
    const need = Math.max(1, Math.ceil(widthOf(line) / Math.max(1, width)))
    total += need
    if (used + need <= rows) {
      kept.push(line)
      used += need
    } else if (used < rows) {
      kept.push(clip(line, (rows - used) * Math.max(1, width)))
      used = rows
    }
  }
  return { text: kept.join('\n'), rows: total, isCut: total > rows }
}
