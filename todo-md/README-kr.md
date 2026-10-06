[English](README.md) | 한국어

# todo-md

cwd 의 `TODO.md`(또는 지정한 md 파일)에서 제목과 체크리스트 항목만 골라 `/todo` 도킹 패널에 보인다. 파일이 바뀌면 다시 그린다.

## 설치

```sh
claude plugin marketplace add YeomYuJun/claude-mods
claude plugin install todo-md@claude-mods
```

자세한 순서는 [저장소 README](../README-kr.md#get-started) 에 있다.

## 명령

| 입력 | 동작 |
|---|---|
| `/todo` | 현재 cwd 의 `TODO.md` 를 연다. `/cd` 로 cwd 가 바뀌면 따라간다. 이미 cwd 의 `TODO.md` 를 보고 있으면 패널을 닫는다 |
| `/todo <경로>` | 그 md 파일을 연다. 절대경로와 상대경로(그 시점의 cwd 기준)를 받는다. 폴더를 주면 그 안의 `TODO.md` 를 연다. 공백이 든 경로는 따옴표로 감싼다 |

보는 파일은 한 번에 하나다. 다른 경로로 `/todo` 를 부르면 대상이 그 파일로 바뀐다.

fullscreen 렌더러(`/tui fullscreen`)에서는 터미널이 110 열 이상이면 대화 옆에 붙고, classic 렌더러(`/tui default`)에서는 입력창 위에 놓인다. 두 렌더러 모두에서 동작한다.

## 표시 규칙

- `#` 부터 `######` 까지의 제목을 보이고, 가장 높은 레벨을 기준으로 레벨마다 두 칸씩 들여쓴다.
- 체크리스트 항목(`- [ ]`, `- [x]`, `- [X]`, `*`/`+`/`1.` 목록 포함)을 보인다. 들여쓴 하위 항목은 한 단계씩 더 들여쓴다.
- 하위 제목까지 포함해 체크리스트 항목이 하나도 없는 제목은 숨긴다.
- 일반 문단, 체크박스 없는 목록, 코드 블록(```, ~~~) 안, HTML 주석(`<!-- -->`) 안은 보이지 않는다.
- 줄 끝의 `~3d #feat @john` 같은 표기는 원문 그대로 둔다.
- 첫 줄에 파일 경로와 `완료 수/전체 수` 를 보인다.
- BOM 과 CRLF 를 처리한다.

## 갱신

- 패널이 열려 있는 동안 1초마다 파일의 수정 시각과 크기를 보고, 바뀌었을 때만 다시 읽는다.
- Edit, Write 도구가 그 파일을 고치면 바로 다시 읽는다.
- 파일이 없으면 없다고 표시하고, 만들어지면 다음 확인 때 보인다. 1 MiB 를 넘는 파일은 읽지 않는다.

## 언어

패널 글, `/todo` 설명, 명령 응답은 플러그인의 `language` 옵션을 따른다. 값은 `auto`(기본), `en`, `ko` 다. `/config` 에서 바꾸면 플러그인이 새 값으로 다시 불러와진다.

`auto` 는 아래 순서로 보고 한국어나 영어로 읽히는 첫 값을 쓴다. 아무것도 없으면 영어다.

1. Claude Code settings 의 `language` 키(`"korean"`, `"한국어"`, `"english"`)
2. 환경변수 `LC_ALL`
3. 환경변수 `LANG`(`ko_KR.UTF-8`)

Windows 에서는 `LC_ALL`·`LANG` 이 대개 비어 있어서 settings 에 `language` 키가 없으면 영어로 보인다. settings 의 키를 바꾼 것은 다음 세션부터 반영된다.

## 개발

```sh
claude plugin test "<저장소 경로>/todo-md"
claude plugin validate "<저장소 경로>/todo-md"
```
