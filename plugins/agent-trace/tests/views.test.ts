import { describe, expect, test } from 'claude-code/testing'

import Layout from '../hooks/layout'
import type { TraceModel, TraceNode } from '../hooks/model'
import Views from '../hooks/views'
import Fixtures from './fixtures'

function el(type: string) {
  return (props: Record<string, unknown> | null) => {
    const { children, ...rest } = (props ?? {}) as Record<string, unknown> & { children?: unknown }
    const kids = children === undefined ? [] : Array.isArray(children) ? children : [children]
    return { type, props: rest, children: kids }
  }
}
const KIT = { Box: el('Box'), Text: el('Text'), Button: el('Button'), Markdown: el('Markdown') } as unknown as Parameters<typeof Views.flowView>[0]['kit']

function node(id: string, parentId: string | undefined, extra: Partial<TraceNode> = {}): TraceNode {
  return { id, kind: parentId ? 'subagent' : 'session', label: id, parentId, depth: 0, status: 'running', toolCalls: [], ...extra }
}

export const MODEL: TraceModel = {
  rootId: 'S',
  files: [],
  nodes: [
    node('S', undefined, { label: 'Cnd-lea-be ARIA 전환 테스트', model: 'Opus 5 (1M)', contextTokens: 262_300 }),
    node('a1', 'S', { label: 'lea ARIA tests admin1', startedAt: 0, endedAt: 762_000, tokens: 289_000, status: 'done' }),
    node('a2', 'S', { label: 'lea ARIA tests admin2', startedAt: 0, tokens: 111_500 }),
    node('sh', 'S', { kind: 'shell', label: 'cd "d:/PaaS"; sleep 30', startedAt: 0 }),
  ],
}

function flowOf(width: number, rows = 40, top = 0) {
  const layout = Layout.layoutOf({ model: MODEL, width, collapsed: new Set() })
  return Views.flowView({ kit: KIT, model: MODEL, layout, top, rows, now: 231_000, act: () => {} })
}

describe('flow view', () => {
  test('node lines read like the reference map', () => {
    const text = Fixtures.textOf(flowOf(90))
    expect(text).toContain('Cnd-lea-be ARIA 전환 테스트')
    expect(text).toContain('Opus 5 (1M) · 262.3k in context')
    expect(text).toContain('12m 42s · 289.0k')
    expect(text).toContain('3m 51s · 111.5k')
  })

  test('each node is a button, and the background shell is listed apart', () => {
    const tree = flowOf(90)
    expect(Fixtures.keysOf(tree)).toEqual(expect.arrayContaining(['node:S', 'node:a1', 'node:a2', 'node:sh', 'fold:S']))
    expect(Fixtures.textOf(tree)).toContain('1 background task')
    expect(Fixtures.textOf(tree)).toContain('shell · 3m 51s')
  })

  test('rows scrolled past are not drawn', () => {
    const tree = flowOf(40, 4, 4)
    expect(Fixtures.keysOf(tree)).not.toContain('node:S')
  })
})

describe('detail view', () => {
  const MODEL_D: TraceModel = {
    rootId: 'S',
    files: [],
    nodes: [
      node('S', undefined, { label: 'main' }),
      node('p', 'S', { label: 'lea ARIA tests admin2' }),
      node('c', 'p', {
        label: 'admin2 IT part B menu/msg', agentType: 'general-purpose', model: 'Opus 5 (1M)', runMode: 'background',
        startedAt: 0, tokens: 136_900, nowTool: 'Bash', prompt: 'Read and follow helper_prompt.md fully.',
        transcriptPath: 'C:\\Users\\u\\.claude\\projects\\D--work\\S1\\subagents\\agent-c.jsonl',
        toolCalls: [{ id: 't1', name: 'Read', summary: 'D:/a.ts', ok: true }, { id: 't2', name: 'Bash', summary: 'npm test' }],
      }),
    ],
  }

  function detailOf(canStop: boolean) {
    return Views.detailView({ kit: KIT, model: MODEL_D, id: 'c', width: 60, now: 701_000, act: () => {}, canStop, stop: () => {} })
  }

  test('the lines of the reference detail', () => {
    const text = Fixtures.textOf(detailOf(true))
    expect(text).toContain('admin2 IT part B menu/msg')
    expect(text).toContain('Working · general-purpose · Opus 5 (1M) · background')
    expect(text).toContain('Spawned by lea ARIA tests admin2')
    expect(text).toContain('11m 41s · 136.9k')
    expect(text).toContain('Now  Bash')
    expect(text).toContain('Read and follow helper_prompt.md fully.')
    expect(text).toContain('Tool calls (2)')
    expect(text).toContain('[Open transcript](file:///C:/Users/u/.claude/projects/D--work/S1/subagents/agent-c.jsonl)')
  })

  test('newest tool call first', () => {
    const text = Fixtures.textOf(detailOf(true))
    expect(text.indexOf('npm test')).toBeLessThan(text.indexOf('D:/a.ts'))
  })

  test('the stop button shows only when stopping is possible', () => {
    expect(Fixtures.keysOf(detailOf(true))).toEqual(expect.arrayContaining(['back', 'stop']))
    expect(Fixtures.keysOf(detailOf(false))).not.toContain('stop')
  })
})

describe('files view', () => {
  const MODEL_F: TraceModel = {
    rootId: 'S',
    nodes: [node('S', undefined), node('a', 'S', { label: 'A' }), node('b', 'S', { label: 'B' })],
    files: [
      { path: 'D:/x.ts', nodeId: 'a', op: 'read' },
      { path: 'D:/y.ts', nodeId: 'a', op: 'edit' },
      { path: 'D:/y.ts', nodeId: 'b', op: 'write' },
      { path: 'D:/y.ts', nodeId: 'b', op: 'read' },
    ],
  }

  test('files edited by two agents come first as conflicts', () => {
    expect(Views.fileRowsOf(MODEL_F)).toEqual([
      { path: 'D:/y.ts', reads: 1, edits: 1, writes: 1, nodes: ['A', 'B'], isConflict: true },
      { path: 'D:/x.ts', reads: 1, edits: 0, writes: 0, nodes: ['A'], isConflict: false },
    ])
  })

  test('the tab says shell edits are missing', () => {
    const text = Fixtures.textOf(Views.filesView({ kit: KIT, model: MODEL_F, width: 60 }))
    expect(text).toContain('충돌 가능')
    expect(text).toContain('Bash 로 바꾼 파일은 빠져 있음')
  })

  test('a windows path becomes a file url', () => {
    expect(Views.fileUrlOf('D:\\a b.ts')).toBe('file:///D:/a%20b.ts')
  })
})

describe('pane view', () => {
  const STATE = { tab: 'flow' as const, collapsed: new Set<string>(), top: 0 }

  test('header summarises, tabs and density are buttons', () => {
    const { tree } = Views.paneView({ kit: KIT, model: MODEL, state: STATE, width: 90, rows: 30, now: 231_000, act: () => {}, canStop: false, stop: () => {} })
    expect(Fixtures.textOf(tree)).toContain('2 agents · 실행 1 · 실패 0')
    expect(Fixtures.keysOf(tree)).toEqual(expect.arrayContaining(['tab:flow', 'tab:files', 'density']))
  })

  test('an open detail replaces the flow body', () => {
    const { tree } = Views.paneView({ kit: KIT, model: MODEL, state: { ...STATE, detail: 'a1' }, width: 90, rows: 30, now: 231_000, act: () => {}, canStop: false, stop: () => {} })
    expect(Fixtures.keysOf(tree)).toContain('back')
    expect(Fixtures.keysOf(tree)).not.toContain('node:a2')
  })

  test('the files tab draws the file list', () => {
    const { tree } = Views.paneView({ kit: KIT, model: MODEL, state: { ...STATE, tab: 'files' }, width: 90, rows: 30, now: 231_000, act: () => {}, canStop: false, stop: () => {} })
    expect(Fixtures.textOf(tree)).toContain('Bash 로 바꾼 파일은 빠져 있음')
  })

  test('maxTop is what the flow can scroll', () => {
    const { maxTop } = Views.paneView({ kit: KIT, model: MODEL, state: STATE, width: 40, rows: 6, now: 231_000, act: () => {}, canStop: false, stop: () => {} })
    expect(maxTop).toBeGreaterThan(0)
  })
})
