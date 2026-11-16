-- Game engine: the vehicle-specific controls of the player vehicle and whatever it is towing.
-- Used by the plugin (through run_lua) and by BeamDeckNG MP-MCP (which loads this same file).
--
-- Each vehicle's controls come from where the game reads them (vehicles/<model>/input_actions*.json
-- and the jbeam's inputActions), filtered by the vehicle's actionsEnabled list when it has one, as
-- the game's Controls menu does. The game's own action cache isn't used: it is only rebuilt when you
-- switch vehicles, so it misses a trailer hitched afterwards.
--
-- Returns { list = function(allow), run = function(t, id, value, phase, allow) }:
--   t = 0 for the player vehicle, 1 for what it tows, 2 for what that tows...
--   allow(id) -> bool (MP-MCP's allowlist), or nil for everything

local C = {}

-- player vehicle, then each trailer down the chain (core_trailerRespawn keeps the couplings)
local function train()
  local out = {}
  local vid = be:getPlayerVehicleID(0)
  if not vid or vid < 0 then return out end
  local seen = {}
  local reg = core_trailerRespawn and core_trailerRespawn.getTrailerData() or {}
  while vid and not seen[vid] and getObjectByID(vid) do
    seen[vid] = true
    out[#out + 1] = vid
    local c = reg[vid]
    vid = type(c) == "table" and c.trailerId or nil
  end
  return out
end

-- name -> action for one vehicle, only the ones its parts enable
local function actionsOf(vid)
  local veh = getObjectByID(vid)
  if not veh then return {}, nil end
  local model = veh:getJBeamFilename()
  local own, all = {}, {}
  for _, p in ipairs(FS:findFiles("/vehicles/" .. model .. "/", "input_actions*.json", 0, false, false) or {}) do
    for k, a in pairs(jsonReadFile(p) or {}) do
      if type(a) == "table" and a.namespace ~= "common" then all[k] = a own[k] = true end
    end
  end
  local d = core_vehicle_manager.getVehicleData(vid)
  local vd = d and d.vdata
  for k, a in pairs(vd and vd.inputActions or {}) do
    if type(a) == "table" and a.namespace ~= "common" and not all[k] then all[k] = a end
  end
  local out = {}
  if vd and vd.actionsEnabled then
    for _, e in pairs(vd.actionsEnabled) do
      local n = type(e) == "table" and e.name or e
      if all[n] then out[n] = all[n] end
    end
  else
    -- no actionsEnabled (older vehicles, most props): only the vehicle's own files, not the generic set
    for n in pairs(own) do out[n] = all[n] end
  end
  for n, a in pairs(out) do
    if (a.ctx or "vlua") ~= "vlua" then out[n] = nil end
  end
  return out, model
end

local function title(a)
  local t = a.title or ""
  local ok, tr = pcall(translateLanguage, t, t, true)
  return ok and tr or t
end

function C.list(allow)
  local vehicles = {}
  for t, vid in ipairs(train()) do
    local acts, model = actionsOf(vid)
    local list = {}
    for id, a in pairs(acts) do
      if not allow or allow(id) then
        list[#list + 1] = { id = id, title = title(a), down = a.onDown ~= nil, up = a.onUp ~= nil,
          change = a.onChange ~= nil, code = (a.onDown or a.onChange or ""):sub(1, 300) }
      end
    end
    table.sort(list, function(x, y) return x.id < y.id end)
    vehicles[#vehicles + 1] = { t = t - 1, vid = vid, model = model, list = list }
  end
  if #vehicles == 0 then return { veh = false } end
  return { veh = true, vid = vehicles[1].vid, model = vehicles[1].model, list = vehicles[1].list, vehicles = vehicles }
end

-- Run one control the way a key bound in the game would: its own code, VALUE and FILTERTYPE filled in.
function C.run(t, id, value, phase, allow)
  local vid = train()[(tonumber(t) or 0) + 1]
  if not vid then return "no vehicle" end
  if allow and not allow(id) then return "not allowed" end
  local acts, model = actionsOf(vid)
  local a = acts[id]
  if not a then return "unknown control" end
  local name = model .. "__" .. id
  if core_input_actionFilter and core_input_actionFilter.isActionBlocked and core_input_actionFilter.isActionBlocked(name) then
    return "blocked by the game"
  end
  local code = phase == "up" and (a.onUp or a.onChange) or (a.onDown or a.onChange)
  if not code then return "ok" end
  code = code:gsub("VALUE", tostring(value))
  code = code:gsub("FILTERTYPE", "0")
  getObjectByID(vid):queueLuaCommand(code)
  return "ok"
end

return C
