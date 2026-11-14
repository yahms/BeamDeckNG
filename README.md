# BeamDeckNG: Stream Deck plugin for BeamNG.drive (tester, v0.1)

A standalone Stream Deck plugin. It only talks to the game's built-in MCP server at
`http://127.0.0.1:29292/mcp` and doesn't need beam-assist.

## Buttons

| Action | Shows | Press |
|---|---|---|
| Ignition | OFF / ACC / ON / START (flashes while cranking) / RUN | start or stop the engine |
| Traction control | the current drive mode (Comfort / Sport / ESC & TC Off...) and whether TC is on | cycles the car's drive modes, the same ones the game's own button cycles; TC on/off on cars without drive modes, or by setting |
| Diff lock | LOCKED / OPEN / PARTIAL / AUTO; setting picks front, rear, centre, all, or cycle | lock / unlock; **cycle**: rear only > both > front only > none (each axle group = its diffs plus the inter-axle diff between them; the centre locks whenever an axle is locked), then each centre diff mode if the car has several (e.g. Sunburst auto / open / 50% / locked) |
| Range | HIGH / LOW | switch range |
| 2WD / 4WD | 2WD / 4WD | engage / disengage front drive |
| Parking brake | on / off | set / release |
| Headlights | off / low / high (black / green / blue) | cycle, or low-beam / high-beam toggle (setting) |
| Fog lights, Hazards | on / off (hazards blink) | toggle |
| Indicator | left or right (setting), blinks while on | toggle |
| Lightbar | off / mode 1 / mode 2 | cycle |
| Horn | sounding while held | hold |
| Cruise control | on/off + set speed, or set / + / - (setting) | toggle / set / adjust |
| Engine brake, Retarder | level | cycle levels |
| Air suspension | raise or lower (setting) | hold |
| Doors / bonnet / boot | open / shut (all doors, one door, bonnet or boot) | open / close |
| Nitrous | off / armed (blue) / spraying (green), bottle % | tap: arm/disarm, hold: spray (setting) |
| JATO | ready / firing, fuel % | hold to fire, or toggle (setting) |
| Powertrain (game bar) | the Nth button of the game's powertrain bar, with its icon and coloured ring | whatever the game's button does |
| Game function | pause, repair, recover, respawn, accept, back, get in/out, map, vehicles, radial menu, slow motion (1x <-> last slow speed), slower/faster, game UI, photo mode, traffic, trailer, next vehicle, menu arrows, cameras, look back, replay | per function |

Common faces: **NO GAME** (MCP not reachable), **NO CAR**, **…** (loading), **PAUSED** (dimmed
last state while the vehicle isn't answering), **N/A** (this vehicle doesn't have it).
After a press the button flashes until the game confirms. If the command fails it flashes red
**ERROR**.

## Category icons for folders and pages

`com.yahms.beamdeckng.sdPlugin/icons/` has 30 category icons, each in **white** and **orange** (for
highlighting the active folder/page), for Stream Deck's own Folder, Page and Profile buttons:

vehicle, truck, trailer, engine, powertrain, diffs, range, drive_modes, lights, signals, doors,
parking_brake, cruise, boost, jato, hydraulics, camera, replay, time, map, game_menu, radial_menu,
garage, repair, recover, home, on_foot, traffic, back, next.

In the Stream Deck app: select the folder/page button > click its icon > **Set from File**, and pick
one from the plugin folder (`%appdata%\Elgato\StreamDeck\Plugins\com.yahms.beamdeckng.sdPlugin\icons\`)
or from `BeamDeckNG-icons.zip` on the releases page.

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
| `ignition` | `off` `acc` `stalled` (ignition on, engine not running) `cranking` `running` `unsupported` |
| `traction` | `esc_<colour>` from the colour the game gives each drive mode on its own button (Comfort blue, Sport yellow, Drift green, Savage red, ESC & TC Off grey, Caged purple; any car's colours map to the nearest of blue / yellow / green / red / orange / purple / grey / black). Add `mode_<key>.png` (e.g. `mode_sport.png`) to give one mode its own icon. The mode name is drawn on the key. |
| `diff` (shared by every diff button) | `locked` (solid centre) `open` (empty centre) `lsd` (X: an open centre diff, i.e. full-time 4WD) `partial` (orange centre: some locked) |
| `diff_front` `diff_rear` `diff_center` `diff_all` | optional per-button overrides of `diff/`; the button draws its scope (FRONT / REAR / CENTRE) or, for "all", which diffs are locked (F+R, OPEN...) over the icon |
| `range` | `high` `low` `partial` `unsupported` |
| `drive` | `2wd` `4wd` `partial` `unsupported` |
| `pbrake` `fog` `hazard` `horn` `indicator_left` `indicator_right` `air_raise` `air_lower` | `off` `on` |
| `lights` | `off` `low` `high` |
| `lightbar` | `off` `mode1` `mode2` |
| `cruise` / `cruise_set` `cruise_plus` `cruise_minus` | `off` `on` / `idle` |
| `ebrake` `retarder` | placeholders for now (level as text) |
| `doors` `door` `hood` `trunk` | `closed` `open` |
| `n2o` | `off` `armed` `spray` |
| `jato` | `off` `on` `empty` |
| `common` | `offline` `novehicle` `loading` |
| `pt` | the game's own icon names, e.g. `powertrain_transfercase_high-2`, `powertrain_differential_open`, `powertrain_esc` (all 44 are mapped) |
| game functions (`pause`, `repair`, `walk`, `cam_orbit`...) | `off` `on`; see `GAME_FUNCS` in `src/gamefns.ts` for the folder names |
| any key | `error` (shown after a failed press) |

Colour scheme: white icons, as in the game; orange marks "on" for two-state buttons. Orange is kept for flash frames while a command is
pending, TC off, and mixed states. A button whose feature this vehicle doesn't have shows its
unlocked/off icon dimmed.

PNGs are read once at plugin start, so restart the plugin after adding them:
`streamdeck restart com.yahms.beamdeckng`, or restart the Stream Deck app.

## Build

```
npm install
npm run build          # -> com.yahms.beamdeckng.sdPlugin/bin/plugin.js
npm run pack           # -> dist/com.yahms.beamdeckng.streamDeckPlugin
npx streamdeck link com.yahms.beamdeckng.sdPlugin   # dev: run from this folder
```

## Test against the running game

`test/rollup.browser.mjs` builds `test/build/browser.js`, the real `src/game.ts` for a browser page served from
`http://127.0.0.1:29292` (open that URL; the 405 page is fine), so it can POST to `/mcp` with no CORS issues.
Set `window.__LUA = { resolver, beamdeck }` (fetched from the repo) before loading it.

## Test without the game

`test/mock_mcp.py` is a fake MCP server. It runs two real LuaJIT VMs (game engine + a mock 4x4)
and delivers `queueLuaCommand` / `queueGameEngineLua` once per frame, like the game.
`test/run.mjs` drives the plugin's game link against it:

```
pip install lupa
python test/mock_mcp.py 29299 &
node test/run.mjs      # after compiling src/game.ts + src/mcp.ts into test/build/bin
```
