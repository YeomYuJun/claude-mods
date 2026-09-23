import { describe, expect, test } from 'claude-code/testing'

import Collect from '../hooks/collect'
import Fixtures from './fixtures'

const META = { agentType: 'general-purpose', description: 'lea ARIA tests admin1', name: 'it-admin1', toolUseId: 'toolu_A', spawnDepth: 1, requestShape: 'background' }

function factsOf(rows: unknown[], now: number, meta: Record<string, unknown> = META) {
  return Collect.agentOf({ id: 'a1', meta, rows: rows as Array<Record<string, unknown>>, transcriptPath: 'P/agent-a1.jsonl', now })
}

describe('agentOf', () => {
  test('label, prompt, times, tokens and run mode', () => {
    const { node } = factsOf([
      Fixtures.userText('Read and follow the prompt file', 1_000),
      Fixtures.toolUse('t1', 'Read', { file_path: 'D:/a.ts' }, 2_000),
      Fixtures.toolResult('t1', false, 3_000),
      Fixtures.assistantText('done', 10_000),
    ], 11_000)

    expect(node.label).toBe('lea ARIA tests admin1')
    expect(node.kind).toBe('subagent')
    expect(node.prompt).toBe('Read and follow the prompt file')
    expect(node.startedAt).toBe(1_000)
    expect(node.endedAt).toBe(10_000)
    expect(node.tokens).toBe(21_102)
    expect(node.runMode).toBe('background')
    expect(node.model).toBe('claude-opus-5')
    expect(node.toolCalls).toEqual([{ id: 't1', name: 'Read', summary: 'D:/a.ts', ok: true, at: 2_000, filePath: 'D:/a.ts' }])
  })

  test('a tool without its result is the one running now', () => {
    const { node } = factsOf([
      Fixtures.userText('go', 1_000),
      Fixtures.toolUse('t1', 'Bash', { command: 'npm test' }, 2_000),
    ], 500_000)
    expect(node.nowTool).toBe('Bash')
    expect(node.status).toBe('running')
  })

  test('a final text answer idle past the limit reads as done', () => {
    const rows = [Fixtures.userText('go', 1_000), Fixtures.assistantText('done', 2_000)]
    expect(factsOf(rows, 2_000 + 59_000).node.status).toBe('running')
    expect(factsOf(rows, 2_000 + 61_000).node.status).toBe('done')
  })

  test('a teammate that answered waits for its next message at once', () => {
    const teammate = { ...META, taskKind: 'in_process_teammate', teamName: 'session-x' }
    const answered = [Fixtures.userText('go', 1_000), Fixtures.assistantText('done', 2_000)]
    expect(factsOf(answered, 3_000, teammate).node.status).toBe('idle')
    expect(factsOf([...answered, Fixtures.userText('next task', 4_000)], 5_000, teammate).node.status).toBe('running')
  })

  test('a teammate prompt drops the message wrapper', () => {
    const wrapped = '<teammate-message teammate_id="team-lead" summary="tick">\nrun date 7 times\n</teammate-message>'
    expect(factsOf([Fixtures.userText(wrapped, 1_000)], 2_000).node.prompt).toBe('run date 7 times')
  })

  test('a person stop reads as stopped', () => {
    const { node } = factsOf([Fixtures.userText('go', 1_000)], 2_000, { ...META, stoppedByUser: true })
    expect(node.status).toBe('stopped')
  })

  test('files touched, Agent calls made, messages sent', () => {
    const facts = factsOf([
      Fixtures.userText('go', 1_000),
      Fixtures.toolUse('t1', 'Edit', { file_path: 'D:/b.ts', old_string: 'x', new_string: 'y' }, 2_000),
      Fixtures.toolUse('t2', 'Agent', { description: 'child', prompt: 'p' }, 3_000),
      Fixtures.toolUse('t3', 'SendMessage', { to: 'it-shared', message: 'hi' }, 4_000),
    ], 5_000)
    expect(facts.files).toEqual([{ path: 'D:/b.ts', nodeId: 'a1', op: 'edit', at: 2_000 }])
    expect(facts.agentCallIds).toEqual(['t2'])
    expect(facts.sends).toEqual(['it-shared'])
  })

  test('a teammate is its own kind', () => {
    const { node } = factsOf([Fixtures.userText('go', 1_000)], 2_000, { agentType: 'devils-advocate', name: 'da', taskKind: 'in_process_teammate', teamName: 'session-x', spawnDepth: 0 })
    expect(node.kind).toBe('teammate')
    expect(node.label).toBe('da')
  })
})
