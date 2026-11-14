import streamDeck from "@elgato/streamdeck";

import * as A from "./actions";
import { Game } from "./game";

streamDeck.logger.setLevel("info");

for (const Action of [
	A.Ignition, A.Traction, A.DiffLock, A.Range, A.Drive,
	A.ParkingBrake, A.Headlights, A.FogLights, A.Hazards, A.Indicator, A.Lightbar, A.Horn,
	A.Cruise, A.EngineBrake, A.Retarder, A.AirSuspension, A.Doors, A.Nitrous, A.Jato,
]) {
	streamDeck.actions.registerAction(new Action());
}

// Only ever talks to the game's own MCP listener on this PC.
A.start(new Game("127.0.0.1", 29292, "/mcp"));

streamDeck.connect();
