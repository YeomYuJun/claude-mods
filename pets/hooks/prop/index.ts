// 소품 그리기(순수 모듈): 나무·바위(장애물)와 꽃·풀포기·버섯·갈대·연잎(걷는 꾸밈). 그림은 art.ts, 색은 세트가 소품 묶음에 채운다.
//
// 모든 타일을 그린 뒤 뒤에서 앞으로(x + y 순) 픽셀마다 깊이를 비교해 그리고 깊이를 쓴다.
// 깊이: 장애물 소품 = 칸 x + y + 0.45(같은 칸 동물 0.4 보다 조금 앞), 걷는 꾸밈 = x + y + 0.6(같은 칸 동물의 발을 조금 가린다).
// 버퍼에는 타일과 같이 view.dz 를 뺀 값을 담는다(비우기 범위의 동물 깊이도 뺀 값으로 받는다).
// 그래서 뒤 칸의 동물은 소품에 가리고 앞 칸의 동물은 소품을 가린다. 줄기 위로 솟은 잎은 뒤 칸 타일 위에 그려진다.
// 비우기: 나무(1 배에서 키 8 픽셀 넘는 소품)가 동물 화면 상자 안에서 동물보다 앞이면 (X + Y) 홀수 칸을 칠하지 않는다.
// 원거리·맵 보기에서는 나무와 동물을 모두 작게 그리지만 나무가 동물보다 커 가려지므로 비운다.
// 동물의 윤곽 비침은 짝수 칸이라, 나무 뒤 동물은 홀수 칸에 제 색, 짝수 칸에 윤곽 비침으로 보인다.
// 소품 픽셀은 윗면이 아니라서 동물 그림자가 떨어지지 않는다.

import Iso, { type Proj, type View } from '../iso'
import Names from '../names'
import { Palette, shrink, SURF_NONE, type Buffer } from '../pixel'
import World, { type World as WorldState } from '../world'
import { PROP_ART, PROP_CODES, type PropArtId, type PropBitmap } from './art.js'

export { PROP_ART }
export type { PropArtId } from './art.js'

// 1 배에서 나무는 이 키(픽셀)보다 크다
export const TALL_PX = 8
const PROP_DEPTH = 0.45
const DECO_DEPTH = 0.6

const G = World.Gen
const PROP_IDS: ReadonlyArray<readonly [number, PropArtId]> = [
  [G.PROP_ROCK, 'rock'], [G.PROP_BROADLEAF, 'broadleaf'], [G.PROP_PINE, 'pine'], [G.PROP_OAK, 'oak'], [G.PROP_WILLOW, 'willow'], [G.PROP_PAPER_TREE, 'paperTree'],
]
const DECO_IDS: ReadonlyArray<readonly [number, PropArtId]> = [[G.DECO_FLOWER, 'flower'], [G.DECO_TUFT, 'tuft'], [G.DECO_MUSHROOM, 'mushroom'], [G.DECO_REED, 'reed'], [G.DECO_LILY, 'lily'], [G.DECO_BRANCH, 'branch']]

// 팔레트 번호로 바꾼 그림. 투명은 255
type Compiled = { w: number; h: number; ax: number; ay: number; px: Uint8Array; isTall: boolean }

function compile(bm: PropBitmap, isTall: boolean): Compiled {
  const h = bm.rows.length
  const w = Math.max(...bm.rows.map(r => r.length))
  const px = new Uint8Array(w * h).fill(Palette.TRANSPARENT)
  bm.rows.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      const role = PROP_CODES[row[x]!]
      if (role) px[y * w + x] = Palette.PROP + Palette.PropSlot[role]
    }
  })
  return { w, h, ax: bm.ax, ay: bm.ay, px, isTall }
}

// 맵 보기 그림: 원거리 그림을 2 × 2 픽셀마다 한 픽셀로 줄인다. 한 픽셀짜리 꽃잎도 남게 픽셀이 하나라도 있으면 칠한다
function wideOf(c: Compiled): Compiled {
  return { ...shrink(c, c.ax, c.ay, Palette.TRANSPARENT, { by: 2, minCover: 0, rowShift: 1 }), isTall: c.isTall }
}

// 소품·꾸밈 번호마다 [1 배 그림, 원거리 그림, 맵 보기 그림]. 원거리 그림이 없으면 원거리·맵 보기에서 그리지 않는다
type Set3 = [Compiled, Compiled | undefined, Compiled | undefined]
const byProp = new Map<number, Set3>()
const byDeco = new Map<number, Set3>()
function set3Of(art: PropArtId, tall: boolean): Set3 {
  const far = PROP_ART[art].far && compile(PROP_ART[art].far, tall)
  return [compile(PROP_ART[art].near, tall), far, far && wideOf(far)]
}
for (const [id, art] of PROP_IDS) byProp.set(id, set3Of(art, G.isTree(id)))
for (const [id, art] of DECO_IDS) byDeco.set(id, set3Of(art, false))

// 가장 키 큰 그림(원거리 포함). 화면 아래 칸의 나무가 위로 솟아 보이는 만큼 여유를 둔다
const MAX_H = Math.max(...[...byProp.values(), ...byDeco.values()].flat().map(c => c?.h ?? 0))

// 비울 범위: 버퍼 좌표의 동물 상자(양 끝 포함)와 동물 깊이
export type Hollow = { x0: number; y0: number; x1: number; y1: number; depth: number }

function stamp(b: Buffer, c: Compiled, sx: number, sy: number, depth: number, hollow: Hollow | undefined): void {
  const cut = c.isTall && hollow && depth > hollow.depth ? hollow : undefined
  for (let j = 0; j < c.h; j++) {
    const Y = sy + j - c.ay
    if (Y < 0 || Y >= b.h) continue
    for (let i = 0; i < c.w; i++) {
      const v = c.px[j * c.w + i]!
      if (v === Palette.TRANSPARENT) continue
      const X = sx + i - c.ax
      if (X < 0 || X >= b.w) continue
      if (cut && X >= cut.x0 && X <= cut.x1 && Y >= cut.y0 && Y <= cut.y1 && ((X + Y) & 1) === 1) continue
      const k = Y * b.w + X
      if (depth <= b.depth[k]!) continue
      b.px[k] = v
      b.depth[k] = depth
      b.surf[k] = SURF_NONE
      b.level[k] = 0
    }
  }
}

// 버퍼에 보이는 소품을 뒤에서 앞으로 그리고 그린 소품 수를 돌려준다. drawWorld 다음에 부른다. 없는 청크의 칸은 건너뛴다
export function drawProps(b: Buffer, world: WorldState, view: View, proj: Proj = Iso.NEAR, hollow?: Hollow): number {
  return World.peek(world, () => stampAll(b, world, view, proj, hollow))
}

function stampAll(b: Buffer, world: WorldState, view: View, proj: Proj, hollow: Hollow | undefined): number {
  const hw = proj.hw
  const hh = proj.hh
  const slot = proj === Iso.NEAR ? 0 : proj === Iso.FAR ? 1 : 2
  const maxZ = World.maxHeightOf(world) * proj.step
  const { x0, y0, x1, y1 } = World.bounds(world)
  // 그림 바닥 점은 칸 가운데(d × hh + hh - z). 위로 MAX_H 까지 솟는다
  const dMin = Math.max(x0 + y0, Math.floor((view.oy - hh) / hh))
  const dMax = Math.min(x1 + y1, Math.ceil((view.oy + b.h + maxZ + MAX_H) / hh))
  const dz = view.dz ?? 0
  let drawn = 0
  for (let d = dMin; d <= dMax; d++) {
    const xLo = Math.max(x0, d - y1, Math.ceil(((view.ox - hw) / hw + d) / 2))
    const xHi = Math.min(x1, d - y0, Math.floor(((view.ox + b.w + hw) / hw + d) / 2))
    for (let x = xLo; x <= xHi; x++) {
      const y = d - x
      if (!World.isLoaded(world, x, y)) continue
      const prop = World.propAt(world, x, y)
      const deco = prop ? 0 : World.decoAt(world, x, y)
      const pair = prop ? byProp.get(prop) : deco ? byDeco.get(deco) : undefined
      const c = pair?.[slot]
      if (!c) continue
      // 물 위 꾸밈(갈대·연잎)은 수면에 놓는다. 수면은 물가 윗면보다 1 픽셀 낮다
      const s = Iso.screenOf(x, y, World.walkHeightAt(world, x, y) * Names.STEP_PX, proj)
      const sink = World.isWater(world, x, y) ? 1 : 0
      stamp(b, c, Math.round(s.sx) - view.ox, Math.round(s.sy) - view.oy + sink, d - dz + (prop ? PROP_DEPTH : DECO_DEPTH), hollow)
      drawn++
    }
  }
  return drawn
}

// 문 나뭇가지: 입 자리(버퍼 좌표)에 나뭇가지 그림을 깊이 depth 로 찍는다
export function drawHeldBranch(b: Buffer, sx: number, sy: number, depth: number): void {
  const c = byDeco.get(G.DECO_BRANCH)![0]
  stamp(b, c, sx, sy, depth, undefined)
}

// 그림 크기(테스트가 상한을 본다)
export function sizeOf(art: PropArtId, far: boolean): { w: number; h: number } | undefined {
  const bm = far ? PROP_ART[art].far : PROP_ART[art].near
  return bm && { w: Math.max(...bm.rows.map(r => r.length)), h: bm.rows.length }
}

export * as default from '.'
