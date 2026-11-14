import streamDeck from "@elgato/streamdeck";

import { DiffLock, Drive, Ignition, Range, start, Traction } from "./actions";
import { Game } from "./game";

streamDeck.logger.setLevel("info");

streamDeck.actions.registerAction(new Ignition());
streamDeck.actions.registerAction(new Traction());
streamDeck.actions.registerAction(new DiffLock());
streamDeck.actions.registerAction(new Range());
streamDeck.actions.registerAction(new Drive());

// Only ever talks to the game's own MCP listener on this PC.
start(new Game("127.0.0.1", 29292, "/mcp"));

streamDeck.connect();
