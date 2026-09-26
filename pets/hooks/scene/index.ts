// 패널 한 장(순수 모듈): 맵, 그림자, 공, 강아지, 효과를 픽셀 버퍼에 그리고 셀로 접어 인코딩한다.
// 시뮬레이션은 고정 스텝으로 돌리고, 그리기는 지금 모습에 맞는 간격(renderEveryMs)으로만 한다.

import Iso, { type Camera, type Proj } from '../iso'
import Names from '../names'
import Pet, { type Pet as PetState, type TurnEnd } from '../pet'
import Pixel, { Palette, type Buffer, type Grid } from '../pixel'
import Sprite from '../sprite'
import World, { type World as WorldState } from '../world'

export type Scene = {
  world: WorldState
  cam: Camera
  pet: PetState
  // 번호마다의 색과 그림자 사슬. 세트·품종이 바뀔 때만 새로 만든다
  theme: Palette.Theme
  // 고정 스텝에 못 미친 나머지 시간(ms)
  acc: number
  // 카메라가 앞서 보는 양(세계 픽셀). 강아지 화면 속도에 LEAD_S 를 곱해 부드럽게 따라간다
  lead: { x: number; y: number }
  prev: { sx: number; sy: number }
  // 붙은 크기가 바뀔 때만 새로 만든다
  buf?: Buffer
  grid?: Grid
}

// 카메라는 발이 아니라 몸통 가운데(종마다 발에서 위로 lookUpPx)를 보고, 달리는 쪽을 조금 앞서 본다(가는 쪽 화면이 더 넓게 보인다)
const LEAD_S = 0.35
const LEAD_TAU_MS = 350
const LEAD_MAX_PX = 12

function focusOf(pet: PetState): { sx: number; sy: number } {
  const s = Iso.screenOf(pet.x, pet.y, pet.z)
  return { sx: s.sx, sy: s.sy - pet.species.sprite.lookUpPx }
}

export function create(seed: number, now: number): Scene {
  const world = World.create(seed)
  const pet = Pet.create(world, seed, now)
  const f = focusOf(pet)
  return { world, cam: Iso.cameraOf(f.sx, f.sy), pet, theme: Palette.PAPER_THEME, acc: 0, lead: { x: 0, y: 0 }, prev: f }
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
function drawPet(b: Buffer, scene: Scene, ox: number, oy: number, proj: Proj): void {
  const p = scene.pet
  const world = scene.world
  const shadowOf = scene.theme.shadowOf
  const s = Iso.screenOf(p.x, p.y, p.z, proj)
  const x = Math.round(s.sx) - ox
  const y = Math.round(s.sy) - oy
  // 그림자는 땅에 붙어 있고, 높이 뛸수록 작아진다
  const tx = Math.round(p.x)
  const ty = Math.round(p.y)
  const groundZ = World.heightAt(world, tx, ty) * Names.STEP_PX
  const g = Iso.screenOf(p.x, p.y, groundZ, proj)
  const lift = Math.max(0, p.z - groundZ)
  const curled = p.pose === 'sleep' && !Pet.isMoving(p)
  const sprite = p.species.sprite
  Iso.drawShadow(b, g.sx - ox + 0.5, g.sy - oy - 0.5, Math.max(2.5, (curled ? sprite.shadow.rxCurl : sprite.shadow.rx) - lift * 0.3), sprite.shadow.ry, World.heightAt(world, tx, ty) + 1, shadowOf)
  // 공과 공 그림자
  const ball = p.ball
  const bt = Pet.Ball.tileOf(ball)
  const bg = Iso.screenOf(ball.x, ball.y, World.heightAt(world, bt.x, bt.y) * Names.STEP_PX, proj)
  Iso.drawShadow(b, bg.sx - ox + 0.5, bg.sy - oy - 0.5, 2, 1, World.heightAt(world, bt.x, bt.y) + 1, shadowOf)
  const bs = Iso.screenOf(ball.x, ball.y, ball.z, proj)
  Sprite.drawBall(b, Math.round(bs.sx) - ox, Math.round(bs.sy) - oy, ball.roll, ball.x + ball.y + 0.25)
  Sprite.drawPet(b, p.species, Pet.poseOf(p), x, y, p.x + p.y + 0.4)
  // 흙·물방울·z 는 강아지가 멈춰 있을 때만 생겨 강아지 기준 오프셋을 그대로 둔다.
  // 먼지는 달리거나 내려앉은 자리에 남으므로 카메라와 같은 비율로 옮긴다
  const near = Iso.screenOf(p.x, p.y, p.z)
  for (const q of p.particles) {
    const m = q.kind === 'dust' ? Iso.mapOf(q.x, q.y, proj) : { sx: s.sx + q.x - near.sx, sy: s.sy + q.y - near.sy }
    const px = Math.round(m.sx) - ox
    const py = Math.round(m.sy) - oy
    if (q.kind === 'z') Sprite.drawEmote(b, 'z', px, py)
    else Pixel.plot(b, px, py, q.kind === 'dirt' ? Palette.DIRT : Palette.DUST)
  }
  if (p.emote) {
    // 떠오르며 나타났다가 제자리에서 머문다
    const rise = Math.max(0, 3 - Math.floor(p.emote.age / 50))
    const side = Pet.isRight(p.dir) ? sprite.emoteAt.side : -sprite.emoteAt.side
    const front = Pet.poseOf(p).body.startsWith('front')
    Sprite.drawEmote(b, p.emote.kind, x + (front ? 0 : side), y - sprite.emoteAt.up + rise)
  }
}

export function compose(scene: Scene, cols: number, rows: number, zoom: Zoom): string {
  const proj = zoom === 'far' ? Iso.FAR : Iso.NEAR
  const [b, g] = buffersFor(scene, cols, rows, zoom === 2 ? 2 : 1)
  Pixel.clear(b)
  const view = Iso.viewOf(scene.cam, b, proj)
  Iso.drawWorld(b, scene.world, view, proj, scene.theme)
  drawPet(b, scene, view.ox, view.oy, proj)
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
