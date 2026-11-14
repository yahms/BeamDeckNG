// Diff cycle steps for different vehicle shapes.
import { diffCycle } from "./build2/bin/actions.js";
const show = (s) => s.map((x) => [x.rear && "R", x.front && "F"].filter(Boolean).join("+") + (x.center ? ` c:${x.center}` : "") || "none").join("  >  ");
const cases = {
  "8x8 (front + rear groups, lockable centre)": { diff: { front: "open", rear: "open", center: "open" } },
  "4x4 lockers, no centre": { diff: { front: "open", rear: "open" } },
  "bus (rear only)": { diff: { rear: "open" } },
  "Sunburst (centre modes only)": { diff: { center: "auto" }, centerMode: { key: "auto" }, centerModes: [{ key: "auto", name: "Auto" }, { key: "lock0", name: "Open" }, { key: "lock50", name: "50%" }, { key: "lock100", name: "Locked" }] },
  "rear locker + centre modes": { diff: { rear: "open", center: "auto" }, centerModes: [{ key: "auto" }, { key: "lock50" }, { key: "lock100" }] },
  "centre lock only (device)": { diff: { center: "open" } },
  "no diffs": { diff: {} },
};
for (const [n, s] of Object.entries(cases)) console.log(n.padEnd(44), show(diffCycle(s)));
