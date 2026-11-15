# BeamDeckNG 0.2.2 (alpha)

**Cameras.** The camera key used to be the game's free-camera toggle, so it only flipped between the free camera and
whatever vehicle camera you were last on. There are now three camera keys:

- **Next camera** / **Previous camera** step through every camera the vehicle actually has - driver, hood, chase, orbit,
  external, top down, drone, and any other seats - and show the current one by name. Pressed while the free camera is
  on, they drop you back into the car. The game's own camera key only cycles the cameras left enabled in its camera
  settings; tick "only the ones enabled in the game" on the button to follow that list instead.
- **Free camera on / off** is the old behaviour, on its own key, showing FREE or CAR.

An existing "Camera" key becomes Next camera, so it does what you'd expect without being re-added.

**Install:** double-click `com.yahms.beamdeckng.streamDeckPlugin` (Stream Deck 7.1 or later), then drag buttons from the
**BeamDeckNG** category. The plugin uses the game's native MCP server: enable MCP in BeamNG.drive and it just works, with
no game mod or bridge program. Stream Deck must be on the same computer as the game.

Also in 0.2.x: World keys (time of day, weather, rain on every map, fog, wind, gravity), Gauge keys (speed, gear with
shift light, rpm, fuel, temperatures, boost, damage), a text line on every key, and buttons that show what they are
while the game is closed.

This is an alpha release: feedback and bug reports are welcome on the Issues page.
