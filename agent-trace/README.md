# agent-trace

세션이 띄운 서브에이전트, agent team, Workflow, 백그라운드 셸을 `/trace` 도킹 패널에 흐름도, 에이전트 상세, 파일 접근 목록으로 그린다.

## 설치

```powershell
claude plugin marketplace add YeomYuJun/claude-mods
claude plugin install agent-trace@claude-mods
```

함수 훅 스위치 `CLAUDE_CODE_ENABLE_FUNCTION_HOOKS=1` 이 켜져 있어야 한다. 자세한 순서는 [저장소 README](../README.md#get-started) 에 있다.

`/trace` 로 열고 닫는다. 전체 화면 레이아웃이고 터미널이 144 열 이상이면, 메인 세션의 첫 Agent, Task, Workflow 호출이 끝날 때 저절로 열린다. 이번 세션에서 직접 닫았으면 다시 열리지 않는다(`/clear` 뒤에는 다시 열린다).

## 기능

### 흐름 탭

- 에이전트를 트리로 그린다. 폭이 넉넉하면 가로 트리, 아니면 세로 들여쓰기 트리다.
- 노드마다 상태(실행, 대기, 완료, 실패, 정지), 경과 시간, 토큰을 보인다. 루트는 모델과 현재 컨텍스트를 보인다.
- 팀원은 팀 노드 아래에 둔다.
- 트리 아래에 백그라운드 셸 목록을 둔다.
- 머리글에 에이전트, 실행, 대기, 실패 수를 요약한다. `d` 로 노드 밀도를 바꾼다.

### 에이전트 상세

노드를 누르면 연다.

- 유형, 모델, 부모, 지시문, 도구 호출 목록(최근 것부터)을 보인다.
- `에이전트 정지` 버튼은 실행 중인 에이전트와 대기 중인 팀원을 멈춘다.
- `기록 경로 복사` 버튼은 그 에이전트의 기록 파일 경로를 복사한다.
- `Esc` 는 흐름으로 돌아가고, 한 번 더 누르면 패널을 닫는다.

### 파일 탭

- 파일 경로별 읽기, 편집, 쓰기 횟수와 그 파일을 건드린 에이전트를 보인다.
- 둘 이상이 편집한 파일에는 `충돌 가능` 을 단다.
- Bash 로 바꾼 파일은 빠진다.

### 읽는 곳

메인 세션은 `$.session` 에서, 서브에이전트와 Workflow 는 설정 폴더(`CLAUDE_CONFIG_DIR`, 없으면 `~/.claude`) 아래 세션 기록 파일에서 읽는다. 4 MiB 를 넘는 기록 파일은 읽지 않고 노드에 `기록이 커서 요약만` 을 단다.

## 개발

```powershell
claude plugin test "<저장소 경로>/agent-trace"
claude plugin validate "<저장소 경로>/agent-trace"
```
