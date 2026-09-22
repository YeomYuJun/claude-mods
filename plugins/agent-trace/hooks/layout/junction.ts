const GLYPHS: Record<string, string> = {
  '1111': '┼', '1101': '├', '1110': '┤', '1100': '│',
  '0101': '┌', '1001': '└', '0110': '┐', '1010': '┘',
  '0011': '─', '0111': '┬', '1011': '┴', '0100': '│', '1000': '│', '0001': '─', '0010': '─',
}

export function junction(up: boolean, down: boolean, left: boolean, right: boolean): string {
  const key = [up, down, left, right].map(flag => flag ? '1' : '0').join('')
  return GLYPHS[key] ?? ' '
}
