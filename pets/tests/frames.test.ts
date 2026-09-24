import { describe, expect, test } from 'claude-code/testing'

import { frameHashes } from './fixtures/frames'

// 모눈종이 세트와 흰 강아지 화면의 셀 해시. 색 표·종 정의처럼 그리는 방식만 옮기는 변경은 이 값을 한 셀도 바꾸면 안 된다.
// 행동이나 그리기 난수를 바꾸는 변경은 값이 달라지는 것이 맞으므로, 그때는 새 값으로 바꾸고 커밋 메시지에 적는다
const RECORDED = ["pane 7 far 30 613e409a","pane 7 far 90 80eb53c7","pane 7 far 240 7ef6f6cc","pane 7 1 30 28bd2242","pane 7 1 90 deacd08f","pane 7 1 240 4512e718","pane 7 2 30 240f34c5","pane 7 2 90 94c443b5","pane 7 2 240 b3e61971","band 7 30 9dd03203","band 7 90 2b61ecc3","band 7 240 e712ab43","pane 42 far 30 63e6d7fd","pane 42 far 90 16e58072","pane 42 far 240 fde0754a","pane 42 1 30 9dbd64d9","pane 42 1 90 85b9e4f6","pane 42 1 240 d56e38cb","pane 42 2 30 f489f4ed","pane 42 2 90 4598ccbd","pane 42 2 240 8c764b49","band 42 30 f8e19223","band 42 90 f8e19223","band 42 240 87bc25af","pane 1234 far 30 4784c780","pane 1234 far 90 6fab4a4a","pane 1234 far 240 4acf7e44","pane 1234 1 30 1a2ae61c","pane 1234 1 90 35ae7fc4","pane 1234 1 240 46ba97bd","pane 1234 2 30 4a511f85","pane 1234 2 90 c9ee621d","pane 1234 2 240 2bc9ad49","band 1234 30 1b9ecf23","band 1234 90 6155f463","band 1234 240 f997b467"]

describe('frames', () => {
  test('the graph-paper set and the white dog draw the same cells as the recorded frames', async () => {
    expect(frameHashes()).toEqual(RECORDED)
  })
})
