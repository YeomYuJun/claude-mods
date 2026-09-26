import { DOG } from './dog.js'
import type { SpeciesDef, SpeciesId } from './types.js'

export * from './types.js'
export { DOG } from './dog.js'

export const SPECIES: Readonly<Record<SpeciesId, SpeciesDef>> = { dog: DOG }

export * as default from '.'
