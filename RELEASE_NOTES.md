# BeamDeckNG 0.2.10 (pre-release)

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

**Fixes**
- Single diff keys showed FRONT / REAR instead of OPEN / LOCKED; N/A keys could show a state (2WD, OPEN).
- Traction no longer uses an icon that looked like tyre pressure.
- On BeamMP, keys showing a game icon didn't show OPENS MENU.

**Install:** double-click `com.yahms.beamdeckng.streamDeckPlugin` (Stream Deck 7.1 or later, including 7.4 and
8.x), then drag buttons from the **BeamDeckNG** category, or double-click the example profile. Enable MCP in
BeamNG.drive; Stream Deck must be on the same computer as the game.

This is a pre-release: feedback and bug reports are welcome on the Issues page.
