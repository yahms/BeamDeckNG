// The game's own powertrain button bar (the buttons next to Start/Stop: transfer case, diffs, range,
// ESC / drive modes...), mirrored on a Stream Deck key. Works on any vehicle, including mods.

import { action } from "@elgato/streamdeck";
import * as A from "./actions";
import { Command, DeckAction, Settings } from "./actions";
import { PtButton, VehicleStatus } from "./game";
import { C, colorName, Face } from "./icons";

// ---------------------------------------------------------------- the game's powertrain bar

const ptColor = (b: PtButton) => (b.color && /^#?[0-9a-f]{6}$/i.test(b.color) ? `#${b.color.replace("#", "")}` : undefined);

function ptFace(b: PtButton | undefined, label: string): Face {
	if (!b) return A.unsupported("pt", label, []);
	const color = ptColor(b);
	// the game's ESC / drive mode button: coloured icon (esc_blue, esc_yellow...) instead of a ring
	const cname = b.icon === "powertrain_esc" ? colorName(color) : undefined;
	if (cname) {
		return { key: "pt", state: `powertrain_esc_${cname}`, alt: ["powertrain_esc"], label: b.name ?? label, value: (b.name ?? b.id).toUpperCase(), color: color ?? C.off };
	}
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
