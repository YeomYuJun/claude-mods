import { describe, expect, test } from 'claude-code/testing'

import Biome from '../hooks/biome'
import Iso from '../hooks/iso'
import { Palette, SURF_TOP } from '../hooks/pixel'
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

// 상대 휘도와 대비(WCAG)
function luminanceOf(rgb: number): number {
  const lin = (c: number) => { const v = c / 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4 }
  return 0.2126 * lin((rgb >> 16) & 255) + 0.7152 * lin((rgb >> 8) & 255) + 0.0722 * lin(rgb & 255)
}

function contrastOf(a: number, b: number): number {
  const x = luminanceOf(a)
  const y = luminanceOf(b)
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05)
}

// 터미널 배경: 검정(Windows Terminal), 짙은 회색(VS Code), 흰색
const BACKGROUNDS = [0x0c0c0c, 0x1e1e1e, 0xffffff] as const

describe('palette', () => {
  test('the slot layout stays below the transparent index and its groups do not overlap', async () => {
    const theme = Palette.PAPER_THEME
    expect(theme.rgb.length).toBe(256)
    expect(theme.shadowOf.length).toBe(256)
    const last = Palette.bank(Palette.BANK_COUNT - 1) + Palette.BANK_SIZE - 1
    expect(last < Palette.SHADE_END).toBe(true)
    expect(Palette.SHADE_END < Palette.TRANSPARENT).toBe(true)
    const groups: Array<[number, number]> = [
      [Palette.kind(0), Palette.KIND_SIZE * Palette.KIND_COUNT], [Palette.LINE_HEAVY, 4], [Palette.material(0), 4 * Palette.MATERIAL_COUNT],
      [Palette.WATER, 8], [Palette.PROP, Palette.PROP_COUNT], [Palette.DUST, 12], [Palette.bank(0), Palette.BANK_SIZE * Palette.BANK_COUNT],
    ]
    for (let i = 1; i < groups.length; i++) expect(groups[i - 1]![0] + groups[i - 1]![1]).toBe(groups[i]![0])
    for (const b of Biome.BIOMES) for (const s of Biome.themeOf(b.id).shadowOf) expect(s <= Palette.TRANSPARENT).toBe(true)
  })

  test('no frame of any set paints a slot the set or the dog left unfilled', async () => {
    for (const b of Biome.BIOMES) {
      for (const zoom of ['far', 1, 2] as Zoom[]) {
        const scene = Scene.create(42, 0, b.id)
        let now = 0
        for (let i = 1; i <= 120; i++) {
          now += 33
          if (i === 5) Scene.onTurnStart(scene, now)
          if (i === 50) Scene.onTool(scene, now)
          if (i === 90) Scene.onTurnEnd(scene, now)
          Scene.step(scene, 33, now)
          if (i % 20 !== 0) continue
          const words = Fixtures.wordsOf(Scene.compose(scene, 60, 30, zoom))
          for (let j = 0; j + 2 < words.length; j += 3) {
            if (words[j + 1] === Palette.UNSET || words[j + 2] === Palette.UNSET) expect(`${b.id} ${zoom} ${i} unset`).toBe('')
          }
        }
      }
    }
  })

  for (const b of Biome.BIOMES) {
    test(`a ${b.id} frame uses at most 512 distinct color pairs for any seed, zoom and panel size`, async () => {
      for (const seed of [7, 42, 1234]) {
        for (const zoom of ['far', 1, 2] as Zoom[]) {
          for (const [cols, rows] of [[40, 30], [120, 60]] as const) {
            const scene = Scene.create(seed, 0, b.id)
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
  }

  test('in every set, every color the map paints on a top face has a darker shadow color', async () => {
    const tops = new Set<number>()
    for (const proj of [Iso.NEAR, Iso.FAR]) {
      for (const seed of [3, 7, 11, 42]) {
        const { b } = Fixtures.drawAround(World.create(seed), proj)
        for (let i = 0; i < b.px.length; i++) if (b.surf[i] === SURF_TOP) tops.add(b.px[i]!)
      }
    }
    expect(tops.size > 5).toBe(true)
    expect(tops.has(Palette.RIM)).toBe(true)
    // 그늘 위에 강아지 그림자가 지면 그림자 색의 그림자를 칠한다
    const k = Palette.kind(0)
    for (const c of [k + Palette.Top.TOP0_SH, k + Palette.Top.TOP1_SH, k + Palette.Top.LINE_SH, Palette.LINE_HEAVY_SH]) tops.add(c)
    for (const b of Biome.BIOMES) {
      const { rgb, shadowOf } = Biome.themeOf(b.id)
      for (const c of tops) expect(`${b.id} ${c} ${Palette.lumaOf(rgb[shadowOf[c]!]!) < Palette.lumaOf(rgb[c]!)}`).toBe(`${b.id} ${c} true`)
    }
  })

  test('in every set the top faces get brighter with height, and the front-edge highlight is brighter still', async () => {
    const k = Palette.kind(0)
    const T = Palette.Top
    for (const b of Biome.BIOMES) {
      const { rgb } = Biome.themeOf(b.id)
      const ramp = [T.TOP0, T.TOP1, T.TOP2, T.TOP3, T.TOP4, T.HILITE].map(i => Palette.lumaOf(rgb[k + i]!))
      for (let i = 1; i < ramp.length; i++) expect(`${b.id} ${i} ${ramp[i]! > ramp[i - 1]!}`).toBe(`${b.id} ${i} true`)
    }
  })

  test('the map edge stands out at least 3 : 1 on black, dark grey and white terminals in every set, and so does the back rim outside the graph-paper set', async () => {
    for (const b of Biome.BIOMES) {
      const { rgb } = Biome.themeOf(b.id)
      const slots = b.id === Biome.DEFAULT ? [Palette.EDGE] : [Palette.EDGE, Palette.RIM]
      for (const slot of slots) {
        for (const bg of BACKGROUNDS) expect(`${b.id} ${slot} ${bg.toString(16)} ${contrastOf(rgb[slot]!, bg) >= 3}`).toBe(`${b.id} ${slot} ${bg.toString(16)} true`)
      }
    }
  })

  test('changing the set changes the map colors but not the dog colors, rebuilds the map, and changing back rebuilds the same graph-paper frame', async () => {
    const paper = Biome.themeOf('paper')
    const forest = Biome.themeOf('forest')
    const k = Palette.kind(0)
    expect(forest.rgb[k + Palette.Top.TOP0] === paper.rgb[k + Palette.Top.TOP0]).toBe(false)
    for (let i = 0; i < Palette.BANK_SIZE; i++) expect(forest.rgb[Palette.bank(0) + i]).toBe(paper.rgb[Palette.bank(0) + i])
    const scene = Scene.create(7, 0)
    const before = Scene.compose(scene, 40, 30, 1)
    const paperWorld = scene.world
    Scene.setBiome(scene, 'forest', 0)
    expect(scene.world === paperWorld).toBe(false)
    expect(scene.world.w).toBe(64)
    expect(Scene.compose(scene, 40, 30, 1) === before).toBe(false)
    Scene.setBiome(scene, 'paper', 0)
    expect(Scene.compose(scene, 40, 30, 1)).toBe(before)
  })
})
