import { describe, expect, test } from 'claude-code/testing'

import Fixtures from './fixtures'

describe('register', () => {
  const KO = { options: { language: 'ko' } } as const
  const EN = { options: { language: 'en' } } as const

  test('/trace opens the pane, again closes it', KO, async ($, on) => {
    const world = Fixtures.worldOf(on)
    await $.session.start(Fixtures.START)

    const first = await $.command.run(Fixtures.TRACE)
    const second = await $.command.run(Fixtures.TRACE)

    expect(first.text).toBe('에이전트 추적 패널을 열었다')
    expect(second.text).toBe('에이전트 추적 패널을 닫았다')
    expect(world.opened).toEqual(['trace'])
    expect(world.closed).toEqual(['trace'])
  })

  const PANE = {
    component: 'Pane', surface: 'terminal', requestId: 'trace', viewport: { columns: 160, rows: 40 },
    props: { title: 'agent trace', isFocused: false, bodyColumns: 90, placement: 'dock', scroll: { offset: 0, bodyRows: 30 }, view: {} },
  } as const

  function agentFiles(dir: string) {
    return {
      [`${dir}/subagents/agent-a1.meta.json`]: JSON.stringify({ agentType: 'general-purpose', description: 'lea ARIA tests admin1', toolUseId: 'toolu_1', spawnDepth: 1, requestShape: 'background' }),
      [`${dir}/subagents/agent-a1.jsonl`]: Fixtures.jsonl([Fixtures.userText('go', 900_000), Fixtures.toolUse('t1', 'Bash', { command: 'npm test' }, 950_000)]),
    }
  }

  test('the pane draws the agents read from the session folder', KO, async ($, on) => {
    Fixtures.worldOf(on, { files: agentFiles(Fixtures.SESSION_DIR), live: [{ id: 'a1', description: 'lea ARIA tests admin1', type: 'general-purpose', status: 'running' }] })
    await $.session.start(Fixtures.START)
    await $.command.run(Fixtures.TRACE)

    const tree = await $.ui.render(PANE)
    const text = Fixtures.textOf(tree)
    expect(text).toContain('lea ARIA tests admin1')
    expect(text).toContain('에이전트 1 · 실행 1 · 대기 0 · 실패 0')
  })

  test('a tool call inside an agent shows as what runs now', KO, async ($, on) => {
    Fixtures.worldOf(on, { files: agentFiles(Fixtures.SESSION_DIR), live: [{ id: 'a1', description: 'x', type: 'general-purpose', status: 'running' }] })
    on('tool.call', { tool: 'Grep' }, () => new Promise(() => {}))
    await $.session.start(Fixtures.START)
    await $.command.run(Fixtures.TRACE)

    void $.tool.call({ tool: 'Grep', pattern: 'x', agentId: 'a1' })
    await $.ui.render(PANE)
    await $.ui.press({ plugin: 'agent-trace', key: 'node:a1' })
    expect(Fixtures.textOf(await $.ui.render(PANE))).toContain('지금  Grep')
  })

  test('the wheel scrolls the plugin body and keeps the engine window', async ($, on) => {
    Fixtures.worldOf(on, { files: agentFiles(Fixtures.SESSION_DIR) })
    await $.session.start(Fixtures.START)
    await $.command.run(Fixtures.TRACE)
    await $.ui.render(PANE)

    const result = await $.ui.scroll({ component: 'Pane', requestId: 'trace', offset: 0, by: 1, bodyRows: 30, contentRows: 30, origin: { kind: 'person' } })
    expect(result.deny).toBeUndefined()
  })

  test('polling stops once nothing runs', async ($, on) => {
    const world = Fixtures.worldOf(on, { files: agentFiles(Fixtures.SESSION_DIR), live: [{ id: 'a1', description: 'x', type: 'general-purpose', status: 'completed' }] })
    await $.session.start(Fixtures.START)
    await $.command.run(Fixtures.TRACE)
    const afterOpen = world.calls['agent.list']
    await world.clock.advance(10_000)
    expect(world.calls['agent.list']).toBe(afterOpen)
  })

  function teammateFiles(dir: string) {
    return {
      [`${dir}/subagents/agent-t1.meta.json`]: JSON.stringify({ description: 'ticker', name: 'ticker', taskKind: 'in_process_teammate', teamName: 'session-x', spawnDepth: 0 }),
      [`${dir}/subagents/agent-t1.jsonl`]: Fixtures.jsonl([Fixtures.userText('go', 900_000), Fixtures.assistantText('done', 950_000)]),
    }
  }

  test('a waiting teammate counts as idle and does not keep the poll alive', KO, async ($, on) => {
    const world = Fixtures.worldOf(on, { files: teammateFiles(Fixtures.SESSION_DIR), live: [{ id: 't1', description: 'ticker', type: 'teammate', status: 'running', name: 'ticker' }] })
    await $.session.start(Fixtures.START)
    await $.command.run(Fixtures.TRACE)
    expect(Fixtures.textOf(await $.ui.render(PANE))).toContain('에이전트 1 · 실행 0 · 대기 1 · 실패 0')
    const afterOpen = world.calls['agent.list']
    await world.clock.advance(10_000)
    expect(world.calls['agent.list']).toBe(afterOpen)
  })

  test('a tool call inside a waiting agent reads the model again', async ($, on) => {
    const world = Fixtures.worldOf(on, { files: teammateFiles(Fixtures.SESSION_DIR), live: [{ id: 't1', description: 'ticker', type: 'teammate', status: 'running', name: 'ticker' }] })
    on('tool.call', { tool: 'Grep' }, () => ({ result: 'x' }))
    await $.session.start(Fixtures.START)
    await $.command.run(Fixtures.TRACE)
    const afterOpen = world.calls['agent.list']
    await $.tool.call({ tool: 'Grep', pattern: 'x', agentId: 't1' })
    await world.clock.settle()
    expect(world.calls['agent.list']).toBe((afterOpen ?? 0) + 1)
  })

  const TEAMMATE_LIVE = [{ id: 't1', description: 'ticker', type: 'teammate', status: 'running', name: 'ticker' }]

  test('Stop agent calls TaskStop with the teammate name and shows what it answered', KO, async ($, on) => {
    const world = Fixtures.worldOf(on, { files: teammateFiles(Fixtures.SESSION_DIR), live: TEAMMATE_LIVE })
    await $.session.start(Fixtures.START)
    await $.command.run(Fixtures.TRACE)
    await $.ui.render(PANE)
    await $.ui.press({ plugin: 'agent-trace', key: 'node:t1' })
    await $.ui.render(PANE)
    await $.ui.press({ plugin: 'agent-trace', key: 'stop' })
    await world.clock.settle()
    expect(world.toolCalls.map(call => call.task_id)).toEqual(['ticker'])
    expect(Fixtures.textOf(await $.ui.render(PANE))).toContain('정지: stopped')
  })

  test('a stopped teammate that leaves the live list reads as stopped, not running', KO, async ($, on) => {
    const files = {
      [`${Fixtures.SESSION_DIR}/subagents/agent-t1.meta.json`]: JSON.stringify({ description: 'ticker', name: 'ticker', taskKind: 'in_process_teammate', teamName: 'session-x', spawnDepth: 0 }),
      [`${Fixtures.SESSION_DIR}/subagents/agent-t1.jsonl`]: Fixtures.jsonl([Fixtures.userText('go', 900_000), Fixtures.toolUse('b1', 'Bash', { command: 'sleep' }, 950_000)]),
    }
    const live = [...TEAMMATE_LIVE]
    on('tool.call', { tool: 'TaskStop' }, () => { live.length = 0; return { result: { message: 'Successfully stopped task: t1' } } })
    const world = Fixtures.worldOf(on, { files, live })
    await $.session.start(Fixtures.START)
    await $.command.run(Fixtures.TRACE)
    await $.ui.render(PANE)
    await $.ui.press({ plugin: 'agent-trace', key: 'node:t1' })
    await $.ui.render(PANE)
    await $.ui.press({ plugin: 'agent-trace', key: 'stop' })
    await world.clock.settle()
    const tree = await $.ui.render(PANE)
    expect(Fixtures.textOf(tree)).toContain('정지 · 1m 40s')
    expect(Fixtures.textOf(tree)).toContain('유형  팀원')
    expect(Fixtures.keysOf(tree)).not.toContain('stop')
    const afterStop = world.calls['agent.list']
    await world.clock.advance(10_000)
    expect(world.calls['agent.list']).toBe(afterStop)
  })

  test('a stop answered as a JSON string shows only its message', async ($, on) => {
    on('tool.call', { tool: 'TaskStop' }, () => ({ result: JSON.stringify({ message: 'Successfully stopped task: t3', task_id: 't3', task_type: 'in_process_teammate' }) }))
    const world = Fixtures.worldOf(on, { files: teammateFiles(Fixtures.SESSION_DIR), live: TEAMMATE_LIVE })
    await $.session.start(Fixtures.START)
    await $.command.run(Fixtures.TRACE)
    await $.ui.render(PANE)
    await $.ui.press({ plugin: 'agent-trace', key: 'node:t1' })
    await $.ui.render(PANE)
    await $.ui.press({ plugin: 'agent-trace', key: 'stop' })
    await world.clock.settle()
    const text = Fixtures.textOf(await $.ui.render(PANE))
    expect(text).toContain('Successfully stopped task: t3')
    expect(text).not.toContain('task_type')
  })

  test('a refused stop shows why', KO, async ($, on) => {
    on('tool.call', { tool: 'TaskStop' }, () => ({ deny: 'No task found with ID: ticker' }))
    const world = Fixtures.worldOf(on, { files: teammateFiles(Fixtures.SESSION_DIR), live: TEAMMATE_LIVE })
    await $.session.start(Fixtures.START)
    await $.command.run(Fixtures.TRACE)
    await $.ui.render(PANE)
    await $.ui.press({ plugin: 'agent-trace', key: 'node:t1' })
    await $.ui.render(PANE)
    await $.ui.press({ plugin: 'agent-trace', key: 'stop' })
    await world.clock.settle()
    expect(Fixtures.textOf(await $.ui.render(PANE))).toContain('정지 실패: No task found with ID: ticker')
  })

  const HINT_DRAWN = { type: 'Text', children: ['? for shortcuts'] } as const
  const HINT = { component: 'PromptHint', surface: 'terminal', requestId: 'hint', viewport: { columns: 160, rows: 40, isFullscreen: true }, props: {} } as const

  test('the first main-loop Agent call opens a docked pane', async ($, on) => {
    const world = Fixtures.worldOf(on)
    on('tool.call', { tool: 'Agent' }, () => ({ result: { status: 'async_launched', agentId: 'a1' } }))
    on('ui.render', { component: 'PromptHint' }, () => HINT_DRAWN)
    await $.session.start(Fixtures.START)
    await $.ui.render(HINT)
    await $.tool.call({ tool: 'Agent', description: 'x', prompt: 'p', subagent_type: 'general-purpose' })
    await world.clock.settle()
    expect(world.opened).toEqual(['trace'])
  })

  test('a hint drawn without the fullscreen flag keeps the one measured before', async ($, on) => {
    const world = Fixtures.worldOf(on)
    on('tool.call', { tool: 'Agent' }, () => ({ result: { status: 'async_launched', agentId: 'a1' } }))
    on('ui.render', { component: 'PromptHint' }, () => HINT_DRAWN)
    await $.session.start(Fixtures.START)
    await $.ui.render(HINT)
    await $.ui.render({ ...HINT, viewport: { columns: 160, rows: 40 } })
    await $.tool.call({ tool: 'Agent', description: 'x', prompt: 'p', subagent_type: 'general-purpose' })
    await world.clock.settle()
    expect(world.opened).toEqual(['trace'])
  })

  test('a narrow terminal or a subagent call opens nothing', async ($, on) => {
    const world = Fixtures.worldOf(on)
    on('tool.call', { tool: 'Agent' }, () => ({ result: { status: 'async_launched', agentId: 'a2' } }))
    on('ui.render', { component: 'PromptHint' }, () => HINT_DRAWN)
    await $.session.start(Fixtures.START)
    await $.ui.render({ ...HINT, viewport: { columns: 120, rows: 40, isFullscreen: true } })
    await $.tool.call({ tool: 'Agent', description: 'x', prompt: 'p', subagent_type: 'general-purpose' })
    await $.ui.render(HINT)
    await $.tool.call({ tool: 'Agent', description: 'x', prompt: 'p', subagent_type: 'general-purpose', agentId: 'a1' })
    await world.clock.settle()
    expect(world.opened).toEqual([])
  })

  test('a pane the person closed does not open by itself again', async ($, on) => {
    const world = Fixtures.worldOf(on)
    on('tool.call', { tool: 'Agent' }, () => ({ result: { status: 'async_launched', agentId: 'a1' } }))
    on('ui.render', { component: 'PromptHint' }, () => HINT_DRAWN)
    await $.session.start(Fixtures.START)
    await $.ui.render(HINT)
    await $.command.run(Fixtures.TRACE)
    await $.command.run(Fixtures.TRACE)
    await $.tool.call({ tool: 'Agent', description: 'x', prompt: 'p', subagent_type: 'general-purpose' })
    await world.clock.settle()
    expect(world.opened).toEqual(['trace'])
  })

  test('/clear forgets the pane', async ($, on) => {
    const world = Fixtures.worldOf(on)
    on('command.run', { command: 'clear' }, () => ({}))
    await $.session.start(Fixtures.START)
    await $.command.run(Fixtures.TRACE)
    await $.command.run({ command: 'clear', args: '', origin: { kind: 'composer' } })
    expect(world.closed).toEqual(['trace'])
  })

  test('/trace answers in English under language en', EN, async ($, on) => {
    Fixtures.worldOf(on)
    await $.session.start(Fixtures.START)
    expect((await $.command.run(Fixtures.TRACE)).text).toBe('Opened the agent trace panel')
    expect((await $.command.run(Fixtures.TRACE)).text).toBe('Closed the agent trace panel')
  })

  test('the pane header and fields read in English under language en', EN, async ($, on) => {
    Fixtures.worldOf(on, { files: teammateFiles(Fixtures.SESSION_DIR), live: TEAMMATE_LIVE })
    await $.session.start(Fixtures.START)
    await $.command.run(Fixtures.TRACE)
    expect(Fixtures.textOf(await $.ui.render(PANE))).toContain('1 agent · 0 running · 1 idle · 0 failed')
    await $.ui.press({ plugin: 'agent-trace', key: 'node:t1' })
    expect(Fixtures.textOf(await $.ui.render(PANE))).toContain('Type    teammate · foreground')
  })

  test('a refused stop shows why in English under language en', EN, async ($, on) => {
    on('tool.call', { tool: 'TaskStop' }, () => ({ deny: 'No task found with ID: ticker' }))
    const world = Fixtures.worldOf(on, { files: teammateFiles(Fixtures.SESSION_DIR), live: TEAMMATE_LIVE })
    await $.session.start(Fixtures.START)
    await $.command.run(Fixtures.TRACE)
    await $.ui.render(PANE)
    await $.ui.press({ plugin: 'agent-trace', key: 'node:t1' })
    await $.ui.render(PANE)
    await $.ui.press({ plugin: 'agent-trace', key: 'stop' })
    await world.clock.settle()
    expect(Fixtures.textOf(await $.ui.render(PANE))).toContain('Stop failed: No task found with ID: ticker')
  })
})
