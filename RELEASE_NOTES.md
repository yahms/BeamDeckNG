# BeamDeckNG 0.1.1 (alpha)

**New icons.** Button icons now come from your own copy of BeamNG.drive: while the game is running, the plugin reads the
icons it needs from the game's UI icon set and colours them by state. No game artwork ships with the plugin.

- Colours follow the game's drive-mode colours: white = idle, green = on, blue = mode / info, yellow = caution or in
  progress, red = alert (engine stopped, parking brake, hazards, errors), grey = off. Drive mode buttons use the game's
  colour for each mode.
- Accept is a green tick and Back a red cross.
- Until the game answers, buttons show their name as text.
- You can still use your own PNGs per state (see the README); they win over the game's icons.
- New category icons for folders and pages (`BeamDeckNG-icons.zip`): 31 icons in white and green, plus a green tick
  (yes) and red cross (no). Built from Material Symbols (Apache 2.0) and our own drawings.
- Early test builds used the Beam Deck icon pack from the beamng.com forums; those icons have been removed.

**Install:** double-click `com.yahms.beamdeckng.streamDeckPlugin` (Stream Deck 7.1 or later), then drag buttons from the
**BeamDeckNG** category. The plugin uses the game's native MCP server: enable MCP in BeamNG.drive and it just works, with
no game mod or bridge program. Stream Deck must be on the same computer as the game.

This is an alpha release: feedback and bug reports are welcome on the Issues page.
