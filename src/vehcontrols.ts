// Vehicle-specific controls for the auto "Vehicle control" keys.
//
// Every vehicle declares its own input actions (vehicles/<model>/input_actions*.json and jbeam), the
// same ones the game's Controls menu lists under the vehicle: tray tilt, hydraulics, fifth wheel,
// spinner speed... This turns the game's list for the current vehicle into a short, ordered list of
// keys: things BeamDeckNG already has a set button for (diffs, range, lights, cruise...) and
// passenger doors are left out, held movements become one key per direction, and an "Up/Down" axis
// with no separate up and down actions is split into two keys.
//
// Pure functions: no game access, so the rules can be tested against real vehicles' lists.

/** One input action as the game lists it (lua/controls.lua). */
export type RawControl = {
	id: string; // action name without the "<model>__" prefix
	title: string; // translated title
	down?: boolean; // has onDown
	up?: boolean; // has onUp
	change?: boolean; // has onChange (an axis: VALUE 0..1, or -1..1)
	code?: string; // onDown or onChange code (start of it), for classifying and state
};

/** One auto key. */
export type VControl = {
	id: string; // the action to run
	label: string; // short name for the key
	/** tap: run once; hold: run on press and again (onUp / VALUE 0) on release. */
	kind: "tap" | "hold";
	/** VALUE on press (1, or -1 for the reverse half of a split axis). */
	value: number;
	/** True if the action's code runs on release (onUp, or an axis back to 0). */
	release: boolean;
	group: string; // what it is about, for ordering and the CSV ("work", "towing", ...)
	/** Which vehicle: 0 / missing = the one you drive, 1 = what it tows, 2 = what that tows. */
	t?: number;
	/** Live state, when the code shows what it toggles. */
	state?: { electric: string } | { coupler: string };
};

export type Verdict = { id: string; title: string; verdict: "key" | "covered" | "skipped"; why?: string; keys: number };

// ---- what is left out, and why

/** Already a BeamDeckNG set button (per vehicle, the generic keys handle these). */
const COVERED: [RegExp, string][] = [
	[/diff/i, "Diff lock key"],
	[/transfercase|rangebox|splitter|4wd|awd/i, "Range / 2WD-4WD keys"],
	[/lightbar|siren|beacon/i, "Lightbar key"],
	[/cruise|cointrol/i, "Cruise control key"],
	[/retarder/i, "Retarder key"],
	[/compressionbrake/i, "Engine brake key"],
	[/parkingbrake/i, "Parking brake key"],
	[/lowbeam|highbeam|headlight/i, "Headlights key"],
	[/^jato/i, "JATO key"],
	[/nitrous|n2o/i, "Nitrous key"],
	[/^hood|^trunk$|decklid/i, "Doors / bonnet / boot key"],
	[/rideheight/i, "Air suspension key"],
];

/** Left out on purpose. */
const SKIPPED: [RegExp, string][] = [
	[/^door_(?!rear)|sidedoor|sleeper_door|cabinet_door/i, "passenger door"],
	[/sunvisor|sunshade/i, "sunvisor"],
	[/domelight|doorlights/i, "interior light"],
	[/panel_access|fascia|sideskirt/i, "body panel"],
	[/modeaxis$/i, "mode axis (the toggle / set actions cover it)"],
];

/** Group by what the action is about: order of the keys, and a column in the CSV. */
const GROUPS: [RegExp, string][] = [
	[/fifthwheel|hitch|pintle|gooseneck|trailerair|coupl|detach|liftaxle/i, "towing"],
	[/hydraul|tilt|lift|lower|raise|hop|extend|retract|ramp|bed|tray|dump|arm|bucket|rimpull|feet|jack|crush|open|close|spin|rpm|roller|throttle|shoot|cannon|barrel|force|strength|mixer|pto/i, "work"],
	[/idle|hillassist|brakecutoff|gear|steercolumn/i, "driving"],
	[/light|lamp|beacon/i, "lights"],
	[/tailgate|cargo|barndoor|door_rear|toolbox|lid|hatch|latch|sidegate|boot|cab|row|roof|step|spare/i, "body"],
];
const GROUP_ORDER = ["work", "towing", "driving", "lights", "body", "other"];

const first = (rules: [RegExp, string][], s: string) => rules.find(([re]) => re.test(s))?.[1];

/** Wording that doesn't fit on a key. */
const SHORTER: [RegExp, string][] = [
	[/Momentary Manual Idle Raise/i, "Idle Up (hold)"],
	[/Manual Idle Raise/i, "Idle Up"],
	[/Set Hydraulic PTO Control Output/i, "PTO"],
	[/^Actuate\s+/i, ""],
	[/^Open\/Close\s+/i, ""],
	[/Fifth ?wheel/i, "5th Wheel"],
	[/\s+Brake Coef\b/i, ""],
	[/Air Suspension( Height)?/i, "Air"],
	[/Front Compartment Door/i, "Front Locker"],
];

/** "Lowrider: Raise Front" -> "Raise Front"; trims "Toggle " and long titles. */
export function shortLabel(title: string): string {
	let t = title.replace(/^[^:]{2,20}:\s*/, "").replace(/^Toggle\s+/i, "").replace(/\s*\(.*\)\s*$/, "").trim();
	if (/Momentary/i.test(title)) t = title;
	for (const [re, to] of SHORTER) t = t.replace(re, to).trim();
	if (t.length > 22) t = t.slice(0, 21) + "…";
	return t || title;
}

/** A combined axis next to separate up / down actions ("Open & close", "Lift / Lower Barrel", "Lift Up/Down"). */
const combinedTitle = (t: string) => /[/&]|\baxis\b/i.test(t);

/** What a tap toggles, from its code. */
function stateOf(code: string): VControl["state"] {
	const e = code.match(/electrics\.values\.(\w+)\s*=\s*(?:1\s*-\s*\(?\s*electrics\.values\.\1|electrics\.values\.\1\s*==)/);
	if (e) return { electric: e[1] };
	const c = code.match(/getControllerSafe\('([\w.]+)'\)\.toggle(?:Group|LockState)/);
	if (c) return { coupler: c[1] };
	return undefined;
}

/**
 * The game's list of a vehicle's own controls -> its auto keys, in order, and a verdict for every
 * action (for the CSV / README).
 */
export function classify(raw: RawControl[]): { keys: VControl[]; verdicts: Verdict[] } {
	const list = raw.filter((a) => a && typeof a.id === "string" && !/^\d+$/.test(a.id));
	const keys: VControl[] = [];
	const verdicts: Verdict[] = [];
	const text = (a: RawControl) => `${a.id} ${a.title}`;

	// actions that come as a toggle plus enable / disable: keep the toggle
	const toggles = new Set(list.filter((a) => /^toggle/i.test(a.id)).map((a) => a.id.replace(/^toggle/i, "").toLowerCase()));

	for (const a of list) {
		const code = a.code ?? "";
		const covered = first(COVERED, a.id);
		const skipped = covered ? undefined : first(SKIPPED, a.id);
		const v = (verdict: Verdict["verdict"], why?: string, n = 0) => verdicts.push({ id: a.id, title: a.title, verdict, why, keys: n });
		if (covered) { v("covered", covered); continue; }
		if (skipped) { v("skipped", skipped); continue; }
		const base = a.id.replace(/^(enable|disable)/i, "").toLowerCase();
		if (/^(enable|disable)/i.test(a.id) && toggles.has(base)) { v("skipped", "toggle action covers it"); continue; }
		// a tap that takes VALUE is a setter meant for an analog input (hillAssistSet, frontBrakeCutoffSet)
		if (!a.change && !a.up && /\bVALUE\b/.test(code)) { v("skipped", "analog setter"); continue; }

		const group = first(GROUPS, text(a)) ?? "other";
		const label = shortLabel(a.title);
		if (a.change) {
			// axis. No VALUE in the code (a toggle bound as an axis, e.g. the tilt deck's toolbox): one tap.
			if (!/\bVALUE\b/.test(code)) {
				keys.push({ id: a.id, label, kind: "tap", value: 1, release: false, group, state: stateOf(code) });
				v("key", undefined, 1);
				continue;
			}
			const signed = /-\s*VALUE|\(\s*-\s*VALUE/.test(code) || list.some((b) => b !== a && b.change && sameTarget(b.code ?? "", code));
			if (combinedTitle(a.title) && list.filter((b) => b !== a && b.change && family(b.id) === family(a.id)).length >= 2) {
				v("skipped", "combined axis (separate up / down actions)");
				continue;
			}
			if (!signed && (combinedTitle(a.title) || /axis$/i.test(a.id))) {
				// one axis for both directions and nothing else for it ("Tilt Up/Down"): two keys
				const [one, two] = splitTitle(a.title);
				keys.push({ id: a.id, label: one, kind: "hold", value: 1, release: true, group });
				keys.push({ id: a.id, label: two, kind: "hold", value: -1, release: true, group });
				v("key", "split into two directions", 2);
				continue;
			}
			keys.push({ id: a.id, label, kind: "hold", value: 1, release: true, group });
			v("key", undefined, 1);
			continue;
		}
		if (a.up) {
			keys.push({ id: a.id, label, kind: "hold", value: 1, release: true, group });
			v("key", undefined, 1);
			continue;
		}
		keys.push({ id: a.id, label, kind: "tap", value: 1, release: false, group, state: stateOf(code) });
		v("key", undefined, 1);
	}
	// order: by group, then keep pairs (up / down, raise / lower) next to each other
	const g = (k: VControl) => GROUP_ORDER.indexOf(k.group);
	const pos = new Map(keys.map((k, i) => [k, i]));
	keys.sort((x, y) => g(x) - g(y) || family(x.id).localeCompare(family(y.id)) || (pos.get(x)! - pos.get(y)!));
	return { keys, verdicts };
}

/** The part of an action's code that says what it moves, without the direction. */
function sameTarget(a: string, b: string): boolean {
	const t = (c: string) => c.replace(/-\s*VALUE/g, "VALUE").replace(/\s+/g, "");
	return t(a) === t(b) && a !== b;
}

/** Name without its direction word, to keep pairs together: "tiltUp" / "tiltDown" -> "tilt". */
export function family(id: string): string {
	return id
		.toLowerCase()
		.replace(/(up|down|raise|lower|increase|decrease|inc|dec|extend|retract|open|close|lift|left|right|in|out|on|off|higher|forward|back)(?=_|$)/g, "")
		.replace(/^(raise|lower|increase|decrease|extend|retract|open|close|lift)_?/, "")
		.replace(/[_]+$/, "");
}

/** "Tilt Up/Down" -> ["Tilt Up", "Tilt Down"]; anything else -> ["<t> +", "<t> -"]. */
function splitTitle(t: string): [string, string] {
	t = t.replace(/\s*\baxis\b\s*/i, " ").trim();
	const m = t.match(/^(.*?)\s*(\w+)\s*\/\s*(\w+)\s*$/);
	if (m) return [shortLabel(`${m[1]} ${m[2]}`.trim()), shortLabel(`${m[1]} ${m[3]}`.trim())];
	const s = shortLabel(t);
	return [`${s} +`, `${s} −`];
}
