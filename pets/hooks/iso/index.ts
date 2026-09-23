// 아이소메트릭 투영, 타일 그리기, 카메라(순수 모듈).
//
// 좌표: 타일 (x, y) 의 가운데가 세계 좌표 (x, y). z 는 픽셀 높이.
// 화면(세계 픽셀) sx = (fx - fy) × 6, sy = (fx + fy) × 3 + 3 - z. 타일의 위 꼭짓점은 (x - y) × 6, (x + y) × 3 - z.
// 깊이: 같은 화면 픽셀에 겹치는 두 점은 시선 방향 (1, 1, 6) 만큼만 다르므로 fx + fy 가 클수록 앞이다.
// 타일은 x + y 대각선 순서로(뒤에서 앞으로) 덮어 그리며 픽셀마다 깊이를 남기고,
// 강아지·공은 그 깊이와 비교해 그린다. 그래서 앞쪽 블록이 강아지를 픽셀 단위로 가린다.

import Names from '../names'
import { Palette, SURF_SIDE, SURF_TOP, type Buffer } from '../pixel'
import World, { type World as WorldState } from '../world'

const HW = Names.TILE_W / 2
const HH = Names.TILE_H / 2

type TopPixel = { dx: number; dy: number; edge: 0 | 1 | 2; depth: number }
type FaceColumn = { dx: number; start: number; depth: number }

// 다이아몬드 윗면: 픽셀 가운데 (a, b) 가 |a|/6 + |b|/3 < 1 인 곳. 경계에 걸리는 픽셀이 없어 이웃 타일과 빈틈·겹침 없이 맞물린다.
// 위쪽 두 변(NW·NE)만 선으로 그려 이웃과 공유하는 선이 한 번만 그려진다
const TOP_PIXELS: TopPixel[] = []
const LEFT_FACE: FaceColumn[] = []
const RIGHT_FACE: FaceColumn[] = []
{
  for (let dy = 0; dy < Names.TILE_H; dy++) {
    for (let dx = -HW; dx < HW; dx++) {
      const a = dx + 0.5
      const b = dy + 0.5 - HH
      const v = Math.abs(a) + 2 * Math.abs(b)
      if (v >= HW) continue
      const edge = b < 0 && v >= HW - 1.5 ? (a < 0 ? 1 : 2) : 0
      TOP_PIXELS.push({ dx, dy, edge, depth: (dy - 2.5) / HH })
    }
  }
  // 옆면은 반 폭 6 열을 다 덮는다(꼭짓점 열은 윗면 픽셀이 없어도 옆면은 있다).
  // 열마다 윗면 아래 변 y = 3 + 3(1 - |a|/6) 보다 가운데가 아래인 첫 행부터 시작한다
  for (let dx = -HW; dx < HW; dx++) {
    const a = dx + 0.5
    const start = Math.ceil(HH + HH * (1 - Math.abs(a) / HW) - 0.5)
    // 왼쪽 면은 fy = y + 0.5 평면, 오른쪽 면은 fx = x + 0.5 평면
    if (dx < 0) LEFT_FACE.push({ dx, start, depth: 1 + a / HW })
    else RIGHT_FACE.push({ dx, start, depth: 1 - a / HW })
  }
}

export function screenOf(fx: number, fy: number, z: number): { sx: number; sy: number } {
  return { sx: (fx - fy) * HW, sy: (fx + fy) * HH + HH - z }
}

export type View = {
  // 버퍼 픽셀 (0, 0) 에 놓이는 세계 픽셀
  ox: number
  oy: number
}

// 한 타일. 옆면은 앞 이웃보다 높은 만큼만(맵 가장자리면 밑판까지) 그린다
function drawTile(b: Buffer, world: WorldState, x: number, y: number, view: View): void {
  const hgt = World.heightAt(world, x, y)
  const z = hgt * Names.STEP_PX
  const tx = (x - y) * HW - view.ox
  const ty = (x + y) * HH - z - view.oy
  const base = x + y
  const frontLeft = y + 1 < world.h ? (hgt - World.heightAt(world, x, y + 1)) * Names.STEP_PX : z + Names.BASE_PX
  const frontRight = x + 1 < world.w ? (hgt - World.heightAt(world, x + 1, y)) * Names.STEP_PX : z + Names.BASE_PX
  const isEdgeLeft = y + 1 >= world.h
  const isEdgeRight = x + 1 >= world.w
  const w = b.w
  if (frontLeft > 0) face(b, LEFT_FACE, tx, ty, frontLeft, base, Palette.LEFT, isEdgeLeft, w)
  if (frontRight > 0) face(b, RIGHT_FACE, tx, ty, frontRight, base, Palette.RIGHT, isEdgeRight, w)
  const heavyNW = x % 3 === 0
  const heavyNE = y % 3 === 0
  const level = hgt + 1
  for (const p of TOP_PIXELS) {
    const px = tx + p.dx
    const py = ty + p.dy
    if (px < 0 || py < 0 || px >= w || py >= b.h) continue
    const i = py * w + px
    b.px[i] = p.edge === 0 ? Palette.TOP : (p.edge === 1 ? heavyNW : heavyNE) ? Palette.LINE_HEAVY : Palette.LINE
    b.depth[i] = base + p.depth
    b.surf[i] = SURF_TOP
    b.level[i] = level
  }
}

function face(b: Buffer, cols: readonly FaceColumn[], tx: number, ty: number, height: number, base: number, color: number, isEdge: boolean, w: number): void {
  for (const c of cols) {
    const px = tx + c.dx
    if (px < 0 || px >= w) continue
    for (let k = 0; k < height; k++) {
      const py = ty + c.start + k
      if (py < 0) continue
      if (py >= b.h) break
      const i = py * w + px
      // 맵 가장자리 밑판의 맨 아래 줄은 한 단계 어둡게 해 바닥과 떨어져 보이게 한다
      b.px[i] = isEdge && k === height - 1 ? Palette.EDGE : color
      b.depth[i] = base + c.depth
      b.surf[i] = SURF_SIDE
      b.level[i] = 0
    }
  }
}

// 버퍼에 보이는 타일만 뒤에서 앞으로 그린다
export function drawWorld(b: Buffer, world: WorldState, view: View): number {
  const maxZ = World.MAX_HEIGHT * Names.STEP_PX
  const maxFace = maxZ + Names.BASE_PX
  const dMin = Math.max(0, Math.floor((view.oy - Names.TILE_H - maxFace) / HH))
  const dMax = Math.min(world.w + world.h - 2, Math.ceil((view.oy + b.h + maxZ) / HH))
  let drawn = 0
  for (let d = dMin; d <= dMax; d++) {
    // sx = (2x - d) × 6 가 [ox - 6, ox + w + 6] 안에 드는 x
    const xLo = Math.max(0, d - (world.h - 1), Math.ceil(((view.ox - HW) / HW + d) / 2))
    const xHi = Math.min(world.w - 1, d, Math.floor(((view.ox + b.w + HW) / HW + d) / 2))
    for (let x = xLo; x <= xHi; x++) {
      drawTile(b, world, x, d - x, view)
      drawn++
    }
  }
  return drawn
}

// 발밑 윗면에 타원 그림자를 떨어뜨린다. 같은 높이의 윗면 픽셀만 어둡게 한다
export function drawShadow(b: Buffer, cx: number, cy: number, rx: number, ry: number, level: number): void {
  for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
    for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
      if (x < 0 || y < 0 || x >= b.w || y >= b.h) continue
      const u = (x + 0.5 - cx) / rx
      const v = (y + 0.5 - cy) / ry
      if (u * u + v * v > 1) continue
      const i = y * b.w + x
      if (b.surf[i] !== SURF_TOP || b.level[i] !== level) continue
      b.px[i] = Palette.SHADOW_OF[b.px[i]!]!
    }
  }
}

// 카메라: 목표(강아지 화면 좌표)가 가운데 상자(데드존) 밖으로 나가면 그만큼을 지수 보간으로 따라간다.
// 데드존 안에서는 배경이 멈춰 있어 셀이 덜 바뀐다
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

export function viewOf(cam: Camera, b: Buffer): View {
  return { ox: Math.round(cam.x) - Math.floor(b.w / 2), oy: Math.round(cam.y) - Math.floor(b.h / 2) }
}

export * as default from '.'
