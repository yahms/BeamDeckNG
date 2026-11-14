-- Fake BeamNG vehicle VM: a 4x4 with front/rear lockers, range box, part-time front drive,
-- TC via drive modes (comfort/sport/off) and a rearLockControl driveModes controller.

function jsonEncode(x)
  local t = type(x)
  if t == "nil" then return "null" end
  if t == "boolean" or t == "number" then return tostring(x) end
  if t == "string" then
    return '"' .. x:gsub('[%c"\\]', function(c)
      local m = { ['"'] = '\\"', ['\\'] = '\\\\', ['\n'] = '\\n', ['\r'] = '\\r', ['\t'] = '\\t' }
      return m[c] or string.format("\\u%04x", c:byte())
    end) .. '"'
  end
  if t == "table" then
    local n = #x
    if n > 0 then
      local o = {}
      for i = 1, n do o[i] = jsonEncode(x[i]) end
      return "[" .. table.concat(o, ",") .. "]"
    end
    local o = {}
    for k, val in pairs(x) do
      if type(val) ~= "function" and type(val) ~= "userdata" then table.insert(o, jsonEncode(tostring(k)) .. ":" .. jsonEncode(val)) end
    end
    return "{" .. table.concat(o, ",") .. "}"
  end
  return '"' .. tostring(x) .. '"'
end

FILTER_DIRECT = 0
local VID = 33139

electrics = { values = { ignitionLevel = 0, engineRunning = 0, lights_state = 0, hasTCS = 1, parkingbrake = 1, gear = "P" } }
function electrics.setIgnitionLevel(n) electrics.values.ignitionLevel = n; if n == 0 then electrics.values.engineRunning = 0 end end

local function dev(name, typ, modes, mode, wheel)
  local d = { name = name, type = typ, uiName = name, availableModes = modes, mode = mode, defaultMode = mode, children = {}, connectedWheel = wheel }
  function d:setMode(m) self.mode = m end
  return d
end
local D = {}
local function add(d, parent) D[d.name] = d; if parent then table.insert(parent.children, d); d.parent = parent end; return d end
local eng = add(dev("mainEngine", "combustionEngine", {}, nil))
local gb = add(dev("gearbox", "automaticGearbox", {}, nil), eng)
local rb = add(dev("rangebox", "rangeBox", { "high", "low" }, "high"), gb)
local tc = add(dev("transfercase", "differential", { "locked" }, "locked"), rb)
local tf = add(dev("transfercase_F", "shaft", { "connected", "disconnected" }, "connected"), tc)
local dF = add(dev("differential_F", "differential", { "open", "locked" }, "open"), tf)
add(dev("wheelaxleFL", "shaft", {}, nil, "FL"), dF); add(dev("wheelaxleFR", "shaft", {}, nil, "FR"), dF)
local ds = add(dev("driveshaft", "shaft", {}, nil), tc)
local dR = add(dev("differential_R", "differential", { "open", "locked" }, "open"), ds)
add(dev("wheelaxleRL", "shaft", {}, nil, "RL"), dR); add(dev("wheelaxleRR", "shaft", {}, nil, "RR"), dR)

powertrain = {}
function powertrain.getDevices() return D end
function powertrain.setDeviceMode(n, m) D[n]:setMode(m) end

-- controllers
local tcCtl = { typeName = "tractionControl", enabled = true }
function tcCtl.getConfig() return { isEnabled = tcCtl.enabled } end

local function driveModes(name, modes, cur, onSet)
  local c = { typeName = "driveModes", cur = cur }
  function c.getCurrentDriveModeKey() return c.cur end
  function c.getDriveModeData(k) return modes[k] end
  function c.setDriveMode(k) if modes[k] then c.cur = k; onSet(k) end end
  local list = {}
  for k in pairs(modes) do list[k] = { name = modes[k].name } end
  return c, list
end

local esc, escModes = driveModes("esc", {
  comfort = { name = "Comfort", order = 1, settings = { { type = "controller", controllerName = "tractionControl" } } },
  sport = { name = "Sport", order = 2, settings = { { type = "controller", controllerName = "tractionControl" } } },
  off = { name = "ESC & TC Off", order = 3, settings = { { type = "controller", controllerName = "tractionControl" } } },
}, "comfort", function(k) tcCtl.enabled = (k ~= "off") end)

local rl, rlModes = driveModes("rearLockControl", {
  unlocked = { name = "Unlocked", order = 1, settings = { { type = "powertrainDeviceMode", deviceName = "differential_R", mode = "open" } } },
  locked = { name = "Locked", order = 2, settings = { { type = "powertrainDeviceMode", deviceName = "differential_R", mode = "locked" } } },
}, "unlocked", function(k) dR.mode = (k == "locked") and "locked" or "open"; electrics.values.rear_lock = (k == "locked") and 1 or 0 end)

local C = { tractionControl = tcCtl, esc = esc, rearLockControl = rl }
controller = {
  mainController = {
    starter = false,
    shiftToGearIndex = function(i) end,
    setStarter = function(b) controller.mainController.starter = b end,
  },
}
function controller.getAllControllers() return C end
function controller.getController(n) return C[n] end

v = { data = { esc = { modes = escModes }, rearLockControl = { modes = rlModes } } }

-- per-frame physics: the starter turns the engine over after a couple of frames
local crank = 0
function __frame()
  local mc = controller.mainController
  if mc.starter and electrics.values.ignitionLevel >= 2 then
    crank = crank + 1
    electrics.values.ignitionLevel = 3
    if crank > 20 then electrics.values.engineRunning = 1 end
  else
    crank = 0
    if electrics.values.ignitionLevel == 3 then electrics.values.ignitionLevel = 2 end
  end
end

obj = {}
function obj:getID() return VID end
function obj:queueGameEngineLua(s) __toGE(s) end
