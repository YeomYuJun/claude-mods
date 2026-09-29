// 동물 도트 그림(순수 모듈). 종 정의(hooks/species)의 비트맵·기준점·다리·꼬리로 그린다.
// 오른쪽을 보는 모습으로 그리고 왼쪽은 좌우 반전한다.
//
// 몸통·머리·정면·웅크린 잠은 비트맵이고, 다리·꼬리는 매 프레임 선으로 그린다.
// 다리를 선으로 그리면 걸음 위상에 따라 발끝이 한 픽셀씩 앞뒤로 옮겨 가고 들리므로 속도와 상관없이 발이 바닥에 붙어 보인다.
// 비트맵 글자는 종이 정한 역할(윤곽, 몸, 눈 등)이고, 역할은 동물 뱅크 번호를 더해 팔레트 번호가 된다.
// 종·뱅크마다 한 번만 번호로 바꿔 두고 다시 쓴다.

import { Palette, plot, plotDepth, type Buffer } from '../pixel'
import { BASE_BODIES, EXTRA_BODIES, type BitmapSpec, type BodyKind, type SpeciesDef } from '../species'

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

// 종 하나를 뱅크 하나의 팔레트 번호로 바꾼 것. 종이 그리지 않는 몸·머리는 없다
type Compiled = {
  species: SpeciesDef
  bodies: Partial<Record<BodyKind, Bitmap>>
  face: Bitmap
  back: Bitmap
  alert?: Bitmap
  alertBack?: Bitmap
  droop?: Bitmap
  droopBack?: Bitmap
  tilt?: Bitmap
  role: (name: Palette.RoleName) => number
  seeThrough: Set<number>
}

// 종 정의 객체마다(품종 무늬 사본은 따로), 뱅크마다
const compiled = new WeakMap<SpeciesDef, Map<number, Compiled>>()

// 옆머리의 뒷모습: 눈(E)은 털(w)로, 코끝(k)과 입(M)은 윤곽(o)으로 바꾼다(뒷모습 머리 그림과 같은 규칙)
function backOf(s: BitmapSpec): BitmapSpec {
  const to: Readonly<Record<string, string>> = { E: 'w', k: 'o', M: 'o' }
  return { ...s, rows: s.rows.map(r => [...r].map(ch => to[ch] ?? ch).join('')) }
}

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
  const maybe = (s: BitmapSpec | undefined) => s === undefined ? undefined : of(s)
  const b: Readonly<Partial<Record<BodyKind, BitmapSpec>>> = species.sprite.bodies
  const h = species.sprite.heads
  const bodies: Partial<Record<BodyKind, Bitmap>> = {}
  for (const kind of [...BASE_BODIES, ...EXTRA_BODIES]) {
    const spec = b[kind]
    if (spec) bodies[kind] = of(spec)
  }
  const out: Compiled = {
    species,
    bodies,
    face: of(h.face),
    back: of(h.back),
    alert: maybe(h.alert),
    alertBack: maybe(h.alert && backOf(h.alert)),
    droop: maybe(h.droop),
    droopBack: maybe(h.droop && backOf(h.droop)),
    tilt: maybe(h.tilt),
    role,
    seeThrough: new Set(species.sprite.seeThrough.map(role)),
  }
  byBank.set(bank, out)
  return out
}

// 종이 그리지 않는 몸·머리를 찾으면 멈춘다(자세를 poseMap 으로 바꾸지 않은 것이다)
function need(bm: Bitmap | undefined, k: Compiled, what: string): Bitmap {
  if (!bm) throw new Error(`sprite: ${k.species.id} has no ${what}`)
  return bm
}

function bodyOf(k: Compiled, kind: BodyKind): Bitmap {
  return need(k.bodies[kind], k, kind)
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
  // 머리 모양: 옆모습이면 alert·droop 이 귀 모양을 바꾸고, 정면 몸이면 tilt 가 위 줄을 갸웃한 머리로 바꾼다
  headKind: 'plain' | 'alert' | 'droop' | 'tilt'
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

// fromRow: 이 줄부터 찍는다(정면 몸의 머리 줄을 갸웃한 머리로 바꿀 때)
function stamp(bm: Bitmap, ox: number, oy: number, paint: Painter, flip: boolean, tilt = 0, tiltFrom = 0, tiltSpan = 1, fromRow = 0): void {
  for (let y = fromRow; y < bm.h; y++) {
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

function headOf(k: Compiled, pose: PetPose): Bitmap {
  const back = pose.head === 'back'
  if (pose.headKind === 'alert') return need(back ? k.alertBack : k.alert, k, 'alert head')
  if (pose.headKind === 'droop') return need(back ? k.droopBack : k.droop, k, 'droop head')
  return back ? k.back : k.face
}

// 옆모습 몸의 머리 기준점(맨 아래 줄). 착지로 몸이 눌린 채 코를 박으면 머리가 바닥 아래로 내려가므로 맨 아래 줄을 y -1 에서 멈춘다
function headAt(species: SpeciesDef, pose: PetPose): readonly [number, number] | undefined {
  const a = species.sprite.anchors
  const at = pose.body === 'stand' ? a.stand.head : pose.body === 'sit' ? a.sit.head : pose.body === 'lie' ? a.lie.head : undefined
  if (!at) return undefined
  const drop = pose.body === 'stand' ? Math.round(pose.tilt) : 0
  return [at[0] + pose.bodyDx + pose.headDx, Math.min(at[1] + pose.bodyDy + pose.headDy + drop, -1)]
}

// 머리를 그리고 눈·입을 덧칠한다
function paintHead(k: Compiled, pose: PetPose, paint: Painter): void {
  if (pose.head === 'none') return
  const at = headAt(k.species, pose)
  if (!at) return
  const head = headOf(k, pose)
  stamp(head, at[0], at[1], paint, pose.flip)
  paintFace(k, head, at[0], at[1], pose, pose.flip, paint)
}

// 갸웃한 정면 머리를 정면 몸의 맨 위 줄에 맞춘다
function tiltOn(k: Compiled, body: Bitmap): Bitmap {
  return { ...need(k.tilt, k, 'tilt head'), ax: body.ax, ay: body.ay }
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
      stamp(bodyOf(k, 'stand'), bx, by, paint, pose.flip, pose.tilt, tilt.x0, tilt.span)
      paintLegs(k, pose, paint, false)
      paintHead(k, pose, paint)
      if (pose.back) paintTail(k, pose, a.stand.tail, paint)
      return
    }
    case 'sit': {
      paintTail(k, pose, a.sit.tail, paint)
      stamp(bodyOf(k, 'sit'), bx, by, paint, pose.flip)
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
      paintHead(k, pose, paint)
      return
    }
    case 'lie': {
      paintTail(k, pose, a.lie.tail, paint)
      stamp(bodyOf(k, 'lie'), bx, by, paint, pose.flip)
      paintHead(k, pose, paint)
      return
    }
    case 'curlA':
    case 'curlB': {
      stamp(bodyOf(k, pose.body), bx, by, paint, pose.flip)
      return
    }
    // 배를 보인 모습은 다리·머리·꼬리가 그림에 들어 있다
    case 'bellyA':
    case 'bellyB': {
      const bm = bodyOf(k, pose.body)
      stamp(bm, bx, by, paint, pose.flip)
      paintFace(k, bm, bx, by, pose, pose.flip, paint)
      return
    }
    case 'frontSit':
    case 'frontStand':
    case 'frontBeg': {
      const bm = bodyOf(k, pose.body)
      // 꼬리는 몸 뒤에서 옆으로 흔든다
      if (pose.tailLen > 0) {
        const side = Math.sin(pose.tailAngle) > 0 ? 1 : -1
        const ty = pose.body === 'frontStand' ? a.front.standY : a.front.sitY
        const { role, tipRole } = species.sprite.tail
        for (let i = 1; i <= 2; i++) paint((a.front.x + i) * side + bx, ty + by - (i === 2 ? 1 : 0), k.role(i === 2 ? tipRole : role))
      }
      if (pose.headKind === 'tilt') {
        const head = tiltOn(k, bm)
        stamp(bm, bx, by, paint, false, 0, 0, 1, head.h)
        stamp(head, bx, by, paint, false)
        paintFace(k, head, bx, by, pose, false, paint)
        return
      }
      stamp(bm, bx, by, paint, false)
      paintFace(k, bm, bx, by, pose, false, paint)
      return
    }
  }
}

// 입 칸(바닥 점 기준, 반전한 좌표). 물고 있는 공·나뭇가지를 여기에 그린다.
// 뒷모습은 입이 보이지 않아 옆머리의 입 자리를 쓰고 facing 이 false 다. 웅크려 자면 없다
export function mouthOf(species: SpeciesDef, pose: PetPose, bank = 0): { x: number; y: number; facing: boolean } | undefined {
  const k = compile(species, bank)
  const at = (bm: Bitmap, ox: number, oy: number, flip: boolean, facing: boolean) => {
    if (!bm.mouth) return undefined
    const lx = ox + bm.mouth[0] - bm.ax
    return { x: flip ? -lx : lx, y: oy + bm.mouth[1] - bm.ay, facing }
  }
  switch (pose.body) {
    case 'curlA':
    case 'curlB':
      return undefined
    case 'bellyA':
    case 'bellyB':
      return at(bodyOf(k, pose.body), pose.bodyDx, pose.bodyDy, pose.flip, true)
    case 'frontSit':
    case 'frontStand':
    case 'frontBeg': {
      const bm = bodyOf(k, pose.body)
      return at(pose.headKind === 'tilt' ? tiltOn(k, bm) : bm, pose.bodyDx, pose.bodyDy, false, true)
    }
    default: {
      const h = headAt(species, pose)
      if (!h || pose.head === 'none') return undefined
      return at(headOf(k, { ...pose, head: 'face' }), h[0], h[1], pose.flip, pose.head !== 'back')
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

// 동물 그림이 차지하는 상자(바닥 점 기준, 양 끝 포함). 키 큰 소품이 동물을 가릴 때 비울 범위를 정한다
export function boundsOf(species: SpeciesDef, pose: PetPose): { x0: number; y0: number; x1: number; y1: number } {
  let x0 = Infinity
  let y0 = Infinity
  let x1 = -Infinity
  let y1 = -Infinity
  paintPet(species, pose, (px, py) => {
    if (px < x0) x0 = px
    if (px > x1) x1 = px
    if (py < y0) y0 = py
    if (py > y1) y1 = py
  })
  return { x0, y0, x1, y1 }
}

// 작은 그림: 감정 표시, z, 공. 감정 표시는 동물 색을 빌리지 않고 효과 묶음의 고정 색으로 칠한다
const EMOTE_CODE: Record<string, number> = { o: Palette.EMOTE_INK, p: Palette.HEART, z: Palette.ZZZ }
const EMOTES: Record<string, Bitmap> = {
  '!': bitmap(0, 5, ['o', 'o', 'o', '.', 'o'], EMOTE_CODE),
  '?': bitmap(1, 5, ['oo.', '..o', '.o.', '...', '.o.'], EMOTE_CODE),
  heart: bitmap(2, 4, ['.p.p.', 'ppppp', '.ppp.', '..p..'], EMOTE_CODE),
  note: bitmap(1, 5, ['.oo', '.o.', '.o.', 'oo.', 'oo.'], EMOTE_CODE),
  z: bitmap(1, 2, ['zzz', '.z.', 'zzz'], EMOTE_CODE),
  // 생각 중 말줄임표, 짖는 소리
  dots: bitmap(2, 1, ['o.o.o'], EMOTE_CODE),
  bark: bitmap(2, 5, ['o...o', '.o.o.', '.....', 'oo.oo', '.....'], EMOTE_CODE),
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
