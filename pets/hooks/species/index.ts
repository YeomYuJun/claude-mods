import { CAT } from './cat.js'
import { DOG } from './dog.js'
import { BASE_BODIES, EXTRA_BODIES, HEAD_KINDS, type BitmapSpec, type BodyKind, type BreedDef, type BreedId, type HeadKind, type SpeciesDef, type SpeciesId } from './types.js'

export * from './types.js'
export { CAT } from './cat.js'
export { DOG } from './dog.js'

export const SPECIES: Readonly<Record<SpeciesId, SpeciesDef>> = { dog: DOG, cat: CAT }

// 모든 품종(강아지 품종 다음 고양이 품종). 첫 번째가 기본
export const BREEDS: readonly BreedDef[] = [...DOG.breeds, ...CAT.breeds]
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

// 그림마다 점 자리를 고르는 소금. 같은 모습의 그림(웅크린 잠 두 장, 정면 몸, 옆머리)은 같은 값이라 점이 같은 자리에 남는다
const SALT: Readonly<Record<BodyKind | HeadKind, number>> = {
  stand: 1, sit: 2, lie: 3, curlA: 4, curlB: 4, frontSit: 5, frontStand: 5, bellyA: 8, bellyB: 8, frontBeg: 5,
  face: 6, back: 7, alert: 6, droop: 6, tilt: 5,
}

// 몸 털 칸(w)을 무늬 역할로 바꾼다. 점박이는 칸 해시 비율, 줄무늬는 x 가 간격의 배수인 세로 줄(바닥 점 기준 좌표)
function patterned(spec: BitmapSpec, breed: BreedDef, salt: number): BitmapSpec {
  const hit = (x: number, y: number): boolean => breed.spots !== undefined
    ? spotAt(x, y, salt) < breed.spots
    : ((x % breed.stripes!) + breed.stripes!) % breed.stripes! === 0
  return { ...spec, rows: spec.rows.map((row, y) => row.replace(/w/g, (ch, x: number) => hit(x - spec.ax, y - spec.ay) ? SPOT : ch)) }
}

// 품종의 종
export function speciesOf(id: BreedId): SpeciesDef {
  return SPECIES[breedOf(id).species]
}

const looks = new Map<BreedId, SpeciesDef>()

// 품종의 모습: 그 종의 정의. 무늬가 있는 품종은 몸 털 칸 일부를 무늬 역할로 바꾼 비트맵을 가진 사본. 품종마다 한 번만 만든다
export function lookOf(id: BreedId): SpeciesDef {
  const done = looks.get(id)
  if (done) return done
  const breed = breedOf(id)
  const species = SPECIES[breed.species]
  let look = species
  if (breed.spots !== undefined || breed.stripes !== undefined) {
    const s = species.sprite
    const src: Readonly<Partial<Record<BodyKind, BitmapSpec>>> = s.bodies
    const bodies: Partial<Record<BodyKind, BitmapSpec>> = {}
    for (const kind of [...BASE_BODIES, ...EXTRA_BODIES]) {
      const spec = src[kind]
      if (spec) bodies[kind] = patterned(spec, breed, SALT[kind])
    }
    const heads: Partial<Record<HeadKind, BitmapSpec>> = {}
    for (const kind of HEAD_KINDS) {
      const spec = s.heads[kind]
      if (spec) heads[kind] = patterned(spec, breed, SALT[kind])
    }
    look = {
      ...species,
      sprite: {
        ...s,
        codes: { ...s.codes, [SPOT]: 'pattern' },
        bodies: bodies as SpeciesDef['sprite']['bodies'],
        heads: heads as SpeciesDef['sprite']['heads'],
      },
    }
  }
  looks.set(id, look)
  return look
}

export * as default from '.'
