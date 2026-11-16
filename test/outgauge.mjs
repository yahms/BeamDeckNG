// Fake BeamNG OutGauge sender -> real OutGauge listener (UDP) -> Game.snapshot -> real button faces.
import dgram from "node:dgram";
import { OutGauge } from "./build/bin/outgauge.js";
import { Game } from "./build/bin/game.js";
import * as A from "./build/bin/actions.js";
import { Gauge } from "./build/bin/gauges.js";

const PORT = 44444;
function pkt({ gear = 3, speed = 20, rpm = 4200, turbo = 0.8, eng = 92, fuel = 0.6, oil = 101, dash = 0b11101100111, show = 0, flags = 16384 | 8192, id = false, car = "beam" } = {}) {
  const b = Buffer.alloc(id ? 96 : 92);
  b.write(car, 4, "latin1"); b.writeUInt16LE(flags, 8); b.writeUInt8(gear, 10);
  [speed, rpm, turbo, eng, fuel, 0, oil].forEach((v, i) => b.writeFloatLE(v, 12 + i * 4));
  b.writeUInt32LE(dash, 40); b.writeUInt32LE(show, 44); b.writeFloatLE(0.5, 48);
  return b;
}
const logs = [];
const og = new OutGauge("127.0.0.1", PORT, (m) => logs.push(m));
og.start();
const game = new Game("127.0.0.1", 29999, "/mcp"); // nothing listens: MCP is "offline"
game.og = og;
const tx = dgram.createSocket("udp4");
const send = (o) => new Promise((r) => tx.send(o instanceof Buffer ? o : pkt(o), PORT, "127.0.0.1", r));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let fails = 0;
const check = (name, ok, extra = "") => { console.log(`${ok ? "PASS" : "FAIL"} ${name} ${extra}`); if (!ok) fails++; };

await sleep(100);
check("offline before any packet", game.snapshot.link === "offline");
await send({ car: "BNG1" }); await send(Buffer.alloc(64)); await sleep(30);
check("ignores non-OutGauge packets", game.snapshot.link === "offline");

const DL = { SHIFT: 1, FULLBEAM: 2, HANDBRAKE: 4, SL: 32, SR: 64 };
await send({ show: DL.HANDBRAKE | DL.FULLBEAM, id: true }); await sleep(30);
let s = game.snapshot;
check("limited once packets arrive (96-byte too)", s.link === "limited", s.link);
check("gauges", s.status.g.gi === 2 && Math.round(s.status.g.rpm) === 4200 && s.status.g.water > 91 && Math.abs(s.status.g.boost - 11.6) < 0.1, JSON.stringify(s.status.g));
check("handbrake + high beam", s.status.pbrake === true && s.status.lights === 2);

// faces through the real button code
const face = (impl, settings = {}) => impl.face(s.status, settings, false, {});
const F = (impl, st) => { const f = face(impl, st); return f.value ?? f.panel?.big; };
console.log("  gear key:", JSON.stringify(face(new Gauge(), { gauge: "gear" }).panel));
check("park brake key ON", F(new A.ParkingBrake()) === "ON");
check("headlights key HIGH", F(new A.Headlights()) === "HIGH");
check("damage gauge has no data", F(new Gauge(), { gauge: "damage" }) === "N/A");

// indicator blink: left lamp on/off at ~1.5 Hz must stay "on"
for (let i = 0; i < 6; i++) { await send({ show: i % 2 ? 0 : DL.SL }); await sleep(330); }
s = game.snapshot;
check("left indicator latched through blink", s.status.sigL === 1 && s.status.sigR === 0 && s.status.hazard === 0, JSON.stringify([s.status.sigL, s.status.sigR, s.status.hazard]));
for (let i = 0; i < 6; i++) { await send({ show: i % 2 ? 0 : DL.SL | DL.SR }); await sleep(330); }
s = game.snapshot;
check("hazards: both lamps together", s.status.hazard === 1 && s.status.sigL === 0 && s.status.sigR === 0);
for (let i = 0; i < 5; i++) { await send({ show: 0 }); await sleep(330); }
s = game.snapshot;
check("signals off after lamps stop", s.status.hazard === 0 && s.status.sigL === 0);
check("low beam unknown -> lights undefined", s.status.lights === undefined);
await send({ show: DL.SHIFT, rpm: 7000 }); await sleep(30); s = game.snapshot;
const gf = new Gauge().face(s.status, { gauge: "rpm" });
check("shift light turns rpm key red + flashing", gf.flash === true, JSON.stringify(gf.panel));
await sleep(1700);
check("stale after 1.5 s without packets -> offline", game.snapshot.link === "offline");
console.log("log:", logs);
og.stop(); tx.close();
// port in use
const a = new OutGauge("127.0.0.1", PORT, (m) => logs.push(m)); a.start(); await sleep(50);
const b = new OutGauge("127.0.0.1", PORT, (m) => logs.push("B " + m)); b.start(); await sleep(100);
check("second listener reports port in use", logs.some((l) => l.startsWith("B OutGauge: cannot listen") && l.includes("EADDRINUSE")), logs.at(-1));
a.stop(); b.stop();
console.log(fails ? `${fails} FAILED` : "ALL PASS");
process.exit(fails ? 1 : 0);
