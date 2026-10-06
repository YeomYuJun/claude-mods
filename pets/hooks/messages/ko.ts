import type { BiomeId } from '../biome'
import type { OrderName } from '../pet'
import type { BreedId } from '../species'
import type { Messages } from './types.js'

const SET_LABELS: Readonly<Record<BiomeId, string>> = {
  paper: '모눈종이', meadow: '초원', mountain: '산악', forest: '숲', lake: '호숫가', beach: '해변', snow: '설원', desert: '사막',
}
const BREED_LABELS: Readonly<Record<BreedId, string>> = {
  dog: '흰 강아지', shiba: '시바', blackdog: '검은 강아지', dalmatian: '점박이', brown: '갈색 강아지',
  cat: '회색 줄무늬 고양이', cheese: '치즈 고양이', turtle: '거북이', duck: '오리', penguin: '펭귄', claude: 'Claude 마스코트',
}
const ORDER_LABELS: Readonly<Record<OrderName, string>> = {
  sleep: '자기', wake: '깨기', sit: '앉기', lie: '엎드리기', play: '놀기', ball: '공 차기', fetch: '공 물어 오기',
  zoomies: '연달아 뛰기', roam: '멀리 가기', explore: '둘러보기', come: '앞으로 와서 앉기',
}

// 목록 글: "paper 모눈종이, meadow 초원, …"
function listOf<K extends string>(ids: readonly K[], labels: Readonly<Record<K, string>>): string {
  return ids.map(id => `${id} ${labels[id]}`).join(', ')
}

export const ko = {
  commandDescription: '동물 패널을 열고 닫는다. zoom [in|out|wide|far|1|2]: 맵 보기(wide)·원거리(far)·1 배·2 배, world [세트|auto]: 맵 세트, pet [품종|auto]: 동물(강아지·고양이 품종), idle [on|off]: 신호가 없어도 잠들지 않기, do <행동>: 행동 시키기',
  argumentHint: 'zoom [in|out|wide|far|1|2] | world [세트|auto] | pet [품종|auto] | idle [on|off] | do <행동>',
  panelShown: '동물 패널을 열었다',
  panelHidden: '동물 패널을 닫았다',
  usage: '/pets (패널 열고 닫기), /pets zoom (맵 보기 → 원거리 → 1 배 → 2 배 순환), /pets zoom in · out (한 단계씩), /pets zoom wide · far · 1 · 2 (그 단계로 바로), /pets world (맵 세트 보기·바꾸기), /pets pet (동물 보기·바꾸기), /pets idle on · off (신호가 없어도 잠들지 않기 켜고 끄기), /pets do <행동> (행동 시키기)',
  zoomChanged: zoom => zoom === 'wide' ? '맵 보기로 가장 넓게 보게 바꿨다' : zoom === 'far' ? '원거리로 넓게 보게 바꿨다' : `도트 크기를 ${zoom} 배로 바꿨다`,
  zoomLimit: zoom => zoom === 'wide' ? '이미 가장 넓게(맵 보기) 보고 있다' : '이미 가장 크게(2 배) 보고 있다',
  zoomSame: zoom => `이미 ${zoom === 'wide' ? '맵 보기로' : zoom === 'far' ? '원거리로' : `${zoom} 배로`} 보고 있다`,
  setLabels: SET_LABELS,
  breedLabels: BREED_LABELS,
  orderLabels: ORDER_LABELS,
  worldChoices: ids => `${listOf(ids, SET_LABELS)}, auto(세션마다 모눈종이 밖에서 고름)`,
  worldNow: (label, isAuto, choices) => `지금 맵 세트: ${label}${isAuto ? '(자동)' : ''}. 고를 수 있는 세트: ${choices}`,
  worldChanged: (label, isAuto) => `맵 세트를 ${isAuto ? `자동으로 바꿨다(이 세션은 ${label} 세트)` : `${label} 세트로 바꿨다`}. 맵을 새로 만들고 동물을 새 자리에 두었다`,
  worldUnknown: (word, choices) => `'${word}' 라는 맵 세트는 없다. 고를 수 있는 세트: ${choices}`,
  petChoices: ids => `${listOf(ids, BREED_LABELS)}, auto(세션마다 흰 강아지 밖에서 고름)`,
  petNow: (label, isAuto, choices) => `지금 동물: ${label}${isAuto ? '(자동)' : ''}. 고를 수 있는 품종: ${choices}`,
  petChanged: (label, isAuto, dropped) =>
    `동물을 ${isAuto ? `자동으로 바꿨다(이 세션은 ${label})` : `바꿨다: ${label}`}${dropped > 0 ? `. 지금은 한 마리만 두어 첫 번째만 썼다(${dropped} 개는 무시)` : ''}`,
  petUnknown: (word, choices) => `'${word}' 라는 품종은 없다. 고를 수 있는 품종: ${choices}`,
  idleNow: (on, sleepAfterMin, sleepMin) => on
    ? '지금 잠들지 않기가 켜져 있다. 신호가 없어도 잠들지 않는다(/pets idle off 로 끈다)'
    : `지금 잠들지 않기가 꺼져 있다. 신호 없이 ${sleepAfterMin} 분이 지나면 잠들고 ${sleepMin} 분 뒤 깬다(/pets idle on 으로 켠다)`,
  idleChanged: on => on ? '잠들지 않기를 켰다. 신호가 없어도 잠들지 않는다' : '잠들지 않기를 껐다. 신호가 없으면 다시 잠든다',
  idleUsage: '/pets idle (지금 상태), /pets idle on · off',
  doChoices: ids => listOf(ids, ORDER_LABELS),
  doUsage: choices => `/pets do <행동>. 시킬 수 있는 행동: ${choices}`,
  doUnknown: (word, choices) => `'${word}' 라는 행동은 없다. 시킬 수 있는 행동: ${choices}`,
  doDone: label => `동물에게 시켰다: ${label}`,
  doClosed: '동물 패널이 닫혀 있다. /pets 로 패널을 연 뒤 다시 시켜 달라',
  doRefused: {
    awake: '이미 깨어 있다',
    ball: '공이 닿지 않는 곳에 있다',
    asleep: '이미 자고 있다',
    far: '지금 자리에서 갈 만한 먼 칸이 없다',
  },
  tooSmall: (minCols, minRows, cols, rows) => [`패널이 ${minCols}열 × ${minRows}행 이상이어야 한다`, `지금 ${cols}열 × ${rows}행`],
  notTerminal: '강아지는 터미널 패널에서만 그린다',
} satisfies Messages
