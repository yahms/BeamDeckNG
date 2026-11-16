"""Fake BeamNG on a BeamMP server, for testing the BeamMP add-on.

Runs the real add-on extension (read from dist/BeamDeckNG-MP.zip, so the packaging is tested too) in
a LuaJIT game-engine VM, with a mock BNGWebWSServer that parks HTTP requests until the extension
answers them in its per-frame onUpdate, like the game's C++ server does. The vehicle is the mock 4x4
from mock_vehicle.lua. Also opens a "blocked" native MCP port that accepts connections and never
answers, which is what the game's own server does while BeamMP is connected.

  python3 test/mock_mp.py [addon_port (29392)] [blocked_native_port (39292)] [--old] [--settings file.json]
    --old       pretend to be an older add-on: no beamdeck_info / beamdeck_glyphs tools
    --settings  use this allowlist instead of the one in the zip
    --from server|local   where the mod's zip is (/mods/multiplayer/ = sent by the BeamMP server)
    --session   start inside a BeamMP session (GET /session toggles it later)

Test control on addon_port + 1: GET / returns what the add-on did to the game (triggered actions,
cameras, vehicle electrics); GET /leave fires BeamMP's onBeamMPServerLeave.
"""
import json, socket, sys, threading, time, zipfile
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from lupa import luajit21 as lupa

HERE = __file__.rsplit("/", 1)[0]
argv = sys.argv[1:]
args = [a for i, a in enumerate(argv) if not a.startswith("--") and (i == 0 or argv[i - 1] not in ("--settings", "--from"))]
ADDON_PORT = int(args[0]) if len(args) > 0 else 29392
NATIVE_PORT = int(args[1]) if len(args) > 1 else 39292
OLD = "--old" in sys.argv
SETTINGS = sys.argv[sys.argv.index("--settings") + 1] if "--settings" in sys.argv else None
FROM = sys.argv[sys.argv.index("--from") + 1] if "--from" in sys.argv else "server"
SESSION = "--session" in sys.argv

zf = zipfile.ZipFile(f"{HERE}/../dist/BeamDeckNG-MP-MCP.zip")
VFS = {"/" + n: zf.read(n).decode() for n in zf.namelist()}
if SETTINGS:
    VFS["/beamdeckng_mp/settings.json"] = open(SETTINGS).read()
VFS["/ui/assets/Sprites/svg-symbols.svg"] = '<svg><symbol viewBox="0 0 24 24" id="powertrain_esc"><path d="M1 1"/></symbol></svg>'

lock = threading.RLock()
to_vehicle, to_ge = [], []
events = []  # what the add-on did to the game: triggered actions, cameras...

ge = lupa.LuaRuntime(unpack_returned_tuples=True)
veh = lupa.LuaRuntime(unpack_returned_tuples=True)
veh.globals().__toGE = lambda s: to_ge.append(s)
veh.execute(open(f"{HERE}/mock_vehicle.lua").read())
ge.execute(open(f"{HERE}/mock_vehicle.lua").read().split("FILTER_DIRECT")[0])  # GE jsonEncode
G = ge.globals()

def to_lua(v):
    if isinstance(v, dict):
        t = ge.table()
        for k, x in v.items():
            if x is not None:
                t[k] = to_lua(x)
        return t
    if isinstance(v, list):
        t = ge.table()
        for i, x in enumerate(v):
            t[i + 1] = to_lua(x)
        return t
    return v

def json_decode(s):
    return to_lua(json.loads(s))

G.jsonDecode = json_decode
G.jsonReadFile = lambda p: to_lua(json.loads(VFS[p])) if p in VFS else None
G.readFile = lambda p: VFS.get(p)
G.__toVeh = lambda s: to_vehicle.append(s)
trailer = lupa.LuaRuntime(unpack_returned_tuples=True)
trailer.execute("electrics = { values = {} }")
G.__toTrailer = lambda s: trailer.execute(s)
G.__event = lambda *a: events.append([str(x) for x in a])
G.__log = lambda lvl, tag, msg: print(f"[{lvl}] {tag}: {msg}", flush=True)

# ---- mock BNGWebWSServer: parks requests until respondHttp
parked = {}  # id -> {"ev": Event, "status", "body"}
inbox = []
next_id = [0]
servers = {}

class H(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"
    def log_message(self, *a): pass
    def _park(self, method, body):
        with lock:
            next_id[0] += 1
            rid = next_id[0]
            slot = {"ev": threading.Event()}
            parked[rid] = slot
            inbox.append({"id": rid, "method": method, "body": body})
        if not slot["ev"].wait(10):
            self.send_response(504); self.send_header("Content-Length", "0"); self.end_headers(); return
        b = slot["body"].encode()
        self.send_response(slot["status"])
        self.send_header("Content-Type", slot["ctype"])
        self.send_header("Content-Length", str(len(b)))
        self.end_headers()
        self.wfile.write(b)
    def do_POST(self):
        n = int(self.headers.get("Content-Length") or 0)
        self._park("POST", self.rfile.read(n).decode())
    def do_GET(self):
        self._park("GET", "")

class Srv:
    def __init__(self, host, port):
        ThreadingHTTPServer.request_queue_size = 128
        self.http = ThreadingHTTPServer((host, port), H)
        self.http.daemon_threads = True
        threading.Thread(target=self.http.serve_forever, daemon=True).start()
    def enableHttpHandler(self, route): pass
    def isListening(self): return True
    def getHttpRequests(self):
        with lock:
            reqs = list(inbox); inbox.clear()
        return to_lua(reqs)
    def respondHttp(self, rid, status, ctype, body):
        slot = parked.pop(rid, None)
        if slot:
            slot.update(status=int(status), ctype=ctype, body=body); slot["ev"].set()

def ws_create(host, port, *a):
    s = Srv(host, int(port)); servers[int(port)] = s
    print(f"mock BNGWebWSServer listening on {host}:{port}", flush=True)
    return s

def ws_destroy(s):
    for k in [k for k, v in servers.items() if v is s]: servers.pop(k)
    s.http.shutdown(); s.http.server_close()
    print("mock BNGWebWSServer destroyed", flush=True)

G.__ORIGIN = "/mods/multiplayer/BeamDeckNG-MP-MCP.zip" if FROM == "server" else "/mods/BeamDeckNG-MP-MCP.zip"
G.__SESSION = SESSION
ge.execute("""
BNGWebWSServer = {}
local V = {}
function V:getID() return 33139 end
function V:queueLuaCommand(s) __toVeh(s) end
function V:getJBeamFilename() return "pickup" end
V.color = "0.8, 0.1, 0.1, 1"
be = {}
function be:getPlayerVehicle(i) return V end
function be:getPlayerVehicleID(i) return 33139 end
function be:getObjectByID(id) return V end
function log(l, t, m) __log(l, t, m) end
simTimeAuthority = { getPause = function() return false end, get = function() return 1 end }
core_camera = {
  getActiveCamName = function() return CAM or "chase" end,
  setByName = function(_, n) CAM = n __event("set_camera", n) end,
  getCameraDataById = function() return { ["occupant.FL"] = {}, chase = {}, orbit = {} } end,
  isWorldCamera = function() return false end,
  setVehicleCameraByNameWithId = function(id, n) CAM = n __event("cam", n) end,
  setVehicleCameraByIndexOffset = function(_, d) __event("cam_offset", d) end,
  getDriverCameraNameById = function() return "occupant.FL" end,
}
-- the game's action filter (BeamMP and game modes block keys with it): pretend photo mode is blocked
core_input_actionFilter = { isActionBlocked = function(n) return n == "photomode" or n == "pickup__worklights" and WL_BLOCKED == true end }
core_input_actions = {
  triggerDown = function(n) __event("down", n) end,
  triggerUp = function(n) __event("up", n) end,
  triggerDownUp = function(n) __event("tap", n) end,
  getActiveActions = function() return VA end,
}
core_vehicles = { getVehicleDetails = function() return { model = { Name = "Pickup" } } end }
-- the player vehicle's own controls (jbeam inputActions + actionsEnabled), and a towed trailer with a ramp
local PICKUP = {
  tiltUp = { title = "Tilt up", onChange = "electrics.values.upfit_tilt = VALUE" },
  tiltDown = { title = "Tilt down", onChange = "electrics.values.upfit_tilt = -VALUE" },
  door_FL = { title = "Toggle Front Left Door", onDown = "controller.getControllerSafe('door_FL_coupler').toggleGroup()" },
  worklights = { title = "Work Lights", onDown = "electrics.values.worklights = 1 - (electrics.values.worklights or 0)" },
  jato = { title = "JATO", onDown = "electrics.values.jato = 1" },
  notEnabled = { title = "Not on this config", onDown = "electrics.values.nope = 1" },
}
local TRAILER = { ramp_down = { title = "Ramp Down", onChange = "electrics.values.ramp = VALUE" } }
local function enabled(t, skip) local e = {} for k in pairs(t) do if k ~= skip then e[#e + 1] = { name = k } end end return e end
core_vehicle_manager = { getVehicleData = function(vid)
  if vid == 777 then return { vdata = { inputActions = TRAILER, actionsEnabled = enabled(TRAILER) } } end
  return { vdata = { inputActions = PICKUP, actionsEnabled = enabled(PICKUP, "notEnabled") } }
end }
local T2 = { getJBeamFilename = function() return "tiltdeck" end, queueLuaCommand = function(_, s) __toTrailer(s) end }
function getObjectByID(id) if id == 777 then return T2 end if id == 33139 then return be:getPlayerVehicle(0) end end
core_trailerRespawn = { getTrailerData = function() return TOWING and { [33139] = { trailerId = 777 } } or {} end }
VA = { pickup__worklights = { vehicle = "pickup", cat = "vehicle_specific", title = "Work Lights" }, menu_item_select = { cat = "menu", title = "Select" } }
local uiOn = true
-- BeamMP and the game's mod manager: where this zip came from, and whether we're in a session
ORIGIN = __ORIGIN
SESSION = __SESSION
FS = { getOriginArchivePathRelative = function(_, p) return ORIGIN end, findFiles = function() return {} end }
MPCoreNetwork = { isMPSession = function() return SESSION end }
MPModManager = { isModAllowed = function(n) return n == "multiplayerbeamdeckng-mp-mcp" end }
function ui_message(text, ttl, cat, icon) __event("message", text, cat, icon) end
core_environment = {
  getTimeOfDay = function() return { time = 0.25, play = false, dayLength = 1800 } end,
  getState = function() return { cloudCover = 0.1, fogDensity = 0.01, windSpeed = 0, gravity = -9.81 } end,
  getInitState = function() return { fogDensity = 0.01 } end,
}
scenetree = { findClassObjects = function() return {} end }
extensions = { ui_router = { navigate = function(r) __event("navigate", r) end }, ui_visibility = { getCef = function() return uiOn end, toggle = function() uiOn = not uiOn __event("ui", uiOn) end,
  set = function(v) uiOn = v end, get = function() return uiOn end } }
function extensions.unload(n) __event("unload", n) UNLOADED = true end
function extensions.load(n) end
function setExtensionUnloadMode() end
os.exit = function() error("os.exit called") end
""")
G.BNGWebWSServer.getOrCreate = ws_create
G.BNGWebWSServer.destroy = ws_destroy

# load the add-on from the zip, as the game's extension loader would
ext = ge.execute(VFS["/lua/ge/extensions/beamdeckngMP.lua"])
G.__ADDON = ext
if OLD:
    ge.execute("__ADDON._tools.beamdeck_info = nil; __ADDON._tools.beamdeck_glyphs = nil")
ext.onInit()
ext.onExtensionLoaded()

# ---- the "blocked" native MCP: accepts, never answers (BeamMP session)
def blackhole():
    s = socket.socket(); s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    s.bind(("127.0.0.1", NATIVE_PORT)); s.listen(16)
    held = []
    while True:
        c, _ = s.accept(); held.append(c)
threading.Thread(target=blackhole, daemon=True).start()

frames = [0]
def frame_loop():
    while True:
        time.sleep(1 / 30)
        with lock:
            while to_vehicle:
                code = to_vehicle.pop(0)
                try: veh.execute(code)
                except Exception as e: print("VEHICLE LUA ERROR:", str(e)[:400], file=sys.stderr, flush=True)
            veh.globals().__frame()
            while to_ge:
                code = to_ge.pop(0)
                try: ge.execute(code)
                except Exception as e: print("GE LUA ERROR:", str(e)[:400], file=sys.stderr, flush=True)
            if not G.UNLOADED:
                ext.onUpdate(1 / 30)
            frames[0] += 1
threading.Thread(target=frame_loop, daemon=True).start()

# events are exposed over a tiny side port (addon_port + 1) for the test script
class E(BaseHTTPRequestHandler):
    def log_message(self, *a): pass
    def do_GET(self):
        if self.path == "/leave":
            with lock: ext.onBeamMPServerLeave()
        if self.path == "/tow":
            with lock: ge.execute("TOWING = true")
        if self.path == "/blockwl":
            with lock: ge.execute("WL_BLOCKED = true")
        if self.path == "/session":
            with lock: ge.execute("SESSION = not SESSION")
        with lock:
            out = {"events": events, "frames": frames[0], "unloaded": bool(G.UNLOADED), "listening": len(servers) > 0,
                   "veh": {k: veh.eval(f"electrics.values.{k}") for k in ("horn", "hazard_enabled", "lights_state", "upfit_tilt", "worklights", "jato", "nope")},
                   "trailer": {"ramp": trailer.eval("electrics.values.ramp")}}
        b = json.dumps(out).encode()
        self.send_response(200); self.send_header("Content-Length", str(len(b))); self.end_headers(); self.wfile.write(b)
threading.Thread(target=ThreadingHTTPServer(("127.0.0.1", ADDON_PORT + 1), E).serve_forever, daemon=True).start()
print("mock BeamMP ready", flush=True)
while True:
    time.sleep(1)
