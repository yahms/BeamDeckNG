// Example profiles: BeamDeckNG 15-key (5x3) and 32-key (8x4).
// Top-left three keys are always the tabs: GAME (blue), CAR (green), CAMERA (purple).
// Tap a tab to jump to its group; tap it again to step through the group's pages (the dots show which).
// On the 32-key deck the left 5x3 block of each page matches the 15-key page of the same name, so the
// muscle memory carries over; the extra columns and row hold what the 15-key deck keeps on other pages.
//
// Run: node profiles/layouts.mjs > profiles/plan.json   (consumed by the Stream Deck MCP builder)
import { fileURLToPath } from "node:url";
import { PAGES15, PAGES32, tabFor, tabTarget } from "../scripts/tabicons.mjs";

const BD = "com.yahms.beamdeckng.";
const G = (fn) => ["gamefn", { fn }];
const W = (fn) => ["world", { fn }];
const A = (t, s = {}) => [t, s];
const GAUGE = (gauge) => A("gauge", { gauge });
const __ = null; // empty key

// Gravity: a folder of presets. Each preset is a Multi Action (set gravity, then Switch Profile back
// to the page the folder is on), so picking one drops you straight back where you were.
const GRAVITY = (page) => ["FOLDER", { name: "Gravity", icon: "gravity-folder.png", back: page,
	keys: ["earth", "moon", "mars", "zero", "jupiter"].map((p, i) => ({ row: 1, col: i, icon: `grav-${p}.png`, steps: [W(`grav_${p}`)] })) }];

// 12-key blocks, row-major: 2 keys top-right, then two rows of 5.
const MENU = [G("back"), G("accept"),
	G("pause"), G("turn_left"), G("up"), G("turn_right"), G("radial"),
	G("sprint"), G("left"), G("down"), G("right"), G("walk")];
const TOOLS = [G("map"), G("replay_ctl"),
	G("repair"), G("recover"), G("respawn"), G("vehicles"), G("nextveh"),
	G("trailer"), G("traffic"), G("slowmo"), G("slower"), G("faster")];
const WEATHER = (gravPage) => [W("wx_cycle"), GRAVITY(gravPage),
	W("cloud_up"), W("fog_up"), W("fogh_up"), W("rain_up"), W("wind_up"),
	W("cloud_down"), W("fog_down"), W("fogh_down"), W("rain_down"), W("wind_down")];
const TIME = [W("clock"), W("daylen"),
	W("time_p10m"), W("time_p1h"), W("time_p4h"), W("time_sunrise"), W("time_noon"),
	W("time_m10m"), W("time_m1h"), W("time_m4h"), W("time_sunset"), W("time_midnight")];
const DRIVE = [GAUGE("gear"), GAUGE("speed"),
	A("ignition"), A("traction"), A("headlights"), A("range"), A("drive"),
	A("parkingbrake"), A("difflock", { scope: "cycle" }), A("cruise", { op: "toggle" }), G("trailer"), A("horn")];
// lightbar pattern sits under the lightbar; the rest of row 3 is left for the vehicle's own lights
// (beacons, work lights: Vehicle control keys)
const LIGHTS = [A("headlights"), A("fog"),
	A("indicator", { side: "left" }), A("hazards"), A("indicator", { side: "right" }), A("lightbar"), A("horn"),
	A("headlights", { press: "low" }), A("headlights", { press: "high" }), __, A("lightbar", { press: "pattern" }), __];
const DASH = [GAUGE("gear"), GAUGE("speed"),
	A("ignition"), GAUGE("rpm"), GAUGE("boost"), GAUGE("fuel"), GAUGE("water"),
	A("parkingbrake"), GAUGE("oil"), GAUGE("damage"), A("traction"), A("headlights")];
const POWER = [A("enginebrake"), A("retarder"),
	A("difflock", { scope: "front" }), A("difflock", { scope: "rear" }), A("difflock", { scope: "center" }), A("difflock", { scope: "all" }), A("powertrain"),
	A("airsuspension", { dir: "raise" }), A("airsuspension", { dir: "lower" }), A("range"), A("drive"), GAUGE("rpm")];
const EXTRAS = [A("doors", { part: "doors" }), A("doors", { part: "trunk" }),
	A("cruise", { op: "toggle" }), A("cruise", { op: "minus" }), A("cruise", { op: "plus" }), A("nitrous"), A("jato"),
	A("tires", { group: "all", tdir: "inflate" }), A("tires", { group: "all", tdir: "deflate" }), A("doors", { part: "hood" }), GAUGE("fuel"), GAUGE("damage")];
const CAMERA = [G("cam_cycle"), G("cam_prev"),
	G("cam_driver"), G("cam_chase"), G("cam_orbit"), G("cam_external"), G("cam_top"),
	G("look_back"), G("cam_center"), G("cam_free"), G("ui"), G("photo")];

// 12 keys into the 5x3 block beside the tabs
const LEFT = [[0, 3], [0, 4], [1, 0], [1, 1], [1, 2], [1, 3], [1, 4], [2, 0], [2, 1], [2, 2], [2, 3], [2, 4]];
// 12 keys into cols 5-7, rows 0-3 (32-key only)
const RIGHT = [0, 1, 2, 3].flatMap((r) => [5, 6, 7].map((c) => [r, c]));
// row 3, cols 0-4 (32-key only)
const BOTTOM = [0, 1, 2, 3, 4].map((c) => [3, c]);
const put = (cells, keys) =>
	keys.map((k, i) => k && (k[0] === "FOLDER" ? { row: cells[i][0], col: cells[i][1], type: "FOLDER", ...k[1] } : { row: cells[i][0], col: cells[i][1], type: BD + k[0], settings: k[1] })).filter(Boolean);
const page = (pages, name) => pages.findIndex((p) => p[1] === name) + 1; // 1-based, as Stream Deck counts

const L15 = {
	MENU: put(LEFT, MENU), TOOLS: put(LEFT, TOOLS), WEATHER: put(LEFT, WEATHER(page(PAGES15, "WEATHER"))), TIME: put(LEFT, TIME),
	DRIVE: put(LEFT, DRIVE), LIGHTS: put(LEFT, LIGHTS), DASH: put(LEFT, DASH), POWER: put(LEFT, POWER), EXTRAS: put(LEFT, EXTRAS),
	CAMERA: put(LEFT, CAMERA),
};
const L32 = {
	GAME: [...put(LEFT, MENU), ...put(RIGHT, TOOLS), ...put(BOTTOM, [G("ui"), G("photo"), G("cam_cycle"), W("wx_cycle"), W("clock")])],
	WORLD: [...put(LEFT, WEATHER(page(PAGES32, "WORLD"))),
		...put(RIGHT, [W("time_p10m"), W("time_p1h"), W("time_p4h"), W("time_m10m"), W("time_m1h"), W("time_m4h"),
			W("time_sunrise"), W("time_noon"), W("time_sunset"), W("time_midnight"), W("clock"), W("daylen")]),
		...put(BOTTOM, ["earth", "moon", "mars", "zero", "jupiter"].map((p) => W(`grav_${p}`)))],
	DRIVE: [...put(LEFT, DRIVE),
		...put(RIGHT, [A("indicator", { side: "left" }), A("hazards"), A("indicator", { side: "right" }),
			A("headlights", { press: "low" }), A("headlights", { press: "high" }), A("fog"),
			A("lightbar"), A("cruise", { op: "minus" }), A("cruise", { op: "plus" }),
			A("lightbar", { press: "pattern" }), A("doors", { part: "doors" }), A("doors", { part: "trunk" })]),
		...put(BOTTOM, [GAUGE("rpm"), GAUGE("fuel"), GAUGE("water"), GAUGE("boost"), GAUGE("damage")])],
	// cols 5-7 left free for Vehicle control (auto) keys
	DASH: [...put(LEFT, DASH), ...put(BOTTOM, [A("cruise", { op: "toggle" }), A("nitrous"), A("jato"), A("tires", { group: "all", tdir: "inflate" }), A("tires", { group: "all", tdir: "deflate" })])],
	POWER: [...put(LEFT, POWER), ...put(RIGHT, EXTRAS)],
	CAMERA: [...put(LEFT, CAMERA), ...put(RIGHT, [G("slowmo"), G("slower"), G("faster"), G("replay_ctl"), G("pause"), G("map")])],
};

function plan(pages, layout, tag) {
	return pages.map(([, name], p) => ({
		name,
		keys: [
			...["game", "car", "cam"].map((tg, col) => ({
				row: 0, col, type: "com.elgato.streamdeck.page.goto",
				settings: { PageIndex: tabTarget(pages, tg, p) },
				icon: `${tag}-p${p + 1}-${tg}.png`,
				tab: tabFor(pages, tg, p),
			})),
			...layout[name],
		],
	}));
}

export const PLAN = { p15: plan(PAGES15, L15, "15"), p32: plan(PAGES32, L32, "32") };

if (process.argv[1] === fileURLToPath(import.meta.url)) console.log(JSON.stringify(PLAN));
