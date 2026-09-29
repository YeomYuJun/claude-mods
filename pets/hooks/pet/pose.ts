// 상태를 한 프레임의 모습(PetPose)으로 바꾼다(순수 모듈). 상태를 바꾸지 않는다.
//
// 걸음: 다리마다 위상이 다르고, 위상의 앞 σ 동안은 발이 바닥을 짚고 뒤로 밀리며(+amp 에서 -amp),
// 나머지 동안은 들려서 앞으로 돌아온다. 걸음마다 σ·amp·다리 위상, 엉덩이 자리, 다리 길이, 꼬리 길이는 종 정의에서 읽는다.
// 자세마다 꼬리를 흔드는 폭·빠르기와 머리 움직임은 여기서 정한다. 달리기에서 네 발이 다 뜨면 몸이 솟는다.

import type { Leg, PetPose } from '../sprite'
import { isBack, isMoving, isRight, type Gait, type Pet } from './state.js'


function foot(ph: number, sigma: number, amp: number): { dx: number; lift: boolean } {
  const t = ph - Math.floor(ph)
  if (t < sigma) return { dx: Math.round(amp - (2 * amp * t) / sigma), lift: false }
  return { dx: Math.round(-amp + (2 * amp * (t - sigma)) / (1 - sigma)), lift: true }
}

function legsStill(p: Pet, dxFront = 0, dxBack = 0): Leg[] {
  const { hips, len } = p.species.sprite.legs
  return hips.map(([hipX, far]) => ({ hipX, far, dx: hipX > 0 ? dxFront : dxBack, lift: false, len }))
}

function legsWalking(p: Pet, gait: Gait, stride: number): Leg[] {
  const g = p.species.gaits[gait]
  const { hips, len } = p.species.sprite.legs
  return hips.map(([hipX, far], i) => {
    const f = foot(stride + g.phase[i]!, g.sigma, g.amp)
    return { hipX, far, dx: f.dx, lift: f.lift, len }
  })
}

function wag(t: number, base: number, amp: number, hz: number): number {
  return base + amp * Math.sin((2 * Math.PI * hz * t) / 1000)
}

function base(p: Pet): PetPose {
  return {
    body: 'stand', flip: !isRight(p.dir), back: isBack(p.dir), bodyDx: 0, bodyDy: 0, tilt: 0,
    head: isBack(p.dir) ? 'back' : 'face', headKind: 'plain', headDx: 0, headDy: 0,
    eyeClosed: p.blinkMs > 0, tongue: false, mouthOpen: false,
    legs: legsStill(p), tailAngle: p.species.sprite.tail.rest, tailLen: p.species.sprite.tail.len, scratch: 0,
  }
}

// t: 지금 단계가 시작한 뒤 흐른 시간(ms), now: 꼬리·숨 시계(ms)
export function poseOf(p: Pet): PetPose {
  const d = base(p)
  const now = p.breath
  const t = p.act.t
  const happy = p.excite > 0.5
  if (p.hop) {
    const u = p.hop.t / p.hop.dur
    // 오를 때는 앞다리를 모으고 뒷다리를 뻗고, 내려올 때는 앞다리를 먼저 내민다
    d.legs = legsStill(p).map(l => ({ ...l, dx: l.hipX > 0 ? (u < 0.5 ? -1 : 1) : (u < 0.5 ? -1 : 0), lift: true }))
    d.tailAngle = 1.0
    return d
  }
  if (p.crouchMs > 0) {
    d.bodyDy = 1
    d.headDy = 1
    d.legs = legsStill(p, 1, -1)
    d.tailAngle = 0.9
    return d
  }
  if (p.turnMs > 0) {
    d.body = 'frontStand'
    d.tailAngle = wag(now, 0, 1, 3)
    return d
  }
  if (isMoving(p)) {
    const g = p.gait
    d.legs = legsWalking(p, g, p.stride)
    const ph = p.stride - Math.floor(p.stride)
    if (g === 'run') {
      // 네 발이 다 떠 있는 순간 몸이 한 픽셀 솟는다
      const flight = d.legs.every(l => l.lift)
      d.bodyDy = flight ? -1 : 0
      d.tailAngle = wag(now, 0.35, 0.15, 3)
      d.tongue = true
    } else if (g === 'sniff') {
      d.headDx = 1
      d.headDy = 3
      d.tailAngle = wag(now, 1.1, 0.25, 5)
    } else if (g === 'creep') {
      // 몸을 한 픽셀 낮추고 앞을 숙인 채 머리를 내밀고, 꼬리는 굳힌다(더 낮추면 폭이 16 을 넘는다)
      d.bodyDy = 1
      d.tilt = 1
      d.headDx = 1
      d.tailAngle = wag(now, 0.7, 0.05, 1)
    } else {
      d.headDy = g === 'walk' && ph % 0.5 >= 0.25 ? 1 : 0
      d.tailAngle = wag(now, 0.75, 0.3, g === 'trot' ? 3 : 2)
    }
    // 살금 걸음은 이미 몸을 낮춰 착지 눌림을 더하면 바닥 아래로 내려간다
    if (p.landMs > 0 && g !== 'creep') { d.bodyDy += 1; d.headDy += 1 }
    return d
  }
  if (p.landMs > 0) { d.bodyDy = 1; d.headDy = 1 }
  switch (p.pose) {
    case 'stand':
      d.tailAngle = wag(now, 0.8, happy ? 0.5 : 0.35, happy ? 4 : 1.6)
      return d
    case 'look':
      d.body = 'frontStand'
      d.tailAngle = wag(now, 0, 1, happy ? 5 : 2.5)
      d.tongue = happy
      return d
    case 'pant':
      d.tongue = true
      d.mouthOpen = Math.floor(now / 170) % 2 === 0
      d.tailAngle = wag(now, 0.7, 0.3, 2.5)
      return d
    case 'sniff':
      d.headDx = 1
      d.headDy = 4 - (Math.floor(now / 140) % 3 === 0 ? 1 : 0)
      d.tailAngle = wag(now, 1.1, 0.25, 5)
      return d
    case 'dig': {
      d.headDx = 1
      d.headDy = 3
      const beat = Math.floor(now / 65) % 2
      d.legs = legsStill(p).map((l, i) => ({ ...l, dx: l.hipX > 0 ? (beat === i % 2 ? 1 : -1) : -1, lift: l.hipX > 0 && beat === i % 2 }))
      d.tailAngle = wag(now, 1.0, 0.35, 5)
      return d
    }
    case 'bow':
      d.tilt = 2
      d.legs = legsStill(p, 1, 0)
      d.tailAngle = wag(now, 1.3, 0.5, 6)
      d.tongue = true
      return d
    case 'shake': {
      const side = Math.floor(t / 55) % 2 === 0 ? 1 : -1
      d.bodyDx = side
      d.headDx = -side
      d.eyeClosed = true
      d.tailAngle = wag(now, 0.6, 0.8, 9)
      // 몸이 좌우로 흔들려도 꼬리 끝이 16 픽셀 폭을 넘지 않게 짧게 접는다
      d.tailLen = 2
      return d
    }
    case 'scratch':
      d.body = 'sit'
      d.scratch = 1 + (Math.floor(now / 70) % 2)
      d.eyeClosed = true
      d.headDy = 1
      d.tailAngle = 0
      return d
    case 'yawn':
      d.mouthOpen = t > 150 && t < 650
      d.eyeClosed = t > 100 && t < 700
      d.headDy = t > 150 && t < 650 ? -1 : 0
      d.tailAngle = 0.4
      return d
    case 'stretch': {
      const first = t < 450
      d.tilt = first ? 2 : -1
      d.legs = first ? legsStill(p, 1, 0) : legsStill(p, 0, -1)
      d.eyeClosed = true
      d.tailAngle = first ? 1.2 : 0.3
      return d
    }
    case 'sit':
      d.body = 'sit'
      d.tailAngle = wag(now, 0.1, happy ? 0.6 : 0.3, happy ? 4 : 1.2)
      d.tongue = happy
      return d
    case 'frontSit':
      d.body = 'frontSit'
      d.tailAngle = wag(now, 0, 1, happy || p.emote?.kind === 'heart' ? 4 : 1.5)
      d.tongue = happy || p.emote?.kind === 'heart'
      return d
    case 'lie':
      d.body = 'lie'
      d.tailAngle = wag(now, 0.05, 0.25, 0.8)
      return d
    case 'lieRest':
      d.body = 'lie'
      d.headDy = 2
      // 눈을 감고 있다가 가끔 뜬다
      d.eyeClosed = Math.floor(now / 3000) % 4 !== 0
      d.tailAngle = 0
      return d
    case 'wake':
      d.body = 'lie'
      d.headDy = t < 300 ? 2 : 0
      d.eyeClosed = t < 350
      d.tailAngle = wag(now, 0.05, 0.3, 2)
      return d
    case 'sleep':
      d.body = now % 2400 < 1100 ? 'curlA' : 'curlB'
      d.head = 'none'
      d.tailLen = 0
      return d
    case 'roll':
      // 배를 보이며 다리를 버둥거린다. 머리·꼬리는 그림에 들어 있다
      d.body = now % 500 < 250 ? 'bellyA' : 'bellyB'
      d.head = 'none'
      d.tailLen = 0
      d.legs = []
      d.tongue = true
      return d
    case 'drink':
      // 킁킁 머리로 물에 코를 대고 혀를 넣었다 뺀다
      d.headDx = 1
      d.headDy = 4
      d.tongue = Math.floor(now / 150) % 2 === 0
      d.tailAngle = wag(now, 1.0, 0.2, 1.5)
      return d
    case 'chew':
      // 엎드려 머리를 한 픽셀 위아래로 움직이며 씹는다
      d.body = 'lie'
      d.headDy = Math.floor(now / 180) % 2
      d.tailAngle = wag(now, 0.1, 0.3, 1.5)
      return d
    case 'tilt':
      // 사람을 보고 고개를 갸웃한다. 관심 보이기는 선 채로, 나머지는 앉아서
      d.body = p.act.name === 'attend' ? 'frontStand' : 'frontSit'
      d.headKind = 'tilt'
      d.tailAngle = wag(now, 0, 0.6, 1.5)
      return d
    case 'alert': {
      // 귀를 세우고 꼬리를 올려 굳힌다. 짖는 동안에는 입을 150 ms 씩 두 번 벌린다
      d.headKind = 'alert'
      d.tailAngle = wag(now, 1.2, 0.08, 3)
      const bark = p.emote?.kind === 'bark' ? p.emote.age : -1
      d.mouthOpen = bark >= 0 && bark < 600 && bark % 300 < 150
      return d
    }
    case 'beg':
      // 정면으로 앉아 앞발을 들고 꼬리를 빠르게 흔든다
      d.body = 'frontBeg'
      d.tailAngle = wag(now, 0, 1, 4)
      d.tongue = true
      return d
    case 'droop':
      // 엎드려 귀를 처뜨리고 머리를 낮춘다. 꼬리는 바닥에 붙인다
      d.body = 'lie'
      d.headKind = 'droop'
      d.headDy = 1
      d.tailAngle = 0
      return d
  }
}
