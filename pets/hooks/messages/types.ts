import type { BiomeId } from '../biome'
import type { OrderName, OrderRefusal } from '../pet'
import type { Zoom } from '../scene'
import type { BreedId } from '../species'

export type Messages = {
  commandDescription: string
  argumentHint: string
  panelShown: string
  panelHidden: string
  usage: string
  zoomChanged: (zoom: Zoom) => string
  zoomLimit: (zoom: Zoom) => string
  zoomSame: (zoom: Zoom) => string
  setLabels: Readonly<Record<BiomeId, string>>
  breedLabels: Readonly<Record<BreedId, string>>
  orderLabels: Readonly<Record<OrderName, string>>
  worldChoices: (ids: readonly BiomeId[]) => string
  worldNow: (label: string, isAuto: boolean, choices: string) => string
  worldChanged: (label: string, isAuto: boolean) => string
  worldUnknown: (word: string, choices: string) => string
  petChoices: (ids: readonly BreedId[]) => string
  petNow: (label: string, isAuto: boolean, choices: string) => string
  petChanged: (label: string, isAuto: boolean, dropped: number) => string
  petUnknown: (word: string, choices: string) => string
  idleNow: (on: boolean, sleepAfterMin: number, sleepMin: number) => string
  idleChanged: (on: boolean) => string
  idleUsage: string
  doChoices: (ids: readonly OrderName[]) => string
  doUsage: (choices: string) => string
  doUnknown: (word: string, choices: string) => string
  doDone: (label: string) => string
  doClosed: string
  doRefused: Readonly<Record<OrderRefusal, string>>
  tooSmall: (minCols: number, minRows: number, cols: number, rows: number) => string[]
  notTerminal: string
}
