# BeamDeckNG 0.2.13

## What's new since 0.2.11

**Keys that know where you are**
- Back (red X) in the game opens the pause menu, like Escape; in a menu it goes back a page.
- Vehicles: a second press closes the vehicle list and returns to the game.
- The arrows fly the free camera (as well as walking on foot and moving through menus).

**Engine key.** The Ignition key has a new "Engine" display: gear and RPM over a green engine icon, and a red engine icon when it
stalls. Pressing it starts / stops the engine, and it doubles as a shift light (yellow, then
flashing red at the limiter).

**Clearer icons**
- Weather: one small cloud for less cloud, several for more; fog as a striped cloud (more stripes = thicker);
  fog height as a smaller fog cloud with an up / down arrow; rain as a cloud with more or fewer blue drops; wind
  with longer or shorter lines. All white.
- Recover to road: a car on the road with a glint. Next vehicle: a boxed car with an arrow.
- On foot is now IN CAR, in white and green rather than grey.
- Hazards: red when off, flashing red when on. Indicators: green outline when off, solid flashing green when on.
- Game UI: green when the UI is on, red when it's off.

**Other changes**
- Day length cycles through 15 min, 20 min, 30 min, 1 h, 2 h and 24 h.
- Lightbar: fixed an ERROR on vehicles whose lightbar has no siren (work lights, tow and utility bars); on those
  the key just switches OFF / LIGHTS.
- BeamDeckNG MP-MCP 0.1.6: reports which game menu is open (for Back and Vehicles above).

## Overview (0.2.11)

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

**Install:** double-click `com.yahms.beamdeckng.streamDeckPlugin` (Stream Deck 7.1 or later, including 7.4 and
8.x), then drag buttons from the **BeamDeckNG** category, or double-click the example profile. Enable MCP in
BeamNG.drive; Stream Deck must be on the same computer as the game.

Feedback and bug reports are welcome on the Issues page.
