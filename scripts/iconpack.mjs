// Builds the BeamDeckNG icon pack for the Stream Deck Icon Library:
//   dist/com.yahms.beamdeckng.streamDeckIconPack  (double-click to install)
// Contents: the folder / page icons (white and green, plus yes / no) from com.yahms.beamdeckng.sdPlugin/icons,
// the gravity preset icons and the tab icon sets (1-4 pages) from profiles/tabs, and every key icon the plugin uses, in each of its colours
// (BeamDeckNG's own drawings only: the game's icons are never shipped). Run after scripts/icons.mjs and
// scripts/tabicons.mjs; it compiles the plugin's modules (test/compile.mjs) to read the key icons.
// Run: node scripts/iconpack.mjs
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { execFileSync } from "node:child_process";
import { Resvg } from "@resvg/resvg-js";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const ID = "com.yahms.beamdeckng";
const OUT = path.join(root, "dist");
const PACK = path.join(OUT, `${ID}.sdIconPack`);
const pkg = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8"));
// the plugin's version, plus a fourth number when the pack changes between plugin releases
const ICONPACK_VERSION = pkg.version;

rmSync(PACK, { recursive: true, force: true });
mkdirSync(path.join(PACK, "icons"), { recursive: true });

const title = (s) => s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
const list = [];
const src = path.join(root, "com.yahms.beamdeckng.sdPlugin/icons");
for (const colour of ["white", "green"]) {
	for (const f of readdirSync(path.join(src, colour)).filter((f) => f.endsWith(".png")).sort()) {
		const base = f.replace(/\.png$/, "");
		if (colour === "green" && (base === "yes" || base === "no")) continue; // same in both folders
		const name = base === "yes" || base === "no" ? title(base) : `${title(base)}${colour === "green" ? " (active)" : ""}`;
		const file = base === "yes" || base === "no" ? `${base}.png` : `${base}-${colour}.png`;
		copyFileSync(path.join(src, colour, f), path.join(PACK, "icons", file));
		list.push({ path: file, name, tags: ["beamng", "beamdeckng", base.replace(/_/g, " "), colour === "green" ? "active" : "white"] });
	}
}
const tabs = path.join(root, "profiles/tabs");
for (const f of existsSync(tabs) ? readdirSync(tabs).filter((f) => /^grav-|^gravity-/.test(f)) : []) {
	copyFileSync(path.join(tabs, f), path.join(PACK, "icons", f));
	list.push({ path: f, name: title(f.replace(/\.png$/, "").replace(/-/g, " ")), tags: ["beamng", "beamdeckng", "gravity"] });
}

// ---- key icons: what the plugin's keys show, without the text (for Hotkeys, folders, Multi Actions...)
execFileSync(process.execPath, ["test/compile.mjs"], { cwd: root, stdio: "ignore" });
const bin = (m) => import(pathToFileURL(path.join(root, "test/build/bin", `${m}.js`)).href);
const [{ GLYPHS }, I, A, { GameFunction, GAME_FUNCS }, { World, WORLD_FUNCS }, { Gauge, GAUGES }] = await Promise.all(
	["glyphmap", "icons", "actions", "gamefns", "world", "gauges"].map(bin),
);
const COLOUR = Object.fromEntries(Object.entries(I.P).map(([k, v]) => [String(v).toLowerCase(), k]));
const seen = new Map(); // svg -> entry
const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
let keyIcons = 0;
function addKey(ids, tint, name, tags) {
	const svg = I.iconOnlySvg(ids, tint);
	if (!svg) return;
	const prev = seen.get(svg);
	if (prev) {
		for (const t of tags) if (!prev.tags.includes(t)) prev.tags.push(t);
		return;
	}
	const colour = COLOUR[String(tint).toLowerCase()] ?? "colour";
	let file = `key-${slug(name)}.png`;
	for (let i = 2; list.some((e) => e.path === file); i++) file = `key-${slug(name)}-${i}.png`;
	writeFileSync(path.join(PACK, "icons", file), new Resvg(svg).render().asPng());
	const e = { path: file, name, tags: ["beamng", "beamdeckng", "key", colour, ...tags] };
	seen.set(svg, e);
	list.push(e);
	keyIcons++;
}
const nice = (s) => s.replace(/[_.]/g, " ").replace(/\s+/g, " ").trim().replace(/\b\w/g, (c) => c.toUpperCase());
// the faces the keys draw, for a spread of game states (titles name them: "Hazards - On")
A.start({ snapshot: {}, backend: "mcp", blocked: () => null, canMenu: () => false, poll: async () => {}, fetchGlyphs: async () => {}, mcpLink: "offline", message: () => {} });
const faceIcon = (impl, st, s, ge, extra = [], naming) => {
	let f;
	try {
		f = A.faceFor({ action: { id: "x" }, impl, settings: st, busy: false }, { link: "ok", status: s, ge, vid: 1 });
	} catch {
		return;
	}
	if (!f.glyph || f.dim) return;
	const t = I.titleOf(f);
	const name = naming ? naming(t) : [t.top, t.bottom].filter(Boolean).join(" - ");
	addKey(f.glyph, f.tint ?? I.P.white, nice(name.toLowerCase()), [t.top.toLowerCase(), ...extra]);
};
const car = {
	running: true, ign: 2, hasTC: true, tc: true, diff: { front: "open", rear: "locked", center: "open" }, range: "high", drive: "4wd",
	pbrake: false, lights: 1, fog: 0, hazard: false, sigL: 0, sigR: 0, lightbar: 1, lbm: 1, lbn: "Chase", lbc: 4, g: { spd: 22, gear: "4", gi: 4, rpm: 3000, maxrpm: 7000, fuel: 0.6, dmg: 0 },
};
const world = { tod: { time: 0.3, play: true, dayLength: 1800 }, cloud: 1.2, fog: 0.08, fogH: 235, wind: 0.4, rain: 0, grav: -9.81, timeScale: 1 };
const geStates = [
	{ ...world, cam: "orbit", replay: "inactive" },
	{ ...world, paused: true, ui: false, walking: true, cam: "free", replay: "recording", towing: true, timeScale: 0.25 },
	{ ...world, replay: "playback" },
	{ ...world, replay: "playback", replayPaused: true },
];
for (const fn of Object.keys(GAME_FUNCS)) for (const ge of geStates) for (const held of [false, true]) faceIcon(new GameFunction(), { fn }, {}, ge, held ? ["pressed"] : []);
for (const fn of Object.keys(WORLD_FUNCS)) for (const ge of geStates) faceIcon(new World(), { fn }, {}, ge, [], (t) => `${t.top} - ${fn.replace(/_/g, " ")}`);
for (const gauge of Object.keys(GAUGES)) {
	const f = new Gauge().face({}, { gauge });
	if (f.glyph) addKey(f.glyph, I.P.white, nice(`${GAUGES[gauge].label} gauge`), ["gauge"]);
}
// drive modes in the game's colours, and TC on / off
for (const [key, name, color] of [["comfort", "Comfort", "#1f8fff"], ["sport", "Sport", "#ffc300"], ["drift", "Drift", "#8fd400"], ["off", "ESC & TC Off", "#8a8a8a"]])
	faceIcon(new A.Traction(), {}, { ...car, tcMode: { key, name, color } }, {}, ["traction", "esc"]);
// every icon the glyph table knows, by key and state
for (const [key, row] of Object.entries(GLYPHS))
	for (const [state, e] of Object.entries(row)) addKey(e.g, e.t, nice(`${key} - ${state}`), [key.replace(/_/g, " "), state]);
console.log(`key icons: ${keyIcons}`);

// tab icons for your own profiles (scripts/tabicons.mjs): game / car / camera / world, 1-4 pages (car 5)
const sets = path.join(tabs, "sets");
for (const f of existsSync(sets) ? readdirSync(sets).filter((f) => /^tab-.*\.png$/.test(f)).sort() : []) {
	const m = f.match(/^tab-(\w+)-(\d)pages-(page(\d)|off)\.png$/);
	if (!m) continue;
	const grp = { game: "Game", car: "Car", cam: "Camera", world: "World" }[m[1]] ?? title(m[1]);
	const pages = m[2] === "1" ? "1 page" : `${m[2]} pages`;
	const name = m[3] === "off" ? `${grp} tab - ${pages} (not selected)` : `${grp} tab - ${pages} - page ${m[4]}`;
	copyFileSync(path.join(sets, f), path.join(PACK, "icons", f));
	list.push({ path: f, name, tags: ["beamng", "beamdeckng", "tab", m[1] === "cam" ? "camera" : m[1], pages, m[3] === "off" ? "not selected" : "selected"] });
}

writeFileSync(path.join(PACK, "icons.json"), JSON.stringify(list, null, "\t"));

// pack icon (56px): the plugin's own mark, green on black
const mark = path.join(root, "com.yahms.beamdeckng.sdPlugin/imgs/plugin/marketplace.png");
writeFileSync(
	path.join(PACK, "icon.png"),
	new Resvg(`<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="56" height="56"><image width="56" height="56" href="data:image/png;base64,${readFileSync(mark).toString("base64")}"/></svg>`).render().asPng(),
);
writeFileSync(
	path.join(PACK, "manifest.json"),
	JSON.stringify(
		{
			Name: "BeamDeckNG",
			Version: ICONPACK_VERSION,
			Description: "BeamNG.drive icons for Stream Deck (BeamDeckNG): every key icon the plugin uses, in each colour, plus folder, page and tab icons (game / car / camera / world tabs for 1-4 pages). For Hotkeys, folders and Multi Actions that should match the plugin's keys.",
			Author: "yahms",
			URL: "https://github.com/yahms/BeamDeckNG",
			Icon: "icon.png",
			License: "license.txt",
		},
		null,
		"\t",
	),
);
writeFileSync(
	path.join(PACK, "license.txt"),
	"BeamDeckNG icons. Shapes from Material Symbols by Google, Apache License 2.0 (https://www.apache.org/licenses/LICENSE-2.0).\nFree to use on your own Stream Deck.\n",
);

// .streamDeckIconPack = zip of the .sdIconPack folder
const file = path.join(OUT, `${ID}.streamDeckIconPack`);
rmSync(file, { force: true });
execFileSync("zip", ["-qr", file, `${ID}.sdIconPack`], { cwd: OUT });
// the same icons as plain PNGs, for Set from File
const zip = path.join(OUT, "BeamDeckNG-icons.zip");
rmSync(zip, { force: true });
execFileSync("zip", ["-qr", zip, "icons"], { cwd: PACK });
console.log(`${file}: ${list.length} icons (also ${path.basename(zip)})`);
process.exit(0);
