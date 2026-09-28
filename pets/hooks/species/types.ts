// 종 정의의 모양(순수 모듈). 종 파일 하나가 SpeciesDef 하나를 내보낸다.
// 그리기·걸음·행동 코드는 종마다 다른 값을 여기서만 읽는다. 자세별 꼬리 흔들기·머리 움직임 같은 안무는 pet/pose.ts 에 둔다.

import type { ActName, Gait, PoseName } from '../pet/state.js'
import type { BankColors, RoleName } from '../pixel/palette.js'

export type SpeciesId = 'dog'

export type BodyKind = 'stand' | 'sit' | 'lie' | 'curlA' | 'curlB' | 'frontSit' | 'frontStand'

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
}

export type SpriteSet = {
  codes: Readonly<Record<string, RoleName>>
  bodies: Readonly<Record<BodyKind, BitmapSpec>>
  heads: { face: BitmapSpec; back: BitmapSpec }
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
  // 다리: 엉덩이 x 와 먼 다리인지(가까운 뒷다리, 먼 뒷다리, 가까운 앞다리, 먼 앞다리 순), 길이, 윤곽·털 역할
  legs: { hips: ReadonlyArray<readonly [number, boolean]>; len: number; near: readonly [RoleName, RoleName]; far: readonly [RoleName, RoleName] }
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

export type BreedId = 'dog' | 'shiba' | 'blackdog' | 'dalmatian' | 'brown'

// 띠 색 한 벌(띠 역할마다 RGB)
export type BandColors = Readonly<Record<BandRole, number>>

// 품종: 같은 비트맵에 색만 다르다. spots 가 있으면 몸 털 칸 중 그 비율만큼을 무늬 역할로 바꾼 비트맵을 쓴다.
// 띠 색은 어두운 터미널용(dark)과 밝은 터미널용(light) 두 벌
export type BreedDef = {
  id: BreedId
  label: string
  aliases: readonly string[]
  bank: BankColors
  band: { dark: BandColors; light: BandColors }
  spots?: number
}

export type SpeciesDef = {
  id: SpeciesId
  label: string
  // 이 종의 품종. 첫 번째가 기본
  breeds: readonly BreedDef[]
  gaits: Readonly<Record<Gait, GaitDef>>
  // 꺾는 칸에서 미리 넘어가는 거리, 뛰기 전 웅크림·착지 눌림·돌아볼 때 정면 모습(ms), 단차를 이 거리 안에서 뛴다, 달릴 때 먼지 간격(ms)
  motion: { corner: number; crouchMs: number; landMs: number; turnMs: number; hopAt: number; runDustMs: number }
  // 단차 뛰기: 오를 때·내릴 때 호 높이(px), 달리면 더하는 높이, 최소 속도, 길이 범위(ms). 폴짝: 높이·길이
  jump: { upPx: number; downPx: number; runBonusPx: number; minSpeed: number; minMs: number; maxMs: number; pounce: { peakPx: number; ms: number } }
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
  }
}
