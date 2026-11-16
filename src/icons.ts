// Button faces.
//
// Icons come from the player's own copy of the game, at runtime: the game's UI icon sprite
// (/ui/assets/Sprites/svg-symbols.svg) is read through the MCP server, and only the symbols in use are
// kept. Nothing of the game's artwork ships with the plugin. Each glyph is drawn in a palette colour
// that shows the state (see P).
//
// Optional per-user overrides: imgs/states/<key>/<state>.png (and <state>_flash.png) beat the glyph.
// With no glyph available, a text placeholder is drawn.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { OWN_GLYPHS } from "./ownglyphs";

const here = path.dirname(fileURLToPath(import.meta.url));
const STATES_DIR = path.join(here, "..", "imgs", "states");

/** State palette, taken from the game's own drive-mode colours (green brightened for small keys). */
export const P = {
	white: "#FFFFFF", // neutral / idle
	off: "#999999", // off, inactive (ESC & TC Off)
	green: "#8CD419", // on, engaged (Drift, brightened)
	blue: "#238BE6", // mode, info, selected (Comfort)
	yellow: "#FFC300", // caution, partial, in progress (Sport)
	red: "#DD1C1A", // alert: engine stopped, warning, error (Savage)
	purple: "#9D4EDD", // special (Caged)
	dimmed: "#4a4a4a", // flash frame / not on this vehicle
};

export const C = {
	off: "#3a3f44",
	on: "#2fa84f",
	warn: "#e08a1e",
	alert: "#c0392b",
	acc: "#7a6a32",
	busy: "#2c6fbb",
	none: "#1b1d20",
};

export type Face = {
	key: string; // icon folder, e.g. "diff_rear" (or "common")
	state: string; // file name, e.g. "locked"
	alt?: string[]; // fallback file names if <state>.png is missing
	base?: string; // shared icon folder tried after <key>, e.g. "diff"
	overlay?: string; // text drawn over a PNG icon (which diff, which are locked)
	ring?: { color: string; value?: number }; // game-style coloured ring, value 0..1 = how much of it is drawn
	frame?: string; // coloured border round the whole key (active tab)
	glyph?: string[]; // game icon names (sprite symbol ids), first one available is used
	tint?: string; // glyph colour (a P colour); flash frames use P.dimmed
	/** Drawn gauge / readout instead of an icon: clock, speed, fuel... */
	panel?: { big: string; top?: string; unit?: string; bg?: string; fg?: string; bar?: { value: number; color: string } };
	label: string; // top line on the placeholder
	value: string; // big middle text
	sub?: string; // small bottom line (mode name, "PAUSED"...)
	head?: string; // small line above the glyph, for two-line labels ("GRAVITY" / "EARTH", "UNHITCH" / "TRAILER")
	color: string;
	flash?: boolean;
	dim?: boolean;
};

const pngCache = new Map<string, string | null>();
function png(key: string, state: string): string | null {
	const f = path.join(STATES_DIR, key, `${state}.png`);
	if (!pngCache.has(f)) {
		pngCache.set(f, existsSync(f) ? `data:image/png;base64,${readFileSync(f).toString("base64")}` : null);
	}
	return pngCache.get(f)!;
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + "…" : s);
const svgUrl = (svg: string) => `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;

function placeholder(f: Face, dark: boolean): string {
	const v = f.value.toUpperCase();
	const vs = v.length <= 3 ? 44 : v.length <= 4 ? 40 : v.length <= 5 ? 34 : v.length <= 6 ? 28 : v.length <= 7 ? 24 : 20;
	const bg = dark ? "#000" : f.color;
	const fg = dark ? "#777" : "#fff";
	return `<svg xmlns="http://www.w3.org/2000/svg" width="144" height="144" viewBox="0 0 144 144">
<rect x="0" y="0" width="144" height="144" fill="${bg}"/>
<rect x="5" y="5" width="134" height="134" rx="14" fill="none" stroke="${dark ? f.color : "rgba(255,255,255,0.25)"}" stroke-width="${dark ? 6 : 3}"/>
${f.dim && !dark ? `<rect x="0" y="0" width="144" height="144" fill="#000" fill-opacity="0.55"/>` : ""}
<text x="72" y="34" font-family="Arial, Helvetica, sans-serif" font-size="17" font-weight="bold" fill="${fg}" fill-opacity="0.8" text-anchor="middle">${esc(clip(f.label.toUpperCase(), 13))}</text>
<text x="72" y="${86 + vs / 3}" font-family="Arial, Helvetica, sans-serif" font-size="${vs}" font-weight="bold" fill="${fg}" text-anchor="middle">${esc(clip(v, 10))}</text>
${f.frame ? `<rect x="4" y="4" width="136" height="136" rx="18" fill="none" stroke="${f.frame}" stroke-width="8"/>` : ""}
${f.sub ? `<text x="72" y="126" font-family="Arial, Helvetica, sans-serif" font-size="16" fill="${fg}" fill-opacity="0.85" text-anchor="middle">${esc(clip(f.sub, 15))}</text>` : ""}
</svg>`;
}

type Deco = { overlay?: string; ring?: Face["ring"]; frame?: string };

function decorations(d: Deco): string {
	let out = "";
	if (d.ring) {
		const r = 64;
		const c = 2 * Math.PI * r;
		const v = Math.max(0, Math.min(1, d.ring.value ?? 1));
		out += `<circle cx="72" cy="72" r="${r}" fill="none" stroke="${d.ring.color}" stroke-width="7" stroke-linecap="round" stroke-dasharray="${(c * v).toFixed(1)} ${c.toFixed(1)}" transform="rotate(-90 72 72)"/>`;
	}
	if (d.frame) out += `<rect x="4" y="4" width="136" height="136" rx="18" fill="none" stroke="${d.frame}" stroke-width="8"/>`;
	if (d.overlay)
		out += `<text x="72" y="136" font-family="Arial, Helvetica, sans-serif" font-size="19" font-weight="bold" fill="#fff" stroke="#000" stroke-width="5" paint-order="stroke" stroke-linejoin="round" text-anchor="middle">${esc(clip(d.overlay.toUpperCase(), 12))}</text>`;
	return out;
}

/** Wrap a PNG in an SVG: optional dark overlay (flash/paused/unsupported), ring, frame and a text label. */
function compose(pngUrl: string, dim: number, d: Deco = {}): string {
	if (!dim && !d.overlay && !d.ring && !d.frame) return pngUrl;
	return svgUrl(`<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="144" height="144" viewBox="0 0 144 144">
<image x="0" y="0" width="144" height="144" xlink:href="${pngUrl}" href="${pngUrl}"/>
${dim ? `<rect x="0" y="0" width="144" height="144" fill="#000" fill-opacity="${dim}"/>` : ""}
${decorations(d)}
</svg>`);
}

// ---------------------------------------------------------------- game glyphs

type Glyph = { viewBox: string; inner: string };
const glyphs = new Map<string, Glyph | null>(); // null = not in the game's sprite
const wanted = new Set<string>();
const misses = new Map<string, number>();

// A few icons of our own, for shapes the game only has as an outline (so "on" can be solid) and so
// that these keys have an icon even before the game has sent anything. Drawn in currentColor.
const beams = (slant: boolean) =>
	[0, 1, 2, 3].map((i) => (slant ? `M6 ${18 + i * 14}h22l-10 9H6z` : `M6 ${18 + i * 14}h24v9H6z`)).join("");
const LAMP = "M56 14c-8 10-12 22-12 34s4 24 12 34c18 0 32-15 32-34S74 14 56 14z";
const BUILTIN: Record<string, Glyph> = {
	// headlight, filled: low beam (slanted beams) and high beam (straight beams)
	own_headlight_low: { viewBox: "0 0 96 96", inner: `<path d="${LAMP}"/><path d="${beams(true)}"/>` },
	own_headlight_high: { viewBox: "0 0 96 96", inner: `<path d="${LAMP}"/><path d="${beams(false)}"/>` },
	// headlight, off: the same shape as an outline, with no line through it
	own_headlight_off: {
		viewBox: "0 0 96 96",
		inner: `<g fill="none" stroke="currentColor" stroke-width="6" stroke-linejoin="round"><path d="${LAMP}"/></g><path d="${beams(true)}"/>`,
	},
	...OWN_GLYPHS,
}; // id -> when the game last said it has no such icon

// Icons already read from the game are kept on this PC (cache/glyphs.json in the plugin folder), so keys
// keep their icons while the game isn't running. The cache is the player's own copy; it is never shipped.
const CACHE = path.join(here, "..", "cache", "glyphs.json");
try {
	if (existsSync(CACHE)) for (const [id, g] of Object.entries(JSON.parse(readFileSync(CACHE, "utf8")) as Record<string, Glyph>)) glyphs.set(id, g);
} catch {
	/* unreadable cache: icons are fetched again */
}
for (const [id, g] of Object.entries(BUILTIN)) glyphs.set(id, g);

function saveGlyphs() {
	try {
		mkdirSync(path.dirname(CACHE), { recursive: true });
		writeFileSync(CACHE, JSON.stringify(Object.fromEntries([...glyphs].filter(([id, g]) => g && !BUILTIN[id]))));
	} catch {
		/* read-only folder: no cache */
	}
}

/** Symbol ids the faces asked for that haven't been fetched yet (the game link fetches them). */
export function takeWantedGlyphs(): string[] {
	const out = [...wanted].filter((id) => !glyphs.get(id));
	wanted.clear();
	return out;
}

/** Store raw <symbol> markup from the game (false = no such symbol). */
export function storeGlyphs(found: Record<string, string | false>) {
	for (const [id, sym] of Object.entries(found)) {
		if (!sym) {
			glyphs.set(id, null);
			misses.set(id, Date.now());
			continue;
		}
		const viewBox = sym.match(/viewBox="([^"]+)"/)?.[1] ?? "0 0 32 32";
		let inner = sym.replace(/^<symbol[^>]*>/, "").replace(/<\/symbol>\s*$/, "");
		// two-tone icons (ESC badge, H2 / L4): the white part takes the state colour, the dark part stays
		inner = inner.replace(/(fill|stroke)="(#fff|#ffffff|white)"/gi, '$1="currentColor"').replace(/(fill|stroke):\s*(#fff|#ffffff|white)\b/gi, "$1:currentColor");
		// <style>/<use>/<image> can't be placed inside a key image: treat those symbols as missing
		if (/<(style|use|image)\b/i.test(inner)) {
			glyphs.set(id, null);
			misses.set(id, Date.now());
			continue;
		}
		glyphs.set(id, { viewBox, inner });
	}
	saveGlyphs();
}

export const glyphCount = () => [...glyphs.values()].filter(Boolean).length;

function pickGlyph(ids: string[] | undefined): Glyph | undefined {
	if (!ids) return undefined;
	for (const id of ids) {
		const g = glyphs.get(id);
		if (g) return g;
		// not fetched yet, or the game had no such icon: ask (again, now and then), and try the next one
		if (g === undefined || Date.now() - (misses.get(id) ?? 0) > 60_000) wanted.add(id);
	}
	return undefined;
}

/** Stream Deck's SVG renderer is strict: no nested <svg>, no currentColor, no CSS. The glyph is placed
 *  with a plain transform and every colour is written out as a literal. */
function glyphSvg(f: Face, g: Glyph, dark: boolean): string {
	const tint = dark ? P.dimmed : f.dim ? P.dimmed : f.tint ?? P.white;
	// every button says what it is / what state it's in, so a key is never blank
	let text = (f.overlay ?? f.value ?? "").toUpperCase();
	let head = f.head?.toUpperCase();
	// a status line (OPENS MENU) takes the bottom; what the key shows moves up top
	if (f.sub) {
		head = head ? `${head} ${text}`.trim() : text;
		text = f.sub.toUpperCase();
	}
	const size = head ? 64 : text ? 84 : 100;
	const [vx, vy, vw, vh] = (g.viewBox.trim().split(/[\s,]+/).map(Number) ?? []).map((n) => (Number.isFinite(n) ? n : 0));
	const k = size / Math.max(vw || 24, vh || 24);
	const tx = (144 - (vw || 24) * k) / 2 - vx * k;
	const ty = (head ? 34 : text ? 10 : (144 - size) / 2) + (size - (vh || 24) * k) / 2 - vy * k;
	const inner = g.inner.replace(/currentColor/g, tint);
	const n = (x: number) => Number(x.toFixed(3));
	return `<svg xmlns="http://www.w3.org/2000/svg" width="144" height="144" viewBox="0 0 144 144">
<rect x="0" y="0" width="144" height="144" fill="#000"/>
<g transform="translate(${n(tx)} ${n(ty)}) scale(${n(k)})" fill="${tint}">${inner}</g>
${decorations({ ...f, overlay: undefined })}
${head ? `<text x="72" y="26" font-family="Arial, Helvetica, sans-serif" font-size="${head.length > 9 ? 16 : 19}" font-weight="bold" fill="${f.dim ? P.off : "#fff"}" fill-opacity="0.8" text-anchor="middle">${esc(clip(head, 13))}</text>` : ""}
${text ? `<text x="72" y="130" font-family="Arial, Helvetica, sans-serif" font-size="${text.length > 9 ? 17 : 21}" font-weight="bold" fill="${f.dim ? P.off : "#fff"}" text-anchor="middle">${esc(clip(text, 13))}</text>` : ""}
</svg>`;
}

function panelSvg(f: Face, dark: boolean): string {
	const p = f.panel!;
	const fg = f.dim ? P.dimmed : p.fg ?? "#fff";
	const n = p.big.length;
	const size = n <= 2 ? 72 : n <= 3 ? 62 : n <= 4 ? 50 : n <= 5 ? 42 : n <= 6 ? 34 : n <= 8 ? 27 : 21;
	const bar = p.bar && !f.dim ? Math.max(0, Math.min(1, p.bar.value)) : undefined;
	const cy = p.top ? (bar !== undefined && p.unit ? 66 : p.unit || bar !== undefined ? 72 : 78) : 70;
	return `<svg xmlns="http://www.w3.org/2000/svg" width="144" height="144" viewBox="0 0 144 144">
<rect width="144" height="144" fill="${dark || f.dim ? "#000" : p.bg ?? "#000"}"/>
${p.top ? `<text x="72" y="30" font-family="Arial, Helvetica, sans-serif" font-size="18" font-weight="bold" fill="${fg}" fill-opacity="0.75" text-anchor="middle">${esc(clip(p.top.toUpperCase(), 12))}</text>` : ""}
<text x="72" y="${cy + size * 0.35}" font-family="Arial, Helvetica, sans-serif" font-size="${size}" font-weight="bold" fill="${fg}" text-anchor="middle">${esc(p.big)}</text>
${p.unit ? `<text x="72" y="${bar === undefined ? 126 : 114}" font-family="Arial, Helvetica, sans-serif" font-size="${bar === undefined ? 17 : 15}" font-weight="bold" fill="${fg}" fill-opacity="0.75" text-anchor="middle">${esc(clip(p.unit, 14))}</text>` : ""}
${bar === undefined ? "" : `<rect x="14" y="122" width="116" height="12" rx="6" fill="#fff" fill-opacity="0.18"/><rect x="14" y="122" width="${(116 * bar).toFixed(1)}" height="12" rx="6" fill="${p.bar!.color}"/>`}
${decorations({ ...f, overlay: undefined })}
</svg>`;
}

const BLANK = svgUrl(`<svg xmlns="http://www.w3.org/2000/svg" width="144" height="144"><rect width="144" height="144" fill="#000"/></svg>`);

/** Image for a face; `phase` alternates 0/1 while flashing. */
export function render(f: Face, phase: number): string {
	if (f.key === "common" && f.state === "blank") return BLANK;
	const altFrame = f.flash && phase === 1;
	// Look in imgs/states/<key>/ first, then the shared folder (e.g. "diff"), for state then alt states.
	for (const key of [f.key, ...(f.base ? [f.base] : [])]) {
		for (const st of [f.state, ...(f.alt ?? [])]) {
			const p = png(key, st);
			if (!p) continue;
			if (altFrame) {
				const fl = png(key, `${st}_flash`);
				return fl ? compose(fl, 0, f) : compose(p, 0.65, f);
			}
			// Not on this vehicle: a bit darker than the paused look.
			return compose(p, f.dim ? (f.state === "unsupported" ? 0.68 : 0.55) : 0, f);
		}
	}
	if (f.panel) return svgUrl(panelSvg(f, !!altFrame));
	// no override PNG: the game's own icon, coloured for the state
	const g = pickGlyph(f.glyph);
	if (g) return svgUrl(glyphSvg(f, g, !!altFrame));
	return svgUrl(placeholder(f.state === "unsupported" ? { ...f, dim: false } : f, !!altFrame));
}

/**
 * Nearest named colour for one of the game's hex colours, for picking a coloured icon variant
 * (esc_blue.png, esc_yellow.png...): grey / black for unsaturated colours, otherwise by hue.
 */
export function colorName(hex?: string): string | undefined {
	const m = hex?.replace("#", "").match(/^([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
	if (!m) return undefined;
	const [r, g, b] = [m[1], m[2], m[3]].map((x) => parseInt(x, 16) / 255);
	const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
	if (max < 0.15) return "black";
	if (d / max < 0.2) return "grey";
	let h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
	h = (h * 60 + 360) % 360;
	if (h < 15 || h >= 345) return "red";
	if (h < 40) return "orange";
	if (h < 70) return "yellow";
	if (h < 170) return "green";
	if (h < 260) return "blue";
	return "purple";
}
