English | [한국어](README-kr.md)

# agent-trace

Draws the subagents, agent teams, Workflows, and background shells the session launched in the `/trace` docked panel, as a flow diagram, agent details, and a file access list.

The panel text and command replies are in English or Korean. See [Language](#language). UI labels below are quoted as the English UI shows them.

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
- Each node shows its status (running, idle, done, failed, stopped), elapsed time, and tokens. The root shows the model and the current context.
- Team members are placed under the team node.
- A list of background shells sits below the tree.
- The header summarizes the counts of agents, running, idle, and failed. `d` changes node density.

### Agent details

Opens when you click a node.

- Shows the type, model, parent, prompt, and the list of tool calls (most recent first).
- The `Stop agent` button stops a running agent or an idle team member.
- The `Copy transcript path` button copies the path of that agent's transcript file.
- `Esc` goes back to the flow, and pressing it again closes the panel.

### Files tab

- Shows read, edit, and write counts per file path, and the agents that touched each file.
- Files edited by two or more agents get `Possible conflict`.
- Files changed through Bash are not included.

### Data sources

The main session is read from `$.session`; subagents and Workflows are read from session transcript files under the config folder (`CLAUDE_CONFIG_DIR`, or `~/.claude` if unset). Transcript files larger than 4 MiB are not read, and the node gets `transcript too large, summary only`.

## Language

The panel text, the `/trace` description and the command replies follow the plugin's `language` option: `auto` (default), `en` or `ko`. Change it in `/config`; the plugin reloads with the new value.

`auto` takes the first of these that names Korean or English, and falls back to English:

1. The `language` key in Claude Code settings (`"korean"`, `"한국어"`, `"english"`)
2. The `LC_ALL` environment variable
3. The `LANG` environment variable (`ko_KR.UTF-8`)

On Windows `LC_ALL` and `LANG` are usually unset, so without a `language` key in settings the plugin shows English. A change to the settings key takes effect in the next session.

## Development

```sh
claude plugin test "<repo-path>/agent-trace"
claude plugin validate "<repo-path>/agent-trace"
```
