// Browser test harness: the plugin's real Game class, talking to the page's own origin (/mcp).
import { Game } from "../src/game";
window.Game = Game;
