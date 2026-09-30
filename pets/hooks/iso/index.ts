// 아이소메트릭 투영, 타일 그리기, 카메라(순수 모듈).
//
// 좌표: 타일 (x, y) 의 가운데가 세계 좌표 (x, y). z 는 시뮬레이션 픽셀 높이(한 단 = Names.STEP_PX).
// 투영(Proj)은 타일 반폭 hw, 반높이 hh, 한 단 높이 step 으로 정한다.
// 화면 sx = (fx - fy) × hw, sy = (fx + fy) × hh + hh - z × step / STEP_PX. 타일의 위 꼭짓점은 (x - y) × hw, (x + y) × hh - 높이.
// 시뮬레이션(공, 움직임, 효과, 카메라)은 NEAR(12 × 6, 한 단 4) 픽셀로 돈다. 원거리·맵 보기 줌은 그릴 때만 FAR·WIDE 로 옮긴다.
// 깊이: 같은 화면 픽셀에 겹치는 두 점은 시선 방향 (1, 1, 2hh × STEP_PX / step) 만큼만 다르므로 어느 투영이든 fx + fy 가 클수록 앞이다.
// 깊이 버퍼는 Float32 라 fx + fy 를 그대로 담으면 좌표가 커질 때 작은 차이(동물 0.4, 소품 0.45)가 사라진다. 그래서 카메라 쪽 대각선 dz 를 뺀 값을 담는다.
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
  // 경사 윗면(World.Slope 방향 1..4 → 번호 0..3). 기준점은 평지와 같이 칸 높이 h 의 위 꼭짓점
  slopes: readonly (readonly TopPixel[])[]
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
  const slopes = [1, 2, 3, 4].map(dir => slopeTopsOf(hw, hh, step, dir))
  return { hw, hh, step, base, lineEvery, isStriped: step >= 3, tops, slopes, left, right }
}

// 경사 윗면: 낮은 변 h, 높은 변 h + 1 인 평면. 픽셀 가운데 (a, b) 에서 평면 위 (u, w) 를 풀어 max(|u|, |w|) < 0.5 인 픽셀만 넣는다.
// 꼭짓점이 정수 좌표이고 모든 변 벡터에서 가로·세로 변위의 2 인수 개수가 달라 픽셀 가운데가 변 위에 놓이지 않는다. 그래서 이웃 칸과 빈틈·겹침이 없고
// 픽셀 수가 평행사변형 넓이와 같다. 보는 쪽으로 오르는 경사(+x·+y)는 면이 누워 좁고, 맵 보기(한 단 2 = 2hh)에서는 넓이가 0 이라 픽셀이 없다.
// 경사 윗면에는 선·앞 모서리 하이라이트를 긋지 않아 edge·front 는 0 이다
function slopeTopsOf(hw: number, hh: number, step: number, dir: number): TopPixel[] {
  const [ddx, ddy] = World.Slope.DIRS[dir - 1]!
  // u + w = s, u − w = p 로 두면 높이 오프셋 e = s·(ddx + ddy)/2 + p·(ddx − ddy)/2 + 0.5 가 화면 b 를 e × step 만큼 올린다
  const den = hh - (step * (ddx + ddy)) / 2
  const out: TopPixel[] = []
  if (den <= 0) return out
  for (let dy = -step; dy < 2 * hh; dy++) {
    for (let dx = -hw; dx < hw; dx++) {
      const p = (dx + 0.5) / hw
      const s = (dy + 0.5 - hh + step * ((p * (ddx - ddy)) / 2 + 0.5)) / den
      const u = (s + p) / 2
      const w = (s - p) / 2
      if (Math.max(Math.abs(u), Math.abs(w)) >= 0.5) continue
      out.push({ dx, dy, edge: 0, front: 0, nw: (u + 0.5) * 2 * hh, ne: (w + 0.5) * 2 * hh, depth: u + w })
    }
  }
  return out
}

export const NEAR = projOf(Names.TILE_W / 2, Names.TILE_H / 2, Names.STEP_PX, Names.BASE_PX, 1)
export const FAR = projOf(Names.FAR_TILE_W / 2, Names.FAR_TILE_H / 2, Names.FAR_STEP_PX, Names.FAR_BASE_PX, Names.FAR_LINE_EVERY)
// 4 × 2 다이아몬드는 윗면 픽셀 4 개가 모두 변에 걸린다(위 두 개는 NW·NE 선 자리, 아래 두 개는 앞 변 하이라이트 자리)
export const WIDE = projOf(Names.WIDE_TILE_W / 2, Names.WIDE_TILE_H / 2, Names.WIDE_STEP_PX, Names.WIDE_BASE_PX, Names.WIDE_LINE_EVERY)

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
  // 깊이 기준 대각선(정수). 버퍼에는 x + y - dz 를 담는다. 없으면 0
  dz?: number
}

// 구덩이 흔적 픽셀(윗면 표 순번). 1 배는 가운데 4 × 2, 원거리는 2 × 1. 맵 보기는 윗면이 모두 변 픽셀이라 그리지 않는다
const PIT_DOTS: ReadonlyArray<readonly [number, number]> = [[-2, 2], [-1, 2], [0, 2], [1, 2], [-2, 3], [-1, 3], [0, 3], [1, 3]]
const PIT_DOTS_FAR: ReadonlyArray<readonly [number, number]> = [[-1, 2], [0, 2]]
const pitMasks = new Map<Proj, Uint8Array>()

function pitMaskOf(proj: Proj): Uint8Array {
  let m = pitMasks.get(proj)
  if (!m) {
    const dots = proj === NEAR ? PIT_DOTS : proj === FAR ? PIT_DOTS_FAR : []
    m = new Uint8Array(proj.tops.length)
    proj.tops.forEach((p, j) => { if (dots.some(([dx, dy]) => dx === p.dx && dy === p.dy)) m![j] = 1 })
    pitMasks.set(proj, m)
  }
  return m
}

// 칸의 지표 종류는 세트의 색 표(kindSlot)가 번호 묶음으로, 옆면은 materialOf 가 재질 묶음으로 바꾼다.
// 윗면 띠 0~4 의 색: 높을수록 밝다. 높이마다 어느 띠인지는 세트의 topBand 표가 정한다.
// 앞 모서리 하이라이트는 두 띠 위 윗면 색을 빌린다(맨 위 두 띠는 HILITE)
const T = Palette.Top
const TOP_OF: readonly number[] = [T.TOP0, T.TOP1, T.TOP2, T.TOP3, T.TOP4]
const HI_OF: readonly number[] = [T.TOP2, T.TOP3, T.TOP4, T.HILITE, T.HILITE]

// 윗면 무늬(1 배에서만): 지표 종류마다 칸 해시로 고르는 변형 4 개. 좌표는 윗면 픽셀 (dx, dy), 모두 선·하이라이트가 아닌 안쪽 픽셀이다
type Dots = ReadonlyArray<readonly [number, number]>
const G = World.Gen
const PATTERNS: ReadonlyArray<readonly [number, readonly Dots[]]> = [
  [G.KIND_GRASS, [[[-2, 2], [-2, 3], [1, 3]], [[1, 2], [1, 3], [-3, 3]], [[-1, 2], [-1, 3], [2, 3]], []]],
  [G.KIND_DIRT, [[[-2, 2], [1, 3]], [[0, 2], [-3, 3]], [[2, 2], [-1, 3]], []]],
  [G.KIND_LITTER, [[[-2, 2], [1, 3]], [[0, 2], [-3, 3], [2, 3]], [[2, 2], [-1, 3]], [[-1, 2]]]],
  [G.KIND_STONE, [[[-2, 2], [-1, 3], [0, 3]], [[0, 2], [1, 2], [2, 3]], [], [[-3, 3], [-2, 3]]]],
  [G.KIND_SNOW, [[[-1, 2]], [[1, 3]], [[2, 2]], []]],
  [G.KIND_ICE, [[[-2, 2], [-1, 3]], [[1, 2], [2, 3]], [], [[0, 3]]]],
]
// 지표 종류 번호마다 변형 4 개의 윗면 픽셀 표시(NEAR.tops 순서). 처음 쓸 때 만든다
let masks: Map<number, Uint8Array[]> | undefined

function masksOf(id: number): Uint8Array[] | undefined {
  if (!masks) {
    masks = new Map()
    for (const [kid, variants] of PATTERNS) {
      masks.set(kid, variants.map(dots => {
        const m = new Uint8Array(NEAR.tops.length)
        NEAR.tops.forEach((p, j) => { if (dots.some(([dx, dy]) => dx === p.dx && dy === p.dy)) m[j] = 1 })
        return m
      }))
    }
  }
  return masks.get(id)
}
// 계단(돌 칸 경사): 경사 윗면에서 오름 높이 e(0~1)가 문턱을 넘는 자리에 턱 줄을 긋는다. 1 배는 1/3·2/3 두 줄, 원거리는 1/2 한 줄, 맵 보기는 없음.
// 줄 픽셀은 e 가 문턱 이상이고 네 이웃 템플릿 픽셀 중 문턱 아래가 있는 픽셀(문턱 선의 높은 쪽 한 줄). 방향 1..4 → 번호 0..3, 투영마다 처음 쓸 때 만든다
const stairMasks = new Map<Proj, Uint8Array[]>()

function stairMasksOf(proj: Proj): Uint8Array[] {
  let masks = stairMasks.get(proj)
  if (!masks) {
    const steps = proj === NEAR ? [1 / 3, 2 / 3] : proj === FAR ? [1 / 2] : []
    masks = proj.slopes.map((tops, k) => {
      const rise = (p: TopPixel) => World.Slope.riseOf(k + 1, p.nw / (2 * proj.hh) - 0.5, p.ne / (2 * proj.hh) - 0.5)
      const at = new Map(tops.map(p => [`${p.dx},${p.dy}`, rise(p)]))
      const m = new Uint8Array(tops.length)
      tops.forEach((p, j) => {
        const e = rise(p)
        const below = [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([ox, oy]) => at.get(`${p.dx + ox!},${p.dy + oy!}`))
        if (steps.some(t => e >= t && below.some(v => v !== undefined && v < t))) m[j] = 1
      })
      return m
    })
    stairMasks.set(proj, masks)
  }
  return masks
}

// 물 반짝임(1 배에서만): 칸마다 윗면 안쪽 픽셀 두 개. 위상이 바뀌면 칸 해시로 고른 자리가 옮겨 간다
let inner: number[] | undefined

function innerOf(): number[] {
  inner ??= NEAR.tops.flatMap((p, j) => (p.edge === 0 && p.front === 0 ? [j] : []))
  return inner
}

// 칸 윗면의 높이(픽셀, 이 투영의 단 높이로). 물 칸은 수면이고, 물가 윗면보다 1 픽셀 낮게 그린다
export function topZ(world: WorldState, x: number, y: number, proj: Proj): number {
  return World.isWater(world, x, y) ? World.walkHeightAt(world, x, y) * proj.step - 1 : World.heightAt(world, x, y) * proj.step
}

// 물 칸: 수면 한 장만 그리고(바닥·옆면 없음) 모눈선을 긋지 않는다. 땅과 닿은 변의 픽셀은 거품, 1 배에서는 반짝임 두 픽셀.
// 물가는 늘 수면과 같은 높이라 물 칸 옆에 벽이 생기지 않는다
function drawWater(b: Buffer, world: WorldState, x: number, y: number, tx: number, ty: number, proj: Proj, glint: number | undefined, dz: number): void {
  const fill = World.isDeep(world, x, y) ? Palette.DEEP_WATER : Palette.SHALLOW
  const dryNW = !World.isWater(world, x - 1, y)
  const dryNE = !World.isWater(world, x, y - 1)
  const drySW = !World.isWater(world, x, y + 1)
  const drySE = !World.isWater(world, x + 1, y)
  let spark1 = -1
  let spark2 = -1
  if (glint !== undefined && proj === NEAR) {
    const list = innerOf()
    spark1 = list[(World.Gen.hash(world.seed, x, y, 402) + glint * 7) % list.length]!
    spark2 = list[(World.Gen.hash(world.seed, x, y, 403) + glint * 13) % list.length]!
  }
  const base = x + y - dz
  const level = World.walkHeightAt(world, x, y) + 1
  const tops = proj.tops
  const w = b.w
  for (let j = 0; j < tops.length; j++) {
    const p = tops[j]!
    const px = tx + p.dx
    const py = ty + p.dy
    if (px < 0 || py < 0 || px >= w || py >= b.h) continue
    const isShore = (p.edge === 1 && dryNW) || (p.edge === 2 && dryNE) || (p.front === 1 && drySW) || (p.front === 2 && drySE)
    const i = py * w + px
    b.px[i] = isShore ? Palette.FOAM : j === spark1 || j === spark2 ? Palette.SHIMMER : fill
    b.depth[i] = base + p.depth
    b.surf[i] = SURF_TOP
    b.level[i] = level
  }
}

// 더 높은 NW 이웃이 드리우는 그늘의 폭(칸 폭 비율): 높이 차 한 단에 절반, 두 단 이상이면 칸 전체
const CAST_PER_STEP = 0.5
const CAST_MAX = 1
// 더 높은 NE 이웃 벽 밑의 접촉 그늘 폭(nw·ne 와 같은 단위). 변의 선 픽셀과 그 안쪽 한 줄 정도가 어두워진다
const CONTACT_PX = 1.5

// 한 타일. 옆면은 앞 이웃 윗면보다 높은 만큼만(맵 가장자리면 밑판까지) 그린다. 앞 이웃이 물이면 수면까지라 물가에는 1 픽셀 턱만 생긴다.
// 경사 칸은 방향별 윗면 템플릿(proj.slopes)으로 그리고, 이 칸이나 앞 이웃이 경사면 옆면 길이를 열마다 잰다(slopedFace).
// 경사 윗면은 칸 높이 띠 색 한 가지로 칠하고 모눈선·앞 모서리 하이라이트·무늬를 긋지 않는다. 경사 변은 셀(위아래 두 픽셀) 중간을 여러 높이로 지나
// 한 셀에 새 색 조합이 들어간다. 밝은·어두운 띠와 선·하이라이트·무늬를 더하면 조합이 더 늘어 물가 프레임이 512 쌍을 넘었다
// 경계 없는 월드에서 아직 없는 청크의 타일은 그리지 않고, 앞 이웃이 없는 청크면 그쪽 옆면을 그리지 않는다.
// 화면 상자가 버퍼 밖이거나 청크가 없으면 그리지 않고 false
function drawTile(b: Buffer, world: WorldState, x: number, y: number, view: View, proj: Proj, theme: Palette.Theme, glint: number | undefined): boolean {
  const hgt = World.heightAt(world, x, y)
  const z = topZ(world, x, y, proj)
  const tx = (x - y) * proj.hw - view.ox
  const ty = (x + y) * proj.hh - z - view.oy
  const dir = World.slopeDirAt(world, x, y)
  // 화면 상자: 가로 tx ± hw, 세로 윗면 위 꼭짓점 ty 부터 옆면 아래 끝까지. 옆면은 윗면 아래 2hh 안에서 시작하고
  // 길이가 z + 밑판 이하라 아래 끝은 ty + 2hh + z + base 를 넘지 않는다(땅 높이 + 밑판). 경사 윗면은 위 꼭짓점이 한 단까지 더 위다
  if (ty - (dir ? proj.step : 0) >= b.h || ty + 2 * proj.hh + z + proj.base <= 0 || tx + proj.hw <= 0 || tx - proj.hw >= b.w) return false
  if (!World.isLoaded(world, x, y)) return false
  const dz = view.dz ?? 0
  if (World.isWater(world, x, y)) {
    drawWater(b, world, x, y, tx, ty, proj, glint, dz)
    return true
  }
  const shadowOf = theme.shadowOf
  const id = World.kindAt(world, x, y)
  const kind = Palette.kind(theme.kindSlot[id] ?? 0)
  const mat = theme.materialOf[id] ?? 0
  const side = Palette.material(mat)
  const brick = theme.brick[mat] === true
  const base = x + y - dz
  const isEdgeLeft = !World.inside(world, x, y + 1)
  const isEdgeRight = !World.inside(world, x + 1, y)
  const loadedL = !isEdgeLeft && World.isLoaded(world, x, y + 1)
  const loadedR = !isEdgeRight && World.isLoaded(world, x + 1, y)
  const zL = loadedL ? topZ(world, x, y + 1, proj) : 0
  const zR = loadedR ? topZ(world, x + 1, y, proj) : 0
  const dirL = loadedL ? World.slopeDirAt(world, x, y + 1) : 0
  const dirR = loadedR ? World.slopeDirAt(world, x + 1, y) : 0
  const frontLeft = isEdgeLeft ? z + proj.base : loadedL ? z - zL : 0
  const frontRight = isEdgeRight ? z + proj.base : loadedR ? z - zR : 0
  const w = b.w
  // 이 칸이나 앞 이웃이 경사면 열마다 옆면 길이가 다르다. 아니면 높이 차 하나
  const colorL = side + Palette.Side.SIDE_L
  const colorR = side + Palette.Side.SIDE_R
  const lensL = !isEdgeLeft && (dir || dirL) ? slopedFace(b, proj.left, true, tx, ty, z, dir, dirL, zL, loadedL, base, colorL, proj, w, LENS_L) : undefined
  const lensR = !isEdgeRight && (dir || dirR) ? slopedFace(b, proj.right, false, tx, ty, z, dir, dirR, zR, loadedR, base, colorR, proj, w, LENS_R) : undefined
  if (!lensL && frontLeft > 0) face(b, proj.left, tx, ty, frontLeft, base, colorL, side + Palette.Side.L_STEP, isEdgeLeft, brick, proj, w)
  if (!lensR && frontRight > 0) face(b, proj.right, tx, ty, frontRight, base, colorR, side + Palette.Side.R_STEP, isEdgeRight, brick, proj, w)
  // 앞 변 픽셀 아래에 옆면이 있는지(하이라이트). 경사가 낀 면은 그 픽셀 열의 옆면 길이로
  const hw = proj.hw
  const faceL = (dx: number) => (lensL ? lensL[Math.min(hw - 1, Math.max(0, dx + hw))]! > 0 : frontLeft > 0)
  const faceR = (dx: number) => (lensR ? lensR[Math.min(hw - 1, Math.max(0, dx))]! > 0 : frontRight > 0)
  const band = theme.topBand[hgt] ?? 4
  const top = kind + TOP_OF[band]!
  const hi = kind + HI_OF[band]!
  const LINE = kind + T.LINE
  const mask = proj === NEAR && !dir ? masksOf(id)?.[World.Gen.hash(world.seed, x, y, 401) & 3] : undefined
  const accent = kind + T.ACCENT
  // 맵 뒤쪽 변(뒤에 칸이 없는 NW·NE 변)은 테 색으로 긋는다. 밝은 터미널에서도 맵 경계가 보이게 세트가 어두운 색을 줄 수 있다
  const every = proj.lineEvery
  const lineNW = !World.inside(world, x - 1, y) ? Palette.RIM : x % every !== 0 ? 0 : x % 3 === 0 ? Palette.LINE_HEAVY : LINE
  const lineNE = !World.inside(world, x, y - 1) ? Palette.RIM : y % every !== 0 ? 0 : y % 3 === 0 ? Palette.LINE_HEAVY : LINE
  // 빛은 왼쪽 앞(+y 쪽)에서 온다(왼쪽 면이 밝고 오른쪽 면이 어둡다). 그래서 NW 이웃(x - 1)의 그늘은 +x 로 이 칸에 떨어지고,
  // NE 이웃(y - 1)의 밝은 벽 밑에는 좁은 접촉 그늘만 진다
  // 이웃 높이는 걷는 높이(물이면 수면)로 잰다. 물가는 수면과 같은 높이라 물 쪽으로 그늘이 지지 않는다.
  // 경사가 끼면 맞닿는 변 가운데 높이끼리 잰다(경사가 오르는 쪽 뒤 이웃은 경사의 높은 변과 높이가 같아 그늘이 없다)
  const upNW = World.inside(world, x - 1, y) ? World.edgeHeightAt(world, x - 1, y, 1, 0) - World.edgeHeightAt(world, x, y, -1, 0) : 0
  const upNE = World.inside(world, x, y - 1) ? World.edgeHeightAt(world, x, y - 1, 0, 1) - World.edgeHeightAt(world, x, y, 0, -1) : 0
  // 구덩이 흔적 픽셀은 평지 템플릿 기준이다(경사 칸에는 파지 않는다)
  const pit = World.hasPit(world, x, y) && !dir ? pitMaskOf(proj) : undefined
  // 돌 칸 경사는 계단(턱 줄을 그 종류의 모눈선 색으로)
  const stair = dir && id === World.Gen.KIND_STONE ? stairMasksOf(proj)[dir - 1] : undefined
  const castNW = upNW > 0 ? Math.min(CAST_MAX, upNW * CAST_PER_STEP) * 2 * proj.hh : 0
  const castNE = upNE > 0 ? CONTACT_PX : 0
  const level = hgt + 1
  const tops = dir ? proj.slopes[dir - 1]! : proj.tops
  for (let j = 0; j < tops.length; j++) {
    const p = tops[j]!
    const px = tx + p.dx
    const py = ty + p.dy
    if (px < 0 || py < 0 || px >= w || py >= b.h) continue
    let c = top
    const isShaded = p.nw < castNW || p.ne < castNE
    if (p.edge === 1) c = (!dir && lineNW) || top
    else if (p.edge === 2) c = (!dir && lineNE) || top
    else if (!dir && ((p.front === 1 && faceL(p.dx)) || (p.front === 2 && faceR(p.dx)))) c = hi
    else if (pit?.[j]) c = Palette.PIT
    else if (stair?.[j]) c = LINE
    // 무늬는 그늘 밖에서만 칠한다(그늘 속에서는 윗면 그늘 색)
    else if (mask?.[j] && !isShaded) c = accent
    if (isShaded) c = shadowOf[c]!
    const i = py * w + px
    b.px[i] = c
    b.depth[i] = base + p.depth
    b.surf[i] = SURF_TOP
    b.level[i] = level
  }
  return true
}

// 이 칸이나 앞 이웃이 경사인 옆면. 열마다 이 칸 윗면 앞 변 아래 첫 줄부터 앞 이웃 윗면 뒤 변 아래 첫 줄 앞까지 칠한다
// (평지끼리면 face 의 높이 차와 같은 줄). 변 높이는 World.Slope.riseOf. 경사 옆면은 한 단 반 이하라 단 줄·돌 세로 줄을 긋지 않는다
// (단 줄을 그으면 줄이 셀 안 여러 자리에 걸려 새 색 쌍이 생긴다).
// 왼쪽 면은 SW 변(u = 0.5 + p, w = 0.5)과 앞 이웃의 NE 변(w = −0.5), 오른쪽 면은 SE 변(u = 0.5, w = 0.5 − p)과 앞 이웃의 NW 변(u = −0.5). p = 열 가운데 / hw.
// lens 에 열마다 옆면 길이(cols 순서)를 채워 돌려준다
const LENS_L = new Int16Array(16)
const LENS_R = new Int16Array(16)

function slopedFace(b: Buffer, cols: readonly FaceColumn[], isLeft: boolean, tx: number, ty: number, z: number, dir: number, nDir: number, zN: number, loaded: boolean, base: number, color: number, proj: Proj, w: number, lens: Int16Array): Int16Array {
  const { hw, hh, step } = proj
  lens.fill(0)
  if (!loaded) return lens
  // 앞 이웃의 기준점(평지 위 꼭짓점) 줄
  const tyN = ty + hh + z - zN
  for (let i = 0; i < cols.length; i++) {
    const c = cols[i]!
    const p = (c.dx + 0.5) / hw
    const u = isLeft ? 0.5 + p : 0.5
    const v = isLeft ? 0.5 : 0.5 - p
    const e = dir ? World.Slope.riseOf(dir, u, v) : 0
    const eN = nDir ? World.Slope.riseOf(nDir, isLeft ? u : -0.5, isLeft ? -0.5 : v) : 0
    const top = ty + Math.ceil((u + v) * hh - e * step + hh - 0.5)
    const bottom = tyN + Math.ceil((isLeft ? p : -p) * hh - eN * step + hh - 0.5)
    const len = bottom - top
    if (len <= 0) continue
    lens[i] = len
    const px = tx + c.dx
    if (px < 0 || px >= w) continue
    for (let k = 0; k < len; k++) {
      const py = top + k
      if (py < 0) continue
      if (py >= b.h) break
      const j = py * w + px
      b.px[j] = color
      b.depth[j] = base + c.depth
      b.surf[j] = SURF_SIDE
      b.level[j] = 0
    }
  }
  return lens
}

// 옆면. 한 단의 맨 아래 줄마다 진한 줄을 그어 몇 단인지 셀 수 있게 한다(면의 맨 아래 줄은 아래 윗면과 맞닿아 긋지 않는다).
// brick 이면 네 열마다 세로 줄도 긋고, 단마다 두 열씩 어긋나게 해 돌 쌓은 면처럼 보이게 한다
function face(b: Buffer, cols: readonly FaceColumn[], tx: number, ty: number, height: number, base: number, color: number, stripe: number, isEdge: boolean, brick: boolean, proj: Proj, w: number): void {
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
      const isRow = isStriped && k < height - 1 && (k + 1) % step === 0
      const isJoint = brick && isStriped && ((c.dx + 16 + (Math.floor(k / step) & 1) * 2) & 3) === 0
      b.px[i] = isEdge && k === height - 1 ? Palette.EDGE : isRow || isJoint ? stripe : color
      b.depth[i] = base + c.depth
      b.surf[i] = SURF_SIDE
      b.level[i] = 0
    }
  }
}

// 버퍼에 보이는 타일만 뒤에서 앞으로 그리고 그린 타일 수를 돌려준다. 이웃이 드리우는 그늘은 theme 의 그림자 사슬로 칠한다.
// 경계 없는 월드는 끝이 없어 화면 상자만으로 범위를 잡고, 그리는 동안 없는 청크를 만들지 않는다(World.peek).
// glint: 물 반짝임 위상(없으면 반짝임을 그리지 않는다. 1 배에서만 그린다).
// 대각선 d 타일의 윗면 위 꼭짓점은 d × hh - z 이고 아래 끝은 높이와 상관없이 d × hh + 2hh + base 이하다(drawTile 의 화면 상자).
// 그래서 위쪽 여유는 높이와 상관없고, 아래쪽 여유만 맵에서 가장 높은 칸의 높이만큼 둔다
export function drawWorld(b: Buffer, world: WorldState, view: View, proj: Proj = NEAR, theme: Palette.Theme = Palette.PAPER_THEME, glint?: number): number {
  return World.peek(world, () => drawTiles(b, world, view, proj, theme, glint))
}

function drawTiles(b: Buffer, world: WorldState, view: View, proj: Proj, theme: Palette.Theme, glint: number | undefined): number {
  const hw = proj.hw
  const hh = proj.hh
  const maxZ = World.maxHeightOf(world) * proj.step
  const { x0, y0, x1, y1 } = World.bounds(world)
  const dMin = Math.max(x0 + y0, Math.floor((view.oy - 2 * hh - proj.base) / hh))
  const dMax = Math.min(x1 + y1, Math.ceil((view.oy + b.h + maxZ) / hh))
  let drawn = 0
  for (let d = dMin; d <= dMax; d++) {
    // sx = (2x - d) × hw 가 [ox - hw, ox + w + hw] 안에 드는 x
    const xLo = Math.max(x0, d - y1, Math.ceil(((view.ox - hw) / hw + d) / 2))
    const xHi = Math.min(x1, d - y0, Math.floor(((view.ox + b.w + hw) / hw + d) / 2))
    for (let x = xLo; x <= xHi; x++) if (drawTile(b, world, x, d - x, view, proj, theme, glint)) drawn++
  }
  return drawn
}

// 화면에 보이는 청크(가까운 순 아님, 대각선 행 순). drawWorld 와 같은 범위 식이고, 각 대각선 행에서 청크 경계를 넘는 칸만 짚는다.
// maxHeight: 아래쪽 여유로 둘 가장 높은 칸 높이(단)
export function visibleChunks(bw: number, bh: number, view: View, proj: Proj, maxHeight: number, size: number): Array<[number, number]> {
  const hw = proj.hw
  const hh = proj.hh
  const dMin = Math.floor((view.oy - 2 * hh - proj.base) / hh)
  const dMax = Math.ceil((view.oy + bh + maxHeight * proj.step) / hh)
  const seen = new Set<string>()
  const out: Array<[number, number]> = []
  for (let d = dMin; d <= dMax; d++) {
    const xLo = Math.ceil(((view.ox - hw) / hw + d) / 2)
    const xHi = Math.floor(((view.ox + bw + hw) / hw + d) / 2)
    for (let x = xLo; x <= xHi;) {
      const cx = Math.floor(x / size)
      const cy = Math.floor((d - x) / size)
      const key = `${cx},${cy}`
      if (!seen.has(key)) { seen.add(key); out.push([cx, cy]) }
      // 다음 청크 경계: x 가 다음 청크로 넘어가거나 y(= d - x)가 이전 청크로 넘어가는 칸
      x = Math.min((cx + 1) * size, d - cy * size + 1)
    }
  }
  return out
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

// 깊이 기준 dz 는 카메라가 보는 곳의 대각선(높이는 무시한 근사). 어느 정수든 깊이 순서는 같고, 화면 안 값이 작게 남는다
export function viewOf(cam: Camera, b: { w: number; h: number }, proj: Proj = NEAR): View {
  const c = mapOf(cam.x, cam.y, proj)
  return { ox: Math.round(c.sx) - Math.floor(b.w / 2), oy: Math.round(c.sy) - Math.floor(b.h / 2), dz: Math.round((cam.y - NEAR.hh) / NEAR.hh) }
}

export * as default from '.'
