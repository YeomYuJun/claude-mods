/* @jsxRuntime classic */
/* @jsx h */
/* @jsxFrag Fragment */
import type { RenderElement } from 'claude-code'

import Layout, { type Density } from '../layout'
import type { TraceModel } from '../model'
import type { PaneState } from '../pane-state'
import { detailView } from './detail-view.jsx'
import { filesView } from './files-view.jsx'
import { contentRowsOf, flowView, type Act, type Kit } from './flow-view.jsx'

export const HEAD_ROWS = 3
const AGENT_KINDS = new Set(['subagent', 'teammate', 'workflow', 'workflowAgent'])

export function summaryOf(model: TraceModel): string {
  const agents = model.nodes.filter(node => AGENT_KINDS.has(node.kind))
  const running = agents.filter(node => node.status === 'running').length
  const idle = agents.filter(node => node.status === 'idle').length
  const failed = agents.filter(node => node.status === 'failed').length
  return `${agents.length} agent${agents.length === 1 ? '' : 's'} · 실행 ${running} · 대기 ${idle} · 실패 ${failed}`
}

export function paneView(input: { kit: Kit; model: TraceModel; state: PaneState; width: number; rows: number; now: number; act: Act; canStop: boolean; stop: (id: string) => void }): { tree: RenderElement; maxTop: number; density: Density } {
  const { kit, model, state, width, now, act } = input
  const { Box, Text: T, Button } = kit
  const bodyRows = Math.max(1, input.rows - HEAD_ROWS)
  const layout = Layout.layoutOf({ model, width, density: state.density, collapsed: state.collapsed })
  const maxTop = Math.max(0, contentRowsOf(model, layout) - bodyRows)

  const body = state.detail !== undefined
    ? detailView({ kit, model, id: state.detail, width, now, act, canStop: input.canStop, stop: input.stop })
    : state.tab === 'files'
      ? filesView({ kit, model, width })
      : flowView({ kit, model, layout, top: Math.min(state.top, maxTop), rows: bodyRows, now, act })

  const tree = (
    <Box flexDirection="column">
      <Box flexDirection="row">
        <Button key="tab:flow" plain dimColor={state.tab !== 'flow'} onPress={() => act({ type: 'tab', tab: 'flow' })}>흐름</Button>
        <T dimColor>{' │ '}</T>
        <Button key="tab:files" plain dimColor={state.tab !== 'files'} onPress={() => act({ type: 'tab', tab: 'files' })}>파일</Button>
        <T dimColor>{'   '}</T>
        <Button key="density" plain dimColor hotkey="d" onPress={() => act({ type: 'density', current: layout.density })}>{layout.density === 'normal' ? '압축' : '기본'}</Button>
      </Box>
      <T dimColor>{summaryOf(model)}</T>
      <T dimColor>{'─'.repeat(Math.max(1, width))}</T>
      {body}
    </Box>
  )
  return { tree, maxTop, density: layout.density }
}
