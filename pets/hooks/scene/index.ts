// 패널 한 장(순수 모듈): 맵, 소품, 그림자, 공, 강아지, 효과를 픽셀 버퍼에 그리고 셀로 접어 인코딩한다.
// 시뮬레이션은 고정 스텝으로 돌리고, 그리기는 지금 모습에 맞는 간격(renderEveryMs)으로만 한다.
// 경계 없는 월드는 장면을 만들 때 시작 칸 둘레 3 × 3 청크를 만들고, 그 뒤로는 틱마다 패널 크기에서 계산한
// 보이는 청크 + 한 겹 중 없는 것을 조금씩 만든다(prefetch). 패널이 붙거나 줌이 바뀔 때는 보이는 청크를 그 자리에서 다 만든다(ensureVisible).

import Biome, { type BiomeId } from '../biome'
import Iso, { type Camera, type Proj, type View } from '../iso'
import Names from '../names'
import Path from '../path'
import Pet, { type Pet as PetState, type TurnEnd } from '../pet'
import Pixel, { Palette, type Buffer, type Grid } from '../pixel'
import Prop from '../prop'
import Species, { type BreedId } from '../species'
import Sprite from '../sprite'
import World, { type World as WorldState } from '../world'

export type Scene = {
  seed: number
  world: WorldState
  cam: Camera
  pet: PetState
  // 맵 세트와 그 색 표(번호마다의 색과 그림자 사슬). 색 표는 세트·품종이 바뀔 때만 새로 만든다
  biome: BiomeId
  breed: BreedId
  theme: Palette.Theme
  // 고정 스텝에 못 미친 나머지 시간(ms)
  acc: number
  // 물 반짝임 위상과 마지막으로 바뀐 뒤 흐른 시뮬레이션 시간(ms)
  glint: { phase: number; ms: number }
  // 카메라가 앞서 보는 양(세계 픽셀). 강아지 화면 속도에 LEAD_S 를 곱해 부드럽게 따라간다
  lead: { x: number; y: number }
  prev: { sx: number; sy: number }
  // 붙은 크기가 바뀔 때만 새로 만든다
  buf?: Buffer
  grid?: Grid
  // 마지막 미리 만들기 때 본 A* 횟수(그 뒤 A* 가 돌았으면 이번 틱은 청크를 만들지 않는다)
  searches: number
  // 마지막으로 계산한 미리 만들 청크 목록과 그 계산의 열쇠(패널 크기·줌, 8 픽셀로 자른 화면 원점, 강아지 창)
  want?: { key: string; list: ChunkXY[]; visible: ChunkXY[]; ring: ChunkXY[] }
  // 사라질 구덩이 흔적을 다음에 거를 실제 시각
  expireAt: number
}

// 카메라는 발이 아니라 몸통 가운데(종마다 발에서 위로 lookUpPx)를 보고, 달리는 쪽을 조금 앞서 본다(가는 쪽 화면이 더 넓게 보인다)
const LEAD_S = 0.35
const LEAD_TAU_MS = 350
const LEAD_MAX_PX = 12

function focusOf(pet: PetState): { sx: number; sy: number } {
  const s = Iso.screenOf(pet.x, pet.y, pet.z)
  return { sx: s.sx, sy: s.sy - pet.species.sprite.lookUpPx }
}

// 세트의 맵(나무·바위를 둔다). 경계 없는 월드면 시작 칸 둘레 3 × 3 청크를 만든다
function worldOf(seed: number, biome: BiomeId): WorldState {
  const world = Biome.worldOf(biome, seed)
  const s = world.chunks
  if (s) {
    const cx = World.Chunks.chunkOf(world.spawn.x)
    const cy = World.Chunks.chunkOf(world.spawn.y)
    s.center = { cx, cy }
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) World.Chunks.make(s, cx + dx, cy + dy)
  }
  return world
}

export function create(seed: number, now: number, biome: BiomeId = Biome.DEFAULT, breed: BreedId = Species.DEFAULT_BREED): Scene {
  const world = worldOf(seed, biome)
  const pet = Pet.create(world, seed, now, Species.lookOf(breed))
  const f = focusOf(pet)
  return {
    seed, world, cam: Iso.cameraOf(f.sx, f.sy), pet, biome, breed, theme: Biome.themeOf(biome, Species.breedOf(breed).bank), acc: 0, glint: { phase: 0, ms: 0 }, lead: { x: 0, y: 0 }, prev: f,
    searches: Path.stats.searches, expireAt: now + EXPIRE_EVERY_MS,
  }
}

// 구덩이 흔적은 이 간격으로 거른다(실제 시각)
const EXPIRE_EVERY_MS = 60_000

// 패널 크기·줌의 버퍼 크기(픽셀)
function sizeOf(cols: number, rows: number, zoom: Zoom): { w: number; h: number } {
  return zoom === 2 ? { w: Math.ceil(cols / 2), h: rows } : { w: cols, h: rows * 2 }
}

type ChunkXY = [number, number]

// 화면 원점을 이 픽셀 단위로 잘라 목록을 다시 계산한다. 잘린 만큼 화면 상자를 넓혀 빠지는 청크가 없다
const WANT_SNAP = 8
// 미리 만들 청크: 보이는 청크(강아지가 선 청크 포함)와 그 둘레 한 겹(ring).
// 강아지 청크와 그 둘레 한 겹이 늘 들어 강아지 둘레 32 칸 이상이 덮이므로, 길 찾기 창(±16)과 행동 판정이 읽는 칸은 늘 캐시에 있다.
// 각각 강아지 청크에서 가까운 순(체비셰프 거리, 같으면 유클리드 거리, 같으면 좌표 순)
export function chunksFor(scene: Scene, cols: number, rows: number, zoom: Zoom): { visible: ChunkXY[]; ring: ChunkXY[] } {
  const proj = zoom === 'far' ? Iso.FAR : Iso.NEAR
  const { w, h } = sizeOf(cols, rows, zoom)
  const exact = Iso.viewOf(scene.cam, { w, h }, proj)
  const view = { ox: Math.floor(exact.ox / WANT_SNAP) * WANT_SNAP, oy: Math.floor(exact.oy / WANT_SNAP) * WANT_SNAP }
  const visible = Iso.visibleChunks(w + WANT_SNAP, h + WANT_SNAP, view, proj, World.MAX_HEIGHT, World.Chunks.SIZE)
  const K = World.Chunks.keyOf
  const seen = new Set(visible.map(([x, y]) => K(x, y)))
  const cx = World.Chunks.chunkOf(Math.round(scene.pet.x))
  const cy = World.Chunks.chunkOf(Math.round(scene.pet.y))
  if (!seen.has(K(cx, cy))) {
    seen.add(K(cx, cy))
    visible.push([cx, cy])
  }
  const ring: ChunkXY[] = []
  for (const [x, y] of visible) {
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const key = K(x + dx, y + dy)
        if (seen.has(key)) continue
        seen.add(key)
        ring.push([x + dx, y + dy])
      }
    }
  }
  const order = (a: ChunkXY, b: ChunkXY) => {
    const da = Math.max(Math.abs(a[0] - cx), Math.abs(a[1] - cy))
    const db = Math.max(Math.abs(b[0] - cx), Math.abs(b[1] - cy))
    if (da !== db) return da - db
    const ea = (a[0] - cx) * (a[0] - cx) + (a[1] - cy) * (a[1] - cy)
    const eb = (b[0] - cx) * (b[0] - cx) + (b[1] - cy) * (b[1] - cy)
    return ea !== eb ? ea - eb : a[1] !== b[1] ? a[1] - b[1] : a[0] - b[0]
  }
  return { visible: visible.sort(order), ring: ring.sort(order) }
}

// 캐시 기준(강아지 청크)과 버리지 않을 청크(보이는 청크 + 한 겹), 상한(그 수와 25 중 큰 값)을 맞춘다
function aim(scene: Scene, want: { visible: ChunkXY[]; ring: ChunkXY[] }): void {
  const s = scene.world.chunks!
  const keep = new Set<number>()
  for (const [x, y] of [...want.visible, ...want.ring]) keep.add(World.Chunks.keyOf(x, y))
  s.keep = keep
  s.cap = Math.max(World.Chunks.CAP_MIN, keep.size)
  s.center = { cx: World.Chunks.chunkOf(Math.round(scene.pet.x)), cy: World.Chunks.chunkOf(Math.round(scene.pet.y)) }
}

// 미리 만들 목록. 패널 크기·줌·잘린 화면 원점·강아지 청크가 그대로면 지난 계산을 쓴다
function wantOf(scene: Scene, cols: number, rows: number, zoom: Zoom): { list: ChunkXY[]; visible: ChunkXY[]; ring: ChunkXY[] } {
  const proj = zoom === 'far' ? Iso.FAR : Iso.NEAR
  const { w, h } = sizeOf(cols, rows, zoom)
  const v = Iso.viewOf(scene.cam, { w, h }, proj)
  const C = World.Chunks
  const key = [cols, rows, zoom, Math.floor(v.ox / WANT_SNAP), Math.floor(v.oy / WANT_SNAP), C.chunkOf(Math.round(scene.pet.x)), C.chunkOf(Math.round(scene.pet.y))].join(',')
  if (scene.want?.key === key) return scene.want
  const got = chunksFor(scene, cols, rows, zoom)
  scene.want = { key, list: [...got.visible, ...got.ring], ...got }
  aim(scene, got)
  return scene.want
}

// 한 틱의 미리 만들기. 지난 미리 만들기 뒤 A* 가 돌았으면 건너뛴다(한 틱에 둘 중 하나만). 한 일의 점을 돌려준다
export function prefetch(scene: Scene, cols: number, rows: number, zoom: Zoom): number {
  const s = scene.world.chunks
  if (!s) return 0
  const want = wantOf(scene, cols, rows, zoom)
  const searches = Path.stats.searches
  if (searches !== scene.searches) {
    scene.searches = searches
    return 0
  }
  return World.Chunks.pump(s, want.list)
}

// 보이는 청크를 모두 그 자리에서 만든다(패널이 붙을 때, 줌이 바뀔 때). 만든 청크 수를 돌려준다
export function ensureVisible(scene: Scene, cols: number, rows: number, zoom: Zoom): number {
  const s = scene.world.chunks
  if (!s) return 0
  const want = wantOf(scene, cols, rows, zoom)
  let n = 0
  for (const [x, y] of want.visible) {
    if (World.Chunks.has(s, x, y)) continue
    World.Chunks.make(s, x, y)
    n++
  }
  return n
}

// 세트를 바꾼다: 그 세트의 맵을 새로 만들고 강아지를 새 시작 칸에 둔다. 대기열·길·방문 기록은 옛 맵 것이라 버리고,
// 기운·들뜸·욕구, 신호 시각, 돌고 있는 도구·턴은 이어 간다(도구가 도는 중이면 계속 잠들지 않고 기다리러 온다). 목마름은 새 맵에서 물가를 다시 판정해
// 16 걸음 안에 물가가 없으면 0 이 된다. 카메라는 강아지로 옮긴다
export function setBiome(scene: Scene, biome: BiomeId, now: number): void {
  const old = scene.pet
  scene.biome = biome
  scene.theme = Biome.themeOf(biome, Species.breedOf(scene.breed).bank)
  scene.world = worldOf(scene.seed, biome)
  scene.want = undefined
  const pet = Pet.create(scene.world, scene.seed, now, old.species)
  pet.energy = old.energy
  pet.excite = old.excite
  pet.needs = { ...old.needs }
  pet.lastSignalAt = old.lastSignalAt
  pet.lastHumanAt = old.lastHumanAt
  pet.toolsRunning = old.toolsRunning
  pet.mainTools = old.mainTools
  pet.toolSince = old.toolSince
  pet.turnStartedAt = old.turnStartedAt
  scene.pet = pet
  const f = focusOf(pet)
  scene.cam = Iso.cameraOf(f.sx, f.sy)
  scene.lead = { x: 0, y: 0 }
  scene.prev = f
}

// 품종을 바꾼다. 색과 무늬만 바뀌고 강아지의 자리·행동은 그대로다
export function setBreed(scene: Scene, breed: BreedId): void {
  scene.breed = breed
  scene.pet.species = Species.lookOf(breed)
  scene.theme = Biome.themeOf(scene.biome, Species.breedOf(breed).bank)
}

// 물 반짝임은 화면이 어차피 매 프레임 바뀌는 동안(움직임·효과가 있음)에는 GLINT_BUSY_MS 마다, 가만히 있을 때는 GLINT_IDLE_MS 마다만 옮긴다.
// 가만히 있을 때 반짝임 때문에 더 보내는 프레임은 초당 1000 / GLINT_IDLE_MS 번 이하다. 자는 동안은 멈춘다
export const GLINT_BUSY_MS = 600
export const GLINT_IDLE_MS = 1200

function stepGlint(scene: Scene): void {
  const g = scene.glint
  if (scene.pet.isAsleep) return
  g.ms += Names.SIM_STEP_MS
  if (g.ms >= (renderEveryMs(scene) === Names.FRAME_MS ? GLINT_BUSY_MS : GLINT_IDLE_MS)) {
    g.phase = (g.phase + 1) & 1023
    g.ms = 0
  }
}

// 실제로 흐른 시간(상한 MAX_CATCHUP_MS)을 고정 스텝으로 잘라 돌린다
export function step(scene: Scene, dtMs: number, now: number): void {
  scene.acc += Math.min(Names.MAX_CATCHUP_MS, Math.max(0, dtMs))
  while (scene.acc >= Names.SIM_STEP_MS) {
    scene.acc -= Names.SIM_STEP_MS
    Pet.update(scene.pet, scene.world, Names.SIM_STEP_MS, now)
    const f = focusOf(scene.pet)
    const dt = Names.SIM_STEP_MS / 1000
    const clamp = (v: number) => Math.max(-LEAD_MAX_PX, Math.min(LEAD_MAX_PX, v))
    // 홉의 수직 움직임은 앞서 보지 않는다
    const vx = (f.sx - scene.prev.sx) / dt
    const vy = scene.pet.hop ? 0 : (f.sy - scene.prev.sy) / dt
    const k = 1 - Math.exp(-Names.SIM_STEP_MS / LEAD_TAU_MS)
    scene.lead.x += (clamp(vx * LEAD_S) - scene.lead.x) * k
    scene.lead.y += (clamp(vy * LEAD_S) - scene.lead.y) * k
    scene.prev = f
    Iso.follow(scene.cam, f.sx + scene.lead.x, f.sy + scene.lead.y, Names.SIM_STEP_MS)
    stepGlint(scene)
  }
  if (now >= scene.expireAt) {
    scene.expireAt = now + EXPIRE_EVERY_MS
    World.expireEdits(scene.world, now)
  }
}

// 다음 그리기까지 간격: 움직이는 것이 있으면 매 프레임, 가만히 있으면 꼬리·숨만 보이게 드물게
export function renderEveryMs(scene: Scene): number {
  const p = scene.pet
  // 자는 동안 떠오르는 z 는 느리게 움직여 드물게 그려도 된다
  if (p.pose === 'sleep' && !Pet.isMoving(p) && scene.cam.isSettled && p.particles.every(q => q.kind === 'z')) return 150
  if (Pet.isMoving(p) || p.particles.length > 0 || p.emote || !scene.cam.isSettled || Pet.Ball.isRolling(p.ball) || p.turnMs > 0 || p.landMs > 0) return Names.FRAME_MS
  if (p.pose === 'dig' || p.pose === 'shake' || p.pose === 'scratch' || p.pose === 'pant' || p.act.steps[p.act.i]?.k === 'spin') return Names.FRAME_MS
  return 66
}

// 보기 단계: 원거리(8 × 4 타일, 도트 1 배) · 1 배 · 2 배(논리 픽셀 하나 = 2 열 × 1 행)
export type Zoom = 'far' | 1 | 2
export const ZOOMS: readonly Zoom[] = ['far', 1, 2]

// 저장된 값을 읽는다. 원거리가 생기기 전에 저장한 1·2 도 그대로 읽힌다
export function zoomOf(value: unknown): Zoom {
  return value === 'far' ? 'far' : value === 2 ? 2 : 1
}

// 한 단계 안(+1)·밖(-1)으로. 끝에서는 그대로 둔다
export function zoomBy(zoom: Zoom, delta: 1 | -1): Zoom {
  const i = ZOOMS.indexOf(zoom) + delta
  return ZOOMS[Math.max(0, Math.min(ZOOMS.length - 1, i))]!
}

// 원거리 → 1 배 → 2 배 → 원거리
export function zoomNext(zoom: Zoom): Zoom {
  return ZOOMS[(ZOOMS.indexOf(zoom) + 1) % ZOOMS.length]!
}

function buffersFor(scene: Scene, cols: number, rows: number, scale: 1 | 2): [Buffer, Grid] {
  const b = scene.buf
  const g = scene.grid
  if (b && g && g.cols === cols && g.rows === rows && b.scale === scale) return [b, g]
  const nb = Pixel.bufferOf(cols, rows, scale)
  const ng = Pixel.gridOf(cols, rows)
  scene.buf = nb
  scene.grid = ng
  return [nb, ng]
}

// 시뮬레이션 값은 NEAR 픽셀이다. 위치는 투영으로 옮기고, 동물·공·감정 표시·그림자 크기는 스프라이트 픽셀 그대로 둔다
// (원거리에서도 스프라이트를 원래 크기로 그린다)
function drawPet(b: Buffer, scene: Scene, view: View, proj: Proj): void {
  const { ox, oy } = view
  const dz = view.dz ?? 0
  const p = scene.pet
  const world = scene.world
  const shadowOf = scene.theme.shadowOf
  const s = Iso.screenOf(p.x, p.y, p.z, proj)
  const x = Math.round(s.sx) - ox
  const y = Math.round(s.sy) - oy
  // 그림자는 땅(물이면 수면)에 붙어 있고, 높이 뛸수록 작아진다
  const tx = Math.round(p.x)
  const ty = Math.round(p.y)
  const groundZ = World.walkHeightAt(world, tx, ty) * Names.STEP_PX
  const g = Iso.screenOf(p.x, p.y, groundZ, proj)
  const lift = Math.max(0, p.z - World.standZ(world, tx, ty))
  const curled = p.pose === 'sleep' && !Pet.isMoving(p)
  const sprite = p.species.sprite
  Iso.drawShadow(b, g.sx - ox + 0.5, g.sy - oy - 0.5, Math.max(2.5, (curled ? sprite.shadow.rxCurl : sprite.shadow.rx) - lift * 0.3), sprite.shadow.ry, World.walkHeightAt(world, tx, ty) + 1, shadowOf)
  // 공과 공 그림자. 공의 청크가 캐시에 없으면(강아지가 멀리 두고 온 공) 화면 밖이라 그리지 않는다
  const ball = p.ball
  const bt = Pet.Ball.tileOf(ball)
  const pose = Pet.poseOf(p)
  const depth = p.x + p.y + 0.4 - dz
  const mouth = Sprite.mouthOf(p.species, pose)
  // 문 공은 입 칸에 그린다(아래). 입 칸이 없는 모습(웅크린 잠)이면 공의 자리에 그대로 둔다
  const inMouth = p.carrying && mouth !== undefined
  if (!inMouth && World.isLoaded(world, bt.x, bt.y)) {
    const bg = Iso.screenOf(ball.x, ball.y, World.walkHeightAt(world, bt.x, bt.y) * Names.STEP_PX, proj)
    Iso.drawShadow(b, bg.sx - ox + 0.5, bg.sy - oy - 0.5, 2, 1, World.walkHeightAt(world, bt.x, bt.y) + 1, shadowOf)
    const bs = Iso.screenOf(ball.x, ball.y, ball.z, proj)
    Sprite.drawBall(b, Math.round(bs.sx) - ox, Math.round(bs.sy) - oy, ball.roll, ball.x + ball.y + 0.25 - dz)
  }
  // 문 공·나뭇가지는 머리 그림의 입 칸에 찍는다. 얼굴이 보이면 강아지 다음에 그려 머리 앞에 오고,
  // 뒷모습이면 먼저 그려 머리에 가린다(강아지 그림은 깊이를 쓰지 않는다). 공은 입 칸에서 보는 쪽으로 한 칸 나가 가운데가 입 칸 줄에 온다
  const drawHeld = () => {
    if (!mouth) return
    const held = depth + (mouth.facing ? 0.01 : -0.01)
    if (inMouth) Sprite.drawBall(b, x + mouth.x + (pose.flip ? -1 : 1), y + mouth.y + 2, ball.roll, held)
    if (p.holding) Prop.drawHeldBranch(b, x + mouth.x, y + mouth.y, held)
  }
  if (mouth && !mouth.facing) drawHeld()
  Sprite.drawPet(b, p.species, pose, x, y, depth)
  if (mouth?.facing) drawHeld()
  // 흙·물방울·물보라·z 는 강아지가 멈춰 있을 때만 생겨 강아지 기준 오프셋을 그대로 둔다.
  // 먼지는 달리거나 내려앉은 자리에 남으므로 카메라와 같은 비율로 옮긴다
  const near = Iso.screenOf(p.x, p.y, p.z)
  for (const q of p.particles) {
    const m = q.kind === 'dust' ? Iso.mapOf(q.x, q.y, proj) : { sx: s.sx + q.x - near.sx, sy: s.sy + q.y - near.sy }
    const px = Math.round(m.sx) - ox
    const py = Math.round(m.sy) - oy
    if (q.kind === 'z') Sprite.drawEmote(b, 'z', px, py)
    else Pixel.plot(b, px, py, q.kind === 'dirt' ? Palette.DIRT : q.kind === 'splash' ? Palette.SPLASH : Palette.DUST)
  }
  if (p.emote) {
    // 떠오르며 나타났다가 제자리에서 머문다
    const rise = Math.max(0, 3 - Math.floor(p.emote.age / 50))
    const side = Pet.isRight(p.dir) ? sprite.emoteAt.side : -sprite.emoteAt.side
    const front = pose.body.startsWith('front')
    Sprite.drawEmote(b, p.emote.kind, x + (front ? 0 : side), y - sprite.emoteAt.up + rise)
  }
}

// 지형과 소품. 키 큰 소품은 동물 화면 상자 안에서 동물보다 앞이면 한 칸 걸러 비운다
export function drawGround(b: Buffer, scene: Scene, view: View, proj: Proj): void {
  Iso.drawWorld(b, scene.world, view, proj, scene.theme, scene.glint.phase)
  const p = scene.pet
  const s = Iso.screenOf(p.x, p.y, p.z, proj)
  const x = Math.round(s.sx) - view.ox
  const y = Math.round(s.sy) - view.oy
  const box = Sprite.boundsOf(p.species, Pet.poseOf(p))
  Prop.drawProps(b, scene.world, view, proj, { x0: x + box.x0, y0: y + box.y0, x1: x + box.x1, y1: y + box.y1, depth: p.x + p.y + 0.4 - (view.dz ?? 0) })
}

export function compose(scene: Scene, cols: number, rows: number, zoom: Zoom): string {
  const proj = zoom === 'far' ? Iso.FAR : Iso.NEAR
  const [b, g] = buffersFor(scene, cols, rows, zoom === 2 ? 2 : 1)
  Pixel.clear(b)
  const view = Iso.viewOf(scene.cam, b, proj)
  drawGround(b, scene, view, proj)
  drawPet(b, scene, view, proj)
  Pixel.fold(b, g, scene.theme.rgb)
  return Pixel.encode(g)
}

export function onTurnStart(scene: Scene, now: number, text?: string): void {
  Pet.onTurnStart(scene.pet, scene.world, now, text)
}

export function onTool(scene: Scene, now: number, tool?: string): void {
  Pet.onTool(scene.pet, scene.world, now, tool)
}

export function onTurnEnd(scene: Scene, now: number, reason?: TurnEnd, durationMs?: number): void {
  Pet.onTurnEnd(scene.pet, scene.world, now, reason, durationMs)
}

export * as default from '.'
