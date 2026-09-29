// 고양이. 오른쪽을 보는 모습으로 그리고 왼쪽은 좌우 반전한다.
// 몸통·머리·정면·웅크린 잠은 비트맵이고, 다리·꼬리는 그리는 쪽이 매 프레임 선으로 그린다(강아지와 같은 다리 자리·걸음 구조).
// 강아지 전용 그림(배 보인 몸, 앞발 든 정면 몸, 귀 세운·귀 처진·갸웃한 머리)은 없고, 그 그림을 쓰는 자세는 poseMap 으로 바꾼다.
//
// 비트맵 좌표: (0, 0) 은 고양이가 선 바닥 점, y 는 위가 음수. 글자:
//   . 투명  o 윤곽  w 털  s 배 쪽 밝은 털  e 귀 안쪽(분홍)  n 코(분홍)  d 꼬리 색  l 감은 눈
//   E 눈(자리를 기억해 감은 눈을 덧칠한다)  M 입(윤곽, 자리를 기억해 혀를 덧칠한다)
// 뱅크 역할: ear 는 귀 안쪽·코, earDark 는 꼬리. 목줄은 없다

import { DOG } from './dog.js'
import type { BandColors, BreedDef, SpeciesDef } from './types.js'

const band = (body: number, under: number, line: number, eye: number, ear: number, earDark: number, collar: number): BandColors => ({ body, under, line, eye, ear, earDark, collar })

const BREEDS: readonly BreedDef[] = [
  {
    id: 'cat', species: 'cat', label: '회색 줄무늬 고양이', aliases: ['고양이', '회색고양이', '줄무늬'], stripes: 3,
    bank: { outline: 0x2e2e34, body: 0x9a9aa4, under: 0xc8c8d0, far: 0x5a5a64, farLight: 0x7a7a84, eye: 0x141212, lid: 0x4a4a52, tongue: 0xe8a0b0, ear: 0xe8a0b0, earDark: 0x5e5e68, collar: 0x9a9aa4, pattern: 0x6a6a74 },
    band: { dark: band(0xb4b4bc, 0xd0d0d8, 0x8a8a94, 0x141212, 0x8a8a94, 0x6a6a74, 0xb4b4bc), light: band(0x6a6a74, 0x55555e, 0x2e2e34, 0x141212, 0x45454d, 0x2e2e34, 0x6a6a74) },
  },
  {
    id: 'cheese', species: 'cat', label: '치즈 고양이', aliases: ['치즈', '치즈고양이'], stripes: 3,
    bank: { outline: 0x4a2a18, body: 0xe8a050, under: 0xf8e0c0, far: 0x9a5a28, farLight: 0xc07a38, eye: 0x141212, lid: 0x7a4a20, tongue: 0xf0a0a0, ear: 0xf0a0a0, earDark: 0xb86a28, collar: 0xe8a050, pattern: 0xc87830 },
    band: { dark: band(0xe8a050, 0xf8e0c0, 0xb07840, 0x141212, 0xc87830, 0x9a5a28, 0xe8a050), light: band(0xb86e2e, 0x8a5a34, 0x4a2a18, 0x141212, 0x8a4a1e, 0x5a3014, 0xb86e2e) },
  },
]

export const CAT: SpeciesDef = {
  id: 'cat',
  label: '고양이',
  breeds: BREEDS,
  gaits: {
    // 다리 순서와 걸음 모양은 강아지와 같다. 달리기는 앞·뒤 짝이 더 모인다
    walk: { speed: 2.0, accel: 6, decel: 6, stride: 0.55, sigma: 0.7, amp: 1, phase: [0, 0.5, 0.25, 0.75], energyPerS: -0.004 },
    trot: { speed: 3.2, accel: 10, decel: 9, stride: 0.85, sigma: 0.5, amp: 1, phase: [0, 0.5, 0.5, 0], energyPerS: -0.01 },
    run: { speed: 6.5, accel: 16, decel: 14, stride: 1.4, sigma: 0.35, amp: 2, phase: [0, 0.05, 0.5, 0.55], energyPerS: -0.025 },
    sniff: { speed: 0.9, accel: 5, decel: 5, stride: 0.4, sigma: 0.75, amp: 1, phase: [0, 0.5, 0.25, 0.75], energyPerS: -0.002 },
    creep: { speed: 0.8, accel: 4, decel: 6, stride: 0.4, sigma: 0.75, amp: 1, phase: [0, 0.5, 0.25, 0.75], energyPerS: -0.003 },
  },
  motion: { corner: 0.22, crouchMs: 120, landMs: 90, turnMs: 110, hopAt: 0.62, runDustMs: 0 },
  // 두 단(8 px)을 한 번에 뛰어오를 때는 단차보다 3 px 높은 호
  jump: { upPx: 7, downPx: 3, up2Px: 11, runBonusPx: 2, minSpeed: 2.2, minMs: 220, maxMs: 420, pounce: { peakPx: 9, ms: 420 } },
  sprite: {
    codes: { o: 'outline', w: 'body', s: 'under', e: 'ear', n: 'ear', d: 'earDark', l: 'lid', E: 'eye', M: 'outline' },
    bodies: {
      // 서 있는 몸통: x -4..2, y -7..-3(강아지보다 짧고 가늘다). 다리는 y -2, -1
      stand: { ax: 4, ay: 7, rows: [
        '.ooooo.',
        'owwwwwo',
        'owwwwwo',
        'osssswo',
        '.ooooo.',
      ] },
      // 옆으로 앉기(앞발을 모으고 허리를 세움). 앞다리는 그림에 들어 있다
      sit: { ax: 4, ay: 6, rows: [
        '...owwo..',
        '..owwwwo.',
        '.owwwwwwo',
        'owwwwwowo',
        'owsswwowo',
        '.oooooooo',
      ] },
      // 식빵 자세: 앞발을 몸 밑에 넣고 엎드린다
      lie: { ax: 4, ay: 4, rows: [
        '.ooooooo.',
        'owwwwwwwo',
        'owsssssso',
        '.ooooooo.',
      ] },
      // 웅크려 자기. 머리를 몸에 붙이고 눈을 감았고, 꼬리로 몸 앞을 감쌌다. 숨 들이쉴 때(A)는 등이 한 픽셀 솟는다
      curlA: { ax: 6, ay: 7, rows: [
        '...ooooo....',
        '..owwwwwoo.o',
        '.owwwwwwwoeo',
        'owwwwwwwwwwo',
        'owwwwwwwlwwn',
        'odddddddwwwo',
        '.oooooooooo.',
      ] },
      curlB: { ax: 6, ay: 7, rows: [
        '............',
        '..ooooooooo.',
        '.owwwwwwwoeo',
        'owwwwwwwwwwo',
        'owwwwwwwlwwn',
        'odddddddwwwo',
        '.oooooooooo.',
      ] },
      // 정면 앉기(사람을 본다)
      frontSit: { ax: 4, ay: 12, rows: [
        'o.......o',
        'oeo...oeo',
        'owwoooowo',
        'owwwwwwwo',
        'owEwwwEwo',
        'owEwnwEwo',
        '.owwMwwo.',
        '..ooooo..',
        '.owwwwwo.',
        '.owswswo.',
        '.owsoswo.',
        '..oo.oo..',
      ] },
      // 정면 서기(방향을 바꾸는 순간, 사람을 쳐다볼 때)
      frontStand: { ax: 4, ay: 12, rows: [
        'o.......o',
        'oeo...oeo',
        'owwoooowo',
        'owwwwwwwo',
        'owEwwwEwo',
        'owEwnwEwo',
        '.owwMwwo.',
        '..ooooo..',
        '..owwwo..',
        '..ossso..',
        '..owowo..',
        '..owowo..',
      ] },
    },
    heads: {
      // 오른쪽 보기. 뾰족한 귀 둘, 짧은 주둥이, 분홍 코. 기준점은 맨 아래 줄 왼쪽에서 두 번째 칸이고, 서 있을 때 (2, -5) 에 놓인다
      face: { ax: 1, ay: 6, rows: [
        '.o..o..',
        'oeooeo.',
        'owwwwwo',
        'owwwEwo',
        'owwwwwn',
        '.owwwMo',
        '..ooo..',
      ] },
      // 뒷모습(오른쪽 위로 멀어지는 쪽). 눈·코와 귀 안쪽이 보이지 않는다
      back: { ax: 1, ay: 6, rows: [
        '.o..o..',
        'owoowo.',
        'owwwwwo',
        'owwwwwo',
        'owwwwwo',
        '.owwwoo',
        '..ooo..',
      ] },
    },
    anchors: {
      stand: { head: [2, -5], tail: [-4, -6] },
      sit: { head: [1, -5], tail: [-3, -1], scratch: [-1, -3] },
      lie: { head: [1, -3], tail: [-4, -2] },
      front: { x: 3, sitY: -3, standY: -4 },
    },
    tilt: { x0: -4, span: 6 },
    legs: { hips: [[-3, false], [-2, true], [0, false], [1, true]], len: 2, near: ['outline', 'body'], far: ['far', 'farLight'] },
    // 강아지보다 긴 꼬리. 선은 꼬리 색, 끝은 윤곽
    tail: { len: 4, rest: 1.0, role: 'earDark', tipRole: 'outline' },
    seeThrough: ['outline', 'eye', 'earDark'],
    shadow: { rx: 5, rxCurl: 6, ry: 1.6 },
    emoteAt: { side: 3, up: 12 },
    lookUpPx: 5,
  },
  // 띠는 늘 꺼져 있다. 강아지 띠 그림을 고양이 색으로 칠한다
  band: DOG.band,
  abilities: { climb: 2, swim: false },
  behavior: {
    // 덜 걷고 덜 달리고, 더 앉고 눕는다. 뒹굴기 그림이 없어 뒹굴기를 하지 않고, 땅을 파지 않는다
    actMul: { walk: 0.8, idle: 1.3, sniff: 0.6, sit: 1.5, run: 0.5, lie: 1.8, rollOver: 0, digSpot: 0 },
    initial: { energy: 0.8, excite: 0.3 },
    energyRate: {
      stand: 0.002, look: 0.002, pant: 0.004, sniff: -0.001, dig: -0.01, bow: -0.01, shake: -0.006, scratch: 0,
      yawn: 0.002, stretch: 0, sit: 0.006, frontSit: 0.006, lie: 0.012, lieRest: 0.016, sleep: 0.03, wake: 0.01,
      drink: 0.004, chew: 0.008, groom: 0.004,
    },
    exciteGain: { turnStart: 0.45, turnEnd: 0.15 },
    // 강아지 전용 그림을 쓰는 자세를 고양이 그림으로 바꾼다. 도구 호출 때 땅 파기 대신 앞발을 핥는다
    poseMap: { roll: 'lie', tilt: 'frontSit', alert: 'stand', beg: 'frontSit', droop: 'lie', dig: 'groom' },
  },
}
