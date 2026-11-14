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
${f.sub ? `<text x="72" y="126" font-family="Arial, Helvetica, sans-serif" font-size="16" fill="${fg}" fill-opacity="0.85" text-anchor="middle">${esc(clip(f.sub, 15))}</text>` : ""}
</svg>`;
}

/** Wrap a PNG in an SVG with a dark overlay, for flash frames and the paused look. */
function dimmed(pngUrl: string, amount: number): string {
	return svgUrl(`<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="144" height="144" viewBox="0 0 144 144">
<image x="0" y="0" width="144" height="144" xlink:href="${pngUrl}" href="${pngUrl}"/>
<rect x="0" y="0" width="144" height="144" fill="#000" fill-opacity="${amount}"/>
</svg>`);
}

/** Image for a face; `phase` alternates 0/1 while flashing. */
export function render(f: Face, phase: number): string {
	const altFrame = f.flash && phase === 1;
	let p: string | null = null;
	let used = f.state;
	for (const st of [f.state, ...(f.alt ?? [])]) {
		p = png(f.key, st);
		if (p) {
			used = st;
			break;
		}
	}
	if (p) {
		if (altFrame) return png(f.key, `${used}_flash`) ?? dimmed(p, 0.65);
		return f.dim ? dimmed(p, 0.5) : p;
	}
	return svgUrl(placeholder(f.state === "unsupported" ? { ...f, dim: false } : f, !!altFrame));
}
