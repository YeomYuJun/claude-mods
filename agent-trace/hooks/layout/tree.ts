import Names from '../names'
import type { TraceModel } from '../model'
import type { Density, TreeNode } from './types.js'

export function heightOf(density: Density): number {
  return density === 'compact' ? 1 : 4
}

export function densityOf(count: number, density?: Density): Density {
  return density ?? (count > Names.COMPACT_OVER ? 'compact' : 'normal')
}

export function treeOf(model: TraceModel, collapsed: ReadonlySet<string>) {
  const byParent = new Map<string, TreeNode[]>()
  const all = new Map<string, TreeNode>()
  for (const node of model.nodes) {
    if (node.kind === 'shell') continue
    all.set(node.id, { node, children: [] })
  }
  for (const item of all.values()) {
    const parentId = item.node.parentId
    if (!parentId || !all.has(parentId)) continue
    const list = byParent.get(parentId) ?? []
    list.push(item)
    byParent.set(parentId, list)
  }
  const hidden: Record<string, number> = {}
  let count = 0
  let maxDepth = 0
  const countAll = (id: string): number => (byParent.get(id) ?? []).reduce((sum, child) => sum + 1 + countAll(child.node.id), 0)
  const build = (item: TreeNode, depth: number): TreeNode => {
    count += 1
    maxDepth = Math.max(maxDepth, depth)
    if (collapsed.has(item.node.id)) {
      const total = countAll(item.node.id)
      if (total > 0) hidden[item.node.id] = total
      return { node: item.node, children: [] }
    }
    return { node: item.node, children: (byParent.get(item.node.id) ?? []).map(child => build(child, depth + 1)) }
  }
  const rootItem = all.get(model.rootId) ?? { node: model.nodes[0]!, children: [] }
  const root = build(rootItem, 0)
  return { root, hidden, maxDepth, count }
}
