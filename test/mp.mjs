// Plugin Game class <-> real add-on Lua (in the mock BeamMP game). Native MCP port hangs, as on BeamMP.
import { Game } from "./build/bin/game.js";
import { Blocked } from "./build/bin/mcp.js";
const pos = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const [ADDON, NATIVE] = [Number(pos[0] ?? 29392), Number(pos[1] ?? 39292)];
const MODE = process.argv.includes("--old") ? "old" : "new"; // --old: mock started with --old
const ctl = async (p = "") => (await fetch(`http://127.0.0.1:${ADDON + 1}/${p}`)).json();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let fails = 0;
const check = (n, ok, x = "") => { console.log(`${ok ? "PASS" : "FAIL"} ${n} ${x}`); if (!ok) fails++; };

const g = new Game("127.0.0.1", NATIVE, "/mcp", ADDON);
let t = Date.now();
let s = await g.poll();
check("native hangs, falls back to the add-on", g.backend === "addon", `(${Date.now() - t} ms, link ${s.link})`);
for (let i = 0; i < 12 && s.link !== "ok"; i++) { await sleep(250); s = await g.poll(); }
check("vehicle status through the add-on", s.link === "ok" && s.status?.diff?.rear !== undefined, JSON.stringify(s.status?.diff));
check("game-engine status", s.ge?.cam === "chase" && s.ge?.veh?.name === "Pickup", JSON.stringify(s.ge?.veh));
console.log("  add-on info:", JSON.stringify(g.addonInfo)?.slice(0, 160));

t = Date.now();
let r = await g.resolve("diff_lock", { scope: "rear", state: "locked" });
check("allowed vehicle action runs + verifies", r.status === "applied" || r.status === "already", `${r.status} ${r.detail ?? ""} (${Date.now() - t} ms)`);
for (let i = 0; i < 4; i++) { await sleep(250); s = await g.poll(); }
check("status shows the change", s.status?.diff?.rear === "locked", s.status?.diff?.rear);

if (MODE === "new") {
  r = await g.resolve("n2o", { op: "arm" });
  check("nitrous not on the allowlist -> BLOCKED", r.status === "unsupported" && r.detail === "BLOCKED", JSON.stringify(r));
  check("blocked(): n2o", g.blocked({ action: "n2o", args: {} }) === "blocked");
  check("blocked(): diff_lock allowed", g.blocked({ action: "diff_lock", args: {} }) === undefined);
  check("blocked(): verify always allowed", g.blocked({ action: "verify", args: {} }) === undefined);
  check("blocked(): pause not allowed", g.blocked({ tool: "trigger_action", args: { action: "pause" } }) === "blocked");
  check("blocked(): menu allowed", g.blocked({ tool: "trigger_action", args: { action: "menu_item_select" } }) === undefined);
  check("blocked(): world Lua not in MP", g.blocked({ tool: "run_lua", args: { code: "x" } }) === "unavailable");
  check("blocked(): recover_vehicle tool not in MP", g.blocked({ tool: "recover_vehicle", args: {} }) === "unavailable");
  check("blocked(): replay_eject exists but not allowed", g.blocked({ tool: "run_lua", args: {}, mp: { fn: "replay_eject" } }) === "blocked");
}
// the add-on itself refuses too, even if the plugin didn't check first (old plugin / wrong allowlist)
let err;
try { await g.addon.call("trigger_action", { action: "pause" }); } catch (e) { err = e; }
check("add-on refuses pause itself", err instanceof Blocked, err?.message);
err = undefined;
try { await g.addon.call("beamdeck_call", { action: "jato", args: {} }); } catch (e) { err = e; }
check("add-on refuses jato itself", err instanceof Blocked, err?.message);
err = undefined;
try { await g.addon.call("run_lua", { code: "return 1" }); } catch (e) { err = e; }
check("no run_lua tool", err && /unknown tool/.test(err.message), err?.message);
err = undefined;
try { await g.tool("run_lua", { code: "return 1" }); } catch (e) { err = e; }
check("plugin: raw Lua is NOT IN MP", err instanceof Blocked && err.why === "unavailable");

await g.tool("trigger_action", { action: "menu_item_select" });
await g.tool("trigger_action", { action: "look_back", state: "down" });
await g.tool("run_lua", { code: "ignored" }, { fn: "cam_step", args: { dir: 1, gamecams: false } });
await g.tool("set_camera", { name: "orbit" });
await sleep(100);
let ev = (await ctl()).events.map((e) => e.join(":"));
check("game actions + camera reached the game", ["tap:menu_item_select", "down:look_back", "cam:orbit", "set_camera:orbit"].every((x) => ev.includes(x)), ev.join(" "));

await g.fire("horn", { state: 1 });
await sleep(300);
check("held button (horn) via fire", (await ctl()).veh.horn === 1);
await g.fire("horn", { state: 0 });

// hostile args stay data: a string that would be code if pasted into Lua
r = await g.resolve("lights", { state: '"]] os.exit() --[[', x: { y: [1, 2, { z: "\n\0" }] } });
check("hostile args are data, not code", r.status === "unsupported" || r.status === "failed" || r.status === "applied" || r.status === "already", `${r.status} ${r.detail ?? ""}`);
s = await g.poll();
check("game still alive after hostile args", s.link === "ok");

await g.fetchGlyphs(); // nothing wanted: no-op
// non-blocking + per-frame limit: 40 requests at once all come back
t = Date.now();
const many = await Promise.all(Array.from({ length: 40 }, (_, i) => fetch(`http://127.0.0.1:${ADDON}/mcp`, { method: "POST", body: JSON.stringify({ jsonrpc: "2.0", id: i, method: "ping" }) }).then((x) => x.json())));
const fr = (await ctl()).frames;
check("40 parallel requests all answered (8 per frame)", many.every((m, i) => m.id === i && m.result), `${Date.now() - t} ms`);

// batch + notification + bad JSON, like the game's server
const post = (b) => fetch(`http://127.0.0.1:${ADDON}/mcp`, { method: "POST", body: b });
check("notification -> 202", (await post(JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }))).status === 202);
const bad = await (await post("{nope")).json();
check("parse error -> -32700", bad.error?.code === -32700);
const batch = await (await post(JSON.stringify([{ jsonrpc: "2.0", id: 1, method: "ping" }, { jsonrpc: "2.0", id: 2, method: "nope" }]))).json();
check("batch", batch.length === 2 && batch[1].error?.code === -32601);

// in-game messages, menus, the game's own action filter
let st0 = await ctl();
check("connect message shown once", st0.events.filter((e) => e[0] === "message" && /Stream Deck connected/.test(e[1])).length === 1);
await g.addon.call("show_message", { text: "hello\nworld", icon: "bogus" });
st0 = await ctl();
const hello = st0.events.find((e) => e[0] === "message" && e[1].startsWith("hello"));
check("show_message: control chars stripped, icon checked, own category", hello && hello[1] === "hello world" && hello[2] === "beamdeckng" && hello[3] === "info", JSON.stringify(hello));
const spam = await Promise.all(Array.from({ length: 8 }, (_, i) => g.addon.call("show_message", { text: "spam " + i })));
check("show_message is rate limited", spam.filter((t) => t.startsWith("skipped")).length >= 4, spam.join(" / ").slice(0, 120));
if (MODE === "new") {
  await g.openMenu("weather");
  check("open_menu -> the game's weather page", (await ctl()).events.some((e) => e[0] === "navigate" && e[1] === "pause.environment.weather"));
  err = undefined;
  try { await g.addon.call("open_menu", { page: "pause.anything" }); } catch (e) { err = e; }
  check("open_menu takes page names only, not routes", err && /unknown menu page/.test(err.message));
  check("canMenu", g.canMenu("environment") && !g.canMenu("nope"));
  err = undefined;
  try { await g.addon.call("trigger_action", { action: "photomode" }); } catch (e) { err = e; }
  check("allowed key the game itself blocks is refused", err instanceof Blocked && /blocked by the game/.test(err.message), err?.message);
}

// leaving the server: the add-on stops and unloads, the plugin goes back to the game's own MCP
await ctl("leave");
await sleep(300);
const st = await ctl();
check("leave server -> add-on unloads", st.unloaded && st.events.some((e) => e[0] === "unload"));
t = Date.now();
s = await g.poll();
check("plugin drops back to native after the add-on goes", g.backend === "native" && s.link === "offline", `${s.link} (${Date.now() - t} ms)`);
console.log(fails ? `${fails} FAILED` : "ALL PASS");
process.exit(fails ? 1 : 0);
