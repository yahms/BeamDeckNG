// Builds src/ownglyphs.ts: BeamDeckNG's own key glyphs, for shapes the game's icon sprite doesn't have
// (car <-> person for getting in / out, a round radial-menu icon, camera turn arrows, sprint).
// Parts come from Material Symbols (Apache-2.0, Google). Drawn in currentColor (the state colour);
// a part drawn in GREY stays grey, so a glyph can light one half of itself.
// Run: node scripts/ownglyphs.mjs
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const MS = path.join(root, "node_modules/@material-symbols/svg-400/rounded");
const d = (name) => readFileSync(path.join(MS, `${name}.svg`), "utf8").match(/ d="([^"]+)"/)[1];
const GREY = "#5c5c5c";

/** A Material symbol (0 -960 960 960) placed at x,y with size s, optionally rotated about its centre. */
const sym = (name, x, y, s, fill = "currentColor", rot = 0) => {
	const k = s / 960;
	const r = rot ? ` rotate(${rot} 480 -480)` : "";
	return `<path transform="translate(${x} ${y + s}) scale(${+k.toFixed(5)})${r}" fill="${fill}" d="${d(name)}"/>`;
};

const SUN = "#FFC300";
function sunAt(dir) {
	// horizon at y=70; half sun r=22 sitting on it; arrow between y=6 and y=40
	const arrow = dir === "up"
		? `<path fill="currentColor" d="M48 6 L64 24 L54 24 L54 40 L42 40 L42 24 L32 24 Z"/>`
		: `<path fill="currentColor" d="M48 40 L64 22 L54 22 L54 6 L42 6 L42 22 L32 22 Z"/>`;
	return `${arrow}<path fill="${SUN}" d="M24 68 A24 24 0 0 1 72 68 Z"/><rect x="6" y="70" width="84" height="7" rx="3.5" fill="currentColor"/>`;
}

const OWN = {
	// in the car: car lit, arrow points out to the (grey) person -> pressing gets you out
	own_walk_car: { viewBox: "0 0 120 120", inner: sym("directions_car-fill", -2, -4, 76) + sym("arrow_forward", 66, 2, 54, "currentColor", 45) + sym("directions_walk-fill", 54, 50, 72, GREY) },
	// on foot: person lit, arrow points back to the (grey) car -> pressing gets you in
	own_walk_foot: { viewBox: "0 0 120 120", inner: sym("directions_car-fill", -2, -4, 76, GREY) + sym("arrow_forward", 0, 66, 54, "currentColor", 225) + sym("directions_walk-fill", 54, 50, 72) },
	// radial menu: a ring of segments round a centre dot
	own_radial: {
		viewBox: "0 0 96 96",
		inner: `<circle cx="48" cy="48" r="36" fill="none" stroke="currentColor" stroke-width="12" stroke-dasharray="${((2 * Math.PI * 36) / 6 - 9).toFixed(2)} 9" transform="rotate(-${90 + 360 / 12} 48 48)"/><circle cx="48" cy="48" r="7" fill="currentColor"/>`,
	},
	own_turn_left: { viewBox: "0 -960 960 960", inner: `<path fill="currentColor" d="${d("rotate_left")}"/>` },
	own_turn_right: { viewBox: "0 -960 960 960", inner: `<path fill="currentColor" d="${d("rotate_right")}"/>` },
	own_sprint: { viewBox: "0 -960 960 960", inner: `<path fill="currentColor" d="${d("directions_run-fill")}"/>` },
	own_eject: { viewBox: "0 -960 960 960", inner: `<path fill="currentColor" d="${d("eject-fill")}"/>` },
	own_record: { viewBox: "0 0 96 96", inner: `<circle cx="48" cy="48" r="30" fill="currentColor"/><circle cx="48" cy="48" r="42" fill="none" stroke="currentColor" stroke-width="6"/>` },
	own_stop: { viewBox: "0 0 96 96", inner: `<rect x="22" y="22" width="52" height="52" rx="6" fill="currentColor"/>` },
	own_play_pause: { viewBox: "0 -960 960 960", inner: `<path fill="currentColor" d="${d("pause-fill")}"/>` },
	own_cloud: { viewBox: "0 -960 960 960", inner: `<path fill="currentColor" d="${d("cloud-fill")}"/>` },
	own_fog: { viewBox: "0 -960 960 960", inner: `<path fill="currentColor" d="${d("foggy-fill")}"/>` },
	own_fog_height: { viewBox: "0 -960 960 960", inner: `<path fill="currentColor" d="${d("height")}"/>` },
	own_rain: { viewBox: "0 -960 960 960", inner: `<path fill="currentColor" d="${d("rainy-fill")}"/>` },
	own_wind: { viewBox: "0 -960 960 960", inner: `<path fill="currentColor" d="${d("air")}"/>` },
	own_gravity: { viewBox: "0 -960 960 960", inner: `<path fill="currentColor" d="${d("public-fill")}"/>` },
	own_schedule: { viewBox: "0 -960 960 960", inner: `<path fill="currentColor" d="${d("schedule-fill")}"/>` },
	// sunrise / sunset: horizon line, yellow half sun, arrow above it (up for sunrise, down for sunset).
	// Only the sun is yellow; line and arrow take the key's colour.
	own_sunrise: { viewBox: "0 0 96 96", inner: sunAt("up") },
	own_sunset: { viewBox: "0 0 96 96", inner: sunAt("down") },
	// camera (or seat) height, and zoom (field of view)
	own_cam_up: { viewBox: "0 0 120 120", inner: sym("videocam-fill", 16, 44, 84, GREY) + `<path fill="currentColor" d="M58 2 L84 30 L68 30 L68 52 L48 52 L48 30 L32 30 Z"/>` },
	own_cam_down: { viewBox: "0 0 120 120", inner: sym("videocam-fill", 16, -8, 84, GREY) + `<path fill="currentColor" d="M58 118 L84 90 L68 90 L68 68 L48 68 L48 90 L32 90 Z"/>` },
	own_zoom_in: { viewBox: "0 -960 960 960", inner: `<path fill="currentColor" d="${d("zoom_in")}"/>` },
	own_zoom_out: { viewBox: "0 -960 960 960", inner: `<path fill="currentColor" d="${d("zoom_out")}"/>` },
	own_hitch: { viewBox: "0 -960 960 960", inner: `<path fill="currentColor" d="${d("rv_hookup-fill")}"/>` },
};

const out = `// Generated by scripts/ownglyphs.mjs - do not edit. Shapes from Material Symbols (Apache-2.0, Google).
export const OWN_GLYPHS: Record<string, { viewBox: string; inner: string }> = ${JSON.stringify(OWN, null, "\t")};
`;
writeFileSync(path.join(root, "src/ownglyphs.ts"), out);
console.log(`ownglyphs: ${Object.keys(OWN).length}`);
