import { describe, expect, test } from 'claude-code/testing'

import Names from '../hooks/names'
import Pet, { type ActClass, type ActName, type Activity, type Pet as PetState, type Step } from '../hooks/pet'
import World, { type World as WorldState } from '../hooks/world'

const T0 = 1_000_000
const CLASSES: readonly ActClass[] = ['N', 'S', 'A', 'T', 'P', 'E', 'G']

type Outcome = 'cut' | 'queueFront' | 'queueBack' | 'extend' | 'resume' | 'drop' | 'ear'

function run(p: PetState, world: WorldState, ms: number, from: number): number {
  let now = from
  for (let t = 0; t < ms; t += Names.SIM_STEP_MS) {
    now += Names.SIM_STEP_MS
    Pet.update(p, world, Names.SIM_STEP_MS, now)
  }
  return now
}

function still(name: ActName, steps: Step[]): Activity {
  return { name, steps, i: 0, t: 0, started: -1 }
}

// 부류마다 한 가지 행동에 들어가 있는 강아지. 한 스텝 돌려 첫 단계를 시작해 둔다
function petIn(world: WorldState, cls: ActClass): { p: PetState; now: number } {
  const p = Pet.create(world, 7, T0)
  const acts: Record<ActClass, Activity> = {
    N: still('sit', [{ k: 'pose', pose: 'sit', ms: 10_000 }]),
    S: still('bedtime', [{ k: 'pose', pose: 'sleep', ms: Infinity }]),
    A: still('attend', [{ k: 'pose', pose: 'look', ms: 10_000 }]),
    T: still('dig', [{ k: 'pose', pose: 'dig', ms: 1500, grow: true }, { k: 'pose', pose: 'sniff', ms: 600 }]),
    P: still('beg', [{ k: 'pose', pose: 'frontSit', ms: 10_000 }]),
    E: still('settle', [{ k: 'pose', pose: 'frontSit', ms: 10_000, emote: 'heart' }]),
    G: still('greet', [{ k: 'pose', pose: 'look', ms: 10_000 }]),
  }
  p.act = acts[cls]
  const now = run(p, world, Names.SIM_STEP_MS, T0)
  return { p, now }
}

// 신호 하나: 부르는 방법과 그 신호가 끊고 들어올 때의 행동 이름. 표의 한 줄은 부류 순서(N S A T P E G)대로의 결과
type Row = { reaction: ActName; send: (p: PetState, world: WorldState, now: number) => void; expect: readonly Outcome[] }

const ROWS: Readonly<Record<string, Row>> = {
  'main tool call': { reaction: 'dig', send: (p, w, now) => Pet.onTool(p, w, now), expect: ['cut', 'drop', 'cut', 'extend', 'drop', 'resume', 'queueFront'] },
  'subagent tool call': { reaction: 'dig', send: (p, w, now) => Pet.onSubTool(p, now), expect: ['ear', 'drop', 'drop', 'drop', 'drop', 'drop', 'drop'] },
  'tool error': { reaction: 'bark', send: (p, w, now) => Pet.onToolFail(p, w, now, 'error'), expect: ['cut', 'drop', 'cut', 'cut', 'drop', 'drop', 'queueBack'] },
  'permission wait': { reaction: 'beg', send: (p, w, now) => Pet.onPermission(p, w, now), expect: ['cut', 'drop', 'cut', 'cut', 'extend', 'queueFront', 'queueBack'] },
  'main turn end': { reaction: 'settle', send: (p, w, now) => Pet.onTurnEnd(p, w, now), expect: ['cut', 'drop', 'cut', 'queueBack', 'queueBack', 'cut', 'queueBack'] },
  'long thinking': { reaction: 'ponder', send: (p, w, now) => { Pet.onThinkPiece(p, w, now); Pet.onThinkPiece(p, w, now + 3500) }, expect: ['cut', 'drop', 'drop', 'drop', 'drop', 'drop', 'drop'] },
  'typing': { reaction: 'attend', send: (p, w, now) => Pet.onTyping(p, w, now), expect: ['cut', 'ear', 'drop', 'drop', 'drop', 'drop', 'drop'] },
  'subagent start': { reaction: 'seeOff', send: (p, w, now) => Pet.onSubagentStart(p, w, now), expect: ['cut', 'drop', 'drop', 'drop', 'drop', 'drop', 'drop'] },
  'compaction': { reaction: 'shakeOff', send: (p, w, now) => Pet.onCompact(p, w, now), expect: ['cut', 'drop', 'queueBack', 'queueBack', 'queueBack', 'queueBack', 'queueBack'] },
}

function check(world: WorldState, label: string, row: Row): void {
  CLASSES.forEach((cls, i) => {
    const { p, now } = petIn(world, cls)
    const before = p.act
    const step = before.steps[before.i]
    const ms = step?.k === 'pose' ? step.ms : 0
    row.send(p, world, now)
    const got = (() => {
      const want = row.expect[i]!
      const same = p.act === before
      const names = p.queue.map(a => a.name)
      switch (want) {
        case 'cut': return !same && p.act.name === row.reaction && names.length === 0
        case 'resume': return !same && p.act.name === row.reaction && names[0] === before.name
        case 'queueFront': return same && names[0] === row.reaction
        case 'queueBack': return same && names[names.length - 1] === row.reaction
        case 'extend': return same && names.length === 0 && (before.steps[before.i] as { ms: number }).ms === (cls === 'T' ? ms + 900 : ms)
        case 'drop': return same && names.length === 0 && p.glance === undefined && !p.skipZ
        case 'ear': return same && names.length === 0 && (p.isAsleep ? p.skipZ : p.glance !== undefined)
      }
    })()
    expect(`${label} × ${cls} → ${got ? row.expect[i] : `not ${row.expect[i]} (act ${p.act.name}, queue ${p.queue.map(a => a.name).join(',')})`}`).toBe(`${label} × ${cls} → ${row.expect[i]}`)
  })
}

describe('signals', () => {
  test('tool calls, tool failures and permission waits act on each kind of current action as the table says', async () => {
    const world = World.create(7)
    for (const label of ['main tool call', 'subagent tool call', 'tool error', 'permission wait']) check(world, label, ROWS[label]!)
  })

  test('turn ends, thinking, typing, subagent starts and compaction act on each kind of current action as the table says', async () => {
    const world = World.create(7)
    for (const label of ['main turn end', 'long thinking', 'typing', 'subagent start', 'compaction']) check(world, label, ROWS[label]!)
  })

  test('a prompt cuts in from every kind of action and clears the queue', async () => {
    const world = World.create(7)
    for (const cls of CLASSES) {
      const { p, now } = petIn(world, cls)
      p.queue.push(Pet.build('dig', p, world))
      Pet.onTurnStart(p, world, now)
      expect(`${cls} ${p.act.name} ${p.queue.length} ${p.isAsleep}`).toBe(`${cls} greet 0 false`)
    }
  })

  test('a hundred subagent tool calls in ten seconds change the action at most three times and never start a dig', async () => {
    const world = World.create(7)
    const p = Pet.create(world, 7, T0)
    let now = run(p, world, 500, T0)
    let changes = 0
    let digs = 0
    for (let i = 0; i < 100; i++) {
      const act = p.act
      Pet.onToolStart(p, now, false)
      Pet.onSubTool(p, now)
      if (p.act !== act) changes++
      if (p.act.name === 'dig' && p.act !== act) digs++
      now = run(p, world, 100, now)
      Pet.onToolEnd(p, now, false)
    }
    expect(changes <= 3).toBe(true)
    expect(digs).toBe(0)
  })

  test('twenty main tool calls in two seconds keep one dig no longer than four seconds', async () => {
    const world = World.create(7)
    const p = Pet.create(world, 7, T0)
    let now = run(p, world, 500, T0)
    let changes = 0
    let digMs = 0
    let longest = 0
    for (let i = 0; i < 20; i++) {
      const act = p.act
      Pet.onTool(p, world, now, 'Bash')
      if (p.act !== act) changes++
      for (let k = 0; k < 6; k++) {
        now = run(p, world, Names.SIM_STEP_MS, now)
        digMs = p.pose === 'dig' ? digMs + Names.SIM_STEP_MS : 0
        longest = Math.max(longest, digMs)
      }
    }
    for (let k = 0; k < 400; k++) {
      now = run(p, world, Names.SIM_STEP_MS, now)
      digMs = p.pose === 'dig' ? digMs + Names.SIM_STEP_MS : 0
      longest = Math.max(longest, digMs)
    }
    expect(changes <= 3).toBe(true)
    expect(longest <= 4000 + Names.SIM_STEP_MS).toBe(true)
  })

  test('a sleeping dog stays asleep through every signal but a prompt, and skips one z for typing', async () => {
    const world = World.create(7)
    const { p } = petIn(world, 'S')
    let now = run(p, world, 3000, T0)
    const signals: Array<(t: number) => void> = [
      t => Pet.onTool(p, world, t, 'Read'), t => Pet.onSubTool(p, t), t => Pet.onToolFail(p, world, t, 'error'),
      t => Pet.onToolFail(p, world, t, 'deny'), t => Pet.onPermission(p, world, t), t => Pet.onPermissionEnd(p),
      t => Pet.onTurnEnd(p, world, t, 'answer'), t => Pet.onTurnEnd(p, world, t, 'aborted'), t => Pet.onTurnEnd(p, world, t, 'error'),
      t => Pet.onTurnEnd(p, world, t, 'refusal'), t => { Pet.onThinkPiece(p, world, t); Pet.onThinkPiece(p, world, t + 4000) },
      t => Pet.onThinkEnd(p), t => Pet.onTyping(p, world, t), t => Pet.onPromptQueued(p, world, t),
      t => Pet.onSubagentStart(p, world, t), t => Pet.onSubagentEnd(p, world, t), t => Pet.onCompact(p, world, t),
      t => { Pet.onToolStart(p, t); Pet.onStream(p, t) }, t => Pet.onToolEnd(p, t),
    ]
    for (const send of signals) {
      send(now)
      now = run(p, world, 2000, now)
      expect(`${p.isAsleep} ${p.pose} ${p.act.name}`).toBe('true sleep bedtime')
    }
    now = run(p, world, 5000, now)
    Pet.onTyping(p, world, now)
    expect(p.skipZ).toBe(true)
    run(p, world, 2000, now)
    expect(p.skipZ).toBe(false)
  })

  test('a tool error that arrives after the turn ended does not cut the settling', async () => {
    const world = World.create(7)
    const p = Pet.create(world, 7, T0)
    const now = run(p, world, 300, T0)
    Pet.onTurnEnd(p, world, now)
    const settle = p.act
    Pet.onToolFail(p, world, now + 200, 'error')
    expect(p.act).toBe(settle)
    expect(p.queue.length).toBe(0)
  })

  test('the dog noses reads and searches, pricks up at web and MCP tools, and digs for edits, commands and unknown tools', async () => {
    const cases: Array<[string | undefined, ActName]> = [
      ['Read', 'nose'], ['Grep', 'nose'], ['Glob', 'nose'], ['ToolSearch', 'nose'], ['WebFetch', 'alert'], ['WebSearch', 'alert'],
      ['mcp__github__search', 'alert'], ['Bash', 'dig'], ['PowerShell', 'dig'], ['Edit', 'dig'], ['Write', 'dig'], ['Frobnicate', 'dig'], [undefined, 'dig'],
    ]
    const world = World.create(7)
    for (const [tool, want] of cases) {
      const { p, now } = petIn(world, 'N')
      Pet.onTool(p, world, now, tool)
      expect(`${tool} ${p.act.name}`).toBe(`${tool} ${want}`)
    }
  })

  test('a turn that was interrupted startles the dog with a hop, an error makes it sulk, a refusal puzzles it, and a long answer stretches first', async () => {
    const world = World.create(7)
    const cases: Array<[Parameters<typeof Pet.onTurnEnd>[3], number, ActName]> = [['aborted', 0, 'startle'], ['error', 0, 'sulk'], ['refusal', 0, 'puzzled'], ['answer', 0, 'settle']]
    for (const [reason, ms, want] of cases) {
      const { p, now } = petIn(world, 'N')
      Pet.onTurnEnd(p, world, now, reason, ms)
      expect(p.act.name).toBe(want)
      if (want === 'startle') {
        run(p, world, 50, now)
        expect(p.hop !== undefined && p.hop.tx === p.hop.fx).toBe(true)
      }
    }
    const { p, now } = petIn(world, 'N')
    Pet.onTurnEnd(p, world, now, 'answer', 150_000)
    expect(p.act.steps.slice(0, 2).map(s => s.k === 'pose' ? s.pose : s.k)).toEqual(['stretch', 'shake'])
  })

  test('a failed tool barks, a denied one puzzles, and a second failure within twenty seconds sulks', async () => {
    const world = World.create(7)
    const a = petIn(world, 'N')
    Pet.onToolFail(a.p, world, a.now, 'error')
    expect(a.p.act.name).toBe('bark')
    const b = petIn(world, 'N')
    Pet.onToolFail(b.p, world, b.now, 'deny')
    expect(b.p.act.name).toBe('puzzled')
    let now = run(b.p, world, 5000, b.now)
    Pet.onToolFail(b.p, world, now, 'error')
    expect(b.p.act.name).toBe('sulk')
    now = run(b.p, world, 25_000, now)
    Pet.onToolFail(b.p, world, now, 'error')
    expect(b.p.act.name).toBe('bark')
  })

  test('a main tool running past four seconds brings the dog to sit in front and wait, and its end lets the dog go', async () => {
    const world = World.create(7)
    const p = Pet.create(world, 7, T0)
    Pet.onToolStart(p, T0, false)
    let now = run(p, world, 6000, T0)
    expect(p.act.name === 'wait').toBe(false)
    Pet.onToolStart(p, now)
    now = run(p, world, 3500, now)
    expect(p.act.name === 'wait').toBe(false)
    now = run(p, world, 1000, now)
    expect(p.act.name).toBe('wait')
    now = run(p, world, 8000, now)
    expect(p.act.name).toBe('wait')
    Pet.onToolEnd(p, now)
    run(p, world, 50, now)
    expect(p.act.name === 'wait').toBe(false)
  })

  test('a permission wait begs until ninety seconds pass, then lies in front, and ends when the wait ends', async () => {
    const world = World.create(7)
    const { p, now: t0 } = petIn(world, 'N')
    Pet.onPermission(p, world, t0)
    expect(p.act.name).toBe('beg')
    let now = run(p, world, 20_000, t0)
    expect(p.act.name).toBe('beg')
    now = run(p, world, 80_000, now)
    expect(p.act.name).toBe('beg')
    now = run(p, world, 12_000, now)
    expect(p.act.steps.some(s => s.k === 'pose' && s.pose === 'lieRest')).toBe(true)
    Pet.onPermissionEnd(p)
    run(p, world, 50, now)
    expect(p.act.name === 'beg').toBe(false)
  })

  test('three seconds of thinking with no text sits the dog down to think, and the first text ends it', async () => {
    const world = World.create(7)
    const { p, now } = petIn(world, 'N')
    Pet.onThinkPiece(p, world, now)
    Pet.onThinkPiece(p, world, now + 2000)
    expect(p.act.name).toBe('sit')
    Pet.onThinkPiece(p, world, now + 3100)
    expect(p.act.name).toBe('ponder')
    Pet.onThinkEnd(p)
    run(p, world, 50, now + 3100)
    expect(p.act.name === 'ponder').toBe(false)
    expect(p.thinkSince).toBe(undefined)
  })

  test('a turn that ends in the middle of thinking does not carry the thinking time into the next turn', async () => {
    const world = World.create(7)
    const { p, now } = petIn(world, 'N')
    Pet.onThinkPiece(p, world, now)
    Pet.onTurnEnd(p, world, now + 1000, 'aborted')
    let t = run(p, world, 20_000, now + 1000)
    Pet.onTurnStart(p, world, t)
    t = run(p, world, 15_000, t)
    Pet.onThinkPiece(p, world, t)
    expect(p.act.name === 'ponder').toBe(false)
    Pet.onThinkPiece(p, world, t + 1000)
    expect(p.act.name === 'ponder').toBe(false)
  })

  test('typing looks up at most once in four seconds; a prompt typed during a turn looks up with !', async () => {
    const world = World.create(7)
    let looks = 0
    const { p, now } = petIn(world, 'N')
    for (let t = 0; t < 8000; t += 100) {
      const act = p.act
      Pet.onTyping(p, world, now + t)
      if (p.act !== act && p.act.name === 'attend') { looks++; p.act = still('sit', [{ k: 'pose', pose: 'sit', ms: 10_000 }]) }
    }
    expect(looks).toBe(2)
    const q = petIn(world, 'N')
    Pet.onPromptQueued(q.p, world, q.now)
    run(q.p, world, 50, q.now)
    expect(`${q.p.act.name} ${q.p.emote?.kind}`).toBe('attend !')
  })

  test('compaction forgets the older half of the visited tiles', async () => {
    const world = World.create(7)
    const p = Pet.create(world, 7, T0)
    run(p, world, 60_000, T0)
    const before = [...p.visits.keys()]
    Pet.onCompact(p, world, T0 + 60_000)
    expect([...p.visits.keys()]).toEqual(before.slice(before.length >> 1))
  })

  test('a short prompt trots a few tiles, an empty one only looks up, and one without known text runs as before', async () => {
    const world = World.create(7)
    const gaitOf = (a: Activity) => {
      const go = a.steps.find(s => s.k === 'go')
      return go?.k === 'go' ? go.gait : 'none'
    }
    const a = petIn(world, 'N')
    Pet.onTurnStart(a.p, world, a.now, 'hi')
    expect(`${a.p.act.name} ${gaitOf(a.p.act)}`).toBe('greet trot')
    const b = petIn(world, 'N')
    Pet.onTurnStart(b.p, world, b.now, 'x'.repeat(80))
    expect(`${b.p.act.name} ${gaitOf(b.p.act)}`).toBe('greet run')
    const c = petIn(world, 'N')
    Pet.onTurnStart(c.p, world, c.now, '')
    expect(c.p.act.name).toBe('attend')
    const d = petIn(world, 'N')
    Pet.onTurnStart(d.p, world, d.now)
    expect(`${d.p.act.name} ${gaitOf(d.p.act)}`).toBe('greet run')
  })
})
