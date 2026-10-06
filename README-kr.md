# claude-mods

Claude Code 패널 플러그인 모음.

## Overview

[English](README.md) | 한국어

| 플러그인 | 명령 | 하는 일 |
|---|---|---|
| [pets](pets/README-kr.md) | `/pets` | 아이소메트릭 월드에서 동물 한 마리가 스스로 돌아다니고, 프롬프트·도구 호출·턴 끝 같은 세션 신호에 반응한다 |
| [auto-tetris](auto-tetris/README-kr.md) | `/tetris` | 세션이 쓰는 출력 토큰으로 수를 두고 도구 호출로 블록을 떨어뜨리는 자동 테트리스 |
| [agent-trace](agent-trace/README-kr.md) | `/trace` | 세션이 띄운 서브에이전트, agent team, Workflow, 백그라운드 셸을 흐름도와 파일 접근 목록으로 보여 준다 |
| [todo-md](todo-md/README-kr.md) | `/todo` | cwd 의 `TODO.md`(또는 지정한 md 파일)에서 제목과 체크리스트 항목만 보이고, 파일이 바뀌면 다시 그린다 |

네 플러그인 모두 TypeScript 함수 훅(`hooks/register.ts`)으로 돌아간다. 따로 설치할 런타임(Node 등)은 없다.

pets 와 auto-tetris 는 fullscreen 렌더러(`/tui fullscreen`)에서만 쓸 수 있다. classic 렌더러(`/tui default`)에서는 패널이 입력창 위에 열리지만 크기가 모자라 크기 안내만 보인다. todo-md 는 두 렌더러 모두에서 동작한다.

## Get started

1. 마켓플레이스를 추가한다.

   ```sh
   claude plugin marketplace add YeomYuJun/claude-mods
   ```

2. 쓸 플러그인을 설치한다.

   ```sh
   claude plugin install pets@claude-mods          # /pets 동물 패널
   claude plugin install auto-tetris@claude-mods   # /tetris 자동 테트리스
   claude plugin install agent-trace@claude-mods   # /trace 에이전트 흐름도
   claude plugin install todo-md@claude-mods       # /todo TODO.md 체크리스트
   ```

3. Claude Code 를 다시 열고 명령(`/pets`, `/tetris`, `/trace`, `/todo`)으로 패널을 연다.

Claude Code 세션 안에서는 1~2 단계를 `/plugin marketplace add YeomYuJun/claude-mods`, `/plugin install pets@claude-mods` 처럼 한다.

## Update

이 마켓플레이스는 자동 업데이트가 꺼진 채로 추가된다. 새 버전은 아래로 받거나 `/plugin` 의 마켓플레이스 탭에서 자동 업데이트를 켠다.

```sh
claude plugin marketplace update claude-mods
claude plugin update pets@claude-mods
```

지우려면 `claude plugin uninstall pets@claude-mods` 처럼 한다.

## Development

저장소 사본에서 바로 불러오려면(한 세션만):

```sh
claude --plugin-dir "<저장소 경로>/pets"
```

모든 세션에서 불러오려면 `~/.claude/settings.json` 의 `env` 에 `"CLAUDE_CODE_PLUGIN_DIRS": "<저장소 경로>/pets"` 를 더한다. 폴더가 여럿이면 `;` 로 잇는다. 마켓플레이스로 설치한 것과 같이 쓰면 같은 플러그인이 두 번 불러와지므로(`claude plugin list` 에 `pets@claude-mods` 와 `pets@inline` 이 같이 보인다) 한쪽만 쓴다.

테스트와 검사:

```sh
claude plugin test "<저장소 경로>/pets"
claude plugin validate "<저장소 경로>/pets"
claude plugin validate "<저장소 경로>"      # 마켓플레이스
```

새 버전 내보내기:

1. 플러그인의 `.claude-plugin/plugin.json` 에서 `version` 을 올린다. 올리지 않으면 설치한 사람이 업데이트를 받지 못한다.
2. 위 테스트와 검사가 통과하는지 본다.
3. 커밋하고 push 한다.

## Structure

```
.claude-plugin/marketplace.json   마켓플레이스 claude-mods 정의
<플러그인>/.claude-plugin/plugin.json
<플러그인>/hooks/hooks.json       ./register.ts 를 불러온다
<플러그인>/hooks/                 함수 훅 모듈
<플러그인>/tests/                 claude plugin test 로 도는 테스트
```
