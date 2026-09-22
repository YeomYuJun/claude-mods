import Names from '../names'
import { columnWidthOf, horizontal } from './horizontal.js'
import { treeOf } from './tree.js'
import type { Layout, LayoutInput } from './types.js'
import { vertical } from './vertical.js'

export function layoutOf(input: LayoutInput): Layout {
  const { maxDepth } = treeOf(input.model, input.collapsed)
  const colWidth = columnWidthOf(input.width, maxDepth)
  return colWidth >= Names.MIN_COLUMN ? horizontal(input, colWidth) : vertical(input)
}
