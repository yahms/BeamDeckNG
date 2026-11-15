# BeamDeckNG: Stream Deck plugin for BeamNG.drive (0.2.2 alpha)

A Stream Deck plugin that uses **BeamNG.drive's native MCP server**. Enable MCP in the game and it
just works: no game mod, and no bridge program running in the background.

- The plugin talks only to the game's MCP server at `http://127.0.0.1:29292/mcp`.
- Stream Deck must be on **the same computer the game is running on**.
- Every button shows the live state of the vehicle or the game.

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
| World | **time of day** clock with a sky-coloured background (night blue, dawn/dusk orange, day blue); time presets (sunrise, noon, sunset, midnight), ±1 hour, day length; **weather** presets (clear, cloudy, fog, rain, storm) and separate rain / fog / wind keys; **gravity** (Earth, Moon, Mars, Zero-G, Jupiter). Preset keys are green when that preset is current | apply the preset, or cycle. The clock key runs / freezes time |
| Gauge | speed, gear with shift light (green > yellow > red flash near the limiter), rpm, fuel, coolant and oil temperature, boost, damage | none (damage: repair) |
| Game function | pause, repair, recover, respawn, accept, back, get in/out, map, vehicles, radial menu, slow motion (1x <-> last slow speed), slower/faster, game UI, photo mode, traffic, trailer, next vehicle, menu arrows, next / previous camera (every camera the vehicle has: driver, hood, chase, orbit, external, top...), free camera on / off, fixed camera keys, look back, replay | per function |

When the game isn't running (**NO GAME**), no vehicle is spawned (**NO CAR**) or a map is loading, each
button still shows what it is: its icon, dimmed, or its name. So a layout can be built without the
game running. Icons already read from the game are kept in the plugin's `cache` folder on your PC
for this. Other faces: **PAUSED** (dimmed last state while the vehicle isn't answering), **N/A**
(this vehicle doesn't have it), **NO MAP** (World keys with no map loaded). After a press the
button flashes until the game confirms. If the command fails it flashes red **ERROR**.

## Category icons for folders and pages

`com.yahms.beamdeckng.sdPlugin/icons/` has 31 category icons, each in **white** and **green** (for
highlighting the active folder/page), for Stream Deck's own Folder, Page and Profile buttons:

vehicle, truck, trailer, engine, powertrain, diffs, range, drive_modes, lights, signals, hazards, doors,
parking_brake, cruise, boost, jato, hydraulics, camera, replay, time, map, game_menu, radial_menu,
garage, repair, recover, home, on_foot, traffic, back, next.

Plus **yes** (green tick) and **no** (red cross), e.g. for Hotkey buttons mapped to Enter / Esc.

In the Stream Deck app: select the folder/page button > click its icon > **Set from File**, and pick
one from the plugin folder (`%appdata%\Elgato\StreamDeck\Plugins\com.yahms.beamdeckng.sdPlugin\icons\`)
or from `BeamDeckNG-icons.zip` on the releases page.

## Install

Requires Stream Deck 7.1 or later, on the same computer as the game, and the MCP server enabled in
BeamNG.drive. Double-click `com.yahms.beamdeckng.streamDeckPlugin`, then drag
the buttons from the **BeamDeckNG** category.

## How it talks to the game

The vehicle-side Lua is `lua/resolver.lua` (a stateless library that finds and switches a vehicle's
diffs, transfer case, lights, couplers and so on), plus
`lua/beamdeck.lua`, which adds `BNGS.status()` and a `drive_mode_step` action.

The plugin never calls `run_lua_vehicle`. That tool returns the previous run's result, and the
result slot is shared with every other MCP client, so polling it would steal other tools'
results. Instead everything goes through the synchronous game-engine VM:

1. `run_lua`: `be:getPlayerVehicle(0):queueLuaCommand(<code>)`
2. The vehicle runs the code and calls `obj:queueGameEngineLua("BNGSD.status = ...")`.
3. The next `run_lua` reads `BNGSD`.

Polling runs every ~250 ms, and only while a BeamDeckNG button is on screen. The library is
installed into each vehicle VM once (as the global `BNGSD_BNGS`), and is re-installed
automatically after a vehicle switch or reload. Presses send the full library and use the same
act-then-verify flow (set, then check a moment later that the change took).

## Icons

Button icons come from **your own copy of BeamNG.drive**: while the game is running, the plugin reads
the icons it needs from the game's UI icon set (`/ui/assets/Sprites/svg-symbols.svg`) through the
MCP server, and draws them in a colour that shows the state. No game artwork ships with the plugin.
Every key also carries a line of text saying what it is or what state it's in (OFF / LOW / HIGH,
LOCKED, ORBIT...), so a key is never blank. Until an icon has been read once (or if it is missing),
that text is all the key shows.

**Rain** works on every map: maps with their own rain (Industrial, Jungle Rock Island, East Coast USA,
Italy, Small Island, West Coast USA...) use it, and on maps without (Gridmap v2 and others) the
plugin adds a rain effect using the game's own rain.

Colours follow the game's own drive-mode colours:

| colour | meaning |
|---|---|
| white | idle / off (normal) |
| green | on, engaged, running |
| blue | mode or info (high beam, nitrous armed, retarder auto) |
| yellow | caution or in progress (cranking, partly locked, doors open, Sport mode) |
| red | alert: engine stopped, parking brake on, hazards, errors |
| grey | off / not available |

Drive mode buttons use the colour the game gives each mode. A button whose feature this vehicle
doesn't have shows its icon dimmed. Which icon and colour each state uses is in `src/glyphmap.ts`.

To use your own images instead, put 144×144 PNGs in
`com.yahms.beamdeckng.sdPlugin/imgs/states/<key>/<state>.png` (for example `diff_rear/locked.png`,
`ignition/stalled.png`; keys and states are the ones in `src/glyphmap.ts`). Your PNGs win over the
game's icons; `<state>_flash.png` is used as the flash frame. PNGs are read once at plugin start, so
restart the plugin after adding them: `streamdeck restart com.yahms.beamdeckng`.

The icons that ship with the plugin (action list, default key images, category icons) are built by
`node scripts/icons.mjs` from [Material Symbols](https://github.com/google/material-design-icons)
(Apache License 2.0, Google) and BeamDeckNG's own drawings.

So every icon is either generated separately (the shipped set above) or derived live from the game.
Early test builds used the Beam Deck icon pack available on the beamng.com forums; those icons were
removed before release.

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
