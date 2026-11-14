import typescript from "@rollup/plugin-typescript";
// Browser test bundle of src/game.ts (see README). Lua is fetched by the page into window.__LUA (from the repo), so the bundle stays small.
export default {
	input: "test/browser-entry.js",
	output: { file: "test/build/browser.js", format: "iife" },
	plugins: [
		{
			name: "inline-lua",
			transform(code, id) {
				if (!id.endsWith("game.ts")) return null;
				return code
					.replace(/^import \{ readFileSync \}.*$/m, "")
					.replace(/^import path .*$/m, "")
					.replace(/^import \{ fileURLToPath \}.*$/m, "")
					.replace(/^const here = .*$/m, "")
					.replace(/^const LUA_DIR = .*$/m, "")
					.replace(/readFileSync\(path\.join\(LUA_DIR, "resolver\.lua"\), "utf8"\)/, "window.__LUA.resolver")
					.replace(/readFileSync\(path\.join\(LUA_DIR, "beamdeck\.lua"\), "utf8"\)/, "window.__LUA.beamdeck");
			},
		},
		typescript({ compilerOptions: { module: "ESNext" } }),
	],
};
