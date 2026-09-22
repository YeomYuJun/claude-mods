import type { SessionMessage } from 'claude-code'

import { statusOf, type FileAccess, type TraceNode } from '../model'
import { fileOpOf, filePathOf, summaryOf } from './rows.js'

export type MainFacts = { shells: TraceNode[]; notified: Map<string, string>; files: FileAccess[] }

const SHELLS = new Set(['Bash', 'PowerShell'])
const NOTIFICATION = /<task-notification>[\s\S]*?<\/task-notification>/g
const TOOL_USE_ID = /<tool-use-id>([^<]+)<\/tool-use-id>/
const STATUS = /<status>([^<]+)<\/status>/

export function mainOf(input: { rootId: string; messages: SessionMessage[]; firstSeen: Map<string, number>; now: number }): MainFacts {
  const { rootId, messages, firstSeen, now } = input
  const notified = new Map<string, string>()
  for (const message of messages) {
    if (message.role !== 'user') continue
    for (const block of message.text.match(NOTIFICATION) ?? []) {
      const id = TOOL_USE_ID.exec(block)?.[1]
      const status = STATUS.exec(block)?.[1]
      if (id && status) notified.set(id.trim(), status.trim())
    }
  }

  const shells: TraceNode[] = []
  const files: FileAccess[] = []
  for (const message of messages) {
    for (const use of message.toolUses) {
      if (SHELLS.has(use.tool) && use.input.run_in_background === true) {
        if (!firstSeen.has(use.tool_use_id)) firstSeen.set(use.tool_use_id, now)
        const raw = notified.get(use.tool_use_id)
        shells.push({
          id: use.tool_use_id,
          kind: 'shell',
          label: summaryOf(use.input),
          parentId: rootId,
          depth: 1,
          status: statusOf(raw) ?? 'running',
          rawStatus: raw,
          toolCalls: [],
          startedAt: firstSeen.get(use.tool_use_id),
          toolUseId: use.tool_use_id,
        })
      }
      const op = fileOpOf(use.tool)
      const path = filePathOf(use.input)
      if (op && path) files.push({ path, nodeId: rootId, op })
    }
  }
  return { shells, notified, files }
}
