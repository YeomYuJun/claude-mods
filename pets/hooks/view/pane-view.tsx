/* @jsxRuntime classic */
/* @jsx h */
/* @jsxFrag Fragment */
import type { ElementTable, RenderElement } from 'claude-code'

import Names from '../names'

export type NoticeKit = Pick<ElementTable<'terminal' | 'desktop'>, 'Box' | 'Text'>
export type RasterTag = ElementTable<'terminal'>['Raster']

export function rasterView(Raster: RasterTag, key: string, cols: number, rows: number, cells: string): RenderElement {
  return <Raster key={key} columns={cols} rows={rows} cells={cells} />
}

export function noticeView(kit: NoticeKit, lines: readonly string[]): RenderElement {
  const { Box, Text } = kit
  return (
    <Box flexDirection="column">
      {lines.map((line, index) => <Text key={`notice:${index}`} dimColor>{line}</Text>)}
    </Box>
  )
}

export function tooSmallLines(cols: number, rows: number): string[] {
  return [`패널이 ${Names.MIN_COLS}열 × ${Names.MIN_ROWS}행 이상이어야 한다`, `지금 ${cols}열 × ${rows}행`]
}

export const NOT_TERMINAL_LINES: readonly string[] = ['강아지는 터미널 패널에서만 그린다']
