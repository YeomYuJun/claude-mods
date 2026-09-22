import { describe, expect, test } from 'claude-code/testing'

import Fixtures from './fixtures'

describe('register', () => {
  test('/trace opens the pane, again closes it', async ($, on) => {
    const world = Fixtures.worldOf(on)
    await $.session.start(Fixtures.START)

    const first = await $.command.run(Fixtures.TRACE)
    const second = await $.command.run(Fixtures.TRACE)

    expect(first.text).toBe('Agent trace panel shown')
    expect(second.text).toBe('Agent trace panel hidden')
    expect(world.opened).toEqual(['trace'])
    expect(world.closed).toEqual(['trace'])
  })

  const PANE = {
    component: 'Pane', surface: 'terminal', requestId: 'trace', viewport: { columns: 160, rows: 40 },
    props: { title: 'Agent trace', isFocused: false, bodyColumns: 90, placement: 'dock', scroll: { offset: 0, bodyRows: 30 }, view: {} },
  } as const

  function agentFiles(dir: string) {
    return {
      [`${dir}/subagents/agent-a1.meta.json`]: JSON.stringify({ agentType: 'general-purpose', description: 'lea ARIA tests admin1', toolUseId: 'toolu_1', spawnDepth: 1, requestShape: 'background' }),
      [`${dir}/subagents/agent-a1.jsonl`]: Fixtures.jsonl([Fixtures.userText('go', 900_000), Fixtures.toolUse('t1', 'Bash', { command: 'npm test' }, 950_000)]),
    }
  }

  test('the pane draws the agents read from the session folder', async ($, on) => {
    Fixtures.worldOf(on, { files: agentFiles(Fixtures.SESSION_DIR), live: [{ id: 'a1', description: 'lea ARIA tests admin1', type: 'general-purpose', status: 'running' }] })
    await $.session.start(Fixtures.START)
    await $.command.run(Fixtures.TRACE)

    const tree = await $.ui.render(PANE)
    const text = Fixtures.textOf(tree)
    expect(text).toContain('lea ARIA tests admin1')
    expect(text).toContain('1 agents · 실행 1 · 실패 0')
  })

  test('a tool call inside an agent shows as what runs now', async ($, on) => {
    Fixtures.worldOf(on, { files: agentFiles(Fixtures.SESSION_DIR), live: [{ id: 'a1', description: 'x', type: 'general-purpose', status: 'running' }] })
    on('tool.call', { tool: 'Grep' }, () => new Promise(() => {}))
    await $.session.start(Fixtures.START)
    await $.command.run(Fixtures.TRACE)

    void $.tool.call({ tool: 'Grep', pattern: 'x', agentId: 'a1' })
    await $.ui.render(PANE)
    await $.ui.press({ plugin: 'agent-trace', key: 'node:a1' })
    expect(Fixtures.textOf(await $.ui.render(PANE))).toContain('Now  Grep')
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

  test('/clear forgets the pane', async ($, on) => {
    const world = Fixtures.worldOf(on)
    on('command.run', { command: 'clear' }, () => ({}))
    await $.session.start(Fixtures.START)
    await $.command.run(Fixtures.TRACE)
    await $.command.run({ command: 'clear', args: '', origin: { kind: 'composer' } })
    expect(world.closed).toEqual(['trace'])
  })
})
