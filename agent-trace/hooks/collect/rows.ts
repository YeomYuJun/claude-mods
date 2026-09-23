import type { FileOp } from '../model'

export type Row = Record<string, unknown>
export type Block = {
  type?: string
  id?: string
  name?: string
  input?: Record<string, unknown>
  tool_use_id?: string
  is_error?: boolean
  text?: string
}

export function parseLines(text: string): Row[] {
  const body = text.replace(/^﻿/, '')
  const lines = body.split('\n')
  const complete = body.endsWith('\n') ? lines : lines.slice(0, -1)
  const rows: Row[] = []
  for (const line of complete) {
    const trimmed = line.trim()
    if (!trimmed) continue
    try {
      const value: unknown = JSON.parse(trimmed)
      if (value && typeof value === 'object' && !Array.isArray(value)) rows.push(value as Row)
    } catch {
      // 기록 중인 줄이 아니라 깨진 줄이다. 그 줄만 버린다.
    }
  }
  return rows
}

function messageOf(row: Row): Record<string, unknown> | undefined {
  const message = row.message
  return message && typeof message === 'object' ? message as Record<string, unknown> : undefined
}

export function blocksOf(row: Row): Block[] {
  const content = messageOf(row)?.content
  return Array.isArray(content) ? content.filter(block => block && typeof block === 'object') as Block[] : []
}

export function plainTextOf(row: Row): string | undefined {
  const content = messageOf(row)?.content
  if (typeof content === 'string') return content
  const texts = blocksOf(row).filter(block => block.type === 'text' && typeof block.text === 'string').map(block => block.text)
  return texts.length > 0 ? texts.join('\n') : undefined
}

export function atOf(row: Row): number | undefined {
  const stamp = row.timestamp
  if (typeof stamp !== 'string') return undefined
  const at = Date.parse(stamp)
  return Number.isNaN(at) ? undefined : at
}

export function usageTotalOf(row: Row): number | undefined {
  const usage = messageOf(row)?.usage
  if (!usage || typeof usage !== 'object') return undefined
  const read = (key: string) => {
    const value = (usage as Record<string, unknown>)[key]
    return typeof value === 'number' ? value : 0
  }
  return read('input_tokens') + read('output_tokens') + read('cache_read_input_tokens') + read('cache_creation_input_tokens')
}

export function modelOf(row: Row): string | undefined {
  const model = messageOf(row)?.model
  return typeof model === 'string' ? model : undefined
}

const SUMMARY_KEYS = ['file_path', 'notebook_path', 'command', 'description', 'pattern', 'url', 'query', 'prompt']

export function summaryOf(input: Record<string, unknown> | undefined): string {
  if (!input) return ''
  for (const key of SUMMARY_KEYS) {
    const value = input[key]
    if (typeof value === 'string' && value.trim()) return value.trim().split('\n')[0] ?? ''
  }
  return ''
}

const FILE_OPS: Record<string, FileOp> = { Read: 'read', Edit: 'edit', NotebookEdit: 'edit', Write: 'write' }

export function fileOpOf(tool: string): FileOp | undefined {
  return FILE_OPS[tool]
}

export function filePathOf(input: Record<string, unknown> | undefined): string | undefined {
  const path = input?.file_path ?? input?.notebook_path
  return typeof path === 'string' ? path : undefined
}
