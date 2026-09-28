import { describe, expect, test } from 'claude-code/testing'

import { frameHashes } from './fixtures/frames'

// 모눈종이 세트와 흰 강아지 화면의 셀 해시. 색 표·종 정의처럼 그리는 방식만 옮기는 변경은 이 값을 한 셀도 바꾸면 안 된다.
// 행동이나 그리기 난수를 바꾸는 변경은 값이 달라지는 것이 맞으므로, 그때는 새 값으로 바꾸고 커밋 메시지에 적는다
const RECORDED = ["pane 7 far 30 6bbb6ac5","pane 7 far 90 42d0a7e5","pane 7 far 240 99603695","pane 7 1 30 1b589739","pane 7 1 90 2ec40ab3","pane 7 1 240 9644d0d4","pane 7 2 30 b4f9d791","pane 7 2 90 5a12c25","pane 7 2 240 46f2b82d","band 7 30 9dd03203","band 7 90 2b61ecc3","band 7 240 e712ab43","pane 42 far 30 24b3a9fb","pane 42 far 90 6752ab65","pane 42 far 240 54e9e5f6","pane 42 1 30 8cbcf275","pane 42 1 90 6389f0c4","pane 42 1 240 3fcb3c33","pane 42 2 30 5759f695","pane 42 2 90 960bf5c5","pane 42 2 240 7bbfcdb1","band 42 30 f8e19223","band 42 90 f8e19223","band 42 240 87bc25af","pane 1234 far 30 d749ed45","pane 1234 far 90 d0b82ad8","pane 1234 far 240 a52e0194","pane 1234 1 30 b3c5980e","pane 1234 1 90 f36f5f26","pane 1234 1 240 c8e7597a","pane 1234 2 30 c5b00e99","pane 1234 2 90 2c95d319","pane 1234 2 240 42b03d15","band 1234 30 1b9ecf23","band 1234 90 6155f463","band 1234 240 f997b467"]

describe('frames', () => {
  test('the graph-paper set and the white dog draw the same cells as the recorded frames', async () => {
    expect(frameHashes()).toEqual(RECORDED)
  })
})
