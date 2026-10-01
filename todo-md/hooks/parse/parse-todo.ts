export type TodoLine =
  | { kind: 'heading'; level: number; text: string }
  | { kind: 'task'; depth: number; isDone: boolean; text: string }

export type TodoDoc = { lines: TodoLine[]; done: number; total: number }

const FENCE_OPEN = /^ {0,3}(`{3,}|~{3,})/
const FENCE_CLOSE = /^ {0,3}(`{3,}|~{3,})[ \t]*$/
const HEADING = /^ {0,3}(#{1,6})(?:[ \t]+(.*?))?[ \t]*$/
const CLOSING_HASHES = /(?:^|[ \t]+)#+$/
const TASK = /^([ \t]*)(?:[-*+]|\d{1,9}[.)])[ \t]+\[([ xX])\](?:[ \t]+(.*?))?[ \t]*$/

function widthOf(indent: string): number {
  let width = 0
  for (const char of indent) width += char === '\t' ? 4 : 1
  return width
}

// 한 줄에서 HTML 주석 구간을 지운다. 줄 끝까지 닫히지 않으면 다음 줄로 넘긴다.
function withoutComments(line: string, inComment: boolean): { text: string; inComment: boolean } {
  let rest = line
  let text = ''
  let open = inComment
  while (rest !== '') {
    if (open) {
      const end = rest.indexOf('-->')
      if (end < 0) return { text, inComment: true }
      rest = rest.slice(end + 3)
      open = false
      continue
    }
    const start = rest.indexOf('<!--')
    if (start < 0) return { text: text + rest, inComment: false }
    text += rest.slice(0, start)
    rest = rest.slice(start + 4)
    open = true
  }
  return { text, inComment: open }
}

// 하위 제목까지 포함해 체크리스트 항목이 하나라도 있는 제목만 남긴다.
function withTasksOnly(lines: TodoLine[]): TodoLine[] {
  return lines.filter((line, index) => {
    if (line.kind === 'task') return true
    for (const next of lines.slice(index + 1)) {
      if (next.kind === 'task') return true
      if (next.level <= line.level) return false
    }
    return false
  })
}

export function todoOf(source: string): TodoDoc {
  const lines: TodoLine[] = []
  let fence: { char: string; length: number } | undefined
  let inComment = false
  let indents: number[] = []
  for (const raw of source.replace(/^﻿/, '').split(/\r?\n/)) {
    if (fence) {
      const close = FENCE_CLOSE.exec(raw)?.[1]
      if (close && close[0] === fence.char && close.length >= fence.length) fence = undefined
      continue
    }
    if (!inComment) {
      const open = FENCE_OPEN.exec(raw)?.[1]
      if (open) {
        fence = { char: open[0] ?? '`', length: open.length }
        continue
      }
    }
    const stripped = withoutComments(raw, inComment)
    inComment = stripped.inComment
    const heading = HEADING.exec(stripped.text)
    if (heading) {
      lines.push({ kind: 'heading', level: heading[1]?.length ?? 1, text: (heading[2] ?? '').replace(CLOSING_HASHES, '').trim() })
      indents = []
      continue
    }
    const task = TASK.exec(stripped.text)
    if (!task) continue
    const indent = widthOf(task[1] ?? '')
    while (indents.length > 0 && (indents[indents.length - 1] ?? 0) >= indent) indents.pop()
    lines.push({ kind: 'task', depth: indents.length, isDone: task[2] !== ' ', text: task[3] ?? '' })
    indents.push(indent)
  }
  const kept = withTasksOnly(lines)
  const tasks = kept.filter(line => line.kind === 'task')
  return { lines: kept, done: tasks.filter(line => line.isDone).length, total: tasks.length }
}
