import { describe, expect, test } from 'claude-code/testing'

import Collect from '../hooks/collect'

const WF = {
  runId: 'wf_1', workflowName: 'translate-aria-sheet', status: 'running', startTime: 1_000, durationMs: 0, totalTokens: 780_298,
  phases: [{ title: 'Translate' }, { title: 'Verify' }],
  workflowProgress: [
    { type: 'workflow_phase', index: 1, title: 'Translate' },
    { type: 'workflow_agent', index: 1, label: 'tr:res-mngr', phaseIndex: 1, agentId: 'w1', model: 'claude-sonnet-5', state: 'done', startedAt: 1_100, lastToolName: 'Bash', promptPreview: 'Read the JSON' },
    { type: 'workflow_agent', index: 2, label: 'tr:res-auth', phaseIndex: 1, agentId: 'w2', model: 'claude-sonnet-5', state: 'running', startedAt: 1_200, lastToolName: 'Read', promptPreview: 'Read the JSON' },
    { type: 'workflow_phase', index: 2, title: 'Verify' },
  ],
}

describe('workflowOf', () => {
  test('one workflow node over its agents', () => {
    const [flow, ...agents] = Collect.workflowOf({ json: WF, parentId: 'S1', now: 5_000 })

    expect(flow).toMatchObject({ id: 'wf_1', kind: 'workflow', label: 'translate-aria-sheet', parentId: 'S1', status: 'running', tokens: 780_298, startedAt: 1_000, phase: { done: 0, total: 2 } })
    expect(agents.map(agent => [agent.id, agent.kind, agent.parentId, agent.status, agent.label])).toEqual([
      ['w1', 'workflowAgent', 'wf_1', 'done', 'tr:res-mngr'],
      ['w2', 'workflowAgent', 'wf_1', 'running', 'tr:res-auth'],
    ])
    expect(agents[1]?.nowTool).toBe('Read')
    expect(agents[0]?.nowTool).toBeUndefined()
    expect(agents[0]?.prompt).toBe('Read the JSON')
  })

  test('a phase counts done once every agent in it is done', () => {
    const done = { ...WF, workflowProgress: WF.workflowProgress.map(item => item.type === 'workflow_agent' ? { ...item, state: 'done' } : item) }
    expect(Collect.workflowOf({ json: done, parentId: 'S1', now: 5_000 })[0]?.phase).toEqual({ done: 1, total: 2 })
  })

  test('a completed run keeps its end time', () => {
    const [flow] = Collect.workflowOf({ json: { ...WF, status: 'completed', durationMs: 310_248 }, parentId: 'S1', now: 5_000 })
    expect(flow?.status).toBe('done')
    expect(flow?.endedAt).toBe(1_000 + 310_248)
  })
})
