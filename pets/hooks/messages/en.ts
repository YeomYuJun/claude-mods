import type { BiomeId } from '../biome'
import type { OrderName } from '../pet'
import type { Zoom } from '../scene'
import type { BreedId } from '../species'
import type { Messages } from './types.js'

const SET_LABELS: Readonly<Record<BiomeId, string>> = {
  paper: 'grid paper', meadow: 'meadow', mountain: 'mountain', forest: 'forest', lake: 'lakeside', beach: 'beach', snow: 'snowfield', desert: 'desert',
}
const BREED_LABELS: Readonly<Record<BreedId, string>> = {
  dog: 'white puppy', shiba: 'Shiba', blackdog: 'black puppy', dalmatian: 'spotted puppy', brown: 'brown puppy',
  cat: 'gray tabby cat', cheese: 'ginger cat', turtle: 'turtle', duck: 'duck', penguin: 'penguin', claude: 'Claude mascot',
}
const ORDER_LABELS: Readonly<Record<OrderName, string>> = {
  sleep: 'sleep', wake: 'wake up', sit: 'sit', lie: 'lie down', play: 'play', ball: 'kick the ball', fetch: 'fetch the ball',
  zoomies: 'do zoomies', roam: 'wander far', explore: 'look around', come: 'come and sit',
}

// 목록 글: "paper (grid paper), meadow, …". 라벨이 id 와 같은 낱말이면 id 만 쓴다
function listOf<K extends string>(ids: readonly K[], labels: Readonly<Record<K, string>>): string {
  return ids.map(id => (labels[id].toLowerCase() === id ? id : `${id} (${labels[id]})`)).join(', ')
}

function zoomName(zoom: Zoom): string {
  if (zoom === 'wide') return 'map view'
  if (zoom === 'far') return 'far view'
  return `${zoom}x`
}

export const en = {
  commandDescription: 'Open or close the pets panel. zoom [in|out|wide|far|1|2]: map view (wide), far view, 1x, 2x; world [set|auto]: map set; pet [breed|auto]: animal (dog and cat breeds); idle [on|off]: stay awake without signals; do <action>: give an order',
  argumentHint: 'zoom [in|out|wide|far|1|2] | world [set|auto] | pet [breed|auto] | idle [on|off] | do <action>',
  panelShown: 'Opened the pets panel',
  panelHidden: 'Closed the pets panel',
  usage: '/pets (open or close the panel), /pets zoom (cycle map view → far view → 1x → 2x), /pets zoom in · out (one step), /pets zoom wide · far · 1 · 2 (jump to that step), /pets world (show or change the map set), /pets pet (show or change the animal), /pets idle on · off (stay awake without signals), /pets do <action> (give an order)',
  zoomChanged: zoom => (zoom === 'wide' ? 'Switched to map view, the widest' : zoom === 'far' ? 'Switched to far view' : `Set the pixel size to ${zoom}x`),
  zoomLimit: zoom => (zoom === 'wide' ? 'Already at the widest view (map view)' : 'Already at the largest view (2x)'),
  zoomSame: zoom => `Already in ${zoomName(zoom)}`,
  setLabels: SET_LABELS,
  breedLabels: BREED_LABELS,
  orderLabels: ORDER_LABELS,
  worldChoices: ids => `${listOf(ids, SET_LABELS)}, auto (a set other than paper each session)`,
  worldNow: (label, isAuto, choices) => `Map set: ${label}${isAuto ? ' (auto)' : ''}. Sets: ${choices}`,
  worldChanged: (label, isAuto) => `${isAuto ? `Switched the map set to auto (this session uses ${label})` : `Switched the map set to ${label}`}. Built a new map and placed the animal anew`,
  worldUnknown: (word, choices) => `No map set named '${word}'. Sets: ${choices}`,
  petChoices: ids => `${listOf(ids, BREED_LABELS)}, auto (an animal other than the white puppy each session)`,
  petNow: (label, isAuto, choices) => `Animal: ${label}${isAuto ? ' (auto)' : ''}. Breeds: ${choices}`,
  petChanged: (label, isAuto, dropped) =>
    `${isAuto ? `Switched the animal to auto (this session has the ${label})` : `Switched the animal to the ${label}`}${dropped > 0 ? `. Only one animal is kept for now, so the first was used (${dropped} ignored)` : ''}`,
  petUnknown: (word, choices) => `No breed named '${word}'. Breeds: ${choices}`,
  idleNow: (on, sleepAfterMin, sleepMin) => (on
    ? 'Stay-awake is on. The animal does not fall asleep without signals (turn it off with /pets idle off)'
    : `Stay-awake is off. After ${sleepAfterMin} min without signals the animal falls asleep and wakes ${sleepMin} min later (turn it on with /pets idle on)`),
  idleChanged: on => (on ? 'Turned stay-awake on. The animal does not fall asleep without signals' : 'Turned stay-awake off. The animal falls asleep again without signals'),
  idleUsage: '/pets idle (current state), /pets idle on · off',
  doChoices: ids => listOf(ids, ORDER_LABELS),
  doUsage: choices => `/pets do <action>. Actions: ${choices}`,
  doUnknown: (word, choices) => `No action named '${word}'. Actions: ${choices}`,
  doDone: label => `Ordered the animal to ${label}`,
  doClosed: 'The pets panel is closed. Open it with /pets, then give the order again',
  doRefused: {
    awake: 'Already awake',
    ball: 'The ball is out of reach',
    asleep: 'Already asleep',
    far: 'No far tile to go to from here',
  },
  tooSmall: (minCols, minRows, cols, rows) => [`The panel needs at least ${minCols} columns × ${minRows} rows`, `Now ${cols} columns × ${rows} rows`],
  notTerminal: 'Pets draw only in a terminal panel',
} satisfies Messages
