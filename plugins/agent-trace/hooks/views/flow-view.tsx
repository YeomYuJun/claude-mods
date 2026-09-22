/* @jsxRuntime classic */
/* @jsx h */
/* @jsxFrag Fragment */
import type { ElementTable, RenderElement } from 'claude-code'

import type { Layout } from '../layout'
import type { Status, TraceModel, TraceNode } from '../model'
import type { PaneAction } from '../pane-state'
import Text from '../text'

export type Kit = Pick<ElementTable<'terminal' | 'desktop'>, 'Box' | 'Text' | 'Button' | 'Markdown'>
export type Act = (action: PaneAction) => void

const DOT_COLOR: Record<Status, string> = { running: 'green', done: 'gray', failed: 'red', stopped: 'gray' }

export function dotOf(status: Status): string {
  return status === 'stopped' ? '■' : '●'
}

export function metaLineOf(node: TraceNode, now: number): string {
  if (node.kind === 'session') {
    const context = node.contextTokens === undefined ? '' : ` · ${Text.tokensOf(node.contextTokens)} in context`
    return `${node.model ?? ''}${context}`
  }
  const elapsed = node.startedAt === undefined ? '' : Text.durationOf((node.status === 'running' ? now : node.endedAt ?? now) - node.startedAt)
  const tokens = node.tokens === undefined ? '' : Text.tokensOf(node.tokens)
  const phase = node.phase ? `${'▰'.repeat(node.phase.done)}${'▱'.repeat(Math.max(0, node.phase.total - node.phase.done))} ${node.phase.done}/${node.phase.total}` : ''
  const sent = (node.sentTo ?? []).map(item => `→ ${item.to} ×${item.count}`).join(' ')
  return [elapsed, tokens, phase, sent, node.note === 'too-large' ? '기록이 커서 요약만' : ''].filter(Boolean).join(' · ')
}

export function flowView(input: { kit: Kit; model: TraceModel; layout: Layout; top: number; rows: number; now: number; act: Act }): RenderElement {
  const { kit, model, layout, top, rows, now, act } = input
  const { Box, Text: T, Button } = kit
  const byId = new Map(model.nodes.map(node => [node.id, node]))
  const hasChildren = new Set(model.nodes.filter(node => node.kind !== 'shell').map(node => node.parentId).filter(Boolean) as string[])
  const visible = (row: number, height: number) => row + height > top && row < top + rows

  const nodeViews = layout.nodes.filter(placed => visible(placed.row, placed.height)).map(placed => {
    const node = byId.get(placed.id)!
    const hidden = layout.hidden[node.id]
    const canFold = hasChildren.has(node.id) || hidden !== undefined
    const inner = placed.width - (layout.density === 'compact' ? 0 : 4) - (canFold ? 2 : 0)
    const title = Text.clip(`${node.label}${hidden ? ` +${hidden}` : ''}`, Math.max(1, inner - 2))
    const meta = metaLineOf(node, now)
    const border = layout.density === 'compact' ? {} : { borderStyle: node.kind === 'team' ? 'double' : 'round', paddingX: 1 }
    return (
      <Box key={`n:${node.id}`} position="absolute" top={placed.row - top} left={placed.col} width={placed.width} height={placed.height} flexDirection="column" {...border}>
        <Box flexDirection="row">
          <T color={DOT_COLOR[node.status]}>{`${dotOf(node.status)} `}</T>
          <Button key={`node:${node.id}`} plain onPress={() => act({ type: 'open', id: node.id })}>{title}</Button>
          {canFold ? <Button key={`fold:${node.id}`} plain dimColor onPress={() => act({ type: 'toggle', id: node.id })}>{hidden ? ' ▸' : ' ▾'}</Button> : null}
          {layout.density === 'compact' ? <T dimColor wrap="truncate-end">{`  ${meta}`}</T> : null}
        </Box>
        {layout.density === 'compact' ? null : <T dimColor wrap="truncate-end">{meta}</T>}
      </Box>
    )
  })

  const wireViews = layout.wires.filter(wire => visible(wire.row, 1)).map(wire => (
    <Box key={`w:${wire.row}:${wire.col}`} position="absolute" top={wire.row - top} left={wire.col}>
      <T dimColor>{wire.text}</T>
    </Box>
  ))

  const shells = model.nodes.filter(node => node.kind === 'shell')
  const shellTop = layout.rows + 1
  const shellViews = shells.length === 0 ? [] : [
    <Box key="shells:head" position="absolute" top={shellTop - top} left={0}>
      <T dimColor>{`${shells.length} background task${shells.length > 1 ? 's' : ''}`}</T>
    </Box>,
    ...shells.map((shell, index) => (
      <Box key={`s:${shell.id}`} position="absolute" top={shellTop + 1 + index - top} left={0} flexDirection="row">
        <T color={DOT_COLOR[shell.status]}>{`${dotOf(shell.status)} `}</T>
        <Button key={`node:${shell.id}`} plain onPress={() => act({ type: 'open', id: shell.id })}>{Text.clip(shell.label, 40)}</Button>
        <T dimColor>{` · shell · ${shell.startedAt === undefined ? '' : Text.durationOf((shell.status === 'running' ? now : shell.endedAt ?? now) - shell.startedAt)}`}</T>
      </Box>
    )).filter((_, index) => visible(shellTop + 1 + index, 1)),
  ]

  return <Box position="relative" height={rows} flexDirection="column">{[...wireViews, ...nodeViews, ...shellViews]}</Box>
}

export function contentRowsOf(model: TraceModel, layout: Layout): number {
  const shells = model.nodes.filter(node => node.kind === 'shell').length
  return layout.rows + (shells === 0 ? 0 : shells + 2)
}
