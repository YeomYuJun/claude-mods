import Names from '../names'
import { junction } from './junction.js'
import { densityOf, heightOf, treeOf } from './tree.js'
import type { Layout, LayoutInput, Placed, TreeNode, Wire } from './types.js'

export function vertical(input: LayoutInput): Layout {
  const { root, hidden, count } = treeOf(input.model, input.collapsed)
  const density = densityOf(count, input.density)
  const height = heightOf(density)
  const middle = height === 1 ? 0 : 1
  const nodes: Placed[] = []
  const wires: Wire[] = []
  let row = 0

  const place = (item: TreeNode, depth: number) => {
    const col = depth * Names.INDENT
    nodes.push({ id: item.node.id, row, col, width: Math.max(1, input.width - col), height })
    const top = row + height
    row = top
    const mids: number[] = []
    for (const child of item.children) {
      mids.push(row + middle)
      place(child, depth + 1)
    }
    const last = mids[mids.length - 1]
    if (last === undefined) return
    const midSet = new Set(mids)
    for (let at = top; at <= last; at += 1) {
      const isMid = midSet.has(at)
      const glyph = junction(true, at < last, false, isMid)
      wires.push({ row: at, col: col + 1, text: isMid ? `${glyph}──` : glyph })
    }
  }

  place(root, 0)
  wires.sort((a, b) => a.row - b.row || a.col - b.col)
  return { mode: 'vertical', density, nodes, wires, rows: row, hidden }
}
