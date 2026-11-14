import { render, C } from "./build/bin/icons.js";
import { writeFileSync } from "node:fs";
const F = (key, state, extra = {}) => ({ key, state, label: key, value: state.toUpperCase(), color: C.off, ...extra });
const faces = [
  ["ign off", F("ignition", "off")], ["ign acc", F("ignition", "acc")], ["ign on", F("ignition", "on")],
  ["cranking", F("ignition", "cranking", { flash: true })], ["crank flash", F("ignition", "cranking", { flash: true }), 1],
  ["running", F("ignition", "running")], ["TC on", F("traction", "on")], ["TC off", F("traction", "off")],
  ["mode sport", F("traction", "mode_sport", { alt: ["on"] })], ["mode other", F("traction", "mode_xyz", { alt: ["on"] })],
  ["F locked", F("diff_front", "locked")], ["F open", F("diff_front", "open")], ["R locked", F("diff_rear", "locked")],
  ["R open", F("diff_rear", "open")], ["R partial", F("diff_rear", "partial")], ["C locked", F("diff_center", "locked")],
  ["C open", F("diff_center", "open")], ["C auto", F("diff_center", "auto")], ["all locked", F("diff_all", "locked")],
  ["all open", F("diff_all", "open")], ["all partial", F("diff_all", "partial")], ["range high", F("range", "high")],
  ["range low", F("range", "low")], ["2wd", F("drive", "2wd")], ["4wd", F("drive", "4wd")],
  ["C n/a (dim)", { ...F("diff_center", "unsupported", { alt: ["open"], dim: true, value: "N/A", color: C.none }) }],
  ["paused", F("range", "low", { dim: true, sub: "PAUSED" })], ["busy flash", F("diff_rear", "open", { flash: true }), 1],
  ["no game", { key: "common", state: "offline", label: "BeamDeckNG", value: "NO GAME", color: C.none }],
];
faces.forEach(([n, f, ph = 0], i) => {
  const url = render(f, ph); const [h, b] = url.split(",");
  writeFileSync(`/tmp/pv/${String(i).padStart(2, "0")}_${n.replace(/\W+/g, "_")}.${h.includes("png") ? "png" : "svg"}`, Buffer.from(b, "base64"));
});
