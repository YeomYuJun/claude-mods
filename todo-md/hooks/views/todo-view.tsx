/* @jsxRuntime classic */
/* @jsx h */
/* @jsxFrag Fragment */
import type { ElementTable, RenderElement } from 'claude-code'

import type { Messages } from '../messages'
import type { TodoDoc } from '../parse'

export type Kit = Pick<ElementTable<'terminal' | 'desktop'>, 'Box' | 'Text'>

export type TodoView =
  | { kind: 'doc'; path: string; doc: TodoDoc }
  | { kind: 'missing'; path: string }
  | { kind: 'large'; path: string; size: number }
  | { kind: 'error'; path: string; message: string }

function headOf(messages: Messages, view: TodoView): string {
  return view.kind === 'doc' ? `${view.path} · ${messages.progress(view.doc.done, view.doc.total)}` : view.path
}

function bodyOf(kit: Kit, messages: Messages, view: TodoView): RenderElement {
  const { Box, Text: T } = kit
  if (view.kind === 'missing') return <T dimColor>{messages.missing}</T>
  if (view.kind === 'large') return <T dimColor>{messages.tooLarge(Math.ceil(view.size / 1024))}</T>
  if (view.kind === 'error') return <T color="red">{messages.readFailed(view.message)}</T>
  if (view.doc.total === 0) return <T dimColor>{messages.noItems}</T>
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

export function todoView(input: { kit: Kit; messages: Messages; view: TodoView }): RenderElement {
  const { Box, Text: T } = input.kit
  return (
    <Box flexDirection="column">
      <T dimColor wrap="truncate-end">{headOf(input.messages, input.view)}</T>
      {bodyOf(input.kit, input.messages, input.view)}
    </Box>
  )
}
