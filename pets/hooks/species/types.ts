// 종 정의의 모양(순수 모듈). 종 파일 하나가 SpeciesDef 하나를 내보낸다.
// 그리기·걸음·행동 코드는 종마다 다른 값을 여기서만 읽는다. 자세별 꼬리 흔들기·머리 움직임 같은 안무는 pet/pose.ts 에 둔다.

import type { ActName, Gait, PoseName } from '../pet/state.js'
import type { BankColors, RoleName } from '../pixel/palette.js'

export type SpeciesId = 'dog' | 'cat' | 'turtle' | 'duck' | 'penguin' | 'claude'

// 모든 종이 그리는 몸
export type BaseBody = 'stand' | 'sit' | 'lie' | 'curlA' | 'curlB' | 'frontSit' | 'frontStand'
// 그리는 종만 있는 몸. bellyA·bellyB: 배를 보이며 누운 모습(뒹굴기, 두 장 번갈아). frontBeg: 정면으로 앉아 앞발을 든 모습(조르기).
// 없는 종은 이 몸을 쓰는 자세를 behavior.poseMap 으로 다른 자세로 바꾼다.
// stoop: 머리가 몸 그림에 든 종(heads 가 없는 종)이 고개를 숙인 모습(킁킁·마시기·땅 파기처럼 머리를 내리는 자세). 없으면 서기로 그린다.
// swim: 물에 뜬 모습(머리 포함, 다리 없음). 헤엄치는 종은 물 칸(얕은 물 포함)에서 어떤 자세든 이 몸으로 그린다
export type ExtraBody = 'bellyA' | 'bellyB' | 'frontBeg' | 'stoop' | 'swim'
export type BodyKind = BaseBody | ExtraBody
export const BASE_BODIES: readonly BaseBody[] = ['stand', 'sit', 'lie', 'curlA', 'curlB', 'frontSit', 'frontStand']
export const EXTRA_BODIES: readonly ExtraBody[] = ['bellyA', 'bellyB', 'frontBeg', 'stoop', 'swim']
export type HeadKind = 'face' | 'back' | 'alert' | 'droop' | 'tilt'
export const HEAD_KINDS: readonly HeadKind[] = ['face', 'back', 'alert', 'droop', 'tilt']

// 비트맵: 글자 한 줄이 픽셀 한 줄. '.' 은 투명이고 나머지 글자는 codes 로 역할을 찾는다.
// 'E' 는 눈(자리를 기억해 감은 눈을 덧칠한다), 'M' 은 입(자리를 기억해 혀를 덧칠한다). ax, ay: (0, 0) 에 놓일 칸
export type BitmapSpec = { ax: number; ay: number; rows: readonly string[] }

type Point = readonly [number, number]

export type GaitDef = {
  // 타일/초, 타일/초²
  speed: number
  accel: number
  decel: number
  // 걸음 한 주기에 가는 거리(타일)
  stride: number
  // 발이 바닥을 짚는 위상 비율, 발끝이 앞뒤로 움직이는 픽셀, 다리마다 위상(legs.hips 순서)
  sigma: number
  amp: number
  phase: readonly number[]
  // 이 걸음으로 움직이는 동안 초당 기운 변화
  energyPerS: number
  // 뒤뚱 걸음: 발을 딛을 때마다 몸을 이만큼(px) 앞뒤로 번갈아 옮긴다
  sway?: number
  // 이 걸음으로 움직이는 동안 다리 없이 이 몸으로 그린다(펭귄 달리기의 배 미끄럼)
  body?: BaseBody
}

export type SpriteSet = {
  codes: Readonly<Record<string, RoleName>>
  bodies: Readonly<Record<BaseBody, BitmapSpec>> & Readonly<Partial<Record<ExtraBody, BitmapSpec>>>
  // face·back: 옆모습 머리(오른쪽 보기)와 뒷모습 머리. alert: 귀 세운 옆머리, droop: 귀 처진 옆머리(뒷모습은 눈·코·입을 지워 만든다).
  // tilt: 정면 몸의 위 줄들을 갈아 끼우는 갸웃한 정면 머리(줄 수만큼 몸의 위 줄을 덮는다). 셋은 그리는 종만 있다(없는 종은 poseMap 으로 바꾼다).
  // heads 가 없는 종(오리·펭귄·마스코트)은 머리를 몸 그림에 그린다. 뒷모습은 몸 그림의 눈(E)을 backFill 글자로, 입(M)을 윤곽으로 바꿔 만든다
  heads?: { face: BitmapSpec; back: BitmapSpec; alert?: BitmapSpec; droop?: BitmapSpec; tilt?: BitmapSpec }
  backFill?: string
  // 몸 종류별 머리 기준점·꼬리 뿌리(몸 이동량을 더하기 전). sit 의 scratch 는 뒷다리로 귀 긁는 선의 시작점
  anchors: {
    stand: { head: Point; tail: Point }
    sit: { head: Point; tail: Point; scratch: Point }
    lie: { head: Point; tail: Point }
    // 정면 모습의 꼬리: 몸 가운데에서 옆으로 x, 높이는 앉기·서기 따로
    front: { x: number; sitY: number; standY: number }
  }
  // 인사 자세에서 몸 앞쪽을 내릴 때: 몸통 왼끝 x0 에서 span 만큼 가면 tilt 픽셀 내려간다
  tilt: { x0: number; span: number }
  // 다리: 엉덩이 x 와 먼 다리인지(가까운 뒷다리, 먼 뒷다리, 가까운 앞다리, 먼 앞다리 순. 두 발 종은 가까운 발, 먼 발), 길이, 윤곽·털 역할.
  // thin 이면 한 픽셀 폭(윤곽 역할만)
  legs: { hips: ReadonlyArray<readonly [number, boolean]>; len: number; near: readonly [RoleName, RoleName]; far: readonly [RoleName, RoleName]; thin?: boolean }
  // 꼬리: 길이, 쉬는 각도(라디안), 선 역할, 끝 역할
  tail: { len: number; rest: number; role: RoleName; tipRole: RoleName }
  // 가려졌을 때 비쳐 보이는 진한 역할
  seeThrough: readonly RoleName[]
  // 발밑 그림자 가로 반지름(서 있을 때·웅크렸을 때), 세로 반지름
  shadow: { rx: number; rxCurl: number; ry: number }
  // 감정 표시: 옆모습일 때 머리 쪽으로 side 만큼, 발에서 up 만큼 위
  emoteAt: { side: number; up: number }
  // 카메라가 발보다 이만큼 위(몸통 가운데)를 본다
  lookUpPx: number
}

export type BandRole = 'body' | 'under' | 'line' | 'eye' | 'ear' | 'earDark' | 'collar'
export type BandFrame = { w: number; rows: readonly string[] }

// 프롬프트 위 띠의 작은 모습. 프레임은 오른쪽 보기, 아래 줄이 바닥 바로 위
export type BandSet = {
  codes: Readonly<Record<string, BandRole>>
  frames: { walkA: BandFrame; walkB: BandFrame; runA: BandFrame; runB: BandFrame; sniff: BandFrame; sitA: BandFrame; sitB: BandFrame; sleep: BandFrame }
  walkPxS: number
  runPxS: number
  // 다음 모드 가중치: 모델이 일하는 중일 때와 아닐 때
  weights: { busy: Readonly<Record<'walk' | 'idle' | 'sit' | 'sniff', number>>; calm: Readonly<Record<'walk' | 'idle' | 'sit' | 'sniff', number>> }
}

export type BreedId = 'dog' | 'shiba' | 'blackdog' | 'dalmatian' | 'brown' | 'cat' | 'cheese' | 'turtle' | 'duck' | 'penguin' | 'claude'

// 띠 색 한 벌(띠 역할마다 RGB)
export type BandColors = Readonly<Record<BandRole, number>>

// 품종: 한 종 안에서 같은 비트맵에 색만 다르다. spots 가 있으면 몸 털 칸 중 그 비율만큼을, stripes 가 있으면 그 간격(px)마다 한 세로 줄의
// 몸 털 칸을 무늬 역할로 바꾼 비트맵을 쓴다. 띠 색은 어두운 터미널용(dark)과 밝은 터미널용(light) 두 벌
export type BreedDef = {
  id: BreedId
  species: SpeciesId
  aliases: readonly string[]
  bank: BankColors
  band: { dark: BandColors; light: BandColors }
  spots?: number
  stripes?: number
}

export type SpeciesDef = {
  id: SpeciesId
  // 이 종의 품종. 첫 번째가 기본
  breeds: readonly BreedDef[]
  // swim: 물 칸에서 쓰는 걸음(헤엄치는 종만). 행동이 고른 걸음과 상관없이 이 값으로 움직인다
  gaits: Readonly<Record<Gait, GaitDef>> & { readonly swim?: GaitDef }
  // 꺾는 칸에서 미리 넘어가는 거리, 뛰기 전 웅크림·착지 눌림·돌아볼 때 정면 모습(ms), 단차를 이 거리 안에서 뛴다, 달릴 때 먼지 간격(ms)
  motion: { corner: number; crouchMs: number; landMs: number; turnMs: number; hopAt: number; runDustMs: number }
  // 단차 뛰기: 오를 때·내릴 때 호 높이(px), 두 단을 오를 때 호 높이(오르기 2 인 종), 달리면 더하는 높이, 최소 속도, 길이 범위(ms). 폴짝: 높이·길이
  jump: { upPx: number; downPx: number; up2Px?: number; runBonusPx: number; minSpeed: number; minMs: number; maxMs: number; pounce: { peakPx: number; ms: number } }
  sprite: SpriteSet
  band: BandSet
  // 한 걸음에 오르는 단 수, 깊은 물을 건너는지
  abilities: { climb: number; swim: boolean }
  behavior: {
    // 평소 행동 기본 가중치에 곱한다. 0 이면 그 종은 그 행동을 안 한다
    actMul: Readonly<Partial<Record<ActName, number>>>
    initial: { energy: number; excite: number }
    // 멈춰서 하는 자세별 초당 기운 변화
    energyRate: Readonly<Partial<Record<PoseName, number>>>
    // 프롬프트·턴 끝에 오르는 들뜸
    exciteGain: { turnStart: number; turnEnd: number }
    // 이 종이 그리지 않는(또는 다르게 하는) 자세 → 대신 쓰는 자세. 자세를 정할 때 바꾸므로 효과·기운·그림이 모두 바뀐 자세를 본다
    poseMap: Readonly<Partial<Record<PoseName, PoseName>>>
  }
}
