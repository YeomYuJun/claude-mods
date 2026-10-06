English | [한국어](README-kr.md)

# auto-tetris

Draws an auto-playing Tetris, moved only by the tokens the session writes, in the `/tetris` docked panel. No one controls it (the panel has no buttons or keys).

The in-game labels are in English. The size notice and command replies are in English or Korean. See [Language](#language).

## Install

```sh
claude plugin marketplace add YeomYuJun/claude-mods
claude plugin install auto-tetris@claude-mods
```

The full steps are in the [repository README](../README.md#get-started).

`/tetris` opens and closes the panel. In the fullscreen layout it docks next to the transcript at 24 columns wide. If it is smaller than 24 columns × 22 rows, it shows the required size.

It works only in the fullscreen renderer (`/tui fullscreen`). In the classic renderer (`/tui default`) the panel opens above the input box, but it is too small and shows only a size notice.

## Features

### Rules

| What happens in the session | In the game |
|---|---|
| 12 output tokens (text, thinking, tool arguments) | One move: rotate once, shift one cell, or drop one cell |
| The model starts a tool call | The current piece drops to its planned spot |
| Nothing | It stops. Time alone does not move pieces down |

- Responses from subagents and team members move the same game.
- Falling speed follows token speed.
- The game keeps going while the panel is closed.

### AI skill

An AI makes the moves. Its skill follows the tier of the model writing the response (`haiku`, `sonnet`, `opus`, `fable`).

- `haiku` plays with a simple evaluation and makes frequent mistakes.
- `sonnet` and up evaluate the board with more features.
- `opus` and `fable` look two moves ahead, through the next piece.
- Each tier has its own evaluation noise, judgment error, and execution error (one column off from the target) rates (`TIERS` in `hooks/game/ai.ts`).

### Screen

- The board, and the AI's target landing spot marked with `░`
- `NEXT`, `LINES`, `SCORE`, `COMBO`, `PIECES`, `GAME`, `AI` (current tier)
- Output tokens, input tokens, and a recent token speed bar
- Session state: `streaming`, `thinking`, `tool call`, `waiting`, `idle`
- Clearing lines shows `SINGLE` to `TETRIS` and `COMBO xN`

## Language

The size notice, the `/tetris` description and the command replies follow the plugin's `language` option: `auto` (default), `en` or `ko`. Change it in `/config`; the plugin reloads with the new value. The labels drawn inside the game (`NEXT`, `SCORE` and the state words) stay in English in both, because the board raster takes only one-column characters.

`auto` takes the first of these that names Korean or English, and falls back to English:

1. The `language` key in Claude Code settings (`"korean"`, `"한국어"`, `"english"`)
2. The `LC_ALL` environment variable
3. The `LANG` environment variable (`ko_KR.UTF-8`)

On Windows `LC_ALL` and `LANG` are usually unset, so without a `language` key in settings the plugin shows English. A change to the settings key takes effect in the next session.

## Development

```sh
claude plugin test "<repo-path>/auto-tetris"
claude plugin validate "<repo-path>/auto-tetris"
```

`hooks/game`, `hooks/meter`, and `hooks/frame` are pure modules that do not use `$`.
