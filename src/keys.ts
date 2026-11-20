// Real keyboard input, for the keys that are best held and timed by hand (arrows, Insert to recover).
// Windows only: a small PowerShell helper, started once, sends the key presses with SendInput, as
// scan codes, like a keyboard does (and like Stream Deck's own Hotkey action). The game window must be
// the focused window. Anywhere else (or if the helper can't start) keys fall back to the game's actions.
import { ChildProcess, spawn } from "node:child_process";
import { writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import streamDeck from "@elgato/streamdeck";

/** Scan code and whether it's an extended key (arrows, Insert...: the 0xE0 ones, not the numpad's). */
export const KEYS: Record<string, [number, boolean]> = {
	up: [0x48, true],
	down: [0x50, true],
	left: [0x4b, true],
	right: [0x4d, true],
	insert: [0x52, true],
	home: [0x47, true],
	escape: [0x01, false],
	enter: [0x1c, false],
	lshift: [0x2a, false],
	pageup: [0x49, true],
	pagedown: [0x51, true],
};

const SCRIPT = String.raw`$ErrorActionPreference = 'Stop'
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public static class BeamDeckKeys {
  [StructLayout(LayoutKind.Sequential)] struct KEYBDINPUT { public ushort wVk; public ushort wScan; public uint dwFlags; public uint time; public IntPtr dwExtraInfo; }
  [StructLayout(LayoutKind.Sequential)] struct MOUSEINPUT { public int dx; public int dy; public uint mouseData; public uint dwFlags; public uint time; public IntPtr dwExtraInfo; }
  [StructLayout(LayoutKind.Explicit)] struct UNION { [FieldOffset(0)] public MOUSEINPUT mi; [FieldOffset(0)] public KEYBDINPUT ki; }
  [StructLayout(LayoutKind.Sequential)] struct INPUT { public uint type; public UNION u; }
  [DllImport("user32.dll", SetLastError = true)] static extern uint SendInput(uint n, INPUT[] inputs, int size);
  public static uint Send(ushort scan, bool extended, bool up) {
    INPUT[] i = new INPUT[1];
    i[0].type = 1;
    i[0].u.ki.wScan = scan;
    i[0].u.ki.dwFlags = 0x0008u | (extended ? 0x0001u : 0u) | (up ? 0x0002u : 0u);
    return SendInput(1, i, Marshal.SizeOf(typeof(INPUT)));
  }
}
"@
[Console]::Out.WriteLine('ready')
while ($true) {
  $l = [Console]::In.ReadLine()
  if ($l -eq $null) { break }
  $p = $l.Split(' ')
  if ($p.Length -ge 3) {
    $n = [BeamDeckKeys]::Send([uint16]$p[0], $p[1] -eq '1', $p[2] -eq 'u')
    if ($n -ne 1) { [Console]::Out.WriteLine('fail ' + $l) }
  }
}
`;

let helper: ChildProcess | undefined;
let dead = process.platform !== "win32";

function start(): ChildProcess | undefined {
	if (dead) return undefined;
	if (helper) return helper;
	try {
		const file = path.join(os.tmpdir(), "beamdeckng-keys.ps1");
		writeFileSync(file, SCRIPT);
		const p = spawn("powershell.exe", ["-NoLogo", "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", file], {
			stdio: ["pipe", "pipe", "pipe"],
			windowsHide: true,
		});
		p.stdout?.on("data", (d: Buffer) => streamDeck.logger.info(`keys: ${d.toString().trim()}`));
		p.stderr?.on("data", (d: Buffer) => streamDeck.logger.warn(`keys: ${d.toString().trim()}`));
		p.on("error", (err) => {
			streamDeck.logger.warn(`keyboard helper failed: ${err.message}`);
			dead = true;
			helper = undefined;
		});
		p.on("exit", (code) => {
			streamDeck.logger.warn(`keyboard helper exited (${code})`);
			helper = undefined;
		});
		helper = p;
		return p;
	} catch (err) {
		streamDeck.logger.warn(`keyboard helper: ${(err as Error).message}`);
		dead = true;
		return undefined;
	}
}

/** Start the helper ahead of the first press (PowerShell takes a moment to start). */
export function warmKeys(): void {
	start();
}

/** Can real key presses be sent here? */
export const keysAvailable = () => !dead;

/** Press (down) or release (up) a key. False if real key presses aren't available. */
export function sendKey(key: string, down: boolean): boolean {
	const k = KEYS[key];
	const p = k && start();
	if (!k || !p?.stdin?.writable) return false;
	p.stdin.write(`${k[0]} ${k[1] ? 1 : 0} ${down ? "d" : "u"}\n`);
	return true;
}
