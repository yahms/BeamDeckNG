// Example profiles: BeamDeckNG 15-key (5x3) and 32-key (8x4).
// Top-left three keys are always the tabs: GAME (blue), CAR (green), CAMERA (purple).
// Tap a tab to jump to its group; tap it again to step through the group's pages (the dots show which).
// On the 32-key deck the left 5x3 block of each page matches the 15-key page of the same name, so the
// muscle memory carries over; the extra columns and row hold what the 15-key deck keeps on the next page.
//
// Run: node profiles/layouts.mjs > profiles/plan.json   (consumed by the Stream Deck MCP builder)
import { fileURLToPath } from "node:url";
import { PAGES15, PAGES32, tabFor, tabTarget } from "../scripts/tabicons.mjs";

const BD = "com.yahms.beamdeckng.";
const G = (fn) => ["gamefn", { fn }];
const W = (fn) => ["world", { fn }];
const A = (t, s = {}) => [t, s];

// 12-key blocks, row-major: 2 keys top-right, then two rows of 5.
const MENU = [G("back"), G("accept"), G("map"), G("up"), G("radial"), G("pause"), G("ui"), G("left"), G("down"), G("right"), G("walk"), G("photo")];
const TOOLS = [G("repair"), G("recover"), G("respawn"), G("vehicles"), G("nextveh"), G("trailer"), G("traffic"), G("slowmo"), G("slower"), G("faster"), G("replay"), G("replay_eject")];
const WORLD = [W("clock"), W("wx_cycle"), W("time_back"), W("time_fwd"), W("time_sunrise"), W("time_noon"), W("time_sunset"), W("time_midnight"), W("rain"), W("fog"), W("wind"), W("grav_cycle")];
const DRIVE = [A("gauge", { gauge: "gear" }), A("gauge", { gauge: "speed" }), A("ignition"), A("traction"), A("headlights"), A("fog"), A("lightbar"), A("parkingbrake"), A("indicator", { side: "left" }), A("hazards"), A("indicator", { side: "right" }), A("horn")];
const POWER = [A("enginebrake"), A("gauge", { gauge: "rpm" }), A("drive"), A("range"), A("difflock", { scope: "cycle" }), A("difflock", { scope: "front" }), A("difflock", { scope: "rear" }), A("retarder"), A("airsuspension", { dir: "raise" }), A("airsuspension", { dir: "lower" }), A("powertrain"), A("gauge", { gauge: "boost" })];
const EXTRAS = [A("doors", { part: "doors" }), A("doors", { part: "trunk" }), A("cruise", { op: "toggle" }), A("cruise", { op: "minus" }), A("cruise", { op: "plus" }), A("nitrous"), A("jato"), A("tires", { group: "all", tdir: "inflate" }), A("tires", { group: "all", tdir: "deflate" }), A("doors", { part: "hood" }), A("gauge", { gauge: "fuel" }), A("gauge", { gauge: "damage" })];
const CAMERA = [G("cam_cycle"), G("cam_prev"), G("cam_driver"), G("cam_chase"), G("cam_orbit"), G("cam_external"), G("cam_top"), G("look_back"), G("cam_center"), G("cam_free"), G("replay"), G("photo")];

// 12 keys into the 5x3 block beside the tabs
const LEFT = [[0, 3], [0, 4], [1, 0], [1, 1], [1, 2], [1, 3], [1, 4], [2, 0], [2, 1], [2, 2], [2, 3], [2, 4]];
// 12 keys into cols 5-7, rows 0-3 (32-key only)
const RIGHT = [0, 1, 2, 3].flatMap((r) => [5, 6, 7].map((c) => [r, c]));
// row 3, cols 0-4 (32-key only)
const BOTTOM = [0, 1, 2, 3, 4].map((c) => [3, c]);
const put = (cells, keys) => keys.map((k, i) => k && { row: cells[i][0], col: cells[i][1], type: BD + k[0], settings: k[1] }).filter(Boolean);

const L15 = { MENU: put(LEFT, MENU), TOOLS: put(LEFT, TOOLS), WORLD: put(LEFT, WORLD), DRIVE: put(LEFT, DRIVE), POWER: put(LEFT, POWER), EXTRAS: put(LEFT, EXTRAS), CAMERA: put(LEFT, CAMERA) };
const L32 = {
	GAME: [...put(LEFT, MENU), ...put(RIGHT, TOOLS), ...put(BOTTOM, [W("time_back"), W("time_fwd"), W("clock"), W("wx_cycle"), G("reload_lua")])],
	WORLD: [...put(LEFT, WORLD), ...put(RIGHT, [W("wx_clear"), W("wx_cloudy"), W("wx_rain"), W("wx_storm"), W("wx_fog"), W("daylen"), W("grav_earth"), W("grav_moon"), W("grav_mars"), W("grav_zero")])],
	DRIVE: [...put(LEFT, DRIVE), ...put(RIGHT, POWER), ...put(BOTTOM, [A("cruise", { op: "toggle" }), A("cruise", { op: "minus" }), A("cruise", { op: "plus" }), A("doors", { part: "doors" }), A("gauge", { gauge: "fuel" })])],
	// cols 5-7 are left free for Vehicle control (auto) slots 1-12 (BeamDeckNG 0.2.5+)
	EXTRAS: put(LEFT, EXTRAS),
	CAMERA: [...put(LEFT, CAMERA), ...put(RIGHT, [G("slowmo"), G("slower"), G("faster"), G("replay_eject"), G("ui"), G("pause")])],
};

function plan(pages, layout, tag) {
	return pages.map(([g, name], p) => ({
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
