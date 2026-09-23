import { describe, expect, test } from 'claude-code/testing'

import Collect from '../hooks/collect'
import Fixtures from './fixtures'

const EMPTY_MAIN = { shells: [], notified: new Map<string, string>(), files: [] }

function file(id: string, meta: Record<string, unknown>, rows: unknown[], workflowRunId?: string) {
  return { id, meta, rows: rows as Array<Record<string, unknown>>, transcriptPath: `P/agent-${id}.jsonl`, ...(workflowRunId ? { workflowRunId } : {}) }
}

function modelOf(overrides: Partial<Parameters<typeof Collect.traceOf>[0]>) {
  return Collect.traceOf({
    rootId: 'S1', rootLabel: 'main', model: 'claude-opus-5[1m]', contextTokens: 262_300, main: EMPTY_MAIN,
    agents: [], workflows: [], live: [], nowTools: new Map(), now: 10_000, ...overrides,
  })
}

describe('modelOf', () => {
  test('depth-1 agents hang under the root, a nested one under its caller', () => {
    const parent = file('a1', { description: 'admin2', toolUseId: 'toolu_1', spawnDepth: 1 }, [
      Fixtures.userText('go', 1_000),
      Fixtures.toolUse('toolu_child', 'Agent', { description: 'part B' }, 2_000),
    ])
    const child = file('a2', { description: 'part B', toolUseId: 'toolu_child', spawnDepth: 2 }, [Fixtures.userText('go', 3_000)])
    const model = modelOf({ agents: [child, parent] })

    expect(model.nodes.map(node => [node.id, node.parentId, node.depth])).toEqual([
      ['S1', undefined, 0], ['a1', 'S1', 1], ['a2', 'a1', 2],
    ])
    expect(model.nodes[0]).toMatchObject({ kind: 'session', label: 'main', contextTokens: 262_300 })
  })

  test('parentAgentId wins over the tool use search', () => {
    const a = file('a1', { description: 'x', toolUseId: 't1', spawnDepth: 1 }, [Fixtures.userText('go', 1_000)])
    const b = file('b1', { description: 'y', toolUseId: 't9', spawnDepth: 2, parentAgentId: 'a1' }, [Fixtures.userText('go', 2_000)])
    expect(modelOf({ agents: [a, b] }).nodes.find(node => node.id === 'b1')?.parentId).toBe('a1')
  })

  test('teammates gather under one team node', () => {
    const t1 = file('t1', { name: 'da-fable', taskKind: 'in_process_teammate', teamName: 'session-x', spawnDepth: 0 }, [Fixtures.userText('go', 1_000)])
    const t2 = file('t2', { name: 'da-opus', taskKind: 'in_process_teammate', teamName: 'session-x', spawnDepth: 0 }, [Fixtures.userText('go', 2_000)])
    const model = modelOf({ agents: [t1, t2] })
    expect(model.nodes.map(node => [node.id, node.kind, node.parentId])).toEqual([
      ['S1', 'session', undefined], ['team:session-x', 'team', 'S1'], ['t1', 'teammate', 'team:session-x'], ['t2', 'teammate', 'team:session-x'],
    ])
  })

  test('live status wins, then a notification, then the rows', () => {
    const a = file('a1', { description: 'x', toolUseId: 't1' }, [Fixtures.userText('go', 1_000)])
    const b = file('b1', { description: 'y', toolUseId: 't2' }, [Fixtures.userText('go', 1_000)])
    const model = modelOf({
      agents: [a, b],
      live: [{ id: 'a1', description: 'x', type: 'general-purpose', status: 'failed' }],
      main: { ...EMPTY_MAIN, notified: new Map([['t2', 'completed']]) },
    })
    expect(model.nodes.find(node => node.id === 'a1')?.status).toBe('failed')
    expect(model.nodes.find(node => node.id === 'b1')?.status).toBe('done')
  })

  test('the team this session made by itself adds no level', () => {
    const t1 = file('t1', { name: 'ticker', taskKind: 'in_process_teammate', teamName: 'session-S1' }, [Fixtures.userText('go', 1_000)])
    expect(modelOf({ agents: [t1] }).nodes.map(node => [node.id, node.kind, node.parentId])).toEqual([
      ['S1', 'session', undefined], ['t1', 'teammate', 'S1'],
    ])
  })

  test('a waiting teammate stays idle while the engine still lists it running', () => {
    const t1 = file('t1', { name: 'ticker', taskKind: 'in_process_teammate', teamName: 'session-x' }, [Fixtures.userText('go', 1_000), Fixtures.assistantText('done', 2_000)])
    const model = modelOf({ agents: [t1], live: [{ id: 't1', description: 'x', type: 'teammate', status: 'running' }] })
    expect(model.nodes.find(node => node.id === 't1')).toMatchObject({ status: 'idle', rawStatus: 'running' })
    expect(model.nodes.find(node => node.id === 'team:session-x')?.status).toBe('idle')
  })

  test('a killed teammate reads as stopped even when its last row is an answer', () => {
    const t1 = file('t1', { name: 'ticker', taskKind: 'in_process_teammate', teamName: 'session-x' }, [Fixtures.userText('go', 1_000), Fixtures.assistantText('done', 2_000)])
    const model = modelOf({ agents: [t1], live: [{ id: 't1', description: 'x', type: 'teammate', status: 'killed' }] })
    expect(model.nodes.find(node => node.id === 't1')?.status).toBe('stopped')
  })

  test('a live tool call names what runs now', () => {
    const a = file('a1', { description: 'x' }, [Fixtures.userText('go', 1_000)])
    const model = modelOf({ agents: [a], live: [{ id: 'a1', description: 'x', type: 'general-purpose', status: 'running' }], nowTools: new Map([['a1', 'Bash']]) })
    expect(model.nodes.find(node => node.id === 'a1')?.nowTool).toBe('Bash')
  })

  test('workflow agents with a transcript keep the workflow as parent and gain tokens', () => {
    const wf = { runId: 'wf_1', workflowName: 'wf', status: 'running', startTime: 1_000, phases: [{ title: 'T' }], workflowProgress: [
      { type: 'workflow_agent', index: 1, label: 'tr:a', phaseIndex: 1, agentId: 'w1', state: 'running' },
    ] }
    const w1 = file('w1', { agentType: 'general-purpose', description: 'tr:a' }, [Fixtures.toolUse('x', 'Read', { file_path: 'D:/q.ts' }, 2_000)], 'wf_1')
    const model = modelOf({ workflows: [wf], agents: [w1] })
    const node = model.nodes.find(item => item.id === 'w1')
    expect(node).toMatchObject({ kind: 'workflowAgent', parentId: 'wf_1', depth: 2, tokens: 21_102 })
    expect(model.files).toEqual([{ path: 'D:/q.ts', nodeId: 'w1', op: 'read', at: 2_000 }])
  })

  test('messages sent are counted per receiver label', () => {
    const a = file('a1', { description: 'sender', name: 'snd' }, [
      Fixtures.toolUse('m1', 'SendMessage', { to: 'rcv' }, 1_000),
      Fixtures.toolUse('m2', 'SendMessage', { to: 'rcv' }, 2_000),
    ])
    const b = file('b1', { description: 'receiver', name: 'rcv' }, [Fixtures.userText('go', 1_000)])
    expect(modelOf({ agents: [a, b] }).nodes.find(node => node.id === 'a1')?.sentTo).toEqual([{ to: 'receiver', count: 2 }])
  })

  test('shells from the main loop join the model', () => {
    const shell = { id: 'toolu_sh', kind: 'shell' as const, label: 'sleep', parentId: 'S1', depth: 1, status: 'running' as const, toolCalls: [] }
    const model = modelOf({ main: { ...EMPTY_MAIN, shells: [shell] } })
    expect(model.nodes.map(node => node.id)).toEqual(['S1', 'toolu_sh'])
  })

  test('a node whose parent is unknown hangs under the root', () => {
    const orphan = file('o1', { description: 'orphan', parentAgentId: 'missing' }, [Fixtures.userText('go', 1_000)])
    expect(modelOf({ agents: [orphan] }).nodes.find(node => node.id === 'o1')?.parentId).toBe('S1')
  })
})
