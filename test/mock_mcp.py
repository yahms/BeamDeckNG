"""Fake BeamNG MCP server: real LuaJIT VMs for the game engine and one vehicle, with
queueLuaCommand / queueGameEngineLua delivered on a ~30 Hz frame loop like the game does.
Only run_lua and run_lua_vehicle are implemented (enough for BeamDeck and for a conflict check)."""
import json, sys, threading, time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from lupa import luajit21 as lupa

HERE = __file__.rsplit("/", 1)[0]
lock = threading.Lock()
to_vehicle, to_ge = [], []
calls = {"run_lua": 0, "run_lua_vehicle": 0}
paused = {"on": False}

ge = lupa.LuaRuntime(unpack_returned_tuples=True)
veh = lupa.LuaRuntime(unpack_returned_tuples=True)
veh.globals().__toGE = lambda s: to_ge.append(s)
veh.execute(open(f"{HERE}/mock_vehicle.lua").read())
ge.execute("""
local V = {}
function V:getID() return 33139 end
function V:queueLuaCommand(s) __toVeh(s) end
be = {}
function be:getPlayerVehicle(i) return V end
""")
ge.globals().__toVeh = lambda s: to_vehicle.append(s)
# GE jsonEncode must run in the GE VM (it gets GE tables): load a copy there
ge.execute(open(f"{HERE}/mock_vehicle.lua").read().split("FILTER_DIRECT")[0])

def frames():
    while True:
        time.sleep(1 / 30)
        with lock:
            if paused["on"]:
                continue
            while to_vehicle:
                code = to_vehicle.pop(0)
                try:
                    veh.execute(code)
                except Exception as e:
                    print("VEHICLE LUA ERROR:", str(e)[:400], file=sys.stderr)
            veh.globals().__frame()
            while to_ge:
                code = to_ge.pop(0)
                try:
                    ge.execute(code)
                except Exception as e:
                    print("GE LUA ERROR:", str(e)[:400], file=sys.stderr)

threading.Thread(target=frames, daemon=True).start()

def run_lua(code):
    with lock:
        f = ge.eval("function(src) local f, err = loadstring(src) if not f then error(err) end return f end")(code)
        r = f()
        return "nil" if r is None else str(r) if not isinstance(r, bool) else str(r).lower()

class H(BaseHTTPRequestHandler):
    def log_message(self, *a): pass
    def do_POST(self):
        req = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
        if "id" not in req:
            self.send_response(202); self.end_headers(); return
        m = req["method"]
        if m == "initialize":
            res = {"protocolVersion": "2025-06-18", "serverInfo": {"name": "beamng-game", "version": "1.0.0"}, "capabilities": {"tools": {}}}
        elif m == "tools/call":
            name, args = req["params"]["name"], req["params"]["arguments"]
            calls[name] = calls.get(name, 0) + 1
            if name == "run_lua":
                try:
                    res = {"content": [{"type": "text", "text": run_lua(args["code"])}]}
                except Exception as e:
                    res = {"content": [{"type": "text", "text": str(e)[:500]}], "isError": True}
            elif name == "mock_pause":
                paused["on"] = bool(args.get("on"))
                res = {"content": [{"type": "text", "text": "ok"}]}
            else:
                res = {"content": [{"type": "text", "text": "not mocked"}], "isError": True}
        else:
            res = {}
        body = json.dumps({"jsonrpc": "2.0", "id": req["id"], "result": res}).encode()
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

port = int(sys.argv[1]) if len(sys.argv) > 1 else 29292
print("mock MCP on", port, flush=True)
ThreadingHTTPServer(("127.0.0.1", port), H).serve_forever()
