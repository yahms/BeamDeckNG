// README pictures: example pages on a 15-key deck, keys changing state, and keys in each mode.
// Uses the plugin's own renderer and BeamDeckNG's stand-in icons (no game artwork).
// node test/compile.mjs && node test/screens.mjs   ->  docs/images/*.png
import * as A from "./build/bin/actions.js";
import { GameFunction } from "./build/bin/gamefns.js";
import { World } from "./build/bin/world.js";
import { Gauge } from "./build/bin/gauges.js";
import { Tires } from "./build/bin/tires.js";
import { Powertrain } from "./build/bin/powertrain.js";
import { render } from "./build/bin/icons.js";
import { Resvg } from "@resvg/resvg-js";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

const OUT = "docs/images";
mkdirSync(OUT, { recursive: true });
const CLASSES = {
	ignition: A.Ignition, traction: A.Traction, difflock: A.DiffLock, range: A.Range, drive: A.Drive, parkingbrake: A.ParkingBrake,
	headlights: A.Headlights, fog: A.FogLights, hazards: A.Hazards, indicator: A.Indicator, lightbar: A.Lightbar, horn: A.Horn,
	cruise: A.Cruise, enginebrake: A.EngineBrake, retarder: A.Retarder, airsuspension: A.AirSuspension, doors: A.Doors,
	nitrous: A.Nitrous, jato: A.Jato, gauge: Gauge, tires: Tires, powertrain: Powertrain, gamefn: GameFunction, world: World,
};

// a pickup on a sunny afternoon, cruising
const STATUS = {
	running: true, ign: 2, hasTC: true, tc: true, tcMode: { name: "Comfort", key: "comfort", color: "#238be6" },
	diff: { front: "open", rear: "locked", center: "open" }, range: "high", drive: "4wd", pbrake: false, lights: 1, fog: 0,
	hazard: false, sigL: 0, sigR: 0, lightbar: 0, lbm: 1, lbn: "Chase", lbc: 4, horn: 0, cruise: { on: true, speed: 27.8 },
	ebrake: 0, retarder: 2, air: true, doors: { FL: false, FR: false }, doorsOpen: 0, n2o: { armed: false, override: false, active: false },
	tp: [{ k: "all", n: "All", psi: 32 }], g: { spd: 27.6, gear: "5", gi: 5, rpm: 1950, maxrpm: 6500, fuel: 0.72, water: 92, oil: 104, boost: 6.4, boostMax: 14, dmg: 0 },
};
const GE = { paused: false, walking: false, cam: "orbit", replay: "inactive", towing: false, ui: true, timeScale: 1, tod: { time: 0.12, play: true, dayLength: 1800 }, cloud: 1.5, fog: 0.08, fogH: 235, wind: 2, rain: 0, grav: -9.81 };
const fake = { snapshot: {}, backend: "mcp", blocked: () => null, canMenu: () => false, poll: async () => {}, fetchGlyphs: async () => {}, mcpLink: "ok", message: () => {} };
A.start(fake);

const svgToPng = (svg) => new Resvg(svg, { font: { loadSystemFonts: true } }).render().asPng();
const keyPng = (url) =>
	url.startsWith("data:image/svg") ? "data:image/png;base64," + Buffer.from(svgToPng(Buffer.from(url.split(",")[1], "base64").toString())).toString("base64") : url;
let n = 0;
function keyImage(type, settings, snap) {
	const impl = new CLASSES[type]();
	const e = { action: { id: `k${n++}` }, impl, settings, busy: false };
	return keyPng(render(A.faceFor(e, snap), 0));
}
const file = (p) => "data:image/png;base64," + readFileSync(p).toString("base64");
const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");

// ---- a 15-key deck: dark body, rounded keys
const K = 88, G = 12, PAD = 18;
function deck(keys, cols = 5, rows = 3) {
	const w = PAD * 2 + cols * K + (cols - 1) * G, h = PAD * 2 + rows * K + (rows - 1) * G;
	let s = `<rect width="${w}" height="${h}" rx="26" fill="#17191c" stroke="#2b2e33" stroke-width="2"/>`;
	for (let r = 0; r < rows; r++)
		for (let c = 0; c < cols; c++) {
			const x = PAD + c * (K + G), y = PAD + r * (K + G), img = keys[`${r},${c}`];
			s += `<clipPath id="c${x}_${y}_${n}"><rect x="${x}" y="${y}" width="${K}" height="${K}" rx="12"/></clipPath>`;
			s += img ? `<image x="${x}" y="${y}" width="${K}" height="${K}" href="${img}" clip-path="url(#c${x}_${y}_${n})"/>` : `<rect x="${x}" y="${y}" width="${K}" height="${K}" rx="12" fill="#000"/>`;
		}
	n++;
	return { svg: s, w, h };
}
function sheet(panels, cols, file, title) {
	const pw = panels[0].w, ph = panels[0].h + 34, gap = 28;
	const rows = Math.ceil(panels.length / cols);
	const W = cols * pw + (cols + 1) * gap, H = rows * ph + (rows + 1) * gap + (title ? 10 : 0);
	let s = "";
	panels.forEach((p, i) => {
		const x = gap + (i % cols) * (pw + gap), y = gap + Math.floor(i / cols) * (ph + gap);
		s += `<text x="${x + 4}" y="${y + 20}" font-family="Arial" font-size="18" font-weight="bold" fill="#e6e6e6">${esc(p.caption)}</text>`;
		s += `<g transform="translate(${x} ${y + 30})">${p.svg}</g>`;
	});
	writeFileSync(`${OUT}/${file}`, svgToPng(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><rect width="100%" height="100%" fill="#0d0e10"/>${s}</svg>`));
	console.log(`${OUT}/${file}`);
}

// ---- 1. example pages (the example layout in profiles/plan.json, tab icons from profiles/tabs)
const PLAN = JSON.parse(readFileSync("profiles/plan.json", "utf8")).p15;
const live = { link: "ok", status: STATUS, ge: GE, vid: 1 };
const want = ["DRIVE", "LIGHTS", "DASH", "MENU", "WEATHER", "TIME"];
const captions = {
	DRIVE: "CAR tab, page 1: DRIVE", LIGHTS: "CAR tab, page 2: LIGHTS", DASH: "CAR tab, page 3: DASH",
	MENU: "GAME tab, page 1: MENU (and on foot)", WEATHER: "GAME tab, page 3: WEATHER", TIME: "GAME tab, page 4: TIME",
};
const pages = want.map((name) => {
	const p = PLAN.find((x) => x.name === name);
	const keys = {};
	for (const k of p.keys) {
		const at = `${k.row},${k.col}`;
		if (k.icon) keys[at] = file(`profiles/tabs/${k.icon}`);
		else if (k.type === "FOLDER") keys[at] = file(`profiles/tabs/${k.icon ?? "gravity-folder.png"}`);
		else keys[at] = keyImage(k.type.split(".").pop(), k.settings, live);
	}
	return { ...deck(keys), caption: captions[name] };
});
sheet(pages, 2, "pages.png");

// ---- 2. keys changing state
const strip = (caption, frames) => {
	const keys = {};
	frames.forEach((f, i) => (keys[`0,${i}`] = f));
	return { ...deck(keys, frames.length, 1), caption };
};
const st = (over, ge = {}) => ({ link: "ok", status: { ...STATUS, ...over }, ge: { ...GE, ...ge }, vid: 1 });
const states = [
	strip("Ignition", [
		keyImage("ignition", {}, st({ running: false, ign: 0 })), keyImage("ignition", {}, st({ running: false, ign: 1 })),
		keyImage("ignition", {}, st({})), keyImage("ignition", {}, st({ running: false, ign: 2 })),
	]),
	strip("Drive mode (game colours)", [
		keyImage("traction", {}, st({ tcMode: { name: "Comfort", key: "comfort", color: "#238be6" } })),
		keyImage("traction", {}, st({ tcMode: { name: "Sport", key: "sport", color: "#ffc300" } })),
		keyImage("traction", {}, st({ tcMode: { name: "Drift", key: "drift", color: "#8cd419" } })),
		keyImage("traction", {}, st({ tc: false, tcMode: { name: "ESC & TC Off", key: "off", color: "#999999" } })),
	]),
	strip("Headlights", [keyImage("headlights", {}, st({ lights: 0 })), keyImage("headlights", {}, st({ lights: 1 })), keyImage("headlights", {}, st({ lights: 2 }))]),
	strip("Rear diff / cycle", [
		keyImage("difflock", { scope: "rear" }, st({ diff: { rear: "open" } })), keyImage("difflock", { scope: "rear" }, st({ diff: { rear: "locked" } })),
		keyImage("difflock", { scope: "all" }, st({ diff: { front: "locked", center: "locked", rear: "locked" } })),
	]),
	strip("Lightbar / pattern", [
		keyImage("lightbar", {}, st({ lightbar: 0 })), keyImage("lightbar", {}, st({ lightbar: 1 })), keyImage("lightbar", {}, st({ lightbar: 2 })),
		keyImage("lightbar", { press: "pattern" }, st({ lightbar: 1, lbm: 2, lbn: "Scene" })),
	]),
	strip("Replay: one key", [
		keyImage("gamefn", { fn: "replay_ctl" }, st({}, { replay: "inactive" })), keyImage("gamefn", { fn: "replay_ctl" }, st({}, { replay: "recording" })),
		keyImage("gamefn", { fn: "replay_ctl" }, st({}, { replay: "playback", replayPaused: false })), keyImage("gamefn", { fn: "replay_ctl" }, st({}, { replay: "playback", replayPaused: true })),
	]),
	strip("Fuel", [
		keyImage("gauge", { gauge: "fuel" }, st({ g: { ...STATUS.g, fuel: 0.8 } })), keyImage("gauge", { gauge: "fuel" }, st({ g: { ...STATUS.g, fuel: 0.2 } })),
		keyImage("gauge", { gauge: "fuel" }, st({ g: { ...STATUS.g, fuel: 0.04, low: true } })),
	]),
	strip("Get in / out, trailer", [
		keyImage("gamefn", { fn: "walk" }, st({}, { walking: false })), keyImage("gamefn", { fn: "walk" }, st({}, { walking: true })),
		keyImage("gamefn", { fn: "trailer" }, st({}, { towing: false })), keyImage("gamefn", { fn: "trailer" }, st({}, { towing: true })),
	]),
];
sheet(states, 2, "states.png");

// ---- 3. the same keys in each mode
const MODE_KEYS = [["ignition", {}], ["difflock", { scope: "front" }], ["lightbar", {}], ["gauge", { gauge: "speed" }], ["gamefn", { fn: "repair" }], ["world", { fn: "time_sunrise" }]];
const modeRow = (caption, snap, fakeOver = {}) => {
	Object.assign(fake, { backend: "mcp", blocked: () => null, canMenu: () => false }, fakeOver);
	const keys = {};
	MODE_KEYS.forEach(([t, s], i) => (keys[`0,${i}`] = keyImage(t, s, snap)));
	return { ...deck(keys, MODE_KEYS.length, 1), caption };
};
const modes = [
	modeRow("Live", live),
	modeRow("Game paused", { link: "paused", status: STATUS, ge: { ...GE, paused: true }, vid: 1 }),
	modeRow("Not on this vehicle (e.g. no lightbar, no front diff)", { link: "ok", status: { ...STATUS, diff: { rear: "locked" }, lightbar: undefined }, ge: GE, vid: 1 }),
	modeRow("Game running, no car (walking / loading)", { link: "novehicle", ge: GE }),
	modeRow("Game not running", { link: "offline" }),
	modeRow("BeamMP with MP-MCP: blocked by the server, or opens the game's menu", live, {
		backend: "addon",
		blocked: (cmd) => (cmd ? "blocked" : null),
		canMenu: (m) => m === "environment" || m === "simulation",
	}),
];
sheet(modes, 1, "modes.png");
process.exit(0);
