// Where MP-MCP may run. Starts its own mock games, one per case:
//   local copy outside a session: runs ("local");  local copy in a session: never listens;
//   local copy when a session starts: shuts itself down;  server copy in a session: runs ("server").
import { spawn } from "node:child_process";
import { Game } from "./build/bin/game.js";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ctl = async (p = "") => (await fetch(`http://127.0.0.1:29393/${p}`)).json();
let fails = 0;
const check = (n, ok, x = "") => { console.log(`${ok ? "PASS" : "FAIL"} ${n} ${x}`); if (!ok) fails++; };
async function withMock(args, fn) {
  const p = spawn("python3", ["test/mock_mp.py", ...args], { stdio: ["ignore", "pipe", "inherit"] });
  let log = "";
  p.stdout.on("data", (d) => (log += d));
  for (let i = 0; i < 50 && !log.includes("mock BeamMP ready"); i++) await sleep(100);
  try { await fn(() => log); } finally { p.kill(); await sleep(400); }
}
const info = async () => { const g = new Game("127.0.0.1", 39292, "/mcp", 29392); await g.poll(); return g; };

await withMock(["--from", "local"], async () => {
  const g = await info();
  check("local copy, singleplayer: runs", g.backend === "addon" && g.addonInfo?.source === "local", g.addonInfo?.source);
});
await withMock(["--from", "local", "--session"], async (log) => {
  const g = await info();
  check("local copy in a BeamMP session: never listens", g.backend === "native" && !(await ctl()).listening);
  check("  and logs why", /not starting: local copy/.test(log()));
});
await withMock(["--from", "local"], async () => {
  const g = await info();
  check("local copy running before the session", g.backend === "addon");
  await ctl("session");
  await sleep(1600);
  const st = await ctl();
  check("session starts: local copy shuts down and unloads", !st.listening && st.unloaded);
  check("  with an in-game warning", st.events.some((e) => e[0] === "message" && /wasn't sent by the server/.test(e[1]) && e[3] === "warning"));
});
await withMock(["--from", "server", "--session"], async () => {
  const g = await info();
  check("server copy in a session: runs", g.backend === "addon" && g.addonInfo?.source === "server", g.addonInfo?.source);
  const st = await ctl();
  check("  says in game that the Stream Deck connected", st.events.some((e) => e[0] === "message" && /Stream Deck connected to BeamDeckNG MP-MCP/.test(e[1])), JSON.stringify(st.events.find((e) => e[0] === "message")));
});
console.log(fails ? `${fails} FAILED` : "ALL PASS");
process.exit(fails ? 1 : 0);
