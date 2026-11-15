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
const icon = (key: string, label: string, glyph: string, on: boolean, overlay?: string, tint?: string): Face => ({
	key: "world", state: key, label, value: (overlay ?? label).toUpperCase(), color: on ? C.on : C.off,
	glyph: [glyph], tint: tint ?? (on ? P.green : P.white), overlay,
});

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
	face: (g) => icon(`grav_${id}`, GRAV[id].name, "material_public", gravNow(g) === id, GRAV[id].name),
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
			return icon("grav_cycle", "Gravity", "material_public", !!id && id !== "earth", id ? GRAV[id].name : `${(-(g.grav ?? 0)).toFixed(1)} m/s2`, id === "earth" ? P.white : P.blue);
		},
		press: (g) => run(`core_environment.setGravity(${GRAV[GRAV_ORDER[(GRAV_ORDER.indexOf(gravNow(g) ?? "jupiter") + 1) % GRAV_ORDER.length]].g}) return 'ok'`),
	},
	grav_earth: gravKey("earth"),
	grav_moon: gravKey("moon"),
	grav_mars: gravKey("mars"),
	grav_zero: gravKey("zero"),
};

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
		return ge.tod ? this.fn(st).press(ge) : null;
	}
}
