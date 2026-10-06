/* @jsxRuntime classic */
/* @jsx h */
/* @jsxFrag Fragment */
import type { ElementTable, RenderElement } from 'claude-code'

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

