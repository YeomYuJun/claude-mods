import type { On } from 'claude-code'

import Names from './names'

export function register(on: On) {
  let isOpen = false

  on('session.start', async ($, e, next) => {
    await $.command.register({ name: Names.COMMAND_NAME, description: Names.COMMAND_DESCRIPTION })
    return next(e)
  })

  on('command.run', { command: Names.COMMAND_NAME }, async ($, e) => {
    if (isOpen) {
      await $.ui.close({ id: Names.PANE_ID })
      isOpen = false
      return { text: Names.PANEL_HIDDEN_TEXT }
    }
    await $.ui.open({ id: Names.PANE_ID, title: Names.PANE_TITLE, holdToasts: true })
    isOpen = true
    return { text: Names.PANEL_SHOWN_TEXT }
  })

  on('ui.close', { id: Names.PANE_ID }, async ($, e, next) => {
    const result = await next(e)
    if (result.deny === undefined) { isOpen = false }
    return result
  })
}
