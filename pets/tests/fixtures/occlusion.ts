import type { BiomeId } from '../../hooks/biome'
import Iso from '../../hooks/iso'
import Names from '../../hooks/names'
import Pet from '../../hooks/pet'
import Pixel, { Palette } from '../../hooks/pixel'
import Scene, { type Scene as SceneState } from '../../hooks/scene'
import Sprite from '../../hooks/sprite'
import { sessionScript } from './sim.js'

// 지형이 동물을 얼마나 가리는지 픽셀 버퍼에서 직접 센다.
// 초마다 한 번 같은 자리에 동물을 빈 버퍼와 지형 위에 그리고, 빈 버퍼에서 칠해진 동물 픽셀 중
// 지형 픽셀이 더 앞(깊이가 같거나 큼)이라 그려지지 않은 것을 가려진 픽셀로 본다.
// frames: 잰 프레임 수, center7: 동물 가운데 열에서 7 픽셀 이상 가려진 프레임 수, max7: 어느 한 열이라도 7 픽셀 이상 가려진 프레임 수,
// any: 한 픽셀이라도 가려진 프레임 수, half: 동물 픽셀의 절반 이상이 가려진 프레임 수. 깨어 있을 때와 잠들었을 때를 따로 센다
// (웅크려 자는 몸은 키가 7 픽셀 안팎이라 잠든 프레임은 any·half 로 본다)
export type Tally = { frames: number; center7: number; max7: number; any: number; half: number }
export type Occlusion = { awake: Tally; asleep: Tally }

const T0 = 1_000_000
const COLS = 40
const ROWS = 30

function hiddenOf(scene: SceneState): { center: number; max: number; hidden: number; total: number } {
  const p = scene.pet
  const proj = Iso.NEAR
  const ground = Pixel.bufferOf(COLS, ROWS, 1)
  const alone = Pixel.bufferOf(COLS, ROWS, 1)
  Pixel.clear(ground)
  Pixel.clear(alone)
  const view = Iso.viewOf(scene.cam, ground, proj)
  Iso.drawWorld(ground, scene.world, view, proj, scene.theme)
  const s = Iso.screenOf(p.x, p.y, p.z, proj)
  const x = Math.round(s.sx) - view.ox
  const y = Math.round(s.sy) - view.oy
  const depth = p.x + p.y + 0.4
  Sprite.drawPet(alone, p.species, Pet.poseOf(p), x, y, depth)
  const perCol = new Map<number, number>()
  let hidden = 0
  let total = 0
  for (let i = 0; i < alone.px.length; i++) {
    if (alone.px[i] === Palette.VOID) continue
    total++
    if (depth > ground.depth[i]!) continue
    hidden++
    const col = i % alone.w
    perCol.set(col, (perCol.get(col) ?? 0) + 1)
  }
  return { center: perCol.get(x) ?? 0, max: Math.max(0, ...perCol.values()), hidden, total }
}

// script: 'session' 은 세션 대본(90~180 초마다 턴, 사이에 잠든다), 'awake' 는 신호 없이 늘 깨어 있게(매 스텝 신호 시각을 지금으로)
export function occlusionOf(biome: BiomeId, seed: number, minutes: number, script: 'session' | 'awake'): Occlusion {
  const scene = Scene.create(seed, T0, biome)
  const cues = script === 'session' ? sessionScript(seed, minutes) : []
  const out: Occlusion = { awake: { frames: 0, center7: 0, max7: 0, any: 0, half: 0 }, asleep: { frames: 0, center7: 0, max7: 0, any: 0, half: 0 } }
  let next = 0
  const steps = Math.round((minutes * 60_000) / Names.SIM_STEP_MS)
  const every = Math.round(1000 / Names.SIM_STEP_MS)
  for (let i = 1; i <= steps; i++) {
    const t = i * Names.SIM_STEP_MS
    const now = T0 + t
    if (script === 'awake') scene.pet.lastSignalAt = now
    while (next < cues.length && cues[next]!.at <= t) {
      const kind = cues[next++]!.kind
      if (kind === 'prompt') Scene.onTurnStart(scene, now)
      else if (kind === 'stream') Pet.onStream(scene.pet, now)
      else if (kind === 'tool') Scene.onTool(scene, now)
      else Scene.onTurnEnd(scene, now)
    }
    Scene.step(scene, Names.SIM_STEP_MS, now)
    if (i % every !== 0) continue
    const h = hiddenOf(scene)
    const tally = scene.pet.isAsleep ? out.asleep : out.awake
    tally.frames++
    if (h.center >= 7) tally.center7++
    if (h.max >= 7) tally.max7++
    if (h.hidden > 0) tally.any++
    if (2 * h.hidden >= h.total) tally.half++
  }
  return out
}
