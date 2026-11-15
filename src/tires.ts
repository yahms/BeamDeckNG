// Tyre pressure keys for vehicles with a central tyre inflation system (the Stambecco's TPMS and
// anything else using the game's tirePressureControl). Hold to inflate or deflate one axle, or all
// wheels together; the key shows that group's pressure.
import { action } from "@elgato/streamdeck";

import { Command, DeckAction, Settings } from "./actions";
import { VehicleStatus } from "./game";
import { C, Face } from "./icons";

type Group = NonNullable<VehicleStatus["tp"]>[number];

/** The groups a key covers: one axle (1-based, in the vehicle's own order) or all of them. */
function pick(s: VehicleStatus, st: Settings): { name: string; groups: Group[] } | undefined {
	const tp = s.tp;
	if (!tp?.length) return undefined;
	const sel = st.group ?? "all";
	if (sel === "all") return { name: "ALL", groups: tp };
	const g = tp[(Number(sel) || 0) - 1];
	return g ? { name: (g.n ?? g.k).toUpperCase(), groups: [g] } : undefined;
}
const psiOf = (gs: Group[]) => {
	const v = gs.map((g) => g.psi).filter((p): p is number => typeof p === "number");
	return v.length ? Math.round((v.reduce((a, b) => a + b, 0) / v.length) * 10) / 10 : undefined;
};

@action({ UUID: "com.yahms.beamdeckng.tires" })
export class Tires extends DeckAction {
	private dir(st: Settings) {
		return st.tdir === "deflate" ? "deflate" : "inflate";
	}
	face(s: VehicleStatus, st: Settings, held?: boolean): Face {
		const down = this.dir(st) === "deflate";
		const key = down ? "tire_down" : "tire_up";
		const label = down ? "Deflate" : "Inflate";
		const sel = pick(s, st);
		if (!sel) return { key, state: "unsupported", alt: ["off"], label, value: "N/A", color: C.none, dim: true };
		const psi = psiOf(sel.groups);
		const busy = held || sel.groups.some((g) => g.a);
		return {
			key,
			state: busy ? "on" : "off",
			alt: ["off"],
			label,
			value: `${sel.name} ${psi ?? "?"}`,
			overlay: `${sel.name} ${psi ?? "?"}`,
			color: busy ? C.on : C.off,
			flash: busy,
		};
	}
	/** Held: start on key down, stop on key up. */
	command(s: VehicleStatus, st: Settings): Command {
		if (!pick(s, st)) return null;
		return { action: "tire_pressure", args: { group: st.group ?? "all", dir: this.dir(st), state: 1 } };
	}
	override release(): Command {
		return { action: "tire_pressure", args: { state: 0 } };
	}
}

