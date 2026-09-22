/* @jsxRuntime classic */
/* @jsx h */
/* @jsxFrag Fragment */
import type { RenderElement } from 'claude-code'

import type { TraceModel } from '../model'
import Text from '../text'
import type { Kit } from './flow-view.jsx'

export type FileRow = { path: string; reads: number; edits: number; writes: number; nodes: string[]; isConflict: boolean }

export function fileUrlOf(path: string): string {
  const slashed = path.replace(/\\/g, '/')
  return `file:///${encodeURI(slashed.replace(/^\/+/, ''))}`
}

export function fileRowsOf(model: TraceModel): FileRow[] {
  const labels = new Map(model.nodes.map(node => [node.id, node.label]))
  const rows = new Map<string, FileRow & { editors: Set<string>; nodeSet: Set<string> }>()
  for (const access of model.files) {
    const row = rows.get(access.path) ?? { path: access.path, reads: 0, edits: 0, writes: 0, nodes: [], isConflict: false, editors: new Set<string>(), nodeSet: new Set<string>() }
    if (access.op === 'read') row.reads += 1
    if (access.op === 'edit') row.edits += 1
    if (access.op === 'write') row.writes += 1
    if (access.op !== 'read') row.editors.add(access.nodeId)
    row.nodeSet.add(labels.get(access.nodeId) ?? access.nodeId)
    rows.set(access.path, row)
  }
  return [...rows.values()]
    .map(({ editors, nodeSet, ...row }) => ({ ...row, nodes: [...nodeSet].sort(), isConflict: editors.size > 1 }))
    .sort((a, b) => Number(b.isConflict) - Number(a.isConflict) || a.path.localeCompare(b.path))
}

export function filesView(input: { kit: Kit; model: TraceModel; width: number }): RenderElement {
  const { Box, Text: T, Markdown } = input.kit
  const rows = fileRowsOf(input.model)
  return (
    <Box flexDirection="column">
      {rows.map(row => (
        <Box key={`f:${row.path}`} flexDirection="column">
          <Markdown>{`${row.isConflict ? '**충돌 가능** ' : ''}[${Text.clip(row.path, input.width - 14)}](${fileUrlOf(row.path)})`}</Markdown>
          <T dimColor wrap="truncate-end">{`  R${row.reads} E${row.edits} W${row.writes} · ${row.nodes.join(', ')}`}</T>
        </Box>
      ))}
      <T dimColor>Bash 로 바꾼 파일은 빠져 있음</T>
    </Box>
  )
}
