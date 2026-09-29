import { describe, expect, test } from 'claude-code/testing'

import { frameHashes } from './fixtures/frames'

// 모눈종이 세트와 흰 강아지 화면의 셀 해시. 색 표·종 정의처럼 그리는 방식만 옮기는 변경은 이 값을 한 셀도 바꾸면 안 된다.
// 행동이나 그리기 난수를 바꾸는 변경은 값이 달라지는 것이 맞으므로, 그때는 새 값으로 바꾸고 커밋 메시지에 적는다
// 원거리·맵 보기 값은 동물 크기 전환(Names.FAR_PET_SCALE, 지금 'full')으로 그린 것이다. 전환을 바꾸면 그 18 개를 다시 기록한다
const RECORDED = ["pane 7 wide 30 29f1245a","pane 7 wide 90 11c41bcb","pane 7 wide 240 b8d05eb","pane 7 far 30 6f795668","pane 7 far 90 316016d","pane 7 far 240 c47eb882","pane 7 1 30 3f5fc712","pane 7 1 90 56c61ac4","pane 7 1 240 602d3f04","pane 7 2 30 b4f9d791","pane 7 2 90 b338c98d","pane 7 2 240 2c604dbd","band 7 30 9dd03203","band 7 90 2b61ecc3","band 7 240 e712ab43","pane 42 wide 30 99cee677","pane 42 wide 90 71a7587f","pane 42 wide 240 57aeabe0","pane 42 far 30 3ed226c6","pane 42 far 90 6752ab65","pane 42 far 240 54e9e5f6","pane 42 1 30 a4d12512","pane 42 1 90 6389f0c4","pane 42 1 240 3fcb3c33","pane 42 2 30 5759f695","pane 42 2 90 960bf5c5","pane 42 2 240 7bbfcdb1","band 42 30 f8e19223","band 42 90 f8e19223","band 42 240 87bc25af","pane 1234 wide 30 ce420c9c","pane 1234 wide 90 77d94cce","pane 1234 wide 240 a6cf877a","pane 1234 far 30 e9a66d3d","pane 1234 far 90 fb87b993","pane 1234 far 240 dcbe5f7c","pane 1234 1 30 764e0471","pane 1234 1 90 4b66789c","pane 1234 1 240 48a144d9","pane 1234 2 30 6dae9a21","pane 1234 2 90 c5d80a2d","pane 1234 2 240 d33f8129","band 1234 30 1b9ecf23","band 1234 90 6155f463","band 1234 240 f997b467"]

describe('frames', () => {
  test('the graph-paper set and the white dog draw the same cells as the recorded frames', async () => {
    expect(frameHashes()).toEqual(RECORDED)
  })
})
