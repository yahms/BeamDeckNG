// Real key presses through MP-MCP: allowed keys act directly, blocked ones with a menu page open it,
// the rest say BLOCKED / NOT IN MP; and the "in-game message" setting. Run with: python test/mock_mp.py &
import { Game } from "./build/bin/game.js";
import * as A from "./build/bin/actions.js";
import { GameFunction } from "./build/bin/gamefns.js";
import { World } from "./build/bin/world.js";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ctl = async () => (await fetch("http://127.0.0.1:29393/")).json();
let fails = 0;
const check = (n, ok, x = "") => { console.log(`${ok ? "PASS" : "FAIL"} ${n} ${x}`); if (!ok) fails++; };
const g = new Game("127.0.0.1", 39292, "/mcp", 29392);
for (let i = 0; i < 12 && g.snapshot.link !== "ok"; i++) { await g.poll(); await sleep(250); }
const seen = {};
const keys = {
  noon: [new World(), { fn: "time_noon" }], rain: [new World(), { fn: "wx_rain" }], moon: [new World(), { fn: "grav_moon" }],
  slowmo: [new GameFunction(), { fn: "slowmo" }], traffic: [new GameFunction(), { fn: "traffic" }],
  pause: [new GameFunction(), { fn: "pause" }], recover: [new GameFunction(), { fn: "recover" }],
  rdiff: [new A.DiffLock(), { scope: "rear" }], quiet: [new A.DiffLock(), { scope: "front", msg: false }],
};
for (const [n, [impl, settings]] of Object.entries(keys))
  A.entries.set(n, { action: { id: n, setImage: async (img) => { const t = Buffer.from(img.split(",")[1], "base64").toString(); seen[n] = (t.match(/>([^<>]{1,24})<\/text>/g) || []).map((x) => x.slice(1, -7)).join(" | "); }, showAlert: async () => (seen[n] = "ALERT") }, impl, settings, busy: false });
A.start(g);
await sleep(600);
A.redraw(true);
await sleep(100);
for (const n of Object.keys(keys)) console.log("  " + n.padEnd(8), seen[n]);
check("world keys show live state + OPENS MENU", /OPENS MENU/.test(seen.noon) && /OPENS MENU/.test(seen.rain) && /OPENS MENU/.test(seen.moon));
check("slow motion / traffic: OPENS MENU", /OPENS MENU/.test(seen.slowmo) && /OPENS MENU/.test(seen.traffic));
check("pause (no menu page): BLOCKED", /BLOCKED/.test(seen.pause));
check("recover (raw Lua, no menu page): NOT IN MP", /NOT IN MP/.test(seen.recover));
const press = async (n) => { const [impl] = keys[n]; await impl.onKeyDown({ action: { id: n, showAlert: async () => undefined } }); await sleep(1000); };
const before = (await ctl()).events.length;
await press("noon"); await press("moon"); await press("traffic"); await press("pause"); await press("rdiff"); await press("quiet");
const ev = (await ctl()).events.slice(before);
const nav = ev.filter((e) => e[0] === "navigate").map((e) => e[1]);
const msgs = ev.filter((e) => e[0] === "message").map((e) => e[1]);
console.log("  menus opened:", nav.join(", "));
for (const m of msgs) console.log("  message:", m);
check("noon -> Environment page, moon -> Simulation, traffic -> Traffic", JSON.stringify(nav) === JSON.stringify(["pause.environment", "pause.environment.simulation", "pause.environment.traffic"]));
check("message says the menu was opened", msgs.some((m) => /Noon: opened the Environment menu/.test(m)));
check("blocked press says so", msgs.some((m) => /Pause: not allowed on this server/.test(m)));
check("allowed press acts directly and reports the new state", msgs.some((m) => /^Stream Deck: .*LOCKED/i.test(m)), msgs.find((m) => /diff/i.test(m)));
check("key with the message setting off sends none", msgs.length === 5 && !msgs.some((m) => /Front diff/.test(m)), `${msgs.length} messages`);
console.log(fails ? `${fails} FAILED` : "ALL PASS");
process.exit(fails ? 1 : 0);
