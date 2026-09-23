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
    expect(text).toContain('Opus 5 (1M) · 컨텍스트 262.3k')
    expect(text).toContain('12m 42s · 289.0k')
    expect(text).toContain('3m 51s · 111.5k')
  })

  test('a node that is not running says so in words beside its time', () => {
    expect(Fixtures.textOf(flowOf(90))).toContain('완료 · 12m 42s · 289.0k')
  })

  test('the session model drops the claude- prefix', () => {
    const model: TraceModel = { ...MODEL, nodes: [node('S', undefined, { model: 'claude-opus-5-5[1m]', contextTokens: 69_600 })] }
    const layout = Layout.layoutOf({ model, width: 90, collapsed: new Set() })
    expect(Fixtures.textOf(Views.flowView({ kit: KIT, model, layout, top: 0, rows: 10, now: 0, act: () => {} }))).toContain('opus-5-5[1m] · 컨텍스트 69.6k')
  })

  test('each node is a button, and the background shell is listed apart', () => {
    const tree = flowOf(90)
    expect(Fixtures.keysOf(tree)).toEqual(expect.arrayContaining(['node:S', 'node:a1', 'node:a2', 'node:sh', 'fold:S']))
    expect(Fixtures.textOf(tree)).toContain('백그라운드 작업 1')
    expect(Fixtures.textOf(tree)).toContain('셸 · 3m 51s')
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
    expect(text).toContain('실행 중 · 11m 41s · 136.9k')
    expect(text).toContain('유형  general-purpose · 백그라운드')
    expect(text).toContain('모델  Opus 5 (1M)')
    expect(text).toContain('부모  lea ARIA tests admin2')
    expect(text).toContain('지금  Bash')
    expect(text).toContain('지시문 ─')
    expect(text).toContain('Read and follow helper_prompt.md fully.')
    expect(text).toContain('도구 호출 2 ─')
    expect(text).not.toContain('file:///')
  })

  test('the stop button sits on the third row, before the fields', () => {
    const text = Fixtures.textOf(detailOf(true))
    expect(text.indexOf('에이전트 정지')).toBeLessThan(text.indexOf('유형'))
  })

  test('a tool call row starts with the time since the agent started, names in one column', () => {
    const model: TraceModel = { ...MODEL_D, nodes: MODEL_D.nodes.map(item => item.id === 'c' ? { ...item, toolCalls: [{ id: 'x', name: 'Bash', summary: 'date', ok: true, at: 5_000 }] } : item) }
    const text = Fixtures.textOf(Views.detailView({ kit: KIT, model, id: 'c', width: 60, now: 0, act: () => {}, canStop: false, stop: () => {} }))
    expect(text).toContain('  5s      ✓  Bash    date')
  })

  test('tool calls fill the rows left and count the rest', () => {
    const calls = Array.from({ length: 30 }, (_, index) => ({ id: `t${index}`, name: 'Bash', summary: `cmd ${index}`, ok: true }))
    const model: TraceModel = { ...MODEL_D, nodes: MODEL_D.nodes.map(item => item.id === 'c' ? { ...item, toolCalls: calls } : item) }
    const text = Fixtures.textOf(Views.detailView({ kit: KIT, model, id: 'c', width: 60, rows: 25, now: 0, act: () => {}, canStop: true, stop: () => {} }))
    expect(text).toContain('cmd 29')
    expect(text).not.toContain('cmd 10')
    expect(text).toMatch(/… 외 \d+개/)
  })

  test('the session detail shows its model once and no tool list', () => {
    const model: TraceModel = { rootId: 'S', files: [], nodes: [node('S', undefined, { label: 'main', model: 'claude-opus-5-5[1m]', contextTokens: 69_600 })] }
    const text = Fixtures.textOf(Views.detailView({ kit: KIT, model, id: 'S', width: 60, now: 0, act: () => {}, canStop: true, stop: () => {} }))
    expect(text).not.toContain('실행 중')
    expect(text).not.toContain('도구 호출')
    expect(text.split('opus-5-5[1m]').length).toBe(2)
  })

  test('a team detail lists its members, and messages sent show in the detail', () => {
    const model: TraceModel = { rootId: 'S', files: [], nodes: [
      node('S', undefined),
      node('team:x', 'S', { kind: 'team', label: 'x' }),
      node('t1', 'team:x', { kind: 'teammate', label: 'ticker', status: 'idle', sentTo: [{ to: 'team-lead', count: 1 }] }),
    ] }
    const detail = (id: string) => Fixtures.textOf(Views.detailView({ kit: KIT, model, id, width: 60, now: 0, act: () => {}, canStop: true, stop: () => {} }))
    expect(detail('team:x')).toContain('멤버 1 ─')
    expect(detail('team:x')).toContain('ticker')
    expect(detail('t1')).toContain('보냄  → team-lead ×1')
    expect(detail('t1')).toContain('유형  팀원')
  })

  test('a long prompt shows four rows and a button for the rest', () => {
    const long = Array.from({ length: 10 }, (_, index) => `line ${index}`).join('\n')
    const model: TraceModel = { ...MODEL_D, nodes: MODEL_D.nodes.map(item => item.id === 'c' ? { ...item, prompt: long } : item) }
    const closed = Views.detailView({ kit: KIT, model, id: 'c', width: 60, now: 0, act: () => {}, canStop: false, stop: () => {} })
    expect(Fixtures.textOf(closed)).toContain('line 3')
    expect(Fixtures.textOf(closed)).not.toContain('line 4')
    expect(Fixtures.textOf(closed)).toContain('▸ 전체 보기 (10행)')
    const open = Views.detailView({ kit: KIT, model, id: 'c', width: 60, now: 0, act: () => {}, canStop: false, stop: () => {}, isPromptOpen: true })
    expect(Fixtures.textOf(open)).toContain('line 9')
    expect(Fixtures.keysOf(open)).toContain('prompt')
  })

  test('a teammate whose type is its own name does not repeat it', () => {
    const model: TraceModel = { rootId: 'S', files: [], nodes: [node('S', undefined), node('t1', 'S', { kind: 'teammate', label: 'x', name: 'date-15s', agentType: 'date-15s', model: 'claude-opus-5-5' })] }
    const text = Fixtures.textOf(Views.detailView({ kit: KIT, model, id: 't1', width: 60, now: 0, act: () => {}, canStop: false, stop: () => {} }))
    expect(text).toContain('유형  팀원')
    expect(text).toContain('모델  opus-5-5')
    expect(text).not.toContain('date-15s')
  })

  test('the transcript path can be copied', () => {
    const copied: string[] = []
    const tree = Views.detailView({ kit: KIT, model: MODEL_D, id: 'c', width: 60, now: 0, act: () => {}, canStop: false, stop: () => {}, copy: text => copied.push(text) })
    expect(Fixtures.keysOf(tree)).toContain('copy')
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

  test('a mixed backslash/forward-slash path still collapses to one conflict row', () => {
    const model: TraceModel = {
      rootId: 'S',
      nodes: [node('S', undefined), node('a', 'S', { label: 'A' }), node('b', 'S', { label: 'B' })],
      files: [
        { path: 'D:\\z.ts', nodeId: 'a', op: 'edit' },
        { path: 'D:/z.ts', nodeId: 'b', op: 'write' },
      ],
    }
    expect(Views.fileRowsOf(model)).toEqual([
      { path: 'D:\\z.ts', reads: 0, edits: 1, writes: 1, nodes: ['A', 'B'], isConflict: true },
    ])
  })

  test('the tab says shell edits are missing', () => {
    const text = Fixtures.textOf(Views.filesView({ kit: KIT, model: MODEL_F, width: 60 }))
    expect(text).toContain('충돌 가능')
    expect(text).toContain('Bash 로 바꾼 파일은 빠져 있음')
  })

  test('file rows show the path tail without a link', () => {
    const text = Fixtures.textOf(Views.filesView({ kit: KIT, model: MODEL_F, width: 20 }))
    expect(text).not.toContain('file:///')
    expect(text).toContain('D:/y.ts')
  })
})

describe('pane view', () => {
  const STATE = { tab: 'flow' as const, collapsed: new Set<string>(), top: 0 }

  test('header summarises, tabs and density are buttons', () => {
    const { tree } = Views.paneView({ kit: KIT, model: MODEL, state: STATE, width: 90, rows: 30, now: 231_000, act: () => {}, canStop: false, stop: () => {} })
    expect(Fixtures.textOf(tree)).toContain('에이전트 2 · 실행 1 · 대기 0 · 실패 0')
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
