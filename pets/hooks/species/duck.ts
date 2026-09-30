// 오리(흰 오리). 오른쪽을 보는 모습으로 그리고 왼쪽은 좌우 반전한다.
// 머리가 몸 그림에 들어 있다(heads 없음). 뒷모습은 몸 그림의 눈을 털로 바꿔 만든다.
// 두 발은 한 픽셀 폭 주황 선으로 매 프레임 그리고, 걸을 때 몸을 앞뒤로 번갈아 옮긴다(뒤뚱).
// 앉기는 서기 그림을 한 픽셀 낮춰 발을 가린 것, 엎드리기는 앉기와 같다.
// 오리 전용 그림이 없는 자세(뒹굴기, 갸웃, 귀 세움, 조르기, 귀 처짐, 땅 파기, 귀 긁기)와 몸 앞을 숙이는 자세(인사, 기지개)는 poseMap 으로 바꾼다.
//
// 비트맵 좌표: (0, 0) 은 오리가 선 바닥 점, y 는 위가 음수. 글자:
//   . 투명  o 윤곽  w 깃털  s 배 쪽 그늘  p 날개 선  e 부리  l 감은 눈
//   E 눈(자리를 기억해 감은 눈을 덧칠한다)  M 입(윤곽, 부리 아래. 자리를 기억해 혀를 덧칠한다)
// 뱅크 역할: ear 부리·가까운 발, earDark 먼 발, pattern 날개 선. 목줄은 없다

import { DOG } from './dog.js'
import type { BandColors, BitmapSpec, BreedDef, SpeciesDef } from './types.js'

const band = (body: number, under: number, line: number, eye: number, ear: number, earDark: number, collar: number): BandColors => ({ body, under, line, eye, ear, earDark, collar })

const BREEDS: readonly BreedDef[] = [
  {
    id: 'duck', species: 'duck', label: '오리', aliases: ['오리', '흰오리'],
    bank: { outline: 0x3a3228, body: 0xf8f6ee, under: 0xdcd8cc, far: 0xc07818, farLight: 0xc07818, eye: 0x141212, lid: 0x9a968c, tongue: 0xc0503a, ear: 0xf0a030, earDark: 0xc07818, collar: 0xf8f6ee, pattern: 0xc8c4b8 },
    band: { dark: band(0xf8f6ee, 0xdcd8cc, 0xa8a49a, 0x141212, 0xf0a030, 0xc07818, 0xf8f6ee), light: band(0x8a8688, 0x6f6b6c, 0x3a3228, 0x141212, 0xc07818, 0x8a5010, 0x8a8688) },
  },
]

// 서 있는 몸: 몸통 x -4..4, 머리 x 1..5, y -8..-2. 발은 y -1
const STAND: readonly string[] = [
  '......oo..',
  '.....owwo.',
  '.....owEee',
  'o....owwM.',
  'owooowwwo.',
  'owppwwwwo.',
  '.osssssso.',
]
const sit: BitmapSpec = { ax: 4, ay: 7, rows: STAND }

export const DUCK: SpeciesDef = {
  id: 'duck',
  label: '오리',
  breeds: BREEDS,
  gaits: {
    // 두 발을 번갈아(위상 반 주기 차) 딛으며 뒤뚱거린다
    walk: { speed: 1.4, accel: 5, decel: 5, stride: 0.3, sigma: 0.5, amp: 1, phase: [0, 0.5], energyPerS: -0.004, sway: 1 },
    trot: { speed: 2.0, accel: 6, decel: 6, stride: 0.35, sigma: 0.5, amp: 1, phase: [0, 0.5], energyPerS: -0.01, sway: 1 },
    run: { speed: 3.0, accel: 8, decel: 7, stride: 0.45, sigma: 0.4, amp: 1, phase: [0, 0.5], energyPerS: -0.02, sway: 1 },
    sniff: { speed: 0.6, accel: 4, decel: 4, stride: 0.2, sigma: 0.5, amp: 1, phase: [0, 0.5], energyPerS: -0.002 },
    creep: { speed: 0.6, accel: 4, decel: 4, stride: 0.2, sigma: 0.5, amp: 1, phase: [0, 0.5], energyPerS: -0.002 },
    swim: { speed: 1.6, accel: 4, decel: 4, stride: 0.5, sigma: 0.5, amp: 0, phase: [0, 0.5], energyPerS: -0.003 },
  },
  motion: { corner: 0.22, crouchMs: 100, landMs: 90, turnMs: 110, hopAt: 0.62, runDustMs: 0 },
  jump: { upPx: 3, downPx: 3, runBonusPx: 1, minSpeed: 2.2, minMs: 220, maxMs: 420, pounce: { peakPx: 4, ms: 320 } },
  sprite: {
    codes: { o: 'outline', w: 'body', s: 'under', p: 'pattern', e: 'ear', l: 'lid', E: 'eye', M: 'outline' },
    backFill: 'w',
    bodies: {
      stand: { ax: 4, ay: 8, rows: STAND },
      // 배를 땅에 붙이고 앉는다(발이 몸에 가린다)
      sit,
      lie: sit,
      // 고개를 등에 묻고 잔다. 숨 들이쉴 때(A)는 머리가 한 픽셀 높다
      curlA: { ax: 4, ay: 5, rows: [
        '....oooo..',
        'o..owwlwe.',
        'owoowwwwo.',
        'owppwwwwo.',
        '.osssssso.',
      ] },
      curlB: { ax: 4, ay: 5, rows: [
        '..........',
        'o..ooooo..',
        'owowwwlwe.',
        'owppwwwwo.',
        '.osssssso.',
      ] },
      // 정면(사람을 본다): 두 눈, 넓은 부리, 날개 둘, 발 둘
      frontStand: { ax: 4, ay: 10, rows: [
        '...ooo...',
        '..owwwo..',
        '.owEwEwo.',
        '.oweeewo.',
        '..oeMeo..',
        '.owwwwwo.',
        'owpwwwpwo',
        'owssssswo',
        '.ooooooo.',
        '..e...e..',
      ] },
      frontSit: { ax: 4, ay: 10, rows: [
        '...ooo...',
        '..owwwo..',
        '.owEwEwo.',
        '.oweeewo.',
        '..oeMeo..',
        '.owwwwwo.',
        'owpwwwpwo',
        'owssssswo',
        '.ooooooo.',
        '..e...e..',
      ] },
      // 고개를 숙여 부리를 땅에 댄다(킁킁·마시기·자맥질)
      stoop: { ax: 4, ay: 5, rows: [
        'o.........',
        'owooooo...',
        'owppwwwoo.',
        '.ossssowEM',
        '......owee',
      ] },
      // 헤엄: 서기 몸을 네 픽셀 올린 것. 수면은 y -6(배 줄)이고 그 아래 두 줄은 앞 칸 수면에 가린다
      swim: { ax: 4, ay: 12, rows: [
        ...STAND,
        '..ssssss..',
        '...ssss...',
      ] },
    },
    anchors: {
      stand: { head: [3, -6], tail: [-4, -4] },
      sit: { head: [3, -5], tail: [-4, -3], scratch: [0, -3] },
      lie: { head: [3, -5], tail: [-4, -3] },
      front: { x: 4, sitY: -3, standY: -3 },
    },
    tilt: { x0: -4, span: 8 },
    // 두 발: 가까운 발, 먼 발. 한 픽셀 폭 주황
    legs: { hips: [[-1, false], [1, true]], len: 1, near: ['ear', 'ear'], far: ['earDark', 'earDark'], thin: true },
    // 꼬리는 그림에 들어 있다
    tail: { len: 0, rest: 0.8, role: 'body', tipRole: 'outline' },
    seeThrough: ['outline', 'eye', 'ear'],
    shadow: { rx: 5, rxCurl: 5, ry: 1.4 },
    emoteAt: { side: 3, up: 11 },
    lookUpPx: 4,
  },
  // 띠는 늘 꺼져 있다. 강아지 띠 그림을 오리 색으로 칠한다
  band: DOG.band,
  abilities: { climb: 1, swim: true },
  behavior: {
    // 더 걷고 킁킁(자맥질)대고 앉는다. 덜 놀고 덜 달린다. 뒹굴기·땅 파기 그림이 없다
    actMul: { walk: 1.2, sniff: 1.5, play: 0.5, sit: 1.2, run: 0.5, rollOver: 0, digSpot: 0 },
    initial: { energy: 0.8, excite: 0.3 },
    energyRate: {
      stand: 0.002, look: 0.002, pant: 0.004, sniff: -0.001, dig: -0.01, bow: -0.01, shake: -0.006, scratch: 0,
      yawn: 0.002, stretch: 0, sit: 0.006, frontSit: 0.006, lie: 0.012, lieRest: 0.016, sleep: 0.03, wake: 0.01,
      drink: 0.004, chew: 0.008, groom: 0.004,
    },
    exciteGain: { turnStart: 0.45, turnEnd: 0.15 },
    // 오리 그림이 없는 자세를 바꾼다. 도구 호출 때 땅 파기 대신 킁킁(부리로 뒤진다), 귀 긁기 대신 깃 고르기
    // 몸 앞을 숙이면(인사·기지개) 짧은 다리 아래로 몸이 땅에 묻혀 서기로 한다
    poseMap: { roll: 'lie', tilt: 'frontSit', alert: 'stand', beg: 'frontSit', droop: 'lie', dig: 'sniff', scratch: 'groom', bow: 'stand', stretch: 'stand' },
  },
}
