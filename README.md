# BeamDeckNG: Stream Deck plugin for BeamNG.drive (tester, v0.1)

A standalone Stream Deck plugin. It only talks to the game's built-in MCP server at
`http://127.0.0.1:29292/mcp` and doesn't need beam-assist.

## Buttons

| Action | Shows | Press |
|---|---|---|
| Ignition | OFF / ACC / ON / START (flashes while cranking) / RUN | start or stop the engine |
| Traction control | TC ON / TC OFF + drive mode name | toggle TC, or (setting) cycle drive modes |
| Diff lock | LOCKED / OPEN / PARTIAL / AUTO; setting picks front, rear, centre or all | lock / unlock |
| Range | HIGH / LOW | switch range |
| 2WD / 4WD | 2WD / 4WD | engage / disengage front drive |

Common faces: **NO GAME** (MCP not reachable), **NO CAR**, **…** (loading), **PAUSED** (dimmed
last state while the vehicle isn't answering), **N/A** (this vehicle doesn't have it).
After a press the button flashes until the game confirms. If the command fails it flashes red
**ERROR**.

## Install

Requires Stream Deck 7.1 or later. Double-click `com.yahms.beamdeckng.streamDeckPlugin`, then drag
the buttons from the **BeamDeckNG** category.

## How it talks to the game

The vehicle Lua comes from beam-assist's `resolver.lua` (copied unchanged), plus
`lua/beamdeck.lua`, which adds `BNGS.status()` and a `drive_mode_step` action.

The plugin never calls `run_lua_vehicle`. That tool returns the previous run's result, and the
result slot is shared with every other MCP client, so polling it would steal beam-assist's
results. Instead everything goes through the synchronous game-engine VM:

1. `run_lua`: `be:getPlayerVehicle(0):queueLuaCommand(<code>)`
2. The vehicle runs the code and calls `obj:queueGameEngineLua("BNGSD.status = ...")`.
3. The next `run_lua` reads `BNGSD`.

Polling runs every ~250 ms, and only while a BeamDeckNG button is on screen. The library is
installed into each vehicle VM once (as the global `BNGSD_BNGS`), and is re-installed
automatically after a vehicle switch or reload. Presses send the full library and use the same
act-then-verify flow as beam-assist.

## Icons

The button icons are in `com.yahms.beamdeckng.sdPlugin/imgs/states/`, picked from your icon set
(288×288 PNGs). To change one, replace the file. To add more, put PNGs (144×144 or larger) in `com.yahms.beamdeckng.sdPlugin/imgs/states/<key>/<state>.png`. Any missing PNG
falls back to the drawn placeholder. If you add `<state>_flash.png`, it's used as the alternate
frame when that button flashes. Otherwise the plugin dims your PNG for that frame.

| key | states |
|---|---|
| `ignition` | `off` `acc` `on` `cranking` `running` `unsupported` |
| `traction` | `on` `off` `unsupported`; in cycle mode `mode_<key>` first (e.g. `mode_comfort`, `mode_sport`, `mode_off`), falling back to `on`/`off` |
| `diff_front` `diff_rear` `diff_center` `diff_all` | `locked` `open` `partial` `auto` (falls back to `open`) `unsupported` |
| `range` | `high` `low` `partial` `unsupported` |
| `drive` | `2wd` `4wd` `partial` `unsupported` |
| `common` | `offline` `novehicle` `loading` |
| any key | `error` (shown after a failed press) |

PNGs are read once at plugin start, so restart the plugin after adding them:
`streamdeck restart com.yahms.beamdeckng`, or restart the Stream Deck app.

## Build

```
npm install
npm run build          # -> com.yahms.beamdeckng.sdPlugin/bin/plugin.js
npm run pack           # -> dist/com.yahms.beamdeckng.streamDeckPlugin
npx streamdeck link com.yahms.beamdeckng.sdPlugin   # dev: run from this folder
```

## Test without the game

`test/mock_mcp.py` is a fake MCP server. It runs two real LuaJIT VMs (game engine + a mock 4x4)
and delivers `queueLuaCommand` / `queueGameEngineLua` once per frame, like the game.
`test/run.mjs` drives the plugin's game link against it:

```
pip install lupa
python test/mock_mcp.py 29299 &
node test/run.mjs      # after compiling src/game.ts + src/mcp.ts into test/build/bin
```
