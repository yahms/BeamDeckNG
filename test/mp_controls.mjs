// The auto Vehicle control keys through MP-MCP: list, press / release, allowlist, the game's filter.
// Run with: python test/mock_mp.py &
import { Game } from "./build/bin/game.js";
import { Blocked } from "./build/bin/mcp.js";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ctl = async (p = "") => (await fetch("http://127.0.0.1:29393/" + p)).json();
let fails = 0;
const check = (n, ok, x = "") => { console.log(`${ok ? "PASS" : "FAIL"} ${n} ${x}`); if (!ok) fails++; };
const g = new Game("127.0.0.1", 39292, "/mcp", 29392);
for (let i = 0; i < 12 && g.snapshot.link !== "ok"; i++) { await g.poll(); await sleep(250); }
await g.refreshControls(g.snapshot.vid);
const labels = g.controls?.keys.map((k) => k.label) ?? [];
check("controls read through MP-MCP, door left out, JATO not allowed by default", JSON.stringify(labels) === JSON.stringify(["Tilt down", "Tilt up", "Work Lights"]), labels.join(", "));
check("info reports the controls patterns", JSON.stringify(g.addonInfo?.allow?.controls) === JSON.stringify(["*", "!jato*", "!*nitrous*", "!*n2o*"]));
await g.vehicleControl("tiltUp", 1, "down"); await sleep(200);
check("hold: press moves", (await ctl()).veh.upfit_tilt === 1);
await g.vehicleControl("tiltUp", 0, "up"); await sleep(200);
check("hold: release stops", (await ctl()).veh.upfit_tilt === 0);
await g.vehicleControl("worklights", 1, "down"); await sleep(200);
check("tap toggles", (await ctl()).veh.worklights === 1);
let err; try { await g.vehicleControl("jato", 1, "down"); } catch (e) { err = e; }
check("JATO refused by the allowlist", err instanceof Blocked && !err.byGame && (await ctl()).veh.jato !== 1, err?.message);
check("plugin knows that before pressing", g.blocked({ vc: { id: "jato" }, args: {} }) === "blocked" && g.blocked({ vc: { id: "tiltUp" }, args: {} }) === undefined);
await ctl("blockwl");
const before = (await ctl()).events.length;
err = undefined; try { await g.vehicleControl("worklights", 1, "down"); } catch (e) { err = e; }
const ev = (await ctl()).events.slice(before);
check("game's action filter: refused as blocked by the game", err instanceof Blocked && err.byGame, err?.message);
check("  and MP-MCP says so in the game", ev.some((e) => e[0] === "message" && /Work Lights is blocked by the game right now/.test(e[1]) && e[3] === "warning"), JSON.stringify(ev));
err = undefined; try { await g.addon.call("vehicle_control", { id: "x]] os.exit() --", value: 1 }); } catch (e) { err = e; }
check("bad ids rejected", err && /bad 'id'/.test(err.message), err?.message);
err = undefined; try { await g.addon.call("vehicle_control", { id: "tiltUp", value: 5 }); } catch (e) { err = e; }
check("out-of-range value rejected", err && /bad 'value'/.test(err.message));
err = undefined; try { await g.vehicleControl("notEnabled", 1, "down"); } catch (e) { err = e; }
check("controls this config doesn't enable are unknown", err && /unknown control/.test(err.message) && (await ctl()).veh.nope !== 1, err?.message);
// towing: the trailer's controls join the list, marked t = 1, and run in the trailer
await ctl("tow");
g.controls = null;
await g.refreshControls(g.snapshot.vid);
const tk = g.controls?.keys.find((k) => k.t === 1);
check("towing: the trailer's controls are added", tk?.id === "ramp_down", JSON.stringify(g.controls?.keys.map((k) => [k.label, k.t ?? 0])));
await g.vehicleControl("ramp_down", 1, "down", 1); await sleep(200);
check("  and run in the trailer", (await ctl()).trailer.ramp === 1);
await g.vehicleControl("ramp_down", 0, "up", 1); await sleep(200);
check("  release", (await ctl()).trailer.ramp === 0);
console.log(fails ? `${fails} FAILED` : "ALL PASS");
process.exit(fails ? 1 : 0);
