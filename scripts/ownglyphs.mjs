// Builds src/ownglyphs.ts: BeamDeckNG's own key glyphs, for shapes the game's icon sprite doesn't have
// (car <-> person for getting in / out, a round radial-menu icon, camera turn arrows, sprint).
// Parts come from Material Symbols (Apache-2.0, Google). Drawn in currentColor (the state colour);
// a part drawn in GREY stays grey, so a glyph can light one half of itself.
// Run: node scripts/ownglyphs.mjs
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
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
	// gauges and readouts, for when there's no reading to draw (no game, not on this vehicle)
	own_g_gear: { viewBox: "0 -960 960 960", inner: `<path fill="currentColor" d="${d("auto_transmission-fill")}"/>` },
	own_g_speed: { viewBox: "0 -960 960 960", inner: `<path fill="currentColor" d="${d("speed-fill")}"/>` },
	own_g_fuel: { viewBox: "0 -960 960 960", inner: `<path fill="currentColor" d="${d("local_gas_station-fill")}"/>` },
	own_g_temp: { viewBox: "0 -960 960 960", inner: `<path fill="currentColor" d="${d("thermostat-fill")}"/>` },
	own_g_oil: { viewBox: "0 -960 960 960", inner: `<path fill="currentColor" d="${d("oil_barrel-fill")}"/>` },
	own_g_boost: { viewBox: "0 -960 960 960", inner: `<path fill="currentColor" d="${d("air")}"/>` },
	own_g_damage: { viewBox: "0 -960 960 960", inner: `<path fill="currentColor" d="${d("car_crash-fill")}"/>` },
	own_hourglass: { viewBox: "0 -960 960 960", inner: `<path fill="currentColor" d="${d("hourglass-fill")}"/>` },
	own_vehcontrol: { viewBox: "0 -960 960 960", inner: `<path fill="currentColor" d="${d("precision_manufacturing-fill")}"/>` },
	own_hitch: { viewBox: "0 -960 960 960", inner: `<path fill="currentColor" d="${d("rv_hookup-fill")}"/>` },
};

// ---- fallbacks: our own stand-in for every game icon a key uses, so keys have an icon even when the
// game has never been running on this PC (the game's own icons are only read from the running game).
const SW = 'fill="none" stroke="currentColor" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"';
const DRAW = {
	diff_open: `<g ${SW}><rect x="6" y="26" width="14" height="44" rx="4"/><rect x="76" y="26" width="14" height="44" rx="4"/><path d="M20 48h18M58 48h18"/><circle cx="48" cy="48" r="11"/></g>`,
	diff_locked: `<g ${SW}><rect x="6" y="26" width="14" height="44" rx="4"/><rect x="76" y="26" width="14" height="44" rx="4"/><path d="M20 48h56"/></g><circle cx="48" cy="48" r="14" fill="currentColor"/>`,
	range_high: `<g ${SW}><path d="M24 22v52M60 22v52M24 48h36"/></g>`,
	range_low: `<g ${SW}><path d="M32 22v52h34"/></g>`,
	awd: `<g ${SW}><rect x="10" y="10" width="16" height="24" rx="4"/><rect x="70" y="10" width="16" height="24" rx="4"/><rect x="10" y="62" width="16" height="24" rx="4"/><rect x="70" y="62" width="16" height="24" rx="4"/><path d="M26 22h44M26 74h44M48 22v52"/></g>`,
	rwd: `<g ${SW}><rect x="10" y="10" width="16" height="24" rx="4" stroke-opacity="0.45"/><rect x="70" y="10" width="16" height="24" rx="4" stroke-opacity="0.45"/><rect x="10" y="62" width="16" height="24" rx="4"/><rect x="70" y="62" width="16" height="24" rx="4"/><path d="M26 74h44M48 40v34"/></g>`,
	engine: `<g ${SW}><path d="M28 30h30v8h10l8 10h8v-8h6v30h-6v-8h-8l-8 12H34l-8-8h-8v10h-6V42h6v10h8V38h2z"/><path d="M36 30v-8h16v8"/></g>`,
	hazard: `<g ${SW}><path d="M48 12 88 80H8z"/><path d="M48 32 70 70H26z" stroke-width="5"/></g>`,
	lightbar: `<g ${SW}><rect x="8" y="50" width="80" height="18" rx="6"/><path d="M22 50a10 10 0 0 1 20 0M54 50a10 10 0 0 1 20 0"/><path d="M32 28v-8M64 28v-8M14 34l-6-6M82 34l6-6"/></g>`,
	signal_left: `<path fill="currentColor" d="M8 48 44 18v18h40v24H44v18z"/>`,
	signal_right: `<path fill="currentColor" d="M88 48 52 18v18H12v24h40v18z"/>`,
	// traction control lamp: car with two skid marks under it
	tc: `<path fill="currentColor" d="M26 22h44l8 18h6v20h-8v-6H20v6h-8V40h6zm6 6-5 12h42l-5-12z"/><g ${SW}><path d="M28 70c6 6 6 12 0 18M48 70c6 6 6 12 0 18M68 70c6 6 6 12 0 18"/></g>`,
};
const own = (k) => ({ viewBox: "0 0 96 96", inner: DRAW[k] });
const ms = (name) => {
	const f = [`${name}-fill.svg`, `${name}.svg`].find((x) => existsSync(path.join(MS, x)));
	if (!f) throw new Error(`no material symbol ${name}`);
	return { viewBox: "0 -960 960 960", inner: `<path fill="currentColor" d="${readFileSync(path.join(MS, f), "utf8").match(/ d="([^"]+)"/)[1]}"/>` };
};
const FB = {
	"cruise-control_cruise-disable": ms("speed"), "cruise-control_cruise-enable": ms("speed"),
	"cruise-control_minus-set": ms("do_not_disturb_on"), "cruise-control_plus-res": ms("add_circle"),
	garage_brakes: ms("compress"), garage_my_cars: ms("garage"), mission_system_time: ms("slow_motion_video"),
	powertrain_differential_closed: own("diff_locked"), powertrain_differential_open: own("diff_open"),
	powertrain_differential_front_locked: own("diff_locked"), powertrain_differential_front_default: own("diff_open"),
	powertrain_differential_rear_locked: own("diff_locked"), powertrain_differential_rear_default: own("diff_open"),
	powertrain_differential_middle_locked: own("diff_locked"), powertrain_differential_middle_default: own("diff_open"),
	powertrain_engine: own("engine"), powertrain_jato: ms("rocket_launch"), powertrain_n2o: ms("bolt"),
	powertrain_rangebox_high: own("range_high"), powertrain_rangebox_low: own("range_low"), "powertrain_rangebox_hi-l": own("range_low"),
	powertrain_shaft_connected: own("awd"), powertrain_shaft_disconnected: own("rwd"), systems_awd: own("awd"), systems_rwd: own("rwd"),
	powertrain_esc: own("tc"), systems_esc: own("tc"), systems_tc: own("tc"),
	radial_couplers: ms("rv_hookup"), radial_fog_lights: ms("foggy"), radial_hazard_lights: own("hazard"), radial_hinges: ms("door_back"),
	radial_home: ms("home"), radial_left_arrow: own("signal_left"), radial_right_arrow: own("signal_right"),
	radial_lightbar: own("lightbar"), radial_wigwags: own("lightbar"), radial_nitrous_oxide: ms("bolt"),
	radial_vehicle_doors: ms("door_front"), radial_vehicle_doors_close: ms("door_front"), radial_vehicle_doors_open: ms("door_open"),
	systems_lift: ms("unfold_more"), systems_suspension: ms("unfold_less"),
	tech_camerafocusonvehicle2: ms("360"), tech_camerafocustopdown: ms("zoom_out_map"), tech_moviecamera: ms("movie"),
	tech_pause: ms("pause"), tech_play: ms("play_arrow"), tech_playround: ms("play_arrow"), tech_reload: ms("refresh"),
	"tire-pressure_pressure-increase": ms("tire_repair"), "tire-pressure_pressure-decrease": ms("tire_repair"),
	"tire-pressure_tire-pressure-fill": ms("tire_repair"), "tire-pressure_tire-pressure-line": ms("tire_repair"),
	material_wb_cloudy: ms("cloud"), material_brightness_2: ms("dark_mode"),
};
// every material_* id the plugin uses falls back to the same Material symbol
const used = new Set();
for (const f of readdirSync(path.join(root, "src")).filter((f) => f.endsWith(".ts") && f !== "ownglyphs.ts"))
	for (const m of readFileSync(path.join(root, "src", f), "utf8").matchAll(/"material_([a-z0-9_]+)"/g)) used.add(m[1]);
for (const n of used) if (!FB[`material_${n}`]) FB[`material_${n}`] = ms(n);

const out = `// Generated by scripts/ownglyphs.mjs - do not edit. Shapes from Material Symbols (Apache-2.0, Google).
export const OWN_GLYPHS: Record<string, { viewBox: string; inner: string }> = ${JSON.stringify(OWN, null, "\t")};
/** Stand-ins for the game's icons (same ids), used until the game has sent its own. */
export const FALLBACK_GLYPHS: Record<string, { viewBox: string; inner: string }> = ${JSON.stringify(FB, null, "\t")};
`;
writeFileSync(path.join(root, "src/ownglyphs.ts"), out);
console.log(`ownglyphs: ${Object.keys(OWN).length} own, ${Object.keys(FB).length} fallbacks`);
