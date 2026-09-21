const iso = (at: number) => new Date(at).toISOString()

export type Usage = { input_tokens: number; output_tokens: number; cache_read_input_tokens: number; cache_creation_input_tokens: number }

export const USAGE: Usage = { input_tokens: 2, output_tokens: 100, cache_read_input_tokens: 20_000, cache_creation_input_tokens: 1_000 }

export function userText(text: string, at: number) {
  return { type: 'user', timestamp: iso(at), isSidechain: true, message: { role: 'user', content: text } }
}

export function toolUse(id: string, name: string, input: Record<string, unknown>, at: number, model = 'claude-opus-5', usage: Usage = USAGE) {
  return { type: 'assistant', timestamp: iso(at), message: { role: 'assistant', model, usage, content: [{ type: 'tool_use', id, name, input }] } }
}

export function toolResult(id: string, isError: boolean, at: number) {
  return { type: 'user', timestamp: iso(at), message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: id, is_error: isError, content: 'x' }] } }
}

export function assistantText(text: string, at: number, usage: Usage = USAGE) {
  return { type: 'assistant', timestamp: iso(at), message: { role: 'assistant', model: 'claude-opus-5', usage, content: [{ type: 'text', text }] } }
}

export function jsonl(rows: unknown[]): string {
  return rows.map(row => JSON.stringify(row)).join('\n') + '\n'
}
