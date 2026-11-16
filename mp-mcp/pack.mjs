// Builds dist/BeamDeckNG-MP-MCP.zip: the BeamDeckNG MP-MCP mod for BeamMP servers, with the plugin's own vehicle Lua inside it.
// Server owners put the zip in their server's Resources/Client folder.
import { readFileSync, readdirSync, statSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import zlib from "node:zlib";

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.join(here, "..");
const gameTs = readFileSync(path.join(repo, "src/game.ts"), "utf8");
const deck = gameTs.match(/export const DECK_VERSION = "([^"]+)"/)[1];
const modVersion = readFileSync(path.join(here, "mod/lua/ge/extensions/beamdeckngMP.lua"), "utf8").match(/local VERSION = "([^"]+)"/)[1];

const files = [];
const walk = (dir, rel = "") => {
	for (const n of readdirSync(dir).sort()) {
		const p = path.join(dir, n), r = rel ? `${rel}/${n}` : n;
		if (statSync(p).isDirectory()) walk(p, r);
		else files.push([r, readFileSync(p)]);
	}
};
walk(path.join(here, "mod"));
const luaDir = path.join(repo, "com.yahms.beamdeckng.sdPlugin/lua");
files.push(["beamdeckng_mp/lua/resolver.lua", readFileSync(path.join(luaDir, "resolver.lua"))]);
files.push(["beamdeckng_mp/lua/beamdeck.lua", Buffer.from(readFileSync(path.join(luaDir, "beamdeck.lua"), "utf8").replace("__DECK_VERSION__", deck))]);

// minimal zip writer (deflate)
const parts = [], central = [];
let offset = 0;
const dosTime = 0x0000, dosDate = 0x5a21; // fixed timestamp so builds are reproducible
for (const [name, data] of files) {
	const nameBuf = Buffer.from(name), comp = zlib.deflateRawSync(data, { level: 9 }), crc = zlib.crc32(data);
	const h = Buffer.alloc(30);
	h.writeUInt32LE(0x04034b50, 0); h.writeUInt16LE(20, 4); h.writeUInt16LE(0, 6); h.writeUInt16LE(8, 8);
	h.writeUInt16LE(dosTime, 10); h.writeUInt16LE(dosDate, 12); h.writeUInt32LE(crc, 14);
	h.writeUInt32LE(comp.length, 18); h.writeUInt32LE(data.length, 22); h.writeUInt16LE(nameBuf.length, 26); h.writeUInt16LE(0, 28);
	parts.push(h, nameBuf, comp);
	const c = Buffer.alloc(46);
	c.writeUInt32LE(0x02014b50, 0); c.writeUInt16LE(20, 4); c.writeUInt16LE(20, 6); c.writeUInt16LE(0, 8); c.writeUInt16LE(8, 10);
	c.writeUInt16LE(dosTime, 12); c.writeUInt16LE(dosDate, 14); c.writeUInt32LE(crc, 16); c.writeUInt32LE(comp.length, 20);
	c.writeUInt32LE(data.length, 24); c.writeUInt16LE(nameBuf.length, 28); c.writeUInt32LE(offset, 42);
	central.push(c, nameBuf);
	offset += 30 + nameBuf.length + comp.length;
}
const cd = Buffer.concat(central);
const end = Buffer.alloc(22);
end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(files.length, 8); end.writeUInt16LE(files.length, 10);
end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(offset, 16);
mkdirSync(path.join(repo, "dist"), { recursive: true });
const out = path.join(repo, "dist", "BeamDeckNG-MP-MCP.zip");
writeFileSync(out, Buffer.concat([...parts, cd, end]));
console.log(`BeamDeckNG MP-MCP ${modVersion} (vehicle library ${deck}): ${files.length} files -> ${path.relative(repo, out)}`);
for (const [n] of files) console.log("  " + n);
