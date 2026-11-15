// Builds every icon the plugin ships: the manifest images (action list + default key images), the
// plugin/category icons, and the category icon set for folders and pages (icons/white, icons/green).
//
// Sources: Material Symbols (Apache-2.0, Google) and BeamDeckNG's own drawings below. No game artwork.
// Run: node scripts/icons.mjs
import { Resvg } from "@resvg/resvg-js";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const PLUGIN = path.join(root, "com.yahms.beamdeckng.sdPlugin");
const MS = path.join(root, "node_modules/@material-symbols/svg-400/rounded");

const WHITE = "#FFFFFF";
const GREEN = "#7CB518";
const RED = "#DD1C1A";

// Own drawings, 96x96, drawn in currentColor.
const S = 'fill="none" stroke="currentColor" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"';
const OWN = {
	// axle with a differential in the middle
	diff: `<g ${S}><rect x="6" y="26" width="14" height="44" rx="4"/><rect x="76" y="26" width="14" height="44" rx="4"/><path d="M20 48h18M58 48h18"/><circle cx="48" cy="48" r="11"/></g>`,
	// H / L
	range: `<g ${S}><path d="M14 24v48M38 24v48M14 48h24"/><path d="M60 24v48h24"/></g>`,
	// chassis, four wheels, both axles driven
	awd: `<g ${S}><rect x="10" y="10" width="16" height="24" rx="4"/><rect x="70" y="10" width="16" height="24" rx="4"/><rect x="10" y="62" width="16" height="24" rx="4"/><rect x="70" y="62" width="16" height="24" rx="4"/><path d="M26 22h44M26 74h44M48 22v52"/></g>`,
	// headlamp with beams
	headlight: `<g ${S}><path d="M44 18c-18 0-30 13-30 30s12 30 30 30c6 0 8-14 8-30s-2-30-8-30z"/><path d="M64 26h22M64 42h22M64 58h22M64 74h22"/></g>`,
	// parking brake: circled P with side arcs
	pbrake: `<g ${S}><circle cx="48" cy="48" r="26"/><path d="M14 22a40 40 0 0 0 0 52M82 22a40 40 0 0 1 0 52"/><path d="M41 62V34h9a8 8 0 0 1 0 16h-9"/></g>`,
	// indicators: left and right arrows
	signals: `<g fill="currentColor"><path d="M6 48 36 22v52z"/><path d="M90 48 60 22v52z"/></g>`,
	// hazard triangle
	hazard: `<g ${S}><path d="M48 12 88 80H8z"/><path d="M48 32 70 70H26z" stroke-width="5"/></g>`,
	// roof light bar
	lightbar: `<g ${S}><rect x="8" y="50" width="80" height="18" rx="6"/><path d="M22 50a10 10 0 0 1 20 0M54 50a10 10 0 0 1 20 0"/><path d="M32 28v-8M64 28v-8M14 34l-6-6M82 34l6-6"/></g>`,
	// engine block
	engine: `<g ${S}><path d="M28 30h30v8h10l8 10h8v-8h6v30h-6v-8h-8l-8 12H34l-8-8h-8v10h-6V42h6v10h8V38h2z"/><path d="M36 30v-8h16v8"/></g>`,
};

function msSymbol(name) {
	const svg = readFileSync(path.join(MS, `${name}-fill.svg`), "utf8");
	const inner = svg.replace(/^<svg[^>]*>/, "").replace(/<\/svg>\s*$/, "");
	return { viewBox: "0 -960 960 960", inner: `<g fill="currentColor">${inner}</g>` };
}
const glyph = (src) => (src.startsWith("own:") ? { viewBox: "0 0 96 96", inner: OWN[src.slice(4)] } : msSymbol(src));

function svg(src, { size, color, bg, pad }) {
	const g = glyph(src);
	const inner = size - pad * 2;
	return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" style="color:${color}">
${bg ? `<rect width="${size}" height="${size}" fill="${bg}"/>` : ""}
<svg x="${pad}" y="${pad}" width="${inner}" height="${inner}" viewBox="${g.viewBox}" color="${color}">${g.inner}</svg></svg>`;
}
function png(file, src, opts) {
	mkdirSync(path.dirname(file), { recursive: true });
	const r = new Resvg(svg(src, opts), { fitTo: { mode: "width", value: opts.size } });
	writeFileSync(file, r.render().asPng());
}

// Manifest: action list icon (white on transparent, 20 / 40px) and default key image (144px on black).
const ACTIONS = {
	ignition: "own:engine", traction: "tune", difflock: "own:diff", range: "own:range", drive: "own:awd",
	parkingbrake: "own:pbrake", headlights: "own:headlight", fog: "foggy", hazards: "own:hazard", indicator: "own:signals",
	lightbar: "own:lightbar", horn: "campaign", cruise: "speed", enginebrake: "compress", retarder: "compress",
	airsuspension: "height", doors: "door_front", nitrous: "bolt", jato: "rocket_launch", powertrain: "car_gear", gamefn: "sports_esports", world: "partly_cloudy_day", gauge: "speed", tires: "tire_repair",
};
// Folder / page icons (white, plus green for the active one). yes / no are a green tick and a red cross.
const CATEGORY = {
	vehicle: "directions_car", truck: "local_shipping", trailer: "rv_hookup", engine: "own:engine", powertrain: "own:awd",
	diffs: "own:diff", range: "own:range", drive_modes: "tune", lights: "own:headlight", signals: "own:signals",
	hazards: "own:hazard", doors: "door_front", parking_brake: "own:pbrake", cruise: "speed", boost: "bolt", jato: "rocket_launch",
	hydraulics: "height", camera: "videocam", replay: "replay", time: "schedule", map: "map", game_menu: "menu",
	radial_menu: "apps", garage: "garage", repair: "build", recover: "autorenew", home: "home", on_foot: "directions_walk",
	traffic: "traffic", back: "arrow_back", next: "arrow_forward",
};

const act = path.join(PLUGIN, "imgs/actions");
rmSync(act, { recursive: true, force: true });
for (const [name, src] of Object.entries(ACTIONS)) {
	png(path.join(act, `${name}-icon.png`), src, { size: 20, color: WHITE, pad: 1 });
	png(path.join(act, `${name}-icon@2x.png`), src, { size: 40, color: WHITE, pad: 2 });
	png(path.join(act, `${name}.png`), src, { size: 72, color: WHITE, bg: "#000", pad: 14 });
	png(path.join(act, `${name}@2x.png`), src, { size: 144, color: WHITE, bg: "#000", pad: 28 });
}
const plug = path.join(PLUGIN, "imgs/plugin");
png(path.join(plug, "category-icon.png"), "own:awd", { size: 28, color: WHITE, pad: 2 });
png(path.join(plug, "category-icon@2x.png"), "own:awd", { size: 56, color: WHITE, pad: 4 });
png(path.join(plug, "marketplace.png"), "own:awd", { size: 288, color: GREEN, bg: "#000", pad: 56 });
png(path.join(plug, "marketplace@2x.png"), "own:awd", { size: 576, color: GREEN, bg: "#000", pad: 112 });

const cat = path.join(PLUGIN, "icons");
rmSync(cat, { recursive: true, force: true });
for (const [name, src] of Object.entries(CATEGORY)) {
	png(path.join(cat, "white", `${name}.png`), src, { size: 144, color: WHITE, bg: "#000", pad: 28 });
	png(path.join(cat, "green", `${name}.png`), src, { size: 144, color: GREEN, bg: "#000", pad: 28 });
}
for (const dir of ["white", "green"]) {
	png(path.join(cat, dir, "yes.png"), "check", { size: 144, color: GREEN, bg: "#000", pad: 20 });
	png(path.join(cat, dir, "no.png"), "close", { size: 144, color: RED, bg: "#000", pad: 20 });
}
console.log(`icons: ${Object.keys(ACTIONS).length} actions, ${Object.keys(CATEGORY).length + 2} category`);
