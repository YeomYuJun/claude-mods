// Claude 마스코트. 오른쪽을 보는 모습으로 그리고 왼쪽은 좌우 반전한다.
// 머리가 몸 그림에 들어 있다(heads 없음): 넓적한 주황 몸통에 검은 네모 눈 둘, 양옆에 짧은 팔 한 줄. 뒷모습은 몸 그림의 눈을 몸 색으로 바꿔 만든다.
// 다리 넷은 한 픽셀 폭 선으로 매 프레임 그린다(대각 짝). 앉기·엎드리기는 서기 그림을 두 픽셀 낮춰 다리를 가린 것이다.
// 마스코트 전용 그림이 없는 자세(뒹굴기, 갸웃, 귀 세움, 조르기, 귀 처짐, 땅 파기, 귀 긁기)와 몸 앞을 숙이는 자세(인사, 기지개)는 poseMap 으로 바꾼다.
//
// 비트맵 좌표: (0, 0) 은 마스코트가 선 바닥 점, y 는 위가 음수. 글자:
//   . 투명  o 윤곽  w 몸  s 몸 아래 그늘  l 감은 눈
//   E 눈(자리를 기억해 감은 눈을 덧칠한다)  M 입 자리(몸 색, 앞쪽 팔 끝. 자리를 기억해 든 공을 그린다. 입이 없어 혀는 몸 색이다)
// 뱅크 역할: body 주황 몸, under 다리·그늘, far 먼 다리. 귀·목줄·무늬는 몸 색으로 채운다

import { DOG } from './dog.js'
import type { BandColors, BitmapSpec, BreedDef, SpeciesDef } from './types.js'

const band = (body: number, under: number, line: number, eye: number, ear: number, earDark: number, collar: number): BandColors => ({ body, under, line, eye, ear, earDark, collar })

const BREEDS: readonly BreedDef[] = [
  {
    id: 'claude', species: 'claude', aliases: ['클로드', '마스코트', 'mascot'],
    bank: { outline: 0x3a160c, body: 0xd97757, under: 0xb85a36, far: 0x9a4628, farLight: 0xa8502e, eye: 0x141414, lid: 0x3a160c, tongue: 0xd97757, ear: 0xd97757, earDark: 0xa8502e, collar: 0xd97757, pattern: 0xd97757 },
    band: { dark: band(0xd97757, 0xc0643f, 0xe8a080, 0x141414, 0xd97757, 0xa8502e, 0xd97757), light: band(0xa8502e, 0x8a4024, 0x3a160c, 0x141414, 0xa8502e, 0x7a3418, 0xa8502e) },
  },
]

// 서 있는 몸: 몸통 x -5..4, 팔까지 x -7..6, y -10..-3. 다리는 y -2..-1
const STAND: readonly string[] = [
  '..oooooooooo..',
  '..owwwwwwwwo..',
  '..owwEwwwEwo..',
  '..owwwwwwwwo..',
  'ooowwwwwwwwooo',
  'owwwwwwwwwwwMo',
  'ooossssssssooo',
  '..oooooooooo..',
]
const sit: BitmapSpec = { ax: 7, ay: 8, rows: STAND }

// 눈을 감은 것
const closed = (rows: readonly string[]) => rows.map(r => r.replace(/E/g, 'l'))

// 정면: 두 눈이 몸 가운데에서 같은 거리, 입 자리는 팔 줄 가운데
const FRONT: readonly string[] = [
  '..oooooooooo..',
  '..owwwwwwwwo..',
  '..owwEwwEwwo..',
  '..owwwwwwwwo..',
  'ooowwwwwwwwooo',
  'owwwwwwMwwwwwo',
  'ooossssssssooo',
  '..oooooooooo..',
]

export const CLAUDE: SpeciesDef = {
  id: 'claude',
  breeds: BREEDS,
  gaits: {
    // 네 다리를 대각 짝으로 종종걸음한다
    walk: { speed: 1.8, accel: 6, decel: 6, stride: 0.4, sigma: 0.6, amp: 1, phase: [0, 0.5, 0.5, 0], energyPerS: -0.004 },
    trot: { speed: 2.8, accel: 8, decel: 8, stride: 0.5, sigma: 0.5, amp: 1, phase: [0, 0.5, 0.5, 0], energyPerS: -0.01 },
    run: { speed: 4.5, accel: 12, decel: 10, stride: 0.7, sigma: 0.4, amp: 1, phase: [0, 0.5, 0.5, 0], energyPerS: -0.02 },
    sniff: { speed: 0.8, accel: 5, decel: 5, stride: 0.3, sigma: 0.7, amp: 1, phase: [0, 0.5, 0.5, 0], energyPerS: -0.002 },
    creep: { speed: 0.7, accel: 4, decel: 6, stride: 0.3, sigma: 0.7, amp: 1, phase: [0, 0.5, 0.5, 0], energyPerS: -0.003 },
  },
  motion: { corner: 0.22, crouchMs: 90, landMs: 90, turnMs: 110, hopAt: 0.62, runDustMs: 130 },
  jump: { upPx: 4, downPx: 3, runBonusPx: 1, minSpeed: 2.2, minMs: 220, maxMs: 420, pounce: { peakPx: 5, ms: 340 } },
  sprite: {
    codes: { o: 'outline', w: 'body', s: 'under', l: 'lid', E: 'eye', M: 'body' },
    backFill: 'w',
    bodies: {
      stand: { ax: 7, ay: 10, rows: STAND },
      // 몸을 두 픽셀 낮춰 바닥에 붙인다(다리가 몸에 가린다)
      sit,
      lie: sit,
      // 바닥에 붙어 눈을 감고 잔다. 숨 내쉴 때(B)는 윗줄 하나가 내려앉는다
      curlA: { ax: 7, ay: 8, rows: closed(STAND) },
      curlB: { ax: 7, ay: 7, rows: closed(STAND.slice(1)).map((r, i) => i === 0 ? r.replace(/w/g, 'o') : r) },
      frontStand: { ax: 7, ay: 10, rows: FRONT },
      frontSit: { ax: 7, ay: 8, rows: FRONT },
      // 앞으로 숙인다(킁킁·마시기): 윗줄이 내려앉고 눈이 한 줄 아래
      stoop: { ax: 7, ay: 9, rows: [
        '..oooooooooo..',
        '..owwwwwwwwo..',
        '..owwwEwwwEo..',
        'ooowwwwwwwwooo',
        'owwwwwwwwwwwMo',
        'ooossssssssooo',
        '..oooooooooo..',
      ] },
    },
    anchors: {
      stand: { head: [2, -8], tail: [-5, -5] },
      sit: { head: [2, -6], tail: [-5, -3], scratch: [0, -3] },
      lie: { head: [2, -6], tail: [-5, -3] },
      front: { x: 4, sitY: -3, standY: -5 },
    },
    tilt: { x0: -5, span: 10 },
    // 다리 넷: 가까운 뒷다리, 먼 뒷다리, 가까운 앞다리, 먼 앞다리. 한 픽셀 폭
    legs: { hips: [[-4, false], [-2, true], [1, false], [3, true]], len: 2, near: ['under', 'under'], far: ['far', 'far'], thin: true },
    tail: { len: 0, rest: 0.8, role: 'body', tipRole: 'outline' },
    seeThrough: ['outline', 'eye'],
    shadow: { rx: 6, rxCurl: 6, ry: 1.4 },
    emoteAt: { side: 2, up: 13 },
    lookUpPx: 6,
  },
  // 띠는 늘 꺼져 있다. 강아지 띠 그림을 마스코트 색으로 칠한다
  band: DOG.band,
  abilities: { climb: 1, swim: false },
  behavior: {
    // 행동 배율은 강아지 값이다. 뒹굴기·땅 파기 그림이 없다
    actMul: { rollOver: 0, digSpot: 0 },
    initial: { energy: 0.8, excite: 0.3 },
    energyRate: {
      stand: 0.002, look: 0.002, pant: 0.004, sniff: -0.001, dig: -0.01, bow: -0.01, shake: -0.006, scratch: 0,
      yawn: 0.002, stretch: 0, sit: 0.006, frontSit: 0.006, lie: 0.012, lieRest: 0.016, sleep: 0.03, wake: 0.01,
      drink: 0.004, chew: 0.008, groom: 0.004,
    },
    exciteGain: { turnStart: 0.45, turnEnd: 0.15 },
    // 그림이 없는 자세를 바꾼다. 도구 호출 때 땅 파기 대신 킁킁댄다
    // 몸 앞을 숙이면(인사·기지개) 짧은 다리 아래로 몸이 땅에 묻혀 서기로 한다
    poseMap: { roll: 'lie', tilt: 'frontSit', alert: 'stand', beg: 'frontSit', droop: 'lie', dig: 'sniff', scratch: 'groom', bow: 'stand', stretch: 'stand' },
  },
}
