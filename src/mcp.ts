// Minimal MCP client for the BeamNG game server: JSON-RPC over streamable HTTP.
// The game replies with plain JSON; SSE "data:" lines are handled too.

export class McpError extends Error {
	constructor(
		message: string,
		readonly code?: number, // JSON-RPC error code, when the server sent one
	) {
		super(message);
	}
}

/** BeamDeckNG MP-MCP refused: not on its server's allowlist, or not something it can do at all. */
export class Blocked extends McpError {
	constructor(
		message: string,
		readonly why: "blocked" | "unavailable" = "blocked",
	) {
		super(message);
	}
}

export class Mcp {
	private id = 0;
	private ready = false;
	// All calls go through one queue so the game never sees overlapping requests from us.
	private chain: Promise<unknown> = Promise.resolve();

	constructor(
		readonly url: string,
		private timeoutMs = 3000,
	) {}

	get connected(): boolean {
		return this.ready;
	}

	private async post(body: object): Promise<string> {
		const ctl = new AbortController();
		const t = setTimeout(() => ctl.abort(), this.timeoutMs);
		try {
			const r = await fetch(this.url, {
				method: "POST",
				headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream" },
				body: JSON.stringify(body),
				signal: ctl.signal,
			});
			const text = await r.text();
			if (!r.ok) throw new McpError(`MCP HTTP ${r.status}: ${text.slice(0, 200)}`);
			return text;
		} catch (e) {
			this.ready = false;
			throw e instanceof McpError ? e : new McpError(`cannot reach MCP at ${this.url}: ${(e as Error).message}`);
		} finally {
			clearTimeout(t);
		}
	}

	private async rpc(method: string, params: object): Promise<any> {
		const id = ++this.id;
		const v = parseBody(await this.post({ jsonrpc: "2.0", id, method, params }));
		if (v.error) throw new McpError(`MCP error: ${JSON.stringify(v.error)}`, typeof v.error.code === "number" ? v.error.code : undefined);
		return v.result ?? null;
	}

	private async initialize(): Promise<void> {
		await this.rpc("initialize", {
			protocolVersion: "2025-06-18",
			capabilities: {},
			clientInfo: { name: "BeamDeckNG", version: "0.1.0" },
		});
		try {
			await this.post({ jsonrpc: "2.0", method: "notifications/initialized" });
		} catch {
			/* notification: response ignored */
		}
		this.ready = true;
	}

	/** Run one request after the ones before it (initializing first if needed). */
	private queue<T>(fn: () => Promise<T>): Promise<T> {
		const run = async () => {
			if (!this.ready) await this.initialize();
			return fn();
		};
		const p = this.chain.then(run, run);
		this.chain = p.catch(() => undefined);
		return p;
	}

	/** Call a tool and return its text content. isError results throw (Blocked for the add-on's refusals). */
	call(name: string, args: object): Promise<string> {
		return this.queue(async () => {
			const r = await this.rpc("tools/call", { name, arguments: args });
			const text = (r?.content ?? [])
				.map((c: any) => c?.text)
				.filter((t: unknown) => typeof t === "string")
				.join("\n");
			if (r?.isError) {
				if (text.startsWith("not allowed on this server")) throw new Blocked(text);
				throw new McpError(`${name} failed: ${text.slice(0, 300)}`);
			}
			return text;
		});
	}

	/** Names of the server's tools. */
	listTools(): Promise<string[]> {
		return this.queue(async () => {
			const r = await this.rpc("tools/list", {});
			return (r?.tools ?? []).map((t: any) => t?.name).filter((n: unknown): n is string => typeof n === "string");
		});
	}

	/** Run Lua in the game-engine VM (synchronous; returns tostring() of the result). */
	runLua(code: string): Promise<string> {
		return this.call("run_lua", { code });
	}
}

function parseBody(text: string): any {
	const t = text.trim();
	if (t.startsWith("{")) return JSON.parse(t);
	for (const line of t.split(/\r?\n/)) {
		if (line.startsWith("data:")) {
			const d = line.slice(5).trim();
			if (d.startsWith("{")) return JSON.parse(d);
		}
	}
	throw new McpError(`unexpected MCP response: ${t.slice(0, 200)}`);
}
