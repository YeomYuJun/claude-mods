// 경사 칸(순수 모듈). 생성기가 만든 높이는 바꾸지 않고, 한 단 차 자리 중 아래 규칙에 맞는 칸을 경사로 둔다.
// 경사 윗면은 낮은 변이 칸 높이 h, 높은 변(방향 쪽)이 h + 1 인 평면이다. 걷는 높이·걷는 칸·길 찾기 가능 여부는 경사가 없을 때와 같다.
//
// 규칙: 칸이 물·블록·장애물 소품이 아니고, 네 이웃 중 걷는 높이가 더 높은 것이 정확히 하나이며 그것이 한 단 높은 땅(블록·장애물 소품 아님)이고,
// 반대쪽 이웃이 블록·장애물 소품이 아니다. 두 방향이 높은 모서리 칸은 단으로 남긴다.
// 반대쪽 이웃을 들어갈 수 있는 칸으로 두는 까닭: 공이 경사를 굴러 내려가 그 칸에서 멈춘다(경사 위에서 막혀 멈추지 않는다).
// 장애물은 OBSTACLE 플래그(나무를 켤 때만 선다)가 아니라 소품 번호로 본다. 그래서 나무를 켜든 끄든 경사 자리가 같다.

// 방향 번호 1..4 = +x, +y, −x, −y(World.NEIGHBORS 순서 + 1). 0 은 평지
export const DIRS: ReadonlyArray<readonly [number, number]> = [[1, 0], [0, 1], [-1, 0], [0, -1]]

// 칸 플래그에서 방향이 드는 비트(5~7)
export const FORM_SHIFT = 5
export const FORM_MASK = 7 << FORM_SHIFT

// 배열 칸 i(행 폭 stride)의 경사 방향. walkH: 걷는 높이(물이면 수면), wet: 물이면 0 이 아님, solid: 블록이나 장애물 소품이면 0 이 아님.
// 네 이웃이 배열 안에 있어야 한다
export function slopeOf(walkH: ArrayLike<number>, wet: ArrayLike<number>, solid: ArrayLike<number>, i: number, stride: number): number {
  if (wet[i] || solid[i]) return 0
  const h = walkH[i]!
  let up = -1
  for (let k = 0; k < 4; k++) {
    const [dx, dy] = DIRS[k]!
    if (walkH[i + dy * stride + dx]! > h) {
      if (up >= 0) return 0
      up = k
    }
  }
  if (up < 0) return 0
  const [dx, dy] = DIRS[up]!
  const hi = i + dy * stride + dx
  if (solid[hi] || walkH[hi] !== h + 1 || solid[i - dy * stride - dx]) return 0
  return up + 1
}

// 이어진 경사만 남긴다: 옆(방향과 수직) 이웃 중 하나가 같은 방향 경사일 때만 경사. base 는 slopeOf 결과 배열(이웃 칸까지 채워져 있어야 한다).
// 홀로 선 경사는 양옆에 삼각형 옆면이 붙어 뾰족한 이 모양이 되고, 등고선을 따라 이 모양이 톱니처럼 늘어선다
export function stripOf(base: ArrayLike<number>, i: number, stride: number): number {
  const d = base[i]!
  if (!d) return 0
  const [dx, dy] = DIRS[d - 1]!
  const side = dy + dx * stride
  return base[i + side] === d || base[i - side] === d ? d : 0
}

// 경사 칸 안 (u, w)(칸 가운데 기준 −0.5 ~ 0.5)의 윗면 높이 − 칸 높이(단, 0 ~ 1)
export function riseOf(dir: number, u: number, w: number): number {
  const [dx, dy] = DIRS[dir - 1]!
  return u * dx + w * dy + 0.5
}
