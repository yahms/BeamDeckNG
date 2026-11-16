// Compiles src/*.ts into test/build/bin as plain Node ES modules (relative imports get .js), with the
// plugin's Lua next to it, for the tests that import the plugin's own modules.
import { execSync } from "node:child_process";
import { cpSync, readdirSync, readFileSync, writeFileSync, rmSync } from "node:fs";
const out = "test/build/bin";
rmSync("test/build", { recursive: true, force: true });
execSync(`npx tsc -p . --outDir ${out} --noEmit false`, { stdio: "inherit" });
for (const f of readdirSync(out).filter((f) => f.endsWith(".js")))
	writeFileSync(`${out}/${f}`, readFileSync(`${out}/${f}`, "utf8").replace(/from "\.\/([a-z]+)"/g, 'from "./$1.js"'));
cpSync("com.yahms.beamdeckng.sdPlugin/lua", "test/build/lua", { recursive: true });
writeFileSync("test/build/package.json", '{ "type": "module" }');
console.log(`compiled into ${out}`);
