// 토큰 흐름을 세고 "지금 무엇을 하는 중인가"를 정한다(순수 모듈).
// 스트림의 글자로 토큰을 어림해 즉시 수를 주고, 응답 끝의 usage 로 정확한 값에 맞춘다.

export type Status = 'idle' | 'waiting' | 'thinking' | 'streaming' | 'tool'

export const BIN_MS = 500
export const BINS = 20
// 마지막 조각이 이 시간 안에 왔으면 아직 쓰는 중이다
export const LIVE_MS = 900

export type Usage = {
  input_tokens: number
  output_tokens: number
  cache_read_input_tokens: number
  cache_creation_input_tokens: number
}

export type Meter = {
  out: number
  inp: number
  credit: number
  estimates: Map<string, number>
  turns: Set<string>
  tools: number
  lastKind?: 'text' | 'thinking' | 'tool'
  lastAt?: number
  seen: boolean
  pending: number
  bins: number[]
  binStart?: number
}

export function create(): Meter {
  return { out: 0, inp: 0, credit: 0, estimates: new Map(), turns: new Set(), tools: 0, seen: false, pending: 0, bins: new Array<number>(BINS).fill(0) }
}

// 글자 수로 토큰을 어림한다: 영문은 4 글자, 한글·한자는 1.6 글자에 한 토큰 정도
export function estimateOf(text: string): number {
  let n = 0
  for (const ch of text) n += (ch.codePointAt(0) ?? 0) < 128 ? 0.25 : 0.62
  return n
}

export function onTurn(m: Meter, turnId: string): void {
  m.turns.add(turnId)
}

export function onTurnEnd(m: Meter, turnId: string): void {
  m.turns.delete(turnId)
}

export function onText(m: Meter, step: string, kind: 'text' | 'thinking', text: string): void {
  const est = estimateOf(text)
  m.out += est
  m.credit += est
  m.pending += est
  m.estimates.set(step, (m.estimates.get(step) ?? 0) + est)
  m.lastKind = kind
  m.seen = true
}

export function onToolChunk(m: Meter): void {
  m.lastKind = 'tool'
  m.seen = true
}

// 응답이 끝났다: 어림과 실제 출력 토큰의 차이를 메운다. 모자랐던 만큼은 수로도 준다
export function onStop(m: Meter, step: string, usage: Usage | null): void {
  const est = m.estimates.get(step) ?? 0
  m.estimates.delete(step)
  if (!usage) return
  const diff = usage.output_tokens - est
  m.out += diff
  if (diff > 0) { m.credit += diff; m.pending += diff }
  m.inp += usage.input_tokens + usage.cache_read_input_tokens + usage.cache_creation_input_tokens
}

export function onToolStart(m: Meter): void {
  m.tools++
}

export function onToolEnd(m: Meter): void {
  m.tools = Math.max(0, m.tools - 1)
}

export function takeMoves(m: Meter, perMove: number, max: number): number {
  const n = Math.min(Math.floor(m.credit / perMove), max)
  m.credit -= n * perMove
  if (m.credit > perMove * max) m.credit = perMove * max
  return n
}

export function refund(m: Meter, moves: number, perMove: number): void {
  m.credit += moves * perMove
}

// 화면 한 틱: 조각이 왔으면 그 시각을 적고, 모인 토큰을 속도 막대로 옮긴다
export function tick(m: Meter, now: number): void {
  if (m.seen) { m.lastAt = now; m.seen = false }
  if (m.binStart === undefined) m.binStart = now
  while (now - m.binStart >= BIN_MS) {
    m.bins.push(m.pending)
    m.bins.shift()
    m.pending = 0
    m.binStart += BIN_MS
    if (now - m.binStart > BIN_MS * BINS) m.binStart = now
  }
}

// 패널을 다시 열 때: 닫힌 동안 쌓인 양이 한 막대로 튀지 않게 비운다
export function resetRate(m: Meter): void {
  m.pending = 0
  m.bins.fill(0)
  m.binStart = undefined
}

export function rateOf(m: Meter): number {
  const a = m.bins[BINS - 1] ?? 0
  const b = m.bins[BINS - 2] ?? 0
  return (a + b) / ((BIN_MS * 2) / 1000)
}

export function statusOf(m: Meter, now: number): Status {
  const isLive = m.lastAt !== undefined && now - m.lastAt < LIVE_MS
  if (m.tools > 0 || (isLive && m.lastKind === 'tool')) return 'tool'
  if (isLive && m.lastKind === 'thinking') return 'thinking'
  if (isLive) return 'streaming'
  if (m.turns.size > 0) return 'waiting'
  return 'idle'
}
