// Button faces. Each button resolves to a (key, state) pair, e.g. ("diff_rear", "locked").
// If imgs/states/<key>/<state>.png exists it is used; otherwise a placeholder SVG is drawn.
// Flash frames: imgs/states/<key>/<state>_flash.png if present, otherwise a dimmed copy.

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const STATES_DIR = path.join(here, "..", "imgs", "states");

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
	label: string; // top line on the placeholder
	value: string; // big middle text
	sub?: string; // small bottom line (mode name, "PAUSED"...)
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
