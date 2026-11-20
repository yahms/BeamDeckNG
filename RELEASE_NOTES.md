# BeamDeckNG 0.2.14

Everything since 0.2.11 (0.2.12, 0.2.13 and 0.2.14 together).

## Real keys for timing

Up / Down / Left / Right and Repair now press the real arrow keys and Insert, held for as long as you hold the
button, so you can time a rewind (Insert) or a nudge exactly. They do what those keys do in the game (menus,
walking, the free camera, and in the car, driving) and work without MCP, but need the game window focused.
Back and Accept can send Esc and Enter the same way. Each of these keys has an **Input** setting: the default
(arrows and Repair send the real key, Back and Accept use the game's action), "Real keyboard key" or
"The game's action". Windows only.

## Gauges that do something

A new **When pressed** setting, and the key shows what it does (the title says it, the reading sits over its icon):
- **Damage:** repair (the default), recover to road, respawn, or nothing.
- **RPM, Gear:** start / stop the engine. STOP ENGINE / START ENGINE on top, RPM and gear over the engine icon
  (green running, red stalled or off), with the shift light.
- **Speed:** traction control / drive mode, shown like the Traction key (ESC badge in the mode's colour, mode
  underneath) with the speed over it. Cars without traction control just show the speed.
- New gauge: **Speed + gear** (same options as Speed).

The **Ignition** key also has a new "Engine" display: gear and RPM over a green engine icon, red when it stalls;
pressing starts / stops the engine, and it doubles as a shift light (yellow, then flashing red at the limiter).

## Keys that know where you are

- Back (red X) works like Esc: in the game it opens the pause menu, in a menu it steps back a page, and from
  the pause menu it returns to the game.
- Vehicles: a second press closes the vehicle list and returns to the game.

## Clearer icons

- Weather: one small cloud for less cloud, several for more; fog as a striped cloud (more stripes = thicker);
  fog height as a smaller fog cloud with an up / down arrow; rain as a cloud with more or fewer blue drops;
  wind with longer or shorter lines. All white.
- Recover to road: a car on the road with a glint. Next vehicle: a boxed car with an arrow.
- On foot is now IN CAR, in white and green rather than grey.
- Hazards: red when off, flashing red when on. Indicators: green outline when off, solid flashing green when on.
- Game UI: green when the UI is on, red when it's off.

## Icon pack: every key icon

The icon pack now has all the key icons the plugin uses (183), in each colour and without text, so Hotkeys and
Multi Actions can match the plugin's keys, plus the folder, page and gravity icons. All BeamDeckNG's own drawings.

It also has **tab icons for your own profiles**: GAME, CAR, CAMERA and a new WORLD tab (teal, for environment,
weather, time, gravity...), each for 1 to 4 pages (CAR up to 5), lit for each page (filled dot = the page you're
on) and unlit. Search "tab" in the Icon Library.

## Other changes and fixes

- Day length cycles through 15 min, 20 min, 30 min, 1 h, 2 h and 24 h.
- Lightbar: fixed ERROR on vehicles whose lightbar has no siren (work lights, tow and utility bars); on those the
  key switches OFF / LIGHTS.
- BeamDeckNG MP-MCP 0.1.6: reports which game menu is open (for Back and Vehicles). Server owners: replace the
  add-on zip in your client mods.

## Upgrading from 0.2.11

- Damage gauges now say REPAIR on top (repair is the default press); pick Nothing in "When pressed" for a plain gauge.
- The arrow keys now act as the real arrow keys, so in the car they drive (with the default bindings).

## Downloads

| File | What it is |
| --- | --- |
| `com.yahms.beamdeckng.streamDeckPlugin` | the plugin: double-click to install (Stream Deck 7.1 or later) |
| `com.yahms.beamdeckng.streamDeckIconPack` | icon pack for the Stream Deck Icon Library: double-click to install |
| `BeamDeckNG-icons.zip` | the same icons as plain PNGs, for Set from File |
| `BeamDeckNGv0.2.11-15keyExample.streamDeckProfile` | example 15-key profile: double-click to import |
| `BeamDeckNG-MP-MCP.zip` | for BeamMP server owners: the server-side add-on (goes in the server's client mods) |

**Install:** double-click the plugin, then drag buttons from the **BeamDeckNG** category, or import the example
profile. Enable MCP in BeamNG.drive; Stream Deck must be on the same computer as the game.

Feedback and bug reports are welcome on the Issues page.

## From 0.2.11: overview

**Every key reads the same way.** What the button does is on top (FRONT DIFF, CAMERA HEIGHT, LIGHTBAR PATTERN),
the icon in the middle, and its current mode underneath (OPEN, LOCKED, 4WD...), left out when there's nothing to
add. With no game, no car, or a control your vehicle doesn't have, the key keeps its title and icon, greyed, with
NO GAME / NO CAR / N/A underneath.

**Icons before the game has ever run.** BeamDeckNG now has its own stand-in for every icon, and the icons it reads
from the game are kept in `%APPDATA%\BeamDeckNG`, so updating the plugin no longer loses them.

**BeamMP: BeamDeckNG MP-MCP (server add-on).** BeamMP switches off the game's MCP server in sessions. A server
owner can add `BeamDeckNG-MP-MCP.zip` to the server's client mods; it gives the Stream Deck a listener of its own
that only allows what the server allows. Blocked keys say BLOCKED BY MP, or open the matching in-game menu instead.
Without it, OutGauge (UDP 4444) keeps the gauges and a few lights working.

**New keys and functions**
- Vehicle control (auto): fills itself with the current vehicle's own controls (tray, tilt, ramps, beacons...),
  including a towed trailer's.
- On foot: the arrows walk you, plus turn camera left / right and sprint.
- Camera height and zoom (what Page Up / Down and Shift + Page Up / Down do).
- Lightbar pattern (Chase, Scene, Left / Right Signal...); the lightbar key says LIGHTS / LIGHTS+SIREN.
- Weather: clouds, fog, fog height, rain and wind + / -. Time: + / - 10 min, 1 h, 4 h. Gravity: Jupiter.
- Replay: one key to record, stop, stop playback and eject.
- Trailer says HITCH / UNHITCH; get in / out shows car and person and says GET OUT / GET IN.
- Game function and World keys work inside Multi Actions (e.g. a gravity preset that then returns to your page).

**Example profile and icon pack**
- `BeamDeckNGv0.2.10-15keyExample.streamDeckProfile`: a 15-key layout with GAME / CAR / CAMERA tabs along the top.
  Tap a tab to jump to its group, tap again to step through its pages.
- `com.yahms.beamdeckng.streamDeckIconPack`: folder, page and tab icons for the Stream Deck Icon Library
  (double-click to install). `BeamDeckNG-icons.zip` has the same icons as plain PNGs.

**Plugin keys or keyboard hotkeys?** Some things suit a plain Stream Deck Hotkey better, or you may prefer
one: anything bound to a key in BeamNG.drive (Options > Controls), custom bindings and mod actions included,
works as a hotkey. Hotkeys need the game window focused and can't show the game's state, but don't need MCP.
The icon pack is provided for exactly this, so hotkey, folder and page keys match the plugin's look. (The icons
are BeamDeckNG's own, drawn from Material Symbols; any similarity to the earlier "Beam Deck" icons is accidental.)

**Since 0.2.10:** Game UI shows green when the UI is on and red when it's off. Next / previous camera set to
"only the ones enabled in the game" get their own icon (a camera with a cog) and say GAME LIST.

**Fixes**
- Single diff keys showed FRONT / REAR instead of OPEN / LOCKED; N/A keys could show a state (2WD, OPEN).
- Traction no longer uses an icon that looked like tyre pressure.
- On BeamMP, keys showing a game icon didn't show OPENS MENU.
