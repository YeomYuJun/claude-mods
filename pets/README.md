English | [한국어](README-kr.md)

# pets

Draws a seeded isometric map in the `/pets` docked panel, and an animal roams it on its own. The animal reacts to session signals (prompts, typing, tool calls, turn ends, and more). The panel has no buttons or keys; the only way to make it do something is `/pets do`.

The panel text and command replies are currently in Korean only. `/pets world` and `/pets pet` also accept Korean names.

## Install

```sh
claude plugin marketplace add YeomYuJun/claude-mods
claude plugin install pets@claude-mods
```

The full steps are in the [repository README](../README.md#get-started).

- Drawing works only in a terminal. In the VS Code extension and the desktop app, the panel tells you to open it in a terminal.
- If the panel is smaller than 32 columns × 24 rows, it shows the required size.
- It works only in the fullscreen renderer (`/tui fullscreen`). In the classic renderer (`/tui default`) the panel opens above the input box, but it is too small and shows only a size notice.

## Features

### Maps

- Graph paper island (default) and seven endless worlds: meadow, mountain, forest, lakeside, beach, snowfield, desert.
- Terrain differs per set. Meadow, forest, and snowfield have wide plains and hills; mountain has ridges and valleys; lakeside and beach have large lakes and basins; desert has sand flats and mesas.
- Lakes and rivers, slopes and stone stairs, and per-set props such as trees, rocks, flowers, and grass tufts.
- Zoom has four levels (map view, far, 1x, 2x).

### Animals

| Species | Breeds | Notes |
|---|---|---|
| Dog | white, shiba, black, dalmatian, brown | Default |
| Cat | cat, cheese | Climbs two steps at once |
| Turtle, duck, penguin | | Swim when they enter water. Duck and penguin waddle |
| Claude mascot | | |

### Autonomous behavior

Curiosity, playfulness, wanting to be near you, thirst, and energy are kept as values, and the next action is chosen from them. It walks, sniffs, plays with a ball, explores, wanders far, circles a block, climbs high places, sits facing you, naps, drinks water, splashes, chews a stick, digs, and more.

### Reactions to session signals

| Signal | Reaction |
|---|---|
| Prompt | Stops what it is doing and runs toward you, facing you. Wakes up if it was asleep |
| Typing | Looks at you |
| Tool call | Sniffs or perks its ears depending on the tool type. If the call runs longer than 4 seconds, it comes to the front and sits waiting |
| Tool failure | Barks on an error, tilts its head on a denial |
| Long thinking | Sits and shows an ellipsis |
| Subagent start and end | Shows musical notes |
| Conversation compaction | Shakes itself off and stretches |
| Turn end | On an answer, sits with hearts and a wagging tail; on an interrupt, `!`; on an error, droops |
| No signal for 3 minutes | Falls asleep. After 1 minute, once its energy is restored, wakes up on its own |

## Commands

| Command | What it does |
|---|---|
| `/pets` | Opens and closes the panel |
| `/pets zoom` | Changes zoom by one level. `in` and `out` move one step; `wide`, `far`, `1`, `2` pick a level directly |
| `/pets world [set]` | Shows or changes the map set. `paper` `meadow` `mountain` `forest` `lake` `beach` `snow` `desert`, a Korean name (such as `초원`, meadow), or `auto` (picked per session) |
| `/pets pet [breed]` | Shows or changes the animal. `dog` `shiba` `blackdog` `dalmatian` `brown` `cat` `cheese` `turtle` `duck` `penguin` `claude`, a Korean name (such as `시바`, shiba), or `auto` |
| `/pets idle [on\|off]` | Shows or toggles stay-awake mode |
| `/pets do <action>` | Makes it act now: `sleep` `wake` `sit` `lie` `play` `ball` `fetch` `zoomies` `roam` `explore` `come` |

The chosen zoom, set, breed, and stay-awake setting are saved and carry over to the next session.

## Development

```sh
claude plugin test "<repo-path>/pets"
claude plugin validate "<repo-path>/pets"
```

Modules other than `hooks/register.ts` and `hooks/view/` are pure modules that do not use `$`.
