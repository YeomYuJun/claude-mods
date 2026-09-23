/* @jsxRuntime classic */
/* @jsx h */
/* @jsxFrag Fragment */
import type { RenderElement } from 'claude-code'

import { statusOf, type TraceModel } from '../model'
import Text from '../text'
import { fileUrlOf } from './files-view.jsx'
import { dotOf, metaLineOf, STATUS_WORD, type Act, type Kit } from './flow-view.jsx'

const RUN_MODE = { background: '백그라운드', foreground: '포그라운드' } as const
const PROMPT_LINES = 12
const TOOL_ROWS = 15

export function detailView(input: { kit: Kit; model: TraceModel; id: string; width: number; now: number; act: Act; canStop: boolean; stop: (id: string) => void }): RenderElement {
  const { Box, Text: T, Button, Markdown } = input.kit
  const node = input.model.nodes.find(item => item.id === input.id)
  if (!node) {
    return <Button key="back" plain onPress={() => input.act({ type: 'back' })}>← (사라진 노드)</Button>
  }
  const parent = input.model.nodes.find(item => item.id === node.parentId)
  const raw = node.rawStatus !== undefined && statusOf(node.rawStatus) !== node.status ? ` (엔진 값: ${node.rawStatus})` : ''
  const head = [`${STATUS_WORD[node.status]}${raw}`, node.kind === 'teammate' ? '팀원' : undefined, node.agentType, node.model && Text.modelNameOf(node.model), node.runMode && RUN_MODE[node.runMode]].filter(Boolean).join(' · ')
  const members = input.model.nodes.filter(item => item.parentId === node.id)
  const sent = (node.sentTo ?? []).map(item => `→ ${item.to} ×${item.count}`).join('  ')
  const hasCalls = node.kind !== 'session' && node.kind !== 'team'
  const prompt = (node.prompt ?? '').split('\n').slice(0, PROMPT_LINES).join('\n')
  const calls = [...node.toolCalls].reverse().slice(0, TOOL_ROWS)
  const isStoppable = input.canStop && (node.status === 'running' || (node.status === 'idle' && node.kind === 'teammate')) && (node.kind === 'subagent' || node.kind === 'teammate')

  return (
    <Box flexDirection="column">
      <Button key="back" plain onPress={() => input.act({ type: 'back' })}>{`← ${dotOf(node.status)} ${Text.clip(node.label, Math.max(1, input.width - 6))}`}</Button>
      {node.kind === 'session' ? null : <T dimColor>{head}</T>}
      {parent ? <T dimColor>{`부모 ${parent.label}`}</T> : null}
      <T dimColor>{metaLineOf(node, input.now)}</T>
      {sent ? <T dimColor>{`보냄 ${sent}`}</T> : null}
      {node.status === 'running' && node.nowTool ? <T>{`지금  ${node.nowTool}`}</T> : null}
      {prompt ? <T bold>지시문</T> : null}
      {prompt ? <T wrap="wrap">{prompt}</T> : null}
      {node.kind === 'team' ? <T bold>{`멤버 (${members.length})`}</T> : null}
      {node.kind === 'team' ? members.map(member => (
        <T key={`m:${member.id}`} wrap="truncate-end">{`${dotOf(member.status)}  ${member.label}`}</T>
      )) : null}
      {hasCalls ? <T bold>{`도구 호출 (${node.toolCalls.length})`}</T> : null}
      {hasCalls ? calls.map(call => (
        <T key={`c:${call.id}`} wrap="truncate-end">{`${call.ok === undefined ? '●' : call.ok ? '✓' : '✗'}  ${call.name}  ${call.summary}`}</T>
      )) : null}
      {node.transcriptPath ? <Markdown text={`[기록 열기](${fileUrlOf(node.transcriptPath)})`} /> : null}
      {isStoppable ? <Button key="stop" onPress={() => input.stop(node.id)}>에이전트 정지</Button> : null}
      {node.stopNote ? <T color={node.stopNote.isError ? 'red' : undefined} dimColor={!node.stopNote.isError} wrap="wrap">{`${node.stopNote.isError ? '정지 실패' : '정지'}: ${node.stopNote.text}`}</T> : null}
    </Box>
  )
}
