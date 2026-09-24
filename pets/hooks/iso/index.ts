// 아이소메트릭 투영, 타일 그리기, 카메라(순수 모듈).
//
// 좌표: 타일 (x, y) 의 가운데가 세계 좌표 (x, y). z 는 시뮬레이션 픽셀 높이(한 단 = Names.STEP_PX).
// 투영(Proj)은 타일 반폭 hw, 반높이 hh, 한 단 높이 step 으로 정한다.
// 화면 sx = (fx - fy) × hw, sy = (fx + fy) × hh + hh - z × step / STEP_PX. 타일의 위 꼭짓점은 (x - y) × hw, (x + y) × hh - 높이.
// 시뮬레이션(공, 움직임, 효과, 카메라)은 NEAR(12 × 6, 한 단 4) 픽셀로 돈다. 원거리 줌은 그릴 때만 FAR 로 옮긴다.
// 깊이: 같은 화면 픽셀에 겹치는 두 점은 시선 방향 (1, 1, 2hh × STEP_PX / step) 만큼만 다르므로 어느 투영이든 fx + fy 가 클수록 앞이다.
// 타일은 x + y 대각선 순서로(뒤에서 앞으로) 덮어 그리며 픽셀마다 깊이를 남기고,
// 강아지·공은 그 깊이와 비교해 그린다. 그래서 앞쪽 블록이 강아지를 픽셀 단위로 가린다.

import Names from '../names'
import { Palette, SURF_SIDE, SURF_TOP, type Buffer } from '../pixel'
import World, { type World as WorldState } from '../world'

// edge: 뒤 두 변(1 = NW, 2 = NE)에 걸린 선 픽셀. front: 앞 두 변(1 = SW, 2 = SE)에 걸린 픽셀.
// nw·ne: NW·NE 변에서 떨어진 거리. 칸 폭을 2hh 로 잰다(칸 가운데가 hh). 더 높은 뒤 이웃의 그늘 폭을 재는 데 쓴다
export type TopPixel = { dx: number; dy: number; edge: 0 | 1 | 2; front: 0 | 1 | 2; nw: number; ne: number; depth: number }
export type FaceColumn = { dx: number; start: number; depth: number }

export type Proj = {
  hw: number
  hh: number
  // 한 단 높이와 맵 밑판 두께(픽셀)
  step: number
  base: number
  // 모눈선은 좌표가 이 수의 배수인 변에만 긋는다(1 이면 모든 변)
  lineEvery: number
  // 옆면에 단마다 가로 줄을 긋는다. 한 단이 3 픽셀 미만이면 줄이 면을 덮어 끈다
  isStriped: boolean
  tops: readonly TopPixel[]
  left: readonly FaceColumn[]
  right: readonly FaceColumn[]
}

// 다이아몬드 윗면: 픽셀 가운데 (a, b) 가 |a|/hw + |b|/hh < 1 인 곳. 경계에 걸리는 픽셀이 없어 이웃 타일과 빈틈·겹침 없이 맞물린다.
// 위쪽 두 변(NW·NE)만 선으로 그려 이웃과 공유하는 선이 한 번만 그려진다
function projOf(hw: number, hh: number, step: number, base: number, lineEvery: number): Proj {
  const tops: TopPixel[] = []
  const left: FaceColumn[] = []
  const right: FaceColumn[] = []
  for (let dy = 0; dy < 2 * hh; dy++) {
    for (let dx = -hw; dx < hw; dx++) {
      const a = dx + 0.5
      const b = dy + 0.5 - hh
      const v = Math.abs(a) + (hw / hh) * Math.abs(b)
      if (v >= hw) continue
      const rim = v >= hw - 1.5
      const edge = b < 0 && rim ? (a < 0 ? 1 : 2) : 0
      const front = b > 0 && rim ? (a < 0 ? 1 : 2) : 0
      // 타일 안 좌표 u = fx - x, w = fy - y (-0.5 ~ 0.5). NW 변은 u = -0.5, NE 변은 w = -0.5
      const u = (a / hw + b / hh) / 2
      const w = (b / hh - a / hw) / 2
      tops.push({ dx, dy, edge, front, nw: (u + 0.5) * 2 * hh, ne: (w + 0.5) * 2 * hh, depth: b / hh })
    }
  }
  // 옆면은 반 폭을 다 덮는다(꼭짓점 열은 윗면 픽셀이 없어도 옆면은 있다).
  // 열마다 윗면 아래 변 y = hh + hh(1 - |a|/hw) 보다 가운데가 아래인 첫 행부터 시작한다
  for (let dx = -hw; dx < hw; dx++) {
    const a = dx + 0.5
    const start = Math.ceil(hh + hh * (1 - Math.abs(a) / hw) - 0.5)
    // 왼쪽 면은 fy = y + 0.5 평면, 오른쪽 면은 fx = x + 0.5 평면
    if (dx < 0) left.push({ dx, start, depth: 1 + a / hw })
    else right.push({ dx, start, depth: 1 - a / hw })
  }
  return { hw, hh, step, base, lineEvery, isStriped: step >= 3, tops, left, right }
}

export const NEAR = projOf(Names.TILE_W / 2, Names.TILE_H / 2, Names.STEP_PX, Names.BASE_PX, 1)
export const FAR = projOf(Names.FAR_TILE_W / 2, Names.FAR_TILE_H / 2, Names.FAR_STEP_PX, Names.FAR_BASE_PX, Names.FAR_LINE_EVERY)

// z 는 시뮬레이션 픽셀(NEAR 한 단 = STEP_PX)이다. 다른 투영에서는 단 수로 바꿔 그 투영의 단 높이를 곱한다
export function screenOf(fx: number, fy: number, z: number, proj: Proj = NEAR): { sx: number; sy: number } {
  return { sx: (fx - fy) * proj.hw, sy: (fx + fy) * proj.hh + proj.hh - (z * proj.step) / Names.STEP_PX }
}

// NEAR 화면 픽셀(카메라, 먼지처럼 세계에 머무는 효과)을 다른 투영의 화면 픽셀로 옮긴다.
// 가로는 정확하고, 세로는 높이 z 에서 z × (hh 비 - step 비) 만큼 어긋난다(FAR 에서 4 단 위 1.3 픽셀)
export function mapOf(sx: number, sy: number, proj: Proj): { sx: number; sy: number } {
  return { sx: (sx * proj.hw) / NEAR.hw, sy: (sy * proj.hh) / NEAR.hh }
}

export type View = {
  // 버퍼 픽셀 (0, 0) 에 놓이는 세계 픽셀
  ox: number
  oy: number
}

// 지금 맵은 지표 종류 하나(0)와 옆면 재질 하나(0)만 쓴다
const KIND = Palette.kind(0)
const SIDE = Palette.material(0)
// 높이별 윗면: 높을수록 밝다. 앞 모서리 하이라이트는 두 단 위 윗면 색을 빌린다(맨 위 두 단은 HILITE)
const T = Palette.Top
const TOP_OF: readonly number[] = [KIND + T.TOP0, KIND + T.TOP1, KIND + T.TOP2, KIND + T.TOP3, KIND + T.TOP4]
const HI_OF: readonly number[] = [KIND + T.TOP2, KIND + T.TOP3, KIND + T.TOP4, KIND + T.HILITE, KIND + T.HILITE]
const LINE = KIND + T.LINE
// 더 높은 NW 이웃이 드리우는 그늘의 폭(칸 폭 비율): 높이 차 한 단에 절반, 두 단 이상이면 칸 전체
const CAST_PER_STEP = 0.5
const CAST_MAX = 1
// 더 높은 NE 이웃 벽 밑의 접촉 그늘 폭(nw·ne 와 같은 단위). 변의 선 픽셀과 그 안쪽 한 줄 정도가 어두워진다
const CONTACT_PX = 1.5

// 한 타일. 옆면은 앞 이웃보다 높은 만큼만(맵 가장자리면 밑판까지) 그린다
function drawTile(b: Buffer, world: WorldState, x: number, y: number, view: View, proj: Proj, shadowOf: readonly number[]): void {
  const hgt = World.heightAt(world, x, y)
  const z = hgt * proj.step
  const tx = (x - y) * proj.hw - view.ox
  const ty = (x + y) * proj.hh - z - view.oy
  const base = x + y
  const isEdgeLeft = y + 1 >= world.h
  const isEdgeRight = x + 1 >= world.w
  const frontLeft = isEdgeLeft ? z + proj.base : (hgt - World.heightAt(world, x, y + 1)) * proj.step
  const frontRight = isEdgeRight ? z + proj.base : (hgt - World.heightAt(world, x + 1, y)) * proj.step
  const w = b.w
  if (frontLeft > 0) face(b, proj.left, tx, ty, frontLeft, base, SIDE + Palette.Side.SIDE_L, SIDE + Palette.Side.L_STEP, isEdgeLeft, proj, w)
  if (frontRight > 0) face(b, proj.right, tx, ty, frontRight, base, SIDE + Palette.Side.SIDE_R, SIDE + Palette.Side.R_STEP, isEdgeRight, proj, w)
  const top = TOP_OF[hgt] ?? TOP_OF[4]!
  const hi = HI_OF[hgt] ?? HI_OF[4]!
  const every = proj.lineEvery
  const lineNW = x % every !== 0 ? 0 : x % 3 === 0 ? Palette.LINE_HEAVY : LINE
  const lineNE = y % every !== 0 ? 0 : y % 3 === 0 ? Palette.LINE_HEAVY : LINE
  // 빛은 왼쪽 앞(+y 쪽)에서 온다(왼쪽 면이 밝고 오른쪽 면이 어둡다). 그래서 NW 이웃(x - 1)의 그늘은 +x 로 이 칸에 떨어지고,
  // NE 이웃(y - 1)의 밝은 벽 밑에는 좁은 접촉 그늘만 진다
  const upNW = x > 0 ? World.heightAt(world, x - 1, y) - hgt : 0
  const upNE = y > 0 ? World.heightAt(world, x, y - 1) - hgt : 0
  const castNW = upNW > 0 ? Math.min(CAST_MAX, upNW * CAST_PER_STEP) * 2 * proj.hh : 0
  const castNE = upNE > 0 ? CONTACT_PX : 0
  const level = hgt + 1
  for (const p of proj.tops) {
    const px = tx + p.dx
    const py = ty + p.dy
    if (px < 0 || py < 0 || px >= w || py >= b.h) continue
    let c = top
    if (p.edge === 1) c = lineNW || top
    else if (p.edge === 2) c = lineNE || top
    else if ((p.front === 1 && frontLeft > 0) || (p.front === 2 && frontRight > 0)) c = hi
    if (p.nw < castNW || p.ne < castNE) c = shadowOf[c]!
    const i = py * w + px
    b.px[i] = c
    b.depth[i] = base + p.depth
    b.surf[i] = SURF_TOP
    b.level[i] = level
  }
}

// 옆면. 한 단의 맨 아래 줄마다 진한 줄을 그어 몇 단인지 셀 수 있게 한다(면의 맨 아래 줄은 아래 윗면과 맞닿아 긋지 않는다)
function face(b: Buffer, cols: readonly FaceColumn[], tx: number, ty: number, height: number, base: number, color: number, stripe: number, isEdge: boolean, proj: Proj, w: number): void {
  const step = proj.step
  const isStriped = proj.isStriped
  for (const c of cols) {
    const px = tx + c.dx
    if (px < 0 || px >= w) continue
    for (let k = 0; k < height; k++) {
      const py = ty + c.start + k
      if (py < 0) continue
      if (py >= b.h) break
      const i = py * w + px
      // 맵 가장자리 밑판의 맨 아래 줄은 한 단계 어둡게 해 바닥과 떨어져 보이게 한다
      b.px[i] = isEdge && k === height - 1 ? Palette.EDGE : isStriped && k < height - 1 && (k + 1) % step === 0 ? stripe : color
      b.depth[i] = base + c.depth
      b.surf[i] = SURF_SIDE
      b.level[i] = 0
    }
  }
}

// 버퍼에 보이는 타일만 뒤에서 앞으로 그린다. 이웃이 드리우는 그늘은 theme 의 그림자 사슬로 칠한다
export function drawWorld(b: Buffer, world: WorldState, view: View, proj: Proj = NEAR, theme: Palette.Theme = Palette.PAPER_THEME): number {
  const hw = proj.hw
  const hh = proj.hh
  const maxZ = World.MAX_HEIGHT * proj.step
  const maxFace = maxZ + proj.base
  const dMin = Math.max(0, Math.floor((view.oy - 2 * hh - maxFace) / hh))
  const dMax = Math.min(world.w + world.h - 2, Math.ceil((view.oy + b.h + maxZ) / hh))
  let drawn = 0
  for (let d = dMin; d <= dMax; d++) {
    // sx = (2x - d) × hw 가 [ox - hw, ox + w + hw] 안에 드는 x
    const xLo = Math.max(0, d - (world.h - 1), Math.ceil(((view.ox - hw) / hw + d) / 2))
    const xHi = Math.min(world.w - 1, d, Math.floor(((view.ox + b.w + hw) / hw + d) / 2))
    for (let x = xLo; x <= xHi; x++) {
      drawTile(b, world, x, d - x, view, proj, theme.shadowOf)
      drawn++
    }
  }
  return drawn
}

// 발밑 윗면에 타원 그림자를 떨어뜨린다. 같은 높이의 윗면 픽셀만 어둡게 한다
export function drawShadow(b: Buffer, cx: number, cy: number, rx: number, ry: number, level: number, shadowOf: readonly number[]): void {
  for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
    for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
      if (x < 0 || y < 0 || x >= b.w || y >= b.h) continue
      const u = (x + 0.5 - cx) / rx
      const v = (y + 0.5 - cy) / ry
      if (u * u + v * v > 1) continue
      const i = y * b.w + x
      if (b.surf[i] !== SURF_TOP || b.level[i] !== level) continue
      b.px[i] = shadowOf[b.px[i]!]!
    }
  }
}

// 카메라: 목표(강아지 화면 좌표)가 가운데 상자(데드존) 밖으로 나가면 그만큼을 지수 보간으로 따라간다.
// 데드존 안에서는 배경이 멈춰 있어 셀이 덜 바뀐다. 카메라는 NEAR 픽셀로 돌고, 그릴 때 투영에 맞춰 옮긴다
export type Camera = { x: number; y: number; isSettled: boolean }

export const CAMERA_TAU_MS = 150
export const DEAD_X = 6
export const DEAD_Y = 4

export function cameraOf(x: number, y: number): Camera {
  return { x, y, isSettled: true }
}

export function follow(cam: Camera, tx: number, ty: number, dtMs: number): void {
  const k = 1 - Math.exp(-dtMs / CAMERA_TAU_MS)
  const ex = tx - cam.x
  const ey = ty - cam.y
  const wantX = Math.abs(ex) > DEAD_X ? ex - Math.sign(ex) * DEAD_X : 0
  const wantY = Math.abs(ey) > DEAD_Y ? ey - Math.sign(ey) * DEAD_Y : 0
  cam.x += wantX * k
  cam.y += wantY * k
  cam.isSettled = Math.abs(wantX) < 0.5 && Math.abs(wantY) < 0.5
}

export function viewOf(cam: Camera, b: Buffer, proj: Proj = NEAR): View {
  const c = mapOf(cam.x, cam.y, proj)
  return { ox: Math.round(c.sx) - Math.floor(b.w / 2), oy: Math.round(c.sy) - Math.floor(b.h / 2) }
}

export * as default from '.'
