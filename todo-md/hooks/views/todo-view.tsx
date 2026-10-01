/* @jsxRuntime classic */
/* @jsx h */
/* @jsxFrag Fragment */
import type { ElementTable, RenderElement } from 'claude-code'

import type { TodoDoc } from '../parse'

export type Kit = Pick<ElementTable<'terminal' | 'desktop'>, 'Box' | 'Text'>

export type TodoView =
  | { kind: 'doc'; path: string; doc: TodoDoc }
  | { kind: 'missing'; path: string }
  | { kind: 'large'; path: string; size: number }
  | { kind: 'error'; path: string; message: string }

function headOf(view: TodoView): string {
  return view.kind === 'doc' ? `${view.path} · ${view.doc.done}/${view.doc.total} 완료` : view.path
}

function bodyOf(kit: Kit, view: TodoView): RenderElement {
  const { Box, Text: T } = kit
  if (view.kind === 'missing') return <T dimColor>파일이 없다. 만들면 바로 보인다</T>
  if (view.kind === 'large') return <T dimColor>{`파일이 ${Math.ceil(view.size / 1024)} KiB 라 읽지 않는다`}</T>
  if (view.kind === 'error') return <T color="red">{`읽지 못했다: ${view.message}`}</T>
  if (view.doc.total === 0) return <T dimColor>체크리스트 항목이 없다</T>
  const levels = view.doc.lines.flatMap(line => (line.kind === 'heading' ? [line.level] : []))
  const top = levels.length > 0 ? Math.min(...levels) : 1
  let under = 0
  return (
    <Box flexDirection="column">
      {view.doc.lines.map((line, index) => {
        if (line.kind === 'heading') {
          const indent = (line.level - top) * 2
          under = indent + 2
          return (
            <Box key={`h:${index}`} paddingLeft={indent}>
              <T bold wrap="wrap">{line.text}</T>
            </Box>
          )
        }
        return (
          <Box key={`t:${index}`} flexDirection="row" paddingLeft={under + line.depth * 2}>
            <T color={line.isDone ? 'green' : undefined}>{line.isDone ? '[x] ' : '[ ] '}</T>
            <T dimColor={line.isDone} wrap="wrap">{line.text}</T>
          </Box>
        )
      })}
    </Box>
  )
}

export function todoView(input: { kit: Kit; view: TodoView }): RenderElement {
  const { Box, Text: T } = input.kit
  return (
    <Box flexDirection="column">
      <T dimColor wrap="truncate-end">{headOf(input.view)}</T>
      {bodyOf(input.kit, input.view)}
    </Box>
  )
}
