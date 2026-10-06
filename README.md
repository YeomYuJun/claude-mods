# claude-mods

A collection of panel plugins for Claude Code.

## Overview

English | [한국어](README-kr.md)

| Plugin | Command | What it does |
|---|---|---|
| [pets](pets/README.md) | `/pets` | An animal roams an isometric world on its own and reacts to session signals such as prompts, tool calls, and turn ends |
| [auto-tetris](auto-tetris/README.md) | `/tetris` | Auto-playing Tetris that makes moves with the session's output tokens and drops pieces on tool calls |
| [agent-trace](agent-trace/README.md) | `/trace` | Shows the subagents, agent teams, Workflows, and background shells the session launched, as a flow diagram and a file access list |
| [todo-md](todo-md/README.md) | `/todo` | Shows only the headings and checklist items of `TODO.md` in the cwd (or a given md file), and redraws when the file changes |

All four plugins run as TypeScript function hooks (`hooks/register.ts`). No separate runtime (Node, etc.) is needed. They need Claude Code v2.1.287 or later; check with `claude --version`.

pets and auto-tetris work only in the fullscreen renderer (`/tui fullscreen`). In the classic renderer (`/tui default`) the panel opens above the input box, but it is too small and shows only a size notice. todo-md works in both renderers.

The panel text and command replies are in English or Korean. Each plugin has a `language` option (`auto`, `en`, `ko`) in `/config`. `auto` reads the `language` key in Claude Code settings, then `LC_ALL` and `LANG`, and falls back to English. Details are in each plugin's README.

## Get started

1. Add the marketplace.

   ```sh
   claude plugin marketplace add YeomYuJun/claude-mods
   ```

2. Install the plugins you want.

   ```sh
   claude plugin install pets@claude-mods          # /pets animal panel
   claude plugin install auto-tetris@claude-mods   # /tetris auto Tetris
   claude plugin install agent-trace@claude-mods   # /trace agent flow diagram
   claude plugin install todo-md@claude-mods       # /todo TODO.md checklist
   ```

3. Restart Claude Code and open a panel with its command (`/pets`, `/tetris`, `/trace`, `/todo`).

Inside a Claude Code session, do steps 1–2 as `/plugin marketplace add YeomYuJun/claude-mods` and `/plugin install pets@claude-mods`.

## Update

This marketplace is added with auto-update turned off. Get new versions with the commands below, or turn on auto-update in the marketplace tab of `/plugin`.

```sh
claude plugin marketplace update claude-mods
claude plugin update pets@claude-mods
```

To remove a plugin, run `claude plugin uninstall pets@claude-mods`.

## Development

To load a plugin straight from a repository copy (one session only):

```sh
claude --plugin-dir "<repo-path>/pets"
```

To load it in every session, add `"CLAUDE_CODE_PLUGIN_DIRS": "<repo-path>/pets"` to `env` in `~/.claude/settings.json`. Join multiple folders with `;`. If you also have the same plugin installed from the marketplace, it is loaded twice (`claude plugin list` shows both `pets@claude-mods` and `pets@inline`), so use only one of them.

Tests and validation:

```sh
claude plugin test "<repo-path>/pets"
claude plugin validate "<repo-path>/pets"
claude plugin validate "<repo-path>"      # marketplace
```

Releasing a new version:

1. Bump `version` in the plugin's `.claude-plugin/plugin.json`. Without a bump, people who installed it do not receive the update.
2. Check that the tests and validation above pass.
3. Commit and push.

## Structure

```
.claude-plugin/marketplace.json   defines the claude-mods marketplace
<plugin>/.claude-plugin/plugin.json
<plugin>/hooks/hooks.json         loads ./register.ts
<plugin>/hooks/                   function hook modules
<plugin>/tests/                   tests run by claude plugin test
```
