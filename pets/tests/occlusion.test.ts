import { describe, expect, test } from 'claude-code/testing'

import Biome from '../hooks/biome'
import { occlusionOf } from './fixtures/occlusion'

// 세션 대본으로 한 시간을 돌려 초마다 잰다. 깨어 있는 프레임 중 지형(높이·블록)이 동물 가운데 열을 7 픽셀 이상 가린 비율이 1 % 이하.
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
