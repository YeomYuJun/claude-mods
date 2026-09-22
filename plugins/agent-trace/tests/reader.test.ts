import { describe, expect, test } from 'claude-code/testing'
import type { FsEntry } from 'claude-code'

import Reader from '../hooks/reader'
import Fixtures from './fixtures'

const DIR = 'C:/u/.claude/projects/D--work/S1'

function portOf(files: Record<string, string>, reads: string[] = []) {
  const list = async (path: string): Promise<FsEntry[]> => {
    const seen = new Map<string, FsEntry>()
    for (const [key, text] of Object.entries(files)) {
      if (!key.startsWith(`${path}/`)) continue
      const [name, ...deeper] = key.slice(path.length + 1).split('/')
      if (name) seen.set(name, deeper.length ? { name, kind: 'dir', size: 0, isLink: false } : { name, kind: 'file', size: text.length, isLink: false })
    }
    return [...seen.values()]
  }
  return {
    exists: async (path: string) => path in files || Object.keys(files).some(key => key.startsWith(`${path}/`)),
    list,
    read: async (path: string) => { reads.push(path); return files[path] ?? '' },
  }
}

describe('reader', () => {
  test('project key and session dir follow the transcript folder names', () => {
    expect(Reader.projectKeyOf('D:\\0. dle')).toBe('D--0--dle')
    expect(Reader.projectKeyOf('d:\\PaaS')).toBe('d--PaaS')
    expect(Reader.sessionDirOf({ configDir: 'C:\\Users\\u\\.claude', cwd: 'D:\\claude-mods', sessionId: 'S1' }))
      .toBe('C:/Users/u/.claude/projects/D--claude-mods/S1')
  })

  test('subagents, workflow agents and workflow runs are read', async () => {
    const files = {
      [`${DIR}/subagents/agent-a1.meta.json`]: '\uFEFF{"description":"x","toolUseId":"t1","spawnDepth":1}',
      [`${DIR}/subagents/agent-a1.jsonl`]: Fixtures.jsonl([Fixtures.userText('go', 1_000)]),
      [`${DIR}/subagents/workflows/wf_1/agent-w1.meta.json`]: '{"agentType":"general-purpose"}',
      [`${DIR}/subagents/workflows/wf_1/agent-w1.jsonl`]: Fixtures.jsonl([Fixtures.userText('go', 2_000)]),
      [`${DIR}/workflows/wf_1.json`]: '{"runId":"wf_1","status":"running"}',
    }
    const result = await Reader.readSession(portOf(files), DIR, new Map())

    expect(result.agents.map(agent => [agent.id, agent.workflowRunId, agent.rows.length, agent.meta.description])).toEqual([
      ['a1', undefined, 1, 'x'],
      ['w1', 'wf_1', 1, undefined],
    ])
    expect(result.agents[0]?.transcriptPath).toBe(`${DIR}/subagents/agent-a1.jsonl`)
    expect(result.workflows).toEqual([{ runId: 'wf_1', status: 'running' }])
  })

  test('an unchanged size is not read again', async () => {
    const files = {
      [`${DIR}/subagents/agent-a1.meta.json`]: '{}',
      [`${DIR}/subagents/agent-a1.jsonl`]: Fixtures.jsonl([Fixtures.userText('go', 1_000)]),
    }
    const reads: string[] = []
    const cache = new Map()
    await Reader.readSession(portOf(files, reads), DIR, cache)
    await Reader.readSession(portOf(files, reads), DIR, cache)
    expect(reads.filter(path => path.endsWith('.jsonl'))).toHaveLength(1)
  })

  test('a transcript over the read limit is marked, not read', async () => {
    const big = 'x'.repeat(4 * 1024 * 1024 + 1)
    const files = { [`${DIR}/subagents/agent-a1.meta.json`]: '{}', [`${DIR}/subagents/agent-a1.jsonl`]: big }
    const reads: string[] = []
    const result = await Reader.readSession(portOf(files, reads), DIR, new Map())
    expect(result.agents[0]?.tooLarge).toBe(true)
    expect(reads.filter(path => path.endsWith('.jsonl'))).toEqual([])
  })

  test('a session with no folder yet reads as empty', async () => {
    expect(await Reader.readSession(portOf({}), DIR, new Map())).toEqual({ agents: [], workflows: [] })
  })
})
