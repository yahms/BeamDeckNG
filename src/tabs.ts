// Tabs and slots.
//
// Tab buttons (Game / Car / Camera) pick what the Slot buttons show. Slots are filled in order from
// the tab's list, skipping anything the current vehicle doesn't have, so a page never has N/A gaps.
// Pressing the active tab again flips to its next page when the list doesn't fit.
//
// The Car tab starts with the game's own powertrain bar for this vehicle (transfer case, diffs,
// range, ESC modes...), so it adapts to every car, including modded ones.

import { action, DidReceiveSettingsEvent, KeyDownEvent, KeyUpEvent, WillAppearEvent } from "@elgato/streamdeck";
import * as A from "./actions";
import { Command, DeckAction, Entry, entries, game, redraw, Settings } from "./actions";
import { GeStatus, PtButton, VehicleStatus } from "./game";
import { GameFunction, GAME_FUNCS } from "./gamefns";
import { C, Face } from "./icons";

// ---------------------------------------------------------------- the game's powertrain bar

const ptColor = (b: PtButton) => (b.color && /^#?[0-9a-f]{6}$/i.test(b.color) ? `#${b.color.replace("#", "")}` : undefined);

function ptFace(b: PtButton | undefined, label: string): Face {
	if (!b) return A.unsupported("pt", label, []);
	const color = ptColor(b);
	return {
		key: "pt",
		state: b.icon ?? "unknown",
		label: b.name ?? label,
		value: (b.name ?? b.id).toUpperCase(),
		color: color ?? C.off,
		// the game draws a coloured ring (e.g. ESC in a non-default mode, a JATO/N2O level)
		ring: color ? { color, value: typeof b.ring === "number" ? b.ring : 1 } : undefined,
	};
}

/** One button of the game's powertrain bar, by id (used by tab slots). */
class PtById extends DeckAction {
	constructor(private id: string) {
		super();
	}
	face(s: VehicleStatus): Face {
		return ptFace(s.pt?.find((b) => b.id === this.id), "Powertrain");
	}
	command(s: VehicleStatus): Command {
		return s.pt?.some((b) => b.id === this.id) ? { action: "pt_click", args: { id: this.id } } : null;
	}
}

/** Standalone button: the Nth button of the game's powertrain bar for whatever vehicle you're in. */
@action({ UUID: "com.yahms.beamdeckng.powertrain" })
export class Powertrain extends DeckAction {
	private pick(s: VehicleStatus, st: Settings) {
		return s.pt?.[Math.max(1, Number(st.index) || 1) - 1];
	}
	face(s: VehicleStatus, st: Settings): Face {
		return ptFace(this.pick(s, st), `Powertrain ${Number(st.index) || 1}`);
	}
	command(s: VehicleStatus, st: Settings): Command {
		const b = this.pick(s, st);
		return b ? { action: "pt_click", args: { id: b.id } } : null;
	}
}

// ---------------------------------------------------------------- functions usable in slots

type Fn = { impl: DeckAction; settings: Settings };
const FUNCS: Record<string, Fn> = {};
const def = (id: string, impl: DeckAction, settings: Settings = {}) => (FUNCS[id] = { impl, settings });

const ign = new A.Ignition(), trac = new A.Traction(), diff = new A.DiffLock(), rng = new A.Range(), drv = new A.Drive();
const ind = new A.Indicator(), cru = new A.Cruise(), air = new A.AirSuspension(), doors = new A.Doors();
def("ignition", ign);
def("traction", trac);
for (const scope of ["front", "rear", "center", "all"] as const) def(`diff_${scope}`, diff, { scope });
def("range", rng);
def("drive", drv);
def("pbrake", new A.ParkingBrake());
def("lights", new A.Headlights());
def("fog", new A.FogLights());
def("hazard", new A.Hazards());
def("ind_left", ind, { side: "left" });
def("ind_right", ind, { side: "right" });
def("lightbar", new A.Lightbar());
def("horn", new A.Horn());
def("cruise", cru, { op: "toggle" });
def("cruise_set", cru, { op: "set" });
def("cruise_plus", cru, { op: "plus" });
def("cruise_minus", cru, { op: "minus" });
def("ebrake", new A.EngineBrake());
def("retarder", new A.Retarder());
def("air_raise", air, { dir: "raise" });
def("air_lower", air, { dir: "lower" });
def("doors", doors, { part: "doors" });
def("hood", doors, { part: "hood" });
def("trunk", doors, { part: "trunk" });
def("n2o", new A.Nitrous(), { press: "combined" });
def("jato", new A.Jato(), { press: "hold" });
const gfn = new GameFunction();
for (const id of Object.keys(GAME_FUNCS)) def(`g:${id}`, gfn, { fn: id });

const ptCache = new Map<string, PtById>();
const ptFn = (id: string): Fn => {
	if (!ptCache.has(id)) ptCache.set(id, new PtById(id));
	return { impl: ptCache.get(id)!, settings: {} };
};

// ---------------------------------------------------------------- tab contents

export const TABS: Record<string, { label: string; items: string[] }> = {
	game: {
		label: "Game",
		items: ["g:walk", "g:map", "g:vehicles", "g:respawn", "g:recover", "g:slowmo", "g:ui", "g:radial",
			"g:photo", "g:traffic", "g:trailer", "g:nextveh", "g:up", "g:down", "g:left", "g:right"],
	},
	car: {
		label: "Car",
		// "pt*" = the game's powertrain bar for this vehicle; "own*" = our own powertrain buttons, used
		// only when the vehicle has no bar
		items: ["ignition", "pt*", "lights", "ind_left", "ind_right", "pbrake", "hazard", "fog", "horn", "cruise", "n2o", "jato",
			"doors", "trunk", "lightbar", "ebrake", "retarder", "air_raise", "air_lower", "cruise_set", "cruise_plus", "cruise_minus"],
	},
	camera: {
		label: "Camera",
		items: ["g:cam_cycle", "g:cam_center", "g:cam_orbit", "g:cam_driver", "g:cam_chase", "g:cam_external", "g:cam_top",
			"g:look_back", "g:replay", "g:slower", "g:faster"],
	},
};
const OWN_POWERTRAIN = ["traction", "diff_rear", "diff_front", "diff_center", "range", "drive"];

/** Functions on a tab for the current vehicle, in order, without the ones it doesn't have. */
function tabItems(tab: string, s: VehicleStatus | undefined): Fn[] {
	const out: Fn[] = [];
	const seen = new Set<string>();
	const add = (id: string, f: Fn) => {
		if (seen.has(id)) return;
		if (f.impl.vehicle && (!s || !f.impl.available(s, f.settings))) return;
		seen.add(id);
		out.push(f);
	};
	for (const id of TABS[tab]?.items ?? []) {
		if (id === "pt*") {
			if (s?.pt?.length) {
				for (const b of s.pt) {
					// the game's N2O / JATO buttons: use our richer versions (tap/hold, levels)
					if (b.id === "nitrousOxideInjection") add("n2o", FUNCS.n2o);
					else if (b.id.startsWith("jato")) add("jato", FUNCS.jato);
					else add(`pt:${b.id}`, ptFn(b.id));
				}
			} else for (const own of OWN_POWERTRAIN) add(own, FUNCS[own]);
			continue;
		}
		if (FUNCS[id]) add(id, FUNCS[id]);
	}
	return out;
}

// ---------------------------------------------------------------- tab state

let activeTab = "car";
const pageOf: Record<string, number> = {};
let lastWalking: boolean | undefined;

const slotEntries = () =>
	[...entries.values()]
		.filter((e) => e.resolve && e.impl !== undefined && (e as SlotEntry).own !== undefined)
		.sort((a, b) => (Number((a as SlotEntry).own.slot) || 99) - (Number((b as SlotEntry).own.slot) || 99) || a.action.id.localeCompare(b.action.id)) as SlotEntry[];

function pagesFor(tab: string): number {
	const n = Math.max(1, slotEntries().length);
	return Math.max(1, Math.ceil(tabItems(tab, game.snapshot.status).length / n));
}

/** Follow the player: on foot -> Game tab, back in a vehicle -> Car tab. */
function followPlayer(ge: GeStatus | undefined) {
	const w = ge?.walking;
	if (w === undefined || w === lastWalking) return;
	if (lastWalking !== undefined) activeTab = w ? "game" : "car";
	lastWalking = w;
}

// ---------------------------------------------------------------- Tab button

@action({ UUID: "com.yahms.beamdeckng.tab" })
export class Tab extends DeckAction {
	override vehicle = false;
	face(_s: VehicleStatus, st: Settings, _h?: boolean, ge?: GeStatus): Face {
		followPlayer(ge);
		const tab = TABS[st.tab ?? "car"] ? st.tab ?? "car" : "car";
		const on = tab === activeTab;
		const pages = on ? pagesFor(tab) : 1;
		const page = (pageOf[tab] ?? 0) % pages;
		return {
			key: `tab_${tab}`,
			state: on ? "on" : "off",
			alt: ["off"],
			label: "Tab",
			value: TABS[tab].label.toUpperCase(),
			color: on ? C.warn : C.off,
			frame: on ? "#ff7a00" : undefined,
			overlay: pages > 1 ? `${page + 1}/${pages}` : undefined,
		};
	}
	override available(): boolean {
		return true;
	}
	command(): Command {
		return null;
	}
	override async onKeyDown(ev: KeyDownEvent<Settings>): Promise<void> {
		const e = entries.get(ev.action.id);
		if (!e) return;
		const tab = TABS[e.settings.tab ?? "car"] ? e.settings.tab ?? "car" : "car";
		if (tab === activeTab) pageOf[tab] = ((pageOf[tab] ?? 0) + 1) % pagesFor(tab);
		else activeTab = tab;
		redraw(true);
	}
	override async onKeyUp(): Promise<void> {}
}

// ---------------------------------------------------------------- Slot button

type SlotEntry = Entry & { own: Settings };

class Blank extends DeckAction {
	override vehicle = false;
	face(): Face {
		return { key: "common", state: "blank", label: "", value: "", color: "#000" };
	}
	override available(): boolean {
		return true;
	}
	command(): Command {
		return null;
	}
}
const blank: Fn = { impl: new Blank(), settings: {} };

function resolveSlot(e: Entry) {
	const se = e as SlotEntry;
	followPlayer(game.snapshot.ge);
	const slots = slotEntries();
	const idx = slots.indexOf(se);
	const items = tabItems(activeTab, game.snapshot.status);
	const n = Math.max(1, slots.length);
	const pages = Math.max(1, Math.ceil(items.length / n));
	const page = (pageOf[activeTab] ?? 0) % pages;
	const f = (idx >= 0 && items[page * n + idx]) || blank;
	if (se.impl !== f.impl || se.settings !== f.settings) {
		se.impl = f.impl;
		se.settings = f.settings;
	}
}

@action({ UUID: "com.yahms.beamdeckng.slot" })
export class Slot extends DeckAction {
	face(): Face {
		return blank.impl.face({}, {});
	}
	command(): Command {
		return null;
	}
	override onWillAppear(ev: WillAppearEvent<Settings>): void {
		if (!ev.action.isKey()) return;
		const e: SlotEntry = { action: ev.action, impl: blank.impl, settings: {}, own: ev.payload.settings ?? {}, busy: false, resolve: resolveSlot };
		entries.set(ev.action.id, e);
		ev.action.setTitle("");
		redraw(true);
	}
	override onDidReceiveSettings(ev: DidReceiveSettingsEvent<Settings>): void {
		const e = entries.get(ev.action.id) as SlotEntry | undefined;
		if (e) {
			e.own = ev.payload.settings ?? {};
			e.lastImg = undefined;
			redraw(true);
		}
	}
	override async onKeyDown(ev: KeyDownEvent<Settings>): Promise<void> {
		const e = entries.get(ev.action.id);
		if (!e || e.busy) return;
		resolveSlot(e);
		e.locked = true; // keep this function until the key comes back up (hold buttons)
		await e.impl.onKeyDown(ev);
	}
	override async onKeyUp(ev: KeyUpEvent<Settings>): Promise<void> {
		const e = entries.get(ev.action.id);
		if (!e) return;
		await e.impl.onKeyUp(ev);
		e.locked = false;
	}
}
