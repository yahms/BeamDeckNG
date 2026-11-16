-- BeamDeckNG MP-MCP: a small MCP server for BeamDeckNG on BeamMP servers.
--
-- BeamMP stops the game's own MCP server from handling requests during a multiplayer session.
-- A server owner can put this mod on their server (Resources/Client) so players' Stream Decks keep
-- working, limited to what the owner allows in beamdeckng_mp/settings.json.
--
-- It speaks the same protocol as the game's MCP server (JSON-RPC over HTTP, through the game's own
-- BNGWebWSServer, polled once a frame so it never blocks the game), but there is no run_lua: every
-- tool does one fixed job, and vehicle actions, game actions and game functions are checked against
-- the allowlist before anything runs.
--
-- Listens on 127.0.0.1:29392 only. (Not 29293: the game's server moves up through 29292..29311 when
-- its port is taken.)
--
-- Where it runs: in a BeamMP session only if this copy was sent by the server (from
-- /mods/multiplayer/, in BeamMP's list of the server's mods). A copy installed locally runs outside
-- sessions only (handy for testing; the game's own MCP server can do more anyway), and shuts itself
-- down if it is still loaded when a session starts, so a modified local copy can't stand in for the
-- server's.

local M = {}

local VERSION = "0.1.1" -- this mod
local PROTO = 1 -- tool protocol: bump only for changes an older plugin can't cope with
local HOST, PORT, ROUTE = "127.0.0.1", 29392, "/mcp"
local ROOT = "/beamdeckng_mp/"
local MAX_PER_FRAME = 8 -- requests answered per frame; the rest wait for the next one
local NAME = "BeamDeckNG MP-MCP"
local SELF = "/lua/ge/extensions/beamdeckngMP.lua"

-- Which zip this code was loaded from, read once now: the files mounted later may be another copy's.
local LOADED_FROM
pcall(function() LOADED_FROM = FS:getOriginArchivePathRelative(SELF) end)
local PROTOCOL_VERSION = "2025-11-25"
local SUPPORTED_VERSIONS = { ["2025-03-26"] = true, ["2025-06-18"] = true, ["2025-11-25"] = true }

-- Read-only vehicle actions the plugin needs; always allowed.
local ALWAYS = { verify = true, read = true, list = true, vc_watch = true }

-- Used when settings.json is missing or leaves a list out.
local DEFAULTS = {
  vehicle = {
    "engine", "traction", "drive_mode_step", "diff_lock", "diff_combo", "center_diff", "range", "drive",
    "parking_brake", "lights", "fog", "hazard", "signal", "lightbar", "horn", "cruise", "engine_brake",
    "retarder", "air_suspension", "body", "pt_click", "tire_pressure",
  },
  actions = {
    "menu_item_select", "menu_item_back", "menu_item_up", "menu_item_down", "menu_item_left", "menu_item_right",
    "toggleBigMap", "toggleRadialMenuMulti", "photomode", "couplersToggle", "center_camera", "look_back",
  },
  game = { "set_camera", "cam_step", "cam_driver", "toggle_ui", "walk" },
  menus = { "environment", "weather", "simulation", "traffic", "vehicle_config", "vehicle_selector", "multiplayer" },
  -- the vehicle's own controls (tray, hydraulics, fifth wheel...): name patterns, later ones win
  controls = { "*", "!jato*", "!*nitrous*", "!*n2o*" },
}

-- Game menu pages a key may open instead of changing something directly (open_menu). Opening one is
-- the same as the player going there with the mouse, so whatever BeamMP or the server limits there
-- still applies.
local MENUS = {
  environment = "pause.environment", weather = "pause.environment.weather",
  simulation = "pause.environment.simulation", traffic = "pause.environment.traffic",
  vehicle_config = "pause.vehicle.configurationcombined", vehicle_selector = "pause.vehicleSelector",
  multiplayer = "pause.multiplayer",
}

local server, serverAge, warnedBind = nil, 0, false
local pending = {}
local library, deckVersion = nil, nil
local allow, allowList = {}, {}
local lastInstall = -10
local leaving = false
local clock = 0 -- seconds of game frames since loading (os.clock is CPU time, not wall time)
local lastRequest, prevRequest = -100, -100 -- clock of the latest and the one before (for the "connected" message)
local checkTimer = 0
local msgTimes = {}

---------------------------------------------------------------- where this copy came from

local function inSession()
  return MPCoreNetwork ~= nil and MPCoreNetwork.isMPSession ~= nil and MPCoreNetwork.isMPSession() == true
end

-- Sent by the BeamMP server this session? (BeamMP keeps server mods in /mods/multiplayer/.)
local function fromServer()
  local p = LOADED_FROM and LOADED_FROM:lower()
  if not p or not p:find("^/?mods/multiplayer/") then return false end
  if MPModManager and MPModManager.isModAllowed then
    -- BeamMP's own naming: "/mods/multiplayer/x.zip" -> "multiplayerx"
    local n = p:gsub("^/?mods/", ""):gsub("/", ""):gsub("%.zip$", "")
    return MPModManager.isModAllowed(n) == true
  end
  return true
end

local function source() return fromServer() and "server" or "local" end

-- In-game message (the game's message app), throttled so a busy Stream Deck can't flood it.
local function message(text, ttl, icon)
  local now = clock
  local recent = {}
  for _, t in ipairs(msgTimes) do if now - t < 1 then recent[#recent + 1] = t end end
  msgTimes = recent
  if #recent >= 4 then return false end
  msgTimes[#msgTimes + 1] = now
  if ui_message then ui_message(text, ttl or 3, "beamdeckng", icon or "info") end
  return true
end

---------------------------------------------------------------- settings and vehicle library

local function toSet(list)
  local s = {}
  for _, v in ipairs(list) do s[v] = true end
  return s
end

local function stringList(v)
  if type(v) ~= "table" then return nil end
  local out = {}
  for _, x in ipairs(v) do if type(x) == "string" and #x > 0 and #x <= 64 then out[#out + 1] = x end end
  return out
end

local function loadSettings()
  local ok, cfg = pcall(jsonReadFile, ROOT .. "settings.json")
  if not ok or type(cfg) ~= "table" then
    cfg = {}
    log("W", "beamdeckngMP", "no readable " .. ROOT .. "settings.json; using the default allowlist")
  end
  for _, k in ipairs({ "vehicle", "actions", "game", "menus", "controls" }) do
    allowList[k] = stringList(cfg[k]) or DEFAULTS[k]
    allow[k] = toSet(allowList[k])
  end
end

local CTRL -- lua/controls.lua: list and run the vehicle-specific controls

local function loadLibrary()
  local cs = readFile(ROOT .. "lua/controls.lua")
  if cs then
    local f, err = loadstring(cs, "@beamdeckng_mp/controls.lua")
    local ok, m = pcall(f or error, err)
    CTRL = ok and type(m) == "table" and m or nil
    if not CTRL then log("E", "beamdeckngMP", "controls library failed to load: " .. tostring(err or m)) end
  end
  local r, d = readFile(ROOT .. "lua/resolver.lua"), readFile(ROOT .. "lua/beamdeck.lua")
  if not r or not d or #r == 0 or #d == 0 then
    log("E", "beamdeckngMP", "vehicle library missing from " .. ROOT .. "lua/")
    return
  end
  deckVersion = d:match('BNGS%.deckVersion = "([^"]*)"')
  library = r .. "\n" .. d .. "\n"
end

---------------------------------------------------------------- helpers

-- Lua literal for a JSON value: strings %q-quoted, numbers kept finite, tables depth-limited.
-- This is the only way plugin input reaches vehicle code, so nothing in it can run as code.
local function lit(v, depth)
  depth = depth or 0
  local t = type(v)
  if t == "boolean" then return tostring(v) end
  if t == "number" then
    if v ~= v or v == math.huge or v == -math.huge then return "0" end
    return string.format("%.17g", v)
  end
  if t == "string" then return string.format("%q", v) end
  if t == "table" and depth < 4 then
    local parts, n = {}, 0
    for k, x in pairs(v) do
      n = n + 1
      if n > 64 then break end
      if type(k) == "string" or type(k) == "number" then
        parts[#parts + 1] = "[" .. lit(k, depth + 1) .. "]=" .. lit(x, depth + 1)
      end
    end
    return "{" .. table.concat(parts, ",") .. "}"
  end
  return "nil"
end

local function playerVehicle()
  return be and be:getPlayerVehicle(0) or nil
end

local function notAllowed(kind, name)
  return "not allowed on this server: " .. kind .. " " .. tostring(name), true
end

local function okName(s, max) return type(s) == "string" and #s > 0 and #s <= (max or 64) and s:match("^[%w_%.%-]+$") ~= nil end

---------------------------------------------------------------- status (what the plugin's run_lua poll did)

local function probeCode(sid, seq)
  return 'local B = rawget(_G, "BNGSD_BNGS")\n'
    .. "local j\n"
    .. "if not B or B.deckVersion ~= " .. string.format("%q", deckVersion or "") .. " then j = '{\"needInit\":true}'\n"
    .. "else local ok, r = pcall(B.status); j = ok and jsonEncode(r) or jsonEncode({ err = tostring(r) }) end\n"
    .. 'obj:queueGameEngineLua("BNGSD = BNGSD or {}; BNGSD.status = { vid = " .. obj:getID() .. ", sid = \\"'
    .. sid .. '\\", seq = ' .. seq .. ', json = " .. string.format("%q", j) .. " }")'
end

local function geState()
  BNGSD = BNGSD or {}
  local g = {}
  pcall(function() g.paused = simTimeAuthority.getPause() end)
  pcall(function() g.timeScale = simTimeAuthority.get() end)
  pcall(function() g.cam = core_camera.getActiveCamName() end)
  pcall(function() g.replay = core_replay.getState() end)
  pcall(function() g.ui = extensions.ui_visibility.getCef() end)
  pcall(function()
    local t = core_environment.getTimeOfDay()
    if not t then return end
    g.tod = { time = t.time, play = t.play, dayLength = t.dayLength }
    local e = core_environment.getState()
    g.cloud = e.cloudCover g.fog = e.fogDensity g.wind = e.windSpeed g.grav = e.gravity
    local i = core_environment.getInitState()
    g.fog0 = i and i.fogDensity
    local n = 0
    for _, nm in ipairs(scenetree.findClassObjects("Precipitation") or {}) do
      local o = scenetree.findObject(nm)
      if o then n = math.max(n, tonumber(o.numDrops) or 0) end
    end
    g.rain = n
  end)
  pcall(function()
    local vid = be:getPlayerVehicleID(0)
    if vid and vid >= 0 then
      if BNGSD.vehId ~= vid then
        BNGSD.vehId = vid
        local ok, d = pcall(core_vehicles.getVehicleDetails, vid)
        BNGSD.vehName = ok and d and d.model and d.model.Name or nil
        local o = be:getObjectByID(vid)
        BNGSD.vehColor = o and tostring(o.color) or nil
      end
      g.veh = { name = BNGSD.vehName, color = BNGSD.vehColor }
    end
  end)
  return g
end

local T = {} -- tools
local S = {} -- tool schemas

function T.beamdeck_status(args)
  args = args or {}
  local sid, seq = args.sid, tonumber(args.seq)
  if not okName(sid, 16) or not seq then return "missing or bad 'sid' / 'seq'", true end
  seq = math.floor(seq)
  local g = geState()
  local veh = playerVehicle()
  pcall(function() g.walking = veh ~= nil and veh:getJBeamFilename() == "unicycle" end)
  if not veh then return jsonEncode({ veh = false, ge = g }), false end
  if not library then return jsonEncode({ veh = false, ge = g, err = "vehicle library missing" }), false end
  local vid = veh:getID()
  veh:queueLuaCommand(probeCode(sid, seq))
  local s = BNGSD and BNGSD.status
  local out = { veh = true, vid = vid, ge = g }
  if s and s.vid == vid and s.sid == sid then
    out.seq = s.seq
    out.s = s.json
    -- the vehicle hasn't got our library yet (new vehicle, reset): send it, at most every 2 s
    if type(s.json) == "string" and (s.json:find('"needInit"', 1, true) or s.json:find('"err"', 1, true)) then
      if clock - lastInstall > 2 then
        lastInstall = clock
        veh:queueLuaCommand(library)
      end
    end
  end
  return jsonEncode(out), false
end
S.beamdeck_status = { description = "Game and player-vehicle status for BeamDeckNG (sid, seq).",
  inputSchema = { type = "object", properties = { sid = { type = "string" }, seq = { type = "integer" } }, required = { "sid", "seq" } } }

---------------------------------------------------------------- vehicle actions

local function vehicleActionAllowed(action)
  return okName(action, 40) and (ALWAYS[action] or allow.vehicle[action])
end

-- Queue one resolver action in the player vehicle; with a tag, its result comes back to BNGSD.res[tag].
function T.beamdeck_call(args)
  args = args or {}
  local action, tag = args.action, args.tag
  if not vehicleActionAllowed(action) then return notAllowed("vehicle action", action) end
  if tag ~= nil and not okName(tag, 40) then return "bad 'tag'", true end
  local veh = playerVehicle()
  if not veh then return jsonEncode({ veh = false }), false end
  if not library then return "vehicle library missing", true end
  local code = library .. "\nlocal __r = BNGS.call(" .. string.format("%q", action) .. ", " .. lit(args.args or {}) .. ', nil, "")\n'
  if tag then
    code = code .. [[obj:queueGameEngineLua("BNGSD = BNGSD or {}; BNGSD.res = BNGSD.res or {}; BNGSD.res[\"]] .. tag
      .. [[\"] = " .. string.format("%q", __r))]]
  end
  veh:queueLuaCommand(code)
  return jsonEncode({ veh = true, vid = veh:getID() }), false
end
S.beamdeck_call = { description = "Run one allowed BeamDeckNG vehicle action; read the result with beamdeck_result.",
  inputSchema = { type = "object", properties = { action = { type = "string" }, args = { type = "object" }, tag = { type = "string" } }, required = { "action" } } }

function T.beamdeck_result(args)
  local tag = args and args.tag
  if not okName(tag, 40) then return "bad 'tag'", true end
  local t = BNGSD and BNGSD.res
  local r = t and t[tag]
  if r then t[tag] = nil return r, false end
  return "", false
end
S.beamdeck_result = { description = "Result of a beamdeck_call, or empty if it hasn't come back yet.",
  inputSchema = { type = "object", properties = { tag = { type = "string" } }, required = { "tag" } } }

-- Fire-and-forget (held buttons): uses the library already in the vehicle.
function T.beamdeck_fire(args)
  args = args or {}
  if not vehicleActionAllowed(args.action) then return notAllowed("vehicle action", args.action) end
  local veh = playerVehicle()
  if not veh then return jsonEncode({ veh = false }), false end
  veh:queueLuaCommand('local B = rawget(_G, "BNGSD_BNGS")\nif B then B.call(' .. string.format("%q", args.action) .. ", "
    .. lit(args.args or {}) .. ', nil, "") end')
  return jsonEncode({ veh = true, vid = veh:getID() }), false
end
S.beamdeck_fire = { description = "Run one allowed vehicle action without waiting for its result.",
  inputSchema = { type = "object", properties = { action = { type = "string" }, args = { type = "object" } }, required = { "action" } } }

---------------------------------------------------------------- icons (read-only)

function T.beamdeck_glyphs(args)
  local ids = args and args.ids
  if type(ids) ~= "table" then return "missing 'ids'", true end
  BNGSD = BNGSD or {}
  if not BNGSD.sprite or #BNGSD.sprite == 0 then BNGSD.sprite = readFile("/ui/assets/Sprites/svg-symbols.svg") or "" end
  local s = BNGSD.sprite
  if #s == 0 then return jsonEncode({ nosprite = true }), false end
  local out = {}
  for i, id in ipairs(ids) do
    if i > 64 then break end
    if okName(id, 64) then
      local a = s:find('<symbol[^>]-id="' .. id:gsub("%p", "%%%0") .. '"')
      if a then local b = s:find("</symbol>", a, true) out[id] = b and s:sub(a, b + 8) or false else out[id] = false end
    end
  end
  return jsonEncode({ found = out }), false
end
S.beamdeck_glyphs = { description = "The game's own UI icons (SVG symbols) by id.",
  inputSchema = { type = "object", properties = { ids = { type = "array", items = { type = "string" } } }, required = { "ids" } } }

---------------------------------------------------------------- game: same names and behaviour as the game's MCP tools

-- the game's own filter, which BeamMP and game modes use to block keys
local function gameBlocks(name)
  return core_input_actionFilter ~= nil and core_input_actionFilter.isActionBlocked ~= nil and core_input_actionFilter.isActionBlocked(name) == true
end

local function actionTitle(name)
  local a = core_input_actions and core_input_actions.getActiveActions()[name]
  local t = a and a.title or name
  local ok, tr = pcall(translateLanguage, t, t, true)
  return ok and tr or t
end

function T.trigger_action(args)
  local name = args and args.action
  if type(name) ~= "string" then return "missing 'action' (input action name)", true end
  if not allow.actions[name] then return notAllowed("game action", name) end
  -- the game's own filter, which BeamMP and game modes use to block keys
  if gameBlocks(name) then
    message("Stream Deck: " .. actionTitle(name) .. " is blocked by the game right now", 3, "warning")
    return notAllowed("game action (blocked by the game)", name)
  end
  if not core_input_actions then return "core_input_actions unavailable", true end
  local state = args.state
  if state == "down" then core_input_actions.triggerDown(name)
  elseif state == "up" then core_input_actions.triggerUp(name)
  else core_input_actions.triggerDownUp(name) end
  return "triggered action: " .. name .. (state and (" (" .. state .. ")") or ""), false
end
S.trigger_action = { description = "Trigger an allowed input action by name (state: down, up, or omitted for a tap).",
  inputSchema = { type = "object", properties = { action = { type = "string" }, state = { type = "string" } }, required = { "action" } } }

function T.set_camera(args)
  if not allow.game.set_camera then return notAllowed("game function", "set_camera") end
  local name = args and args.name
  if type(name) ~= "string" then return "missing 'name' (orbit, driver, chase, external, hood, top, dash, ...)", true end
  if not core_camera then return "core_camera unavailable", true end
  core_camera.setByName(0, name)
  return "camera set to " .. name, false
end
S.set_camera = { description = "Switch the camera by name.",
  inputSchema = { type = "object", properties = { name = { type = "string" } }, required = { "name" } } }

function T.toggle_ui(args)
  if not allow.game.toggle_ui then return notAllowed("game function", "toggle_ui") end
  local uv = extensions.ui_visibility
  if not (uv and uv.toggle) then return "ui_visibility unavailable", true end
  if args and args.show ~= nil then uv.set(args.show == true) else uv.toggle() end
  return "ui visible: " .. tostring(uv.get()), false
end
S.toggle_ui = { description = "Show or hide the game UI.", inputSchema = { type = "object", properties = { show = { type = "boolean" } } } }

-- Game functions the plugin otherwise does with run_lua.
local CAM_ORDER = { "occupant.FL", "onboard.hood", "chase", "orbit", "external", "topDown", "droneChase" }

local G = {}
function G.walk()
  if not gameplay_walk then extensions.load("gameplay_walk") end
  gameplay_walk.toggleWalkingMode()
  return "ok"
end
function G.cam_step(a)
  local dir = (tonumber(a.dir) or 1) < 0 and -1 or 1
  if a.gamecams then core_camera.setVehicleCameraByIndexOffset(0, dir) return "ok" end
  local id = be:getPlayerVehicleID(0)
  if id < 0 then return "no vehicle" end
  local d = core_camera.getCameraDataById(id) or {}
  local list, seen = {}, {}
  for _, n in ipairs(CAM_ORDER) do if d[n] then list[#list + 1] = n seen[n] = true end end
  local extra = {}
  for n in pairs(d) do if not seen[n] and (n:find("^onboard%.") or n:find("^occupant%.")) then extra[#extra + 1] = n end end
  table.sort(extra)
  for _, n in ipairs(extra) do list[#list + 1] = n end
  if #list == 0 then return "no cameras" end
  local cur = core_camera.getActiveCamName()
  local i = 0
  for k, n in ipairs(list) do if n == cur then i = k break end end
  local nxt = list[((i - 1 + dir + #list) % #list) + 1]
  if core_camera.isWorldCamera() then core_camera.setGlobalCameraByName(nil) end
  core_camera.setVehicleCameraByNameWithId(id, nxt)
  return nxt
end
function G.cam_driver()
  local id = be:getPlayerVehicleID(0)
  core_camera.setVehicleCameraByNameWithId(id, core_camera.getDriverCameraNameById(id))
  return "ok"
end
function G.replay_eject()
  if core_replay.stopAndUnload then core_replay.stopAndUnload() else core_replay.stop() end
  return "ok"
end

function T.beamdeck_game(args)
  args = args or {}
  local fn = args.fn
  if type(fn) ~= "string" or not G[fn] then return "unknown game function: " .. tostring(fn), true end
  if not allow.game[fn] then return notAllowed("game function", fn) end
  local ok, res = pcall(G[fn], type(args.args) == "table" and args.args or {})
  if not ok then return "error: " .. tostring(res), true end
  return tostring(res), false
end
S.beamdeck_game = { description = "Run one allowed game function (walk, cam_step, cam_driver, replay_eject).",
  inputSchema = { type = "object", properties = { fn = { type = "string" }, args = { type = "object" } }, required = { "fn" } } }

---------------------------------------------------------------- the vehicle's own controls

-- "*", "!jato*" patterns: the last one that matches decides
local function allowedControl(id)
  local ok = false
  for _, p in ipairs(allowList.controls or {}) do
    local neg = p:sub(1, 1) == "!"
    local pat = "^" .. (neg and p:sub(2) or p):lower():gsub("[%^%$%(%)%%%.%[%]%+%-%?]", "%%%0"):gsub("%*", ".*") .. "$"
    if id:lower():find(pat) then ok = not neg end
  end
  return ok
end

-- The vehicle-specific controls of the player vehicle and what it tows: the plugin's own
-- lua/controls.lua (packed into this mod), so both read them the same way. Read-only.
function T.beamdeck_controls()
  if not CTRL then return "controls library missing", true end
  return jsonEncode(CTRL.list(allowedControl)), false
end
S.beamdeck_controls = { description = "The vehicle-specific controls (input actions) of the player vehicle and what it tows, that this server allows." }

-- Run one, the way a key bound in the game would: its own code, with VALUE filled in.
function T.vehicle_control(args)
  args = args or {}
  local id, value, t = args.id, tonumber(args.value) or 1, tonumber(args.t) or 0
  if not okName(id, 64) then return "missing or bad 'id'", true end
  if value ~= value or value < -1 or value > 1 then return "bad 'value'", true end
  if t ~= math.floor(t) or t < 0 or t > 8 then return "bad 't'", true end
  if not CTRL then return "controls library missing", true end
  if not allowedControl(id) then return notAllowed("vehicle control", id) end
  local r = CTRL.run(t, id, value, args.phase == "up" and "up" or "down", allowedControl)
  if r == "blocked by the game" then
    local v = playerVehicle()
    message("Stream Deck: " .. (t == 0 and v and actionTitle(v:getJBeamFilename() .. "__" .. id) or id) .. " is blocked by the game right now", 3, "warning")
    return notAllowed("vehicle control (blocked by the game)", id)
  end
  if r == "not allowed" then return notAllowed("vehicle control", id) end
  if r ~= "ok" then return r .. ": " .. id, true end
  return "ok", false
end
S.vehicle_control = { description = "Press (phase down, value 1 or -1) or release (phase up, value 0) one of the vehicle's own controls; t = 0 the player vehicle, 1 what it tows...",
  inputSchema = { type = "object", properties = { id = { type = "string" }, value = { type = "number" }, phase = { type = "string" }, t = { type = "integer" } }, required = { "id" } } }

---------------------------------------------------------------- messages and menus

function T.show_message(args)
  local text = args and args.text
  if type(text) ~= "string" or #text == 0 then return "missing 'text'", true end
  text = text:gsub("[%c]", " "):sub(1, 160)
  local icon = args.icon
  if icon ~= "info" and icon ~= "warning" and icon ~= "error" then icon = "info" end
  local shown = message(text, math.max(1, math.min(10, tonumber(args.ttl) or 3)), icon)
  return shown and ("shown: " .. text) or "skipped (too many messages)", false
end
S.show_message = { description = "Show a short message in the game's message app (rate limited).",
  inputSchema = { type = "object", properties = { text = { type = "string" }, ttl = { type = "number" }, icon = { type = "string" } }, required = { "text" } } }

function T.open_menu(args)
  local page = args and args.page
  if type(page) ~= "string" or not MENUS[page] then return "unknown menu page: " .. tostring(page), true end
  if not allow.menus[page] then return notAllowed("menu page", page) end
  local r = extensions.ui_router
  if not (r and r.navigate) then return "ui_router unavailable", true end
  r.navigate(MENUS[page])
  return "opened " .. page, false
end
S.open_menu = { description = "Open one of the game's menu pages (environment, weather, simulation, traffic, vehicle_config, vehicle_selector, multiplayer).",
  inputSchema = { type = "object", properties = { page = { type = "string" } }, required = { "page" } } }

---------------------------------------------------------------- info

function T.beamdeck_info()
  local fns = {}
  for k in pairs(G) do fns[#fns + 1] = k end
  table.sort(fns)
  local menus = {}
  for k in pairs(MENUS) do menus[#menus + 1] = k end
  table.sort(menus)
  return jsonEncode({
    name = NAME, version = VERSION, proto = PROTO, deckVersion = deckVersion, source = source(),
    allow = { vehicle = allowList.vehicle, actions = allowList.actions, game = allowList.game, menus = allowList.menus, controls = allowList.controls },
    always = { "verify", "read", "list", "vc_watch" }, functions = fns, menuPages = menus,
  }), false
end
S.beamdeck_info = { description = "Add-on version, protocol and what this server allows." }

---------------------------------------------------------------- JSON-RPC (as the game's server does it)

local function toolList()
  local list = {}
  for name in pairs(T) do
    local s = S[name] or {}
    list[#list + 1] = { name = name, description = s.description or "", inputSchema = s.inputSchema or { type = "object" } }
  end
  table.sort(list, function(a, b) return a.name < b.name end)
  return list
end

local function result(id, res) return { jsonrpc = "2.0", id = id, result = res } end
local function rpcError(id, code, msg) return { jsonrpc = "2.0", id = id, error = { code = code, message = msg } } end

local function nAllowed()
  local n = 0
  for _ in pairs(allow.vehicle) do n = n + 1 end
  return n
end

local function dispatch(rpc)
  local m = rpc.method
  if m == "initialize" then
    -- a Stream Deck (re)connecting after a quiet spell: say so in the game
    if clock - prevRequest > 30 then
      message(string.format("Stream Deck connected to %s %s (%s copy): %d vehicle actions, %d game keys allowed here",
        NAME, VERSION, source(), nAllowed(), #allowList.actions), 6, "info")
    end
    local want = rpc.params and rpc.params.protocolVersion
    return result(rpc.id, {
      protocolVersion = (want and SUPPORTED_VERSIONS[want]) and want or PROTOCOL_VERSION,
      capabilities = { tools = { listChanged = false } },
      serverInfo = { name = "beamdeckng-mp-mcp", version = VERSION },
    })
  elseif m == "tools/list" then
    return result(rpc.id, { tools = toolList() })
  elseif m == "tools/call" then
    local p = rpc.params or {}
    local fn = T[p.name]
    if type(fn) ~= "function" then return rpcError(rpc.id, -32602, "unknown tool: " .. tostring(p.name)) end
    local ok, res, isErr = pcall(fn, type(p.arguments) == "table" and p.arguments or {})
    if not ok then res, isErr = "tool crashed: " .. tostring(res), true end
    return result(rpc.id, { content = { { type = "text", text = tostring(res or "") } }, isError = isErr == true })
  elseif m == "ping" then
    return result(rpc.id, {})
  end
  return rpcError(rpc.id, -32601, "method not found: " .. tostring(m))
end

local function handleRpc(bodyText)
  local ok, msg = pcall(jsonDecode, bodyText or "")
  prevRequest, lastRequest = lastRequest, clock
  if not ok or type(msg) ~= "table" then return jsonEncode(rpcError(nil, -32700, "parse error")), 200 end
  if msg[1] ~= nil then
    local out = {}
    for i, one in ipairs(msg) do
      if i > 16 then break end
      if type(one) == "table" and one.id ~= nil then out[#out + 1] = dispatch(one) end
    end
    if #out == 0 then return "", 202 end
    return jsonEncode(out), 200
  end
  if msg.id == nil then return "", 202 end
  return jsonEncode(dispatch(msg)), 200
end

---------------------------------------------------------------- listener

local function stopServer()
  if server then BNGWebWSServer.destroy(server) server = nil end
  pending = {}
end

local function startServer()
  if server then return end
  if not BNGWebWSServer then log("E", "beamdeckngMP", "BNGWebWSServer unavailable") return end
  if inSession() and not fromServer() then return end
  server = BNGWebWSServer.getOrCreate(HOST, PORT, "", "", "", false, false)
  serverAge = 0
  if not server then log("E", "beamdeckngMP", "could not create a listener on port " .. PORT) return end
  server:enableHttpHandler(ROUTE)
end

local function shutDown(why)
  if why then log("W", "beamdeckngMP", why) end
  stopServer()
  extensions.unload("beamdeckngMP")
end

local function onUpdate(dtReal)
  clock = clock + (dtReal or 0)
  if leaving then
    leaving = false
    shutDown()
    return
  end
  -- once a second: a local copy must not run in a BeamMP session
  checkTimer = checkTimer + (dtReal or 0)
  if checkTimer >= 1 then
    checkTimer = 0
    if inSession() and not fromServer() then
      message(NAME .. ": this copy wasn't sent by the server, so it is off on BeamMP servers", 8, "warning")
      shutDown("local copy (" .. tostring(LOADED_FROM) .. ") disabled in a BeamMP session; only a copy sent by the server runs there")
      return
    end
  end
  if not server then return end
  serverAge = serverAge + (dtReal or 0)
  -- binding is asynchronous; if it hasn't come up after a few seconds, the port is taken: retry
  if serverAge > 5 and not server:isListening() then
    if not warnedBind then
      warnedBind = true
      log("W", "beamdeckngMP", "port " .. PORT .. " is in use; BeamDeckNG can't connect until it is free (retrying)")
      message(NAME .. ": port " .. PORT .. " is in use by another program; the Stream Deck can't connect", 8, "warning")
    end
    stopServer()
    startServer()
    return
  end
  for _, req in ipairs(server:getHttpRequests()) do pending[#pending + 1] = req end
  local n = 0
  while #pending > 0 and n < MAX_PER_FRAME do
    local req = table.remove(pending, 1)
    n = n + 1
    if req.method == "POST" then
      local ok, body, status = pcall(handleRpc, req.body)
      if not ok then body, status = jsonEncode(rpcError(nil, -32603, "internal error")), 200 end
      server:respondHttp(req.id, status, "application/json", body)
    else
      server:respondHttp(req.id, 405, "text/plain", "Method Not Allowed")
    end
  end
end

local function onExtensionLoaded()
  loadSettings()
  loadLibrary()
  if inSession() and not fromServer() then
    log("W", "beamdeckngMP", "not starting: local copy (" .. tostring(LOADED_FROM) .. ") in a BeamMP session")
    return
  end
  startServer()
  log("I", "beamdeckngMP", string.format("%s %s (%s copy, %s) listening on http://%s:%d%s (vehicle library %s, %d vehicle actions, %d game actions, %d game functions, %d menu pages allowed)",
    NAME, VERSION, source(), tostring(LOADED_FROM), HOST, PORT, ROUTE, tostring(deckVersion), nAllowed(), #allowList.actions, #allowList.game, #allowList.menus))
end

local function onExtensionUnloaded() stopServer() end

-- Leaving the server: stop listening and unload, so the next server's copy (and allowlist) is the one used.
local function onBeamMPServerLeave() leaving = true end

local function onSerialize() return { active = server ~= nil } end
local function onDeserialize(data) if data and data.active then loadSettings() loadLibrary() startServer() end end

M.onInit = function() setExtensionUnloadMode(M, "manual") end
M.loadedFrom = function() return LOADED_FROM end
M.onExtensionLoaded = onExtensionLoaded
M.onExtensionUnloaded = onExtensionUnloaded
M.onUpdate = onUpdate
M.onBeamMPServerLeave = onBeamMPServerLeave
M.onSerialize = onSerialize
M.onDeserialize = onDeserialize

-- for tests
M._tools = T
M._lit = lit

return M
