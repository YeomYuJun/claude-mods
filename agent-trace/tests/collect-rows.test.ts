import { describe, expect, test } from 'claude-code/testing'

import Collect from '../hooks/collect'
import Fixtures from './fixtures'

describe('collect rows', () => {
  test('a line cut mid-write waits for the next read', () => {
    const whole = Fixtures.jsonl([Fixtures.userText('go', 1000)])
    const cut = `${whole}{"type":"assist`
    expect(Collect.parseLines(cut)).toHaveLength(1)
  })

  test('a BOM and a broken line do not stop the rest', () => {
    const text = `\uFEFF${JSON.stringify(Fixtures.userText('a', 1))}\nnot json\n${JSON.stringify(Fixtures.userText('b', 2))}\n`
    expect(Collect.parseLines(text).map(row => Collect.plainTextOf(row))).toEqual(['a', 'b'])
  })

  test('accessors read tool uses, time, usage and model', () => {
    const row = Fixtures.toolUse('t1', 'Read', { file_path: 'D:/a.ts' }, 5000)
    expect(Collect.blocksOf(row)[0]?.name).toBe('Read')
    expect(Collect.atOf(row)).toBe(5000)
    expect(Collect.usageTotalOf(row)).toBe(2 + 100 + 20_000 + 1_000)
    expect(Collect.modelOf(row)).toBe('claude-opus-5')
  })

  test('summary and file op of a tool input', () => {
    expect(Collect.summaryOf({ command: 'npm test\nsecond line' })).toBe('npm test')
    expect(Collect.summaryOf({ file_path: 'D:/a.ts', old_string: 'x' })).toBe('D:/a.ts')
    expect(Collect.fileOpOf('Edit')).toBe('edit')
    expect(Collect.fileOpOf('NotebookEdit')).toBe('edit')
    expect(Collect.fileOpOf('Write')).toBe('write')
    expect(Collect.fileOpOf('Read')).toBe('read')
    expect(Collect.fileOpOf('Bash')).toBeUndefined()
    expect(Collect.filePathOf({ notebook_path: 'D:/n.ipynb' })).toBe('D:/n.ipynb')
  })
})
