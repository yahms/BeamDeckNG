// Gauge keys: live readouts of the vehicle you're driving (speed, gear, rpm, fuel, temperatures, boost, damage).
import { action } from "@elgato/streamdeck";

import { Command, DeckAction, Ignition, Settings, Traction, unitOf } from "./actions";
import { VehicleStatus } from "./game";
import { C, Face, P, REV_ORANGE, REV_RED, revZone } from "./icons";

type G = NonNullable<VehicleStatus["g"]>;
type Panel = NonNullable<Face["panel"]>;
type Reading = { panel: Panel; flash?: boolean } | undefined;

const gearName = (g: G) => g.gear ?? (g.gi === undefined ? undefined : g.gi < 0 ? "R" : g.gi === 0 ? "N" : String(g.gi));
const rev = (g: G) => (g.rpm !== undefined && g.maxrpm ? g.rpm / g.maxrpm : undefined);
const dmgText = (d: number) => (d >= 1e6 ? `${(d / 1e6).toFixed(1)}M` : d >= 1000 ? `${Math.round(d / 1000)}k` : String(Math.round(d)));

export const GAUGES: Record<string, { label: string; read: (g: G, st: Settings) => Reading }> = {
	speed: {
		label: "Speed",
		read: (g, st) => (g.spd === undefined ? undefined : { panel: { big: String(Math.round(Math.abs(g.spd) * unitOf(st).k)), unit: unitOf(st).name } }),
	},
	speedgear: {
		label: "Speed + gear",
		read: (g, st) => {
			if (g.spd === undefined) return undefined;
			const name = gearName(g);
			const k = rev(g);
			const red = k === undefined ? !!g.shift : k >= REV_RED || !!g.shift;
			const u = unitOf(st).name.toUpperCase();
			return {
				panel: {
					big: String(Math.round(Math.abs(g.spd) * unitOf(st).k)),
					top: "Speed",
					unit: name === undefined ? u : `GEAR ${name} · ${u}`,
					bar: k === undefined ? undefined : { value: k, color: red ? P.red : revZone(k) },
				},
				flash: red,
			};
		},
	},
	gear: {
		label: "Gear",
		read: (g) => {
			const name = gearName(g);
			if (name === undefined) return undefined;
			// tacho arc round the key (white, orange near the redline, red at it), the RPM underneath
			const k = rev(g);
			const red = k === undefined ? !!g.shift : k >= REV_RED || !!g.shift;
			const rpm = g.rpm === undefined ? undefined : `${Math.round(g.rpm / 50) * 50} RPM`;
			return { panel: { big: name, top: "Gear", unit: rpm, fg: red ? P.red : revZone(k), arc: { value: k } }, flash: red };
		},
	},
	rpm: {
		label: "RPM",
		read: (g) => {
			if (g.rpm === undefined) return undefined;
			const k = rev(g);
			const red = k === undefined ? !!g.shift : k >= REV_RED || !!g.shift;
			const gear = gearName(g);
			return { panel: { big: String(Math.round(g.rpm / 50) * 50), top: "RPM", unit: gear === undefined ? "RPM" : `GEAR ${gear}`, fg: red ? P.red : revZone(k), arc: { value: k } }, flash: red };
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
			return { panel: { big: d < 1 ? "OK" : dmgText(d), top: "Damage", fg: d < 1 ? P.green : d < 20000 ? P.yellow : P.red } };
		},
	},
};

/** Icon for each gauge, shown when there's no reading (no game, not on this vehicle). */
const GAUGE_GLYPH: Record<string, string> = { gear: "own_g_gear", speed: "own_g_speed", speedgear: "own_g_speed", kmh: "own_g_speed", mph: "own_g_speed", rpm: "own_g_speed", fuel: "own_g_fuel", water: "own_g_temp", oil: "own_g_oil", boost: "own_g_boost", damage: "own_g_damage" };

// What a gauge does when pressed (the "Press" setting), per gauge. The first is the default.
//   damage: repair (the game's action, or the real Insert key held) / recover to road / respawn / nothing
//   rpm, gear: start / stop the engine (the engine icon behind the reading shows its state)
//   speed, speed + gear: traction control / drive mode (the ESC icon behind, in the mode's colour)
const PRESS: Record<string, string[]> = {
	damage: ["repair", "repair_key", "recover", "respawn", "none"],
	rpm: ["none", "ignition"],
	gear: ["none", "ignition"],
	speed: ["none", "tcs"],
	speedgear: ["none", "tcs"],
};
const DMG_ACTION: Record<string, { head: string; glyph: string[]; cmd: NonNullable<Command> }> = {
	repair: { head: "Repair", glyph: ["material_build"], cmd: { tool: "trigger_action", args: { action: "recover_vehicle_alt" } } },
	repair_key: { head: "Repair", glyph: ["material_build"], cmd: { tool: "trigger_action", args: { action: "recover_vehicle_alt" } } },
	recover: { head: "Recover to road", glyph: ["own_recover_road"], cmd: { tool: "recover_vehicle", args: {} } },
	respawn: { head: "Respawn", glyph: ["radial_home", "material_home"], cmd: { tool: "trigger_action", args: { action: "loadHome" } } },
};
const ignition = new Ignition();
const traction = new Traction();

@action({ UUID: "com.yahms.beamdeckng.gauge" })
export class Gauge extends DeckAction {
	override passive = true;
	private id(st: Settings) {
		return st.gauge && GAUGES[st.gauge] ? st.gauge : "speed";
	}
	/** What a press does for this gauge (none = nothing). */
	private press(st: Settings): string {
		const opts = PRESS[this.id(st)] ?? ["none"];
		return st.gpress && opts.includes(st.gpress) ? st.gpress : opts[0];
	}
	/** Damage gauge set to "Repair (via keyboard Insert key)": Insert, held while the button is. */
	override keyboard(st: Settings): string | undefined {
		return this.press(st) === "repair_key" ? "insert" : undefined;
	}
	face(s: VehicleStatus, st: Settings, held?: boolean): Face {
		const id = this.id(st), def = GAUGES[id], press = this.press(st);
		const r = s.g ? def.read(s.g, st) : undefined;
		const base = { key: "gauge", state: id, label: def.label, color: C.off, glyph: [GAUGE_GLYPH[id] ?? "own_g_speed"] };
		// not on this vehicle (no turbo, electric car without oil temperature...): its icon, greyed
		if (!r) return { ...base, value: "N/A", dim: true };
		const plain: Face = { ...base, value: r.panel.big, panel: r.panel, flash: r.flash };
		if (press === "none") return plain;
		// damage: the reading over the icon of what a press does (repair / recover / respawn)
		if (id === "damage") {
			const a = DMG_ACTION[press];
			return {
				...base,
				glyph: a.glyph,
				tint: held ? P.green : P.white,
				head: a.head,
				value: "DAMAGE",
				keycap: press === "repair_key" ? "INSERT" : undefined,
				readout: { big: r.panel.big, fg: r.panel.fg },
			};
		}
		// start / stop: the engine icon behind, coloured for the engine's state; the title says what a press does
		if (press === "ignition") {
			const ig = ignition.face(s, {});
			if (ig.state === "unsupported") return plain;
			const g = s.g ?? {};
			const gear = gearName(g);
			const rpm = g.rpm === undefined ? undefined : String(Math.round(g.rpm / 50) * 50);
			// the same tacho arc as the plain gauge, thin, round the edge of the key
			const k = s.running ? rev(g) : undefined;
			const red = s.running && (k === undefined ? !!g.shift : k >= REV_RED || !!g.shift);
			const tint = s.running ? P.green : ig.state === "cranking" ? P.yellow : P.red;
			const big = !s.running ? ig.value : id === "gear" ? gear ?? "-" : rpm ?? "-";
			const small = !s.running ? undefined : id === "gear" ? (rpm ? `${rpm} RPM` : undefined) : gear ? `GEAR ${gear}` : undefined;
			return {
				...base,
				glyph: ["powertrain_engine"],
				tint,
				head: s.running ? "Stop engine" : "Start engine",
				value: s.running ? (id === "gear" ? "" : "RPM") : "",
				readout: { big, small, fg: red ? P.red : s.running && k !== undefined && k >= REV_ORANGE ? revZone(k) : undefined, arc: { value: k } },
				flash: ig.flash || red,
			};
		}
		// traction: like the traction key (ESC icon in the mode's colour, mode underneath), speed over it;
		// a car without traction control just shows the speed
		const tc = traction.face(s, {});
		if (tc.state === "unsupported") return plain;
		const on = s.tc !== false;
		const tint = tc.tint ?? (on ? P.blue : P.off);
		const g = s.g ?? {};
		const gear = gearName(g);
		const u = unitOf(st).name.toUpperCase();
		return {
			...base,
			glyph: tc.glyph ?? ["powertrain_esc", "systems_esc"],
			tint,
			head: tc.label,
			value: tc.value,
			sub: tc.sub,
			readout: { big: r.panel.big, small: id === "speedgear" && gear !== undefined ? `${gear} · ${u}` : u },
			flash: r.flash,
		};
	}
	command(s: VehicleStatus, st: Settings): Command {
		const id = this.id(st), press = this.press(st);
		if (id === "damage") return DMG_ACTION[press]?.cmd ?? null;
		if (press === "ignition") return s.ign === undefined && s.running === undefined ? null : ignition.command(s);
		if (press === "tcs") return traction.command(s, {});
		return null;
	}
}
