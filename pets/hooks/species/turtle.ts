// 거북이. 오른쪽을 보는 모습으로 그리고 왼쪽은 좌우 반전한다.
// 등딱지·머리·정면·껍질에 숨기·헤엄은 비트맵이고, 다리(길이 1)는 그리는 쪽이 매 프레임 선으로 그린다. 꼬리는 그리지 않는다.
// 앉기·엎드리기는 서기 등딱지를 한 픽셀 낮춰 배를 땅에 붙인 것이다(다리를 넣어 그리지 않는다).
// 거북이 전용 그림이 없는 자세(뒹굴기, 갸웃, 귀 세움, 조르기, 귀 처짐, 땅 파기, 귀 긁기)와 몸 앞을 숙이는 자세(인사, 기지개)는 poseMap 으로 바꾼다.
//
// 비트맵 좌표: (0, 0) 은 거북이가 선 바닥 점, y 는 위가 음수. 글자:
//   . 투명  o 윤곽  w 등딱지  d 등딱지 무늬  s 등딱지 가장자리  e 피부(머리·다리)  l 감은 눈
//   E 눈(자리를 기억해 감은 눈을 덧칠한다)  M 입(윤곽, 자리를 기억해 혀를 덧칠한다)
// 뱅크 역할: body 등딱지, earDark 등딱지 무늬, under 등딱지 가장자리, ear 피부. 목줄은 없다

import { DOG } from './dog.js'
import type { BandColors, BitmapSpec, BreedDef, SpeciesDef } from './types.js'

const band = (body: number, under: number, line: number, eye: number, ear: number, earDark: number, collar: number): BandColors => ({ body, under, line, eye, ear, earDark, collar })

const BREEDS: readonly BreedDef[] = [
  {
    id: 'turtle', species: 'turtle', label: '거북이', aliases: ['거북이', '거북'],
    bank: { outline: 0x1e3218, body: 0x5a8a3c, under: 0x9ab868, far: 0x6a7a48, farLight: 0x8a9a60, eye: 0x141212, lid: 0x6a7a48, tongue: 0xc86060, ear: 0xb0bc7c, earDark: 0x3a6226, collar: 0x5a8a3c, pattern: 0x5a8a3c },
    band: { dark: band(0x8ab060, 0xb0c888, 0x6a8a48, 0x141212, 0xb0bc7c, 0x6a8a48, 0x8ab060), light: band(0x3e6628, 0x4e7a34, 0x1e3218, 0x141212, 0x5a6a38, 0x2a4a1a, 0x3e6628) },
  },
]

// 서 있는 등딱지: x -4..4, y -6..-2. 다리는 y -1
const SHELL: readonly string[] = [
  '..ooooo..',
  '.owdwdwo.',
  'owwwdwwwo',
  'odwdwdwdo',
  'ossssssso',
]
const stand: BitmapSpec = { ax: 4, ay: 6, rows: SHELL }
const low: BitmapSpec = { ax: 4, ay: 5, rows: SHELL }

export const TURTLE: SpeciesDef = {
  id: 'turtle',
  label: '거북이',
  breeds: BREEDS,
  gaits: {
    // 네 발을 대각 짝으로 느리게 옮긴다. 달리기도 조금 빠른 기어가기
    walk: { speed: 0.5, accel: 2, decel: 3, stride: 0.3, sigma: 0.8, amp: 1, phase: [0, 0.5, 0.5, 0], energyPerS: -0.002 },
    trot: { speed: 0.7, accel: 2.5, decel: 3.5, stride: 0.35, sigma: 0.8, amp: 1, phase: [0, 0.5, 0.5, 0], energyPerS: -0.004 },
    run: { speed: 0.9, accel: 3, decel: 4, stride: 0.4, sigma: 0.8, amp: 1, phase: [0, 0.5, 0.5, 0], energyPerS: -0.008 },
    sniff: { speed: 0.35, accel: 2, decel: 3, stride: 0.25, sigma: 0.8, amp: 1, phase: [0, 0.5, 0.5, 0], energyPerS: -0.001 },
    creep: { speed: 0.35, accel: 2, decel: 3, stride: 0.25, sigma: 0.8, amp: 1, phase: [0, 0.5, 0.5, 0], energyPerS: -0.001 },
    // 물에서는 땅보다 빠르다
    swim: { speed: 1.2, accel: 3, decel: 3, stride: 0.6, sigma: 0.5, amp: 0, phase: [0, 0.5, 0.5, 0], energyPerS: -0.004 },
  },
  motion: { corner: 0.22, crouchMs: 400, landMs: 120, turnMs: 160, hopAt: 0.62, runDustMs: 0 },
  // 단차는 낮은 호로 기어오른다. 폴짝 대신 제자리에서 몸을 조금 든다
  jump: { upPx: 2, downPx: 2, runBonusPx: 0, minSpeed: 1.5, minMs: 300, maxMs: 600, pounce: { peakPx: 2, ms: 400 } },
  sprite: {
    codes: { o: 'outline', w: 'body', d: 'earDark', s: 'under', e: 'ear', l: 'lid', E: 'eye', M: 'outline' },
    // 헤엄 몸의 뒷모습은 눈 자리를 피부로
    backFill: 'e',
    bodies: {
      stand,
      // 다리를 넣고 배를 땅에 붙인다
      sit: low,
      lie: low,
      // 껍질에 숨어 잔다. 머리·다리를 넣었고, 숨 들이쉴 때(A)는 등딱지 꼭대기가 한 픽셀 넓다
      curlA: { ax: 4, ay: 5, rows: [
        '..ooooo..',
        '.owdwdwo.',
        'owwwdwwwo',
        'odwdwdwdo',
        'ossssssso',
      ] },
      curlB: { ax: 4, ay: 5, rows: [
        '...ooo...',
        '.oowdwoo.',
        'owwwdwwwo',
        'odwdwdwdo',
        'ossssssso',
      ] },
      // 정면(사람을 본다): 등딱지 앞으로 머리를 내밀고 앞다리로 선다
      frontStand: { ax: 4, ay: 7, rows: [
        '..ooooo..',
        '.owdwdwo.',
        'owwooowwo',
        'osoEeEoso',
        'osoeMeoso',
        '.oeoooeo.',
        '.oe...eo.',
      ] },
      frontSit: { ax: 4, ay: 7, rows: [
        '..ooooo..',
        '.owdwdwo.',
        'owwooowwo',
        'osoEeEoso',
        'osoeMeoso',
        '.oeoooeo.',
        '.oe...eo.',
      ] },
      // 헤엄: 머리를 들고 떠 있다. 수면은 y -6 이고 그 아래 두 줄(가장자리 아래·앞발)은 앞 칸 수면에 가린다
      swim: { ax: 4, ay: 9, rows: [
        '..ooooo......',
        '.owdwdwo..oo.',
        'owwwdwwwooeEo',
        'odwdwdwdoeeeM',
        'ossssssso.oo.',
        '.ee....ee....',
        '..e.....e....',
      ] },
    },
    heads: {
      // 오른쪽 보기. 작은 머리에 눈 하나, 입. 기준점은 맨 아래 줄 첫 칸이고 서 있을 때 (5, -2) 에 놓인다
      face: { ax: 0, ay: 2, rows: [
        '.oo.',
        'oeEo',
        'eeeM',
      ] },
      // 뒷모습(오른쪽 위로 멀어지는 쪽): 머리가 등딱지에 가려 목만 보인다
      back: { ax: 0, ay: 0, rows: [
        'e',
      ] },
    },
    anchors: {
      stand: { head: [5, -2], tail: [-4, -2] },
      sit: { head: [5, -1], tail: [-4, -1], scratch: [0, -3] },
      lie: { head: [5, -1], tail: [-4, -1] },
      front: { x: 4, sitY: -2, standY: -2 },
    },
    tilt: { x0: -4, span: 8 },
    legs: { hips: [[-3, false], [-2, true], [1, false], [2, true]], len: 1, near: ['outline', 'ear'], far: ['far', 'farLight'] },
    // 꼬리는 등딱지에 가려 그리지 않는다
    tail: { len: 0, rest: 0.1, role: 'ear', tipRole: 'ear' },
    seeThrough: ['outline', 'eye', 'earDark'],
    shadow: { rx: 5, rxCurl: 5, ry: 1.4 },
    emoteAt: { side: 4, up: 10 },
    lookUpPx: 3,
  },
  // 띠는 늘 꺼져 있다. 강아지 띠 그림을 거북이 색으로 칠한다
  band: DOG.band,
  abilities: { climb: 1, swim: true },
  behavior: {
    // 더 걷고 가만히 있고 눕는다. 앉기·달리기(행동)는 하지 않고 거의 놀지 않는다. 뒹굴기·땅 파기 그림이 없다
    actMul: { walk: 1.2, idle: 1.5, play: 0.2, sit: 0, run: 0, lie: 1.5, rollOver: 0, digSpot: 0 },
    initial: { energy: 0.8, excite: 0.2 },
    energyRate: {
      stand: 0.002, look: 0.002, pant: 0.004, sniff: -0.001, dig: -0.01, bow: -0.01, shake: -0.006, scratch: 0,
      yawn: 0.002, stretch: 0, sit: 0.006, frontSit: 0.006, lie: 0.012, lieRest: 0.016, sleep: 0.03, wake: 0.01,
      drink: 0.004, chew: 0.008,
    },
    exciteGain: { turnStart: 0.3, turnEnd: 0.1 },
    // 거북이 그림이 없는 자세를 바꾼다. 도구 호출 때 땅 파기 대신 코를 박는다. 몸 앞을 숙이면(인사·기지개) 짧은 다리 아래로 등딱지가 땅에 묻혀 서기로 한다
    poseMap: { roll: 'lie', tilt: 'frontSit', alert: 'stand', beg: 'frontSit', droop: 'lie', dig: 'sniff', scratch: 'sniff', groom: 'sniff', bow: 'stand', stretch: 'stand' },
  },
}
