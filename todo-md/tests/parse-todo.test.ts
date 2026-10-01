import { describe, expect, test } from 'claude-code/testing'

import Parse from '../hooks/parse'

describe('todoOf', () => {
  test('todo.md sample: headings, checkboxes, sub-task, trailing tags', () => {
    const doc = Parse.todoOf([
      '# Example of TODO.md',
      '',
      'This is an example of TODO.md',
      '',
      '### Todo',
      '',
      '- [ ] Work on the website ~3d #feat @john 2020-03-20  ',
      '- [ ] Fix the homepage ~1d #bug @jane  ',
      '  - [ ] Sub-task or description  ',
      '',
      '### In Progress',
      '',
      '- [ ] Work on Github Repo [JIRA-345]  ',
      '',
      '### Done ✓',
      '',
      '- [x] Create my first TODO.md  ',
    ].join('\n'))

    expect(doc.lines).toEqual([
      { kind: 'heading', level: 1, text: 'Example of TODO.md' },
      { kind: 'heading', level: 3, text: 'Todo' },
      { kind: 'task', depth: 0, isDone: false, text: 'Work on the website ~3d #feat @john 2020-03-20' },
      { kind: 'task', depth: 0, isDone: false, text: 'Fix the homepage ~1d #bug @jane' },
      { kind: 'task', depth: 1, isDone: false, text: 'Sub-task or description' },
      { kind: 'heading', level: 3, text: 'In Progress' },
      { kind: 'task', depth: 0, isDone: false, text: 'Work on Github Repo [JIRA-345]' },
      { kind: 'heading', level: 3, text: 'Done ✓' },
      { kind: 'task', depth: 0, isDone: true, text: 'Create my first TODO.md' },
    ])
    expect(doc.done).toBe(1)
    expect(doc.total).toBe(5)
  })

  test('drops headings whose section has no task, keeps parents of sections that do', () => {
    const doc = Parse.todoOf([
      '# Project',
      '## Notes',
      'plain text only',
      '- bullet without checkbox',
      '## Work',
      '### Empty',
      '### Backend',
      '- [ ] api',
    ].join('\n'))

    expect(doc.lines.map(line => (line.kind === 'heading' ? `${line.level}:${line.text}` : line.text))).toEqual(['1:Project', '2:Work', '3:Backend', 'api'])
  })

  test('ignores fenced code and HTML comments', () => {
    const doc = Parse.todoOf([
      '## Real',
      '- [ ] kept',
      '```',
      '# not a heading',
      '- [ ] not a task',
      '```',
      '~~~~',
      '- [x] still code',
      '~~~',
      '- [ ] still code, short fence does not close',
      '~~~~',
      '<!-- - [ ] hidden -->',
      '<!--',
      '## Hidden',
      '- [ ] hidden too',
      '-->',
      '- [x] after comment',
    ].join('\n'))

    expect(doc.lines).toEqual([
      { kind: 'heading', level: 2, text: 'Real' },
      { kind: 'task', depth: 0, isDone: false, text: 'kept' },
      { kind: 'task', depth: 0, isDone: true, text: 'after comment' },
    ])
  })

  test('BOM, CRLF, upper X, ordered and starred items, closing hashes, tabs', () => {
    const doc = Parse.todoOf('﻿## Title ##\r\n1. [X] first\r\n* [ ] second\r\n\t- [ ] tabbed child\r\n#hashtag is not a heading\r\n')

    expect(doc.lines).toEqual([
      { kind: 'heading', level: 2, text: 'Title' },
      { kind: 'task', depth: 0, isDone: true, text: 'first' },
      { kind: 'task', depth: 0, isDone: false, text: 'second' },
      { kind: 'task', depth: 1, isDone: false, text: 'tabbed child' },
    ])
  })

  test('nesting depth follows indent stack, not fixed widths', () => {
    const doc = Parse.todoOf(['- [ ] a', '    - [ ] b', '        - [ ] c', '    - [ ] d', '- [ ] e'].join('\n'))

    expect(doc.lines.map(line => (line.kind === 'task' ? line.depth : -1))).toEqual([0, 1, 2, 1, 0])
  })

  test('tasks before the first heading have no heading', () => {
    const doc = Parse.todoOf(['- [ ] loose', '## Later', 'text'].join('\n'))

    expect(doc.lines).toEqual([{ kind: 'task', depth: 0, isDone: false, text: 'loose' }])
  })
})
