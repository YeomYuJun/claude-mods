import type { Messages } from './types.js'

export const en = {
  commandDescription: 'Open the TODO.md checklist panel. Pass an md file path to watch that file instead',
  argumentHint: '[path]',
  panelShown: path => `Opened the TODO panel: ${path}`,
  panelHidden: 'Closed the TODO panel',
  notReady: 'The plugin is still loading. Try again in a moment',
  progress: (done, total) => `${done}/${total} done`,
  missing: 'File not found. It shows up here once it is created',
  tooLarge: kib => `File is ${kib} KiB, too large to read`,
  readFailed: message => `Could not read: ${message}`,
  noItems: 'No checklist items',
} satisfies Messages
