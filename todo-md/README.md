English | [한국어](README-kr.md)

# todo-md

Picks only the headings and checklist items from `TODO.md` in the cwd (or a given md file) and shows them in the `/todo` docked panel. Redraws when the file changes.

The panel text and command replies are in English or Korean. See [Language](#language).

## Install

```sh
claude plugin marketplace add YeomYuJun/claude-mods
claude plugin install todo-md@claude-mods
```

The full steps are in the [repository README](../README.md#get-started).

## Commands

| Input | Behavior |
|---|---|
| `/todo` | Opens `TODO.md` in the current cwd. Follows the cwd when it changes with `/cd`. If the panel is already showing the cwd's `TODO.md`, closes the panel |
| `/todo <path>` | Opens that md file. Accepts absolute and relative paths (relative to the cwd at that moment). Given a folder, opens the `TODO.md` inside it. Wrap paths containing spaces in quotes |

Only one file is shown at a time. Calling `/todo` with another path switches the target to that file.

In the fullscreen renderer (`/tui fullscreen`) it docks next to the conversation when the terminal is 110 columns or wider; in the classic renderer (`/tui default`) it sits above the input box. It works in both renderers.

## Display rules

- Shows headings from `#` to `######`, indented two spaces per level relative to the highest level present.
- Shows checklist items (`- [ ]`, `- [x]`, `- [X]`, including `*`/`+`/`1.` lists). Indented sub-items are indented one more step.
- Hides headings with no checklist items, including their sub-headings.
- Does not show plain paragraphs, lists without checkboxes, content inside code blocks (```, ~~~), or content inside HTML comments (`<!-- -->`).
- Notations at the end of a line such as `~3d #feat @john` are left as written.
- The first line shows the file path and `done/total`.
- Handles BOM and CRLF.

## Refresh

- While the panel is open, it checks the file's modification time and size every second and rereads it only when they change.
- When the Edit or Write tool changes that file, it rereads it immediately.
- If the file does not exist, the panel says so, and shows it at the next check once it is created. Files larger than 1 MiB are not read.

## Language

The panel text, the `/todo` description and the command replies follow the plugin's `language` option: `auto` (default), `en` or `ko`. Change it in `/config`; the plugin reloads with the new value.

`auto` takes the first of these that names Korean or English, and falls back to English:

1. The `language` key in Claude Code settings (`"korean"`, `"한국어"`, `"english"`)
2. The `LC_ALL` environment variable
3. The `LANG` environment variable (`ko_KR.UTF-8`)

On Windows `LC_ALL` and `LANG` are usually unset, so without a `language` key in settings the plugin shows English. A change to the settings key takes effect in the next session.

## Development

```sh
claude plugin test "<repo-path>/todo-md"
claude plugin validate "<repo-path>/todo-md"
```
