import type { Status } from './types.js'

const DONE = new Set(['completed', 'done', 'success', 'succeeded'])
const FAILED = new Set(['failed', 'error', 'errored'])
const STOPPED = new Set(['killed', 'stopped', 'cancelled', 'canceled', 'aborted'])
const IDLE = new Set(['idle', 'waiting'])

export function statusOf(raw: string | undefined): Status | undefined {
  if (raw === undefined) return undefined
  if (DONE.has(raw)) return 'done'
  if (FAILED.has(raw)) return 'failed'
  if (STOPPED.has(raw)) return 'stopped'
  if (IDLE.has(raw)) return 'idle'
  return 'running'
}
