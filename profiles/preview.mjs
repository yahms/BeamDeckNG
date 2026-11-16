// Draws a schematic of each example profile page (real tab icons, labelled function keys).
// Run: node profiles/preview.mjs   -> profiles/preview-15.png, profiles/preview-32.png
import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { PLAN } from "./layouts.mjs";
import { tabSvg } from "../scripts/tabicons.mjs";

const label = (k) => {
	if (k.type === "FOLDER") return `${k.name} folder`;
	const t = k.type.split(".").pop(), s = k.settings;
	const v = s.fn || s.gauge || s.side || s.scope || s.dir || s.part || s.op || s.press || (s.tdir ? `tyres ${s.tdir}` : "");
	return (t === "gamefn" || t === "world" ? v : v ? `${t} ${v}` : t).replace(/_/g, " ");
};
const inner = (svg) => svg.replace(/^<svg[^>]*>/, "").replace(/<\/svg>\s*$/, "");
function sheet(pages, cols, rows, file) {
	const K = 96, gap = 6, pw = cols * (K + gap), ph = rows * (K + gap) + 26;
	let out = "";
	pages.forEach((p, i) => {
		const ox = 10, oy = 10 + i * (ph + 14);
		out += `<text x="${ox}" y="${oy + 16}" font-family="Arial" font-size="16" font-weight="bold" fill="#ddd">${i + 1}. ${p.name}</text>`;
		for (const k of p.keys) {
			const x = ox + k.col * (K + gap), y = oy + 26 + k.row * (K + gap);
			if (k.tab) out += `<g transform="translate(${x},${y}) scale(${K / 144})">${inner(tabSvg(["game", "car", "cam"][k.col], k.tab))}</g>`;
			else {
				const words = label(k).split(" ");
				out += `<rect x="${x}" y="${y}" width="${K}" height="${K}" rx="10" fill="#1c1c1c" stroke="#444"/>` +
					words.map((w, j) => `<text x="${x + K / 2}" y="${y + K / 2 + (j - (words.length - 1) / 2) * 15 + 5}" font-family="Arial" font-size="13" fill="#eee" text-anchor="middle">${w}</text>`).join("");
			}
		}
	});
	const W = 20 + cols * (K + gap), H = 20 + pages.length * (ph + 14);
	const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><rect width="100%" height="100%" fill="#0b0b0b"/>${out}</svg>`;
	writeFileSync(file, new Resvg(svg, { font: { loadSystemFonts: true } }).render().asPng());
}
sheet(PLAN.p15, 5, 3, new URL("./preview-15.png", import.meta.url));
sheet(PLAN.p32, 8, 4, new URL("./preview-32.png", import.meta.url));
