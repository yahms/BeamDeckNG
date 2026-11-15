# BeamDeckNG 0.2.1 (alpha)

**Fix: keys showed only text, with no icon.** Stream Deck's SVG renderer is stricter than a browser's and silently
dropped the part of the key image that held the game's icon. Key images are now plain SVG that it renders.

- Every key also carries a text line saying what it is or what state it's in (OFF / LOW / HIGH, LOCKED, ORBIT...), so a
  key is never blank even before the game has sent its icons.

Everything from 0.2.0 is included:

- **World button:** time of day clock (press to run or freeze time), sunrise / noon / sunset / midnight presets, +/- an
  hour, day length; weather presets (clear, cloudy, fog, rain, storm) and separate rain, fog and wind keys; gravity
  presets. Rain works on every map, including maps with no rain of their own such as Gridmap v2. Preset keys light up
  green when that preset is the current one.
- **Gauge button:** speed (km/h or mph), gear with shift light, rpm, fuel, coolant and oil temperature, boost, damage
  (press to repair).
- **Layouts without the game running:** with no game, no car or a map loading, each button shows its own icon (dimmed)
  and name. Icons read from the game are remembered on your PC between sessions.

**Install:** double-click `com.yahms.beamdeckng.streamDeckPlugin` (Stream Deck 7.1 or later), then drag buttons from the
**BeamDeckNG** category. The plugin uses the game's native MCP server: enable MCP in BeamNG.drive and it just works, with
no game mod or bridge program. Stream Deck must be on the same computer as the game.

This is an alpha release: feedback and bug reports are welcome on the Issues page.
