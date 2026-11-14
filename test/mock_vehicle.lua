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

electrics = { values = { ignitionLevel = 0, engineRunning = 0, lights_state = 0, hasTCS = 1, parkingbrake = 1, gear = "P",
  fog = 0, hazard_enabled = 0, signal_left_input = 0, signal_right_input = 0, lightbar = 0, horn = 0 } }
function electrics.setIgnitionLevel(n) electrics.values.ignitionLevel = n; if n == 0 then electrics.values.engineRunning = 0 end end
-- electrics setters land on the next frame, like the game (that's why the resolver verifies later)
local pendingE = {}
local function later(k, v) pendingE[k] = v end
function electrics.setLightsState(n) later("lights_state", n) end
function electrics.set_fog_lights(n) later("fog", n) end
function electrics.set_warn_signal(n) later("hazard_enabled", n) end
function electrics.toggle_left_signal() later("signal_left_input", 1 - electrics.values.signal_left_input); later("signal_right_input", 0) end
function electrics.toggle_right_signal() later("signal_right_input", 1 - electrics.values.signal_right_input); later("signal_left_input", 0) end
function electrics.set_lightbar_signal(n) later("lightbar", n) end
function electrics.horn(b) electrics.values.horn = b and 1 or 0 end
input = { event = function(name, v) if name == "parkingbrake" then later("parkingbrake", v) end end }

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

-- trucks
local cbCoef, cbLevel = 0, 3
local cb = { typeName = "compressionBrake" }
function cb.getState() return { compressionBrakeCoef = cbCoef, compressionBrakeLevelIndex = cbLevel } end
function cb.setCompressionBrakeCoef(c) cbCoef = c end
function cb.setCompressionBrakeLevel(l) cbLevel = l end
local retIdx = 2
local ret = { typeName = "retarderControl" }
function ret.getState() return { retarderControl_settingIndex = retIdx } end
function ret.setRetarderMode(m) retIdx = (m == "auto") and 1 or 2 end
function ret.setRetarderSettingIndex(i) retIdx = i end
local controlGroups = { front = true, rear = true }
local airLog = {}
local air = { typeName = "airSuspension" }
function air.getState() return controlGroups end
function air.setMomentaryIncrease(g, b) table.insert(airLog, "inc" .. tostring(b)) end
function air.setMomentaryDecrease(g, b) table.insert(airLog, "dec" .. tostring(b)) end
function air.stopAdjusting(g, b) table.insert(airLog, "stop") end
function __airLog() return table.concat(airLog, ",") end

-- openable panels: toggleGroup takes a few frames
local function coupler(name)
  local c = { typeName = "advancedCouplerControl", st = "attached", t = 0 }
  function c.getGroupState() return c.st end
  function c.toggleGroup() c.t = 10 end
  function c.tick() if c.t > 0 then c.t = c.t - 1; if c.t == 0 then c.st = (c.st == "attached") and "detached" or "attached" end end end
  return c
end
local panels = { door_FL_coupler = coupler(), door_FR_coupler = coupler(), hoodLatchCoupler = coupler(), tailgateCoupler = coupler() }

local C = { tractionControl = tcCtl, esc = esc, rearLockControl = rl, compressionBrake = cb, retarderControl = ret, airSuspension = air }
for n, c in pairs(panels) do C[n] = c end

-- cruise control extension
local cruise = { on = false, target = 0 }
cruiseControl = {
  getConfiguration = function() return { isEnabled = cruise.on, targetSpeed = cruise.target } end,
  setEnabled = function(b) cruise.on = b end,
  holdCurrentSpeed = function() cruise.on = true; cruise.target = 22.2 end,
  changeSpeed = function(d) cruise.target = cruise.target + d end,
}
extensions = { cruiseControl = cruiseControl, load = function() end }
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
  for k, val in pairs(pendingE) do electrics.values[k] = val end
  pendingE = {}
  for _, c in pairs(panels) do c.tick() end
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
