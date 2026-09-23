// 시드 난수(mulberry32). 상태를 객체에 두어 같은 시드면 같은 수열을 낸다(순수 모듈).

export type Rng = { s: number }

export function create(seed: number): Rng {
  return { s: seed >>> 0 }
}

export function next(r: Rng): number {
  r.s = (r.s + 0x6d2b79f5) >>> 0
  let t = r.s
  t = Math.imul(t ^ (t >>> 15), t | 1)
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}

export function range(r: Rng, lo: number, hi: number): number {
  return lo + next(r) * (hi - lo)
}

export function int(r: Rng, lo: number, hi: number): number {
  return lo + Math.floor(next(r) * (hi - lo + 1))
}

export function chance(r: Rng, p: number): boolean {
  return next(r) < p
}

export function pick<T>(r: Rng, items: readonly T[]): T {
  return items[Math.floor(next(r) * items.length)]!
}

// 가중치 무작위. 가중치가 모두 0 이면 첫 항목
export function weighted<K extends string>(r: Rng, weights: ReadonlyArray<readonly [K, number]>): K {
  let sum = 0
  for (const [, w] of weights) sum += Math.max(0, w)
  let x = next(r) * sum
  for (const [k, w] of weights) {
    x -= Math.max(0, w)
    if (x < 0) return k
  }
  return weights[0]![0]
}

// 문자열(세션 id)을 32 비트 시드로 바꾼다. FNV-1a
export function hashOf(text: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

export * as default from '.'
