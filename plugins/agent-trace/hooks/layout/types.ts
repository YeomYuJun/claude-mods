import type { TraceModel, TraceNode } from '../model'

export type Density = 'normal' | 'compact'
export type Placed = { id: string; row: number; col: number; width: number; height: number }
export type Wire = { row: number; col: number; text: string }
export type Layout = { mode: 'horizontal' | 'vertical'; density: Density; nodes: Placed[]; wires: Wire[]; rows: number; hidden: Record<string, number> }
export type LayoutInput = { model: TraceModel; width: number; density?: Density; collapsed: ReadonlySet<string> }
export type TreeNode = { node: TraceNode; children: TreeNode[] }
