import Band from '../../hooks/band'
import Rng from '../../hooks/rng'
import Scene, { type Zoom } from '../../hooks/scene'

// 시드 3 × 시각 3 × 줌 3 의 패널 셀과 시드 3 × 시각 3 의 띠 셀을 해시로 줄인다.
// 색 표 구조를 바꿀 때 화면이 한 셀도 달라지지 않았는지 이 값으로 본다
export function frameHashes(): string[] {
  const out: string[] = []
  const zooms: Zoom[] = ['far', 1, 2]
  for (const seed of [7, 42, 1234]) {
    for (const zoom of zooms) {
      const scene = Scene.create(seed, 0)
      let now = 0
      for (let i = 1; i <= 240; i++) {
        now += 33
        if (i === 5) Scene.onTurnStart(scene, now)
        if (i === 50) Scene.onTool(scene, now)
        if (i === 150) Scene.onTurnEnd(scene, now)
        Scene.step(scene, 33, now)
        if (i === 30 || i === 90 || i === 240) out.push(`pane ${seed} ${zoom} ${i} ${Rng.hashOf(Scene.compose(scene, 40, 30, zoom)).toString(16)}`)
      }
    }
    const band = Band.create(seed, 0)
    let now = 0
    for (let i = 1; i <= 240; i++) {
      now += 66
      if (i === 5) Band.onTurnStart(band, now)
      if (i === 50) Band.onTool(band, now)
      if (i === 150) Band.onTurnEnd(band, now)
      Band.step(band, 66, now, i < 150)
      if (i === 30 || i === 90 || i === 240) out.push(`band ${seed} ${i} ${Rng.hashOf(Band.compose(band, 80)).toString(16)}`)
    }
  }
  return out
}
