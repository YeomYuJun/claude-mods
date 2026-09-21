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
})
