// Game-level functions: menus, pause, repair, map, camera, replay... These use the game's own input
// actions (trigger_action, the same names as in the controls menu) or MCP tools, so they work
// without a vehicle too. One button type ("Game function"); the function is picked in its settings.

import { action } from "@elgato/streamdeck";
import { Command, DeckAction, Settings } from "./actions";
import { GeStatus, VehicleStatus } from "./game";
import { C, Face } from "./icons";

type GameFn = {
	label: string;
	key: string; // icon folder under imgs/states
	/** Icon state for the current game state; "off" by default, "on" shows the active (green) icon. */
	state?: (ge: GeStatus) => { state: string; value?: string; overlay?: string; flash?: boolean; glyph?: string[]; tint?: string; head?: string; dim?: boolean };
	/** On foot (walking mode): held as this input action instead (the arrows walk you about). */
	walk?: string;
	/** In the free camera: held as this input action instead (the arrows fly the camera). */
	fly?: string;
	/** Can be sent as this real keyboard key instead (keys.ts); see the key's "input" setting. */
	kbd?: string;
	/** False: uses the game's action unless the key is set to send the real key (Back, Accept). */
	kbdDefault?: boolean;
	/** Tap: trigger_action name (or picked from the game state, e.g. the menu page that's open). */
	act?: string | ((ge: GeStatus) => string);
	/** Hold: trigger_action with down/up. */
	hold?: string;
	/** Anything else: an MCP tool call. */
	tool?: [string, object];
	/** Or game-engine Lua (run_lua), for things the game's actions don't do reliably. */
	lua?: string | ((ge: GeStatus, st: Settings) => string);
	/** On BeamMP, when MP-MCP doesn't allow it: the game menu page to open instead. */
	menu?: string;
	/** BeamDeckNG MP-MCP's named equivalent of the lua (it has no free-form Lua); none = not in MP. */
	mp?: (st: Settings) => { fn: string; args?: object };
};

// Slow motion: toggle between normal speed and the last slow speed used (default 1/4).
let lastSlow = 0.25;

const slowName = (ts?: number) => {
	if (!ts || ts <= 0 || ts >= 0.999) return undefined; // 0 = paused, not slow motion
	const inv = Math.round(1 / ts);
	return inv > 1 ? `1/${inv}x` : `${ts.toFixed(2)}x`;
};


// --- cameras -------------------------------------------------------------------------------------
// The game's own camera key only cycles the cameras left enabled in its camera settings (often just
// two). These step through every camera the vehicle has, unless "gamecams" asks for the game's list.
const CAM_ORDER = ["occupant.FL", "onboard.hood", "chase", "orbit", "external", "topDown", "droneChase"];
const CAM_NAMES: Record<string, string> = {
	"occupant.FL": "DRIVER", "occupant.FR": "PASSENGER", "onboard.hood": "HOOD", chase: "CHASE", orbit: "ORBIT",
	external: "EXTERNAL", topDown: "TOP", droneChase: "DRONE", relative: "RELATIVE", free: "FREE", unicycle: "WALKING",
};
/** Friendly name for a camera, e.g. occupant.RL -> SEAT RL, onboard.roof -> ROOF. */
function camName(cam?: string): string {
	if (!cam) return "CAMERA";
	if (CAM_NAMES[cam]) return CAM_NAMES[cam];
	if (cam.startsWith("occupant.")) return `SEAT ${cam.slice(9).toUpperCase()}`;
	if (cam.startsWith("onboard.")) return cam.slice(8).toUpperCase();
	return cam.toUpperCase();
}
function camStep(dir: number, st: Settings): string {
	if (st.gamecams) return `core_camera.setVehicleCameraByIndexOffset(0, ${dir}) return 'ok'`;
	return `local id = be:getPlayerVehicleID(0)
if id < 0 then return 'no vehicle' end
local d = core_camera.getCameraDataById(id) or {}
local list, seen = {}, {}
for _, n in ipairs({ ${CAM_ORDER.map((n) => `"${n}"`).join(", ")} }) do if d[n] then list[#list + 1] = n seen[n] = true end end
local extra = {}
for n in pairs(d) do if not seen[n] and (n:find("^onboard%.") or n:find("^occupant%.")) then extra[#extra + 1] = n end end
table.sort(extra)
for _, n in ipairs(extra) do list[#list + 1] = n end
if #list == 0 then return 'no cameras' end
local cur = core_camera.getActiveCamName()
local i = 0
for k, n in ipairs(list) do if n == cur then i = k break end end
local nxt = list[((i - 1 + (${dir}) + #list) % #list) + 1]
-- leaving the free camera needs the global camera cleared first
if core_camera.isWorldCamera() then core_camera.setGlobalCameraByName(nil) end
core_camera.setVehicleCameraByNameWithId(id, nxt)
return nxt`;
}

/** Arrows: blue while on foot (they walk you), white in menus. */
const walkState = (g: GeStatus) => (g.cam === "free" ? { state: "walk", value: "FLY" } : g.walking ? { state: "walk", value: "WALK" } : { state: "off", value: "" });
/** Arrow keys held down as walking actions: fn id -> the action to release. */
const walkHeld = new Map<string, string>();

export const GAME_FUNCS: Record<string, GameFn> = {
	// fixed buttons
	accept: { label: "Accept", key: "accept", act: "menu_item_select", kbd: "enter", kbdDefault: false },
	// in the game (no menu open) Back opens the pause menu, like Escape; in a menu it goes back
	back: { label: "Back", key: "back", act: (g) => (g.route === "play" ? "toggleMenues" : "menu_item_back"), kbd: "escape", kbdDefault: false },
	pause: { label: "Pause", key: "pause", act: "pause", state: (g) => (g.paused ? { state: "on", value: "PAUSED" } : { state: "off", value: "RUNNING" }) },
	// Insert, held: the game's recover (rewinds while held, so it can be timed)
	repair: { label: "Repair", key: "repair", act: "recover_vehicle_alt", kbd: "insert" },
	recover: { label: "Recover", key: "recover", tool: ["recover_vehicle", {}] },
	respawn: { label: "Respawn", key: "home", act: "loadHome" },
	// game tab
	// gameplay_walk isn't always loaded (e.g. after a level load through MCP), so load it first
	walk: { label: "Get in / out", key: "walk", mp: () => ({ fn: "walk" }), lua: "if not gameplay_walk then extensions.load('gameplay_walk') end gameplay_walk.toggleWalkingMode() return 'ok'", state: (g) => (g.walking ? { state: "on", value: "GET IN" } : { state: "off", value: "GET OUT" }) },
	map: { label: "Map", key: "map", act: "toggleBigMap" },
	// a second press (vehicle list open) closes it and returns to the game
	vehicles: {
		label: "Vehicles",
		key: "vehicles",
		act: (g) => (g.route?.startsWith("pause.vehicleSelector") ? "toggleMenues" : "vehicle_selector"),
		menu: "vehicle_selector",
	},
	radial: { label: "Radial menu", key: "radial", act: "toggleRadialMenuMulti" },
	slowmo: {
		label: "Slow motion",
		key: "slowmo",
		menu: "simulation",
		lua: (g) => {
			const ts = g.timeScale ?? 1;
			if (ts > 0 && ts < 0.999) lastSlow = ts;
			return `simTimeAuthority.set(${ts > 0 && ts < 0.999 ? 1 : lastSlow}) return 'ok'`;
		},
		state: (g) => {
			const n = slowName(g.timeScale);
			return n ? { state: "on", value: n, overlay: n } : { state: "off", value: "1x" };
		},
	},
	slower: { label: "Slower", key: "slower", act: "slower_motion", menu: "simulation", state: (g) => ({ state: "off", overlay: slowName(g.timeScale) }) },
	faster: { label: "Faster", key: "faster", act: "faster_motion", menu: "simulation", state: (g) => ({ state: "off", overlay: slowName(g.timeScale) }) },
	ui: { label: "Game UI", key: "ui", tool: ["toggle_ui", {}], state: (g) => (g.ui === false ? { state: "off", value: "UI OFF" } : { state: "on", value: "UI ON" }) },
	photo: { label: "Photo mode", key: "photo", act: "photomode" },
	traffic: { label: "Traffic", key: "traffic", act: "toggleTraffic", menu: "traffic" },
	// says what a press will do: hitch when nothing's coupled, unhitch when towing
	trailer: { label: "Trailer", key: "trailer", act: "couplersToggle", state: (g) => (g.towing ? { state: "on", value: "UNHITCH" } : { state: "off", value: "HITCH" }) },
	// shows the car you're in, in its own paint colour
	nextveh: {
		label: "Next vehicle",
		key: "nextveh",
		act: "switch_next_vehicle",
		state: (g) => ({ state: "off", value: g.veh?.name ?? "NEXT CAR", glyph: ["own_nextveh"], tint: paint(g.veh?.color) }),
	},
	// menu arrows; on foot they walk (held), like the keyboard's arrow keys
	up: { label: "Up", key: "up", kbd: "up", act: "menu_item_up", walk: "unicycle__walkUp", fly: "moveforward", state: walkState },
	down: { label: "Down", key: "down", kbd: "down", act: "menu_item_down", walk: "unicycle__walkDown", fly: "movebackward", state: walkState },
	left: { label: "Left", key: "left", kbd: "left", act: "menu_item_left", walk: "unicycle__walkLeft", fly: "moveleft", state: walkState },
	right: { label: "Right", key: "right", kbd: "right", act: "menu_item_right", walk: "unicycle__walkRight", fly: "moveright", state: walkState },
	// on foot: turn the camera (and so where you walk), and run
	turn_left: { label: "Turn camera left", key: "turn_left", hold: "rotate_camera_left", state: () => ({ state: "off", value: "LEFT" }) },
	turn_right: { label: "Turn camera right", key: "turn_right", hold: "rotate_camera_right", state: () => ({ state: "off", value: "RIGHT" }) },
	// camera (or seat) height and zoom, as Page Up / Down and Shift + Page Up / Down do
	cam_up: { label: "Camera / seat up", key: "cam_up", hold: "moveup", state: () => ({ state: "off", value: "UP" }) },
	cam_down: { label: "Camera / seat down", key: "cam_down", hold: "movedown", state: () => ({ state: "off", value: "DOWN" }) },
	zoom_in: { label: "Zoom in (FOV -)", key: "zoom_in", hold: "increase_zoom", state: () => ({ state: "off", value: "IN" }) },
	zoom_out: { label: "Zoom out (FOV +)", key: "zoom_out", hold: "decrease_zoom", state: () => ({ state: "off", value: "OUT" }) },
	sprint: { label: "Sprint (shift)", key: "sprint", hold: "unicycle__sprintHold", state: (g) => ({ state: "off", value: "", dim: !g.walking }) },
	// camera tab
	cam_cycle: { label: "Next camera", key: "cam_cycle", mp: (st) => ({ fn: "cam_step", args: { dir: 1, gamecams: !!st.gamecams } }), lua: (_g, st) => camStep(1, st), state: (g) => ({ state: "off", value: camName(g.cam) }) },
	cam_prev: { label: "Previous camera", key: "cam_prev", mp: (st) => ({ fn: "cam_step", args: { dir: -1, gamecams: !!st.gamecams } }), lua: (_g, st) => camStep(-1, st), state: (g) => ({ state: "off", value: camName(g.cam) }) },
	cam_free: {
		label: "Free camera",
		key: "cam_free",
		act: "toggleCamera",
		state: (g) => (g.cam === "free" ? { state: "on", value: "FREE" } : { state: "off", value: "CAR" }),
	},
	cam_center: { label: "Centre cam", key: "cam_center", act: "center_camera" },
	cam_orbit: { label: "Orbit", key: "cam_orbit", tool: ["set_camera", { name: "orbit" }], state: (g) => camState(g, "orbit") },
	// the driver camera has a per-vehicle name (e.g. occupant.FL)
	cam_driver: {
		label: "Driver",
		key: "cam_driver",
		mp: () => ({ fn: "cam_driver" }),
		lua: "local id = be:getPlayerVehicleID(0) core_camera.setVehicleCameraByNameWithId(id, core_camera.getDriverCameraNameById(id)) return 'ok'",
		state: (g) => (g.cam && (g.cam.startsWith("occupant") || g.cam === "driver") ? { state: "on", value: "DRIVER" } : { state: "off", value: "DRIVER" }),
	},
	cam_chase: { label: "Chase", key: "cam_chase", tool: ["set_camera", { name: "chase" }], state: (g) => camState(g, "chase") },
	cam_external: { label: "External", key: "cam_external", tool: ["set_camera", { name: "external" }], state: (g) => camState(g, "external") },
	cam_top: { label: "Top", key: "cam_top", tool: ["set_camera", { name: "top" }], state: (g) => camState(g, "top") },
	look_back: { label: "Look back", key: "look_back", hold: "look_back" },
	replay: {
		label: "Replay",
		key: "replay",
		act: "toggleReplayRecording",
		state: (g) =>
			g.replay === "recording"
				? { state: "on", value: "RECORDING", flash: true }
				: { state: "off", value: g.replay === "inactive" || !g.replay ? "NOT RECORDING" : g.replay.toUpperCase() },
	},
	// stopping the recording leaves the game in replay mode: this drops out of it
	replay_eject: {
		label: "Eject replay",
		key: "replay_eject",
		mp: () => ({ fn: "replay_eject" }),
		lua: "if core_replay.stopAndUnload then core_replay.stopAndUnload() else core_replay.stop() end return 'ok'",
		// grey with nothing loaded
		state: (g) => (!g.replay || g.replay === "inactive" ? { state: "off", value: "NONE", dim: true } : { state: "on", value: "" }),
	},
	// one key for the whole cycle: record, stop recording (the game then loads it, paused), play is
	// stopped if it's playing, and a stopped replay is ejected
	replay_ctl: {
		label: "Replay (record / stop / eject)",
		key: "replay_ctl",
		mp: () => ({ fn: "replay_ctl" }),
		lua: `local s = core_replay.getState()
if s == 'recording' then core_replay.toggleRecording() return 'stopped recording' end
if s == 'playback' then
  if core_replay.isPaused() then core_replay.stopAndUnload() return 'ejected' end
  core_replay.togglePlay() return 'stopped playing'
end
core_replay.toggleRecording() return 'recording'`,
		state: (g) =>
			g.replay === "recording"
				? { state: "recording", value: "STOP REC", flash: true }
				: g.replay === "playback"
					? g.replayPaused
						? { state: "loaded", value: "EJECT REPLAY" }
						: { state: "playing", value: "STOP PLAY" }
					: { state: "record", value: "RECORD" },
	},
	reload_lua: { label: "Reload Lua", key: "reload_lua", tool: ["reload_lua", {}], state: () => ({ state: "off", value: "RELOAD LUA" }) },
};

/** The car's paint colour ("r, g, b, a", 0..1) as a hex a key can be drawn in: dark paint is lifted
 *  so it still reads on a black key, and a near-white car just stays white. */
function paint(c?: string): string | undefined {
	const p = (c ?? "").split(",").map((n) => parseFloat(n.trim()));
	if (p.length < 3 || p.some((n) => !Number.isFinite(n))) return undefined;
	let [r, g, b] = p;
	const max = Math.max(r, g, b);
	if (max < 0.55) {
		const k = max < 0.04 ? 0 : 0.55 / max; // true black: fall back to white
		[r, g, b] = k ? [r * k, g * k, b * k] : [1, 1, 1];
	}
	return `#${[r, g, b].map((n) => Math.round(Math.min(1, Math.max(0, n)) * 255).toString(16).padStart(2, "0")).join("")}`;
}

function camState(g: GeStatus, name: string) {
	return g.cam === name ? { state: "on", value: name.toUpperCase() } : { state: "off", value: name.toUpperCase() };
}

/** The "Game function" button: one action type, the function is picked in its settings. */
@action({ UUID: "com.yahms.beamdeckng.gamefn" })
export class GameFunction extends DeckAction {
	override vehicle = false;

	static fn(st: Settings): [string, GameFn] {
		if (st.fn === "custom") {
			// any of the game's input actions, by name (Options > Controls; e.g. toggleRadialMenuSandbox)
			const name = (st.action ?? "").trim();
			return ["custom", { label: (st.label ?? "").trim() || name || "Action", key: "custom", act: name || undefined }];
		}
		const id = st.fn && GAME_FUNCS[st.fn] ? st.fn : "pause";
		return [id, GAME_FUNCS[id]];
	}

	override keyboard(st: Settings): string | undefined {
		const f = GameFunction.fn(st)[1];
		if (!f.kbd) return undefined;
		// "key" / "game", or the default: arrows and Repair send the real key, Back and Accept use the game
		const mode = st.input || (st.kbd === false ? "game" : "");
		if (mode === "key") return f.kbd;
		if (mode === "game") return undefined;
		return f.kbdDefault === false ? undefined : f.kbd;
	}

	face(_s: VehicleStatus, st: Settings, held?: boolean, ge: GeStatus = {}): Face {
		const [id, f] = GameFunction.fn(st);
		const s = f.state?.(ge) ?? { state: "off" };
		const on = s.state === "on";
		// next / previous camera through the game's own camera list: its own icon, and says so
		const gameList = (id === "cam_cycle" || id === "cam_prev") && !!st.gamecams;
		return {
			key: gameList ? `${f.key}_game` : f.key,
			sub: gameList ? "GAME LIST" : undefined,
			label: f.key === "custom" ? "Game action" : f.label,
			state: held ? "on" : s.state,
			alt: ["off"],
			value: s.value ?? "", // the title says what it is; the bottom line is only for a mode
			color: on || held ? C.warn : C.off,
			overlay: s.overlay,
			flash: s.flash,
			head: s.head,
			dim: s.dim,
			...(s.glyph ? { glyph: s.glyph, tint: s.tint } : {}),
		};
	}
	command(_s: VehicleStatus, st: Settings, ge: GeStatus = {}): Command {
		const [id, f] = GameFunction.fn(st);
		const menu = f.menu;
		// arrows: fly the free camera, walk on foot, otherwise menu navigation
		const held = f.fly && ge.cam === "free" ? f.fly : f.walk && ge.walking ? f.walk : undefined;
		if (held) {
			walkHeld.set(id, held);
			return { tool: "trigger_action", args: { action: held, state: "down" } };
		}
		if (f.lua) return { tool: "run_lua", args: { code: typeof f.lua === "function" ? f.lua(ge, st) : f.lua }, mp: f.mp?.(st), menu };
		if (f.hold) return { tool: "trigger_action", args: { action: f.hold, state: "down" }, menu };
		if (f.act) return { tool: "trigger_action", args: { action: typeof f.act === "function" ? f.act(ge) : f.act }, menu };
		if (f.tool) return { tool: f.tool[0], args: f.tool[1], menu };
		return null;
	}
	override release(_s: VehicleStatus, st: Settings): Command {
		const [id, f] = GameFunction.fn(st);
		const w = walkHeld.get(id);
		if (w) {
			walkHeld.delete(id);
			return { tool: "trigger_action", args: { action: w, state: "up" } };
		}
		return f.hold ? { tool: "trigger_action", args: { action: f.hold, state: "up" } } : null;
	}
}
