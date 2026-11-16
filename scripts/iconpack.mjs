// Builds the BeamDeckNG icon pack for the Stream Deck Icon Library:
//   dist/com.yahms.beamdeckng.streamDeckIconPack  (double-click to install)
// Contents: the folder / page icons (white and green, plus yes / no) from com.yahms.beamdeckng.sdPlugin/icons
// and the gravity preset icons from profiles/tabs. Run after scripts/icons.mjs and scripts/tabicons.mjs.
// Run: node scripts/iconpack.mjs
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { Resvg } from "@resvg/resvg-js";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const ID = "com.yahms.beamdeckng";
const OUT = path.join(root, "dist");
const PACK = path.join(OUT, `${ID}.sdIconPack`);
const pkg = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8"));

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
			Version: pkg.version,
			Description: "Folder, page and tab icons for BeamNG.drive Stream Deck profiles (BeamDeckNG): white, and green for the active one.",
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
console.log(`${file}: ${list.length} icons`);
