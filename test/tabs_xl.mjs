// XL layouts: (A) 20 slots following the Tab buttons; (B) one Stream Deck page per tab with pinned slots.
import * as A from "./build2/bin/actions.js";
import { Tab, Slot } from "./build2/bin/tabs.js";
import { GameFunction } from "./build2/bin/gamefns.js";

const status = { ign: 2, running: true, hasTC: false, diff: {}, range: "high", drive: "2wd", pbrake: true, lights: 0, fog: 0, hazard: 0,
  sigL: 0, sigR: 0, lightbar: 0, horn: 0, cruise: { on: false, speed: 27.7 }, doors: { FL: false, FR: false }, doorsOpen: 0, hood: false, trunk: false,
  pt: [{ id: "transfercase", name: "Transfercase", icon: "powertrain_transfercase_high-2" }] };
const log = [];
const fake = { snapshot: { link: "ok", vid: 1, status, ge: { cam: "orbit", walking: false } }, poll: async () => fake.snapshot,
  tool: async (n, a) => log.push(`tool ${n} ${JSON.stringify(a)}`), fire: async () => {}, resolve: async (a, x) => { log.push(`resolve ${a} ${JSON.stringify(x)}`); return { status: "applied" }; } };
A.start(fake);
let n = 0;
const key = (s) => { const id = `k${++n}`; return { id, s, action: { id, isKey: () => true, setTitle: async () => {}, setImage: async () => {}, showAlert: async () => {} } }; };
const tab = new Tab(), slot = new Slot(), gfn = new GameFunction();
const appear = (impl, k) => impl.onWillAppear({ action: k.action, payload: { settings: k.s } });
const gone = (impl, k) => impl.onWillDisappear({ action: k.action, payload: { settings: k.s } });
const name = (k) => { const e = A.entries.get(k.id); const s = e.settings; return (s.fn ?? s.side ?? s.scope ?? s.part ?? s.op ?? "") || e.impl.face(status, s).key; };
const tabFace = (k) => { const f = tab.face(status, k.s, false, fake.snapshot.ge); return `${k.s.tab}${f.frame ? "*" : ""}${f.overlay ? "(" + f.overlay + ")" : ""}`; };

// (A) one page: 3 tabs, 20 following slots
const tabs = ["game", "car", "camera"].map((t) => key({ tab: t })); tabs.forEach((k) => appear(tab, k));
const sA = Array.from({ length: 20 }, (_, i) => key({ slot: String(i + 1) })); sA.forEach((k) => appear(slot, k));
A.redraw(true);
console.log("A car:   ", tabs.map(tabFace).join(" "), "\n  ", sA.map(name).join(" | "));
await tab.onKeyDown({ action: tabs[0].action }); A.redraw(true);
console.log("A game:  ", tabs.map(tabFace).join(" "), "\n  ", sA.map(name).join(" | "));
sA.forEach((k) => gone(slot, k)); tabs.forEach((k) => gone(tab, k));

// (B) Stream Deck page "Car": tabs row + 12 slots pinned to car + other plugin keys (not ours, so not in entries)
const tabsB = ["game", "car", "camera"].map((t) => key({ tab: t })); tabsB.forEach((k) => appear(tab, k));
const sB = Array.from({ length: 12 }, (_, i) => key({ slot: String(i + 1), pin: "car" })); sB.forEach((k) => appear(slot, k));
A.redraw(true);
console.log("B car page:", tabsB.map(tabFace).join(" "), "\n  ", sB.map(name).join(" | "));
// press the Car tab on the Car page -> page 2 of car (12 slots: 14 items -> 2 pages)
await tab.onKeyDown({ action: tabsB[1].action }); A.redraw(true);
console.log("B car p2:  ", tabsB.map(tabFace).join(" "), "\n  ", sB.map(name).join(" | "));
// user flips to the Camera page (native page switch): car slots disappear, camera-pinned appear
sB.forEach((k) => gone(slot, k));
const sC = Array.from({ length: 8 }, (_, i) => key({ slot: String(i + 1), pin: "camera" })); sC.forEach((k) => appear(slot, k));
A.redraw(true);
console.log("B cam page:", tabsB.map(tabFace).join(" "), "\n  ", sC.map(name).join(" | "));
// custom game action button
const custom = key({ fn: "custom", action: "toggleRadialMenuSandbox", label: "Sandbox" }); appear(gfn, custom);
const cf = gfn.face(status, custom.s, false, {}); console.log("custom face:", cf.label, "/", cf.value);
await gfn.onKeyDown({ action: custom.action }); await gfn.onKeyUp({ action: custom.action });
console.log(log.join("\n"));
process.exit(0);
