// Talks to the player vehicle without run_lua_vehicle.
//
// run_lua_vehicle returns the *previous* run's result, and that slot is shared with every other
// MCP client (e.g. beam-assist). Polling it from here would steal beam-assist's results. Instead
// we use the synchronous game-engine VM (run_lua) as a relay:
//   GE:      be:getPlayerVehicle(0):queueLuaCommand(<vehicle code>)
//   vehicle: obj:queueGameEngineLua("BNGSD.<slot> = <result string>")
//   GE:      a later run_lua reads BNGSD.<slot>
// Nothing here touches run_lua_vehicle, so the two programs don't interfere.

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Mcp } from "./mcp";

export const DECK_VERSION = "0.1.0";

export type DiffState = "locked" | "open" | "partial" | "auto" | null | undefined;
export type ModeInfo = { ctrl: string; key: string | null; name: string | null };

/** What the vehicle-side BNGS.status() reports. Missing fields mean "this vehicle doesn't have it". */
export type VehicleStatus = {
	ign?: number;
	running?: boolean;
	hasTC?: boolean;
	tc?: boolean;
	tcMode?: ModeInfo;
	centerMode?: ModeInfo;
	diff?: { front?: DiffState; rear?: DiffState; center?: DiffState };
	range?: "low" | "high" | "partial" | null;
	drive?: "4wd" | "2wd" | "partial" | null;
	pbrake?: boolean;
	lights?: number; // 0 off, 1 low, 2 high
	fog?: number;
	hazard?: number;
	sigL?: number;
	sigR?: number;
	lightbar?: number;
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
};

export type Link = "offline" | "novehicle" | "loading" | "paused" | "ok";

export type Snapshot = { link: Link; vid?: number; status?: VehicleStatus };

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
	readonly mcp: Mcp;
	private seq = 0;
	private lastSeen = 0; // seq of the newest status that came back
	// Statuses left in the game by an earlier run of the plugin carry another session id.
	private readonly sid = Math.random().toString(36).slice(2, 10);
	private lastInstall = 0;
	private tagN = 0;
	snapshot: Snapshot = { link: "offline" };

	constructor(host = "127.0.0.1", port = 29292, p = "/mcp") {
		this.mcp = new Mcp(`http://${host}:${port}${p}`);
	}

	/**
	 * One poll: ask the vehicle for a fresh status and read back whatever arrived since last time.
	 * The status shown is therefore one poll old (~250 ms), which is fine for buttons.
	 */
	async poll(): Promise<Snapshot> {
		const seq = ++this.seq;
		const probe = `local B = rawget(_G, "BNGSD_BNGS")
local j
if not B or B.deckVersion ~= ${luaStr(DECK_VERSION)} then j = '{"needInit":true}'
else local ok, r = pcall(B.status); j = ok and jsonEncode(r) or jsonEncode({ err = tostring(r) }) end
obj:queueGameEngineLua("BNGSD = BNGSD or {}; BNGSD.status = { vid = " .. obj:getID() .. ", sid = \\"${this.sid}\\", seq = ${seq}, json = " .. string.format("%q", j) .. " }")`;
		const ge = `local veh = be:getPlayerVehicle(0)
if not veh then return jsonEncode({ veh = false }) end
local vid = veh:getID()
veh:queueLuaCommand(${longStr(probe)})
local s = BNGSD and BNGSD.status
local out = { veh = true, vid = vid }
if s and s.vid == vid and s.sid == ${luaStr(this.sid)} then out.seq = s.seq; out.s = s.json end
return jsonEncode(out)`;

		let out: any;
		try {
			out = JSON.parse(await this.mcp.runLua(ge));
		} catch {
			// offline, or the game is between levels (no `be`, Lua errors): both read as not available
			return (this.snapshot = { link: this.mcp.connected ? "novehicle" : "offline" });
		}
		if (!out.veh) return (this.snapshot = { link: "novehicle" });

		const prev = this.snapshot;
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
			if (Date.now() - this.lastInstall > 2000) {
				this.lastInstall = Date.now();
				await this.mcp.runLua(geQueue(LIBRARY)).catch(() => undefined);
			}
			return (this.snapshot = { link: "loading", vid: out.vid });
		}

		// No answer for ~2 s: the vehicle VM isn't running (physics paused, menu, loading).
		const behind = seq - this.lastSeen;
		if (!status || behind > 8) {
			const keep = sameVeh ? prev.status : undefined;
			return (this.snapshot = { link: keep ? "paused" : "loading", vid: out.vid, status: keep });
		}
		return (this.snapshot = { link: "ok", vid: out.vid, status: status as VehicleStatus });
	}

	/** Run one resolver action in the vehicle and wait for its result. */
	private async callOnce(action: string, args: object, timeoutMs = 3000): Promise<ResolverResult> {
		const tag = `D${Date.now().toString(36)}${++this.tagN}`;
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

	/**
	 * Fire-and-forget for held buttons (horn, air suspension): uses the library already installed
	 * in the vehicle VM, so it's one small run_lua with no waiting.
	 */
	async fire(action: string, args: object): Promise<void> {
		const veh = `local B = rawget(_G, "BNGSD_BNGS")
if B then B.call(${luaStr(action)}, ${luaLit(args)}, nil, "") end`;
		await this.mcp.runLua(geQueue(veh));
	}

	/** Resolver action plus the deferred verify passes (same flow as beam-assist's lua::resolve). */
	async resolve(action: string, args: object): Promise<ResolverResult> {
		const r = await this.callOnce(action, args);
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
