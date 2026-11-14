// Tab/slot logic with fake Stream Deck keys and a D-Series status captured from the game.
import * as A from "./build2/bin/actions.js";
import { Tab, Slot } from "./build2/bin/tabs.js";
import { GameFunction } from "./build2/bin/gamefns.js";

const status = { ign: 2, running: true, hasTC: false, diff: {}, range: "high", drive: "2wd", pbrake: true, lights: 0, fog: 0, hazard: 0,
  sigL: 0, sigR: 0, lightbar: 0, horn: 0, cruise: { on: false, speed: 27.7 }, doors: { FL: false, FR: false }, doorsOpen: 0, hood: false, trunk: false,
  pt: [{ id: "transfercase", name: "Transfercase", icon: "powertrain_transfercase_high-2" }] };
const fake = { snapshot: { link: "ok", vid: 1, status, ge: { paused: false, timeScale: 1, cam: "orbit", walking: false, ui: true } },
  poll: async () => fake.snapshot, tool: async (n, a) => { log.push(`tool ${n} ${JSON.stringify(a)}`); return "ok"; },
  fire: async (a, x) => log.push(`fire ${a} ${JSON.stringify(x)}`), resolve: async (a, x) => { log.push(`resolve ${a} ${JSON.stringify(x)}`); return { status: "applied" }; } };
const log = [];
A.start(fake);

let n = 0;
const key = (kind, settings) => { const id = `${kind}${++n}`; return { id, settings, action: { id, isKey: () => true, setTitle: async () => {}, setImage: async () => {}, showAlert: async () => log.push(`alert ${id}`), showOk: async () => {} } }; };
const appear = (impl, k) => impl.onWillAppear({ action: k.action, payload: { settings: k.settings } });
const tab = new Tab(), slot = new Slot(), gfn = new GameFunction();
const tabs = ["game", "car", "camera"].map((t) => key("tab", { tab: t }));
tabs.forEach((k) => appear(tab, k));
const fixed = ["pause", "repair", "accept", "back"].map((f) => key("fn", { fn: f }));
fixed.forEach((k) => appear(gfn, k));
const slots = [1, 2, 3, 4, 5, 6, 7, 8].map((i) => key("slot", { slot: String(i) }));
slots.reverse().forEach((k) => appear(slot, k)); slots.reverse(); // appear order shouldn't matter

const show = (title) => {
  A.redraw(true);
  const row = slots.map((k) => { const e = A.entries.get(k.id); const s = e.settings; const id = e.impl.constructor.name + (s.fn ? `:${s.fn}` : s.side ? `:${s.side}` : s.scope ? `:${s.scope}` : s.part ? `:${s.part}` : s.op ? `:${s.op}` : ""); return id; });
  console.log(`${title}\n  ${row.join(" | ")}`);
};
const press = async (k) => { const e = A.entries.get(k.id); await e.impl === undefined; await (A.entries.get(k.id).resolve ? slot : tab).onKeyDown({ action: k.action }); };

show("car tab, page 1 (D-Series)");
await tab.onKeyDown({ action: tabs[1].action }); show("car tab again -> page 2");
await tab.onKeyDown({ action: tabs[1].action }); show("car tab again -> back to page 1");
await tab.onKeyDown({ action: tabs[2].action }); show("camera tab");
await tab.onKeyDown({ action: tabs[0].action }); show("game tab");
// press slot 1 on game tab (walk), slot 2 (map)
await slot.onKeyDown({ action: slots[0].action }); await slot.onKeyUp({ action: slots[0].action });
await slot.onKeyDown({ action: slots[1].action }); await slot.onKeyUp({ action: slots[1].action });
// back to car, press slot 2 = the game's transfer case button, slot 1 = ignition
await tab.onKeyDown({ action: tabs[1].action });
await slot.onKeyDown({ action: slots[1].action }); await slot.onKeyUp({ action: slots[1].action });
// fixed pause
await gfn.onKeyDown({ action: fixed[0].action }); await gfn.onKeyUp({ action: fixed[0].action });
// walking -> auto switch to game tab
fake.snapshot.ge.walking = true; show("player walks -> game tab automatically?");
fake.snapshot.ge.walking = false; show("back in the car -> car tab?");
// a car with no game bar but TC (Sunburst-like): own powertrain buttons
fake.snapshot.status = { ...status, pt: [], hasTC: true, tc: true, diff: { center: "auto" }, range: null, drive: null, n2o: { armed: false, override: false, active: false, bottle: 1 } };
show("car without a game bar (own powertrain buttons, nitrous)");
console.log(log.join("\n"));
process.exit(0);
