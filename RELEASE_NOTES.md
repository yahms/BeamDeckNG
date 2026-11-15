# BeamDeckNG 0.2.3 (alpha)

**New: Tyre pressure keys.** For vehicles with a central tyre inflation system, such as the Autobello Stambecco 6x6.
Pick one axle or all wheels, then hold the key to inflate or deflate; the key shows that group's pressure in psi and
lights up while the pump is running.

**New game functions:** eject replay (stopping a recording leaves the game in replay mode - this drops out of it) and
reload Lua.

**Next vehicle** now shows the car you're in by name, drawn in that car's paint colour.

**Icon changes**
- Headlights: solid green on low beam and solid blue on high beam, drawn by the plugin itself; plain white outline when
  off, with no line through it. The green used across the plugin is a little brighter.
- Drive modes: always the game's round ESC badge, in the mode's colour, and grey when ESC is off.
- Game UI key: shows UI ON / UI OFF with a UI icon.
- Replay: a video camera, and NOT RECORDING when idle.

**Fixes**
- If the game is asked for its icons before it has finished loading, the plugin no longer remembers the icons as
  missing; it asks again, and retries anything the game didn't have a minute later.
- The plugin writes its version to its log on startup, which makes it obvious which build is actually running.

**Install:** double-click `com.yahms.beamdeckng.streamDeckPlugin` (Stream Deck 7.1 or later), then drag buttons from the
**BeamDeckNG** category. The plugin uses the game's native MCP server: enable MCP in BeamNG.drive and it just works, with
no game mod or bridge program. Stream Deck must be on the same computer as the game.

This is an alpha release: feedback and bug reports are welcome on the Issues page.
