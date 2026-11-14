// Group 1 actions against the fake game (python test/mock_mcp.py 29299).
import { Game } from "./build/bin/game.js";
const g = new Game("127.0.0.1", 29299);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function settle(n = 4) { let s; for (let i = 0; i < n; i++) { s = await g.poll(); await sleep(200); } return s; }
const pick = (s) => { const { pbrake, lights, fog, hazard, sigL, sigR, lightbar, horn, cruise, ebrake, retarder, air, doors, doorsOpen, hood, trunk } = s.status ?? {};
  return JSON.stringify({ pbrake, lights, fog, hazard, sigL, sigR, lightbar, horn, cruise, ebrake, retarder, air, doors, doorsOpen, hood, trunk }); };
let s = await settle(8); console.log(s.link, pick(s));
const steps = [
  ["parking_brake", { state: "off" }], ["lights", { state: "low" }], ["lights", { state: "high" }],
  ["fog", { state: "on" }], ["hazard", { state: "on" }], ["signal", { side: "left" }], ["signal", { side: "right" }], ["signal", { side: "off" }],
  ["lightbar", { state: 1 }], ["lightbar", { state: 2 }],
  ["cruise", { op: "toggle" }], ["cruise", { op: "plus", step: 1.389 }], ["cruise", { op: "toggle" }],
  ["engine_brake", { state: "on", level: 2 }], ["engine_brake", { state: "off" }],
  ["retarder", { state: "auto" }], ["retarder", { percent: 60 }],
  ["body", { part: "doors", which: "all", state: "open" }], ["body", { part: "door", which: "FL", state: "close" }],
  ["body", { part: "hood", state: "open" }], ["body", { part: "trunk", state: "open" }],
];
for (const [a, args] of steps) {
  const r = await g.resolve(a, args);
  console.log(`${a} ${JSON.stringify(args)} -> ${r.status}${r.detail ? " " + r.detail : ""}`);
}
s = await settle(3); console.log("after:", pick(s));
// held buttons: fire-and-forget
await g.fire("horn", { state: 1 }); s = await settle(2); console.log("horn held:", s.status.horn);
await g.fire("horn", { state: 0 }); s = await settle(2); console.log("horn released:", s.status.horn);
await g.fire("air_suspension", { state: "raise" }); await g.fire("air_suspension", { state: "stop" }); await settle(2);
console.log("air log:", await g.mcp.runLua("return 'see vehicle'"));
