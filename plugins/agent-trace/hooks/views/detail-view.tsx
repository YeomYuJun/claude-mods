/* @jsxRuntime classic */
/* @jsx h */
/* @jsxFrag Fragment */
import type { RenderElement } from 'claude-code'

import type { Status, TraceModel } from '../model'
import Text from '../text'
import { fileUrlOf } from './files-view.jsx'
import { dotOf, metaLineOf, type Act, type Kit } from './flow-view.jsx'

const WORD: Record<Status, string> = { running: 'Working', done: 'Done', failed: 'Failed', stopped: 'Stopped' }
const PROMPT_LINES = 12
const TOOL_ROWS = 15

export function detailView(input: { kit: Kit; model: TraceModel; id: string; width: number; now: number; act: Act; canStop: boolean; stop: (id: string) => void }): RenderElement {
  const { Box, Text: T, Button, Markdown } = input.kit
  const node = input.model.nodes.find(item => item.id === input.id)
  if (!node) {
    return <Button key="back" plain onPress={() => input.act({ type: 'back' })}>← (사라진 노드)</Button>
  }
  const parent = input.model.nodes.find(item => item.id === node.parentId)
  const head = [WORD[node.status], node.agentType, node.model, node.runMode].filter(Boolean).join(' · ')
  const prompt = (node.prompt ?? '').split('\n').slice(0, PROMPT_LINES).join('\n')
  const calls = [...node.toolCalls].reverse().slice(0, TOOL_ROWS)
  const isStoppable = input.canStop && node.status === 'running' && (node.kind === 'subagent' || node.kind === 'teammate')

  return (
    <Box flexDirection="column">
      <Button key="back" plain onPress={() => input.act({ type: 'back' })}>{`← ${dotOf(node.status)} ${Text.clip(node.label, Math.max(1, input.width - 6))}`}</Button>
      <T dimColor>{head}</T>
      {parent ? <T dimColor>{`Spawned by ${parent.label}`}</T> : null}
      <T dimColor>{metaLineOf(node, input.now)}</T>
      {node.status === 'running' && node.nowTool ? <T>{`Now  ${node.nowTool}`}</T> : null}
      {prompt ? <T bold>Prompt</T> : null}
      {prompt ? <T wrap="wrap">{prompt}</T> : null}
      <T bold>{`Tool calls (${node.toolCalls.length})`}</T>
      {calls.map(call => (
        <T key={`c:${call.id}`} wrap="truncate-end">{`${call.ok === undefined ? '●' : call.ok ? '✓' : '✗'}  ${call.name}  ${call.summary}`}</T>
      ))}
      {node.transcriptPath ? <Markdown text={`[Open transcript](${fileUrlOf(node.transcriptPath)})`} /> : null}
      {isStoppable ? <Button key="stop" onPress={() => input.stop(node.id)}>Stop agent</Button> : null}
    </Box>
  )
}
