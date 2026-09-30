import { describe, expect, test } from 'claude-code/testing'

import Iso from '../hooks/iso'
import Pet, { type Pet as PetState, type PoseName, type Gait, type Dir, type ActName } from '../hooks/pet'
import Pixel, { Palette } from '../hooks/pixel'
import Scene from '../hooks/scene'
import Species, { type SpeciesDef } from '../hooks/species'
import Sprite, { type PetPose } from '../hooks/sprite'
import World from '../hooks/world'

const B = Palette.bank(0)
const R = Palette.Role

const POSES: readonly PoseName[] = [
  'stand', 'look', 'pant', 'sniff', 'dig', 'bow', 'shake', 'scratch', 'yawn', 'stretch',
  'sit', 'frontSit', 'lie', 'lieRest', 'sleep', 'wake',
  'roll', 'drink', 'chew', 'tilt', 'alert', 'beg', 'droop', 'groom',
]
const GAITS: readonly Gait[] = ['walk', 'trot', 'run', 'sniff', 'creep']
const DIRS: readonly Dir[] = ['SE', 'SW', 'NW', 'NE']

// 맵은 한 번만 만든다(모습을 훑는 동안 강아지를 수천 번 새로 만든다)
const WORLD = World.create(7)

function petOfSpecies(species: SpeciesDef): PetState {
  return Pet.create(WORLD, 7, 0, species)
}

const petOf = () => petOfSpecies(Species.DOG)

// 자세 × 방향 × 시계(꼬리·숨·단계 시간) × 걸음을 훑어 scene 이 그릴 수 있는 모습을 모은다. 헤엄치는 종은 깊은 물에 뜬 모습(자세마다, 헤엄 중)도
function allPoses(species: SpeciesDef = Species.DOG): Array<{ name: string; pose: PetPose }> {
  const petOf = () => petOfSpecies(species)
  const out: Array<{ name: string; pose: PetPose }> = []
  for (const dir of DIRS) {
    for (let ms = 0; ms < 3000; ms += 37) {
      for (const name of POSES) {
        const p = petOf()
        p.dir = dir
        p.pose = name
        p.breath = ms
        p.act.t = ms % 900
        p.excite = ms % 2 === 0 ? 0.9 : 0.2
        p.blinkMs = ms % 3 === 0 ? 50 : 0
        out.push({ name, pose: Pet.poseOf(p) })
      }
      for (const gait of GAITS) {
        const p = petOf()
        p.dir = dir
        p.speed = 2
        p.gait = gait
        p.stride = ms / 400
        p.breath = ms
        p.landMs = ms % 5 === 0 ? 50 : 0
        out.push({ name: gait, pose: Pet.poseOf(p) })
      }
      if (!species.abilities.swim) continue
      for (const name of [...POSES, 'swimming']) {
        const p = petOf()
        p.dir = dir
        p.swimming = true
        p.breath = ms
        p.blinkMs = ms % 3 === 0 ? 50 : 0
        if (name === 'swimming') { p.speed = 1; p.stride = ms / 400 } else p.pose = name as PoseName
        out.push({ name: `swim ${name}`, pose: Pet.poseOf(p) })
      }
    }
    const hop = petOf()
    hop.dir = dir
    for (const t of [10, 60, 90]) {
      hop.hop = { fx: 0, fy: 0, tx: 1, ty: 0, z0: 0, z1: 0, t, dur: 100, peak: 5, isPath: true }
      out.push({ name: 'hop', pose: Pet.poseOf(hop) })
    }
    const crouch = petOf()
    crouch.dir = dir
    crouch.crouchMs = 50
    out.push({ name: 'crouch', pose: Pet.poseOf(crouch) })
  }
  return out
}

function pixelsOf(pose: PetPose, species: SpeciesDef = Species.DOG): Map<string, number> {
  const m = new Map<string, number>()
  Sprite.paintPet(species, pose, (x, y, c) => m.set(`${x},${y}`, c))
  return m
}

describe('sprite', () => {
  // 종마다 한 테스트(모습 수천 개를 훑어 한 테스트에 모으면 엔진 시간 한도를 넘는다)
  for (const species of Object.values(Species.SPECIES)) {
    test(`the ${species.id} draws every pose, direction and gait inside 16 × 13 pixels, above the floor and never empty`, async () => {
      for (const { name, pose } of allPoses(species)) {
        let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity
        const painted = pixelsOf(pose, species)
        for (const key of painted.keys()) {
          const [x, y] = key.split(',').map(Number) as [number, number]
          x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y)
        }
        const fits = painted.size >= 20 && x1 - x0 + 1 <= 16 && y1 - y0 + 1 <= 13 && y1 <= -1
        if (!fits) throw new Error(`${species.id} ${name}: ${painted.size} px, x ${x0}..${x1}, y ${y0}..${y1}`)
        expect(fits).toBe(true)
      }
    })
  }

  test('every painted color has a real RGB value', async () => {
    for (const { name, pose } of allPoses()) {
      for (const c of pixelsOf(pose).values()) {
        const rgb = Palette.PAPER_THEME.rgb[c]
        if (rgb === undefined || rgb === 0xff00ff) throw new Error(`${name}: palette ${c}`)
      }
    }
  })

  test('the brown ear and the collar show in every pose, including the back view and the curled sleep', async () => {
    for (const { name, pose } of allPoses()) {
      const colors = new Set(pixelsOf(pose).values())
      if (!colors.has(B + R.ear) || !colors.has(B + R.collar)) throw new Error(`${name}: ear or collar missing`)
      expect(colors.has(B + R.ear) && colors.has(B + R.collar)).toBe(true)
    }
  })

  test('facing left is the mirror image of facing right', async () => {
    for (const name of POSES) {
      const p = petOf()
      p.pose = name
      p.dir = 'SE'
      const right = Pet.poseOf(p)
      const mirrored = new Map<string, number>()
      for (const [k, c] of pixelsOf(right)) {
        const [x, y] = k.split(',').map(Number)
        mirrored.set(`${-x!},${y}`, c)
      }
      const left = pixelsOf({ ...right, flip: true })
      // 정면 모습은 반전하지 않는다
      if (right.body.startsWith('front')) continue
      expect([...left.entries()].sort()).toEqual([...mirrored.entries()].sort())
    }
  })

  test('closing the eyes removes the black eye pixels, and the tongue adds pink', async () => {
    const p = petOf()
    const open = Pet.poseOf(p)
    const count = (pose: PetPose, c: number) => [...pixelsOf(pose).values()].filter(v => v === c).length
    expect(count({ ...open, eyeClosed: true }, B + R.eye) < count(open, B + R.eye)).toBe(true)
    expect(count({ ...open, eyeClosed: true }, B + R.lid) > 0).toBe(true)
    expect(count(open, B + R.tongue)).toBe(0)
    expect(count({ ...open, tongue: true }, B + R.tongue)).toBe(1)
    expect(count({ ...open, mouthOpen: true }, B + R.tongue)).toBe(2)
  })

  test('behind a nearer surface only the dark edges show through, every other pixel', async () => {
    const b = Pixel.bufferOf(30, 12, 1)
    Pixel.clear(b)
    b.px.fill(Palette.kind(0))
    b.depth.fill(100)
    const p = petOf()
    Sprite.drawPet(b, p.species, Pet.poseOf(p), 15, 20, 10)
    let heavy = 0
    for (let i = 0; i < b.px.length; i++) {
      const c = b.px[i]!
      expect(c === Palette.kind(0) || c === Palette.LINE_HEAVY).toBe(true)
      if (c === Palette.LINE_HEAVY) {
        heavy++
        const x = i % b.w
        const y = Math.floor(i / b.w)
        expect((x + y) & 1).toBe(0)
      }
    }
    expect(heavy > 10).toBe(true)
  })
})

// 한 자세를 시계를 돌려 그린 프레임들(픽셀 목록 문자열). 감정 표시는 나이를 돌린다
function framesOf(p: PetState): Set<string> {
  const out = new Set<string>()
  for (let ms = 0; ms < 1500; ms += 37) {
    p.breath = ms
    p.act.t = ms % 700
    if (p.emote) p.emote.age = ms % 1100
    out.add([...pixelsOf(Pet.poseOf(p)).entries()].sort().join(';'))
  }
  return out
}

describe('new poses', () => {
  test('each reaction and rolling draws its own pose, not the stand-in it replaced: belly, drooped ears, raised paws, tilted head, raised ears, barking mouth', async () => {
    const cases: Array<[ActName, number, PoseName]> = [
      ['rollOver', 1, 'lie'], ['sulk', 0, 'lie'], ['beg', 1, 'frontSit'], ['puzzled', 1, 'look'], ['alert', 0, 'stand'], ['bark', 1, 'pant'],
    ]
    for (const [name, i, standIn] of cases) {
      const p = petOf()
      p.act = Pet.build(name, p, WORLD)
      const step = p.act.steps[i]!
      if (step.k !== 'pose') throw new Error(`${name}: step ${i} is ${step.k}`)
      p.dir = 'SE'
      p.pose = step.pose
      p.emote = step.emote ? Pet.Fx.emoteOf(step.emote, 1100) : undefined
      const own = framesOf(p)
      p.pose = standIn
      const old = framesOf(p)
      const same = [...own].filter(f => old.has(f)).length
      expect(`${name} ${step.pose}: ${same} of ${own.size} frames drawn like ${standIn}`).toBe(`${name} ${step.pose}: 0 of ${own.size} frames drawn like ${standIn}`)
    }
  })

  test('stalking creeps (low, slow gait), and pondering shows the dots every 2.5 s for its whole 20 s', async () => {
    let stalks = 0
    for (let seed = 1; seed < 400 && stalks === 0; seed++) {
      const p = Pet.create(WORLD, seed, 0, Species.DOG)
      const a = Pet.build('play', p, WORLD)
      const go = a.steps.find(s => s.k === 'go')
      if (!go || go.k !== 'go' || !a.steps.some(s => s.k === 'pounce')) continue
      stalks++
      expect(go.gait).toBe('creep')
    }
    expect(stalks).toBe(1)
    const ponder = Pet.build('ponder', petOf(), WORLD).steps
    const dots = ponder.filter(s => s.k === 'pose' && s.emote === 'dots')
    expect(dots.length).toBe(8)
    expect(ponder.reduce((t, s) => t + (s.k === 'pose' ? s.ms : 0), 0)).toBe(20_000)
  })

  test('a carried ball is drawn over the mouth cell of the head, facing either side and bowing', async () => {
    const face = Species.DOG.sprite.heads!.face
    const mrow = face.rows.findIndex(r => r.includes('M'))
    const mcol = face.rows[mrow]!.indexOf('M')
    for (const [dir, pose] of [['SE', 'stand'], ['SW', 'stand'], ['SE', 'bow'], ['SW', 'bow']] as const) {
      const scene = Scene.create(7, 0)
      const p = scene.pet
      p.dir = dir
      p.pose = pose
      p.carrying = true
      p.blinkMs = 0
      Scene.compose(scene, 60, 30, 1)
      const b = scene.buf!
      const view = Iso.viewOf(scene.cam, b, Iso.NEAR)
      const s = Iso.screenOf(p.x, p.y, p.z, Iso.NEAR)
      const d = Pet.poseOf(p)
      const lx = Species.DOG.sprite.anchors.stand.head[0] + d.bodyDx + d.headDx + mcol - face.ax
      const ly = Species.DOG.sprite.anchors.stand.head[1] + d.bodyDy + d.headDy + Math.round(d.tilt) + mrow - face.ay
      const X = Math.round(s.sx) - view.ox + (d.flip ? -lx : lx)
      const Y = Math.round(s.sy) - view.oy + ly
      const c = b.px[Y * b.w + X]
      expect(`${dir} ${pose} ${c === Palette.BALL || c === Palette.BALL_HI}`).toBe(`${dir} ${pose} true`)
    }
  })
})
