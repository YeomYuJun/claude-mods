import Names from '../names'
import { junction } from './junction.js'
import { densityOf, heightOf, treeOf } from './tree.js'
import type { Layout, LayoutInput, Placed, TreeNode, Wire } from './types.js'

export function columnWidthOf(width: number, maxDepth: number): number {
  return Math.floor((width - maxDepth * Names.GAP) / (maxDepth + 1))
}

export function horizontal(input: LayoutInput, colWidth: number): Layout {
  const { root, hidden, count } = treeOf(input.model, input.collapsed)
  const density = densityOf(count, input.density)
  const height = heightOf(density)
  const middle = height === 1 ? 0 : 1
  const nodes: Placed[] = []
  const wires: Wire[] = []

  const place = (item: TreeNode, depth: number, top: number): { row: number; bottom: number } => {
    const col = depth * (colWidth + Names.GAP)
    if (item.children.length === 0) {
      nodes.push({ id: item.node.id, row: top, col, width: colWidth, height })
      return { row: top, bottom: top + height }
    }
    let cursor = top
    const childRows: number[] = []
    const slot = nodes.length
    nodes.push({ id: item.node.id, row: top, col, width: colWidth, height })
    for (const child of item.children) {
      const placed = place(child, depth + 1, cursor)
      childRows.push(placed.row + middle)
      cursor = placed.bottom
    }
    const firstRow = childRows[0]! - middle
    const row = Math.max(top, Math.floor((firstRow + cursor - height) / 2))
    nodes[slot] = { id: item.node.id, row, col, width: colWidth, height }

    const parentMid = row + middle
    const trunk = col + colWidth + 1
    const low = Math.min(parentMid, ...childRows)
    const high = Math.max(parentMid, ...childRows)
    const childSet = new Set(childRows)
    wires.push({ row: parentMid, col: col + colWidth, text: '─' })
    for (let at = low; at <= high; at += 1) {
      wires.push({ row: at, col: trunk, text: junction(at > low, at < high, at === parentMid, childSet.has(at)) })
    }
    for (const at of childRows) wires.push({ row: at, col: trunk + 1, text: '─' })
    return { row, bottom: Math.max(cursor, row + height) }
  }

  const { bottom } = place(root, 0, 0)
  wires.sort((a, b) => a.row - b.row || a.col - b.col)
  return { mode: 'horizontal', density, nodes, wires, rows: bottom, hidden }
}
