// Contact sheet of every key type in three modes: live, not on this vehicle, no game.
// node test/compile.mjs && node test/sheet.mjs  ->  test/build/sheet-*.png
import * as A from "./build/bin/actions.js";
import { GameFunction } from "./build/bin/gamefns.js";
import { World } from "./build/bin/world.js";
import { Gauge } from "./build/bin/gauges.js";
import { Tires } from "./build/bin/tires.js";
import { Powertrain } from "./build/bin/powertrain.js";
import { VehicleControl } from "./build/bin/vehkeys.js";
import { render } from "./build/bin/icons.js";
import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";

const KEYS = [
	[A.Ignition, {}], [A.Ignition, { show: "engine" }], [A.Traction, {}], [A.Traction, { press: "toggle" }], [A.DiffLock, { scope: "front" }], [A.DiffLock, { scope: "rear" }],
	[A.DiffLock, { scope: "cycle" }], [A.Range, {}], [A.Drive, {}], [A.ParkingBrake, {}], [A.Headlights, {}], [A.Headlights, { press: "high" }],
	[A.FogLights, {}], [A.Hazards, {}], [A.Indicator, { side: "left" }], [A.Indicator, { side: "right" }], [A.Lightbar, {}], [A.Lightbar, { press: "pattern" }],
	[A.Horn, {}], [A.Cruise, {}], [A.Cruise, { op: "plus" }], [A.EngineBrake, {}], [A.Retarder, {}], [A.AirSuspension, { dir: "raise" }],
	[A.Doors, {}], [A.Doors, { part: "hood" }], [A.Nitrous, {}], [A.Jato, {}], [Tires, { tdir: "inflate" }], [Powertrain, { index: "1" }], [VehicleControl, { slot: 1 }],
	[Gauge, { gauge: "gear" }], [Gauge, { gauge: "speed" }], [Gauge, { gauge: "rpm" }], [Gauge, { gauge: "fuel" }], [Gauge, { gauge: "damage" }],
	...["accept", "back", "pause", "repair", "recover", "respawn", "walk", "map", "vehicles", "radial", "slowmo", "slower", "ui", "photo", "traffic", "trailer",
		"nextveh", "up", "turn_left", "cam_up", "zoom_in", "sprint", "cam_cycle", "cam_free", "cam_center", "cam_orbit", "cam_driver", "look_back",
		"replay_eject", "replay_ctl"].map((fn) => [GameFunction, { fn }]),
	[GameFunction, { fn: "cam_cycle", gamecams: true }], [GameFunction, { fn: "cam_prev" }], [GameFunction, { fn: "cam_prev", gamecams: true }],
	...["clock", "daylen", "time_sunrise", "time_sunset", "time_p1h", "wx_cycle", "wx_rain", "cloud_up", "cloud_down", "fog_up", "fog_down", "fogh_up", "fogh_down", "rain_up", "rain_down", "wind_up", "wind_down", "grav_cycle", "grav_moon"].map((fn) => [World, { fn }]),
];
const status = {
	running: true, ignition: 1, hasTC: true, tc: true, tcMode: { name: "Sport", key: "sport", color: "#ffc300" }, diff: { front: "open", rear: "locked", center: "open" },
	range: "high", drive: "4wd", pbrake: false, lights: 1, fog: 0, hazard: false, sigL: 0, sigR: 0, lightbar: 1, lbm: 1, lbn: "Chase", lbc: 4,
	cruise: { on: true, speed: 22.2 }, ebrake: 0, n2o: { armed: false }, doors: { FL: false }, g: { spd: 22, gear: "4", gi: 4, rpm: 6300, maxrpm: 7000, fuel: 0.6, dmg: 0 }, ign: 2,
};
const ge = { paused: false, ui: false, walking: false, cam: "orbit", replay: "inactive", towing: false, tod: { time: 0.3, play: true, dayLength: 1800 }, cloud: 1.2, fog: 0.08, fogH: 235, wind: 0.4, rain: 0, grav: -9.81, timeScale: 1 };
const fake = { snapshot: {}, backend: "mcp", blocked: () => null, canMenu: () => false, poll: async () => {}, fetchGlyphs: async () => {}, mcpLink: "offline", message: () => {} };
A.start(fake);
const modes = {
	live: { link: "ok", status, ge, vid: 1 },
	notfitted: { link: "ok", status: { running: true }, ge, vid: 1 },
	nogame: { link: "offline" },
	paused: { link: "paused", status, ge: { ...ge, paused: true }, vid: 1 },
	mp: { link: "ok", status, ge, vid: 1, mp: true },
};
const svgs = [];
const cols = 10, K = 120, gap = 8;
for (const [name, snap] of Object.entries(modes)) {
	let out = "";
	KEYS.forEach(([C, st], i) => {
		const impl = new C();
		const e = { action: { id: String(i) }, impl, settings: st, busy: false };
		let url;
		fake.backend = snap.mp ? "addon" : "mcp";
		fake.blocked = snap.mp ? (cmd) => (cmd && i % 3 === 0 ? "blocked" : null) : () => null;
		fake.canMenu = () => i % 2 === 0;
		try { url = render(A.faceFor(e, snap), 0); if (url.startsWith("data:image/svg")) svgs.push([name, i, Buffer.from(url.split(",")[1], "base64").toString()]); } catch (err) { console.log("ERR", C.name, JSON.stringify(st), err.message); return; }
		if (url.startsWith("data:image/svg")) url = "data:image/png;base64," + Buffer.from(new Resvg(Buffer.from(url.split(",")[1], "base64").toString(), { font: { loadSystemFonts: true } }).render().asPng()).toString("base64");
		const x = (i % cols) * (K + gap), y = Math.floor(i / cols) * (K + gap);
		out += `<image x="${x}" y="${y}" width="${K}" height="${K}" href="${url}"/>`;
	});
	const H = Math.ceil(KEYS.length / cols) * (K + gap);
	writeFileSync(`test/build/sheet-${name}.png`, new Resvg(`<svg xmlns="http://www.w3.org/2000/svg" width="${cols * (K + gap)}" height="${H}"><rect width="100%" height="100%" fill="#333"/>${out}</svg>`).render().asPng());
}
writeFileSync("test/build/sheet-svgs.json", JSON.stringify(svgs));
// Stream Deck shows nothing for a malformed SVG: no tag may repeat an attribute, tags must balance
let bad = 0;
for (const [mode, i, svg] of svgs) {
	for (const tag of svg.match(/<[a-z][^>]*>/gi) ?? []) {
		const names = [...tag.matchAll(/\s([a-z:-]+)=/gi)].map((m) => m[1]);
		if (new Set(names).size !== names.length) { bad++; console.log(`FAIL ${mode} #${i}: repeated attribute in ${tag.slice(0, 80)}`); }
	}
	const open = (svg.match(/<(svg|g|text)\b/g) ?? []).length, close = (svg.match(/<\/(svg|g|text)>/g) ?? []).length;
	if (open !== close) { bad++; console.log(`FAIL ${mode} #${i}: unbalanced tags`); }
}
console.log(`sheets written, ${svgs.length} key images, ${bad ? bad + " BAD" : "all well-formed"}`);
process.exit(bad ? 1 : 0);
process.exit(0);
