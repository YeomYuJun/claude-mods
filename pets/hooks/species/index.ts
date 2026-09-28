import { DOG } from './dog.js'
import type { BitmapSpec, BreedDef, BreedId, SpeciesDef, SpeciesId } from './types.js'

export * from './types.js'
export { DOG } from './dog.js'

export const SPECIES: Readonly<Record<SpeciesId, SpeciesDef>> = { dog: DOG }

// 모든 품종(지금은 강아지 품종뿐). 첫 번째가 기본
export const BREEDS: readonly BreedDef[] = DOG.breeds
export const DEFAULT_BREED: BreedId = BREEDS[0]!.id

export function breedOf(id: BreedId): BreedDef {
  return BREEDS.find(b => b.id === id)!
}

// 명령 인자(id 나 한국어 별칭, 소문자로 받는다)로 품종을 찾는다
export function findBreed(word: string): BreedDef | undefined {
  return BREEDS.find(b => b.id === word || b.aliases.includes(word))
}

export function isBreedId(value: unknown): value is BreedId {
  return BREEDS.some(b => b.id === value)
}

// 자동: 세션 시드로 기본 품종을 뺀 품종 중 하나. 같은 세션이면 같은 품종이다
export function autoBreed(seed: number): BreedId {
  const choices = BREEDS.filter(b => b.id !== DEFAULT_BREED)
  return choices[((seed ^ 0x5bec) >>> 0) % choices.length]!.id
}

// 칸 좌표 해시(0~1). 무늬 자리를 고른다. 좌우 반전 전 좌표라 방향을 바꿔도 무늬가 따라간다
function spotAt(x: number, y: number, salt: number): number {
  let h = Math.imul(x + 0x9e37, 0x85ebca6b) ^ Math.imul(y + 0x79b9, 0xc2b2ae35) ^ salt
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d)
  h ^= h >>> 13
  return (h >>> 0) / 4294967296
}

const SPOT = 'P'

function spotted(spec: BitmapSpec, density: number, salt: number): BitmapSpec {
  return { ...spec, rows: spec.rows.map((row, y) => row.replace(/w/g, (ch, x: number) => spotAt(x - spec.ax, y - spec.ay, salt) < density ? SPOT : ch)) }
}

const looks = new Map<BreedId, SpeciesDef>()

// 품종의 모습: 무늬가 있는 품종은 몸 털 칸 일부를 무늬 역할로 바꾼 비트맵을 가진 종 정의 사본. 품종마다 한 번만 만든다
export function lookOf(id: BreedId): SpeciesDef {
  const done = looks.get(id)
  if (done) return done
  const breed = breedOf(id)
  let look = DOG
  if (breed.spots !== undefined) {
    const d = breed.spots
    const s = DOG.sprite
    const b = s.bodies
    look = {
      ...DOG,
      sprite: {
        ...s,
        codes: { ...s.codes, [SPOT]: 'pattern' },
        bodies: {
          stand: spotted(b.stand, d, 1), sit: spotted(b.sit, d, 2), lie: spotted(b.lie, d, 3), curlA: spotted(b.curlA, d, 4),
          curlB: spotted(b.curlB, d, 4), frontSit: spotted(b.frontSit, d, 5), frontStand: spotted(b.frontStand, d, 5),
        },
        heads: { face: spotted(s.heads.face, d, 6), back: spotted(s.heads.back, d, 7) },
      },
    }
  }
  looks.set(id, look)
  return look
}

export * as default from '.'
