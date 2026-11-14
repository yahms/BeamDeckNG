import { Game } from "./build/bin/game.js";
const g = new Game("127.0.0.1", 29299);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function settle(n = 6) { let s; for (let i = 0; i < n; i++) { s = await g.poll(); await sleep(250); } return s; }
const show = (s) => console.log(s.link, JSON.stringify(s.status));
let s = await settle(8); show(s);
for (const [a, args] of [
  ["diff_lock", { scope: "rear", state: "locked" }],
  ["diff_lock", { scope: "front", state: "locked" }],
  ["diff_lock", { scope: "center", state: "locked" }],
  ["traction", { state: "off" }],
  ["drive_mode_step", { which: "tc", dir: 1 }],
  ["drive_mode_step", { which: "tc", dir: 1 }],
  ["range", { state: "low" }],
  ["drive", { state: "2wd" }],
  ["engine", { state: "start" }],
]) {
  const t = Date.now();
  const r = await g.resolve(a, args);
  console.log(`\n${a} ${JSON.stringify(args)} -> ${r.status} ${r.detail ?? ""} (${Date.now() - t} ms)`);
  show(await settle(3));
}
// pause physics: status should go "paused"
await g.mcp.call("mock_pause", { on: true });
s = await settle(12); console.log("\nafter pause:", s.link);
await g.mcp.call("mock_pause", { on: false });
s = await settle(3); console.log("after unpause:", s.link);
