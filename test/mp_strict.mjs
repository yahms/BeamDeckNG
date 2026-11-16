// Server with its own strict allowlist: python test/mock_mp.py --settings test/mp_strict.json
import { Game } from "./build/bin/game.js";
const g = new Game("127.0.0.1", 39292, "/mcp", 29392);
let fails = 0; const check = (n, ok, x = "") => { console.log(`${ok ? "PASS" : "FAIL"} ${n} ${x}`); if (!ok) fails++; };
await g.poll();
const a = g.addonInfo?.allow;
check("server allowlist read (menus left out -> defaults)", JSON.stringify([a?.vehicle, a?.actions, a?.game]) === JSON.stringify([["lights", "diff_lock"], ["menu_item_select"], []]) && a?.menus?.includes("weather"), JSON.stringify(a));
check("horn blocked by this server", g.blocked({ action: "horn", args: {} }) === "blocked");
check("lights allowed", g.blocked({ action: "lights", args: {} }) === undefined);
check("camera blocked", g.blocked({ tool: "set_camera", args: { name: "orbit" } }) === "blocked");
let e; try { await g.addon.call("set_camera", { name: "orbit" }); } catch (x) { e = x; }
check("add-on enforces it too", !!e && /not allowed/.test(e.message));
process.exit(fails ? 1 : 0);
