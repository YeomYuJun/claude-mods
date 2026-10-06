import type { Status } from '../model'

export type Messages = {
  commandDescription: string
  panelShown: string
  panelHidden: string
  backToFlow: string
  summary: (agents: number, running: number, idle: number, failed: number) => string
  tabFlow: string
  tabFiles: string
  densityCompact: string
  densityNormal: string
  status: Readonly<Record<Status, string>>
  context: (tokens: string) => string
  tooLarge: string
  backgroundJobs: (count: number) => string
  shell: string
  engineValue: (raw: string) => string
  phaseSteps: (done: number, total: number) => string
  teammate: string
  background: string
  foreground: string
  fieldKind: string
  fieldModel: string
  fieldParent: string
  fieldSent: string
  fieldNow: string
  missingNode: string
  stopAgent: string
  copyPath: string
  pathCopied: string
  stopFailed: string
  stopped: string
  promptTitle: string
  collapse: string
  expand: (rows: number) => string
  members: (count: number) => string
  toolCalls: (count: number) => string
  more: (count: number) => string
  conflict: string
  fileCounts: (reads: number, edits: number, writes: number) => string
  bashNotTracked: string
}
