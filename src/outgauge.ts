// OutGauge: the game's read-only UDP telemetry (Options > Other > Protocols > OutGauge).
//
// Used as a fallback when MCP isn't answering, e.g. on a BeamMP server, where BeamMP stops the
// game's MCP server from handling requests. OutGauge only carries dashboard data (speed, gear,
// rpm, temps, fuel, high beam, handbrake, indicators), so only the keys showing those keep working,
// and they show state only: presses still need MCP.
//
// Packet (LFS OutGauge layout, little-endian, 92 bytes, or 96 with the optional ID):
//   0 time u32 (always 0)   4 car char[4] ("beam")   8 flags u16   10 gear u8 (R 0, N 1, 1st 2...)
//  11 plid u8   12 speed f32 m/s   16 rpm   20 turbo bar   24 engTemp C   28 fuel 0..1
//  32 oilPressure (always 0)   36 oilTemp C   40 dashLights u32 (available)   44 showLights u32 (on)
//  48 throttle   52 brake   56 clutch   60 display1[16]   76 display2[16]   (92 id i32)

import dgram from "node:dgram";
import type { VehicleStatus } from "./game";

const OG_TURBO = 8192;
const DL_SHIFT = 1 << 0;
const DL_FULLBEAM = 1 << 1;
const DL_HANDBRAKE = 1 << 2;
const DL_SIGNAL_L = 1 << 5;
const DL_SIGNAL_R = 1 << 6;

const BAR_TO_PSI = 14.5038;
/** Indicator lamps blink; a signal counts as on if its lamp was lit this recently. */
const SIGNAL_LATCH_MS = 1200;

export type OgPacket = {
	flags: number;
	gear: number;
	speed: number;
	rpm: number;
	turbo: number;
	engTemp: number;
	fuel: number;
	oilTemp: number;
	dash: number;
	show: number;
	throttle: number;
	brake: number;
	clutch: number;
};

/**
 * One OutGauge packet, or null for anything else. Several protocols can share a port
 * (MotionSim packets start with "BNG1"), so check the size and the "beam" car name.
 */
export function parseOutGauge(b: Buffer): OgPacket | null {
	if ((b.length !== 92 && b.length !== 96) || b.toString("latin1", 4, 8) !== "beam") return null;
	return {
		flags: b.readUInt16LE(8),
		gear: b.readUInt8(10),
		speed: b.readFloatLE(12),
		rpm: b.readFloatLE(16),
		turbo: b.readFloatLE(20),
		engTemp: b.readFloatLE(24),
		fuel: b.readFloatLE(28),
		oilTemp: b.readFloatLE(36),
		dash: b.readUInt32LE(40),
		show: b.readUInt32LE(44),
		throttle: b.readFloatLE(48),
		brake: b.readFloatLE(52),
		clutch: b.readFloatLE(56),
	};
}

export class OutGauge {
	private sock?: dgram.Socket;
	private last?: OgPacket;
	private lastAt = 0;
	private seenL = 0;
	private seenR = 0;
	private seenBoth = 0;
	private live = false;
	private listeners = new Set<() => void>();
	private retry?: NodeJS.Timeout;

	constructor(
		readonly host = "127.0.0.1",
		readonly port = 4444,
		private log: (msg: string) => void = () => undefined,
		/** No packet for this long: the game stopped sending (closed, no vehicle, OutGauge off). */
		private staleMs = 1500,
	) {}

	/** Listen for packets. If the port is taken (SimHub or another dashboard), try again later. */
	start(): void {
		if (this.sock) return;
		const s = dgram.createSocket({ type: "udp4", reuseAddr: false });
		this.sock = s;
		s.on("message", (msg) => this.packet(msg, Date.now()));
		s.on("error", (err: NodeJS.ErrnoException) => {
			this.log(`OutGauge: cannot listen on ${this.host}:${this.port} (${err.code ?? err.message}); trying again in 30 s`);
			s.close();
			this.sock = undefined;
			clearTimeout(this.retry);
			this.retry = setTimeout(() => this.start(), 30_000);
		});
		s.on("listening", () => this.log(`OutGauge: listening on ${this.host}:${this.port}`));
		s.bind(this.port, this.host);
	}

	stop(): void {
		clearTimeout(this.retry);
		this.sock?.close();
		this.sock = undefined;
	}

	/** Called after every OutGauge packet (for redraws). */
	onData(cb: () => void): void {
		this.listeners.add(cb);
	}

	/** Feed one datagram (exposed for tests). */
	packet(msg: Buffer, now: number): void {
		const p = parseOutGauge(msg);
		if (!p) return;
		this.last = p;
		this.lastAt = now;
		const l = (p.show & DL_SIGNAL_L) !== 0, r = (p.show & DL_SIGNAL_R) !== 0;
		if (l) this.seenL = now;
		if (r) this.seenR = now;
		if (l && r) this.seenBoth = now; // both lamps lit together: hazards
		if (!this.live) {
			this.live = true;
			this.log("OutGauge: receiving");
		}
		for (const cb of this.listeners) cb();
	}

	/** The latest packet as a vehicle status, or undefined if nothing recent arrived. */
	status(now = Date.now()): VehicleStatus | undefined {
		const p = this.last;
		if (!p || now - this.lastAt > this.staleMs) {
			if (this.live) {
				this.live = false;
				this.log("OutGauge: stopped receiving");
			}
			return undefined;
		}
		const has = (bit: number) => (p.dash & bit) !== 0;
		const on = (bit: number) => (p.show & bit) !== 0;
		const s: VehicleStatus = {
			g: {
				spd: p.speed,
				gi: p.gear - 1, // R -1, N 0, 1st 1...
				rpm: p.rpm,
				fuel: p.fuel,
				// exactly 0: not reported (electric vehicles)
				water: p.engTemp || undefined,
				oil: p.oilTemp || undefined,
				boost: p.flags & OG_TURBO ? Math.max(0, p.turbo * BAR_TO_PSI) : undefined,
				shift: has(DL_SHIFT) ? on(DL_SHIFT) : undefined,
			},
		};
		if (has(DL_HANDBRAKE)) s.pbrake = on(DL_HANDBRAKE);
		// OutGauge only knows high beam; low beam vs off is unknown, so headlights are only shown on high.
		if (has(DL_FULLBEAM) && on(DL_FULLBEAM)) s.lights = 2;
		if (has(DL_SIGNAL_L) || has(DL_SIGNAL_R)) {
			const hazard = now - this.seenBoth < SIGNAL_LATCH_MS;
			s.hazard = hazard ? 1 : 0;
			// with hazards on, the indicator switches themselves are off (as MCP reports it)
			s.sigL = !hazard && now - this.seenL < SIGNAL_LATCH_MS ? 1 : 0;
			s.sigR = !hazard && now - this.seenR < SIGNAL_LATCH_MS ? 1 : 0;
		}
		return s;
	}
}
