// 강아지 도트 그림(순수 모듈). 오른쪽을 보는 모습으로 그리고 왼쪽은 좌우 반전한다.
//
// 몸통·머리·정면·웅크린 잠은 비트맵이고, 다리·꼬리는 매 프레임 선으로 그린다.
// 다리를 선으로 그리면 걸음 위상에 따라 발끝이 한 픽셀씩 앞뒤로 옮겨 가고 들리므로 속도와 상관없이 발이 바닥에 붙어 보인다.
//
// 좌표: (0, 0) 은 강아지가 선 바닥 점. y 는 위가 음수. 비트맵 글자:
//   . 투명  o 윤곽  w 흰 털  s 그늘  k 코  p 혀  e 귀·꼬리(갈색)  d 짙은 갈색  c 목줄  l 감은 눈
//   E 눈(검정, 자리를 기억해 감은 눈을 덧칠한다)  M 입(윤곽, 자리를 기억해 혀를 덧칠한다)

import { Palette, plot, plotDepth, type Buffer } from '../pixel'

type Mark = readonly [number, number]
type Bitmap = { w: number; h: number; ax: number; ay: number; px: Uint8Array; eyes: Mark[]; mouth?: Mark }

const TRANSPARENT = Palette.TRANSPARENT
// 강아지는 동물 뱅크 0 의 역할 색으로 칠한다
const B = Palette.bank(0)
const R = Palette.Role
const OUTLINE = B + R.outline
const BODY = B + R.body
const EYE = B + R.eye
const LID = B + R.lid
const TONGUE = B + R.tongue
const EAR = B + R.ear
const EAR_DARK = B + R.earDark
const DOG_CODE: Record<string, number> = {
  o: OUTLINE, w: BODY, s: B + R.under, k: EYE, p: TONGUE,
  e: EAR, d: EAR_DARK, c: B + R.collar, l: LID, E: EYE, M: OUTLINE,
}

// ax, ay: 비트맵 안에서 (0, 0) 에 놓일 칸
function bitmap(ax: number, ay: number, rows: readonly string[], code: Record<string, number> = DOG_CODE): Bitmap {
  const h = rows.length
  const w = Math.max(...rows.map(r => r.length))
  const px = new Uint8Array(w * h).fill(TRANSPARENT)
  const eyes: Mark[] = []
  let mouth: Mark | undefined
  rows.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      const ch = row[x]!
      const c = code[ch]
      if (c !== undefined) px[y * w + x] = c
      else if (ch !== '.') throw new Error(`sprite: unknown pixel '${ch}'`)
      if (ch === 'E') eyes.push([x, y])
      if (ch === 'M') mouth = [x, y]
    }
  })
  return { w, h, ax, ay, px, eyes, mouth }
}

// 서 있는 몸통: x -5..3, y -7..-3. 다리는 y -2, -1
const BODY_LEFT = -5
const BODY_SPAN = 8
const BODY_STAND = bitmap(5, 7, [
  '.ooooooo.',
  'owwwwwwwo',
  'owwwwwwwo',
  'ossssssso',
  '.ooooooo.',
])

// 머리(오른쪽 보기). 늘어진 갈색 귀가 뒤쪽 절반을 덮고, 맨 아래 줄에 목줄이 있다.
// 기준점은 맨 아래 줄 왼쪽에서 두 번째 칸이고, 서 있을 때 (0, -5) 에 놓인다
const HEAD_FACE = bitmap(1, 6, [
  '.ooooo...',
  'oeewwwoo.',
  'oeedwwwwo',
  'oeedwEwwo',
  'oeedwEwwk',
  '.oeeswwoo',
  '..occcMo.',
])

// 뒷모습 머리(오른쪽 위로 멀어지는 쪽). 눈·코가 보이지 않는다
const HEAD_BACK = bitmap(1, 6, [
  '.ooooo...',
  'oeewwwoo.',
  'oeedwwweo',
  'oeedwwwwo',
  'oeedwwwwo',
  '.oeeswwo.',
  '..occco..',
])

// 옆으로 앉기. 앞다리는 그림에 들어 있다
const BODY_SIT = bitmap(4, 6, [
  '...owwwo.',
  '..owwwwwo',
  '.owwwwowo',
  'owwwwwowo',
  'owsswwowo',
  '.oooooooo',
])

// 엎드리기(고개 듦). 앞발을 앞으로 뻗는다
const BODY_LIE = bitmap(5, 4, [
  '.oooooo......',
  'owwwwwwo.....',
  'owsssswwwwwwo',
  '.oooooooooooo',
])

// 웅크려 자기. 머리를 앞발에 얹고 눈을 감았고, 꼬리는 엉덩이 밑으로 감았다. 숨 들이쉴 때(A)는 등이 한 픽셀 솟는다
const CURL_A = bitmap(6, 6, [
  '...ooooo......',
  '..owwwwwoooo..',
  '.owwwwwweewwo.',
  'owwwwwwcedllwo',
  'oeeeswwcwwwwwk',
  '.oooooooooooo.',
])
const CURL_B = bitmap(6, 6, [
  '..............',
  '..oooooooooo..',
  '.owwwwwweewwo.',
  'owwwwwwcedllwo',
  'oeeeswwcwwwwwk',
  '.oooooooooooo.',
])

// 정면 앉기(사람을 본다)
const FRONT_SIT = bitmap(6, 13, [
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
])

// 정면 서기(방향을 바꾸는 순간, 사람을 쳐다볼 때)
const FRONT_STAND = bitmap(6, 12, [
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
])

export type Leg = { hipX: number; dx: number; lift: boolean; far: boolean; len: number }

export type BodyKind = 'stand' | 'sit' | 'lie' | 'curlA' | 'curlB' | 'frontSit' | 'frontStand'

// 한 프레임에 그릴 강아지 모습. pet/pose.ts 가 상태에서 만든다
export type DogPose = {
  body: BodyKind
  // 왼쪽을 본다(좌우 반전)
  flip: boolean
  back: boolean
  bodyDx: number
  bodyDy: number
  // 몸통 앞쪽을 내리는 정도(인사 자세). 앞으로 갈수록 이만큼까지 내려간다
  tilt: number
  head: 'face' | 'back' | 'none'
  headDx: number
  headDy: number
  eyeClosed: boolean
  tongue: boolean
  mouthOpen: boolean
  legs: Leg[]
  // 꼬리: 뿌리에서 뒤쪽 수평이 0, 위로 +(라디안). 길이 0 이면 안 그린다
  tailAngle: number
  tailLen: number
  // 뒷다리로 귀 긁기: 다리 끝 높이(0 이면 안 그림)
  scratch: number
}

type Painter = (x: number, y: number, color: number) => void

function stamp(bm: Bitmap, ox: number, oy: number, paint: Painter, flip: boolean, tilt = 0): void {
  for (let y = 0; y < bm.h; y++) {
    for (let x = 0; x < bm.w; x++) {
      const c = bm.px[y * bm.w + x]!
      if (c === TRANSPARENT) continue
      const lx = x - bm.ax + ox
      const drop = tilt === 0 ? 0 : Math.round((tilt * Math.max(0, lx - BODY_LEFT)) / BODY_SPAN)
      paint(flip ? -lx : lx, y - bm.ay + oy + drop, c)
    }
  }
}

// 비트맵 안 칸 (x, y) 를 덧칠한다
function mark(bm: Bitmap, ox: number, oy: number, x: number, y: number, c: number, flip: boolean, paint: Painter): void {
  const lx = ox + x - bm.ax
  paint(flip ? -lx : lx, oy + y - bm.ay, c)
}

// 눈을 감으면 아래 칸만 짙은 회색 선으로 남긴다
function paintFace(bm: Bitmap, ox: number, oy: number, pose: DogPose, flip: boolean, paint: Painter): void {
  if (pose.eyeClosed) {
    for (const [x, y] of bm.eyes) {
      const lower = bm.eyes.some(([ex, ey]) => ex === x && ey === y + 1)
      mark(bm, ox, oy, x, y, lower ? BODY : LID, flip, paint)
    }
  }
  if (!bm.mouth) return
  const [mx, my] = bm.mouth
  if (pose.mouthOpen) {
    mark(bm, ox, oy, mx, my, TONGUE, flip, paint)
    mark(bm, ox, oy, mx, my + 1, TONGUE, flip, paint)
  } else if (pose.tongue) mark(bm, ox, oy, mx, my, TONGUE, flip, paint)
}

function headOf(pose: DogPose): Bitmap | undefined {
  if (pose.head === 'none') return undefined
  return pose.head === 'back' ? HEAD_BACK : HEAD_FACE
}

// 머리를 그리고 눈·입을 덧칠한다. (hx, hy) 는 머리 기준점(맨 아래 줄).
// 착지로 몸이 눌린 채 코를 박으면 머리가 바닥 아래로 내려가므로 맨 아래 줄을 y -1 에서 멈춘다
function paintHead(pose: DogPose, hx: number, rawHy: number, paint: Painter): void {
  const head = headOf(pose)
  if (!head) return
  const hy = Math.min(rawHy, -1)
  stamp(head, hx, hy, paint, pose.flip)
  paintFace(head, hx, hy, pose, pose.flip, paint)
}

// 다리: 가까운 다리는 뒤쪽 윤곽 한 줄 + 앞쪽 흰 털 한 줄, 먼 다리는 회색 두 줄
function paintLegs(pose: DogPose, paint: Painter, far: boolean): void {
  const edge = far ? B + R.far : OUTLINE
  const fill = far ? B + R.farLight : BODY
  for (const leg of pose.legs) {
    if (leg.far !== far) continue
    const x = leg.hipX + pose.bodyDx
    const top = -leg.len + pose.bodyDy + (leg.hipX > 0 ? Math.round(pose.tilt) : 0)
    const foot = leg.lift ? -2 : -1
    const put = (lx: number, y: number, c: number) => paint(pose.flip ? -lx : lx, y, c)
    if (top > foot) {
      // 몸이 바닥까지 내려와 다리가 접혔다: 앞으로 내민 발끝만 보인다
      put(x + leg.dx, -1, edge)
      put(x + leg.dx + 1, -1, edge)
      continue
    }
    for (let y = top; y <= foot; y++) {
      const t = foot === top ? 1 : (y - top) / (foot - top)
      const lx = x + Math.round(leg.dx * t)
      put(lx, y, edge)
      put(lx + 1, y, fill)
    }
  }
}

// 꼬리: 갈색 선, 끝 한 칸은 짙은 갈색. 아래로 흔들려도 바닥(y -1) 아래로 내려가지 않는다
function paintTail(pose: DogPose, rootX: number, rootY: number, paint: Painter): void {
  if (pose.tailLen <= 0) return
  for (let k = 1; k <= pose.tailLen; k++) {
    const lx = Math.round(rootX - k * Math.cos(pose.tailAngle))
    const ly = Math.min(-1, Math.round(rootY - k * Math.sin(pose.tailAngle)))
    paint(pose.flip ? -lx : lx, ly, k === pose.tailLen ? EAR_DARK : EAR)
  }
}

// 강아지 한 마리를 칠한다. paint 는 오른쪽 보기 좌표를 받지 않고 이미 반전된 좌표를 받는다
export function paintDog(pose: DogPose, paint: Painter): void {
  const bx = pose.bodyDx
  const by = pose.bodyDy
  switch (pose.body) {
    case 'stand': {
      if (!pose.back) paintTail(pose, -5 + bx, -6 + by, paint)
      paintLegs(pose, paint, true)
      stamp(BODY_STAND, bx, by, paint, pose.flip, pose.tilt)
      paintLegs(pose, paint, false)
      paintHead(pose, bx + pose.headDx, -5 + by + pose.headDy + Math.round(pose.tilt), paint)
      if (pose.back) paintTail(pose, -5 + bx, -6 + by, paint)
      return
    }
    case 'sit': {
      paintTail(pose, -3 + bx, -1 + by, paint)
      stamp(BODY_SIT, bx, by, paint, pose.flip)
      if (pose.scratch > 0) {
        // 뒷다리를 들어 귀 뒤를 긁는다
        for (let k = 0; k < 3; k++) {
          const lx = -1 + bx + k
          const ly = -3 + by - Math.round(pose.scratch * k / 2)
          paint(pose.flip ? -lx : lx, ly, OUTLINE)
          paint(pose.flip ? -lx : lx, ly - 1, BODY)
        }
      }
      paintHead(pose, 0 + bx + pose.headDx, -6 + by + pose.headDy, paint)
      return
    }
    case 'lie': {
      paintTail(pose, -5 + bx, -3 + by, paint)
      stamp(BODY_LIE, bx, by, paint, pose.flip)
      paintHead(pose, bx + pose.headDx, -3 + by + pose.headDy, paint)
      return
    }
    case 'curlA':
    case 'curlB': {
      stamp(pose.body === 'curlA' ? CURL_A : CURL_B, bx, by, paint, pose.flip)
      return
    }
    case 'frontSit':
    case 'frontStand': {
      const bm = pose.body === 'frontSit' ? FRONT_SIT : FRONT_STAND
      // 꼬리는 몸 뒤에서 옆으로 흔든다
      if (pose.tailLen > 0) {
        const side = Math.sin(pose.tailAngle) > 0 ? 1 : -1
        const ty = pose.body === 'frontSit' ? -3 : -4
        for (let k = 1; k <= 2; k++) paint((4 + k) * side + bx, ty + by - (k === 2 ? 1 : 0), k === 2 ? EAR_DARK : EAR)
      }
      stamp(bm, bx, by, paint, false)
      paintFace(bm, bx, by, pose, false, paint)
      return
    }
  }
}

// 가림 뒤로 비쳐 보이는 진한 색
const SEE_THROUGH = new Set<number>([OUTLINE, EYE, EAR_DARK])

// 버퍼에 강아지를 그린다. 깊이가 앞선 타일 픽셀에 가려지고,
// 가려진 윤곽은 가린 면 위에 한 칸 걸러 진한 선 색으로 비쳐 보여 블록 뒤에서도 어디 있는지 알 수 있다
export function drawDog(b: Buffer, pose: DogPose, x: number, y: number, depth: number): void {
  paintDog(pose, (px, py, c) => {
    const X = x + px
    const Y = y + py
    if (X < 0 || Y < 0 || X >= b.w || Y >= b.h) return
    const i = Y * b.w + X
    if (depth > b.depth[i]!) b.px[i] = c
    else if (SEE_THROUGH.has(c) && ((X + Y) & 1) === 0) b.px[i] = Palette.LINE_HEAVY
  })
}

// 작은 그림: 감정 표시, z, 공. 감정 표시는 동물 색을 빌리지 않고 효과 묶음의 고정 색으로 칠한다
const EMOTE_CODE: Record<string, number> = { o: Palette.EMOTE_INK, p: Palette.HEART, z: Palette.ZZZ }
const EMOTES: Record<string, Bitmap> = {
  '!': bitmap(0, 5, ['o', 'o', 'o', '.', 'o'], EMOTE_CODE),
  '?': bitmap(1, 5, ['oo.', '..o', '.o.', '...', '.o.'], EMOTE_CODE),
  heart: bitmap(2, 4, ['.p.p.', 'ppppp', '.ppp.', '..p..'], EMOTE_CODE),
  note: bitmap(1, 5, ['.oo', '.o.', '.o.', 'oo.', 'oo.'], EMOTE_CODE),
  z: bitmap(1, 2, ['zzz', '.z.', 'zzz'], EMOTE_CODE),
}

export function drawEmote(b: Buffer, kind: string, x: number, y: number): void {
  const bm = EMOTES[kind]
  if (!bm) return
  stamp(bm, 0, 0, (px, py, c) => plot(b, x + px, y + py, c), false)
}

// 공 4 × 4. 굴러간 거리에 따라 흰 점이 둘레를 돈다
export function drawBall(b: Buffer, x: number, y: number, roll: number, depth: number): void {
  const shape = ['.oo.', 'oooo', 'oooo', '.oo.']
  const spots: ReadonlyArray<readonly [number, number]> = [[1, 1], [2, 1], [2, 2], [1, 2]]
  const spot = spots[Math.floor(roll * 5) % 4]!
  for (let j = 0; j < 4; j++) {
    for (let i = 0; i < 4; i++) {
      if (shape[j]![i] !== 'o') continue
      const c = i === spot[0] && j === spot[1] ? Palette.BALL_HI : Palette.BALL
      plotDepth(b, x - 2 + i, y - 4 + j, c, depth)
    }
  }
}

export * as default from '.'
