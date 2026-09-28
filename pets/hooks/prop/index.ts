// 소품 그리기(순수 모듈): 나무·바위(장애물)와 꽃·풀포기·버섯(걷는 꾸밈). 그림은 art.ts, 색은 세트가 소품 묶음에 채운다.
//
// 모든 타일을 그린 뒤 뒤에서 앞으로(x + y 순) 픽셀마다 깊이를 비교해 그리고 깊이를 쓴다.
// 깊이: 장애물 소품 = 칸 x + y + 0.45(같은 칸 동물 0.4 보다 조금 앞), 걷는 꾸밈 = x + y + 0.6(같은 칸 동물의 발을 조금 가린다).
// 그래서 뒤 칸의 동물은 소품에 가리고 앞 칸의 동물은 소품을 가린다. 줄기 위로 솟은 잎은 뒤 칸 타일 위에 그려진다.
// 비우기: 나무(1 배에서 키 8 픽셀 넘는 소품)가 동물 화면 상자 안에서 동물보다 앞이면 (X + Y) 홀수 칸을 칠하지 않는다.
// 원거리 나무는 6~9 픽셀이지만 동물은 원래 크기로 그려 가려지므로 원거리에서도 비운다.
// 동물의 윤곽 비침은 짝수 칸이라, 나무 뒤 동물은 홀수 칸에 제 색, 짝수 칸에 윤곽 비침으로 보인다.
// 소품 픽셀은 윗면이 아니라서 동물 그림자가 떨어지지 않는다.

import Iso, { type Proj, type View } from '../iso'
import Names from '../names'
import { Palette, SURF_NONE, type Buffer } from '../pixel'
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
const DECO_IDS: ReadonlyArray<readonly [number, PropArtId]> = [[G.DECO_FLOWER, 'flower'], [G.DECO_TUFT, 'tuft'], [G.DECO_MUSHROOM, 'mushroom']]

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

// 소품·꾸밈 번호마다 [1 배 그림, 원거리 그림(없으면 원거리에서 그리지 않음)]
const byProp = new Map<number, [Compiled, Compiled | undefined]>()
const byDeco = new Map<number, [Compiled, Compiled | undefined]>()
for (const [id, art] of PROP_IDS) {
  const tall = G.isTree(id)
  byProp.set(id, [compile(PROP_ART[art].near, tall), PROP_ART[art].far && compile(PROP_ART[art].far, tall)])
}
for (const [id, art] of DECO_IDS) byDeco.set(id, [compile(PROP_ART[art].near, false), PROP_ART[art].far && compile(PROP_ART[art].far, false)])

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

// 버퍼에 보이는 소품을 뒤에서 앞으로 그리고 그린 소품 수를 돌려준다. drawWorld 다음에 부른다
export function drawProps(b: Buffer, world: WorldState, view: View, proj: Proj = Iso.NEAR, hollow?: Hollow): number {
  const hw = proj.hw
  const hh = proj.hh
  const isFar = proj !== Iso.NEAR
  const maxZ = World.maxHeightOf(world) * proj.step
  const { x0, y0, x1, y1 } = World.bounds(world)
  // 그림 바닥 점은 칸 가운데(d × hh + hh - z). 위로 MAX_H 까지 솟는다
  const dMin = Math.max(x0 + y0, Math.floor((view.oy - hh) / hh))
  const dMax = Math.min(x1 + y1, Math.ceil((view.oy + b.h + maxZ + MAX_H) / hh))
  let drawn = 0
  for (let d = dMin; d <= dMax; d++) {
    const xLo = Math.max(x0, d - y1, Math.ceil(((view.ox - hw) / hw + d) / 2))
    const xHi = Math.min(x1, d - y0, Math.floor(((view.ox + b.w + hw) / hw + d) / 2))
    for (let x = xLo; x <= xHi; x++) {
      const y = d - x
      const prop = World.propAt(world, x, y)
      const deco = prop ? 0 : World.decoAt(world, x, y)
      const pair = prop ? byProp.get(prop) : deco ? byDeco.get(deco) : undefined
      const c = pair && (isFar ? pair[1] : pair[0])
      if (!c) continue
      const s = Iso.screenOf(x, y, World.heightAt(world, x, y) * Names.STEP_PX, proj)
      stamp(b, c, Math.round(s.sx) - view.ox, Math.round(s.sy) - view.oy, d + (prop ? PROP_DEPTH : DECO_DEPTH), hollow)
      drawn++
    }
  }
  return drawn
}

// 그림 크기(테스트가 상한을 본다)
export function sizeOf(art: PropArtId, far: boolean): { w: number; h: number } | undefined {
  const bm = far ? PROP_ART[art].far : PROP_ART[art].near
  return bm && { w: Math.max(...bm.rows.map(r => r.length)), h: bm.rows.length }
}

export * as default from '.'
