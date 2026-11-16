# BeamDeckNG MP-MCP (for BeamMP server owners)

BeamMP turns off BeamNG.drive's own MCP server while a player is on a multiplayer server (it blocks
the server's request handling in `MPVehicleGE.lua`), so BeamDeckNG Stream Decks stop working
there. This client mod puts back a small MCP server for BeamDeckNG, limited to what **you** allow
on your server.

- It only does fixed jobs: read the vehicle's status, switch things on the vehicle (lights, diffs,
  ignition...), press a few game keys, and change camera. **There is no way to run arbitrary Lua
  through it**, unlike the game's own MCP server.
- Every vehicle action, game key and game function is checked against your allowlist before it runs.
- It listens on `127.0.0.1:29392` only, so just a Stream Deck on the player's own PC can reach it.
- It runs inside the game's frame loop through the game's own non-blocking HTTP listener (the same
  one the game's MCP server uses), and answers at most 8 requests a frame.
- When the player leaves your server it stops listening and unloads itself.
- It only runs in a BeamMP session if **your server sent it**. A copy a player installs locally (or
  edits) runs in single player only, for testing, and switches itself off as soon as a session
  starts. If it was already running, the server's copy replaces it when your mods load.
- Keys it doesn't allow directly can open the matching game menu instead (time of day opens the
  Environment page, weather the Weather page, and so on), so players change those things the
  normal way, under whatever BeamMP and your other mods allow.
- Game keys the game itself has blocked (BeamMP and game modes block some with the game's action
  filter) stay blocked, even if your allowlist names them.
- It shows a message in the game when a Stream Deck connects, and BeamDeckNG can show what each
  press did (players turn that off per key).

Players don't install anything extra: BeamDeckNG 0.2.4 or later finds MP-MCP by itself when
the game's MCP server doesn't answer.

## Install

1. Get `BeamDeckNG-MP-MCP.zip` from the BeamDeckNG releases (or build it, below).
2. Optionally edit `beamdeckng_mp/settings.json` inside the zip (see below).
3. Put the zip in your server's `Resources/Client` folder and restart the server.

BeamMP only runs client mods that the server sends, so players can't add this to servers that
don't have it.

## What players can do: `beamdeckng_mp/settings.json`

Three lists. Remove a name to block it, add one to allow it. Leave a list out to use the defaults
below; an empty list (`[]`) blocks everything in it.

**`vehicle`**: things the Stream Deck may switch on the player's own vehicle.

| Name | Does | Default |
|---|---|---|
| `engine` | start / stop the engine | ✅ |
| `traction`, `drive_mode_step` | TC on/off, step the car's drive modes | ✅ |
| `diff_lock`, `diff_combo`, `center_diff` | lock / unlock diffs, the diff-lock cycle | ✅ |
| `range`, `drive` | high / low range, 2WD / 4WD | ✅ |
| `parking_brake` | parking brake | ✅ |
| `lights`, `fog`, `hazard`, `signal`, `lightbar` | lights | ✅ |
| `horn` | horn | ✅ |
| `cruise` | cruise control | ✅ |
| `engine_brake`, `retarder` | engine brake and retarder levels | ✅ |
| `air_suspension` | raise / lower | ✅ |
| `body` | doors, bonnet, boot | ✅ |
| `pt_click` | the game's own powertrain buttons (the bar in the game's UI) | ✅ |
| `tire_pressure` | central tyre inflation | ✅ |
| `n2o`, `nitrous` | nitrous | ❌ |
| `jato` | JATO rockets | ❌ |
| `gear` | change gear | ❌ |

`verify`, `read` and `list` are always allowed: they only read the vehicle.

**`actions`**: the game's own input actions (the names from Options > Controls) the Stream Deck may
press. This is the same as pressing that key. Defaults:
`menu_item_select`, `menu_item_back`, `menu_item_up`, `menu_item_down`, `menu_item_left`,
`menu_item_right`, `toggleBigMap`, `toggleRadialMenuMulti`, `photomode`, `couplersToggle`,
`center_camera`, `look_back`.

Not allowed by default, but you can add them: `recover_vehicle_alt` (repair), `loadHome`
(respawn), `toggleCamera` (free camera), `vehicle_selector`, `switch_next_vehicle`,
`toggleReplayRecording`, `toggleTraffic`, `pause`, `slower_motion`, `faster_motion`. BeamMP blocks
pausing and slow motion in sessions anyway.

**`menus`**: game menu pages a key may open when it can't change something directly. Defaults:
all of them: `environment` (time of day), `weather`, `simulation` (gravity, simulation speed),
`traffic`, `vehicle_config`, `vehicle_selector`, `multiplayer`.

**`game`**: game functions. Defaults: `set_camera` (a named camera), `cam_step` (next / previous
camera), `cam_driver`, `toggle_ui`, `walk` (get in / out). Also available: `replay_eject`.

Never available directly through MP-MCP: time of day, weather, gravity, slow motion, teleport /
recover, spawning or removing vehicles, AI, and anything else BeamDeckNG does with free-form Lua.
Keys for those that have a game menu page (time, weather, gravity, slow motion, traffic, vehicles)
show **OPENS MENU** and open it; the rest show **NOT IN MP**. Keys your allowlist blocks show
**BLOCKED** (or OPENS MENU, if they have a page).

If your server syncs time or weather with another mod (TimeFly, EnvSync...), that mod stays in
charge: a player changing the time in the Environment menu is changing it the same way they could
with the mouse, and the sync mod treats it however it treats that.

## Versions

MP-MCP carries its own copy of BeamDeckNG's vehicle Lua, so a server running an older MP-MCP
works with a newer plugin: keys for things the older MP-MCP doesn't know show N/A or NOT IN MP
instead of failing. Update the zip on your server when you get the chance.

The plugin checks MP-MCP's version and protocol (`beamdeck_info`) and its tool list, and only
uses what's there.

## For developers

- `mod/lua/ge/extensions/beamdeckngMP.lua`: the listener and its tools (`beamdeck_status`,
  `beamdeck_call` / `beamdeck_result` / `beamdeck_fire`, `beamdeck_glyphs`, `beamdeck_game`,
  `open_menu`, `beamdeck_info`, plus `trigger_action`, `set_camera`, `toggle_ui` and
  `show_message` with the same names and behaviour as the game's own MCP tools).
- Where it came from: the zip its own file was loaded from (`FS:getOriginArchivePathRelative`),
  read once at load. In a session it must be in `/mods/multiplayer/` and in BeamMP's list of the
  server's mods (`MPModManager.isModAllowed`).
- `mod/scripts/beamdeckng_mp/modScript.lua`: loads it when the mods load, replacing a copy from
  another zip that is already running.
- `npm run pack:mp` builds `dist/BeamDeckNG-MP-MCP.zip` and copies the plugin's vehicle Lua
  (`com.yahms.beamdeckng.sdPlugin/lua/`) into it.
- Bump `PROTO` in the extension only for changes an older plugin can't cope with; add new tools
  instead where possible.
