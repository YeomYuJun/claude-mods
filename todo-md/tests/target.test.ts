import { describe, expect, test } from 'claude-code/testing'

import Target from '../hooks/target'

describe('target', () => {
  test('argOf strips surrounding quotes', () => {
    expect(Target.argOf('  "D:/my app/TODO.md"  ')).toBe('D:/my app/TODO.md')
    expect(Target.argOf("'docs/TODO.md'")).toBe('docs/TODO.md')
    expect(Target.argOf('docs/TODO.md')).toBe('docs/TODO.md')
    expect(Target.argOf('   ')).toBe('')
  })

  test('resolve keeps absolute paths and joins relative ones to cwd', () => {
    expect(Target.resolve('D:/claude-mods', 'C:\\work\\TODO.md')).toBe('C:/work/TODO.md')
    expect(Target.resolve('D:\\claude-mods', 'docs/TODO.md')).toBe('D:/claude-mods/docs/TODO.md')
    expect(Target.resolve('D:/claude-mods/pets', '../TODO.md')).toBe('D:/claude-mods/TODO.md')
    expect(Target.resolve('D:/my app', './a/./b/../TODO.md')).toBe('D:/my app/a/TODO.md')
    expect(Target.resolve('/home/u', '/tmp/TODO.md')).toBe('/tmp/TODO.md')
  })

  test('normalize does not climb above a root', () => {
    expect(Target.normalize('D:/../TODO.md')).toBe('D:/TODO.md')
    expect(Target.normalize('../x/TODO.md')).toBe('../x/TODO.md')
  })

  test('isSameFile ignores case and separators', () => {
    expect(Target.isSameFile('D:\\Claude-Mods\\TODO.md', 'd:/claude-mods/todo.md')).toBe(true)
    expect(Target.isSameFile('D:/a/TODO.md', 'D:/b/TODO.md')).toBe(false)
  })
})
