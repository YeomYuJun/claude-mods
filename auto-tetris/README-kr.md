[English](README.md) | 한국어

# auto-tetris

세션이 쓰는 토큰으로만 움직이는 자동 테트리스를 `/tetris` 도킹 패널에 그린다. 사람은 조작하지 않는다(패널에 버튼도 키도 없다).

## 설치

```sh
claude plugin marketplace add YeomYuJun/claude-mods
claude plugin install auto-tetris@claude-mods
```

자세한 순서는 [저장소 README](../README-kr.md#get-started) 에 있다.

`/tetris` 로 열고 닫는다. 전체 화면 레이아웃에서는 트랜스크립트 옆에 24 열 폭으로 붙는다. 24 열 × 22 행보다 작으면 필요한 크기를 알린다.

fullscreen 렌더러(`/tui fullscreen`)에서만 쓸 수 있다. classic 렌더러(`/tui default`)에서는 패널이 입력창 위에 열리지만 크기가 모자라 크기 안내만 보인다.

## 기능

### 규칙

| 세션에서 일어난 일 | 게임에서 |
|---|---|
| 출력 토큰 12 개(텍스트, 생각, 도구 인자) | 한 수: 한 번 돌리기, 한 칸 옮기기, 또는 한 칸 내리기 |
| 모델이 도구 호출을 시작 | 지금 블록이 계획한 자리로 떨어진다 |
| 아무 일 없음 | 멈춘다. 시간만으로는 블록이 내려가지 않는다 |

- 서브에이전트와 팀원의 응답도 같은 게임을 움직인다.
- 낙하 속도는 토큰 속도를 따른다.
- 패널이 닫혀 있어도 게임은 진행된다.

### AI 실력

수는 AI 가 둔다. 실력은 응답을 쓰는 모델의 등급(`haiku`, `sonnet`, `opus`, `fable`)을 따른다.

- `haiku` 는 단순한 평가로 두고 실수가 잦다.
- `sonnet` 이상은 더 많은 특징으로 판을 평가한다.
- `opus` 와 `fable` 은 다음 블록까지 두 수를 본다.
- 등급마다 평가 잡음, 판단 실수, 실행 실수(노린 열에서 한 칸 옆) 확률이 다르다(`hooks/game/ai.ts` 의 `TIERS`).

### 화면

- 보드, `░` 로 표시한 AI 가 노린 착지 자리
- `NEXT`, `LINES`, `SCORE`, `COMBO`, `PIECES`, `GAME`, `AI`(지금 등급)
- 출력 토큰, 입력 토큰, 최근 토큰 속도 막대
- 세션 상태: `streaming`, `thinking`, `tool call`, `waiting`, `idle`
- 줄을 지우면 `SINGLE`~`TETRIS` 와 `COMBO xN` 이 뜬다

## 언어

크기 안내, `/tetris` 설명, 명령 응답은 플러그인의 `language` 옵션을 따른다. 값은 `auto`(기본), `en`, `ko` 다. `/config` 에서 바꾸면 플러그인이 새 값으로 다시 불러와진다. 게임 화면 안의 라벨(`NEXT`, `SCORE`, 상태어)은 두 언어 모두 영어로 둔다. 보드 래스터가 폭 1 문자만 받기 때문이다.

`auto` 는 아래 순서로 보고 한국어나 영어로 읽히는 첫 값을 쓴다. 아무것도 없으면 영어다.

1. Claude Code settings 의 `language` 키(`"korean"`, `"한국어"`, `"english"`)
2. 환경변수 `LC_ALL`
3. 환경변수 `LANG`(`ko_KR.UTF-8`)

Windows 에서는 `LC_ALL`·`LANG` 이 대개 비어 있어서 settings 에 `language` 키가 없으면 영어로 보인다. settings 의 키를 바꾼 것은 다음 세션부터 반영된다.

## 개발

```sh
claude plugin test "<저장소 경로>/auto-tetris"
claude plugin validate "<저장소 경로>/auto-tetris"
```

`hooks/game`, `hooks/meter`, `hooks/frame` 은 `$` 를 쓰지 않는 순수 모듈이다.
