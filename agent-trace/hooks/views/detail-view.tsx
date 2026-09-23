/* @jsxRuntime classic */
/* @jsx h */
/* @jsxFrag Fragment */
import type { RenderElement } from 'claude-code'

import { statusOf, type ToolCall, type TraceModel, type TraceNode } from '../model'
import Text from '../text'
import { dotOf, metaLineOf, STATUS_WORD, type Act, type Kit } from './flow-view.jsx'

const RUN_MODE = { background: '백그라운드', foreground: '포그라운드' } as const
const INDENT = '  '
const PROMPT_ROWS = 4
const TOOL_NAME_MIN = 7
const TOOL_NAME_MAX = 12
const TIME_CELLS = 8

type Input = {
  kit: Kit
  model: TraceModel
  id: string
  width: number
  rows?: number
  now: number
  act: Act
  canStop: boolean
  stop: (id: string) => void
  isPromptOpen?: boolean
  isCopied?: boolean
  copy?: (text: string) => void
}

function statusLineOf(node: TraceNode, now: number): string {
  if (node.kind === 'session') return metaLineOf(node, now)
  const raw = node.rawStatus !== undefined && statusOf(node.rawStatus) !== node.status ? ` (엔진 값: ${node.rawStatus})` : ''
  const elapsed = node.startedAt === undefined ? '' : Text.durationOf((node.status === 'running' ? now : node.endedAt ?? now) - node.startedAt)
  const tokens = node.tokens === undefined ? '' : Text.tokensOf(node.tokens)
  const phase = node.phase ? `${node.phase.done}/${node.phase.total} 단계` : ''
  return [`${STATUS_WORD[node.status]}${raw}`, elapsed, tokens, phase, node.note === 'too-large' ? '기록이 커서 요약만' : ''].filter(Boolean).join(' · ')
}

function fieldsOf(node: TraceNode, parentLabel: string | undefined): Array<[string, string]> {
  const kind = [node.kind === 'teammate' ? '팀원' : undefined, node.agentType === node.name ? undefined : node.agentType, node.runMode && RUN_MODE[node.runMode]].filter(Boolean).join(' · ')
  const sent = (node.sentTo ?? []).map(item => `→ ${item.to} ×${item.count}`).join('  ')
  const fields: Array<[string, string]> = []
  if (node.kind === 'session') return fields
  if (kind) fields.push(['유형', kind])
  if (node.model) fields.push(['모델', Text.modelNameOf(node.model)])
  if (parentLabel) fields.push(['부모', parentLabel])
  if (sent) fields.push(['보냄', sent])
  if (node.status === 'running' && node.nowTool) fields.push(['지금', node.nowTool])
  return fields
}

function callLineOf(call: ToolCall, startedAt: number | undefined, nameCells: number): string {
  const time = call.at !== undefined && startedAt !== undefined ? Text.durationOf(call.at - startedAt) : ''
  const glyph = call.ok === undefined ? '●' : call.ok ? '✓' : '✗'
  return `${INDENT}${time.padEnd(TIME_CELLS)}${glyph}  ${call.name.padEnd(nameCells)} ${call.summary}`
}

export function detailView(input: Input): RenderElement {
  const { Box, Text: T, Button } = input.kit
  const { width } = input
  const node = input.model.nodes.find(item => item.id === input.id)
  if (!node) {
    return <Button key="back" plain onPress={() => input.act({ type: 'back' })}>← (사라진 노드)</Button>
  }
  const parent = input.model.nodes.find(item => item.id === node.parentId)
  const fields = fieldsOf(node, parent?.label)
  const members = input.model.nodes.filter(item => item.parentId === node.id)
  const hasCalls = node.kind !== 'session' && node.kind !== 'team'
  const isStoppable = input.canStop && (node.status === 'running' || (node.status === 'idle' && node.kind === 'teammate')) && (node.kind === 'subagent' || node.kind === 'teammate')
  const canCopy = node.transcriptPath !== undefined && input.copy !== undefined

  const promptWidth = Math.max(1, width - INDENT.length)
  const clipped = Text.clipRows(node.prompt ?? '', promptWidth, PROMPT_ROWS)
  const prompt = input.isPromptOpen ? (node.prompt ?? '').trim() : clipped.text
  const promptRows = input.isPromptOpen ? clipped.rows : Math.min(clipped.rows, PROMPT_ROWS)

  const blank = (key: string) => <T key={key}> </T>
  const rule = (key: string, title: string) => (
    <Box key={key} flexDirection="row">
      <T bold>{`${INDENT}${title} `}</T>
      <T dimColor>{'─'.repeat(Math.max(1, width - Text.widthOf(`${INDENT}${title} `)))}</T>
    </Box>
  )

  // 상세는 스크롤하지 않는다. 도구 호출은 위 구역이 쓰고 남은 높이만큼만 그린다.
  const used = 2 + (isStoppable || canCopy ? 1 : 0) + (node.stopNote ? 1 : 0)
    + (fields.length > 0 ? 1 + fields.length : 0)
    + (prompt ? 2 + promptRows + (clipped.isCut ? 1 : 0) : 0)
    + (node.kind === 'team' ? 2 + members.length : 0)
    + (hasCalls ? 2 : 0)
  const room = Math.max(1, (input.rows ?? Number.MAX_SAFE_INTEGER) - used)
  const newest = [...node.toolCalls].reverse()
  const shown = newest.length > room ? newest.slice(0, Math.max(0, room - 1)) : newest
  const hidden = newest.length - shown.length
  const nameCells = Math.min(TOOL_NAME_MAX, Math.max(TOOL_NAME_MIN, ...shown.map(call => call.name.length)))

  return (
    <Box flexDirection="column">
      <Button key="back" plain onPress={() => input.act({ type: 'back' })}>{`← ${dotOf(node.status)} ${Text.clip(node.label, Math.max(1, width - 4))}`}</Button>
      <T dimColor wrap="truncate-end">{`${INDENT}${statusLineOf(node, input.now)}`}</T>
      {isStoppable || canCopy ? (
        <Box flexDirection="row">
          <T>{INDENT}</T>
          {isStoppable ? <Button key="stop" onPress={() => input.stop(node.id)}>에이전트 정지</Button> : null}
          {isStoppable && canCopy ? <T>{'  '}</T> : null}
          {canCopy ? <Button key="copy" onPress={() => { input.copy?.(node.transcriptPath ?? ''); input.act({ type: 'copied' }) }}>{input.isCopied ? '기록 경로 복사됨' : '기록 경로 복사'}</Button> : null}
        </Box>
      ) : null}
      {node.stopNote ? <T color={node.stopNote.isError ? 'red' : undefined} dimColor={!node.stopNote.isError} wrap="truncate-end">{`${INDENT}${node.stopNote.isError ? '정지 실패' : '정지'}: ${node.stopNote.text}`}</T> : null}

      {fields.length > 0 ? blank('b:fields') : null}
      {fields.map(([label, value]) => (
        <Box key={`f:${label}`} flexDirection="row">
          <T dimColor>{`${INDENT}${label}  `}</T>
          <T wrap="truncate-end">{value}</T>
        </Box>
      ))}

      {prompt ? blank('b:prompt') : null}
      {prompt ? rule('r:prompt', '지시문') : null}
      {prompt ? <Box paddingLeft={INDENT.length}><T wrap="wrap">{prompt}</T></Box> : null}
      {clipped.isCut ? <Button key="prompt" plain dimColor onPress={() => input.act({ type: 'prompt' })}>{`${INDENT}${input.isPromptOpen ? '▾ 접기' : `▸ 전체 보기 (${clipped.rows}행)`}`}</Button> : null}

      {node.kind === 'team' ? blank('b:members') : null}
      {node.kind === 'team' ? rule('r:members', `멤버 ${members.length}`) : null}
      {node.kind === 'team' ? members.map(member => (
        <T key={`m:${member.id}`} wrap="truncate-end">{`${INDENT}${dotOf(member.status)}  ${member.label}`}</T>
      )) : null}

      {hasCalls ? blank('b:calls') : null}
      {hasCalls ? rule('r:calls', `도구 호출 ${node.toolCalls.length}`) : null}
      {hasCalls ? shown.map(call => (
        <T key={`c:${call.id}`} wrap="truncate-end">{callLineOf(call, node.startedAt, nameCells)}</T>
      )) : null}
      {hasCalls && hidden > 0 ? <T dimColor>{`${INDENT}… 외 ${hidden}개`}</T> : null}
    </Box>
  )
}
