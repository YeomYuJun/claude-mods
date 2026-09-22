import { describe, expect, test } from 'claude-code/testing'
import type { SessionMessage } from 'claude-code'

import Collect from '../hooks/collect'

const NOTE = '<task-notification>\n<task-id>b1</task-id>\n<tool-use-id>toolu_sh</tool-use-id>\n<status>completed</status>\n<summary>done</summary>\n</task-notification>'

const MESSAGES: SessionMessage[] = [
  { role: 'assistant', text: '', toolUses: [
    { tool_use_id: 'toolu_sh', tool: 'Bash', input: { command: 'cd "d:/PaaS"; sleep 30', run_in_background: true } },
    { tool_use_id: 'toolu_fg', tool: 'Bash', input: { command: 'ls' } },
    { tool_use_id: 'toolu_rd', tool: 'Read', input: { file_path: 'D:/work/a.ts' } },
  ] },
  { role: 'user', text: NOTE, toolUses: [] },
]

describe('mainOf', () => {
  test('background shells become nodes, foreground ones do not', () => {
    const firstSeen = new Map<string, number>()
    const facts = Collect.mainOf({ rootId: 'S1', messages: MESSAGES, firstSeen, now: 7_000 })

    expect(facts.shells.map(shell => [shell.id, shell.kind, shell.parentId, shell.label])).toEqual([
      ['toolu_sh', 'shell', 'S1', 'cd "d:/PaaS"; sleep 30'],
    ])
    expect(firstSeen.get('toolu_sh')).toBe(7_000)
  })

  test('a notification settles the shell it names', () => {
    const facts = Collect.mainOf({ rootId: 'S1', messages: MESSAGES, firstSeen: new Map(), now: 7_000 })
    expect(facts.notified.get('toolu_sh')).toBe('completed')
    expect(facts.shells[0]?.status).toBe('done')
  })

  test('the main loop file reads are kept', () => {
    const facts = Collect.mainOf({ rootId: 'S1', messages: MESSAGES, firstSeen: new Map(), now: 7_000 })
    expect(facts.files).toEqual([{ path: 'D:/work/a.ts', nodeId: 'S1', op: 'read' }])
  })

  test('a first sighting keeps its time on the next read', () => {
    const firstSeen = new Map([['toolu_sh', 1_000]])
    const facts = Collect.mainOf({ rootId: 'S1', messages: MESSAGES, firstSeen, now: 9_000 })
    expect(facts.shells[0]?.startedAt).toBe(1_000)
  })
})
