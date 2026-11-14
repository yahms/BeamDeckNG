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
	/** Icon state for the current game state; "off" by default, "on" shows the orange/active icon. */
	state?: (ge: GeStatus) => { state: string; value?: string; overlay?: string; flash?: boolean };
	/** Tap: trigger_action name. */
	act?: string;
	/** Hold: trigger_action with down/up. */
	hold?: string;
	/** Anything else: an MCP tool call. */
	tool?: [string, object];
	/** Or game-engine Lua (run_lua), for things the game's actions don't do reliably. */
	lua?: string | ((ge: GeStatus) => string);
};

// Slow motion: toggle between normal speed and the last slow speed used (default 1/4).
let lastSlow = 0.25;

const slowName = (ts?: number) => {
	if (!ts || ts <= 0 || ts >= 0.999) return undefined; // 0 = paused, not slow motion
	const inv = Math.round(1 / ts);
	return inv > 1 ? `1/${inv}x` : `${ts.toFixed(2)}x`;
};

export const GAME_FUNCS: Record<string, GameFn> = {
	// fixed buttons
	accept: { label: "Accept", key: "accept", act: "menu_item_select" },
	back: { label: "Back", key: "back", act: "menu_item_back" },
	pause: { label: "Pause", key: "pause", act: "pause", state: (g) => (g.paused ? { state: "on", value: "PAUSED" } : { state: "off", value: "RUN" }) },
	repair: { label: "Repair", key: "repair", act: "recover_vehicle_alt" },
	recover: { label: "Recover", key: "recover", tool: ["recover_vehicle", {}] },
	respawn: { label: "Respawn", key: "home", act: "loadHome" },
	// game tab
	// gameplay_walk isn't always loaded (e.g. after a level load through MCP), so load it first
	walk: { label: "Get in / out", key: "walk", lua: "if not gameplay_walk then extensions.load('gameplay_walk') end gameplay_walk.toggleWalkingMode() return 'ok'", state: (g) => (g.walking ? { state: "on", value: "ON FOOT" } : { state: "off", value: "IN CAR" }) },
	map: { label: "Map", key: "map", act: "toggleBigMap" },
	vehicles: { label: "Vehicles", key: "vehicles", act: "vehicle_selector" },
	radial: { label: "Radial menu", key: "radial", act: "toggleRadialMenuMulti" },
	slowmo: {
		label: "Slow motion",
		key: "slowmo",
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
	slower: { label: "Slower", key: "slower", act: "slower_motion", state: (g) => ({ state: "off", overlay: slowName(g.timeScale) }) },
	faster: { label: "Faster", key: "faster", act: "faster_motion", state: (g) => ({ state: "off", overlay: slowName(g.timeScale) }) },
	ui: { label: "Game UI", key: "ui", tool: ["toggle_ui", {}], state: (g) => (g.ui === false ? { state: "off", value: "HIDDEN" } : { state: "on", value: "SHOWN" }) },
	photo: { label: "Photo mode", key: "photo", act: "photomode" },
	traffic: { label: "Traffic", key: "traffic", act: "toggleTraffic" },
	trailer: { label: "Trailer", key: "trailer", act: "couplersToggle" },
	nextveh: { label: "Next vehicle", key: "nextveh", act: "switch_next_vehicle" },
	up: { label: "Up", key: "up", act: "menu_item_up" },
	down: { label: "Down", key: "down", act: "menu_item_down" },
	left: { label: "Left", key: "left", act: "menu_item_left" },
	right: { label: "Right", key: "right", act: "menu_item_right" },
	// camera tab
	cam_cycle: { label: "Camera", key: "cam_cycle", act: "toggleCamera", state: (g) => ({ state: "off", overlay: g.cam }) },
	cam_center: { label: "Centre cam", key: "cam_center", act: "center_camera" },
	cam_orbit: { label: "Orbit", key: "cam_orbit", tool: ["set_camera", { name: "orbit" }], state: (g) => camState(g, "orbit") },
	// the driver camera has a per-vehicle name (e.g. occupant.FL)
	cam_driver: {
		label: "Driver",
		key: "cam_driver",
		lua: "local id = be:getPlayerVehicleID(0) core_camera.setVehicleCameraByNameWithId(id, core_camera.getDriverCameraNameById(id)) return 'ok'",
		state: (g) => (g.cam && (g.cam.startsWith("occupant") || g.cam === "driver") ? { state: "on", value: "ACTIVE" } : { state: "off", value: "" }),
	},
	cam_chase: { label: "Chase", key: "cam_chase", tool: ["set_camera", { name: "chase" }], state: (g) => camState(g, "chase") },
	cam_external: { label: "External", key: "cam_external", tool: ["set_camera", { name: "external" }], state: (g) => camState(g, "external") },
	cam_top: { label: "Top", key: "cam_top", tool: ["set_camera", { name: "top" }], state: (g) => camState(g, "top") },
	look_back: { label: "Look back", key: "look_back", hold: "look_back" },
	replay: {
		label: "Replay",
		key: "replay",
		act: "toggleReplayRecording",
		state: (g) => (g.replay === "recording" ? { state: "on", value: "REC", flash: true } : { state: "off", value: g.replay === "playing" ? "PLAY" : "OFF" }),
	},
};

function camState(g: GeStatus, name: string) {
	return g.cam === name ? { state: "on", value: "ACTIVE" } : { state: "off", value: "" };
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

	face(_s: VehicleStatus, st: Settings, held?: boolean, ge: GeStatus = {}): Face {
		const [, f] = GameFunction.fn(st);
		const s = f.state?.(ge) ?? { state: "off" };
		const on = s.state === "on";
		return {
			key: f.key,
			label: f.key === "custom" ? "Game action" : f.label,
			state: held ? "on" : s.state,
			alt: ["off"],
			value: s.value ?? f.label.toUpperCase(),
			color: on || held ? C.warn : C.off,
			overlay: s.overlay,
			flash: s.flash,
		};
	}
	command(_s: VehicleStatus, st: Settings, ge: GeStatus = {}): Command {
		const [, f] = GameFunction.fn(st);
		if (f.lua) return { tool: "run_lua", args: { code: typeof f.lua === "function" ? f.lua(ge) : f.lua } };
		if (f.hold) return { tool: "trigger_action", args: { action: f.hold, state: "down" } };
		if (f.act) return { tool: "trigger_action", args: { action: f.act } };
		if (f.tool) return { tool: f.tool[0], args: f.tool[1] };
		return null;
	}
	override release(_s: VehicleStatus, st: Settings): Command {
		const [, f] = GameFunction.fn(st);
		return f.hold ? { tool: "trigger_action", args: { action: f.hold, state: "up" } } : null;
	}
}
