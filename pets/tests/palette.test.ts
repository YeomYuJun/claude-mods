import { describe, expect, test } from 'claude-code/testing'

import Iso from '../hooks/iso'
import Pixel, { Palette, SURF_TOP } from '../hooks/pixel'
import Scene, { type Zoom } from '../hooks/scene'
import World from '../hooks/world'
import Fixtures from './fixtures'

// 프레임 하나가 쓰는 서로 다른 (전경, 배경) 쌍의 수
function pairsOf(cells: string): number {
  const words = Fixtures.wordsOf(cells)
  const pairs = new Set<string>()
  for (let i = 0; i + 2 < words.length; i += 3) pairs.add(`${words[i + 1]},${words[i + 2]}`)
  return pairs.size
}

function lumaOf(rgb: number): number {
  return 0.299 * ((rgb >> 16) & 255) + 0.587 * ((rgb >> 8) & 255) + 0.114 * (rgb & 255)
}

describe('palette', () => {
  test('the slot layout stays below the transparent index and its groups do not overlap', async () => {
    const theme = Palette.PAPER_THEME
    expect(theme.rgb.length).toBe(256)
    expect(theme.shadowOf.length).toBe(256)
    const last = Palette.bank(Palette.BANK_COUNT - 1) + Palette.BANK_SIZE - 1
    expect(last < Palette.TRANSPARENT).toBe(true)
    const groups: Array<[number, number]> = [
      [Palette.kind(0), Palette.KIND_SIZE * Palette.KIND_COUNT], [Palette.LINE_HEAVY, 4], [Palette.material(0), 4 * Palette.MATERIAL_COUNT],
      [Palette.WATER, 8], [Palette.PROP, Palette.PROP_COUNT], [Palette.DUST, 12], [Palette.bank(0), Palette.BANK_SIZE * Palette.BANK_COUNT],
    ]
    for (let i = 1; i < groups.length; i++) expect(groups[i - 1]![0] + groups[i - 1]![1]).toBe(groups[i]![0])
    for (const s of theme.shadowOf) expect(s < Palette.TRANSPARENT || s === Palette.TRANSPARENT).toBe(true)
  })

  test('no frame paints a slot the set or the dog left unfilled', async () => {
    for (const seed of [7, 42]) {
      for (const zoom of ['far', 1, 2] as Zoom[]) {
        const scene = Scene.create(seed, 0)
        let now = 0
        for (let i = 1; i <= 120; i++) {
          now += 33
          if (i === 5) Scene.onTurnStart(scene, now)
          if (i === 50) Scene.onTool(scene, now)
          if (i === 90) Scene.onTurnEnd(scene, now)
          Scene.step(scene, 33, now)
          if (i % 10 !== 0) continue
          const words = Fixtures.wordsOf(Scene.compose(scene, 60, 30, zoom))
          for (let j = 0; j + 2 < words.length; j += 3) {
            expect(words[j + 1] === Palette.UNSET || words[j + 2] === Palette.UNSET).toBe(false)
          }
        }
      }
    }
  })

  test('a frame uses at most 512 distinct color pairs for any seed, zoom and panel size', async () => {
    const zooms: Zoom[] = ['far', 1, 2]
    for (const seed of [7, 42, 1234]) {
      for (const zoom of zooms) {
        for (const [cols, rows] of [[40, 30], [120, 60]] as const) {
          const scene = Scene.create(seed, 0)
          let now = 0
          let most = 0
          // 신호를 섞어 감정 표시·흙·먼지가 화면에 있는 프레임도 센다
          for (let i = 1; i <= 90; i++) {
            now += 33
            if (i === 5) Scene.onTurnStart(scene, now)
            if (i === 50) Scene.onTool(scene, now)
            Scene.step(scene, 33, now)
            if (i % 15 === 0) most = Math.max(most, pairsOf(Scene.compose(scene, cols, rows, zoom)))
          }
          expect(most <= 512).toBe(true)
          expect(most > 1).toBe(true)
        }
      }
    }
  })

  test('every color the map paints on a top face has a darker shadow color', async () => {
    const tops = new Set<number>()
    for (const proj of [Iso.NEAR, Iso.FAR]) {
      for (const seed of [3, 7, 11, 42]) {
        const { b } = Fixtures.drawAround(World.create(seed), proj)
        for (let i = 0; i < b.px.length; i++) if (b.surf[i] === SURF_TOP) tops.add(b.px[i]!)
      }
    }
    expect(tops.size > 5).toBe(true)
    const { rgb, shadowOf } = Palette.PAPER_THEME
    for (const c of tops) expect(lumaOf(rgb[shadowOf[c]!]!) < lumaOf(rgb[c]!)).toBe(true)
  })
})
