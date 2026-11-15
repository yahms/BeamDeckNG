// Browser preview of the key faces with the game's real icons (see test/rollup.icons.mjs).
import { GLYPHS, withGlyph } from "../src/glyphmap";
import { P, render, storeGlyphs, takeWantedGlyphs } from "../src/icons";
import { WORLD_FUNCS } from "../src/world";
import { GAUGES } from "../src/gauges";
import { GAME_FUNCS } from "../src/gamefns";
window.BD = { GLYPHS, withGlyph, P, render, storeGlyphs, takeWantedGlyphs, WORLD_FUNCS, GAUGES, GAME_FUNCS };
