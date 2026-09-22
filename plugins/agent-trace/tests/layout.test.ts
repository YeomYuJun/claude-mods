import { describe, expect, test } from 'claude-code/testing'

import Layout from '../hooks/layout'
import type { TraceModel, TraceNode } from '../hooks/model'

function node(id: string, parentId: string | undefined, extra: Partial<TraceNode> = {}): TraceNode {
  return { id, kind: parentId ? 'subagent' : 'session', label: id, parentId, depth: 0, status: 'running', toolCalls: [], ...extra }
}

const MODEL: TraceModel = {
  rootId: 'S',
  files: [],
  nodes: [node('S', undefined), node('a', 'S'), node('b', 'S'), node('b1', 'b'), node('sh', 'S', { kind: 'shell' })],
}

describe('layout', () => {
  test('junction glyphs', () => {
    expect(Layout.junction(true, true, false, true)).toBe('├')
    expect(Layout.junction(true, false, false, true)).toBe('└')
    expect(Layout.junction(false, true, false, true)).toBe('┌')
    expect(Layout.junction(true, true, false, false)).toBe('│')
    expect(Layout.junction(false, false, true, true)).toBe('─')
    expect(Layout.junction(true, true, true, true)).toBe('┼')
    expect(Layout.junction(true, true, true, false)).toBe('┤')
  })

  test('shells stay out of the tree, collapsed children are counted', () => {
    const tree = Layout.treeOf(MODEL, new Set(['b']))
    expect(tree.root.children.map(child => child.node.id)).toEqual(['a', 'b'])
    expect(tree.root.children[1]?.children).toEqual([])
    expect(tree.hidden).toEqual({ b: 1 })
    expect(tree.count).toBe(3)
  })

  test('vertical compact places one row per node, indented by depth', () => {
    const layout = Layout.vertical({ model: MODEL, width: 40, density: 'compact', collapsed: new Set() })
    expect(layout.nodes.map(item => [item.id, item.row, item.col, item.width])).toEqual([
      ['S', 0, 0, 40], ['a', 1, 4, 36], ['b', 2, 4, 36], ['b1', 3, 8, 32],
    ])
    expect(layout.rows).toBe(4)
    expect(layout.wires).toEqual([
      { row: 1, col: 1, text: '├──' },
      { row: 2, col: 1, text: '└──' },
      { row: 3, col: 5, text: '└──' },
    ])
  })

  test('vertical normal boxes are four rows and the trunk reaches the middle row', () => {
    const layout = Layout.vertical({ model: { ...MODEL, nodes: MODEL.nodes.slice(0, 3) }, width: 40, density: 'normal', collapsed: new Set() })
    expect(layout.nodes.map(item => [item.id, item.row, item.height])).toEqual([['S', 0, 4], ['a', 4, 4], ['b', 8, 4]])
    expect(layout.wires).toEqual([
      { row: 4, col: 1, text: '│' },
      { row: 5, col: 1, text: '├──' },
      { row: 6, col: 1, text: '│' },
      { row: 7, col: 1, text: '│' },
      { row: 8, col: 1, text: '│' },
      { row: 9, col: 1, text: '└──' },
    ])
  })

  test('density turns compact past twenty nodes unless chosen', () => {
    expect(Layout.densityOf(20)).toBe('normal')
    expect(Layout.densityOf(21)).toBe('compact')
    expect(Layout.densityOf(21, 'normal')).toBe('normal')
  })

  test('column width decides horizontal or vertical', () => {
    expect(Layout.columnWidthOf(80, 1)).toBe(38)
    expect(Layout.layoutOf({ model: MODEL, width: 80, density: 'compact', collapsed: new Set() }).mode).toBe('horizontal')
    expect(Layout.layoutOf({ model: MODEL, width: 60, density: 'compact', collapsed: new Set() }).mode).toBe('vertical')
  })

  test('horizontal centres a parent over its children', () => {
    const layout = Layout.horizontal({ model: MODEL, width: 90, density: 'compact', collapsed: new Set() }, 28)
    expect(layout.nodes.map(item => [item.id, item.row, item.col, item.width])).toEqual([
      ['S', 0, 0, 28], ['a', 0, 31, 28], ['b', 1, 31, 28], ['b1', 1, 62, 28],
    ])
    expect(layout.wires).toEqual([
      { row: 0, col: 28, text: '─' },
      { row: 0, col: 29, text: '┬' },
      { row: 0, col: 30, text: '─' },
      { row: 1, col: 29, text: '└' },
      { row: 1, col: 30, text: '─' },
      { row: 1, col: 59, text: '─' },
      { row: 1, col: 60, text: '─' },
      { row: 1, col: 61, text: '─' },
    ])
    expect(layout.rows).toBe(2)
  })
})
