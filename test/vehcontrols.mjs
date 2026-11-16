// Auto vehicle-control keys, from real vehicles' control lists (dumped from the game, test/data/).
// Prints a summary, writes test/build/vehicle_controls.csv, and checks the expectations below.
//   node test/compile.mjs && node test/vehcontrols.mjs
import { readFileSync, writeFileSync } from "node:fs";
import { classify } from "./build/bin/vehcontrols.js";
const data = JSON.parse(readFileSync(new URL("./data/vehicle_controls.json", import.meta.url)));
const NAMES = {
  "dumptruck/standard": "Hirochi HT-55 (Standard)", "wl40/arm_bucket": "Hirochi WL-40 (Lift Arm with Bucket)",
  "van/h45_rollback": "Gavril H45 Rollback", "midtruck/6x6_carrier_diesel": "Autobello Stambecco 6x6 (525-V-2)",
  "percheron/s450_8x8_flatbed_A": "Cherrier Percheron 8x8 Flatbed", "fullsuv/high-offroad": "Procyon Centauri X520T (mod)",
  "bastion/police_v8_awd_A": "Bruckell Bastion Police", "us_semi/t83_longhaul": "Gavril T83 Long Haul",
  "bluebuck/lowrider": "Gavril Bluebuck Lowrider", "large_spinner/base": "Large Spinner (Quad)", "large_spinner/mobile": "Large Spinner (Quad Small Mobile, trailer)",
  "tiltdeck/30ft_standard": "Tilt Deck Trailer 30ft", "large_crusher/crusher_T": "Large Crusher", "large_roller/standard": "Large Roller",
  "large_cannon/standard": "Large Cannon", "cannon/cannon": "Old Cannon", "large_hamster_wheel/standard": "Large Hamster Wheel",
  "large_tilt/standard": "Tilt Board", "testroller/single": "Wheel Roller",
};
const q = (s) => `"${String(s ?? "").replace(/"/g, '""')}"`;
const rows = [["vehicle", "model/config", "action", "game title", "verdict", "why", "keys", "key labels", "press", "state shown"].map(q).join(",")];
const summary = [];
const R = {};
for (const [k, list] of Object.entries(data)) {
  const { keys, verdicts } = classify(list);
  R[k] = keys;
  summary.push(`${String(keys.length).padStart(2)} keys  ${NAMES[k] ?? k}: ${keys.map((x) => x.label).join(", ")}`);
  for (const v of verdicts) {
    const ks = keys.filter((x) => x.id === v.id);
    rows.push([NAMES[k] ?? k, k, v.id, v.title, v.verdict, v.why ?? "", v.keys, ks.map((x) => x.label).join(" / "),
      ks.map((x) => (x.kind === "hold" ? `hold (VALUE ${x.value})` : "tap")).join(" / "),
      ks.map((x) => (x.state ? ("electric" in x.state ? `electric ${x.state.electric}` : `coupler ${x.state.coupler}`) : "")).filter(Boolean).join(" / ")].map(q).join(","));
  }
}
writeFileSync(new URL("./build/vehicle_controls.csv", import.meta.url), rows.join("\n") + "\n");
console.log(summary.join("\n"));
let fails = 0;
const check = (n, ok, x = "") => { console.log(`${ok ? "PASS" : "FAIL"} ${n} ${x}`); if (!ok) fails++; };
const labels = (k) => R[k].map((x) => x.label);
check("rollback tray: 6 keys (tilt, extend, feet, each way)", R["van/h45_rollback"].length === 6, labels("van/h45_rollback").join(", "));
check("HT-55 bed axis split into up and down", JSON.stringify(R["dumptruck/standard"].filter((x) => x.id === "PTOAxis").map((x) => [x.label, x.value])) === JSON.stringify([["Tilt Up", 1], ["Tilt Down", -1]]));
check("WL-40 lift / tilt arm split both ways", R["wl40/arm_bucket"].filter((x) => /Arm/.test(x.label)).length === 4, labels("wl40/arm_bucket").join(", "));
check("no diffs / range / lightbar / passenger doors anywhere", Object.values(R).flat().every((x) => !/diff|transfercase|rangebox|lightbar|siren|^door_(?!rear)|sunvisor/i.test(x.id)));
check("Bastion police: nothing left beyond the set buttons", R["bastion/police_v8_awd_A"].length === 0, labels("bastion/police_v8_awd_A").join(", "));
check("T83: fifth wheel, trailer air, idle-up, PTO", ["fifthwheelDecouple", "fifthwheelSliderLock", "fifthwheelTiltLock", "toggleTrailerAirSupply", "toggleManualIdleRaise", "PTOAxis"].every((id) => R["us_semi/t83_longhaul"].some((x) => x.id === id)));
check("crusher: open / close, not the combined axis", JSON.stringify(R["large_crusher/crusher_T"].map((x) => x.id).sort()) === JSON.stringify(["close", "open"]));
check("cannon: combined lift axis dropped", !R["cannon/cannon"].some((x) => x.id === "lift") && !R["large_cannon/standard"].some((x) => x.id === "liftLower"));
check("tilt deck: ramp, jack, toolbox (a tap)", R["tiltdeck/30ft_standard"].length === 5 && R["tiltdeck/30ft_standard"].find((x) => x.id === "toolbox")?.kind === "tap");
check("toggles show their state", R["dumptruck/standard"].find((x) => x.id === "worklights")?.state?.electric === "worklights" && R["tiltdeck/30ft_standard"].find((x) => x.id === "toolbox")?.state?.coupler === "toolboxCoupler");
check("idle raise: toggle + momentary, not enable / disable", R["dumptruck/standard"].filter((x) => /IdleRaise/.test(x.id)).map((x) => x.id).sort().join() === "setMomentaryManualIdleRaise,toggleManualIdleRaise");
check("analog setters dropped", !Object.values(R).flat().some((x) => /hillAssistSet|frontBrakeCutoffSet/.test(x.id)));
console.log(fails ? `${fails} FAILED` : "ALL PASS");
process.exit(fails ? 1 : 0);
