// Renders button faces through the real icon code into a contact sheet (needs test/build, see README).
import { render, C } from "./build/bin/icons.js";
import { writeFileSync, mkdirSync } from "node:fs";
const F = (key, state, extra = {}) => ({ key, state, label: key, value: state.toUpperCase(), color: C.off, ...extra });
const D = (scope, state, overlay, extra = {}) => F(`diff_${scope}`, state, { base: "diff", overlay, ...extra });
const faces = [
  ["ign off", F("ignition", "off")], ["running", F("ignition", "running")],
  ["TC on", F("traction", "on")], ["TC off", F("traction", "off")], ["mode sport", F("traction", "mode_sport", { alt: ["on"] })],
  ["F locked", D("front", "locked", "FRONT")], ["F open", D("front", "open", "FRONT")],
  ["R locked", D("rear", "locked", "REAR")], ["R open", D("rear", "open", "REAR")],
  ["C locked", D("center", "locked", "CENTRE")], ["C fulltime", D("center", "lsd", "CENTRE", { alt: ["open"] })],
  ["all F+R", D("all", "partial", "F+R")], ["all locked", D("all", "locked", "F+C+R")], ["all open", D("all", "open", "OPEN")],
  ["R busy 0", D("rear", "open", "REAR", { flash: true })], ["R busy 1", D("rear", "open", "REAR", { flash: true }), 1],
  ["C n/a", D("center", "unsupported", "CENTRE", { alt: ["lsd", "open"], dim: true })],
  ["range high", F("range", "high")], ["range low", F("range", "low")], ["low busy", F("range", "low", { flash: true }), 1],
  ["2wd", F("drive", "2wd")], ["4wd", F("drive", "4wd")], ["paused", F("drive", "4wd", { dim: true })],
];
mkdirSync("/tmp/pv", { recursive: true });
faces.forEach(([n, f, ph = 0], i) => {
  const [h, b] = render(f, ph).split(",");
  writeFileSync(`/tmp/pv/${String(i).padStart(2, "0")}_${n.replace(/\W+/g, "_")}.${h.includes("png") ? "png" : "svg"}`, Buffer.from(b, "base64"));
});
