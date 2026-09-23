// 토큰과 도구 호출의 낙하를 들어온 순서대로 쌓아 두고, 프레임마다 속도에 맞춰 꺼내 준다(순수 모듈).
// 쌓는 단위는 수가 아니라 토큰(실수)이다. 프레임마다 쓸 토큰 양을 tok/s 의 연속 함수로 정하고,
// 쓴 토큰이 한 수 몫(perMove)을 채울 때마다 한 수를 둔다. 한꺼번에 들어온 토큰도 한 수씩 보이게 풀린다.

export type Item = { kind: 'tokens'; n: number } | { kind: 'drop' }

// progress: 쓴 토큰 가운데 아직 수로 바꾸지 않은 몫
export type Queue = { items: Item[]; progress: number }

// 밀린 토큰을 이 시간 안에 다 쓰도록 속도를 더한다. 응답 끝 정산처럼 속도 0 에서 들어온 몫도 이만큼에 걸쳐 풀린다
export const CATCHUP_S = 1.5
// 밀린 것이 있으면 최소 이만큼(토큰/초)은 쓴다. 없으면 따라잡기 항이 0 에 가까워져 마지막 몇 수가 한참 걸린다
export const MIN_TOK_S = 48
// 한 프레임에 둘 수 있는 수의 상한. 막혀 있던 동안(줄 지우기·낙하) 모인 몫이 한 번에 튀지 않게 한다
export const MAX_MOVES_PER_FRAME = 3
export const MAX_DROPS = 3
// 낙하 속도(행/초): FALL_MIN 에서 시작해 tok/s 가 오를수록 빨라져 FALL_MAX 까지
export const FALL_MIN = 20
export const FALL_MAX = 60
export const FALL_PER_TOK = 0.4

export function create(): Queue {
  return { items: [], progress: 0 }
}

export function tokensOf(q: Queue): number {
  let n = 0
  for (const item of q.items) if (item.kind === 'tokens') n += item.n
  return n
}

export function dropsOf(q: Queue): number {
  return q.items.filter(item => item.kind === 'drop').length
}

// 토큰을 적립한다. 밀린 토큰이 상한(maxTokens)을 넘으면 오래된 것부터 버린다
export function addTokens(q: Queue, tokens: number, maxTokens: number): void {
  if (!(tokens > 0)) return
  const last = q.items[q.items.length - 1]
  if (last?.kind === 'tokens') last.n += tokens
  else q.items.push({ kind: 'tokens', n: tokens })
  let over = tokensOf(q) - maxTokens
  for (const item of q.items) {
    if (over <= 0) break
    if (item.kind !== 'tokens') continue
    const cut = Math.min(item.n, over)
    item.n -= cut
    over -= cut
  }
  q.items = q.items.filter(item => item.kind === 'drop' || item.n > 0)
}

export function addDrop(q: Queue): void {
  if (dropsOf(q) < MAX_DROPS) q.items.push({ kind: 'drop' })
}

// 이번 프레임에 쓸 토큰(들어오는 속도, 최소 MIN_TOK_S, 에 밀린 것을 CATCHUP_S 안에 따라잡을 만큼)을
// 머리의 토큰 묶음에서 꺼내 수로 바꾼다. 낙하 표시 앞에서 멈춘다(낙하는 그 앞 수가 다 둬진 뒤에 한다)
export function movesFor(q: Queue, rate: number, perMove: number, dtMs: number): number {
  const head = q.items[0]
  if (head?.kind !== 'tokens') return 0
  const want = (dtMs / 1000) * (Math.max(MIN_TOK_S, rate) + tokensOf(q) / CATCHUP_S)
  const spend = Math.min(head.n, want, perMove * MAX_MOVES_PER_FRAME - q.progress)
  head.n -= spend
  q.progress += spend
  // 한 수 몫이 안 되는 나머지는 progress 에 남아 다음 묶음과 이어진다
  if (head.n <= 1e-9) q.items.shift()
  const n = Math.floor(q.progress / perMove + 1e-9)
  q.progress -= n * perMove
  return n
}

// 수를 두지 못했다(블록이 막혀 있다): 그 몫을 머리로 돌려준다
export function refund(q: Queue, moves: number, perMove: number): void {
  if (moves <= 0) return
  const head = q.items[0]
  if (head?.kind === 'tokens') head.n += moves * perMove
  else q.items.unshift({ kind: 'tokens', n: moves * perMove })
}

export function takeDrop(q: Queue): boolean {
  if (q.items[0]?.kind !== 'drop') return false
  q.items.shift()
  return true
}

export function fallRowsOf(rate: number): number {
  return Math.min(FALL_MAX, FALL_MIN + rate * FALL_PER_TOK)
}
