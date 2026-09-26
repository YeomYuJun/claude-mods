// 강아지(흰 비글). 오른쪽을 보는 모습으로 그리고 왼쪽은 좌우 반전한다.
// 몸통·머리·정면·웅크린 잠은 비트맵이고, 다리·꼬리는 그리는 쪽이 매 프레임 선으로 그린다.
//
// 비트맵 좌표: (0, 0) 은 강아지가 선 바닥 점, y 는 위가 음수. 글자:
//   . 투명  o 윤곽  w 흰 털  s 그늘  k 코  p 혀  e 귀·꼬리(갈색)  d 짙은 갈색  c 목줄  l 감은 눈
//   E 눈(검정, 자리를 기억해 감은 눈을 덧칠한다)  M 입(윤곽, 자리를 기억해 혀를 덧칠한다)

import type { SpeciesDef } from './types.js'

export const DOG: SpeciesDef = {
  id: 'dog',
  label: '강아지',
  gaits: {
    // 다리 순서: 가까운 뒷다리, 먼 뒷다리, 가까운 앞다리, 먼 앞다리.
    // 걷기는 네 박자(뒤-앞-뒤-앞), 속보는 대각 짝, 달리기는 앞·뒤 짝이 모이고 벌어진다
    walk: { speed: 2.4, accel: 7, decel: 6, stride: 0.62, sigma: 0.7, amp: 1, phase: [0, 0.5, 0.25, 0.75], energyPerS: -0.004 },
    trot: { speed: 3.6, accel: 10, decel: 9, stride: 0.9, sigma: 0.5, amp: 1, phase: [0, 0.5, 0.5, 0], energyPerS: -0.01 },
    run: { speed: 6.0, accel: 14, decel: 12, stride: 1.3, sigma: 0.38, amp: 2, phase: [0, 0.08, 0.5, 0.58], energyPerS: -0.025 },
    sniff: { speed: 1.1, accel: 5, decel: 5, stride: 0.45, sigma: 0.75, amp: 1, phase: [0, 0.5, 0.25, 0.75], energyPerS: -0.002 },
  },
  motion: { corner: 0.22, crouchMs: 80, landMs: 90, turnMs: 110, hopAt: 0.62, runDustMs: 110 },
  jump: { upPx: 5, downPx: 3, runBonusPx: 2, minSpeed: 2.2, minMs: 220, maxMs: 420, pounce: { peakPx: 7, ms: 360 } },
  sprite: {
    codes: { o: 'outline', w: 'body', s: 'under', k: 'eye', p: 'tongue', e: 'ear', d: 'earDark', c: 'collar', l: 'lid', E: 'eye', M: 'outline' },
    bodies: {
      // 서 있는 몸통: x -5..3, y -7..-3. 다리는 y -2, -1
      stand: { ax: 5, ay: 7, rows: [
        '.ooooooo.',
        'owwwwwwwo',
        'owwwwwwwo',
        'ossssssso',
        '.ooooooo.',
      ] },
      // 옆으로 앉기. 앞다리는 그림에 들어 있다
      sit: { ax: 4, ay: 6, rows: [
        '...owwwo.',
        '..owwwwwo',
        '.owwwwowo',
        'owwwwwowo',
        'owsswwowo',
        '.oooooooo',
      ] },
      // 엎드리기(고개 듦). 앞발을 앞으로 뻗는다
      lie: { ax: 5, ay: 4, rows: [
        '.oooooo......',
        'owwwwwwo.....',
        'owsssswwwwwwo',
        '.oooooooooooo',
      ] },
      // 웅크려 자기. 머리를 앞발에 얹고 눈을 감았고, 꼬리는 엉덩이 밑으로 감았다. 숨 들이쉴 때(A)는 등이 한 픽셀 솟는다
      curlA: { ax: 6, ay: 6, rows: [
        '...ooooo......',
        '..owwwwwoooo..',
        '.owwwwwweewwo.',
        'owwwwwwcedllwo',
        'oeeeswwcwwwwwk',
        '.oooooooooooo.',
      ] },
      curlB: { ax: 6, ay: 6, rows: [
        '..............',
        '..oooooooooo..',
        '.owwwwwweewwo.',
        'owwwwwwcedllwo',
        'oeeeswwcwwwwwk',
        '.oooooooooooo.',
      ] },
      // 정면 앉기(사람을 본다)
      frontSit: { ax: 6, ay: 13, rows: [
        '...ooooooo...',
        '.oowwwwwwwoo.',
        'oeewwwwwwweeo',
        'oeewEwwwEweeo',
        'oeewEwkwEweeo',
        'odeowwwwwoedo',
        '.oo.ooMoo.oo.',
        '...occccco...',
        '...owwwwwo...',
        '..owwwwwwwo..',
        '..owswwwswo..',
        '..owsowoswo..',
        '...oo.o.oo...',
      ] },
      // 정면 서기(방향을 바꾸는 순간, 사람을 쳐다볼 때)
      frontStand: { ax: 6, ay: 12, rows: [
        '...ooooooo...',
        '.oowwwwwwwoo.',
        'oeewwwwwwweeo',
        'oeewEwwwEweeo',
        'oeewEwkwEweeo',
        'odeowwwwwoedo',
        '.oo.ooMoo.oo.',
        '...occccco...',
        '...owwwwwo...',
        '...ossssso...',
        '...owo.owo...',
        '...owo.owo...',
      ] },
    },
    heads: {
      // 오른쪽 보기. 늘어진 갈색 귀가 뒤쪽 절반을 덮고, 맨 아래 줄에 목줄이 있다.
      // 기준점은 맨 아래 줄 왼쪽에서 두 번째 칸이고, 서 있을 때 (0, -5) 에 놓인다
      face: { ax: 1, ay: 6, rows: [
        '.ooooo...',
        'oeewwwoo.',
        'oeedwwwwo',
        'oeedwEwwo',
        'oeedwEwwk',
        '.oeeswwoo',
        '..occcMo.',
      ] },
      // 뒷모습(오른쪽 위로 멀어지는 쪽). 눈·코가 보이지 않는다
      back: { ax: 1, ay: 6, rows: [
        '.ooooo...',
        'oeewwwoo.',
        'oeedwwweo',
        'oeedwwwwo',
        'oeedwwwwo',
        '.oeeswwo.',
        '..occco..',
      ] },
    },
    anchors: {
      stand: { head: [0, -5], tail: [-5, -6] },
      sit: { head: [0, -6], tail: [-3, -1], scratch: [-1, -3] },
      lie: { head: [0, -3], tail: [-5, -3] },
      front: { x: 4, sitY: -3, standY: -4 },
    },
    tilt: { x0: -5, span: 8 },
    // 엉덩이 x. 다리는 이 칸과 앞 칸, 두 픽셀 폭이라 몸통(x -5..3) 안에 들어온다
    legs: { hips: [[-4, false], [-3, true], [1, false], [2, true]], len: 2, near: ['outline', 'body'], far: ['far', 'farLight'] },
    tail: { len: 3, rest: 0.8, role: 'ear', tipRole: 'earDark' },
    seeThrough: ['outline', 'eye', 'earDark'],
    shadow: { rx: 5, rxCurl: 6, ry: 1.6 },
    emoteAt: { side: 3, up: 13 },
    lookUpPx: 5,
  },
  band: {
    // 띠의 바탕은 터미널 기본색(대개 어둡다)이라 패널처럼 진한 윤곽을 쓰면 묻힌다.
    // 몸은 흰색·밝은 회색으로 채우고 다리는 중간 회색으로 그려 어두운 바탕과 밝은 바탕 모두에서 읽히게 한다.
    // 글자: . 투명  w 흰 털  s 그늘  l 다리  k 눈·코  e 귀·꼬리(갈색)  d 꼬리 끝(짙은 갈색)  c 목줄
    codes: { w: 'body', s: 'under', l: 'line', k: 'eye', e: 'ear', d: 'earDark', c: 'collar' },
    frames: {
      walkA: { w: 9, rows: ['......ww.', 'd....wekw', '.ewwwcewk', '.sssssss.', '.l.l..l.l'] },
      walkB: { w: 9, rows: ['......ww.', 'd....wekw', '.ewwwcewk', '.sssssss.', '..l.l.l.l'] },
      runA: { w: 9, rows: ['......ww.', '.....wekw', 'ewwwwcewk', '.sssssss.', 'l.......l'] },
      runB: { w: 9, rows: ['......ww.', 'd....wekw', '.ewwwcewk', '.sssssss.', '...ll.l..'] },
      sniff: { w: 9, rows: ['.........', 'd........', '.ewwwcew.', '.sssssewk', '.l.l..l..'] },
      sitA: { w: 8, rows: ['.....ww.', '....wekw', '...wcewk', 'e.swwws.', '.ssssss.'] },
      sitB: { w: 8, rows: ['.....ww.', '....wekw', '...wcewk', '..swwws.', 'essssss.'] },
      sleep: { w: 9, rows: ['.........', '.........', '...wwwew.', '.ewwwcewk', '.sssssss.'] },
    },
    walkPxS: 9,
    runPxS: 24,
    weights: { busy: { walk: 50, idle: 25, sit: 8, sniff: 15 }, calm: { walk: 35, idle: 25, sit: 20, sniff: 15 } },
  },
  abilities: { climb: 1, swim: false },
  behavior: {
    actMul: {},
    initial: { energy: 0.8, excite: 0.3 },
    energyRate: {
      stand: 0.002, look: 0.002, pant: 0.004, sniff: -0.001, dig: -0.01, bow: -0.01, shake: -0.006, scratch: 0,
      yawn: 0.002, stretch: 0, sit: 0.006, frontSit: 0.006, lie: 0.012, lieRest: 0.016, sleep: 0.03, wake: 0.01,
    },
    exciteGain: { turnStart: 0.45, turnEnd: 0.15 },
  },
}
