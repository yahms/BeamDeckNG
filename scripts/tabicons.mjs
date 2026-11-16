// Tab key icons for the example profiles in profiles/. One colour per tab group, so the tab row
// says where you are: the lit tab is the group you're in, its dots say which of the group's pages.
// Run: node scripts/tabicons.mjs   (writes profiles/tabs/*.png and profiles/tabs/preview.png)
import { Resvg } from "@resvg/resvg-js";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const MS = path.join(root, "node_modules/@material-symbols/svg-400/rounded");
const OUT = path.join(root, "profiles/tabs");

// Palette from src/icons.ts
export const GROUPS = {
	game: { color: "#238BE6", glyph: "sports_esports", name: "GAME" },
	car: { color: "#8CD419", glyph: "directions_car", name: "CAR" },
	cam: { color: "#9D4EDD", glyph: "videocam", name: "CAMERA" },
};

const sym = (name) =>
	readFileSync(path.join(MS, `${name}-fill.svg`), "utf8").replace(/^<svg[^>]*>/, "").replace(/<\/svg>\s*$/, "");

function dots(n, cur, color, active) {
	if (n < 2) return "";
	const gap = 18, x0 = 72 - ((n - 1) * gap) / 2;
	let s = "";
	for (let i = 0; i < n; i++) {
		const on = active && i === cur;
		s += `<circle cx="${x0 + i * gap}" cy="98" r="${on ? 6 : 5}" fill="${on ? "#000" : "none"}" stroke="${active ? "#000" : color}" stroke-width="2.5" ${active || on ? "" : 'stroke-opacity="0.7"'}/>`;
	}
	return s;
}

// active: this group's page is showing. label: page name when active, group name otherwise.
export function tabSvg(group, { active, page = 0, pages = 1, label }) {
	const g = GROUPS[group];
	const fg = active ? "#000" : g.color;
	const text = label ?? g.name;
	const fs = text.length > 6 ? 19 : 22;
	return `<svg xmlns="http://www.w3.org/2000/svg" width="144" height="144" viewBox="0 0 144 144">
<rect width="144" height="144" fill="#000"/>
${active ? `<rect x="4" y="4" width="136" height="136" rx="18" fill="${g.color}"/>` : `<rect x="6" y="6" width="132" height="132" rx="16" fill="none" stroke="${g.color}" stroke-width="3" stroke-opacity="0.55"/>`}
<svg x="44" y="${pages > 1 ? 20 : 26}" width="56" height="56" viewBox="0 -960 960 960"><g fill="${fg}" ${active ? "" : 'fill-opacity="0.9"'}>${sym(g.glyph)}</g></svg>
${dots(pages, page, g.color, active)}
<text x="72" y="130" font-family="Arial, Helvetica, sans-serif" font-size="${fs}" font-weight="bold" fill="${fg}" text-anchor="middle">${text}</text>
</svg>`;
}

export function tabPng(group, opts) {
	return new Resvg(tabSvg(group, opts), { fitTo: { mode: "width", value: 144 } }).render().asPng();
}

// The page plans, shared by both profile builders: [group, page name] per page, in order.
export const PAGES15 = [
	["game", "MENU"], ["game", "TOOLS"], ["game", "WEATHER"], ["game", "TIME"],
	["car", "DRIVE"], ["car", "LIGHTS"], ["car", "DASH"], ["car", "POWER"], ["car", "EXTRAS"],
	["cam", "CAMERA"],
];
export const PAGES32 = [
	["game", "GAME"], ["game", "WORLD"],
	["car", "DRIVE"], ["car", "DASH"], ["car", "POWER"],
	["cam", "CAMERA"],
];

// Static key icons (folders and Multi Action keys show these; they have no live face).
const PLANETS = { earth: ["Earth", "#238BE6"], moon: ["Moon", "#BBBBBB"], mars: ["Mars", "#DD1C1A"], zero: ["Zero-G", "#9D4EDD"], jupiter: ["Jupiter", "#FFC300"] };
export function staticSvg(glyph, color, top, bottom, folder = false) {
	return `<svg xmlns="http://www.w3.org/2000/svg" width="144" height="144" viewBox="0 0 144 144">
<rect width="144" height="144" fill="#000"/>
${folder ? `<rect x="6" y="6" width="132" height="132" rx="16" fill="none" stroke="#fff" stroke-width="3" stroke-opacity="0.5" stroke-dasharray="10 6"/>` : ""}
${top ? `<text x="72" y="28" font-family="Arial, Helvetica, sans-serif" font-size="18" font-weight="bold" fill="#fff" fill-opacity="0.8" text-anchor="middle">${top}</text>` : ""}
<svg x="40" y="${top ? 36 : 22}" width="64" height="64" viewBox="0 -960 960 960"><g fill="${color}">${sym(glyph)}</g></svg>
<text x="72" y="128" font-family="Arial, Helvetica, sans-serif" font-size="21" font-weight="bold" fill="#fff" text-anchor="middle">${bottom}</text>
</svg>`;
}
export const STATIC = {
	"gravity-folder": () => staticSvg("public", "#fff", "GRAVITY", "PICK ▸", true),
	...Object.fromEntries(Object.entries(PLANETS).map(([k, [n, c]]) => [`grav-${k}`, () => staticSvg("public", c, "GRAVITY", n.toUpperCase())])),
};

// Icon for group g's tab while page p (index into plan) is showing.
export function tabFor(plan, g, p) {
	const mine = plan.map((x, i) => [x, i]).filter(([x]) => x[0] === g);
	const here = plan[p][0] === g;
	const idx = mine.findIndex(([, i]) => i === p);
	return { active: here, page: here ? idx : 0, pages: mine.length, label: here ? plan[p][1] : undefined };
}

// Where group g's tab goes from page p (1-based page numbers): its next page when you're in the group,
// otherwise its first page. A single-page group (camera) goes back to the first car page on a second tap.
export function tabTarget(plan, g, p) {
	const mine = plan.map((x, i) => [x, i]).filter(([x]) => x[0] === g).map(([, i]) => i);
	if (plan[p][0] !== g) return mine[0] + 1;
	if (mine.length === 1) return plan.findIndex((x) => x[0] === "car") + 1;
	return mine[(mine.indexOf(p) + 1) % mine.length] + 1;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
	mkdirSync(OUT, { recursive: true });
	const cells = [];
	for (const [plan, tag] of [[PAGES15, "15"], [PAGES32, "32"]])
		plan.forEach((_, p) => {
			for (const g of Object.keys(GROUPS)) {
				const o = tabFor(plan, g, p);
				const f = `${tag}-p${p + 1}-${g}.png`;
				writeFileSync(path.join(OUT, f), tabPng(g, o));
				if (tag === "15") cells.push(tabSvg(g, o));
			}
		});
	for (const [k, f] of Object.entries(STATIC)) writeFileSync(path.join(OUT, `${k}.png`), new Resvg(f(), { font: { loadSystemFonts: true } }).render().asPng());
	// preview: one row per 15-key page
	const rows = PAGES15.length;
	const prev = `<svg xmlns="http://www.w3.org/2000/svg" width="${3 * 150}" height="${rows * 150}">${cells
		.map((c, i) => `<g transform="translate(${(i % 3) * 150},${Math.floor(i / 3) * 150})">${c.replace(/^<svg[^>]*>/, "").replace(/<\/svg>$/, "")}</g>`)
		.join("")}</svg>`;
	writeFileSync(path.join(OUT, "preview.png"), new Resvg(prev).render().asPng());
	console.log("wrote", OUT);
}
