# BeamDeckNG: Stream Deck plugin for BeamNG.drive (0.2.3 beta)

A Stream Deck plugin that uses **BeamNG.drive's native MCP server**. Enable MCP in the game and it
just works: no game mod, and no bridge program running in the background.

- The plugin talks only to the game's MCP server at `http://127.0.0.1:29292/mcp` (and, on BeamMP
  servers, to BeamDeckNG MP-MCP and the game's OutGauge data; see [On BeamMP servers](#on-beammp-servers)).
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
| Tyre pressure | one axle or all wheels, with that group's pressure in psi (vehicles with a central tyre inflation system, e.g. the Stambecco 6x6) | hold to inflate or deflate |
| Vehicle control (auto) | slot N of the vehicle's own controls: tray tilt, hydraulics, fifth wheel, spinner speed... (see [Vehicle controls](#vehicle-controls-auto)) | hold to move, or tap to toggle |
| Game function | pause, repair, recover, respawn, accept, back, get in/out, map, vehicles, radial menu, slow motion (1x <-> last slow speed), slower/faster, game UI, photo mode, traffic, trailer, next vehicle (shows the car you are in, in its paint colour), menu arrows, next / previous camera (every camera the vehicle has: driver, hood, chase, orbit, external, top...), free camera on / off, fixed camera keys, look back, replay record / stop, eject replay, reload Lua | per function |

When the game isn't running (**NO GAME**), no vehicle is spawned (**NO CAR**) or a map is loading, each
button still shows what it is: its icon, dimmed, or its name. So a layout can be built without the
game running. Icons already read from the game are kept in the plugin's `cache` folder on your PC
for this. Other faces: **PAUSED** (dimmed last state while the vehicle isn't answering), **N/A**
(this vehicle doesn't have it), **NO MAP** (World keys with no map loaded). After a press the
button flashes until the game confirms. If the command fails it flashes red **ERROR**.

Every key has an **In-game message** setting (on by default): after a press, the game's message
app shows what happened, e.g. "Stream Deck: Rear diff: LOCKED", or why nothing did. Each new
message replaces the last one.

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

## Example profiles (tabs)

`profiles/` holds a suggested layout for the 15-key Stream Deck and the 32-key XL. The top-left
three keys are always tabs, one colour per group:

| Tab | Colour | Pages (15-key) | Pages (32-key) |
|---|---|---|---|
| GAME | blue | MENU, TOOLS, WEATHER, TIME | GAME, WORLD |
| CAR | green | DRIVE, LIGHTS, DASH, POWER, EXTRAS | DRIVE, DASH, POWER |
| CAMERA | purple | CAMERA | CAMERA |

MENU doubles as the on-foot controls: the arrows walk you when you're out of the car, with turn
camera left / right either side of Up and Sprint (shift) left of Left. The WEATHER page's Gravity key
is a folder of presets; each preset is a Multi Action (set gravity, then Switch Profile back to
WEATHER), so you land back where you were.

Tap a tab to jump to its group's first page; tap it again to step through the group (the lit tab
shows the page name, the dots show which page of the group). A second tap on CAMERA goes back to
DRIVE. On the XL the left 5x3 block of each page is the same as the 15-key page with the same name;
the extra columns hold what the 15-key deck keeps on the next page.

- `profiles/layouts.mjs`: the layout (edit here), `node profiles/layouts.mjs > profiles/plan.json`
- `scripts/tabicons.mjs`: tab key icons (`profiles/tabs/`)
- `node profiles/preview.mjs`: draws `profiles/preview-15.png` / `preview-32.png`

The XL DASH page leaves columns 5-7 free, and the 15-key LIGHTS page its bottom row, for
**Vehicle control (auto)** keys (beacons, work lights, trays...).

## Install

Requires Stream Deck 7.1 or later (7.4 and 8.x tested against the same SDK v3 / Node 24 manifest),
on the same computer as the game, and the MCP server enabled in
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

## Vehicle controls (auto)

Many vehicles have controls of their own, beyond what every car has: a rollback's tray, a dump
truck's bed, a lowrider's hydraulics, a semi's fifth wheel, a spinner's speed. The game lists them
under the vehicle in its Controls menu. The **Vehicle control (auto)** key shows one of them, picked
by its **slot** number, for whatever you're driving. Put a run of them on a page with slots 1, 2,
3... and they fill in when you get into a vehicle; slots it doesn't use stay blank.

- Things that have their own BeamDeckNG key are left out: diffs, range and 2WD/4WD, lights,
  lightbar and siren, cruise, engine brake, retarder, parking brake, JATO, nitrous, bonnet and boot,
  air suspension height. So are passenger doors, sunvisors and interior lights.
  Tailgates, cargo doors, toolboxes and latches stay in.
- Held movements are one key per direction (Tilt up / Tilt down), and run as long as you hold the
  key. A single up/down axis (the HT-55's bed, a wheel loader's arms) is split into two keys.
- Toggles show their state when the game says what they toggle (work lights ON / OFF, a latch
  LOCKED / UNLOCKED).
- **Trailers:** when you tow something, its controls follow the vehicle's own, marked TRAILER
  (the tilt deck's ramp and jack, a mobile spinner's feet).
- Presses run the control's own code, the same way a key bound in the game does, and respect the
  game's action filter.

How many keys a few vehicles need (from the game, Small Grid):

| Vehicle | Keys | |
|---|---|---|
| Gavril H45 Rollback | 6 | tilt up / down, extend, retract, feet out / in |
| Hirochi HT-55 | 9 | bed up / down, front brake cut-off, hill assist (up / down / off), idle-up (hold / toggle), work lights |
| Hirochi WL-40 | 6 | lift arm and tilt arm (both ways), rimpull, work lights |
| Gavril T83 Long Haul | 8 | PTO (both ways), fifth wheel (detach, slider locks, tilt lock), pintle hitch, trailer air, idle-up |
| Cherrier Percheron 8x8 | 7 | cab tilt up / down, cab latch, pintle hitch, sunroof, steering column lock, night lights |
| Autobello Stambecco 6x6 | 2 | tow hitch, tailgate |
| Procyon Centauri (mod) | 7 | boot, rooflights, third row, air suspension raise / lower / reset, bounce mode |
| Gavril Bluebuck Lowrider | 19 | raise / lower each corner, front, rear and all, and five hops |
| Bruckell Bastion Police | 0 | everything it has is a set button (lightbar, siren...) |
| Tilt Deck Trailer | 5 | jack down / up, ramp down / up, front locker |
| Large Spinner (mobile) | 5 | feet down / up, rpm down / up, detach |
| Large Roller | 6 | roller lift / lower, rpm down / up, forward / reverse |
| Large Cannon | 5 | barrel up / down, shoot, force down / up |

Every action of each of these vehicles, and what became of it, is in
[docs/vehicle_controls.csv](docs/vehicle_controls.csv).

## BeamDeckNG MP-MCP (for BeamMP)

**Why it exists.** BeamMP turns off the game's own MCP server while you're on a multiplayer server
(it stops the server handling requests in `MPVehicleGE.lua`). The game's MCP server lets any
program on the PC run any Lua in the game, which a multiplayer mod can't allow, so without help
every BeamDeckNG key goes dark on a server.

**What it is.** A small client mod, `BeamDeckNG-MP-MCP.zip`, that a **server owner** puts in the
server's `Resources/Client` folder. BeamMP sends it to every player. It runs its own MCP server
inside the game on `127.0.0.1:29392`, with the same protocol as the game's, and BeamDeckNG switches
to it by itself when the game's own server doesn't answer. Players install nothing extra.

**What it allows.** Only fixed jobs, never free-form Lua: reading the vehicle's state, the
vehicle actions BeamDeckNG uses (lights, diffs, ignition...), the vehicle's own controls (tray,
hydraulics...), a set of game keys, cameras, and opening game menu pages. Each is checked against
the server owner's allowlist (`beamdeckng_mp/settings.json` in the zip), and anything the game
itself has blocked (its action filter, used by BeamMP and game modes) stays blocked, with a
message in the game saying so.

**Where it runs.** Only from the server: in a BeamMP session it runs only if the server sent it.
A copy installed locally works in single player (for testing) and switches itself off when a
session starts, so a modified copy can't stand in for the server's.

**What players see.** A message in the game when the Stream Deck connects. Keys the server allows
work as usual. Keys it doesn't, and keys that need free-form Lua, open the matching game menu
where there is one (time of day, weather, gravity, slow motion, traffic, vehicles: **OPENS MENU**),
so the player changes it the normal way; otherwise they show **BLOCKED** or **NOT IN MP**.

**Versions.** The plugin reads MP-MCP's version, protocol, tools and allowlist, and only uses what
is there, so a server with an older MP-MCP keeps working with a newer plugin (keys it doesn't know
show N/A or NOT IN MP).

Server owners: see [mp-mcp/README.md](mp-mcp/README.md) for installing it and every allowlist name.

## On BeamMP servers

BeamMP turns off the game's own MCP server while you're on a multiplayer server, so the plugin
falls back, in this order:

1. **BeamDeckNG MP-MCP**, if the server has it (see [above](#beamdeckng-mp-mcp-for-beammp) and
   [mp-mcp/](mp-mcp/README.md)): a client mod
   the server owner installs, with its own MCP server on `127.0.0.1:29392`. It does what the
   plugin otherwise does with `run_lua`, but only fixed jobs, checked against the server's
   allowlist; there is no free-form Lua, and it only runs in a session if the server sent it.
   Keys the server allows work as usual. Keys it doesn't, and keys that need free-form Lua, open
   the matching game menu instead where there is one (time of day, weather, gravity, slow motion,
   traffic, vehicles: **OPENS MENU**); otherwise they show **BLOCKED** or **NOT IN MP**.
2. **OutGauge**, the game's read-only dashboard data (Options > Other > Protocols > OutGauge, IP
   `127.0.0.1`, port `4444`). Gauges, parking brake, indicators, hazards and high beam keep showing
   their state; other keys show **NO MCP**, and presses don't work. Only one program can listen on
   a UDP port, so if SimHub or another dashboard uses 4444, one of them misses out.

When you leave the server, MP-MCP unloads and the plugin goes back to the game's own MCP
server by itself.

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

A few icons are drawn by the plugin itself (the headlights, filled when they are on), so they don't
depend on the game at all.

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
npm run pack:mp        # -> dist/BeamDeckNG-MP-MCP.zip (BeamDeckNG MP-MCP, for BeamMP server owners)
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

MP-MCP and OutGauge: `test/mock_mp.py` runs the real MP-MCP mod (from `dist/BeamDeckNG-MP-MCP.zip`)
in a LuaJIT game-engine VM with a mock of the game's HTTP listener and the mock 4x4, plus a
"native" MCP port that accepts and never answers, as on a BeamMP server:

```
npm run pack:mp && node test/compile.mjs          # zip + plugin modules into test/build/bin
python test/mock_mp.py 29392 39292 &              # add --old to act as an old MP-MCP without beamdeck_info
node test/mp.mjs 29392 39292                      # (--old with an --old mock) fallback, allowlist, refusals, leave server...
python test/mock_mp.py --settings test/mp_strict.json &  # a strict server allowlist
node test/mp_strict.mjs
node test/mp_keys.mjs                             # key presses: direct, OPENS MENU, BLOCKED, messages (default mock)
node test/mp_policy.mjs                           # where MP-MCP may run (starts its own mocks)
node test/mp_controls.mjs                         # vehicle controls through MP-MCP, towing (default mock)
node test/vehcontrols.mjs                         # which controls become keys, from real vehicles (test/data/)
node test/outgauge.mjs                            # OutGauge listener (fake UDP packets)
```
