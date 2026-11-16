// Talks to the player vehicle without run_lua_vehicle.
//
// run_lua_vehicle returns the *previous* run's result, and that slot is shared with every other
// MCP client. Polling it from here would steal other clients' results. Instead
// we use the synchronous game-engine VM (run_lua) as a relay:
//   GE:      be:getPlayerVehicle(0):queueLuaCommand(<vehicle code>)
//   vehicle: obj:queueGameEngineLua("BNGSD.<slot> = <result string>")
//   GE:      a later run_lua reads BNGSD.<slot>
// Nothing here touches run_lua_vehicle, so the two programs don't interfere.

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import streamDeck from "@elgato/streamdeck";
import { glyphCount, storeGlyphs, takeWantedGlyphs } from "./icons";
import { Blocked, Mcp } from "./mcp";
import { classify, RawControl, VControl } from "./vehcontrols";
import { OutGauge } from "./outgauge";

export const VERSION = "0.2.10";
export const DECK_VERSION = "0.2.5"; // bump when the vehicle Lua changes, so vehicles reload it

export type DiffState = "locked" | "open" | "partial" | "auto" | "lsd" | null | undefined;
export type ModeInfo = { ctrl: string; key: string | null; name: string | null; color?: string };

/** What the vehicle-side BNGS.status() reports. Missing fields mean "this vehicle doesn't have it". */
export type VehicleStatus = {
	ign?: number;
	running?: boolean;
	hasTC?: boolean;
	tc?: boolean;
	tcMode?: ModeInfo;
	centerMode?: ModeInfo;
	centerModes?: { key: string; name?: string }[]; // centre diff controller modes, in the game's order
	diff?: { front?: DiffState; rear?: DiffState; center?: DiffState };
	range?: "low" | "high" | "partial" | null;
	drive?: "4wd" | "2wd" | "partial" | null;
	pbrake?: boolean;
	lights?: number; // 0 off, 1 low, 2 high
	fog?: number;
	hazard?: number;
	sigL?: number;
	sigR?: number;
	lightbar?: number; // 0 off, 1 lights, 2 lights + siren
	lbm?: number; // lightbar flash pattern index (1-based), when the vehicle has more than one
	lbn?: string; // its name (Chase, Scene...)
	lbc?: number; // how many patterns
	horn?: number;
	cruise?: { on: boolean; speed?: number }; // speed in m/s
	ebrake?: number; // 0 off, 1..3
	retarder?: number; // 1 auto, 2 off, 3..7 = 20..100 %
	air?: boolean;
	doors?: Record<string, boolean>; // FL/FR/RL/RR -> open
	doorsOpen?: number;
	hood?: boolean;
	trunk?: boolean;
	n2o?: { armed: boolean; override: boolean; active: boolean; bottle?: number };
	jato?: { on: boolean; firing: boolean; fuel?: number };
	pt?: PtButton[]; // the game's own powertrain button bar
	/** States the auto vehicle-control keys watch (vc_watch): electrics values and coupler group states. */
	vc?: { e?: Record<string, number>; c?: Record<string, string> };
	/** Gauge readings. spd m/s, temps in C, boost in psi, fuel 0..1, dmg = the game's damage score. */
	/** Tyre pressure groups (CTIS): k = group key, n = name, psi, min, max, a = selected. */
	tp?: { k: string; n?: string; psi?: number; min?: number; max?: number; a?: boolean }[];
	g?: { spd?: number; gear?: string; gi?: number; rpm?: number; maxrpm?: number; shift?: boolean; fuel?: number; low?: boolean; water?: number; oil?: number; boost?: number; boostMax?: number; dmg?: number };
};

/** One button of the game's powertrain bar: icon is the game's icon name, color hex (no #), ring 0..1. */
export type PtButton = { id: string; name?: string; icon?: string; color?: string; ring?: number };

/** Game-engine side state, read on every poll (works without a vehicle too). */
export type GeStatus = {
	paused?: boolean;
	timeScale?: number; // 1 = normal, < 1 = slow motion
	cam?: string; // active camera name
	replay?: string; // inactive | recording | playback
	replayPaused?: boolean; // playback is paused (a stopped recording is loaded paused)
	towing?: boolean; // the player vehicle has a trailer coupled
	ui?: boolean; // game UI visible
	walking?: boolean; // player is on foot
	/** Time of day: time 0..1 (0 = noon, 0.5 = midnight), play = clock running, dayLength in seconds. */
	tod?: { time: number; play?: boolean; dayLength?: number };
	cloud?: number; // cloud cover
	fog?: number; // fog density (environment-menu units)
	fog0?: number; // the level's own fog density
	fogH?: number; // fog atmosphere height (m)
	wind?: number;
	grav?: number; // m/s2, negative = down
	rain?: number; // rain drops (0 = dry)
	veh?: { name?: string; color?: string }; // current vehicle: model name and paint colour ("r, g, b, a")
};

/** limited = MCP not answering, but OutGauge is: dashboard state only, no presses. */
/** What BeamDeckNG MP-MCP reports about itself (beamdeck_info). Every field may be missing on an old add-on. */
export type AddonInfo = {
	version?: string;
	proto?: number;
	deckVersion?: string;
	/** "server": sent by the BeamMP server; "local": installed on this PC (runs outside sessions only). */
	source?: string;
	allow?: { vehicle?: string[]; actions?: string[]; game?: string[]; menus?: string[]; controls?: string[] };
	always?: string[];
	functions?: string[];
	/** Menu pages open_menu knows. */
	menuPages?: string[];
};
/** Lua encodes an empty list as {}; anything that isn't a list of strings counts as "not reported". */
const strList = (v: unknown): string[] | undefined =>
	Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : v && typeof v === "object" && Object.keys(v).length === 0 ? [] : undefined;
function cleanInfo(v: any): AddonInfo {
	const a = v?.allow ?? {};
	return {
		version: typeof v?.version === "string" ? v.version : undefined,
		proto: typeof v?.proto === "number" ? v.proto : undefined,
		deckVersion: typeof v?.deckVersion === "string" ? v.deckVersion : undefined,
		source: typeof v?.source === "string" ? v.source : undefined,
		allow: { vehicle: strList(a.vehicle), actions: strList(a.actions), game: strList(a.game), menus: strList(a.menus), controls: strList(a.controls) },
		always: strList(v?.always),
		functions: strList(v?.functions),
		menuPages: strList(v?.menuPages),
	};
}
/** Add-on tool protocol this plugin was written for. Newer add-ons are still used (log only). */
const ADDON_PROTO = 1;
/** Port of BeamDeckNG MP-MCP's listener (mp-mcp/). */
export const ADDON_PORT = 29392;

/** The parts of a key's command the add-on checks (same shape as actions.ts Command). */
type Cmd = { action?: string; tool?: string; args: object; mp?: { fn: string; args?: object }; menu?: string; vc?: { id: string; t?: number } } | null;

/** "*", "!jato*" style patterns (later ones win), as MP-MCP's settings use them. */
export function globAllows(patterns: string[] | undefined, name: string): boolean | undefined {
	if (!patterns) return undefined;
	let ok = false;
	for (const p of patterns) {
		const neg = p.startsWith("!");
		const re = new RegExp("^" + (neg ? p.slice(1) : p).replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*") + "$", "i");
		if (re.test(name)) ok = !neg;
	}
	return ok;
}

export type Link = "offline" | "novehicle" | "loading" | "paused" | "ok" | "limited";

export type Snapshot = { link: Link; vid?: number; status?: VehicleStatus; ge?: GeStatus };

export type ResolverResult = {
	status: "applied" | "already" | "partial" | "unsupported" | "failed" | "pending";
	action?: string;
	targets?: any[];
	side?: any[];
	checks?: any[];
	verify_ms?: number;
	detail?: string;
};

// ---------------------------------------------------------------- Lua helpers

const here = path.dirname(fileURLToPath(import.meta.url)); // <plugin>.sdPlugin/bin
const LUA_DIR = path.join(here, "..", "lua");
const RESOLVER = readFileSync(path.join(LUA_DIR, "resolver.lua"), "utf8");
const DECK = readFileSync(path.join(LUA_DIR, "beamdeck.lua"), "utf8").replace("__DECK_VERSION__", DECK_VERSION);
/** Full vehicle library: resolver + BeamDeck additions; leaves BNGS in the global BNGSD_BNGS. */
const LIBRARY = `${RESOLVER}\n${DECK}\n`;
/** Game engine: the vehicle-specific controls of the player vehicle and what it tows (lua/controls.lua, shared with MP-MCP). */
const CONTROLS = readFileSync(path.join(LUA_DIR, "controls.lua"), "utf8");
const controlsLua = (tail: string) => `local C = (function()\n${CONTROLS}\nend)()\n${tail}`;

/** Lua long-bracket string literal that can hold any text. */
export function longStr(s: string): string {
	let n = 0;
	while (s.includes("]" + "=".repeat(n) + "]")) n++;
	const eq = "=".repeat(n);
	// A newline right after the opening bracket is dropped by Lua, so add one to keep s intact.
	return `[${eq}[\n${s}]${eq}]`;
}

/** Lua quoted string literal. */
export function luaStr(s: string): string {
	return JSON.stringify(s)
		.replace(/\\u([0-9a-fA-F]{4})/g, (_m, h) => {
			const c = parseInt(h, 16);
			return c < 0x80 ? `\\${String(c).padStart(3, "0")}` : String.fromCharCode(c);
		})
		.replace(/\\\//g, "/");
}

/** JSON value -> Lua literal. */
export function luaLit(v: unknown): string {
	if (v === null || v === undefined) return "nil";
	if (typeof v === "boolean" || typeof v === "number") return String(v);
	if (typeof v === "string") return luaStr(v);
	if (Array.isArray(v)) return `{${v.map(luaLit).join(",")}}`;
	return `{${Object.entries(v as object)
		.map(([k, x]) => `[${luaStr(k)}]=${luaLit(x)}`)
		.join(",")}}`;
}

/** Vehicle-side code that sends `exprLua` (a Lua string expression) back to GE slot BNGSD[slot][key]. */
function sendBack(slot: string, key: string, exprLua: string): string {
	return `obj:queueGameEngineLua("BNGSD = BNGSD or {}; BNGSD.${slot} = BNGSD.${slot} or {}; BNGSD.${slot}[" .. ${luaStr(
		luaStr(key),
	)} .. "] = " .. string.format("%q", ${exprLua}))`;
}

/** GE code: queue `vehicleCode` on the player vehicle and return a little JSON about it. */
function geQueue(vehicleCode: string, extraGe = ""): string {
	return `local veh = be:getPlayerVehicle(0)
if not veh then return jsonEncode({ veh = false }) end
veh:queueLuaCommand(${longStr(vehicleCode)})
${extraGe}
return jsonEncode({ veh = true, vid = veh:getID() })`;
}

// ---------------------------------------------------------------- the game link

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export class Game {
	/** The game's own MCP server. */
	readonly mcp: Mcp;
	/** BeamDeckNG MP-MCP's server, used when the game's doesn't answer (BeamMP blocks it in sessions). */
	readonly addon: Mcp;
	backend: "native" | "addon" = "native";
	addonInfo?: AddonInfo;
	private addonTools = new Set<string>();
	private seq = 0;
	private lastSeen = 0; // seq of the newest status that came back
	// Statuses left in the game by an earlier run of the plugin carry another session id.
	private readonly sid = Math.random().toString(36).slice(2, 10);
	private lastInstall = 0;
	private tagN = 0;
	private mcpSnap: Snapshot = { link: "offline" };
	/** OutGauge listener, used when MCP isn't answering. */
	og?: OutGauge;

	/** What the keys show: MCP's view, or OutGauge's while MCP is unreachable. */
	get snapshot(): Snapshot {
		if (this.mcpSnap.link === "offline") {
			const status = this.og?.status();
			if (status) return { link: "limited", status };
		}
		return this.mcpSnap;
	}

	/** The MCP link on its own (offline while OutGauge alone is answering). */
	get mcpLink(): Link {
		return this.mcpSnap.link;
	}

	constructor(host = "127.0.0.1", port = 29292, p = "/mcp", addonPort = ADDON_PORT) {
		this.mcp = new Mcp(`http://${host}:${port}${p}`);
		this.addon = new Mcp(`http://${host}:${addonPort}/mcp`);
	}

	private get conn(): Mcp {
		return this.backend === "addon" ? this.addon : this.mcp;
	}

	private useBackend(b: "native" | "addon") {
		if (this.backend === b) return;
		this.backend = b;
		this.lastSeen = 0;
		const v = this.addonInfo;
		streamDeck.logger.info(
			b === "addon"
				? `using BeamDeckNG MP-MCP ${v?.version ?? "(old, no version)"} (${v?.source ?? "?"} copy, protocol ${v?.proto ?? "?"}, vehicle library ${v?.deckVersion ?? "?"})`
				: "using the game's own MCP server",
		);
	}

	/** Is BeamDeckNG MP-MCP listening? Reads its tools and what its server allows. */
	private async findAddon(): Promise<boolean> {
		try {
			const tools = await this.addon.listTools();
			if (!tools.includes("beamdeck_status")) return false;
			this.addonTools = new Set(tools);
			this.addonInfo = undefined;
			if (this.addonTools.has("beamdeck_info")) {
				try {
					this.addonInfo = cleanInfo(JSON.parse(await this.addon.call("beamdeck_info", {})));
				} catch {
					/* old or broken info: the tool list alone still works */
				}
			}
			const proto = this.addonInfo?.proto;
			if (typeof proto === "number" && proto > ADDON_PROTO)
				streamDeck.logger.warn(`BeamDeckNG MP-MCP speaks protocol ${proto}, newer than this plugin's ${ADDON_PROTO}; update the plugin if keys misbehave`);
			this.useBackend("addon");
			return true;
		} catch {
			return false;
		}
	}

	/**
	 * Through BeamDeckNG MP-MCP, can this key's command run? "blocked": the server's allowlist says no.
	 * "unavailable": the add-on can't do it at all (free-form Lua, or a tool an older add-on lacks).
	 * Unknown (an old add-on without an allowlist report) counts as allowed; the add-on still checks.
	 */
	blocked(cmd: Cmd): "blocked" | "unavailable" | undefined {
		if (!cmd || this.backend !== "addon") return undefined;
		const info = this.addonInfo, allow = info?.allow, has = (t: string) => this.addonTools.has(t);
		if (cmd.vc) {
			if (!has("vehicle_control")) return "unavailable";
			return globAllows(allow?.controls, cmd.vc.id) === false ? "blocked" : undefined;
		}
		if (cmd.action) {
			if (!has("beamdeck_call")) return "unavailable";
			if (allow?.vehicle && !allow.vehicle.includes(cmd.action) && !(info?.always ?? []).includes(cmd.action)) return "blocked";
			return undefined;
		}
		if (cmd.mp) {
			if (!has("beamdeck_game") || (info?.functions && !info.functions.includes(cmd.mp.fn))) return "unavailable";
			if (allow?.game && !allow.game.includes(cmd.mp.fn)) return "blocked";
			return undefined;
		}
		if (!cmd.tool || cmd.tool === "run_lua" || !has(cmd.tool)) return "unavailable";
		if (cmd.tool === "trigger_action") {
			const a = (cmd.args as { action?: string }).action ?? "";
			return allow?.actions && !allow.actions.includes(a) ? "blocked" : undefined;
		}
		return allow?.game && !allow.game.includes(cmd.tool) ? "blocked" : undefined;
	}

	/** The player vehicle's auto vehicle-control keys (null: not read yet, or no vehicle). */
	controls: { vid: number; model: string; keys: VControl[]; raw: RawControl[]; at: number } | null = null;
	private controlsBusy = false;

	/**
	 * Read the player vehicle's own controls when it changes (or every 20 s: parts can change them),
	 * and tell the vehicle which states to report for them.
	 */
	async refreshControls(vid: number | undefined): Promise<void> {
		if (vid === undefined || this.controlsBusy) return;
		if (this.controls && this.controls.vid === vid && Date.now() - this.controls.at < 20000) return;
		if (this.backend === "addon" && !this.addonTools.has("beamdeck_controls")) return;
		this.controlsBusy = true;
		try {
			const r = JSON.parse(this.backend === "addon" ? await this.addon.call("beamdeck_controls", {}) : await this.mcp.runLua(controlsLua("return jsonEncode(C.list())")));
			if (!r.veh || !Array.isArray(r.list)) return;
			// the player vehicle's keys, then each towed trailer's (an older MP-MCP only sends the player's)
			const vehicles: { t: number; list: RawControl[] }[] = Array.isArray(r.vehicles) ? r.vehicles : [{ t: 0, list: r.list }];
			const keys = vehicles.flatMap((v) => classify(Array.isArray(v.list) ? v.list : []).keys.map((k) => (v.t ? { ...k, t: v.t } : k)));
			const changed = !this.controls || this.controls.vid !== r.vid || JSON.stringify(this.controls.keys) !== JSON.stringify(keys);
			this.controls = { vid: r.vid, model: String(r.model), keys, raw: r.list, at: Date.now() };
			if (changed) {
				streamDeck.logger.info(`vehicle controls for ${r.model}: ${keys.length} keys (${keys.map((k) => k.label).join(", ")})`);
				const mine = keys.filter((k) => !k.t); // states come from the vehicle you drive
				const electrics = [...new Set(mine.flatMap((k) => (k.state && "electric" in k.state ? [k.state.electric] : [])))];
				const couplers = [...new Set(mine.flatMap((k) => (k.state && "coupler" in k.state ? [k.state.coupler] : [])))];
				await this.fire("vc_watch", { electrics, couplers }).catch(() => undefined);
			}
		} catch (e) {
			streamDeck.logger.warn(`reading vehicle controls failed: ${(e as Error).message}`);
		} finally {
			this.controlsBusy = false;
		}
	}

	/** Run one of the vehicle's own controls: press (value) or release. t: 0 = player vehicle, 1 = what it tows... */
	async vehicleControl(id: string, value: number, phase: "down" | "up", t = 0): Promise<void> {
		if (!/^[\w.\-]+$/.test(id) || !Number.isFinite(value) || !Number.isInteger(t)) throw new Error("bad control");
		const r =
			this.backend === "addon"
				? await this.addon.call("vehicle_control", t ? { id, value, phase, t } : { id, value, phase })
				: await this.mcp.runLua(controlsLua(`return C.run(${t}, ${JSON.stringify(id)}, ${value}, "${phase}")`));
		if (r.startsWith("blocked by the game")) throw new Blocked(`not allowed on this server: vehicle control (blocked by the game) ${id}`, "blocked");
		if (r !== "ok" && !r.startsWith("ok")) throw new Error(r);
	}

	/** Through MP-MCP: can this key open its game menu page instead (when direct control isn't allowed)? */
	canMenu(page?: string): boolean {
		if (!page || this.backend !== "addon" || !this.addonTools.has("open_menu")) return false;
		const info = this.addonInfo;
		if (info?.menuPages && !info.menuPages.includes(page)) return false;
		return !info?.allow?.menus || info.allow.menus.includes(page);
	}

	openMenu(page: string): Promise<string> {
		return this.addon.call("open_menu", { page });
	}

	/** Short in-game message (the game's message app), one line that each new message replaces. */
	message(text: string, icon = "info"): void {
		const args = { text, ttl: 3, category: "beamdeckng", icon };
		const p =
			this.backend === "addon"
				? this.addonTools.has("show_message")
					? this.addon.call("show_message", args)
					: Promise.resolve("")
				: this.mcp.call("show_message", args);
		p.catch(() => undefined);
	}

	/**
	 * One poll through whichever server is in use. If the game's own server doesn't answer, try the
	 * BeamDeckNG MP-MCP; if it stops answering (left the server), go back to the game's.
	 */
	async poll(): Promise<Snapshot> {
		const s = await this.pollOnce();
		if (s.link !== "offline") return s;
		if (this.backend === "addon") {
			this.useBackend("native");
			return this.pollOnce();
		}
		if (await this.findAddon()) return this.pollOnce();
		return s;
	}

	/**
	 * One poll: ask the vehicle for a fresh status and read back whatever arrived since last time.
	 * The status shown is therefore one poll old (~250 ms), which is fine for buttons.
	 */
	private async pollOnce(): Promise<Snapshot> {
		const seq = ++this.seq;
		const probe = `local B = rawget(_G, "BNGSD_BNGS")
local j
if not B or B.deckVersion ~= ${luaStr(DECK_VERSION)} then j = '{"needInit":true}'
else local ok, r = pcall(B.status); j = ok and jsonEncode(r) or jsonEncode({ err = tostring(r) }) end
obj:queueGameEngineLua("BNGSD = BNGSD or {}; BNGSD.status = { vid = " .. obj:getID() .. ", sid = \\"${this.sid}\\", seq = ${seq}, json = " .. string.format("%q", j) .. " }")`;
		const geCode = `BNGSD = BNGSD or {}
local g = {}
pcall(function() g.paused = simTimeAuthority.getPause() end)
pcall(function() g.timeScale = simTimeAuthority.get() end)
pcall(function() g.cam = core_camera.getActiveCamName() end)
pcall(function() g.replay = core_replay.getState() g.replayPaused = core_replay.isPaused() end)
pcall(function() g.ui = extensions.ui_visibility.getCef() end)
pcall(function() local d = core_trailerRespawn.getTrailerData() g.towing = d[be:getPlayerVehicleID(0)] ~= nil end)
pcall(function()
  local t = core_environment.getTimeOfDay()
  if not t then return end
  g.tod = { time = t.time, play = t.play, dayLength = t.dayLength }
  local e = core_environment.getState()
  g.cloud = e.cloudCover g.fog = e.fogDensity g.wind = e.windSpeed g.grav = e.gravity g.fogH = e.fogAtmosphereHeight
  local i = core_environment.getInitState()
  g.fog0 = i and i.fogDensity
  local n = 0
  for _, nm in ipairs(scenetree.findClassObjects("Precipitation") or {}) do
    local o = scenetree.findObject(nm)
    if o then n = math.max(n, tonumber(o.numDrops) or 0) end
  end
  g.rain = n
end)
pcall(function()
  -- model name and paint colour, looked up once per vehicle
  local vid = be:getPlayerVehicleID(0)
  if vid and vid >= 0 then
    if BNGSD.vehId ~= vid then
      BNGSD.vehId = vid
      local ok, d = pcall(core_vehicles.getVehicleDetails, vid)
      BNGSD.vehName = ok and d and d.model and d.model.Name or nil
      local o = be:getObjectByID(vid)
      BNGSD.vehColor = o and tostring(o.color) or nil
    end
    g.veh = { name = BNGSD.vehName, color = BNGSD.vehColor }
  end
end)
local veh = be:getPlayerVehicle(0)
pcall(function() g.walking = veh ~= nil and veh:getJBeamFilename() == "unicycle" end)
if not veh then return jsonEncode({ veh = false, ge = g }) end
local vid = veh:getID()
veh:queueLuaCommand(${longStr(probe)})
local s = BNGSD and BNGSD.status
local out = { veh = true, vid = vid, ge = g }
if s and s.vid == vid and s.sid == ${luaStr(this.sid)} then out.seq = s.seq; out.s = s.json end
return jsonEncode(out)`;

		let out: any;
		try {
			// the add-on runs the same status code itself (beamdeck_status), with no run_lua
			out = JSON.parse(this.backend === "addon" ? await this.addon.call("beamdeck_status", { sid: this.sid, seq }) : await this.mcp.runLua(geCode));
		} catch {
			// offline, or the game is between levels (no `be`, Lua errors): both read as not available
			return (this.mcpSnap = { link: this.conn.connected ? "novehicle" : "offline" });
		}
		const ge = out.ge as GeStatus | undefined;
		if (!out.veh) return (this.mcpSnap = { link: "novehicle", ge });

		const prev = this.mcpSnap;
		const sameVeh = prev.vid === out.vid;
		if (!sameVeh) this.lastSeen = 0;
		if (typeof out.seq === "number") this.lastSeen = Math.max(this.lastSeen, out.seq);

		let status: any;
		try {
			status = out.s ? JSON.parse(out.s) : undefined;
		} catch {
			status = undefined;
		}

		if (status?.needInit || status?.err) {
			// (the add-on installs its own copy of the library)
			if (this.backend === "native" && Date.now() - this.lastInstall > 2000) {
				this.lastInstall = Date.now();
				await this.mcp.runLua(geQueue(LIBRARY)).catch(() => undefined);
			}
			return (this.mcpSnap = { link: "loading", vid: out.vid, ge });
		}

		// No answer for ~2 s: the vehicle VM isn't running (physics paused, menu, loading).
		const behind = seq - this.lastSeen;
		if (!status || behind > 8) {
			const keep = sameVeh ? prev.status : undefined;
			return (this.mcpSnap = { link: keep ? "paused" : "loading", vid: out.vid, status: keep, ge });
		}
		return (this.mcpSnap = { link: "ok", vid: out.vid, status: status as VehicleStatus, ge });
	}

	/**
	 * Fetch the game's own UI icons the buttons asked for, from the player's install
	 * (/ui/assets/Sprites/svg-symbols.svg, kept in the game's Lua between calls).
	 */
	async fetchGlyphs(): Promise<void> {
		const ids = takeWantedGlyphs();
		if (!ids.length) return;
		// The sprite is cached in the game, but only once it has really been read: a half-loaded game
		// returns nothing, and caching that would leave every key without an icon until a restart.
		const code = `BNGSD = BNGSD or {}
if not BNGSD.sprite or #BNGSD.sprite == 0 then BNGSD.sprite = readFile("/ui/assets/Sprites/svg-symbols.svg") or "" end
local s = BNGSD.sprite
if #s == 0 then return jsonEncode({ nosprite = true }) end
local out = {}
for _, id in ipairs(${luaLit(ids)}) do
  local a = s:find('<symbol[^>]-id="' .. id:gsub("%p", "%%%0") .. '"')
  if a then local b = s:find("</symbol>", a, true) out[id] = b and s:sub(a, b + 8) or false else out[id] = false end
end
return jsonEncode({ found = out })`;
		try {
			if (this.backend === "addon" && !this.addonTools.has("beamdeck_glyphs")) return;
			const r = JSON.parse(this.backend === "addon" ? await this.addon.call("beamdeck_glyphs", { ids }) : await this.mcp.runLua(code));
			if (!r.found) {
				streamDeck.logger.info(`icons: the game hasn't loaded its icon set yet, asking again later (${ids.length} wanted)`);
				return; // not stored, so they are asked for again
			}
			const got = Object.values(r.found as Record<string, string | false>).filter(Boolean).length;
			storeGlyphs(r.found);
			streamDeck.logger.info(`icons: read ${got}/${ids.length} from the game (${glyphCount()} in all)`);
		} catch {
			/* game busy or gone: they'll be asked for again */
		}
	}

	/** Run one resolver action in the vehicle and wait for its result. */
	private async callOnce(action: string, args: object, timeoutMs = 3000): Promise<ResolverResult> {
		const tag = `D${Date.now().toString(36)}${++this.tagN}`;
		if (this.backend === "addon") return this.callAddon(action, args, tag, timeoutMs);
		const veh = `${LIBRARY}
local __r = BNGS.call(${luaStr(action)}, ${luaLit(args)}, nil, "")
${sendBack("res", tag, "__r")}`;
		const q = JSON.parse(await this.mcp.runLua(geQueue(veh)));
		if (!q.veh) throw new Error("no vehicle");

		const read = `local t = BNGSD and BNGSD.res
local r = t and t[${luaStr(tag)}]
if r then t[${luaStr(tag)}] = nil return r end
return ""`;
		const deadline = Date.now() + timeoutMs;
		while (Date.now() < deadline) {
			await sleep(100);
			const r = await this.mcp.runLua(read);
			if (r && r.startsWith("{")) return JSON.parse(r) as ResolverResult;
		}
		throw new Error("no response from vehicle");
	}

	private async callAddon(action: string, args: object, tag: string, timeoutMs: number): Promise<ResolverResult> {
		if (!this.addonTools.has("beamdeck_call")) throw new Blocked("not available through the add-on", "unavailable");
		const q = JSON.parse(await this.addon.call("beamdeck_call", { action, args, tag }));
		if (!q.veh) throw new Error("no vehicle");
		const deadline = Date.now() + timeoutMs;
		while (Date.now() < deadline) {
			await sleep(100);
			const r = await this.addon.call("beamdeck_result", { tag });
			if (r && r.startsWith("{")) return JSON.parse(r) as ResolverResult;
		}
		throw new Error("no response from vehicle");
	}

	/**
	 * Fire-and-forget for held buttons (horn, air suspension): uses the library already installed
	 * in the vehicle VM, so it's one small run_lua with no waiting.
	 */
	async fire(action: string, args: object): Promise<void> {
		if (this.backend === "addon") {
			if (!this.addonTools.has("beamdeck_fire")) throw new Blocked("not available through the add-on", "unavailable");
			await this.addon.call("beamdeck_fire", { action, args });
			return;
		}
		const veh = `local B = rawget(_G, "BNGSD_BNGS")
if B then B.call(${luaStr(action)}, ${luaLit(args)}, nil, "") end`;
		await this.mcp.runLua(geQueue(veh));
	}

	/**
	 * Call one of the game's MCP tools (trigger_action, set_camera, toggle_ui...). Through the add-on,
	 * run_lua commands go by their named equivalent (mp) instead, and there is no free-form Lua.
	 */
	tool(name: string, args: object, mp?: { fn: string; args?: object }): Promise<string> {
		if (this.backend !== "addon") return this.mcp.call(name, args);
		const why = this.blocked({ tool: name, args, mp });
		if (why) return Promise.reject(new Blocked(`${mp?.fn ?? name}: ${why}`, why));
		if (mp) return this.addon.call("beamdeck_game", { fn: mp.fn, args: mp.args ?? {} });
		return this.addon.call(name, args);
	}

	/** Resolver action plus the deferred verify passes (act, then check a moment later). */
	async resolve(action: string, args: object): Promise<ResolverResult> {
		let r: ResolverResult;
		try {
			r = await this.callOnce(action, args);
		} catch (e) {
			// the add-on's allowlist (or an older add-on) said no: show it like an unsupported action
			if (e instanceof Blocked) return { status: "unsupported", action, detail: e.why === "blocked" ? "BLOCKED" : "NOT IN MP" };
			throw e;
		}
		if (r.status !== "pending" || !r.checks) return r;
		await sleep(r.verify_ms ?? 400);
		let pass = 1;
		let v = await this.callOnce("verify", { checks: r.checks, action, pass });
		// Still in progress (an engine still cranking): check a few more times.
		while (v.status === "pending" && pass < 5) {
			pass++;
			await sleep(1500);
			v = await this.callOnce("verify", { checks: r.checks, action, pass });
		}
		return { ...r, status: v.status, targets: v.targets };
	}
}
