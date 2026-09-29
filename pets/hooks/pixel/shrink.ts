// 그림을 줄인다(원거리·맵 보기의 작은 동물, 맵 보기의 소품). by = 2 면 2 × 2 픽셀이 한 픽셀, 1.5 면 3 × 3 픽셀이 2 × 2 픽셀이 된다.
// 기준점에서 가로 lx 떨어진 픽셀은 [lx, lx + 1) 을 덮고, 줄인 픽셀 bx 는 [bx × by, (bx + 1) × by) 를 덮는다(세로는 rowShift 만큼 내려 잰다).
// 줄인 픽셀마다 겹친 넓이로 색의 무게를 센다. 좌우 반전은 줄인 뒤에 한다(반전 축이 열 0 이라 반전한 그림을 줄이면 1 픽셀 밀린다).

export type Small = { w: number; h: number; ax: number; ay: number; px: Uint8Array }

export type ShrinkOptions = {
  // 줄이는 비: 2(절반) 또는 1.5(2/3)
  by: number
  // 줄인 픽셀 넓이 중 불투명 픽셀이 덮은 비율이 이 값 이상이면 칠한다. 0 이면 조금이라도 덮으면 칠한다
  minCover: number
  // 1 이면 기준점 줄이 줄인 줄 0 의 맨 아래에 온다(기준점 줄에 그림 바닥이 있는 소품). 0 이면 기준점 한 줄 위가 줄인 줄 -1 의 맨 아래다(발이 기준점 한 줄 위인 동물)
  rowShift: 0 | 1
  // 한 픽셀을 WEAK_WEIGHT 로 세는 색. 윤곽처럼 많아도 줄인 그림을 덮으면 안 되는 색
  weak?: readonly number[]
}

// 약한 색 픽셀 하나의 무게: 약한 색 둘은 다른 색 하나에 지고, 약한 색 셋은 다른 색 하나를 이긴다
const WEAK_WEIGHT = 0.45

// [a0, a1) 과 [b0, b1) 이 겹치는 길이
function overlap(a0: number, a1: number, b0: number, b1: number): number {
  return Math.max(0, Math.min(a1, b1) - Math.max(a0, b0))
}

// src 의 clear 번호는 투명이다. 결과의 투명도 clear 다
export function shrink(src: { w: number; h: number; px: Uint8Array }, ax: number, ay: number, clear: number, opts: ShrinkOptions): Small {
  const s = opts.by
  const shift = opts.rowShift
  const bx0 = Math.floor(-ax / s)
  const bx1 = Math.ceil((src.w - ax) / s) - 1
  const by0 = Math.floor((-ay + shift) / s)
  const by1 = Math.ceil((src.h - ay + shift) / s) - 1
  const w = bx1 - bx0 + 1
  const h = by1 - by0 + 1
  const px = new Uint8Array(w * h).fill(clear)
  const need = opts.minCover * s * s
  const colors: number[] = []
  const weights: number[] = []
  for (let by = by0; by <= by1; by++) {
    const r0 = by * s
    const r1 = r0 + s
    for (let bx = bx0; bx <= bx1; bx++) {
      const c0 = bx * s
      const c1 = c0 + s
      colors.length = 0
      weights.length = 0
      let cover = 0
      for (let ly = Math.floor(r0) - shift; ly + shift < r1; ly++) {
        const y = ay + ly
        if (y < 0 || y >= src.h) continue
        const oy = overlap(ly + shift, ly + shift + 1, r0, r1)
        for (let lx = Math.floor(c0); lx < c1; lx++) {
          const x = ax + lx
          if (x < 0 || x >= src.w) continue
          const c = src.px[y * src.w + x]!
          if (c === clear) continue
          const area = oy * overlap(lx, lx + 1, c0, c1)
          if (area <= 0) continue
          cover += area
          const k = colors.indexOf(c)
          const weight = area * (opts.weak?.includes(c) ? WEAK_WEIGHT : 1)
          if (k < 0) { colors.push(c); weights.push(weight) } else weights[k]! += weight
        }
      }
      if (cover <= 0 || cover < need) continue
      // 가장 무거운 색. 같으면 먼저 나온 색(위 줄, 왼쪽)
      let best = 0
      for (let k = 1; k < colors.length; k++) if (weights[k]! > weights[best]!) best = k
      px[(by - by0) * w + (bx - bx0)] = colors[best]!
    }
  }
  return { w, h, ax: -bx0, ay: -by0, px }
}
