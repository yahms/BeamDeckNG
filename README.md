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
| Tab, Slot | see below | |

Common faces: **NO GAME** (MCP not reachable), **NO CAR**, **…** (loading), **PAUSED** (dimmed
last state while the vehicle isn't answering), **N/A** (this vehicle doesn't have it).
After a press the button flashes until the game confirms. If the command fails it flashes red
**ERROR**.

## Tabs and slots (for small decks)

Every function above is also available as a tab slot, so a 15-key deck can hold all of it:

| | | | | |
|---|---|---|---|---|
| **Tab: Game** | **Tab: Car** | **Tab: Camera** | Pause | Repair |
| Slot 1 | Slot 2 | Slot 3 | Slot 4 | Slot 5 |
| Slot 6 | Slot 7 | Slot 8 | ✓ Accept | ✗ Back |

- **Tab** buttons pick what the **Slot** buttons show. The active tab gets an orange frame; press it
  again for the next page (shown as 1/2, 2/2...).
- **Slot** buttons are numbered in their settings (1, 2, 3...) and filled in that order from the active
  tab, using only what the current vehicle has, so there are no N/A gaps.
- **Car tab:** ignition, then **the game's own powertrain bar for this vehicle** (the buttons next to
  Start/Stop: transfer case 2H/4H/4L, diffs, range, front drive, ESC/drive modes...; it works on modded
  vehicles too), then lights, indicators, parking brake, hazards, fog, horn, cruise, nitrous, JATO, doors,
  boot, lightbar, truck brakes, air suspension. Vehicles without a game bar get BeamDeckNG's own
  traction / diff / range / 4WD buttons instead.
- **Game tab:** get in/out, map, vehicle selector, respawn, recover, slow motion, game UI, radial menu,
  photo mode, traffic, trailer, next vehicle, menu arrows.
- **Camera tab:** cycle, centre, orbit, driver, chase, external, top, look back (held), replay recording.
- Getting out on foot switches to the Game tab; getting back in switches to Car.

The tab lists are `TABS` in `src/tabs.ts`.

### Stream Deck XL (32 keys)

Two ways to lay it out; both use the same buttons.

**A. One page, BeamDeckNG tabs.** Same as the 15-key layout, just more slots. Any key that isn't a Slot
is yours for other plugins, hotkeys, OBS, Discord... (those stay put on every tab):

| | | | | | | | |
|---|---|---|---|---|---|---|---|
| Tab: Game | Tab: Car | Tab: Camera | *free* | *free* | Pause | Repair | Respawn |
| Slot 1 | Slot 2 | Slot 3 | Slot 4 | Slot 5 | Slot 6 | Slot 7 | Slot 8 |
| Slot 9 | Slot 10 | Slot 11 | Slot 12 | Slot 13 | Slot 14 | Slot 15 | Slot 16 |
| Slot 17 | Slot 18 | Slot 19 | Slot 20 | *free* | *free* | ✓ Accept | ✗ Back |

**B. One Stream Deck page per tab.** For free keys that belong to a tab (e.g. an OBS scene button only on
the Camera page): make a page per tab, set that page's Slots to *"Always the Car tab"* (etc.) in their
settings, and put anything else on the rest of the page. Switch pages with Stream Deck's own page
buttons (Go to Page / Next Page; you can drag `imgs/states/tab_*/on.png` onto them). BeamDeckNG Tab
buttons on a page highlight the tab whose page is showing, and pressing that tab pages through its
slots when they don't all fit.

| Car page | | | | | | | |
|---|---|---|---|---|---|---|---|
| ⇢ Game page | **Car** | ⇢ Camera page | *free* | *free* | Pause | Repair | Respawn |
| Car slot 1 | Car slot 2 | Car slot 3 | Car slot 4 | Car slot 5 | Car slot 6 | *free* | *free* |
| Car slot 7 | Car slot 8 | Car slot 9 | Car slot 10 | Car slot 11 | Car slot 12 | *free* | *free* |
| *free* | *free* | *free* | *free* | *free* | *free* | ✓ Accept | ✗ Back |

**Custom game action:** a Game function set to "Custom game action..." fires any action from the game's
Controls menu by its name (e.g. `toggleRadialMenuSandbox`, `md_series__toggle_beacon`), with your own
text on the key, without needing a keyboard binding. Ordinary Stream Deck Hotkey buttons work too.

Fixed buttons (pause, repair, accept/back...) are **Game function** buttons: one action type, the
function is picked in its settings. **Powertrain (game bar)** is a standalone button for the Nth button of
the game's bar.

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
| `traction` | `on` `off` `unsupported`; in cycle mode `mode_<key>` first (e.g. `mode_comfort`, `mode_sport`, `mode_off`), falling back to `on`/`off` |
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
| `tab_game` `tab_car` `tab_camera` | `off` `on` |
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
