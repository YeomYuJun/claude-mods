// 토큰 흐름을 세고 "지금 무엇을 하는 중인가"를 정한다(순수 모듈).
// 스트림의 글자(텍스트·생각·도구 인자 JSON)로 토큰을 어림해 즉시 수를 주고,
// 응답 끝의 usage 로 정확한 값에 맞춘다. 스트림에 보이지 않던 몫은 그 응답이 걸린 시간에 걸쳐 속도 막대에 나눠 넣는다.

export type Status = 'idle' | 'waiting' | 'thinking' | 'streaming' | 'tool'

export const BIN_MS = 500
export const BINS = 20
// 마지막 조각이 이 시간 안에 왔으면 아직 쓰는 중이다
export const LIVE_MS = 900
// tok/s 는 끝난 막대 이만큼의 평균이다(2 초)
export const RATE_BINS = 4

export type Usage = {
  input_tokens: number
  output_tokens: number
  cache_read_input_tokens: number
  cache_creation_input_tokens: number
}

export type Meter = {
  out: number
  inp: number
  estimates: Map<string, number>
  starts: Map<string, number>
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
  return { out: 0, inp: 0, estimates: new Map(), starts: new Map(), turns: new Set(), tools: 0, seen: false, pending: 0, bins: new Array<number>(BINS).fill(0) }
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

// 조각 하나를 센다. 돌려주는 값은 수로 적립할 토큰 수다
export function onText(m: Meter, step: string, kind: 'text' | 'thinking', text: string): number {
  const est = estimateOf(text)
  m.out += est
  m.pending += est
  m.estimates.set(step, (m.estimates.get(step) ?? 0) + est)
  m.lastKind = kind
  m.seen = true
  return est
}

export function onToolChunk(m: Meter): void {
  m.lastKind = 'tool'
  m.seen = true
}

// 도구 인자 JSON 조각도 출력 토큰이다. 같은 응답의 어림에 넣어 정산 때 두 번 세지 않는다
export function onInput(m: Meter, step: string, json: string): number {
  const est = estimateOf(json)
  m.out += est
  m.pending += est
  m.estimates.set(step, (m.estimates.get(step) ?? 0) + est)
  m.lastKind = 'tool'
  m.seen = true
  return est
}

export function onStepStart(m: Meter, step: string, now: number): void {
  m.starts.set(step, now)
}

// 응답이 끝났다: 어림과 실제 출력 토큰의 차이를 메운다. 모자랐던 만큼을 돌려줘 수로도 준다
export function onStop(m: Meter, step: string, usage: Usage | null, now?: number): number {
  const est = m.estimates.get(step) ?? 0
  const start = m.starts.get(step)
  m.estimates.delete(step)
  m.starts.delete(step)
  if (!usage) return 0
  const diff = usage.output_tokens - est
  m.out += diff
  m.inp += usage.input_tokens + usage.cache_read_input_tokens + usage.cache_creation_input_tokens
  if (diff <= 0) return 0
  if (start !== undefined && now !== undefined) spreadBack(m, diff, start, now)
  else m.pending += diff
  return diff
}

// [from, now] 에 고르게 나온 것으로 보고 겹치는 막대마다 시간 비율만큼 넣는다. 막대 창보다 오래된 몫은 버린다
function spreadBack(m: Meter, tokens: number, from: number, now: number): void {
  const span = now - from
  if (m.binStart === undefined || span <= 0) { m.pending += tokens; return }
  const share = (a: number, b: number) => Math.max(0, Math.min(b, now) - Math.max(a, from)) / span
  m.pending += tokens * share(m.binStart, now)
  for (let i = BINS - 1; i >= 0; i--) {
    const end = m.binStart - (BINS - 1 - i) * BIN_MS
    if (end <= from) break
    m.bins[i] = (m.bins[i] ?? 0) + tokens * share(end - BIN_MS, end)
  }
}

export function onToolStart(m: Meter): void {
  m.tools++
}

export function onToolEnd(m: Meter): void {
  m.tools = Math.max(0, m.tools - 1)
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
  let sum = 0
  for (let i = BINS - RATE_BINS; i < BINS; i++) sum += m.bins[i] ?? 0
  return sum / ((BIN_MS * RATE_BINS) / 1000)
}

export function statusOf(m: Meter, now: number): Status {
  const isLive = m.lastAt !== undefined && now - m.lastAt < LIVE_MS
  if (m.tools > 0 || (isLive && m.lastKind === 'tool')) return 'tool'
  if (isLive && m.lastKind === 'thinking') return 'thinking'
  if (isLive) return 'streaming'
  if (m.turns.size > 0) return 'waiting'
  return 'idle'
}
