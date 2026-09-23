/* @jsxRuntime classic */
/* @jsx h */
/* @jsxFrag Fragment */
import type { RenderElement } from 'claude-code'

import type { TraceModel } from '../model'
import Text from '../text'
import type { Kit } from './flow-view.jsx'

export type FileRow = { path: string; reads: number; edits: number; writes: number; nodes: string[]; isConflict: boolean }

function keyOf(path: string): string {
  return path.replace(/\\/g, '/').toLowerCase()
}

export function fileRowsOf(model: TraceModel): FileRow[] {
  const labels = new Map(model.nodes.map(node => [node.id, node.label]))
  const rows = new Map<string, FileRow & { editors: Set<string>; nodeSet: Set<string> }>()
  for (const access of model.files) {
    const key = keyOf(access.path)
    const row = rows.get(key) ?? { path: access.path, reads: 0, edits: 0, writes: 0, nodes: [], isConflict: false, editors: new Set<string>(), nodeSet: new Set<string>() }
    if (access.op === 'read') row.reads += 1
    if (access.op === 'edit') row.edits += 1
    if (access.op === 'write') row.writes += 1
    if (access.op !== 'read') row.editors.add(access.nodeId)
    row.nodeSet.add(labels.get(access.nodeId) ?? access.nodeId)
    rows.set(key, row)
  }
  return [...rows.values()]
    .map(({ editors, nodeSet, ...row }) => ({ ...row, nodes: [...nodeSet].sort(), isConflict: editors.size > 1 }))
    .sort((a, b) => Number(b.isConflict) - Number(a.isConflict) || a.path.localeCompare(b.path))
}

export function filesView(input: { kit: Kit; model: TraceModel; width: number }): RenderElement {
  const { Box, Text: T } = input.kit
  const rows = fileRowsOf(input.model)
  return (
    <Box flexDirection="column">
      {rows.map(row => (
        <Box key={`f:${row.path}`} flexDirection="column">
          <Box flexDirection="row">
            {row.isConflict ? <T bold color="yellow">충돌 가능 </T> : null}
            <T>{Text.clipStart(row.path.replace(/\\/g, '/'), Math.max(1, input.width - (row.isConflict ? 7 : 0)))}</T>
          </Box>
          <T dimColor wrap="truncate-end">{`  읽기 ${row.reads} · 편집 ${row.edits} · 쓰기 ${row.writes} · ${row.nodes.join(', ')}`}</T>
        </Box>
      ))}
      <T dimColor>Bash 로 바꾼 파일은 빠져 있음</T>
    </Box>
  )
}
