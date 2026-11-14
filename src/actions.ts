import streamDeck, {
	action,
	DidReceiveSettingsEvent,
	KeyAction,
	KeyDownEvent,
	SingletonAction,
	WillAppearEvent,
	WillDisappearEvent,
} from "@elgato/streamdeck";
import { DiffState, Game, ResolverResult, Snapshot, VehicleStatus } from "./game";
import { C, Face, render } from "./icons";

type Settings = { scope?: "front" | "rear" | "center" | "all"; press?: "toggle" | "cycle" };
type Command = { action: string; args: object } | null;

type Entry = {
	action: KeyAction<Settings>;
	impl: DeckAction;
	settings: Settings;
	busy: boolean;
	note?: { face: Partial<Face>; until: number }; // short-lived result overlay (N/A, ERROR)
	lastImg?: string;
};

const entries = new Map<string, Entry>();
let game: Game;
let requestPoll: () => void = () => undefined;

// "Not on this vehicle": unsupported.png if supplied, else the off/open icon dimmed, else the N/A placeholder.
const unsupported = (key: string, label: string, alt: string[] = []): Face => ({
	key,
	state: "unsupported",
	alt,
	label,
	value: "N/A",
	color: C.none,
	dim: alt.length > 0,
});

// ---------------------------------------------------------------- base

abstract class DeckAction extends SingletonAction<Settings> {
	/** Face for the current vehicle status. */
	abstract face(s: VehicleStatus, settings: Settings): Face;
	/** What a press does, given the current status (null = nothing to do on this vehicle). */
	abstract command(s: VehicleStatus, settings: Settings): Command;

	override onWillAppear(ev: WillAppearEvent<Settings>): void {
		if (!ev.action.isKey()) return;
		entries.set(ev.action.id, { action: ev.action, impl: this, settings: ev.payload.settings ?? {}, busy: false });
		ev.action.setTitle("");
		requestPoll();
		redraw(true);
	}

	override onWillDisappear(ev: WillDisappearEvent<Settings>): void {
		entries.delete(ev.action.id);
	}

	override onDidReceiveSettings(ev: DidReceiveSettingsEvent<Settings>): void {
		const e = entries.get(ev.action.id);
		if (e) {
			e.settings = ev.payload.settings ?? {};
			e.lastImg = undefined;
			redraw(true);
		}
	}

	override async onKeyDown(ev: KeyDownEvent<Settings>): Promise<void> {
		const e = entries.get(ev.action.id);
		if (!e || e.busy) return;
		const snap = game.snapshot;
		if (snap.link !== "ok" || !snap.status) {
			await ev.action.showAlert();
			return;
		}
		const cmd = this.command(snap.status, e.settings);
		if (!cmd) {
			note(e, { value: "N/A", color: C.none }, 1500);
			return;
		}
		e.busy = true;
		redraw(true);
		let r: ResolverResult | undefined;
		try {
			r = await game.resolve(cmd.action, cmd.args);
			streamDeck.logger.info(`${cmd.action} ${JSON.stringify(cmd.args)} -> ${r.status}${r.detail ? " (" + r.detail + ")" : ""}`);
		} catch (err) {
			streamDeck.logger.warn(`${cmd.action} failed: ${(err as Error).message}`);
		}
		e.busy = false;
		if (!r || r.status === "failed") note(e, { value: "ERROR", color: C.alert, flash: true }, 2500);
		else if (r.status === "unsupported") note(e, { value: "N/A", color: C.none, sub: r.detail ?? undefined }, 2000);
		else if (r.status === "partial") note(e, { sub: "PARTIAL" }, 2000);
		requestPoll();
		redraw(true);
	}
}

function note(e: Entry, face: Partial<Face>, ms: number) {
	e.note = { face, until: Date.now() + ms };
	redraw(true);
}

// ---------------------------------------------------------------- rendering

let phase = 0;

function faceFor(e: Entry, snap: Snapshot): Face {
	const common = (state: string, value: string): Face => ({ key: "common", state, label: "BeamDeckNG", value, color: C.none });
	let f: Face;
	if (snap.link === "offline") f = common("offline", "NO GAME");
	else if (snap.link === "novehicle") f = common("novehicle", "NO CAR");
	else if (!snap.status) f = common("loading", "…");
	else {
		f = e.impl.face(snap.status, e.settings);
		if (snap.link === "paused") f = { ...f, dim: true, sub: "PAUSED" };
	}
	if (e.busy) f = { ...f, flash: true };
	if (e.note) {
		if (Date.now() < e.note.until) f = { ...f, ...e.note.face, state: e.note.face.color === C.alert ? "error" : f.state };
		else e.note = undefined;
	}
	return f;
}

function redraw(force = false) {
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
				const before = game.snapshot.link;
				await game.poll().catch(() => undefined);
				if (game.snapshot.link !== before) streamDeck.logger.info(`game link: ${before} -> ${game.snapshot.link}`);
				redraw();
			}
			const wait = entries.size === 0 ? 1000 : game.snapshot.link === "offline" ? 2000 : 250;
			await Promise.race([sleep(wait), new Promise<void>((r) => (wake = r))]);
			wake = undefined;
		}
	})();

	// Flash clock: 2 Hz.
	setInterval(() => {
		phase ^= 1;
		redraw();
	}, 500);
}

// ---------------------------------------------------------------- actions

@action({ UUID: "com.yahms.beamdeckng.ignition" })
export class Ignition extends DeckAction {
	face(s: VehicleStatus): Face {
		const base = { key: "ignition", label: "Ignition" };
		if (s.running) return { ...base, state: "running", value: "RUN", color: C.on };
		switch (s.ign) {
			case 3:
				return { ...base, state: "cranking", value: "START", color: C.warn, flash: true };
			case 2:
				return { ...base, state: "on", value: "ON", color: C.warn };
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
	face(s: VehicleStatus, st: Settings): Face {
		if (!s.hasTC && !s.tcMode) return unsupported("traction", "Traction", ["on"]);
		const mode = s.tcMode?.name ?? undefined;
		const on = s.tc !== false;
		// In cycle mode, imgs/states/traction/mode_<key>.png wins over on/off.png.
		const state = st.press === "cycle" && s.tcMode?.key ? `mode_${s.tcMode.key}` : on ? "on" : "off";
		return {
			key: "traction",
			state,
			alt: [on ? "on" : "off"],
			label: "Traction",
			value: st.press === "cycle" && mode ? mode : on ? "TC ON" : "TC OFF",
			sub: st.press === "cycle" ? (on ? "TC on" : "TC off") : mode,
			color: on ? C.on : C.alert,
		};
	}
	command(s: VehicleStatus, st: Settings): Command {
		if (st.press === "cycle") return s.tcMode ? { action: "drive_mode_step", args: { which: "tc", dir: 1 } } : null;
		if (!s.hasTC) return null;
		return { action: "traction", args: { state: s.tc === false ? "on" : "off" } };
	}
}

const DIFF_LABEL = { front: "Front diff", rear: "Rear diff", center: "Centre diff", all: "Diff locks" };

function allDiffs(s: VehicleStatus): DiffState {
	const v = [s.diff?.front, s.diff?.rear, s.diff?.center].filter((x) => x);
	if (v.length === 0) return null;
	if (v.every((x) => x === "locked")) return "locked";
	if (v.every((x) => x === "open" || x === "auto")) return "open";
	return "partial";
}

@action({ UUID: "com.yahms.beamdeckng.difflock" })
export class DiffLock extends DeckAction {
	face(s: VehicleStatus, st: Settings): Face {
		const scope = st.scope ?? "rear";
		const key = `diff_${scope}`;
		const label = DIFF_LABEL[scope];
		const cur = scope === "all" ? allDiffs(s) : s.diff?.[scope];
		const sub = scope === "center" ? (s.centerMode?.name ?? undefined) : undefined;
		switch (cur) {
			case "locked":
				return { key, state: "locked", label, value: "LOCKED", sub, color: C.warn };
			case "open":
				return { key, state: "open", label, value: "OPEN", sub, color: C.off };
			case "auto":
				return { key, state: "auto", alt: ["open"], label, value: "AUTO", sub, color: C.off };
			case "partial":
				return { key, state: "partial", label, value: "PARTIAL", sub, color: C.acc };
		}
		return unsupported(key, label, ["open"]);
	}
	command(s: VehicleStatus, st: Settings): Command {
		const scope = st.scope ?? "rear";
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
