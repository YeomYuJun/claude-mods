// 짧게 살다 사라지는 효과: 먼지, 흙, 잠꼬대 z, 머리 위 감정 표시(순수 모듈).
// 위치는 세계 픽셀이라 카메라가 움직여도 제자리에 남는다.

export type ParticleKind = 'dust' | 'dirt' | 'z' | 'drop'

export type Particle = {
  kind: ParticleKind
  x: number
  y: number
  vx: number
  vy: number
  // 아래로 당기는 가속(px/s²). 먼지·z 는 0 에 가깝고 흙은 크다
  g: number
  age: number
  life: number
}

export type EmoteKind = '!' | '?' | 'heart' | 'note'

export type Emote = { kind: EmoteKind; age: number; life: number }

export const MAX_PARTICLES = 40

export function spawn(list: Particle[], p: Omit<Particle, 'age'>): void {
  if (list.length >= MAX_PARTICLES) list.shift()
  list.push({ ...p, age: 0 })
}

export function step(list: Particle[], dtMs: number): void {
  const dt = dtMs / 1000
  for (const p of list) {
    p.age += dtMs
    p.vy += p.g * dt
    // 먼지와 z 는 공기 저항으로 금방 느려진다
    if (p.kind === 'dust' || p.kind === 'z') { p.vx *= Math.exp(-3 * dt); p.vy *= Math.exp(-2 * dt) }
    p.x += p.vx * dt
    p.y += p.vy * dt
  }
  for (let i = list.length - 1; i >= 0; i--) if (list[i]!.age >= list[i]!.life) list.splice(i, 1)
}

export function emoteOf(kind: EmoteKind, life: number): Emote {
  return { kind, age: 0, life }
}
