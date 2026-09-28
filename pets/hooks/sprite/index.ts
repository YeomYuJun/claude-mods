// 동물 도트 그림(순수 모듈). 종 정의(hooks/species)의 비트맵·기준점·다리·꼬리로 그린다.
// 오른쪽을 보는 모습으로 그리고 왼쪽은 좌우 반전한다.
//
// 몸통·머리·정면·웅크린 잠은 비트맵이고, 다리·꼬리는 매 프레임 선으로 그린다.
// 다리를 선으로 그리면 걸음 위상에 따라 발끝이 한 픽셀씩 앞뒤로 옮겨 가고 들리므로 속도와 상관없이 발이 바닥에 붙어 보인다.
// 비트맵 글자는 종이 정한 역할(윤곽, 몸, 눈 등)이고, 역할은 동물 뱅크 번호를 더해 팔레트 번호가 된다.
// 종·뱅크마다 한 번만 번호로 바꿔 두고 다시 쓴다.

import { Palette, plot, plotDepth, type Buffer } from '../pixel'
import type { BitmapSpec, BodyKind, SpeciesDef } from '../species'

type Mark = readonly [number, number]
type Bitmap = { w: number; h: number; ax: number; ay: number; px: Uint8Array; eyes: Mark[]; mouth?: Mark }

const TRANSPARENT = Palette.TRANSPARENT

function bitmap(ax: number, ay: number, rows: readonly string[], code: Readonly<Record<string, number>>): Bitmap {
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

// 종 하나를 뱅크 하나의 팔레트 번호로 바꾼 것
type Compiled = {
  species: SpeciesDef
  bodies: Record<BodyKind, Bitmap>
  face: Bitmap
  back: Bitmap
  role: (name: Palette.RoleName) => number
  seeThrough: Set<number>
}

// 종 정의 객체마다(품종 무늬 사본은 따로), 뱅크마다
const compiled = new WeakMap<SpeciesDef, Map<number, Compiled>>()

function compile(species: SpeciesDef, bank: number): Compiled {
  let byBank = compiled.get(species)
  if (!byBank) { byBank = new Map(); compiled.set(species, byBank) }
  const done = byBank.get(bank)
  if (done) return done
  const base = Palette.bank(bank)
  const role = (name: Palette.RoleName) => base + Palette.Role[name]
  const code: Record<string, number> = {}
  for (const [ch, name] of Object.entries(species.sprite.codes)) code[ch] = role(name)
  const of = (s: BitmapSpec) => bitmap(s.ax, s.ay, s.rows, code)
  const b = species.sprite.bodies
  const out: Compiled = {
    species,
    bodies: { stand: of(b.stand), sit: of(b.sit), lie: of(b.lie), curlA: of(b.curlA), curlB: of(b.curlB), frontSit: of(b.frontSit), frontStand: of(b.frontStand) },
    face: of(species.sprite.heads.face),
    back: of(species.sprite.heads.back),
    role,
    seeThrough: new Set(species.sprite.seeThrough.map(role)),
  }
  byBank.set(bank, out)
  return out
}

export type Leg = { hipX: number; dx: number; lift: boolean; far: boolean; len: number }

export type { BodyKind } from '../species'

// 한 프레임에 그릴 동물 모습. pet/pose.ts 가 상태에서 만든다
export type PetPose = {
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

function stamp(bm: Bitmap, ox: number, oy: number, paint: Painter, flip: boolean, tilt = 0, tiltFrom = 0, tiltSpan = 1): void {
  for (let y = 0; y < bm.h; y++) {
    for (let x = 0; x < bm.w; x++) {
      const c = bm.px[y * bm.w + x]!
      if (c === TRANSPARENT) continue
      const lx = x - bm.ax + ox
      const drop = tilt === 0 ? 0 : Math.round((tilt * Math.max(0, lx - tiltFrom)) / tiltSpan)
      paint(flip ? -lx : lx, y - bm.ay + oy + drop, c)
    }
  }
}

// 비트맵 안 칸 (x, y) 를 덧칠한다
function mark(bm: Bitmap, ox: number, oy: number, x: number, y: number, c: number, flip: boolean, paint: Painter): void {
  const lx = ox + x - bm.ax
  paint(flip ? -lx : lx, oy + y - bm.ay, c)
}

// 눈을 감으면 아래 칸만 감은 눈 색 선으로 남긴다
function paintFace(k: Compiled, bm: Bitmap, ox: number, oy: number, pose: PetPose, flip: boolean, paint: Painter): void {
  if (pose.eyeClosed) {
    for (const [x, y] of bm.eyes) {
      const lower = bm.eyes.some(([ex, ey]) => ex === x && ey === y + 1)
      mark(bm, ox, oy, x, y, lower ? k.role('body') : k.role('lid'), flip, paint)
    }
  }
  if (!bm.mouth) return
  const [mx, my] = bm.mouth
  const tongue = k.role('tongue')
  if (pose.mouthOpen) {
    mark(bm, ox, oy, mx, my, tongue, flip, paint)
    mark(bm, ox, oy, mx, my + 1, tongue, flip, paint)
  } else if (pose.tongue) mark(bm, ox, oy, mx, my, tongue, flip, paint)
}

// 머리를 그리고 눈·입을 덧칠한다. (hx, hy) 는 머리 기준점(맨 아래 줄).
// 착지로 몸이 눌린 채 코를 박으면 머리가 바닥 아래로 내려가므로 맨 아래 줄을 y -1 에서 멈춘다
function paintHead(k: Compiled, pose: PetPose, hx: number, rawHy: number, paint: Painter): void {
  if (pose.head === 'none') return
  const head = pose.head === 'back' ? k.back : k.face
  const hy = Math.min(rawHy, -1)
  stamp(head, hx, hy, paint, pose.flip)
  paintFace(k, head, hx, hy, pose, pose.flip, paint)
}

// 다리: 가까운 다리는 뒤쪽 윤곽 한 줄 + 앞쪽 털 한 줄, 먼 다리는 옅은 두 줄
function paintLegs(k: Compiled, pose: PetPose, paint: Painter, far: boolean): void {
  const [edgeRole, fillRole] = far ? k.species.sprite.legs.far : k.species.sprite.legs.near
  const edge = k.role(edgeRole)
  const fill = k.role(fillRole)
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

// 꼬리: 선 한 줄, 끝 한 칸은 끝 역할 색. 아래로 흔들려도 바닥(y -1) 아래로 내려가지 않는다
function paintTail(k: Compiled, pose: PetPose, root: readonly [number, number], paint: Painter): void {
  if (pose.tailLen <= 0) return
  const { role, tipRole } = k.species.sprite.tail
  const rootX = root[0] + pose.bodyDx
  const rootY = root[1] + pose.bodyDy
  for (let i = 1; i <= pose.tailLen; i++) {
    const lx = Math.round(rootX - i * Math.cos(pose.tailAngle))
    const ly = Math.min(-1, Math.round(rootY - i * Math.sin(pose.tailAngle)))
    paint(pose.flip ? -lx : lx, ly, k.role(i === pose.tailLen ? tipRole : role))
  }
}

// 동물 한 마리를 칠한다. paint 는 이미 반전된 좌표를 받는다
export function paintPet(species: SpeciesDef, pose: PetPose, paint: Painter, bank = 0): void {
  const k = compile(species, bank)
  const a = species.sprite.anchors
  const bx = pose.bodyDx
  const by = pose.bodyDy
  switch (pose.body) {
    case 'stand': {
      const tilt = species.sprite.tilt
      if (!pose.back) paintTail(k, pose, a.stand.tail, paint)
      paintLegs(k, pose, paint, true)
      stamp(k.bodies.stand, bx, by, paint, pose.flip, pose.tilt, tilt.x0, tilt.span)
      paintLegs(k, pose, paint, false)
      paintHead(k, pose, a.stand.head[0] + bx + pose.headDx, a.stand.head[1] + by + pose.headDy + Math.round(pose.tilt), paint)
      if (pose.back) paintTail(k, pose, a.stand.tail, paint)
      return
    }
    case 'sit': {
      paintTail(k, pose, a.sit.tail, paint)
      stamp(k.bodies.sit, bx, by, paint, pose.flip)
      if (pose.scratch > 0) {
        // 뒷다리를 들어 귀 뒤를 긁는다
        const [edgeRole, fillRole] = species.sprite.legs.near
        for (let i = 0; i < 3; i++) {
          const lx = a.sit.scratch[0] + bx + i
          const ly = a.sit.scratch[1] + by - Math.round(pose.scratch * i / 2)
          paint(pose.flip ? -lx : lx, ly, k.role(edgeRole))
          paint(pose.flip ? -lx : lx, ly - 1, k.role(fillRole))
        }
      }
      paintHead(k, pose, a.sit.head[0] + bx + pose.headDx, a.sit.head[1] + by + pose.headDy, paint)
      return
    }
    case 'lie': {
      paintTail(k, pose, a.lie.tail, paint)
      stamp(k.bodies.lie, bx, by, paint, pose.flip)
      paintHead(k, pose, a.lie.head[0] + bx + pose.headDx, a.lie.head[1] + by + pose.headDy, paint)
      return
    }
    case 'curlA':
    case 'curlB': {
      stamp(k.bodies[pose.body], bx, by, paint, pose.flip)
      return
    }
    case 'frontSit':
    case 'frontStand': {
      const bm = k.bodies[pose.body]
      // 꼬리는 몸 뒤에서 옆으로 흔든다
      if (pose.tailLen > 0) {
        const side = Math.sin(pose.tailAngle) > 0 ? 1 : -1
        const ty = pose.body === 'frontSit' ? a.front.sitY : a.front.standY
        const { role, tipRole } = species.sprite.tail
        for (let i = 1; i <= 2; i++) paint((a.front.x + i) * side + bx, ty + by - (i === 2 ? 1 : 0), k.role(i === 2 ? tipRole : role))
      }
      stamp(bm, bx, by, paint, false)
      paintFace(k, bm, bx, by, pose, false, paint)
      return
    }
  }
}

// 버퍼에 동물을 그린다. 깊이가 앞선 타일 픽셀에 가려지고,
// 가려진 진한 픽셀은 가린 면 위에 한 칸 걸러 굵은 모눈선 색으로 비쳐 보여 블록 뒤에서도 어디 있는지 알 수 있다
export function drawPet(b: Buffer, species: SpeciesDef, pose: PetPose, x: number, y: number, depth: number, bank = 0): void {
  const seeThrough = compile(species, bank).seeThrough
  paintPet(species, pose, (px, py, c) => {
    const X = x + px
    const Y = y + py
    if (X < 0 || Y < 0 || X >= b.w || Y >= b.h) return
    const i = Y * b.w + X
    if (depth > b.depth[i]!) b.px[i] = c
    else if (seeThrough.has(c) && ((X + Y) & 1) === 0) b.px[i] = Palette.LINE_HEAVY
  }, bank)
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
