// Which game icon (sprite symbol id) and palette colour each button state uses.
// Icons are read from the player's own copy of the game at runtime (see icons.ts).
//
// Colour language (P, from the game's own drive-mode colours):
//   white = idle / off-but-normal   green = on / engaged   blue = mode / info   yellow = caution, in progress
//   red = alert (engine stopped, parking brake, hazards, errors)   grey = off / not available

import { Face, P } from "./icons";

type G = { g: string[]; t: string; text?: string };
const g = (ids: string | string[], t: string, text?: string): G => ({ g: Array.isArray(ids) ? ids : [ids], t, text });

const DIFF = (locked: string, open: string) => ({
	locked: g(locked, P.green),
	open: g(open, P.white),
	auto: g(open, P.white),
	lsd: g(open, P.white),
	partial: g(locked, P.yellow),
});

export const GLYPHS: Record<string, Record<string, G>> = {
	ignition: {
		running: g("powertrain_engine", P.green, "RUN"),
		cranking: g("powertrain_engine", P.yellow, "START"),
		stalled: g("powertrain_engine", P.red, "STALL"),
		acc: g("powertrain_engine", P.red, "ACC"),
		off: g("powertrain_engine", P.red, "OFF"),
	},
	// traction: set in the face itself (one icon per drive mode, in the game's colour for that mode)
	traction: { on: g("systems_tc", P.green), off: g("systems_tc", P.off) },
	diff_front: DIFF("powertrain_differential_front_locked", "powertrain_differential_front_default"),
	diff_rear: DIFF("powertrain_differential_rear_locked", "powertrain_differential_rear_default"),
	diff_center: DIFF("powertrain_differential_middle_locked", "powertrain_differential_middle_default"),
	diff_all: DIFF("powertrain_differential_closed", "powertrain_differential_open"),
	diff_cycle: DIFF("powertrain_differential_closed", "powertrain_differential_open"),
	range: {
		high: g("powertrain_rangebox_high", P.white),
		low: g("powertrain_rangebox_low", P.green),
		partial: g(["powertrain_rangebox_hi-l", "powertrain_rangebox_low"], P.yellow),
	},
	drive: {
		"2wd": g(["powertrain_shaft_disconnected", "systems_rwd"], P.white, "2WD"),
		"4wd": g(["powertrain_shaft_connected", "systems_awd"], P.green, "4WD"),
		partial: g(["powertrain_shaft_connected", "systems_awd"], P.yellow, "MIXED"),
	},
	pbrake: { on: g("material_local_parking", P.red), off: g("material_local_parking", P.white) },
	lights: {
		off: g("own_headlight_off", P.white),
		low: g("own_headlight_low", P.green),
		high: g("own_headlight_high", P.blue),
	},
	fog: { on: g("radial_fog_lights", P.green), off: g("radial_fog_lights", P.white) },
	hazard: { on: g("radial_hazard_lights", P.red), off: g("radial_hazard_lights", P.white) },
	indicator_left: { on: g(["radial_left_arrow", "material_arrow_back"], P.green), off: g(["radial_left_arrow", "material_arrow_back"], P.white) },
	indicator_right: { on: g(["radial_right_arrow", "material_arrow_forward"], P.green), off: g(["radial_right_arrow", "material_arrow_forward"], P.white) },
	lightbar: { off: g("radial_lightbar", P.white), mode1: g("radial_lightbar", P.yellow), mode2: g("radial_lightbar", P.red) },
	horn: { on: g("material_volume_up", P.yellow), off: g("material_volume_up", P.white) },
	cruise: { on: g("cruise-control_cruise-enable", P.green), off: g(["cruise-control_cruise-disable", "cruise-control_cruise-enable"], P.white) },
	cruise_set: { idle: g("cruise-control_cruise-enable", P.white) },
	cruise_plus: { idle: g("cruise-control_plus-res", P.white) },
	cruise_minus: { idle: g("cruise-control_minus-set", P.white) },
	ebrake: { off: g("garage_brakes", P.white, "ENG BRK"), on: g("garage_brakes", P.yellow) },
	retarder: { off: g("garage_brakes", P.white, "RETARDER"), auto: g("garage_brakes", P.blue), on: g("garage_brakes", P.yellow) },
	air_raise: { off: g(["systems_lift", "material_arrow_upward"], P.white), on: g(["systems_lift", "material_arrow_upward"], P.green) },
	air_lower: { off: g(["systems_suspension", "material_arrow_downward"], P.white), on: g(["systems_suspension", "material_arrow_downward"], P.green) },
	doors: { closed: g(["radial_vehicle_doors_close", "radial_vehicle_doors"], P.white), open: g(["radial_vehicle_doors_open", "radial_vehicle_doors"], P.yellow) },
	door: { closed: g(["radial_vehicle_doors_close", "radial_vehicle_doors"], P.white), open: g(["radial_vehicle_doors_open", "radial_vehicle_doors"], P.yellow) },
	hood: { closed: g(["radial_hinges", "radial_vehicle_doors"], P.white, "BONNET"), open: g(["radial_hinges", "radial_vehicle_doors"], P.yellow, "BONNET") },
	trunk: { closed: g(["radial_hinges", "radial_vehicle_doors"], P.white, "BOOT"), open: g(["radial_hinges", "radial_vehicle_doors"], P.yellow, "BOOT") },
	n2o: { off: g(["powertrain_n2o", "radial_nitrous_oxide"], P.white), armed: g(["powertrain_n2o", "radial_nitrous_oxide"], P.blue), spray: g(["powertrain_n2o", "radial_nitrous_oxide"], P.green) },
	jato: { off: g("powertrain_jato", P.white), on: g("powertrain_jato", P.yellow), empty: g("powertrain_jato", P.off) },
	tire_up: { off: g(["tire-pressure_pressure-increase", "tire-pressure_tire-pressure-fill"], P.white), on: g(["tire-pressure_pressure-increase", "tire-pressure_tire-pressure-fill"], P.green) },
	tire_down: { off: g(["tire-pressure_pressure-decrease", "tire-pressure_tire-pressure-line"], P.white), on: g(["tire-pressure_pressure-decrease", "tire-pressure_tire-pressure-line"], P.yellow) },
	// game functions
	accept: { off: g("material_check", P.green), on: g("material_check", P.green) },
	back: { off: g("material_close", P.red), on: g("material_close", P.red) },
	pause: { off: g("tech_pause", P.white), on: g(["tech_play", "tech_playround"], P.yellow, "PAUSED") },
	repair: { off: g("material_build", P.white), on: g("material_build", P.green) },
	recover: { off: g("material_autorenew", P.white), on: g("material_autorenew", P.green) },
	home: { off: g(["radial_home", "material_home"], P.white), on: g(["radial_home", "material_home"], P.green) },
	// in the car: car lit, arrow out to the person; on foot: person lit, arrow back to the car
	walk: { off: g("own_walk_car", P.white), on: g("own_walk_foot", P.green) },
	map: { off: g("material_map", P.white), on: g("material_map", P.green) },
	vehicles: { off: g("garage_my_cars", P.white), on: g("garage_my_cars", P.green) },
	radial: { off: g("own_radial", P.white), on: g("own_radial", P.green) },
	slowmo: { off: g("mission_system_time", P.white), on: g("mission_system_time", P.yellow) },
	slower: { off: g("material_fast_rewind", P.white), on: g("material_fast_rewind", P.green) },
	faster: { off: g("material_fast_forward", P.white), on: g("material_fast_forward", P.green) },
	ui: { on: g(["material_dashboard", "material_widgets"], P.white), off: g(["material_dashboard", "material_widgets"], P.off) },
	photo: { off: g("material_camera", P.white), on: g("material_camera", P.green) },
	traffic: { off: g("material_traffic", P.white), on: g("material_traffic", P.green) },
	trailer: { off: g(["radial_couplers", "own_hitch"], P.white), on: g(["radial_couplers", "own_hitch"], P.green) },
	nextveh: { off: g("material_directions_car", P.white), on: g("material_directions_car", P.green) },
	up: { off: g("material_keyboard_arrow_up", P.white), on: g("material_keyboard_arrow_up", P.green), walk: g("material_keyboard_arrow_up", P.blue) },
	down: { off: g("material_keyboard_arrow_down", P.white), on: g("material_keyboard_arrow_down", P.green), walk: g("material_keyboard_arrow_down", P.blue) },
	left: { off: g("material_keyboard_arrow_left", P.white), on: g("material_keyboard_arrow_left", P.green), walk: g("material_keyboard_arrow_left", P.blue) },
	right: { off: g("material_keyboard_arrow_right", P.white), on: g("material_keyboard_arrow_right", P.green), walk: g("material_keyboard_arrow_right", P.blue) },
	cam_cycle: { off: g("material_switch_camera", P.white), on: g("material_switch_camera", P.green) },
	cam_prev: { off: g("material_switch_video", P.white), on: g("material_switch_video", P.green) },
	cam_free: { off: g("material_directions_car", P.white), on: g("material_videocam", P.green) },
	cam_center: { off: g("material_center_focus_strong", P.white), on: g("material_center_focus_strong", P.green) },
	cam_orbit: { off: g("tech_camerafocusonvehicle2", P.white, "ORBIT"), on: g("tech_camerafocusonvehicle2", P.green, "ORBIT") },
	cam_driver: { off: g("material_airline_seat_recline_normal", P.white, "DRIVER"), on: g("material_airline_seat_recline_normal", P.green, "DRIVER") },
	cam_chase: { off: g("material_directions_car", P.white, "CHASE"), on: g("material_directions_car", P.green, "CHASE") },
	cam_external: { off: g("material_videocam", P.white, "EXTERNAL"), on: g("material_videocam", P.green, "EXTERNAL") },
	cam_top: { off: g("tech_camerafocustopdown", P.white, "TOP"), on: g("tech_camerafocustopdown", P.green, "TOP") },
	look_back: { off: g("material_flip_to_back", P.white), on: g("material_flip_to_back", P.green) },
	replay: { off: g(["tech_moviecamera", "material_videocam"], P.white), on: g(["tech_moviecamera", "material_videocam"], P.red) },
	replay_eject: { off: g(["material_eject", "own_eject"], P.off), on: g(["material_eject", "own_eject"], P.white) },
	// one key for the whole replay cycle: record > stop recording > stop playing > eject
	replay_ctl: {
		record: g("own_record", P.white),
		recording: g("own_stop", P.red),
		playing: g("own_play_pause", P.yellow),
		loaded: g(["material_eject", "own_eject"], P.green),
		on: g("own_record", P.green),
	},
	turn_left: { off: g("own_turn_left", P.white), on: g("own_turn_left", P.green) },
	turn_right: { off: g("own_turn_right", P.white), on: g("own_turn_right", P.green) },
	sprint: { off: g("own_sprint", P.white), on: g("own_sprint", P.green) },
	reload_lua: { off: g(["material_autorenew", "tech_reload"], P.white), on: g(["material_autorenew", "tech_reload"], P.green) },
	nextveh_named: { off: g("material_directions_car", P.white), on: g("material_directions_car", P.green) },
};

/** Fill in glyph / tint / text for a face from the table (faces that set their own glyph keep it). */
export function withGlyph(f: Face): Face {
	if (f.glyph) return f;
	const row = GLYPHS[f.key];
	if (!row) return f;
	// not on this vehicle: the off / open / closed icon, dimmed
	const states = f.state === "unsupported" ? (f.alt ?? []) : [f.state, ...(f.alt ?? [])];
	for (const st of states) {
		const e = row[st];
		if (e) return { ...f, glyph: e.g, tint: e.t, overlay: f.overlay ?? e.text, dim: f.dim || f.state === "unsupported" };
	}
	return f;
}
