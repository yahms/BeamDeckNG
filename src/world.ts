// World buttons: time of day, weather, gravity. Game-level (no vehicle needed), but they need a loaded map.
// Everything goes through the game's own core_environment, so the keys follow changes made in the game's menus too.
import { action } from "@elgato/streamdeck";

import { Command, DeckAction, Settings } from "./actions";
import { GeStatus, VehicleStatus } from "./game";
import { C, Face, P } from "./icons";

// --- time: the game's time is 0..1 with 0 = noon and 0.5 = midnight
const hourOf = (t: number) => (t * 24 + 12) % 24;
const timeOf = (h: number) => (((h - 12) / 24) % 1 + 1) % 1;
const clock = (h: number) => {
	const m = Math.floor(h * 60 + 0.5) % 1440;
	return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
};
const mix = (a: number[], b: number[], k: number) => `#${a.map((x, i) => Math.round(x + (b[i] - x) * k).toString(16).padStart(2, "0")).join("")}`;
const NIGHT = [10, 16, 48], DAWN = [214, 110, 36], DAY = [44, 128, 200];
/** Sky colour for an hour: deep blue at night, orange at dawn and dusk, light blue by day. */
function sky(h: number): string {
	const d = Math.min(Math.abs(h - 6), Math.abs(h - 18)); // hours from sunrise / sunset
	const up = h > 6 && h < 18;
	if (d < 1) return mix(DAWN, up ? DAY : NIGHT, d);
	return mix(up ? DAY : NIGHT, up ? DAY : NIGHT, 0);
}
const hourDiff = (a: number, b: number) => Math.min(Math.abs(a - b), 24 - Math.abs(a - b));

// --- weather. Fog is in the environment menu's units; clear / cloudy keep the map's own fog.
type Wx = { name: string; cloud: number; fog?: number; wind: number; rain: number; glyph: string };
const WX: Record<string, Wx> = {
	clear: { name: "Clear", cloud: 0.1, wind: 0.2, rain: 0, glyph: "material_wb_sunny" },
	cloudy: { name: "Cloudy", cloud: 2.5, wind: 1, rain: 0, glyph: "material_wb_cloudy" },
	fog: { name: "Fog", cloud: 1.5, fog: 12, wind: 0.2, rain: 0, glyph: "radial_fog_lights" },
	rain: { name: "Rain", cloud: 2.5, fog: 1.2, wind: 2, rain: 700, glyph: "material_grain" },
	storm: { name: "Storm", cloud: 3, fog: 3, wind: 7, rain: 2200, glyph: "material_flash_on" },
};
const WX_ORDER = ["clear", "cloudy", "fog", "rain", "storm"];
/** Which preset the current sky is closest to (works however the weather was set). */
function wxNow(g: GeStatus): string {
	if ((g.rain ?? 0) >= 1500) return "storm";
	if ((g.rain ?? 0) > 0) return "rain";
	if ((g.fog ?? 0) >= 6) return "fog";
	return (g.cloud ?? 0) >= 1.5 ? "cloudy" : "clear";
}
/** Rain: uses the map's own rain objects; maps without any get one of ours (the rain datablocks are global). */
const rainLua = (n: number) => `local names = scenetree.findClassObjects("Precipitation") or {}
if #names == 0 and ${n} > 0 then
  local o = createObject("Precipitation")
  o.dataBlock = scenetree.findObject("rain_medium")
  o.numDrops = 0 o.splashSize = 0.2 o.splashMS = 250 o.animateSplashes = true
  o.boxWidth = 24 o.boxHeight = 12 o.dropSize = 1
  o.doCollision = true o.hitVehicles = true o.rotateWithCamVel = true o.followCam = true o.useWind = true
  o.minSpeed = 0.4 o.maxSpeed = 0.5 o.minMass = 4 o.maxMass = 5
  o:registerObject("BNGSD_rain")
  names = { "BNGSD_rain" }
end
for _, nm in ipairs(names) do local o = scenetree.findObject(nm) if o then o.numDrops = ${n} end end`;
const wxLua = (w: Wx) => `local i = core_environment.getInitState() or {}
core_environment.setState({ cloudCover = ${w.cloud}, fogDensity = ${w.fog ?? "(i.fogDensity or 0.15)"}, windSpeed = ${w.wind} })
${rainLua(w.rain)}
return 'ok'`;

const GRAV: Record<string, { name: string; g: number }> = {
	earth: { name: "Earth", g: -9.81 },
	moon: { name: "Moon", g: -1.62 },
	mars: { name: "Mars", g: -3.71 },
	zero: { name: "Zero-G", g: 0 },
	jupiter: { name: "Jupiter", g: -24.92 },
};
const GRAV_ORDER = ["earth", "moon", "mars", "zero", "jupiter"];
const gravNow = (g: GeStatus) => GRAV_ORDER.find((k) => Math.abs((g.grav ?? -9.81) - GRAV[k].g) < 0.15);

const DAYLEN = [900, 1800, 7200, 86400]; // the game's own day-cycle presets
const dayName = (s?: number) => (!s ? "?" : s >= 86400 ? "REAL" : s >= 3600 ? `${+(s / 3600).toFixed(1)} H` : `${Math.round(s / 60)} MIN`);
const FOG = [0, 3, 12]; // added to the map's own fog: off / light / heavy
const WIND = [0.2, 3, 10];
const RAIN = [0, 700, 2200];
const nextOf = (list: number[], cur: number) => list[(list.reduce((best, v, i) => (Math.abs(v - cur) < Math.abs(list[best] - cur) ? i : best), 0) + 1) % list.length];
const level = (list: number[], cur: number) => list.reduce((best, v, i) => (Math.abs(v - cur) < Math.abs(list[best] - cur) ? i : best), 0);
const LEVELS = ["OFF", "LIGHT", "HEAVY"];

const run = (code: string): Command => ({ tool: "run_lua", args: { code } });
const icon = (key: string, label: string, glyph: string | string[], on: boolean, overlay?: string, tint?: string, head?: string): Face => ({
	key: "world", state: key, label, value: (overlay ?? label).toUpperCase(), color: on ? C.on : C.off,
	glyph: Array.isArray(glyph) ? glyph : [glyph], tint: tint ?? (on ? P.green : P.white), overlay, head,
});

// --- more / less: each press moves one rung up or down a ladder of sensible values
const CLOUD_STEPS = [0, 0.25, 0.5, 1, 1.5, 2, 2.5, 3, 4, 5];
const FOG_STEPS = [0, 0.05, 0.1, 0.2, 0.5, 1, 2, 3, 5, 8, 12, 20, 35, 50]; // environment menu units
const FOGH_STEPS = [10, 25, 50, 100, 150, 200, 300, 500, 750, 1000, 1500, 2000]; // metres
const RAIN_STEPS = [0, 100, 300, 700, 1200, 2200, 3500, 5000]; // drops
const WIND_STEPS = [0, 0.5, 1, 2, 3, 5, 7, 10, 15, 20];
export function stepOf(list: number[], cur: number, dir: 1 | -1): number {
	const eps = 1e-6 + Math.abs(cur) * 0.01;
	if (dir > 0) return list.find((v) => v > cur + eps) ?? list[list.length - 1];
	return [...list].reverse().find((v) => v < cur - eps) ?? list[0];
}
const num = (v: number) => (v >= 100 ? String(Math.round(v)) : v >= 10 ? v.toFixed(0) : v >= 1 ? +v.toFixed(1) + "" : +v.toFixed(2) + "");
type Amount = { name: string; glyph: string[]; steps: number[]; get: (g: GeStatus) => number; set: (v: number) => string; unit?: string };
const AMOUNTS: Record<string, Amount> = {
	cloud: { name: "Clouds", glyph: ["material_wb_cloudy", "own_cloud"], steps: CLOUD_STEPS, get: (g) => g.cloud ?? 0, set: (v) => `core_environment.setState({ cloudCover = ${v} })` },
	fog: { name: "Fog", glyph: ["own_fog", "radial_fog_lights"], steps: FOG_STEPS, get: (g) => g.fog ?? 0, set: (v) => `core_environment.setState({ fogDensity = ${v} })` },
	fogh: { name: "Fog height", glyph: ["own_fog_height"], steps: FOGH_STEPS, get: (g) => g.fogH ?? 0, set: (v) => `core_environment.setState({ fogAtmosphereHeight = ${v} })`, unit: " m" },
	rain: { name: "Rain", glyph: ["own_rain", "material_grain"], steps: RAIN_STEPS, get: (g) => g.rain ?? 0, set: (v) => rainLua(v) },
	wind: { name: "Wind", glyph: ["own_wind"], steps: WIND_STEPS, get: (g) => g.wind ?? 0, set: (v) => `core_environment.setWindSpeed(${v})` },
};
const amountKey = (id: string, dir: 1 | -1): WorldFn => {
	const a = AMOUNTS[id];
	return {
		label: `${a.name} ${dir > 0 ? "+" : "-"}`,
		face: (g) => icon(`${id}_${dir > 0 ? "up" : "down"}`, a.name, a.glyph, false, num(a.get(g)) + (a.unit ?? ""), a.get(g) > 0 ? P.blue : P.white, `${a.name} ${dir > 0 ? "+" : "-"}`),
		press: (g) => run(`${a.set(stepOf(a.steps, a.get(g), dir))}\nreturn 'ok'`),
	};
};
// time steps, in minutes
const timeStep = (min: number): WorldFn => {
	const name = `${min > 0 ? "+" : "-"}${Math.abs(min) >= 60 ? `${Math.abs(min) / 60} H` : `${Math.abs(min)} MIN`}`;
	return {
		label: `Time ${name.toLowerCase()}`,
		face: (g) => icon(`time_${min}`, "Time", min > 0 ? "material_fast_forward" : "material_fast_rewind", false, clock(hourOf(g.tod!.time)), undefined, `TIME ${name}`),
		press: (g) => run(`core_environment.setTimeOfDay({ time = ${timeOf(hourOf(g.tod!.time) + 24 + min / 60)} }) return 'ok'`),
	};
};

type WorldFn = { label: string; face: (g: GeStatus) => Face; press: (g: GeStatus) => Command };
const timeKey = (label: string, h: number, glyph: string): WorldFn => ({
	label,
	face: (g) => icon(`time_${h}`, label, glyph, hourDiff(hourOf(g.tod!.time), h) < 0.75, clock(h)),
	press: () => run(`core_environment.setTimeOfDay({ time = ${timeOf(h)} }) return 'ok'`),
});
const wxKey = (id: string): WorldFn => ({
	label: WX[id].name,
	face: (g) => icon(`wx_${id}`, WX[id].name, WX[id].glyph, wxNow(g) === id, WX[id].name),
	press: () => run(wxLua(WX[id])),
});
const gravKey = (id: string): WorldFn => ({
	label: GRAV[id].name,
	face: (g) => icon(`grav_${id}`, GRAV[id].name, ["material_public", "own_gravity"], gravNow(g) === id, GRAV[id].name, undefined, "Gravity"),
	press: () => run(`core_environment.setGravity(${GRAV[id].g}) return 'ok'`),
});

export const WORLD_FUNCS: Record<string, WorldFn> = {
	clock: {
		label: "Time of day",
		face: (g) => {
			const h = hourOf(g.tod!.time);
			return { key: "world", state: "clock", label: "Time", value: clock(h), color: C.off, panel: { big: clock(h), bg: sky(h), top: "Time", unit: g.tod!.play ? "RUNNING" : "FROZEN" } };
		},
		press: (g) => run(`core_environment.setTimeOfDay({ play = ${g.tod?.play ? "false" : "true"} }) return 'ok'`),
	},
	time_sunrise: timeKey("Sunrise", 6, "material_brightness_low"),
	time_noon: timeKey("Noon", 12, "material_wb_sunny"),
	time_sunset: timeKey("Sunset", 18, "material_brightness_medium"),
	time_midnight: timeKey("Midnight", 0, "material_brightness_2"),
	time_fwd: {
		label: "Time +1 h",
		face: (g) => icon("time_fwd", "+1 h", "material_fast_forward", false, clock(hourOf(g.tod!.time))),
		press: (g) => run(`core_environment.setTimeOfDay({ time = ${timeOf(hourOf(g.tod!.time) + 1)} }) return 'ok'`),
	},
	time_back: {
		label: "Time -1 h",
		face: (g) => icon("time_back", "-1 h", "material_fast_rewind", false, clock(hourOf(g.tod!.time))),
		press: (g) => run(`core_environment.setTimeOfDay({ time = ${timeOf(hourOf(g.tod!.time) + 23)} }) return 'ok'`),
	},
	daylen: {
		label: "Day length",
		face: (g) => ({ key: "world", state: "daylen", label: "Day length", value: dayName(g.tod!.dayLength), color: C.off, panel: { big: dayName(g.tod!.dayLength), top: "Day", unit: g.tod!.play ? "per day" : "frozen" } }),
		press: (g) => run(`core_environment.setTimeOfDay({ dayLength = ${nextOf(DAYLEN, g.tod?.dayLength ?? 1800)}, play = true }) return 'ok'`),
	},
	wx_cycle: {
		label: "Weather",
		face: (g) => icon("wx_cycle", "Weather", WX[wxNow(g)].glyph, false, WX[wxNow(g)].name, wxNow(g) === "clear" ? P.yellow : wxNow(g) === "cloudy" ? P.white : P.blue),
		press: (g) => run(wxLua(WX[WX_ORDER[(WX_ORDER.indexOf(wxNow(g)) + 1) % WX_ORDER.length]])),
	},
	wx_clear: wxKey("clear"),
	wx_cloudy: wxKey("cloudy"),
	wx_fog: wxKey("fog"),
	wx_rain: wxKey("rain"),
	wx_storm: wxKey("storm"),
	rain: {
		label: "Rain",
		face: (g) => icon("rain", "Rain", "material_grain", (g.rain ?? 0) > 0, `RAIN ${LEVELS[level(RAIN, g.rain ?? 0)]}`, (g.rain ?? 0) > 0 ? P.blue : P.white),
		press: (g) => run(`${rainLua(nextOf(RAIN, g.rain ?? 0))}\nreturn 'ok'`),
	},
	fog: {
		label: "Fog",
		face: (g) => {
			const lv = level(FOG, (g.fog ?? 0) - (g.fog0 ?? 0));
			return icon("fog", "Fog", "radial_fog_lights", lv > 0, `FOG ${LEVELS[lv]}`, lv > 0 ? P.blue : P.white);
		},
		press: (g) => run(`core_environment.setState({ fogDensity = ${(g.fog0 ?? 0.15) + nextOf(FOG, (g.fog ?? 0) - (g.fog0 ?? 0))} }) return 'ok'`),
	},
	wind: {
		label: "Wind",
		face: (g) => {
			const lv = level(WIND, g.wind ?? 0);
			return { key: "world", state: "wind", label: "Wind", value: ["CALM", "BREEZY", "STORM"][lv], color: lv ? C.on : C.off, panel: { big: ["CALM", "BREEZY", "STORM"][lv], top: "Wind", fg: lv ? P.blue : "#fff" } };
		},
		press: (g) => run(`core_environment.setWindSpeed(${nextOf(WIND, g.wind ?? 0)}) return 'ok'`),
	},
	grav_cycle: {
		label: "Gravity",
		face: (g) => {
			const id = gravNow(g);
			return icon("grav_cycle", "Gravity", ["material_public", "own_gravity"], !!id && id !== "earth", id ? GRAV[id].name : `${(-(g.grav ?? 0)).toFixed(1)} m/s2`, id === "earth" ? P.white : P.blue, "Gravity");
		},
		press: (g) => run(`core_environment.setGravity(${GRAV[GRAV_ORDER[(GRAV_ORDER.indexOf(gravNow(g) ?? "jupiter") + 1) % GRAV_ORDER.length]].g}) return 'ok'`),
	},
	grav_earth: gravKey("earth"),
	grav_moon: gravKey("moon"),
	grav_mars: gravKey("mars"),
	grav_zero: gravKey("zero"),
	grav_jupiter: gravKey("jupiter"),
	// more / less
	cloud_up: amountKey("cloud", 1),
	cloud_down: amountKey("cloud", -1),
	fog_up: amountKey("fog", 1),
	fog_down: amountKey("fog", -1),
	fogh_up: amountKey("fogh", 1),
	fogh_down: amountKey("fogh", -1),
	rain_up: amountKey("rain", 1),
	rain_down: amountKey("rain", -1),
	wind_up: amountKey("wind", 1),
	wind_down: amountKey("wind", -1),
	// time steps
	time_p10m: timeStep(10),
	time_m10m: timeStep(-10),
	time_p1h: timeStep(60),
	time_m1h: timeStep(-60),
	time_p4h: timeStep(240),
	time_m4h: timeStep(-240),
};

/** On BeamMP (no direct control through MP-MCP): the game menu page where the player can change it. */
function worldMenu(id: string): string {
	if (id.startsWith("grav")) return "simulation";
	if (id.startsWith("wx") || /^(rain|fog|fogh|wind|cloud)(_up|_down)?$/.test(id)) return "weather";
	return "environment"; // time of day, day length
}

@action({ UUID: "com.yahms.beamdeckng.world" })
export class World extends DeckAction {
	override vehicle = false;
	private fn(st: Settings): WorldFn {
		return WORLD_FUNCS[st.fn ?? ""] ?? WORLD_FUNCS.clock;
	}
	face(_s: VehicleStatus, st: Settings, held?: boolean, ge: GeStatus = {}): Face {
		const f = this.fn(st);
		// no map loaded: nothing to show or change
		if (!ge.tod) return { key: "world", state: "nomap", label: f.label, value: "NO MAP", color: C.none, panel: { big: "NO MAP", top: f.label }, dim: true };
		const face = f.face(ge);
		return held ? { ...face, tint: P.green } : face;
	}
	command(_s: VehicleStatus, st: Settings, ge: GeStatus = {}): Command {
		const cmd = ge.tod ? this.fn(st).press(ge) : null;
		return cmd && { ...cmd, menu: worldMenu(String(st.fn ?? "")) };
	}
}
