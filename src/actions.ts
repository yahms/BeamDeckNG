import streamDeck, {
	action,
	DidReceiveSettingsEvent,
	KeyAction,
	KeyDownEvent,
	KeyUpEvent,
	SingletonAction,
	WillAppearEvent,
	WillDisappearEvent,
} from "@elgato/streamdeck";
import { titleFor } from "./titles";
import { DiffState, Game, GeStatus, ResolverResult, Snapshot, VehicleStatus } from "./game";
import { withGlyph } from "./glyphmap";
import { Blocked } from "./mcp";
import { C, colorName, Face, P, render } from "./icons";

export type Settings = {
	fn?: string; // game function buttons: which function
	msg?: boolean; // every key: show an in-game message when pressed (on unless unticked)
	slot?: number; // Vehicle control keys: which of the vehicle's controls (1 = first)
	action?: string; // custom game action: the game's input action name
	label?: string; // custom game action: text on the key
	index?: string; // powertrain buttons: which button of the game's bar (1-based)
	scope?: "front" | "rear" | "center" | "all" | "cycle";
	press?: string; // traction: toggle | cycle; lights: cycle | low | high; n2o: combined | arm | spray; jato: hold | toggle
	show?: string; // ignition: "engine" = gear and RPM over the engine icon, with a shift light
	side?: "left" | "right";
	part?: "doors" | "FL" | "FR" | "RL" | "RR" | "hood" | "trunk";
	op?: "toggle" | "set" | "plus" | "minus";
	step?: string; // cruise +/- step, in the display unit
	units?: "kmh" | "mph";
	dir?: "raise" | "lower";
	gauge?: string; // gauge buttons: which reading
	group?: string; // tyre pressure: "all" or the axle number
	tdir?: "inflate" | "deflate"; // tyre pressure: which way
	gamecams?: boolean; // camera buttons: cycle only the cameras enabled in the game's own settings
};
/** A vehicle resolver action ({action, args}) or one of the game's MCP tools ({tool, args}). */
export type Command = {
	action?: string;
	tool?: string;
	args: object;
	/** For run_lua tools: BeamDeckNG MP-MCP's named equivalent (it has no free-form Lua). */
	mp?: { fn: string; args?: object };
	/** On BeamMP: the game menu page to open instead when MP-MCP doesn't allow this directly. */
	menu?: string;
	/** One of the vehicle's own controls (auto Vehicle control keys): press or release. */
	vc?: { id: string; value: number; phase: "down" | "up"; t?: number };
} | null;

export type Entry = {
	action: KeyAction<Settings>;
	impl: DeckAction;
	settings: Settings;
	busy: boolean;
	held?: boolean; // hold-type buttons: key is down
	note?: { face: Partial<Face>; until: number }; // short-lived result overlay (N/A, ERROR)
	lastImg?: string;
};

export const entries = new Map<string, Entry>();
/** True for a step inside a Multi Action (it has no key of its own). */
const inMulti = (a: unknown): boolean => {
	const k = a as { isKey?: () => boolean; isInMultiAction?: () => boolean };
	return typeof k.isKey === "function" && k.isKey() && typeof k.isInMultiAction === "function" && k.isInMultiAction();
};
/** Multi Action steps whose key down has been handled (see DeckAction.multiPress). */
const multiDown = new Set<string>();
export let game: Game;
let requestPoll: () => void = () => undefined;

// "Not on this vehicle": unsupported.png if supplied, else the off/open icon dimmed, else the N/A placeholder.
export const unsupported = (key: string, label: string, alt: string[] = []): Face => ({
	key,
	state: "unsupported",
	alt,
	label,
	value: "N/A",
	color: C.none,
	dim: alt.length > 0,
});

// ---------------------------------------------------------------- base

export abstract class DeckAction extends SingletonAction<Settings> {
	/** False for game-level functions (pause, camera...) that work without a vehicle. */
	vehicle = true;
	/** True for read-only keys (gauges): a press with nothing to do is ignored instead of showing N/A. */
	passive = false;
	/** Auto Vehicle control keys: keep the vehicle's control list current while one is on screen. */
	autoControls = false;
	/** Face for the current vehicle status (ge = game-engine state, for game-level functions). */
	abstract face(s: VehicleStatus, settings: Settings, held?: boolean, ge?: GeStatus): Face;

	/** What a press does, given the current status (null = nothing to do on this vehicle). */
	abstract command(s: VehicleStatus, settings: Settings, ge?: GeStatus): Command;
	/** Hold-type buttons (horn, air suspension): command sent on key up. Presses are fire-and-forget. */
	release?(s: VehicleStatus, settings: Settings): Command;

	override onWillAppear(ev: WillAppearEvent<Settings>): void {
		// inside a Multi Action: no face of its own to draw, presses are handled by multiPress
		if (!ev.action.isKey() || inMulti(ev.action)) return;
		entries.set(ev.action.id, { action: ev.action, impl: this, settings: ev.payload.settings ?? {}, busy: false });
		ev.action.setTitle("");
		requestPoll();
		redraw(true);
	}

	override onWillDisappear(ev: WillDisappearEvent<Settings>): void {
		const e = entries.get(ev.action.id);
		if (e?.held) keyUp(e);
		entries.delete(ev.action.id);
	}

	override async onKeyUp(ev: KeyUpEvent<Settings>): Promise<void> {
		if (inMulti(ev.action)) return this.multiPress(ev.action.id, ev.payload?.settings ?? {}, "up");
		const e = entries.get(ev.action.id);
		if (e) await keyUp(e);
	}

	override onDidReceiveSettings(ev: DidReceiveSettingsEvent<Settings>): void {
		const e = entries.get(ev.action.id);
		if (e) {
			e.settings = ev.payload.settings ?? {};
			e.lastImg = undefined;
			redraw(true);
		}
	}

	/**
	 * A step of a Multi Action (e.g. a gravity preset, then Switch Profile back to the page): no key face,
	 * just do it. Some Stream Deck versions only send key up to a Multi Action's steps, so a key up
	 * without a key down does the press first.
	 */
	private async multiPress(id: string, st: Settings, phase: "down" | "up"): Promise<void> {
		const snap = game.snapshot;
		const ready = this.vehicle ? snap.link === "ok" && !!snap.status : snap.link !== "offline" && snap.link !== "limited";
		if (phase === "down" || !multiDown.has(id)) {
			multiDown.add(id);
			const cmd = ready ? this.command(snap.status ?? {}, st, snap.ge ?? {}) : null;
			if (cmd && !game.blocked(cmd)) {
				if (cmd.tool || cmd.vc) await run(cmd).catch((err) => streamDeck.logger.warn(`multi action step failed: ${(err as Error).message}`));
				else if (cmd.action) await game.resolve(cmd.action, cmd.args).catch(() => undefined);
				requestPoll();
			}
			if (phase === "down") return;
		}
		multiDown.delete(id);
		const rel = this.release?.(snap.status ?? {}, st);
		if (rel) await run(rel).catch(() => undefined);
	}

	override async onKeyDown(ev: KeyDownEvent<Settings>): Promise<void> {
		if (inMulti(ev.action)) return this.multiPress(ev.action.id, ev.payload?.settings ?? {}, "down");
		const e = entries.get(ev.action.id);
		if (!e || e.busy) return;
		const snap = game.snapshot;
		// OutGauge alone (limited) is read-only: presses need MCP
		const ready = this.vehicle ? snap.link === "ok" && !!snap.status : snap.link !== "offline" && snap.link !== "limited";
		if (!ready) {
			await ev.action.showAlert();
			return;
		}
		const cmd = this.command(snap.status ?? {}, e.settings, snap.ge ?? {});
		// through BeamDeckNG MP-MCP: if this server doesn't allow it, open its game menu page, or say so
		const why = game.blocked(cmd);
		if (why) return blockedPress(e, cmd, why);
		if (this.release || cmd?.tool || cmd?.vc) {
			if (!cmd) return this.passive || e.impl.autoControls ? undefined : note(e, { value: "N/A", color: C.none }, 1500);
			e.held = true;
			redraw(true);
			let ok = true;
			await run(cmd).catch((err) => {
				ok = false;
				if (err instanceof Blocked) return blockedPress(e, cmd, err.why, err.byGame);
				streamDeck.logger.warn(`${cmd.tool ?? cmd.action ?? cmd.vc?.id} failed: ${(err as Error).message}`);
				tell(e, `${labelOf(e)}: failed`);
			});
			if (ok) tell(e);
			if (!this.release) {
				// taps (game actions): show the press briefly, then pick up the new state
				setTimeout(() => {
					e.held = false;
					requestPoll();
					redraw(true);
				}, 150);
			}
			return;
		}
		if (!cmd) {
			if (!this.passive) note(e, { value: "N/A", color: C.none }, 1500);
			return;
		}
		e.busy = true;
		redraw(true);
		let r: ResolverResult | undefined;
		try {
			r = await game.resolve(cmd.action!, cmd.args);
			streamDeck.logger.info(`${cmd.action} ${JSON.stringify(cmd.args)} -> ${r.status}${r.detail ? " (" + r.detail + ")" : ""}`);
		} catch (err) {
			streamDeck.logger.warn(`${cmd.action} failed: ${(err as Error).message}`);
		}
		e.busy = false;
		if (!r || r.status === "failed") note(e, { value: "ERROR", color: C.alert, flash: true }, 2500);
		else if (r.status === "unsupported" && (r.detail === "BLOCKED" || r.detail === "NOT IN MP"))
			return blockedPress(e, cmd, r.detail === "BLOCKED" ? "blocked" : "unavailable");
		else if (r.status === "unsupported") note(e, { value: "N/A", color: C.none, sub: r.detail ?? undefined }, 2000);
		else if (r.status === "partial") note(e, { sub: "PARTIAL" }, 2000);
		requestPoll();
		redraw(true);
		tell(e);
	}
}

/** Fire-and-forget: a game tool, or a resolver action through the library already in the vehicle. */
export async function run(cmd: NonNullable<Command>): Promise<void> {
	if (cmd.vc) await game.vehicleControl(cmd.vc.id, cmd.vc.value, cmd.vc.phase, cmd.vc.t ?? 0);
	else if (cmd.tool) await game.tool(cmd.tool, cmd.args, cmd.mp);
	else await game.fire(cmd.action!, cmd.args);
}

export async function keyUp(e: Entry) {
	if (!e.held || !e.impl.release) return;
	e.held = false;
	redraw(true);
	const rel = e.impl.release?.(game.snapshot.status ?? {}, e.settings);
	// Always send the release, even if the game link dropped meanwhile, so nothing stays held.
	if (rel) await run(rel).catch(() => undefined);
}

/** Note for a press BeamDeckNG MP-MCP refused. */
const blockedNote = (why: "blocked" | "unavailable"): Partial<Face> => ({ value: why === "blocked" ? "BLOCKED BY MP" : "NOT IN MP", color: C.none });

const MENU_NAMES: Record<string, string> = {
	environment: "Environment", weather: "Weather", simulation: "Simulation", traffic: "Traffic",
	vehicle_config: "Vehicle configuration", vehicle_selector: "Vehicles", multiplayer: "Multiplayer",
};

/**
 * A press BeamDeckNG MP-MCP won't do directly. If the key has a game menu page for it, open that
 * instead (so the player changes it there, under whatever BeamMP and the server allow); else say so.
 */
export async function blockedPress(e: Entry, cmd: Command, why: "blocked" | "unavailable", byGame = false) {
	if (byGame) {
		// the game's own action filter (BeamMP, a game mode): MP-MCP already says so in the game
		note(e, blockedNote("blocked"), 1500);
		if (game.backend !== "addon") tell(e, `${labelOf(e)}: the game is blocking this right now`, "warning");
		return;
	}
	if (cmd?.menu && game.canMenu(cmd.menu)) {
		try {
			await game.openMenu(cmd.menu);
			note(e, { sub: "MENU" }, 1500);
			tell(e, `${labelOf(e)}: opened the ${MENU_NAMES[cmd.menu] ?? cmd.menu} menu (no direct control on this server)`);
			return;
		} catch (err) {
			streamDeck.logger.warn(`open_menu ${cmd.menu} failed: ${(err as Error).message}`);
		}
	}
	note(e, blockedNote(why), 1500);
	tell(e, `${labelOf(e)}: ${why === "blocked" ? "not allowed on this server" : "not available on BeamMP servers"}`, "warning");
}

/** The key's name for messages. */
export function labelOf(e: Entry): string {
	try {
		const f = e.impl.face({}, e.settings, false, {});
		return f.panel?.top ?? f.label;
	} catch {
		return "Stream Deck";
	}
}

/**
 * In-game message for a press (each key's "Show in-game message" setting, on unless unticked).
 * Without text: once the game has caught up, what the key now shows.
 */
export function tell(e: Entry, text?: string, icon = "info") {
	if (e.settings.msg === false || !game) return;
	if (text) return game.message(`Stream Deck: ${text}`, icon);
	setTimeout(() => {
		const f = faceFor(e, game.snapshot);
		const what = f.panel
			? `${f.panel.top ?? f.label}: ${f.panel.big}${f.panel.unit ? " " + f.panel.unit : ""}`
			: `${f.label}${f.value ? `: ${f.value}` : ""}${f.sub ? ` (${f.sub})` : ""}`;
		game.message(`Stream Deck: ${what}`, f.state === "error" ? "warning" : "info");
	}, 700);
}

export function note(e: Entry, face: Partial<Face>, ms: number) {
	e.note = { face, until: Date.now() + ms };
	redraw(true);
}

// ---------------------------------------------------------------- rendering

let phase = 0;

export function faceFor(e: Entry, snap: Snapshot): Face {
	// No game / no car / loading: the button still shows what it is (its idle icon, dimmed, or its name),
	// so a layout can be built without the game running.
	const idle = (state: string, text: string): Face => {
		let b: Face;
		try {
			b = e.impl.face({}, e.settings, false, {});
		} catch {
			b = { key: "common", state, label: "BeamDeckNG", value: text, color: C.none };
		}
		return { ...b, alt: [...(b.state === "unsupported" ? [] : [b.state]), ...(b.alt ?? [])], state: "unsupported", dim: true, flash: false, color: C.none, value: text, overlay: text, sub: undefined, ring: undefined, panel: b.glyph ? undefined : b.panel && { big: text, top: b.panel.top ?? b.label } };
	};
	let f: Face;
	if (snap.link === "offline") f = idle("offline", "NO GAME");
	else if (snap.link === "limited") {
		// MCP isn't answering (BeamMP server) but OutGauge is: keys it covers keep showing their state,
		// the rest say so instead of showing N/A, which would read as "not on this vehicle"
		f = e.impl.vehicle ? e.impl.face(snap.status ?? {}, e.settings, e.held, {}) : idle("limited", "NO MCP");
		if (f.state === "unsupported" || f.value === "N/A") f = idle("limited", "NO MCP");
	} else if (!e.impl.vehicle) f = e.impl.face(snap.status ?? {}, e.settings, e.held, snap.ge ?? {});
	else if (snap.link === "novehicle") f = idle("novehicle", "NO CAR");
	else if (!snap.status) f = idle("loading", "…");
	else {
		f = e.impl.face(snap.status, e.settings, e.held, snap.ge ?? {});
		if (snap.link === "paused") f = { ...f, dim: true, sub: "PAUSED" };
	}
	// Through BeamDeckNG MP-MCP, keys this server doesn't allow say so (read-only keys like gauges still show).
	if (game.backend === "addon" && !e.impl.passive && snap.link !== "offline" && snap.link !== "limited" && f.state !== "unsupported") {
		let cmd: Command = null;
		try {
			cmd = e.impl.command(snap.status ?? {}, e.settings, snap.ge ?? {});
		} catch {
			/* no command for this state */
		}
		const why = game.blocked(cmd);
		// a key that opens its game menu page instead keeps showing the live state
		if (why && cmd?.menu && game.canMenu(cmd.menu)) f = { ...f, sub: "OPENS MENU" };
		else if (why) f = idle(why, why === "blocked" ? "BLOCKED BY MP" : "NOT IN MP");
	}
	// the top title: the same in every mode (unless the face sets its own, e.g. "PATTERN 2/4")
	if (!f.head) {
		const t = titleFor(e.impl.manifestId, e.settings);
		if (t) f = { ...f, head: t };
	}
	if (e.busy) f = { ...f, flash: true };
	if (e.note) {
		if (Date.now() < e.note.until) {
			// short result notes (N/A, ERROR) are text keys
			f = { ...f, ...e.note.face, state: e.note.face.color === C.alert ? "error" : f.state, glyph: undefined, overlay: undefined };
			return f;
		}
		e.note = undefined;
	}
	return withGlyph(f);
}

export function redraw(force = false) {
	if (!game) return;
	for (const e of entries.values()) {
		const img = render(faceFor(e, game.snapshot), phase);
		if (force || img !== e.lastImg) {
			if (img !== e.lastImg) e.action.setImage(img).catch(() => undefined);
			e.lastImg = img;
		}
	}
}

// ---------------------------------------------------------------- loops

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function start(g: Game) {
	game = g;
	let wake: (() => void) | undefined;
	requestPoll = () => wake?.();

	// Poll the game only while some BeamDeckNG button is on screen.
	(async () => {
		for (;;) {
			if (entries.size > 0) {
				const before = game.mcpLink;
				await game.poll().catch(() => undefined);
				if (game.mcpLink !== "offline") await game.fetchGlyphs();
				// auto Vehicle control keys on screen: keep the vehicle's control list current
				if (game.snapshot.link === "ok" && [...entries.values()].some((x) => x.impl.autoControls))
					await game.refreshControls(game.snapshot.vid);
				if (game.mcpLink !== before) streamDeck.logger.info(`game link: ${before} -> ${game.mcpLink}`);
				redraw();
			}
			const wait = entries.size === 0 ? 1000 : game.mcpLink === "offline" ? 2000 : 250;
			await Promise.race([sleep(wait), new Promise<void>((r) => (wake = r))]);
			wake = undefined;
		}
	})();

	// OutGauge-only (MCP not answering): redraw as packets arrive, at most ~8 times a second.
	let ogDrawn = 0;
	game.og?.onData(() => {
		const now = Date.now();
		if (entries.size === 0 || now - ogDrawn < 125 || game.mcpLink !== "offline") return;
		ogDrawn = now;
		redraw();
	});

	// Flash clock: 2 Hz.
	setInterval(() => {
		phase ^= 1;
		redraw();
	}, 500);
}

// ---------------------------------------------------------------- actions

@action({ UUID: "com.yahms.beamdeckng.ignition" })
export class Ignition extends DeckAction {
	face(s: VehicleStatus, st: Settings = {}): Face {
		const f = this.ignFace(s);
		if (st.show !== "engine" || f.state === "unsupported") return f;
		// engine key: gear big, RPM under it, over the engine icon (green running, red stalled / off).
		// Shift light: yellow ring near the limit, red flashing at it (or when the game says shift).
		const g = s.g ?? {};
		const gear = s.running ? (g.gear ?? (g.gi === undefined ? "" : g.gi < 0 ? "R" : g.gi === 0 ? "N" : String(g.gi))) : "";
		const k = g.rpm !== undefined && g.maxrpm ? g.rpm / g.maxrpm : undefined;
		const shift = !s.running ? undefined : k === undefined ? (g.shift ? P.red : undefined) : k >= 0.96 || g.shift ? P.red : k >= 0.88 ? P.yellow : undefined;
		const rpm = s.running && g.rpm !== undefined ? String(Math.round(g.rpm / 50) * 50) : undefined;
		return {
			...f,
			label: "Engine",
			value: s.running ? (rpm ? `${rpm} RPM` : "RUN") : f.value,
			engine: s.running ? { gear, rpm, shift } : undefined,
			flash: f.flash || shift === P.red,
			frame: shift,
		};
	}
	private ignFace(s: VehicleStatus): Face {
		const base = { key: "ignition", label: "Ignition" };
		if (s.running) return { ...base, state: "running", value: "RUN", color: C.on };
		switch (s.ign) {
			case 3:
				return { ...base, state: "cranking", value: "START", color: C.warn, flash: true };
			case 2: // ignition on, engine not running: stalled (or not started yet)
				return { ...base, state: "stalled", alt: ["on"], value: "STALL", color: C.alert };
			case 1:
				return { ...base, state: "acc", value: "ACC", color: C.acc };
			case 0:
				return { ...base, state: "off", value: "OFF", color: C.off };
		}
		return unsupported("ignition", "Ignition", ["off"]);
	}
	command(s: VehicleStatus): Command {
		return { action: "engine", args: { state: s.running ? "stop" : "start" } };
	}
}

@action({ UUID: "com.yahms.beamdeckng.traction" })
export class Traction extends DeckAction {
	/** Default: cycle the car's drive modes (Comfort > Sport > ESC & TC Off...), like the game's own button.
	 *  Cars with TC but no drive modes fall back to TC on/off; "toggle" in the settings forces on/off. */
	private cycles(s: VehicleStatus, st: Settings) {
		return st.press !== "toggle" && !!s.tcMode;
	}
	face(s: VehicleStatus, st: Settings): Face {
		if (!s.hasTC && !s.tcMode) return unsupported("traction", "Traction", ["on"]);
		const mode = s.tcMode?.name ?? undefined;
		const on = s.tc !== false;
		// coloured ESC icon from the game's own colour for the mode: esc_blue (Comfort), esc_yellow (Sport),
		// esc_green (Drift), esc_grey (ESC & TC Off)...; cars without mode colours: blue = TC on, grey = off
		const esc = `esc_${(this.cycles(s, st) && colorName(s.tcMode?.color)) || (on ? "blue" : "grey")}`;
		if (this.cycles(s, st)) {
			// always the game's round ESC badge, in the game's colour for the mode (grey when ESC is off)
			const tint = on && s.tcMode?.color && /^#?[0-9a-f]{6}$/i.test(s.tcMode.color) ? `#${s.tcMode.color.replace("#", "")}` : on ? P.blue : P.off;
			return {
				glyph: ["powertrain_esc", "systems_esc"],
				tint,
				key: "traction",
				state: `mode_${s.tcMode!.key}`,
				alt: [esc, on ? "on" : "off"],
				label: "Drive mode",
				value: mode ?? "?",
				sub: on ? "TC on" : "TC off",
				color: on ? C.on : C.alert,
				overlay: mode,
			};
		}
		return { key: "traction", state: esc, alt: [on ? "on" : "off"], label: "Traction", value: on ? "TC ON" : "TC OFF", sub: mode, color: on ? C.on : C.alert };
	}
	command(s: VehicleStatus, st: Settings): Command {
		if (this.cycles(s, st)) return { action: "drive_mode_step", args: { which: "tc", dir: 1 } };
		if (!s.hasTC) return null;
		return { action: "traction", args: { state: s.tc === false ? "on" : "off" } };
	}
}

const DIFF_LABEL = { front: "Front diff", rear: "Rear diff", center: "Centre diff", all: "Diff locks", cycle: "Diff locks" };

// ---------------------------------------------------------------- diff cycle

/** One step of the diff cycle. center: "locked" / "open" for a lockable centre diff, or a controller mode key. */
export type DiffStep = { rear: boolean; front: boolean; center?: string; name?: string };

const CENTER_LOCK_KEYS = ["lock100", "locked", "lock"];
const CENTER_OPEN_KEYS = ["auto", "lock0", "unlocked", "open"];

/**
 * The cycle for this vehicle: rear only -> both -> front only -> none (each axle group = its diffs plus
 * the inter-axle diff between them; the centre locks whenever an axle is locked), then, if the centre
 * diff has several modes, each of those with the axles open, then round again.
 */
export function diffCycle(s: VehicleStatus): DiffStep[] {
	const hasR = !!s.diff?.rear, hasF = !!s.diff?.front;
	const modes = s.centerModes?.map((m) => m.key) ?? [];
	const ctrl = modes.length > 0;
	const hasC = !!s.diff?.center || ctrl;
	const lockKey = ctrl ? CENTER_LOCK_KEYS.find((k) => modes.includes(k)) ?? modes[modes.length - 1] : "locked";
	const openKey = ctrl ? CENTER_OPEN_KEYS.find((k) => modes.includes(k)) ?? modes[0] : "open";
	const c = (locked: boolean) => (hasC ? (locked ? lockKey : openKey) : undefined);
	const steps: DiffStep[] = [];
	if (hasR) steps.push({ rear: true, front: false, center: c(true) });
	if (hasR && hasF) steps.push({ rear: true, front: true, center: c(true) });
	if (hasF) steps.push({ rear: false, front: true, center: c(true) });
	if (steps.length || hasC) steps.push({ rear: false, front: false, center: c(false) });
	if (!hasR && !hasF && hasC && !ctrl) steps.unshift({ rear: false, front: false, center: "locked" }); // centre only: lock / open
	if (ctrl && modes.length > 2) {
		for (const m of s.centerModes!) {
			if (m.key !== openKey) steps.push({ rear: false, front: false, center: m.key, name: m.name });
		}
	} else if (ctrl && !hasR && !hasF) {
		steps.unshift({ rear: false, front: false, center: lockKey });
	}
	return steps;
}

function stepIndex(s: VehicleStatus, steps: DiffStep[]): number {
	const rL = s.diff?.rear === "locked", fL = s.diff?.front === "locked";
	const ck = s.centerModes?.length ? s.centerMode?.key ?? undefined : s.diff?.center === "locked" ? "locked" : s.diff?.center ? "open" : undefined;
	return steps.findIndex((st) => st.rear === rL && st.front === fL && (st.center === undefined || st.center === ck));
}

function allDiffs(s: VehicleStatus): DiffState {
	const v = [s.diff?.front, s.diff?.rear, s.diff?.center].filter((x) => x);
	if (v.length === 0) return null;
	if (v.every((x) => x === "locked")) return "locked";
	if (v.every((x) => x === "open" || x === "auto")) return "open";
	return "partial";
}

/** "F+R", "R", "OPEN"... which diffs on this vehicle are locked. */
function lockedList(s: VehicleStatus): string {
	const parts: string[] = [];
	if (s.diff?.front === "locked") parts.push("F");
	if (s.diff?.center === "locked") parts.push("C");
	if (s.diff?.rear === "locked") parts.push("R");
	return parts.length ? parts.join("+") : "OPEN";
}

// Icons are shared across scopes (imgs/states/diff/), with the scope or locked list as an overlay:
// locked = solid centre, open = empty centre, lsd = X (an open centre diff = full-time 4WD).
@action({ UUID: "com.yahms.beamdeckng.difflock" })
export class DiffLock extends DeckAction {
	face(s: VehicleStatus, st: Settings): Face {
		const scope = st.scope ?? "rear";
		const key = `diff_${scope}`;
		const base = "diff";
		const label = DIFF_LABEL[scope];
		const multi = scope === "all" || scope === "cycle";
		const cur = multi ? allDiffs(s) : s.diff?.[scope];
		// one diff: the title says which, the bottom says how it's set; all / cycle: which are locked
		let overlay = multi ? lockedList(s) : undefined;
		if (scope === "cycle") {
			if (diffCycle(s).length < 2) return { ...unsupported(key, label, ["open"]), base };
			// centre-mode steps: show the centre mode (e.g. "LOCK 50%") instead of OPEN
			const steps = diffCycle(s);
			const i = stepIndex(s, steps);
			if (i >= 0 && steps[i].name) overlay = steps[i].name;
		}
		const sub = scope === "center" ? (s.centerMode?.name ?? undefined) : undefined;
		const f = { key, base, label, overlay, sub };
		const unlocked = scope === "center" ? { state: "lsd", alt: ["open"] } : { state: "open" };
		switch (cur) {
			case "locked":
				return { ...f, state: "locked", value: "LOCKED", color: C.warn };
			case "open":
				return { ...f, ...unlocked, value: "OPEN", color: C.off };
			case "auto":
				return { ...f, ...unlocked, value: "AUTO", color: C.off };
			case "partial":
				return { ...f, state: "partial", value: "PARTIAL", color: C.acc };
			case "lsd":
				// limited-slip (e.g. the Procyon Centauri's centre): not locked, not fully open
				return { ...f, ...unlocked, value: "LSD", color: C.off };
		}
		return { ...unsupported(key, label, [unlocked.state, "open"]), base };
	}
	command(s: VehicleStatus, st: Settings): Command {
		const scope = st.scope ?? "rear";
		if (scope === "cycle") {
			const steps = diffCycle(s);
			if (steps.length < 2) return null;
			const next = steps[(stepIndex(s, steps) + 1) % steps.length]; // unknown state (-1) -> first step
			const { name: _n, ...args } = next;
			return { action: "diff_combo", args };
		}
		const cur = scope === "all" ? allDiffs(s) : s.diff?.[scope];
		if (!cur) return null;
		return { action: "diff_lock", args: { scope, state: cur === "locked" ? "open" : "locked" } };
	}
}

@action({ UUID: "com.yahms.beamdeckng.range" })
export class Range extends DeckAction {
	face(s: VehicleStatus): Face {
		const base = { key: "range", label: "Range" };
		if (s.range === "low") return { ...base, state: "low", value: "LOW", color: C.warn };
		if (s.range === "high") return { ...base, state: "high", value: "HIGH", color: C.off };
		if (s.range === "partial") return { ...base, state: "partial", value: "MIXED", color: C.acc };
		return unsupported("range", "Range", ["high"]);
	}
	command(s: VehicleStatus): Command {
		if (!s.range) return null;
		return { action: "range", args: { state: s.range === "low" ? "high" : "low" } };
	}
}

@action({ UUID: "com.yahms.beamdeckng.drive" })
export class Drive extends DeckAction {
	face(s: VehicleStatus): Face {
		const base = { key: "drive", label: "Drive" };
		if (s.drive === "4wd") return { ...base, state: "4wd", value: "4WD", color: C.on };
		if (s.drive === "2wd") return { ...base, state: "2wd", value: "2WD", color: C.off };
		if (s.drive === "partial") return { ...base, state: "partial", value: "MIXED", color: C.acc };
		return unsupported("drive", "Drive", ["2wd"]);
	}
	command(s: VehicleStatus): Command {
		if (!s.drive) return null;
		return { action: "drive", args: { state: s.drive === "4wd" ? "2wd" : "4wd" } };
	}
}

// ---------------------------------------------------------------- group 1: lights, brakes, body, cruise

/** Two-state button: `off` / `on` states (icon and colour in glyphmap.ts). */
function binary(key: string, label: string, on: boolean | undefined, extra: Partial<Face> = {}): Face {
	if (on === undefined) return unsupported(key, label, ["off"]);
	return on
		? { key, label, state: "on", value: "ON", color: C.warn, ...extra }
		: { key, label, state: "off", value: "OFF", color: C.off, ...extra };
}
const isOn = (v: number | boolean | undefined) => (v === undefined || v === null ? undefined : v === true || Number(v) >= 0.5);

@action({ UUID: "com.yahms.beamdeckng.parkingbrake" })
export class ParkingBrake extends DeckAction {
	face(s: VehicleStatus): Face {
		return binary("pbrake", "Park brake", s.pbrake);
	}
	command(s: VehicleStatus): Command {
		if (s.pbrake === undefined) return null;
		return { action: "parking_brake", args: { state: s.pbrake ? "off" : "on" } };
	}
}

const LIGHT_STATES = ["off", "low", "high"] as const;

@action({ UUID: "com.yahms.beamdeckng.headlights" })
export class Headlights extends DeckAction {
	face(s: VehicleStatus): Face {
		if (s.lights === undefined) return unsupported("lights", "Headlights", ["off"]);
		const st = LIGHT_STATES[s.lights] ?? "off";
		const color = { off: C.off, low: C.on, high: C.busy }[st];
		return { key: "lights", label: "Headlights", state: st, value: st.toUpperCase(), color };
	}
	command(s: VehicleStatus, st: Settings): Command {
		if (s.lights === undefined) return null;
		const cur = s.lights;
		let next: number;
		if (st.press === "low") next = cur === 0 ? 1 : 0; // low beam on/off
		else if (st.press === "high") next = cur === 2 ? 1 : 2; // high beam flick
		else next = (cur + 1) % 3; // off -> low -> high -> off
		return { action: "lights", args: { state: LIGHT_STATES[next] } };
	}
}

@action({ UUID: "com.yahms.beamdeckng.fog" })
export class FogLights extends DeckAction {
	face(s: VehicleStatus): Face {
		return binary("fog", "Fog lights", isOn(s.fog));
	}
	command(s: VehicleStatus): Command {
		if (s.fog === undefined) return null;
		return { action: "fog", args: { state: isOn(s.fog) ? "off" : "on" } };
	}
}

@action({ UUID: "com.yahms.beamdeckng.hazards" })
export class Hazards extends DeckAction {
	face(s: VehicleStatus): Face {
		const on = isOn(s.hazard);
		return binary("hazard", "Hazards", on, { flash: on }); // blinks while on
	}
	command(s: VehicleStatus): Command {
		return { action: "hazard", args: { state: isOn(s.hazard) ? "off" : "on" } };
	}
}

@action({ UUID: "com.yahms.beamdeckng.indicator" })
export class Indicator extends DeckAction {
	face(s: VehicleStatus, st: Settings): Face {
		const side = st.side ?? "left";
		const on = isOn(side === "left" ? s.sigL : s.sigR);
		return binary(`indicator_${side}`, side === "left" ? "Left" : "Right", on, { flash: on });
	}
	command(s: VehicleStatus, st: Settings): Command {
		const side = st.side ?? "left";
		const on = isOn(side === "left" ? s.sigL : s.sigR);
		if (on === undefined) return null;
		return { action: "signal", args: { side: on ? "off" : side } };
	}
}

@action({ UUID: "com.yahms.beamdeckng.lightbar" })
export class Lightbar extends DeckAction {
	face(s: VehicleStatus, st: Settings): Face {
		// flash pattern key: shows the pattern, press for the next one
		if (st.press === "pattern") {
			if (!s.lbc || !s.lbm) return unsupported("lightbar", "Lightbar pattern", ["off"]);
			const on = Math.round(s.lightbar ?? 0) > 0;
			return {
				key: "lightbar", label: "Lightbar pattern", state: on ? "pattern" : "pattern_off", alt: ["off"],
				value: (s.lbn ?? `PATTERN ${s.lbm}`).toUpperCase(), sub: `${s.lbm} OF ${s.lbc}`, color: on ? C.warn : C.off,
			};
		}
		if (s.lightbar === undefined) return unsupported("lightbar", "Lightbar", ["off"]);
		const n = Math.round(s.lightbar);
		const state = n === 0 ? "off" : `mode${n}`;
		// 1 = lights, 2 = lights and siren
		const value = n === 0 ? "OFF" : n === 1 ? "LIGHTS" : n === 2 ? "LIGHTS+SIREN" : `MODE ${n}`;
		return { key: "lightbar", label: "Lightbar", state, alt: ["mode1"], value, color: n ? C.warn : C.off };
	}
	command(s: VehicleStatus, st: Settings): Command {
		if (st.press === "pattern") return s.lbc ? { action: "lightbar_mode", args: {} } : null;
		if (s.lightbar === undefined) return null;
		return { action: "lightbar", args: { state: (Math.round(s.lightbar) + 1) % (s.lbs === false ? 2 : 3) } };
	}
}

@action({ UUID: "com.yahms.beamdeckng.horn" })
export class Horn extends DeckAction {
	face(_s: VehicleStatus, _st: Settings, held?: boolean): Face {
		return { ...binary("horn", "Horn", !!held), value: "" }; // the title says it all
	}
	command(): Command {
		return { action: "horn", args: { state: 1 } };
	}
	override release(): Command {
		return { action: "horn", args: { state: 0 } };
	}
}

export const unitOf = (st: Settings) => (st.units === "mph" ? { k: 2.23694, name: "mph" } : { k: 3.6, name: "km/h" });

@action({ UUID: "com.yahms.beamdeckng.cruise" })
export class Cruise extends DeckAction {
	face(s: VehicleStatus, st: Settings): Face {
		const op = st.op ?? "toggle";
		const key = op === "toggle" ? "cruise" : `cruise_${op}`;
		const label = { toggle: "Cruise", set: "Cruise set", plus: "Cruise +", minus: "Cruise −" }[op];
		if (!s.cruise) return unsupported(key, label, ["off", "idle"]);
		const u = unitOf(st);
		const spd = s.cruise.speed && s.cruise.speed > 0.5 ? String(Math.round(s.cruise.speed * u.k)) : undefined;
		if (op !== "toggle") return { key, label, state: "idle", value: op.toUpperCase(), color: C.off, overlay: s.cruise.on ? spd : undefined };
		return s.cruise.on
			? { key, label, state: "on", value: spd ?? "ON", sub: u.name, color: C.warn, overlay: spd }
			: { key, label, state: "off", value: "OFF", sub: spd ? `set ${spd}` : undefined, color: C.off };
	}
	command(s: VehicleStatus, st: Settings): Command {
		if (!s.cruise) return null;
		const op = st.op ?? "toggle";
		const step = (Number(st.step) || 5) / unitOf(st).k; // display units -> m/s
		return { action: "cruise", args: { op, step } };
	}
}

const RET_NAMES = ["", "AUTO", "OFF", "20%", "40%", "60%", "80%", "100%"];

@action({ UUID: "com.yahms.beamdeckng.enginebrake" })
export class EngineBrake extends DeckAction {
	face(s: VehicleStatus): Face {
		if (s.ebrake === undefined) return unsupported("ebrake", "Engine brake", ["off"]);
		const n = s.ebrake;
		return { key: "ebrake", label: "Engine brake", state: n ? `level${n}` : "off", alt: n ? ["on"] : [], value: n ? `LVL ${n}` : "OFF", color: n ? C.warn : C.off, overlay: n ? String(n) : undefined };
	}
	command(s: VehicleStatus): Command {
		if (s.ebrake === undefined) return null;
		const next = (s.ebrake + 1) % 4; // off -> 1 -> 2 -> 3 -> off
		return { action: "engine_brake", args: next ? { state: "on", level: next } : { state: "off" } };
	}
}

@action({ UUID: "com.yahms.beamdeckng.retarder" })
export class Retarder extends DeckAction {
	face(s: VehicleStatus): Face {
		if (s.retarder === undefined) return unsupported("retarder", "Retarder", ["off"]);
		const i = s.retarder;
		const name = RET_NAMES[i] ?? String(i);
		const state = i === 1 ? "auto" : i === 2 ? "off" : "on";
		return { key: "retarder", label: "Retarder", state, value: name, color: i === 2 ? C.off : C.warn, overlay: i === 2 ? undefined : name };
	}
	command(s: VehicleStatus): Command {
		if (s.retarder === undefined) return null;
		const i = s.retarder;
		const next = i === 2 ? 1 : i === 1 ? 3 : i >= 7 ? 2 : i + 1; // off -> auto -> 20..100% -> off
		const args = next === 1 ? { state: "auto" } : next === 2 ? { state: "off" } : { percent: (next - 2) * 20 };
		return { action: "retarder", args };
	}
}

@action({ UUID: "com.yahms.beamdeckng.airsuspension" })
export class AirSuspension extends DeckAction {
	face(s: VehicleStatus, st: Settings, held?: boolean): Face {
		const dir = st.dir ?? "raise";
		const key = `air_${dir}`;
		const label = dir === "raise" ? "Air up" : "Air down";
		if (!s.air) return unsupported(key, label, ["off"]);
		return { ...binary(key, label, !!held), value: dir === "raise" ? "RAISE" : "LOWER" };
	}
	command(s: VehicleStatus, st: Settings): Command {
		if (!s.air) return null;
		return { action: "air_suspension", args: { state: st.dir ?? "raise" } };
	}
	override release(): Command {
		return { action: "air_suspension", args: { state: "stop" } };
	}
}

@action({ UUID: "com.yahms.beamdeckng.doors" })
export class Doors extends DeckAction {
	private cur(s: VehicleStatus, part: string): boolean | undefined {
		if (part === "hood") return s.hood;
		if (part === "trunk") return s.trunk;
		if (!s.doors) return undefined;
		if (part === "doors") return (s.doorsOpen ?? 0) > 0;
		return s.doors[part];
	}
	face(s: VehicleStatus, st: Settings): Face {
		const part = st.part ?? "doors";
		const key = part.length === 2 ? "door" : part;
		const label = { doors: "Doors", hood: "Bonnet", trunk: "Boot" }[part as string] ?? `${part} door`;
		const open = this.cur(s, part);
		if (open === undefined) return unsupported(key, label, ["closed"]);
		const overlay = part.length === 2 ? part : part === "doors" && open && s.doorsOpen ? `${s.doorsOpen} OPEN` : undefined;
		return open
			? { key, label, state: "open", value: "OPEN", color: C.warn, overlay }
			: { key, label, state: "closed", value: "SHUT", color: C.off, overlay };
	}
	command(s: VehicleStatus, st: Settings): Command {
		const part = st.part ?? "doors";
		const open = this.cur(s, part);
		if (open === undefined) return null;
		const state = open ? "close" : "open";
		if (part === "hood" || part === "trunk") return { action: "body", args: { part, state } };
		if (part === "doors") return { action: "body", args: { part: "doors", which: "all", state } };
		return { action: "body", args: { part: "door", which: part, state } };
	}
}

// ---------------------------------------------------------------- boost: nitrous and JATO

const pct = (r?: number) => (typeof r === "number" ? `${Math.round(r * 100)}%` : undefined);
const HOLD_MS = 350;

/**
 * Nitrous, default "combined": tap = arm/disarm (armed nitrous sprays by itself at full throttle above
 * the cut-in rpm), hold = manual spray (override) for as long as the key is down.
 */
@action({ UUID: "com.yahms.beamdeckng.nitrous" })
export class Nitrous extends DeckAction {
	private timers = new Map<string, { t: ReturnType<typeof setTimeout>; spraying: boolean }>();

	face(s: VehicleStatus, _st: Settings, held?: boolean): Face {
		if (!s.n2o) return unsupported("n2o", "Nitrous", ["off"]);
		const spraying = s.n2o.active || s.n2o.override || !!held;
		const overlay = pct(s.n2o.bottle);
		if (spraying) return { key: "n2o", label: "Nitrous", state: "spray", alt: ["armed"], value: "SPRAY", color: C.on, flash: true, overlay };
		if (s.n2o.armed) return { key: "n2o", label: "Nitrous", state: "armed", value: "ARMED", color: C.busy, overlay };
		return { key: "n2o", label: "Nitrous", state: "off", value: "OFF", color: C.off, overlay };
	}
	command(s: VehicleStatus): Command {
		return s.n2o ? { action: "n2o", args: { op: "toggle" } } : null;
	}

	override async onKeyDown(ev: KeyDownEvent<Settings>): Promise<void> {
		const e = entries.get(ev.action.id);
		const s = game.snapshot.status;
		if (!e || e.busy) return;
		if (game.snapshot.link !== "ok" || !s?.n2o) return void (s && !s.n2o ? note(e, { value: "N/A", color: C.none }, 1500) : ev.action.showAlert());
		const why = game.blocked({ action: "n2o", args: {} });
		if (why) return blockedPress(e, { action: "n2o", args: {} }, why);
		const mode = e.settings.press ?? "combined";
		if (mode === "arm") return super.onKeyDown(ev);
		const startSpray = () => {
			const h = this.timers.get(ev.action.id);
			if (h) h.spraying = true;
			e.held = true;
			redraw(true);
			game.fire("n2o", { op: "spray", state: 1 }).catch(() => undefined);
		};
		if (mode === "spray") {
			this.timers.set(ev.action.id, { t: setTimeout(() => undefined, 0), spraying: true });
			return startSpray();
		}
		this.timers.set(ev.action.id, { t: setTimeout(startSpray, HOLD_MS), spraying: false });
	}

	override async onKeyUp(ev: KeyUpEvent<Settings>): Promise<void> {
		const e = entries.get(ev.action.id);
		const h = this.timers.get(ev.action.id);
		if (!e || !h) return;
		clearTimeout(h.t);
		this.timers.delete(ev.action.id);
		if (h.spraying) {
			e.held = false;
			redraw(true);
			await game.fire("n2o", { op: "spray", state: 0 }).catch(() => undefined);
			return;
		}
		// short tap: arm / disarm through the normal verified path
		await super.onKeyDown(ev as unknown as KeyDownEvent<Settings>);
	}

	override onWillDisappear(ev: WillDisappearEvent<Settings>): void {
		const h = this.timers.get(ev.action.id);
		if (h) {
			clearTimeout(h.t);
			if (h.spraying) game.fire("n2o", { op: "spray", state: 0 }).catch(() => undefined);
			this.timers.delete(ev.action.id);
		}
		super.onWillDisappear(ev);
	}
}

/** JATO rockets: hold to fire (default) or toggle. Shows remaining fuel. */
@action({ UUID: "com.yahms.beamdeckng.jato" })
export class Jato extends DeckAction {
	face(s: VehicleStatus, _st: Settings, held?: boolean): Face {
		if (!s.jato) return unsupported("jato", "JATO", ["off"]);
		const on = s.jato.on || s.jato.firing || !!held;
		const empty = (s.jato.fuel ?? 1) <= 0;
		return {
			key: "jato",
			label: "JATO",
			state: empty ? "empty" : on ? "on" : "off",
			alt: ["off"],
			value: empty ? "EMPTY" : on ? "FIRE" : "READY",
			color: on ? C.warn : C.off,
			flash: on && !empty,
			dim: empty,
			overlay: pct(s.jato.fuel),
		};
	}
	command(s: VehicleStatus, st: Settings): Command {
		if (!s.jato) return null;
		if (st.press === "toggle") return { action: "jato", args: { state: s.jato.on ? "off" : "on" } };
		return { action: "jato", args: { state: "on" } };
	}
	override release(_s: VehicleStatus, st: Settings): Command {
		return st.press === "toggle" ? null : { action: "jato", args: { state: "off" } };
	}
}
