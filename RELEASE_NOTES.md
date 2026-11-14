# BeamDeckNG 0.1.0 (alpha)

First release of BeamDeckNG, a Stream Deck plugin for BeamNG.drive. Each button shows the live state of the vehicle or the
game. The plugin talks only to the game's built-in MCP server on `127.0.0.1:29292`; nothing else is needed.

**Install:** double-click `com.yahms.beamdeckng.streamDeckPlugin` (Stream Deck 7.1 or later), then drag buttons from the
**BeamDeckNG** category. `BeamDeckNG-icons.zip` contains 30 category icons, in white and orange, for Stream Deck folder and
page buttons.

## Buttons

- **Vehicle:** ignition (with a red stalled state), drive modes (cycles the vehicle's own modes, coloured like the game's
  ESC button), diff locks (front / rear / centre / all, or a rear > both > front > none cycle that also steps through
  centre diff modes), range, 2WD / 4WD, and **Powertrain (game bar)**, which mirrors the game's own powertrain buttons
  for the current vehicle.
- **Lights and body:** headlights, fog lights, hazards, indicators, lightbar, horn (held), parking brake, doors / bonnet / boot.
- **Driving:** cruise control (on/off with set speed, set, +, -), engine brake, retarder, air suspension (held),
  nitrous (tap to arm, hold to spray), JATO (hold to fire).
- **Game function:** pause, repair, recover, respawn, accept / back, get in / out, map, vehicle selector, radial menu,
  slow motion, game UI, traffic, trailer, next vehicle, menu arrows, camera modes, look back, replay, or any game
  action by name.

Buttons for features the current vehicle doesn't have are dimmed.

This is an alpha release: feedback and bug reports are welcome on the Issues page.
