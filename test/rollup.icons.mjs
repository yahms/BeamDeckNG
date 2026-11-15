import typescript from "@rollup/plugin-typescript";
// node:* stubs: no PNG overrides in the browser
const stub = { "node:fs": "export const existsSync=()=>false; export const readFileSync=()=>'';", "node:path": "export default { join: (...a) => a.join('/'), dirname: (p) => p };", "node:url": "export const fileURLToPath = (u) => String(u);" };
export default {
	input: "test/icons-entry.js",
	output: { file: "test/build/icons.js", format: "iife" },
	plugins: [{ name: "stub", resolveId: (id) => (stub[id] ? id : null), load: (id) => stub[id] ?? null }, typescript({ compilerOptions: { module: "ESNext" } })],
};
