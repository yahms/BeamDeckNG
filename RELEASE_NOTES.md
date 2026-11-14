# BeamDeckNG 0.1.0

First release: a Stream Deck plugin for BeamNG.drive. Every button shows the live state of your vehicle or the game, and
talks only to the game's own MCP server on `127.0.0.1:29292`.

**Install:** double-click `com.yahms.beamdeckng.streamDeckPlugin` (Stream Deck 7.1 or later), then drag buttons from the
**BeamDeckNG** category. `BeamDeckNG-icons.zip` has 30 category icons (white + orange) for your own folder and page buttons.

## Buttons

- **Vehicle:** ignition (with a red stalled state), drive modes (cycles the car's own modes, coloured like the game's
  ESC button), diff locks (front / rear / centre / all, or a rear > both > front > none cycle that also steps through
  centre diff modes), range, 2WD / 4WD, and **Powertrain (game bar)**, which mirrors the game's own powertrain buttons
  for whatever vehicle you're in.
- **Lights and body:** headlights, fog, hazards, indicators, lightbar, horn (held), parking brake, doors / bonnet / boot.
- **Driving:** cruise control (on/off with set speed, set, +, -), engine brake, retarder, air suspension (held),
  nitrous (tap to arm, hold to spray), JATO (hold to fire).
- **Game function:** pause, repair, recover, respawn, accept / back, get in / out, map, vehicle selector, radial menu,
  slow motion, game UI, traffic, trailer, next vehicle, menu arrows, camera modes, look back, replay, or any game
  action by name.

Buttons for things the current vehicle doesn't have are dimmed.
