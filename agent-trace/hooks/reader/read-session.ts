import type { FsEntry } from 'claude-code'

import Names from '../names'
import { parseLines, type AgentFile, type AgentMeta, type Row } from '../collect'

export type FsPort = {
  exists(path: string): Promise<boolean>
  list(path: string): Promise<FsEntry[]>
  read(path: string): Promise<string>
}

export type ReadCache = Map<string, { size: number; rows: Row[] }>

const AGENT_FILE = /^agent-(.+)\.jsonl$/

function jsonOf(text: string): Row {
  try {
    const value: unknown = JSON.parse(text.replace(/^﻿/, ''))
    return value && typeof value === 'object' && !Array.isArray(value) ? value as Row : {}
  } catch {
    return {}
  }
}

async function agentsIn(fs: FsPort, dir: string, cache: ReadCache, workflowRunId?: string): Promise<AgentFile[]> {
  if (!await fs.exists(dir)) return []
  const entries = await fs.list(dir)
  const out: AgentFile[] = []
  for (const entry of entries) {
    const match = AGENT_FILE.exec(entry.name)
    if (entry.kind !== 'file' || !match?.[1]) continue
    const id = match[1]
    const transcriptPath = `${dir}/${entry.name}`
    const metaName = `agent-${id}.meta.json`
    const meta = entries.some(item => item.name === metaName) ? jsonOf(await fs.read(`${dir}/${metaName}`)) as AgentMeta : {}
    const tooLarge = entry.size > Names.MAX_READ_BYTES
    let rows: Row[] = []
    if (!tooLarge) {
      const cached = cache.get(transcriptPath)
      if (cached && cached.size === entry.size) {
        rows = cached.rows
      } else {
        rows = parseLines(await fs.read(transcriptPath))
        cache.set(transcriptPath, { size: entry.size, rows })
      }
    }
    out.push({ id, meta, rows, transcriptPath, ...(workflowRunId ? { workflowRunId } : {}), ...(tooLarge ? { tooLarge } : {}) })
  }
  return out
}

export async function readSession(fs: FsPort, dir: string, cache: ReadCache): Promise<{ agents: AgentFile[]; workflows: Row[] }> {
  if (!await fs.exists(dir)) return { agents: [], workflows: [] }
  const agents = await agentsIn(fs, `${dir}/subagents`, cache)
  const runsDir = `${dir}/subagents/workflows`
  if (await fs.exists(runsDir)) {
    for (const run of await fs.list(runsDir)) {
      if (run.kind === 'dir') agents.push(...await agentsIn(fs, `${runsDir}/${run.name}`, cache, run.name))
    }
  }
  const workflows: Row[] = []
  const flowsDir = `${dir}/workflows`
  if (await fs.exists(flowsDir)) {
    for (const entry of await fs.list(flowsDir)) {
      if (entry.kind === 'file' && entry.name.endsWith('.json') && entry.size <= Names.MAX_READ_BYTES) {
        workflows.push(jsonOf(await fs.read(`${flowsDir}/${entry.name}`)))
      }
    }
  }
  return { agents, workflows }
}
