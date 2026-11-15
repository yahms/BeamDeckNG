// Gauge keys: live readouts of the vehicle you're driving (speed, gear, rpm, fuel, temperatures, boost, damage).
import { action } from "@elgato/streamdeck";

import { Command, DeckAction, Settings, unitOf } from "./actions";
import { VehicleStatus } from "./game";
import { C, Face, P } from "./icons";

type G = NonNullable<VehicleStatus["g"]>;
type Panel = NonNullable<Face["panel"]>;
type Reading = { panel: Panel; flash?: boolean } | undefined;

const gearName = (g: G) => g.gear ?? (g.gi === undefined ? undefined : g.gi < 0 ? "R" : g.gi === 0 ? "N" : String(g.gi));
const rev = (g: G) => (g.rpm !== undefined && g.maxrpm ? g.rpm / g.maxrpm : undefined);
/** Shift light: green, then yellow, then red (flashing) as the revs near the limit. */
const revColor = (k?: number) => (k === undefined || k < 0.8 ? undefined : k < 0.9 ? P.green : k < 0.96 ? P.yellow : P.red);
/** Rev share and shift colour. Without the rev limit (OutGauge), the game's own shift light turns it red. */
const revs = (g: G) => {
	const k = rev(g);
	return { k, c: k === undefined ? (g.shift ? P.red : undefined) : revColor(k) };
};
const dmgText = (d: number) => (d >= 1e6 ? `${(d / 1e6).toFixed(1)}M` : d >= 1000 ? `${Math.round(d / 1000)}k` : String(Math.round(d)));

export const GAUGES: Record<string, { label: string; read: (g: G, st: Settings) => Reading }> = {
	speed: {
		label: "Speed",
		read: (g, st) => (g.spd === undefined ? undefined : { panel: { big: String(Math.round(Math.abs(g.spd) * unitOf(st).k)), unit: unitOf(st).name } }),
	},
	gear: {
		label: "Gear",
		read: (g) => {
			const name = gearName(g);
			if (name === undefined) return undefined;
			const { k, c } = revs(g);
			return { panel: { big: name, top: "Gear", bg: c === P.red ? P.red : undefined, fg: c && c !== P.red ? c : "#fff", bar: k === undefined ? undefined : { value: k, color: c && c !== P.red ? c : "#fff" } }, flash: c === P.red };
		},
	},
	rpm: {
		label: "RPM",
		read: (g) => {
			if (g.rpm === undefined) return undefined;
			const { k, c } = revs(g);
			return { panel: { big: String(Math.round(g.rpm / 50) * 50), unit: "rpm", fg: c ?? "#fff", bar: k === undefined ? undefined : { value: k, color: c ?? "#fff" } }, flash: c === P.red };
		},
	},
	fuel: {
		label: "Fuel",
		read: (g) => {
			if (g.fuel === undefined) return undefined;
			const low = g.low || g.fuel < 0.1;
			return { panel: { big: `${Math.round(g.fuel * 100)}%`, top: "Fuel", fg: low ? P.red : "#fff", bar: { value: g.fuel, color: low ? P.red : g.fuel < 0.25 ? P.yellow : P.green } }, flash: low };
		},
	},
	water: {
		label: "Coolant",
		read: (g) => (g.water === undefined ? undefined : { panel: { big: `${Math.round(g.water)}°`, top: "Coolant", unit: "°C", fg: g.water >= 110 ? P.red : g.water < 60 ? P.blue : "#fff" }, flash: g.water >= 110 }),
	},
	oil: {
		label: "Oil temp",
		read: (g) => (g.oil === undefined ? undefined : { panel: { big: `${Math.round(g.oil)}°`, top: "Oil", unit: "°C", fg: g.oil >= 130 ? P.red : g.oil < 60 ? P.blue : "#fff" }, flash: g.oil >= 130 }),
	},
	boost: {
		label: "Boost",
		read: (g) => {
			if (g.boost === undefined) return undefined;
			// no maximum (OutGauge): the number alone
			if (!g.boostMax) return { panel: { big: g.boost.toFixed(1), top: "Boost", unit: "psi" } };
			const k = g.boost / g.boostMax;
			return { panel: { big: g.boost.toFixed(1), top: "Boost", unit: "psi", bar: { value: k, color: k > 0.9 ? P.yellow : P.blue } } };
		},
	},
	damage: {
		label: "Damage",
		read: (g) => {
			if (g.dmg === undefined) return undefined;
			const d = g.dmg;
			return { panel: { big: d < 1 ? "OK" : dmgText(d), top: "Damage", unit: d < 1 ? undefined : "press: repair", fg: d < 1 ? P.green : d < 20000 ? P.yellow : P.red } };
		},
	},
};

@action({ UUID: "com.yahms.beamdeckng.gauge" })
export class Gauge extends DeckAction {
	override passive = true;
	private id(st: Settings) {
		return st.gauge && GAUGES[st.gauge] ? st.gauge : "speed";
	}
	face(s: VehicleStatus, st: Settings): Face {
		const id = this.id(st), def = GAUGES[id];
		const r = s.g ? def.read(s.g, st) : undefined;
		const base = { key: "gauge", state: id, label: def.label, color: C.off };
		// not on this vehicle (no turbo, electric car without oil temperature...)
		if (!r) return { ...base, value: "N/A", panel: { big: "N/A", top: def.label }, dim: true };
		return { ...base, value: r.panel.big, panel: r.panel, flash: r.flash };
	}
	/** Only the damage gauge does something: repair in place. */
	command(s: VehicleStatus, st: Settings): Command {
		return this.id(st) === "damage" && (s.g?.dmg ?? 0) >= 1 ? { tool: "trigger_action", args: { action: "recover_vehicle_alt" } } : null;
	}
}
