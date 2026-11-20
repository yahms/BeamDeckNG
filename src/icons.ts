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
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { FALLBACK_GLYPHS, OWN_GLYPHS } from "./ownglyphs";

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
	panel?: { big: string; top?: string; unit?: string; bg?: string; fg?: string; bar?: { value: number; color: string }; arc?: { value?: number } };
	label: string; // what the key is (also the in-game message); the top title unless head is set
	value: string; // its current mode: the bottom line (left out when it only repeats the title)
	sub?: string; // small extra line under the mode ("TC ON", "PAUSED", "OPENS MENU"...)
	head?: string; // top title, when it differs from label (e.g. "PATTERN 2/4", "TIME +10 MIN")
	engine?: { gear: string; rpm?: string; shift?: string }; // engine key: gear and RPM drawn over the icon
	/** A reading drawn over the key's icon (faint, behind): gauges that also do something when pressed. */
	readout?: { big: string; small?: string; fg?: string; arc?: { value?: number } };
	/** Keys that send a real keyboard key: the key's name, drawn as a keycap at the bottom. */
	keycap?: string;
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

/** Top title / bottom mode for a key: every key reads the same way, whatever it's showing. */
export function titleOf(f: Face): { top: string; bottom: string; sub?: string } {
	const top = (f.head ?? f.label ?? "").toUpperCase();
	let bottom = (f.overlay ?? f.value ?? "").toUpperCase();
	if (bottom === top || bottom === "") bottom = "";
	return { top, bottom, sub: f.sub?.toUpperCase() };
}
const FONT = 'font-family="Arial, Helvetica, sans-serif" font-weight="bold" text-anchor="middle"';
function topText(top: string, fill: string): string {
	if (!top) return "";
	const size = top.length <= 10 ? 18 : top.length <= 13 ? 15 : 13;
	return `<text x="72" y="24" ${FONT} font-size="${size}" fill="${fill}" fill-opacity="0.85">${esc(clip(top, 17))}</text>`;
}
function bottomText(bottom: string, sub: string | undefined, fill: string): string {
	let out = "";
	if (bottom) {
		const size = bottom.length <= 8 ? 21 : bottom.length <= 11 ? 18 : 15;
		out += `<text x="72" y="${sub ? 114 : 131}" ${FONT} font-size="${sub ? Math.min(size, 18) : size}" fill="${fill}">${esc(clip(bottom, 14))}</text>`;
	}
	if (sub) out += `<text x="72" y="${bottom ? 135 : 131}" ${FONT} font-size="13" fill="${fill}" fill-opacity="0.8">${esc(clip(sub, 18))}</text>`;
	return out;
}

/** A keycap at the bottom of the key: the keyboard key this button sends. */
function keycapSvg(name: string, fill: string): string {
	const w = Math.max(44, name.length * 11 + 22);
	return `<rect x="${72 - w / 2}" y="108" width="${w}" height="28" rx="6" fill="none" stroke="${fill}" stroke-width="2.5"/>
<rect x="${72 - w / 2 + 4}" y="111" width="${w - 8}" height="19" rx="4" fill="${fill}" fill-opacity="0.12"/>
<text x="72" y="127" ${FONT} font-size="16" fill="${fill}">${esc(clip(name, 8))}</text>`;
}

/** No icon at all: title on top, the mode big in the middle. */
function placeholder(f: Face, dark: boolean): string {
	const { top, bottom, sub } = titleOf(f);
	const v = bottom || (f.value ?? "").toUpperCase();
	const vs = v.length <= 3 ? 40 : v.length <= 5 ? 32 : v.length <= 7 ? 24 : v.length <= 10 ? 18 : 15;
	const fg = dark || f.dim ? P.off : "#fff";
	const frame = f.color && f.color !== C.none && f.color !== C.off && !f.dim ? f.color : "rgba(255,255,255,0.18)";
	return `<svg xmlns="http://www.w3.org/2000/svg" width="144" height="144" viewBox="0 0 144 144">
<rect x="0" y="0" width="144" height="144" fill="#000"/>
<rect x="5" y="5" width="134" height="134" rx="14" fill="none" stroke="${frame}" stroke-width="4"/>
${topText(top, fg)}
${v ? `<text x="72" y="${80 + vs / 3}" ${FONT} font-size="${vs}" fill="${fg}">${esc(clip(v, 12))}</text>` : ""}
${sub ? `<text x="72" y="128" ${FONT} font-size="13" fill="${fg}" fill-opacity="0.8">${esc(clip(sub, 18))}</text>` : ""}
${f.frame ? `<rect x="4" y="4" width="136" height="136" rx="18" fill="none" stroke="${f.frame}" stroke-width="8"/>` : ""}
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

// Icons already read from the game are kept on this PC, so keys keep the game's icons while it isn't
// running. The cache lives outside the plugin folder (%APPDATA%\BeamDeckNG) so installing a new plugin
// version doesn't throw it away. It is the player's own copy; it is never shipped. Until the game has
// been seen, keys use BeamDeckNG's own stand-in icons (FALLBACK_GLYPHS).
const CACHE = path.join(process.env.APPDATA || path.join(os.homedir(), ".config"), "BeamDeckNG", "glyphs.json");
const OLD_CACHE = path.join(here, "..", "cache", "glyphs.json");
for (const f of [OLD_CACHE, CACHE]) {
	try {
		if (existsSync(f)) for (const [id, g] of Object.entries(JSON.parse(readFileSync(f, "utf8")) as Record<string, Glyph>)) if (g) glyphs.set(id, g);
	} catch {
		/* unreadable cache: icons are fetched again */
	}
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
	// none of the game's icons to hand: our own stand-in for the first one that has one
	for (const id of ids) {
		const fb = FALLBACK_GLYPHS[id] ?? (id.startsWith("powertrain_esc") ? FALLBACK_GLYPHS.powertrain_esc : undefined);
		if (fb) return fb;
	}
	return undefined;
}

/** Icon pack: just the icon, big, on black, from BeamDeckNG's own drawings only (never the game's). */
export function iconOnlySvg(ids: string[] | undefined, tint: string): string | undefined {
	const g = ids?.map((id) => BUILTIN[id] ?? FALLBACK_GLYPHS[id] ?? (id.startsWith("powertrain_esc") ? FALLBACK_GLYPHS.powertrain_esc : undefined)).find(Boolean);
	if (!g) return undefined;
	const [vx, vy, vw, vh] = (g.viewBox.trim().split(/[\s,]+/).map(Number) ?? []).map((n) => (Number.isFinite(n) ? n : 0));
	const size = 104;
	const k = size / Math.max(vw || 24, vh || 24);
	const n = (x: number) => Number(x.toFixed(3));
	const tx = (144 - (vw || 24) * k) / 2 - vx * k;
	const ty = (144 - (vh || 24) * k) / 2 - vy * k;
	return `<svg xmlns="http://www.w3.org/2000/svg" width="144" height="144" viewBox="0 0 144 144">
<rect x="0" y="0" width="144" height="144" fill="#000"/>
<g transform="translate(${n(tx)} ${n(ty)}) scale(${n(k)})" fill="${tint}">${g.inner.replace(/currentColor/g, tint)}</g>
</svg>`;
}

/** Stream Deck's SVG renderer is strict: no nested <svg>, no currentColor, no CSS. The glyph is placed
 *  with a plain transform and every colour is written out as a literal. */
function glyphSvg(f: Face, g: Glyph, dark: boolean): string {
	const tint = dark ? P.dimmed : f.dim ? P.dimmed : f.tint ?? P.white;
	const fg = f.dim ? P.off : "#fff";
	// every key: what it is on top, its current mode underneath (when that adds anything)
	const { top, bottom, sub } = titleOf(f);
	const y0 = top ? 32 : 8;
	const y1 = f.keycap ? 104 : sub && bottom ? 96 : bottom || sub ? 108 : 136;
	const size = Math.min(y1 - y0, 78);
	const [vx, vy, vw, vh] = (g.viewBox.trim().split(/[\s,]+/).map(Number) ?? []).map((n) => (Number.isFinite(n) ? n : 0));
	const k = size / Math.max(vw || 24, vh || 24);
	const tx = (144 - (vw || 24) * k) / 2 - vx * k;
	const ty = y0 + (y1 - y0 - (vh || 24) * k) / 2 - vy * k;
	let inner = g.inner.replace(/currentColor/g, tint);
	// greyed: the whole icon goes grey, including its fixed-colour parts (the sunrise sun)
	if (f.dim || dark) inner = inner.replace(/(fill|stroke)="#[0-9a-f]{3,6}"/gi, `$1="${tint}"`);
	const n = (x: number) => Number(x.toFixed(3));
	return `<svg xmlns="http://www.w3.org/2000/svg" width="144" height="144" viewBox="0 0 144 144">
<rect x="0" y="0" width="144" height="144" fill="#000"/>
<g transform="translate(${n(tx)} ${n(ty)}) scale(${n(k)})" fill="${tint}">${inner}</g>
${decorations({ ...f, overlay: undefined })}
${topText(top, fg)}
${f.keycap ? keycapSvg(f.keycap, fg) : bottomText(bottom, sub, fg)}
</svg>`;
}

/** Engine key: the engine icon, faint and large, with the gear big over it and the RPM underneath. */
function engineSvg(f: Face, g: Glyph, dark: boolean): string {
	const e = f.engine!;
	const tint = dark ? P.dimmed : f.tint ?? P.green;
	const [vx, vy, vw, vh] = (g.viewBox.trim().split(/[\s,]+/).map(Number) ?? []).map((n) => (Number.isFinite(n) ? n : 0));
	const size = 104;
	const k = size / Math.max(vw || 24, vh || 24);
	const tx = (144 - (vw || 24) * k) / 2 - vx * k;
	const ty = 30 + (100 - (vh || 24) * k) / 2 - vy * k;
	const n = (x: number) => Number(x.toFixed(3));
	const gs = e.gear.length <= 1 ? 60 : e.gear.length <= 2 ? 50 : 34;
	const fg = e.shift && !dark ? e.shift : "#fff";
	return `<svg xmlns="http://www.w3.org/2000/svg" width="144" height="144" viewBox="0 0 144 144">
<rect x="0" y="0" width="144" height="144" fill="#000"/>
<g transform="translate(${n(tx)} ${n(ty)}) scale(${n(k)})" fill="${tint}" opacity="0.38">${g.inner.replace(/currentColor/g, tint)}</g>
${topText((f.head ?? f.label).toUpperCase(), "#fff")}
<text x="72" y="${e.rpm ? 96 : 104}" ${FONT} font-size="${gs}" fill="${fg}">${esc(e.gear || "-")}</text>
${e.rpm ? `<text x="72" y="130" ${FONT} font-size="20" fill="#fff">${esc(e.rpm)}</text>` : ""}
${f.frame ? `<rect x="4" y="4" width="136" height="136" rx="18" fill="none" stroke="${f.frame}" stroke-width="8"/>` : ""}
</svg>`;
}

/** A reading over a faint icon: title on top, the number big, a small line under it, then the mode. */
function readoutSvg(f: Face, g: Glyph | undefined, dark: boolean): string {
	const r = f.readout!;
	const { top, bottom, sub } = titleOf(f);
	const tint = dark ? P.dimmed : f.dim ? P.dimmed : f.tint ?? P.white;
	const fg = dark || f.dim ? P.off : r.fg ?? "#fff";
	const tight = !!(bottom && sub);
	let icon = "";
	if (g) {
		const [vx, vy, vw, vh] = (g.viewBox.trim().split(/[\s,]+/).map(Number) ?? []).map((n) => (Number.isFinite(n) ? n : 0));
		const size = 96;
		const k = size / Math.max(vw || 24, vh || 24);
		const tx = (144 - (vw || 24) * k) / 2 - vx * k;
		const ty = 30 + (92 - (vh || 24) * k) / 2 - vy * k;
		const n = (x: number) => Number(x.toFixed(3));
		let inner = g.inner.replace(/currentColor/g, tint);
		if (dark || f.dim) inner = inner.replace(/(fill|stroke)="#[0-9a-f]{3,6}"/gi, `$1="${tint}"`);
		icon = `<g transform="translate(${n(tx)} ${n(ty)}) scale(${n(k)})" fill="${tint}" opacity="0.4">${inner}</g>`;
	}
	const len = r.big.length;
	// with a rev arc round the edge, the title goes inside the arc and the reading sits a little lower
	const arc = !!r.arc;
	const size = Math.min(len <= 2 ? 56 : len <= 3 ? 48 : len <= 4 ? 40 : len <= 5 ? 33 : 26, arc ? 40 : r.small ? 46 : 56);
	const by = arc ? (r.small ? 86 : 92) : tight ? 72 : r.small ? 78 : bottom || sub ? 86 : 92;
	const sy = arc ? 106 : tight ? 93 : 100;
	const title = arc
		? `<text x="72" y="40" ${FONT} font-size="${top.length > 11 ? 11 : 12}" fill="${dark || f.dim ? P.off : "#fff"}" fill-opacity="0.9">${esc(clip(top, 14))}</text>`
		: topText(top, dark || f.dim ? P.off : "#fff");
	const ui = { ...f, overlay: undefined, value: bottom, sub };
	return `<svg xmlns="http://www.w3.org/2000/svg" width="144" height="144" viewBox="0 0 144 144">
<rect x="0" y="0" width="144" height="144" fill="#000"/>
${icon}
${r.arc ? revArc(r.arc.value, !!f.dim || dark, true) : ""}
${title}
<text x="72" y="${by}" ${FONT} font-size="${size}" fill="${fg}" stroke="#000" stroke-width="4" paint-order="stroke" stroke-linejoin="round">${esc(clip(r.big, 8))}</text>
${r.small ? `<text x="72" y="${sy}" ${FONT} font-size="15" fill="${dark || f.dim ? P.off : "#fff"}" stroke="#000" stroke-width="3" paint-order="stroke">${esc(clip(r.small.toUpperCase(), 16))}</text>` : ""}
${f.keycap ? keycapSvg(f.keycap, dark || f.dim ? P.off : "#fff") : bottomText(ui.value, ui.sub, dark || f.dim ? P.off : "#fff")}
${decorations({ frame: f.frame })}
</svg>`;
}

/** Rev arc zones (share of the rev limit): white, then orange near the redline, red at it and beyond.
 *  The arc runs past the limit (to REV_ARC) so an over-rev (a missed downshift) shows in the red. */
export const REV_ORANGE = 0.85;
export const REV_RED = 0.97;
export const REV_ARC = 1.15;
export const ORANGE = "#FF8A00";
export const revZone = (k?: number) => (k === undefined || k < REV_ORANGE ? "#fff" : k < REV_RED ? ORANGE : P.red);

/** Tacho arc round the key, from bottom left over the top to bottom right: faint zones, lit up to the revs. */
function revArc(value: number | undefined, dim: boolean, thin = false): string {
	// thin: hugging the edge of the key, clear of a title on top
	const cx = 72, cy = thin ? 74 : 76, r = thin ? 66 : 61, sw = thin ? 5 : 10;
	const pt = (t: number) => {
		const a = ((225 - 270 * t) * Math.PI) / 180;
		return `${(cx + r * Math.cos(a)).toFixed(2)} ${(cy - r * Math.sin(a)).toFixed(2)}`;
	};
	const seg = (t0: number, t1: number, color: string, op: number) =>
		t1 - t0 < 0.002 ? "" : `<path d="M ${pt(t0)} A ${r} ${r} 0 ${(t1 - t0) * 270 > 180 ? 1 : 0} 1 ${pt(t1)}" fill="none" stroke="${color}" stroke-width="${sw}" stroke-opacity="${op}"/>`;
	const zones: [number, number, string][] = [[0, REV_ORANGE / REV_ARC, "#fff"], [REV_ORANGE / REV_ARC, REV_RED / REV_ARC, ORANGE], [REV_RED / REV_ARC, 1, P.red]];
	// unlit: faint, the orange / red zones a little stronger so the redline always shows
	let out = zones.map(([a, b, c]) => seg(a, b, dim ? P.off : c, dim ? 0.35 : c === "#fff" ? 0.22 : 0.4)).join("");
	if (value !== undefined && !dim) {
		const v = Math.max(0, Math.min(1, value / REV_ARC));
		out += zones.map(([a, b, c]) => (v > a ? seg(a, Math.min(v, b), c, 1) : "")).join("");
	}
	return out;
}

/** Gauge with a rev arc: title small inside the arc, the reading big in the middle, its unit at the bottom. */
function arcPanelSvg(f: Face, dark: boolean): string {
	const p = { ...f.panel!, top: f.head ?? f.panel!.top ?? f.label };
	const fg = f.dim || dark ? P.off : p.fg ?? "#fff";
	const n = p.big.length;
	const size = n <= 1 ? 62 : n <= 2 ? 54 : n <= 3 ? 46 : n <= 4 ? 38 : 30;
	return `<svg xmlns="http://www.w3.org/2000/svg" width="144" height="144" viewBox="0 0 144 144">
<rect width="144" height="144" fill="#000"/>
${revArc(p.arc!.value, !!f.dim || dark)}
<text x="72" y="44" ${FONT} font-size="${(p.top ?? "").length > 6 ? 12 : 14}" fill="${f.dim ? P.off : "#fff"}" fill-opacity="0.85">${esc(clip((p.top ?? "").toUpperCase(), 10))}</text>
<text x="72" y="${78 + size * 0.36}" ${FONT} font-size="${size}" fill="${fg}">${esc(p.big)}</text>
${p.unit ? `<text x="72" y="136" ${FONT} font-size="15" fill="${f.dim ? P.off : "#fff"}" fill-opacity="0.8">${esc(clip(p.unit.toUpperCase(), 10))}</text>` : ""}
</svg>`;
}

function panelSvg(f: Face, dark: boolean): string {
	if (f.panel?.arc) return arcPanelSvg(f, dark);
	const p = { ...f.panel!, top: f.head ?? f.panel!.top ?? f.label };
	const fg = f.dim ? P.dimmed : p.fg ?? "#fff";
	const n = p.big.length;
	const size = n <= 2 ? 72 : n <= 3 ? 62 : n <= 4 ? 50 : n <= 5 ? 42 : n <= 6 ? 34 : n <= 8 ? 27 : 21;
	const bar = p.bar && !f.dim ? Math.max(0, Math.min(1, p.bar.value)) : undefined;
	const cy = p.top ? (bar !== undefined && p.unit ? 66 : p.unit || bar !== undefined ? 72 : 78) : 70;
	return `<svg xmlns="http://www.w3.org/2000/svg" width="144" height="144" viewBox="0 0 144 144">
<rect width="144" height="144" fill="${dark || f.dim ? "#000" : p.bg ?? "#000"}"/>
${topText((p.top ?? "").toUpperCase(), f.dim ? P.off : "#fff")}
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
	if (f.readout) return svgUrl(readoutSvg(f, pickGlyph(f.glyph), !!altFrame));
	if (f.panel) return svgUrl(panelSvg(f, !!altFrame));
	if (f.engine) {
		const eg = pickGlyph(f.glyph);
		if (eg) return svgUrl(engineSvg(f, eg, !!altFrame));
	}
	// no override PNG: the game's own icon, coloured for the state
	const g = pickGlyph(f.glyph);
	if (g) return svgUrl(glyphSvg(f, g, !!altFrame));
	return svgUrl(placeholder(f, !!altFrame));
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
