import { describe, expect, test } from 'claude-code/testing'

import Biome from '../hooks/biome'
import { obstacleStepsOf, occlusionOf } from './fixtures/occlusion'

// 세션 대본으로 한 시간을 돌려 초마다 잰다. 동물 가운데 열이 7 픽셀 이상 가린 프레임의 비율:
// 지형(높이·블록)만 그리면 깨어 있을 때 1 % 이하, 패널처럼 소품까지 그리면 깨어 있을 때 2 % 이하·잠들었을 때 5 % 이하.
// 세트마다 테스트를 나눈다(한 시간 한 번이 테스트 하나)
describe('terrain hiding the dog', () => {
  for (const b of Biome.BIOMES) {
    test(`${b.id}: over an hour of sessions the terrain hides at least 7 px of the awake dog's middle column in at most 1 % of frames`, async () => {
      const { awake } = occlusionOf(b.id, 7, 60, 'session')
      expect(awake.frames > 1000).toBe(true)
      expect(`${b.id} ${awake.center7} / ${awake.frames} ${awake.center7 <= awake.frames * 0.01}`).toBe(`${b.id} ${awake.center7} / ${awake.frames} true`)
    })
  }
})

describe('terrain and props hiding the dog', () => {
  for (const b of Biome.BIOMES) {
    test(`${b.id}: with trees, rocks and decorations drawn and hollowed, at least 7 px of the middle column is hidden in at most 2 % of awake and 5 % of asleep frames`, async () => {
      const { awake, asleep } = occlusionOf(b.id, 7, 60, 'session', true)
      expect(awake.frames > 1000 && asleep.frames > 500).toBe(true)
      expect(`${b.id} awake ${awake.center7} / ${awake.frames} ${awake.center7 <= awake.frames * 0.02}`).toBe(`${b.id} awake ${awake.center7} / ${awake.frames} true`)
      expect(`${b.id} asleep ${asleep.center7} / ${asleep.frames} ${asleep.center7 <= asleep.frames * 0.05}`).toBe(`${b.id} asleep ${asleep.center7} / ${asleep.frames} true`)
    })
  }
})

describe('trees block the way', () => {
  for (const b of Biome.BIOMES) {
    test(`${b.id}: over ten minutes of three seeds neither the dog nor the ball is ever on a tree or rock tile`, async () => {
      for (const seed of [7, 42, 1234]) {
        const r = obstacleStepsOf(b.id, seed, 10)
        expect(`${b.id} ${seed} pet ${r.pet} ball ${r.ball}`).toBe(`${b.id} ${seed} pet 0 ball 0`)
      }
    })
  }
})
