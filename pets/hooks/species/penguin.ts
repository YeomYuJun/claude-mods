// 펭귄. 오른쪽을 보는 모습으로 그리고 왼쪽은 좌우 반전한다.
// 머리가 몸 그림에 들어 있다(heads 없음). 뒷모습은 몸 그림의 눈을 검은 깃털로 바꿔 만든다.
// 두 발은 한 픽셀 폭 주황 선으로 매 프레임 그리고, 걸을 때 몸을 앞뒤로 번갈아 옮긴다(뒤뚱).
// 달리기는 배를 땅에 대고 미끄러진다(엎드린 몸, 다리 없음). 앉기는 서기와 같은 그림이다.
// 펭귄 전용 그림이 없는 자세(뒹굴기, 갸웃, 귀 세움, 조르기, 귀 처짐, 땅 파기, 귀 긁기)와 몸 앞을 숙이는 자세(인사, 기지개)는 poseMap 으로 바꾼다.
//
// 비트맵 좌표: (0, 0) 은 펭귄이 선 바닥 점, y 는 위가 음수. 글자:
//   . 투명  o 윤곽  w 검은 깃털  s 흰 배  d 날개(짙은 선)  e 부리  l 감은 눈
//   E 눈(흰 눈 테. 자리를 기억해 감은 눈을 덧칠한다)  M 입(윤곽, 부리 아래. 자리를 기억해 혀를 덧칠한다)
// 뱅크 역할: body 검은 깃털, under 흰 배, earDark 날개, ear 부리·발. 목줄은 없다

import { DOG } from './dog.js'
import type { BandColors, BitmapSpec, BreedDef, SpeciesDef } from './types.js'

const band = (body: number, under: number, line: number, eye: number, ear: number, earDark: number, collar: number): BandColors => ({ body, under, line, eye, ear, earDark, collar })

const BREEDS: readonly BreedDef[] = [
  {
    id: 'penguin', species: 'penguin', label: '펭귄', aliases: ['펭귄'],
    bank: { outline: 0x0e1014, body: 0x22262c, under: 0xf4f4f0, far: 0xc07818, farLight: 0xc07818, eye: 0xf4f4f0, lid: 0x5a5e66, tongue: 0xc0503a, ear: 0xf0a030, earDark: 0x3a3e46, collar: 0x22262c, pattern: 0x22262c },
    band: { dark: band(0x8a9098, 0xf4f4f0, 0xa8aeb6, 0xf0a030, 0xf0a030, 0x8a9098, 0x8a9098), light: band(0x22262c, 0x8a8a86, 0x0e1014, 0xf0a030, 0xc07818, 0x22262c, 0x22262c) },
  },
]

// 서 있는 몸: x -3..4, y -11..-2. 발은 y -1
const STAND: readonly string[] = [
  '..ooo...',
  '.owwwo..',
  '.owwEwo.',
  '.owwwee.',
  '.owwsMo.',
  'owwwsso.',
  'owdwssso',
  'owdwssso',
  'owwssso.',
  'oooooo..',
]
const stand: BitmapSpec = { ax: 3, ay: 11, rows: STAND }

// 배를 땅에 대고 엎드린 몸(미끄럼): x -5..5, y -4..-1
const BELLY: readonly string[] = [
  '..ooooooo..',
  'oowwwwwwEo.',
  'odwwwwwwwee',
  '.ossssssM..',
]

// 서기 그림에서 눈을 감은 것(선 채로 자는 모습)
const closed = (rows: readonly string[]) => rows.map(r => r.replace('E', 'l'))

export const PENGUIN: SpeciesDef = {
  id: 'penguin',
  label: '펭귄',
  breeds: BREEDS,
  gaits: {
    // 두 발을 번갈아 딛으며 뒤뚱거린다. 달리기는 배로 미끄러진다
    walk: { speed: 0.9, accel: 4, decel: 4, stride: 0.25, sigma: 0.5, amp: 1, phase: [0, 0.5], energyPerS: -0.004, sway: 1 },
    trot: { speed: 1.4, accel: 5, decel: 4, stride: 0.3, sigma: 0.5, amp: 1, phase: [0, 0.5], energyPerS: -0.01, sway: 1 },
    run: { speed: 3.5, accel: 6, decel: 3, stride: 1, sigma: 0.5, amp: 0, phase: [0, 0.5], energyPerS: -0.015, body: 'lie' },
    sniff: { speed: 0.5, accel: 4, decel: 4, stride: 0.2, sigma: 0.5, amp: 1, phase: [0, 0.5], energyPerS: -0.002 },
    creep: { speed: 0.5, accel: 4, decel: 4, stride: 0.2, sigma: 0.5, amp: 1, phase: [0, 0.5], energyPerS: -0.002 },
    // 물에서는 가장 빠르다
    swim: { speed: 3.0, accel: 6, decel: 5, stride: 0.8, sigma: 0.5, amp: 0, phase: [0, 0.5], energyPerS: -0.004 },
  },
  motion: { corner: 0.22, crouchMs: 150, landMs: 120, turnMs: 110, hopAt: 0.62, runDustMs: 0 },
  // 단차는 두 발로 폴짝 뛴다. 폴짝은 낮게 뛰어 배로 내려앉는다
  jump: { upPx: 3, downPx: 3, runBonusPx: 0, minSpeed: 1.8, minMs: 240, maxMs: 420, pounce: { peakPx: 4, ms: 320 } },
  sprite: {
    codes: { o: 'outline', w: 'body', s: 'under', d: 'earDark', e: 'ear', l: 'lid', E: 'eye', M: 'outline' },
    backFill: 'w',
    bodies: {
      stand,
      sit: stand,
      lie: { ax: 5, ay: 4, rows: BELLY },
      // 선 채로 눈을 감고 잔다. 숨 들이쉴 때(A)는 머리를 들고, 내쉴 때(B)는 부리를 가슴에 붙인다
      curlA: { ax: 3, ay: 11, rows: closed(STAND) },
      curlB: { ax: 3, ay: 10, rows: [
        '..ooo...',
        '.owwwo..',
        '.owwlwo.',
        '.owwwoee',
        'owwwsso.',
        'owdwssso',
        'owdwssso',
        'owwssso.',
        'oooooo..',
      ] },
      // 정면(사람을 본다): 흰 얼굴 테에 두 눈, 가운데 부리, 양옆 날개, 발 둘
      frontStand: { ax: 3, ay: 11, rows: [
        '..ooo..',
        '.owwwo.',
        'owEwEwo',
        'owweswo',
        'owsMswo',
        'dwssswd',
        'dwssswd',
        'owssswo',
        'owssswo',
        '.ooooo.',
        '.e...e.',
      ] },
      frontSit: { ax: 3, ay: 11, rows: [
        '..ooo..',
        '.owwwo.',
        'owEwEwo',
        'owweswo',
        'owsMswo',
        'dwssswd',
        'dwssswd',
        'owssswo',
        'owssswo',
        '.ooooo.',
        '.e...e.',
      ] },
      // 고개를 숙여 부리를 앞으로 내린다(킁킁·마시기·깃 고르기)
      stoop: { ax: 3, ay: 9, rows: [
        '..ooo...',
        '.owwwo..',
        'owwwwEo.',
        'owdwwwee',
        'owdwssM.',
        'owwssso.',
        'owwssso.',
        'oooooo..',
      ] },
      // 헤엄: 엎드린 몸을 네 픽셀 올려 등과 머리만 물 위에 낸다. 수면은 y -6 이고 맨 아래 줄은 앞 칸 수면에 가린다
      swim: { ax: 5, ay: 8, rows: [
        ...BELLY,
        '..ssssss...',
      ] },
    },
    anchors: {
      stand: { head: [1, -8], tail: [-3, -2] },
      sit: { head: [1, -8], tail: [-3, -2], scratch: [0, -3] },
      lie: { head: [3, -3], tail: [-5, -2] },
      front: { x: 3, sitY: -2, standY: -2 },
    },
    tilt: { x0: -3, span: 8 },
    // 두 발: 가까운 발, 먼 발. 한 픽셀 폭 주황
    legs: { hips: [[-1, false], [1, true]], len: 1, near: ['ear', 'ear'], far: ['far', 'far'], thin: true },
    // 꼬리는 그림에 들어 있다
    tail: { len: 0, rest: 0.8, role: 'body', tipRole: 'outline' },
    seeThrough: ['outline', 'eye', 'ear'],
    shadow: { rx: 4, rxCurl: 4, ry: 1.4 },
    emoteAt: { side: 2, up: 14 },
    lookUpPx: 6,
  },
  // 띠는 늘 꺼져 있다. 강아지 띠 그림을 펭귄 색으로 칠한다
  band: DOG.band,
  abilities: { climb: 1, swim: true },
  behavior: {
    // 더 걷고 가만히 있고 눕는다. 킁킁·달리기는 덜 하고 앉기(행동)는 하지 않는다. 뒹굴기·땅 파기 그림이 없다
    actMul: { walk: 1.2, idle: 1.3, sniff: 0.5, sit: 0, run: 0.6, lie: 1.2, rollOver: 0, digSpot: 0 },
    initial: { energy: 0.8, excite: 0.3 },
    energyRate: {
      stand: 0.002, look: 0.002, pant: 0.004, sniff: -0.001, dig: -0.01, bow: -0.01, shake: -0.006, scratch: 0,
      yawn: 0.002, stretch: 0, sit: 0.006, frontSit: 0.006, lie: 0.012, lieRest: 0.016, sleep: 0.03, wake: 0.01,
      drink: 0.004, chew: 0.008, groom: 0.004,
    },
    exciteGain: { turnStart: 0.45, turnEnd: 0.15 },
    // 펭귄 그림이 없는 자세를 바꾼다. 도구 호출 때 땅 파기 대신 깃을 고른다(부리를 가슴에)
    // 몸 앞을 숙이면(인사·기지개) 짧은 다리 아래로 몸이 땅에 묻혀 서기로 한다
    poseMap: { roll: 'lie', tilt: 'frontSit', alert: 'stand', beg: 'frontSit', droop: 'lie', dig: 'groom', scratch: 'groom', bow: 'stand', stretch: 'stand' },
  },
}
