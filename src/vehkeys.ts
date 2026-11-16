// "Vehicle control" keys, filled in automatically from the vehicle you're driving.
//
// Put a run of them on a page with slots 1, 2, 3... Each shows and runs that slot's control of the
// current vehicle (see vehcontrols.ts for what counts and the order): tray tilt and extend on a
// rollback, hydraulics on a lowrider, fifth wheel and idle-up on a semi, spinner speed on a spinner.
// Diffs, range, lights and the rest keep their own set buttons. Slots the vehicle doesn't fill are
// blank.
import { action } from "@elgato/streamdeck";

import { Command, DeckAction, game, Settings } from "./actions";
import { VehicleStatus } from "./game";
import { C, Face } from "./icons";
import { VControl } from "./vehcontrols";

const slotOf = (st: Settings) => Math.max(1, Math.min(64, Math.round(Number(st.slot ?? 1)) || 1));

/** The control in this key's slot, if the current vehicle has one. */
export function controlFor(st: Settings): VControl | undefined {
	return game?.controls?.keys[slotOf(st) - 1];
}

@action({ UUID: "com.yahms.beamdeckng.vehcontrol" })
export class VehicleControl extends DeckAction {
	override autoControls = true;
	face(s: VehicleStatus, st: Settings, held?: boolean): Face {
		const n = slotOf(st);
		const k = controlFor(st);
		if (!k) {
			// before the game is read: say what the key is; a vehicle with fewer controls: blank
			const known = !!game?.controls;
			if (known) return { key: "common", state: "blank", label: "", value: "", color: C.none };
			return { key: "vehcontrol", state: "unsupported", alt: ["off"], label: "Vehicle control", value: `#${n}`, color: C.none, dim: true };
		}
		// a towed trailer's control says so
		const base = { key: "vehcontrol", label: k.label, sub: k.t ? (k.t > 1 ? `TRAILER ${k.t}` : "TRAILER") : undefined };
		if (held) return { ...base, state: "on", value: k.kind === "hold" ? "MOVING" : "●", color: C.on };
		if (k.kind === "hold") return { ...base, state: "off", value: k.value < 0 ? "HOLD ▼" : "HOLD", color: C.off };
		// toggle states are read from the vehicle you drive only
		const st8 = k.t ? undefined : k.state;
		if (st8 && "electric" in st8) {
			const v = s.vc?.e?.[st8.electric];
			if (typeof v === "number") return { ...base, state: v > 0 ? "on" : "off", value: v > 0 ? "ON" : "OFF", color: v > 0 ? C.on : C.off };
		}
		if (st8 && "coupler" in st8) {
			const g = s.vc?.c?.[st8.coupler];
			if (g) {
				const shut = g === "attached";
				const lock = /lock|latch|hitch|pintle/i.test(k.id);
				return { ...base, state: shut ? "off" : "on", value: shut ? (lock ? "LOCKED" : "SHUT") : lock ? "UNLOCKED" : "OPEN", color: shut ? C.off : C.warn };
			}
		}
		return { ...base, state: "off", value: "PRESS", color: C.off };
	}

	command(_s: VehicleStatus, st: Settings): Command {
		const k = controlFor(st);
		return k ? { vc: { id: k.id, value: k.value, phase: "down", t: k.t }, args: {} } : null;
	}

	override release(_s: VehicleStatus, st: Settings): Command {
		const k = controlFor(st);
		// hold controls run again on release (onUp, or the axis back to 0); taps don't
		return k?.release ? { vc: { id: k.id, value: 0, phase: "up", t: k.t }, args: {} } : null;
	}
}
