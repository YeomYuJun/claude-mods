// 소품 그림(순수 데이터): 세트마다 한 종의 나무, 바위, 꽃, 풀 포기, 버섯, 물가의 갈대와 연잎, 강아지가 물어 옮기는 나뭇가지, 모래의 조개와 마른 덤불. 가까운 배율(near)과 먼 배율(far) 두 벌이다.
// 빛은 왼쪽 위에서 온다. 잎은 왼쪽 위가 밝고, 오른쪽 아래와 바깥 윤곽은 어두운 잎색이다. 어두운 잎색은 풀밭 윗면과 명도 차가 커서 윤곽이 보인다.
//
// 비트맵 좌표: (ax, ay) 는 rows 안의 기준 픽셀이고 타일 윗면 마름모의 가운데 점에 놓인다.
// 나무는 줄기 맨 아래(선인장은 밑동), 바위는 밑동, 꽃·풀·버섯·갈대·연잎·나뭇가지·조개·마른 덤불은 맨 아래 줄 가운데 픽셀이 기준이다. 글자:
//   . 투명  H 밝은 잎  L 잎  D 어두운 잎(윤곽)  T 줄기  K 줄기 그늘
//   r 바위 밝은 면  R 바위  k 바위 그늘  a 꽃잎 1  b 꽃잎 2  c 꽃잎 3(가운데 송이)  g 풀 포기  m 버섯 갓  s 버섯 대·갓 점
//   e 갈대 줄기  f 갈대 이삭  p 연잎  q 연꽃  w 나무에 쌓인 눈

import type { BiomeId } from '../biome'

export type PropRole = 'leafHi' | 'leaf' | 'leafDark' | 'trunk' | 'trunkDark' | 'rockHi' | 'rock' | 'rockDark' | 'petalA' | 'petalB' | 'petalMid' | 'tuft' | 'cap' | 'stem' | 'reed' | 'reedTip' | 'pad' | 'padFlower' | 'snow'
export type PropArtId = 'broadleaf' | 'pine' | 'oak' | 'willow' | 'paperTree' | 'palm' | 'snowPine' | 'cactus' | 'rock' | 'flower' | 'tuft' | 'mushroom' | 'reed' | 'lily' | 'branch' | 'shell' | 'dryBush'
export type PropBitmap = { ax: number; ay: number; rows: readonly string[] }
// far 가 없으면 먼 배율에서 그리지 않는다
export type PropArt = { near: PropBitmap; far?: PropBitmap }

export const PROP_CODES: Readonly<Record<string, PropRole>> = {
  H: 'leafHi', L: 'leaf', D: 'leafDark', T: 'trunk', K: 'trunkDark',
  r: 'rockHi', R: 'rock', k: 'rockDark',
  a: 'petalA', b: 'petalB', c: 'petalMid', g: 'tuft', m: 'cap', s: 'stem',
  e: 'reed', f: 'reedTip', p: 'pad', q: 'padFlower', w: 'snow',
}

export const PROP_ART: Readonly<Record<PropArtId, PropArt>> = {
  // 초원: 둥근 연두 잎덩이에 짧은 줄기
  broadleaf: {
    near: { ax: 4, ay: 10, rows: [
      '...DDD...',
      '..DHHLD..',
      '.DHHHLLD.',
      'DHHHLLLLD',
      'DHHLLLLDD',
      'DLLLLLDDD',
      '.DLLLDDD.',
      '..DDDDD..',
      '....TK...',
      '....TK...',
      '....TK...',
    ] },
    far: { ax: 2, ay: 6, rows: [
      '.DDD.',
      'DHHLD',
      'DHLLD',
      'DLLDD',
      '.DDD.',
      '..T..',
      '..T..',
    ] },
  },
  // 산악: 짙은 청록 세 단 삼각형, 붉은 갈색 줄기
  pine: {
    near: { ax: 3, ay: 12, rows: [
      '...H...',
      '..HLD..',
      '.HLLDD.',
      '..DLD..',
      '.HLLLD.',
      'HLLLLDD',
      '.DDLDD.',
      '.HLLLD.',
      'HHLLLLD',
      'HLLLLDD',
      'DDDDDDD',
      '...T...',
      '...K...',
    ] },
    far: { ax: 2, ay: 8, rows: [
      '..L..',
      '.HLD.',
      '..L..',
      '.HLD.',
      'HLLDD',
      '.HLD.',
      'HLLLD',
      'DDDDD',
      '..T..',
    ] },
  },
  // 숲: 넓고 울퉁불퉁한 짙은 잎덩이에 굵은 줄기
  oak: {
    near: { ax: 4, ay: 9, rows: [
      '..DDD....',
      '.DHHLDDD.',
      'DHHLLHLLD',
      'DHLLLLLLD',
      'DLLLLLLDD',
      '.DDLDLDD.',
      '..TDTDK..',
      '...TTK...',
      '...TTK...',
      '..TTTKK..',
    ] },
    far: { ax: 2, ay: 5, rows: [
      'DD.DD.',
      'DHDLLD',
      'DLLLLD',
      '.DLDD.',
      '..TK..',
      '..TK..',
    ] },
  },
  // 호숫가: 둥근 머리에서 가지가 양옆으로 늘어진다. 가운데로 줄기가 보인다
  willow: {
    near: { ax: 4, ay: 10, rows: [
      '..HHHL...',
      '.HHHLLLD.',
      'HHHLLLLLD',
      'HHLLLLLDD',
      'HLHLLDLDD',
      'HLHLTDLDD',
      'L.HLTD.LD',
      'L.L.T.D.D',
      'L.L.T.D.D',
      '..L.TKD..',
      '....TK...',
    ] },
    far: { ax: 2, ay: 6, rows: [
      '.HHL.',
      'HHLLD',
      'HLLLD',
      'HLTDD',
      'L.T.D',
      'L.T.D',
      '..T..',
    ] },
  },
  // 모눈종이: 연한 세이지 녹색 둥근 잎덩이에 가는 회갈색 줄기. 잎 안쪽은 밝은 잎과 잎을 대각선으로 번갈아 찍는다
  paperTree: {
    near: { ax: 3, ay: 10, rows: [
      '..DDD..',
      '.DHLHD.',
      'DHLHLLD',
      'DLHLLLD',
      'DHLLLLD',
      '.DLLLD.',
      '..DDD..',
      '...T...',
      '...T...',
      '...T...',
      '..TTK..',
    ] },
    far: { ax: 2, ay: 6, rows: [
      '.DDD.',
      'DHLLD',
      'DLLLD',
      '.DDD.',
      '..T..',
      '..T..',
      '..T..',
    ] },
  },
  // 해변: 휜 줄기 끝에서 부채꼴 잎이 양옆으로 처진다. 줄기는 밑동이 왼쪽으로 나앉는다
  palm: {
    near: { ax: 3, ay: 12, rows: [
      '...H.L...',
      '.HHLHLLD.',
      'HL.HLLD.D',
      'H.LLTDD.D',
      '..L.TK.D.',
      '.L..TK...',
      '....TK...',
      '...TK....',
      '...TK....',
      '...TK....',
      '..TK.....',
      '..TK.....',
      '..TTK....',
    ] },
    far: { ax: 1, ay: 6, rows: [
      'HL.LD',
      '.HLD.',
      'L.T.D',
      '..T..',
      '.T...',
      '.T...',
      '.TK..',
    ] },
  },
  // 설원: 산악 소나무 모양에 층마다 왼쪽 위로 눈이 쌓였다
  snowPine: {
    near: { ax: 3, ay: 12, rows: [
      '...w...',
      '..wwD..',
      '.wLLDD.',
      '..DwD..',
      '.wwLLD.',
      'wLLLLDD',
      '.DDwDD.',
      '.wwwLD.',
      'wwLLLLD',
      'HLLLLDD',
      'DDDDDDD',
      '...T...',
      '...K...',
    ] },
    far: { ax: 2, ay: 8, rows: [
      '..w..',
      '.wLD.',
      '..w..',
      '.wLD.',
      'wwLDD',
      '.wLD.',
      'wLLLD',
      'DDDDD',
      '..T..',
    ] },
  },
  // 사막: 굵은 기둥에 팔 둘(왼쪽은 낮게, 오른쪽은 높게 굽어 오른다). 왼쪽 면이 밝다
  cactus: {
    near: { ax: 4, ay: 11, rows: [
      '...DDD...',
      '..DHLLD..',
      'D.DHLLD..',
      'HDDHLLD.D',
      'HLLHLLD.L',
      'DDDHLLDLL',
      '..DHLLLLD',
      '..DHLLDDD',
      '..DHLLD..',
      '..DHLLD..',
      '..DHLLD..',
      '..DDDDD..',
    ] },
    far: { ax: 1, ay: 6, rows: [
      '.D...',
      '.HL.D',
      'HHLDL',
      'D.LLD',
      '.HL..',
      '.HL..',
      '.DD..',
    ] },
  },
  rock: {
    near: { ax: 3, ay: 4, rows: [
      '..rrR..',
      '.rrRRk.',
      'rRRRRkk',
      'kRRRkkk',
      '.kkkkk.',
    ] },
    far: { ax: 2, ay: 2, rows: [
      '.rRR.',
      'rRRRk',
      '.kkk.',
    ] },
  },
  // 두 빛깔 꽃 두 송이와 그 아래 가운데 송이
  flower: {
    near: { ax: 1, ay: 1, rows: [
      'a.b',
      '.c.',
    ] },
    far: { ax: 0, ay: 0, rows: [
      'a',
    ] },
  },
  tuft: {
    near: { ax: 1, ay: 1, rows: [
      'g.g',
      '.g.',
    ] },
  },
  mushroom: {
    near: { ax: 1, ay: 2, rows: [
      '.m.',
      'msm',
      '.s.',
    ] },
  },
  // 얕은 물: 줄기 두 대가 밑동에서 갈라지고 끝에 갈색 이삭이 높이를 달리해 달린다
  reed: {
    near: { ax: 1, ay: 4, rows: [
      'f..',
      'f.f',
      'e.f',
      'e.e',
      '.e.',
    ] },
    far: { ax: 1, ay: 2, rows: [
      'f.',
      'fe',
      'ee',
    ] },
  },
  // 물 위에 떠 있는 납작한 잎. 윗줄 가운데에 연꽃 한 점
  lily: {
    near: { ax: 2, ay: 1, rows: [
      '.pq.',
      'pppp',
    ] },
    far: { ax: 0, ay: 0, rows: [
      'p',
    ] },
  },
  // 땅에 누운 나뭇가지: 나무 줄기 색 두 칸, 곁가지 하나. 원거리·맵 보기에서는 그리지 않는다
  branch: {
    near: { ax: 2, ay: 1, rows: [
      'T....',
      '.TTTK',
    ] },
  },
  // 모래 위 조개: 흰 윗점 아래 분홍 세 칸
  shell: {
    near: { ax: 1, ay: 1, rows: [
      '.c.',
      'bbb',
    ] },
  },
  // 모래 위 마른 덤불: 줄기 색 잔가지 셋이 한 밑동에서 벌어진다
  dryBush: {
    near: { ax: 2, ay: 2, rows: [
      'T.K.T',
      '.TKT.',
      '..K..',
    ] },
  },
}

// 세트마다 역할 색(0xRRGGBB). 그 세트가 쓰지 않는 역할도 비우지 않고 비슷한 색으로 채운다
// 갈대 줄기는 얕은 물보다 밝고 이삭·연잎은 얕은 물보다 어둡다. 그래야 물 위에서 명도 차로 보인다
export const PROP_COLORS: Readonly<Record<BiomeId, Readonly<Record<PropRole, number>>>> = {
  // 모눈종이: 나무만 그린다. 바위·꽃·물가 자리는 종이 회색과 옅은 잎색으로 채운다
  paper: {
    leafHi: 0xb4c4a0, leaf: 0x94a882, leafDark: 0x6a7e5e, trunk: 0x8a8078, trunkDark: 0x6a625c,
    rockHi: 0xd2d0cc, rock: 0xb2afb0, rockDark: 0x8a8688,
    petalA: 0xe2c86a, petalB: 0xd89aa6, petalMid: 0xf4f0e4, tuft: 0x94a882, cap: 0xc88a7a, stem: 0xf0ece0,
    reed: 0xb0b08e, reedTip: 0x8a7a6a, pad: 0x6a7e5e, padFlower: 0xd89aa6, snow: 0xf4f8fb,
  },
  meadow: {
    leafHi: 0x74b050, leaf: 0x4f8a3a, leafDark: 0x2c5a24, trunk: 0x6b4a2e, trunkDark: 0x4a3020,
    rockHi: 0xdedad0, rock: 0x9c9888, rockDark: 0x6a665c,
    petalA: 0xf2d24a, petalB: 0xe2607a, petalMid: 0xf6f2e4, tuft: 0x5a9a40, cap: 0xe2607a, stem: 0xf6f2e4,
    reed: 0xa8b04a, reedTip: 0x6a4424, pad: 0x2e6a34, padFlower: 0xf4a6c0, snow: 0xf4f8fb,
  },
  mountain: {
    leafHi: 0x4a8a74, leaf: 0x2f6656, leafDark: 0x1a4038, trunk: 0x7a4030, trunkDark: 0x552a20,
    rockHi: 0xc4c0b8, rock: 0x8a857c, rockDark: 0x5a564f,
    petalA: 0xd8dde2, petalB: 0xb04a3a, petalMid: 0xe8c040, tuft: 0x6a8a4a, cap: 0xb04a3a, stem: 0xd8dde2,
    reed: 0xa8aa5c, reedTip: 0x6a4430, pad: 0x2f6040, padFlower: 0xf0f0ea, snow: 0xf4f8fb,
  },
  forest: {
    leafHi: 0x4f8f45, leaf: 0x2f6b34, leafDark: 0x1a4220, trunk: 0x5a3e28, trunkDark: 0x3a2618,
    rockHi: 0xc0bcb0, rock: 0x8a867a, rockDark: 0x5a5650,
    petalA: 0xf0ece0, petalB: 0xd0503c, petalMid: 0xe8c040, tuft: 0x3f7a36, cap: 0xd0503c, stem: 0xf0ece0,
    reed: 0xa0a450, reedTip: 0x5a3a20, pad: 0x1f5028, padFlower: 0xf0ece0, snow: 0xf4f8fb,
  },
  lake: {
    leafHi: 0x9cc060, leaf: 0x6f9a3c, leafDark: 0x3f6a24, trunk: 0x6b4424, trunkDark: 0x4a2c14,
    rockHi: 0xdedad0, rock: 0x9a9688, rockDark: 0x68645a,
    petalA: 0xe8a0c0, petalB: 0xf4d4e4, petalMid: 0xf0e070, tuft: 0x5f9a45, cap: 0xe8a0c0, stem: 0xf4d4e4,
    reed: 0xa8b852, reedTip: 0x6b4424, pad: 0x2c6c34, padFlower: 0xf4a6c8, snow: 0xf4f8fb,
  },
  // 해변: 야자 잎은 밝은 초록, 줄기는 모래보다 짙은 갈색. 조개는 분홍에 흰 윗점
  beach: {
    leafHi: 0x6fbf5f, leaf: 0x4c9a4a, leafDark: 0x2a5e2c, trunk: 0x8a6a3e, trunkDark: 0x5e4426,
    rockHi: 0xd6d0c4, rock: 0xa09a8c, rockDark: 0x6e6a60,
    petalA: 0xf0c0b0, petalB: 0xe0806a, petalMid: 0xfaf4ea, tuft: 0x7aa050, cap: 0xe05a4a, stem: 0xfaf4ea,
    reed: 0xa8b852, reedTip: 0x6b4424, pad: 0x2c6c34, padFlower: 0xf4a6c8, snow: 0xf4f8fb,
  },
  // 설원: 짙은 청록 잎에 흰 눈, 짙은 갈색 줄기
  snow: {
    leafHi: 0x5a8a70, leaf: 0x3f6a58, leafDark: 0x1e3c30, trunk: 0x5a4a40, trunkDark: 0x3a2e28,
    rockHi: 0xc8ccd0, rock: 0x8a9098, rockDark: 0x5a6068,
    petalA: 0xc8403a, petalB: 0xe8f0f4, petalMid: 0xf0e070, tuft: 0x6a8a70, cap: 0xc8403a, stem: 0xe8f0f4,
    reed: 0xa8aa8c, reedTip: 0x5a4a40, pad: 0x2f6040, padFlower: 0xf0f0ea, snow: 0xf8fbfd,
  },
  // 사막: 선인장은 초록 잎 역할, 마른 덤불은 줄기 역할, 붉은 바위. 오아시스 풀에 꽃
  desert: {
    leafHi: 0x86b35a, leaf: 0x5f8f3f, leafDark: 0x2e5424, trunk: 0x8a6a4a, trunkDark: 0x5e4630,
    rockHi: 0xd8b890, rock: 0xb07850, rockDark: 0x7a5034,
    petalA: 0xe86a8a, petalB: 0xf0e070, petalMid: 0xf6f0e0, tuft: 0x6a9a40, cap: 0xe86a8a, stem: 0xf6f0e0,
    reed: 0xa8b852, reedTip: 0x6b4424, pad: 0x2c6c34, padFlower: 0xf4a6c8, snow: 0xf4f8fb,
  },
}
