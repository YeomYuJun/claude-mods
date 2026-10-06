English | [한국어](README-kr.md)

# agent-trace

Draws the subagents, agent teams, Workflows, and background shells the session launched in the `/trace` docked panel, as a flow diagram, agent details, and a file access list.

The panel text and command replies are currently in Korean only. Korean UI labels below are quoted as shown on screen, with an English gloss.

## Install

```sh
claude plugin marketplace add YeomYuJun/claude-mods
claude plugin install agent-trace@claude-mods
```

The full steps are in the [repository README](../README.md#get-started).

`/trace` opens and closes the panel. In the fullscreen layout with a terminal of 144 columns or more, it opens by itself when the main session's first Agent, Task, or Workflow call finishes. If you closed it yourself in this session, it does not reopen (it does again after `/clear`).

## Features

### Flow tab

- Draws agents as a tree. A horizontal tree when there is enough width, otherwise a vertically indented tree.
- Each node shows its status (running, waiting, done, failed, stopped), elapsed time, and tokens. The root shows the model and the current context.
- Team members are placed under the team node.
- A list of background shells sits below the tree.
- The header summarizes the counts of agents, running, waiting, and failed. `d` changes node density.

### Agent details

Opens when you click a node.

- Shows the type, model, parent, prompt, and the list of tool calls (most recent first).
- The `에이전트 정지` (Stop agent) button stops a running agent or a waiting team member.
- The `기록 경로 복사` (Copy transcript path) button copies the path of that agent's transcript file.
- `Esc` goes back to the flow, and pressing it again closes the panel.

### Files tab

- Shows read, edit, and write counts per file path, and the agents that touched each file.
- Files edited by two or more agents get `충돌 가능` (possible conflict).
- Files changed through Bash are not included.

### Data sources

The main session is read from `$.session`; subagents and Workflows are read from session transcript files under the config folder (`CLAUDE_CONFIG_DIR`, or `~/.claude` if unset). Transcript files larger than 4 MiB are not read, and the node gets `기록이 커서 요약만` (summary only, transcript too large).

## Development

```sh
claude plugin test "<repo-path>/agent-trace"
claude plugin validate "<repo-path>/agent-trace"
```
