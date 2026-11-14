-- BeamDeck additions to the resolver (vehicle Lua VM). Appended after resolver.lua in the
-- same chunk, so the resolver's locals (BNGS, R, lower, has...) are in scope here.
-- The chunk ends by storing BNGS in a global so the cheap status probe can reuse it.

BNGS.deckVersion = "__DECK_VERSION__"

local function agg(list, on, off, mixed)
  if #list == 0 then return nil end
  local n = 0
  for _, x in ipairs(list) do n = n + x end
  if n == #list then return on end
  if n == 0 then return off end
  return mixed
end

-- driveModes controllers don't change while the vehicle VM lives, so cache the scan.
local function dmCtrls()
  if not BNGS._dmCache then BNGS._dmCache = BNGS.driveModeCtrls() end
  return BNGS._dmCache
end

local function liveMode(cc)
  local cur = cc.c.getCurrentDriveModeKey and cc.c.getCurrentDriveModeKey()
  local m = cur and cc.modes[cur]
  return { ctrl = cc.name, key = cur, name = m and m.name or cur }
end

local function tcCtrl()
  for _, cc in pairs(dmCtrls()) do
    for _, m in pairs(cc.modes) do if m.ctl.tractionControl then return cc end end
  end
end

local function centerCtrl()
  for _, cc in pairs(dmCtrls()) do
    if lower(cc.name):find(R.centerCtrlPattern) then return cc end
  end
end

-- Everything the buttons display, in one small table.
function BNGS.status()
  local e = electrics.values
  local s = { v = BNGS.deckVersion }

  -- ignition: 0 off, 1 accessory, 2 on, 3 starter
  s.ign = e.ignitionLevel
  s.running = (e.engineRunning or 0) > 0.5

  -- traction control
  local tc = controller.getController("tractionControl")
  s.hasTC = tc ~= nil
  if tc and tc.getConfig then
    local ok, c = pcall(tc.getConfig)
    if ok and c then s.tc = c.isEnabled end
  end
  local tcc = tcCtrl()
  if tcc then s.tcMode = liveMode(tcc) end

  -- powertrain devices
  local diffs = { front = {}, rear = {}, center = {} }
  local where = { diff_front = "front", inter_front = "front", diff_rear = "rear", inter_rear = "rear", center = "center" }
  local range, drive = {}, {}
  for _, c in pairs(BNGS.switchables()) do
    if c.role == "diff" and where[c.cls] then
      table.insert(diffs[where[c.cls]], R.lockedModes[c.mode] and 1 or 0)
    elseif c.role == "range" then
      table.insert(range, c.mode == "low" and 1 or 0)
    elseif c.role == "drive" or c.role == "hub" then
      table.insert(drive, c.mode == "connected" and 1 or 0)
    end
  end
  s.diff = {
    front = agg(diffs.front, "locked", "open", "partial"),
    rear = agg(diffs.rear, "locked", "open", "partial"),
    center = agg(diffs.center, "locked", "open", "partial"),
  }
  -- Active centre diffs with presets (Sunburst centerDiffModes) instead of a lockable device.
  if not s.diff.center then
    local cc = centerCtrl()
    if cc then
      local m = liveMode(cc)
      local k = lower(m.key)
      if has(R.centerCtrlModes.locked, m.key) then s.diff.center = "locked"
      elseif has(R.centerCtrlModes.open, m.key) then s.diff.center = (k == "auto") and "auto" or "open"
      else s.diff.center = "partial" end
      s.centerMode = m
    end
  end
  s.range = agg(range, "low", "high", "partial")
  s.drive = agg(drive, "4wd", "2wd", "partial")

  -- lights and signals (nil = this vehicle doesn't have it)
  if e.parkingbrake ~= nil then s.pbrake = e.parkingbrake > 0.5 end
  s.lights = e.lights_state
  s.fog = e.fog
  s.hazard = e.hazard_enabled
  s.sigL = e.signal_left_input
  s.sigR = e.signal_right_input
  s.lightbar = e.lightbar
  s.horn = e.horn

  -- cruise control (vehicle extension; may not be loaded until first used)
  local cc = BNGS.cruise()
  if cc then
    local ok, c = pcall(cc.getConfiguration)
    if ok and type(c) == "table" then s.cruise = { on = c.isEnabled == true, speed = c.targetSpeed } end
  end

  -- trucks
  local cb = controller.getController("compressionBrake")
  if cb and cb.getState then
    local st = cb.getState() or {}
    local coef = st.compressionBrakeCoef or 0
    local lvl = 0
    for i, v in ipairs({ 0.33, 0.66, 1 }) do if math.abs(coef - v) < 0.05 then lvl = i end end
    s.ebrake = lvl
  end
  local rc = controller.getController("retarderControl")
  if rc and rc.getState then s.retarder = (rc.getState() or {}).retarderControl_settingIndex end
  s.air = controller.getController("airSuspension") ~= nil or nil

  -- doors, bonnet, boot: open state per panel (closing re-latches over ~1.5 s)
  local doors, open, any = {}, 0, false
  for _, p in ipairs(BNGS.panels()) do
    local isOpen = p.c.getGroupState() ~= "attached"
    if p.kind == "door" then
      any = true
      if p.pos ~= "" then doors[p.pos] = isOpen end
      if isOpen then open = open + 1 end
    elseif p.kind == "hood" then s.hood = (s.hood or false) or isOpen
    elseif p.kind == "trunk" then s.trunk = (s.trunk or false) or isOpen end
  end
  if any then s.doors = doors; s.doorsOpen = open end
  return s
end

-- cruiseControl is a vehicle extension; load it on demand.
function BNGS.cruise()
  local cc = rawget(_G, "cruiseControl") or (extensions and extensions.cruiseControl)
  if not cc and extensions and extensions.load then
    pcall(extensions.load, "cruiseControl")
    cc = rawget(_G, "cruiseControl") or extensions.cruiseControl
  end
  if cc and cc.getConfiguration then return cc end
end

-- Step a driveModes controller to its next (or previous) mode, in the game's mode order.
-- args: which = "tc" | "center" | <controller name>, dir = 1 | -1
BNGS.actions.drive_mode_step = function(args)
  local cc
  if args.which == "tc" then cc = tcCtrl()
  elseif args.which == "center" then cc = centerCtrl()
  else cc = dmCtrls()[args.which] end
  if not cc then return { action = "drive_mode_step", status = "unsupported", targets = {}, detail = "no matching drive mode controller" } end
  local list = {}
  for k, m in pairs(cc.modes) do table.insert(list, m) end
  table.sort(list, function(a, b) return (a.order or 0) < (b.order or 0) end)
  local cur = cc.c.getCurrentDriveModeKey()
  local idx = 0
  for i, m in ipairs(list) do if m.key == cur then idx = i end end
  local nextM = list[((idx - 1 + (args.dir or 1)) % #list) + 1]
  cc.c.setDriveMode(nextM.key)
  local now = cc.c.getCurrentDriveModeKey()
  return { action = "drive_mode_step", status = (now == nextM.key) and "applied" or "failed", side = {},
           targets = { { role = "controller", device = cc.name, ui = nextM.name, from = cur, to = now, want = nextM.key, ok = now == nextM.key } } }
end

-- Lightbar: 0 off, 1 lights, 2 lights + siren (vehicle dependent). args: state = 0..2
BNGS.actions.lightbar = function(args)
  if electrics.values.lightbar == nil then return { action = "lightbar", status = "unsupported", targets = {} } end
  local n = tonumber(args.state) or 0
  return eTarget("lightbar", "lightbar", electrics.values.lightbar, n, function() electrics.set_lightbar_signal(n) end)
end

-- Horn, held from the button. args: state = 1 | 0. Fire-and-forget, no verify.
BNGS.actions.horn = function(args)
  local on = tonumber(args.state) == 1
  if electrics.horn then electrics.horn(on) else electrics.values.horn = on and 1 or 0 end
  return { action = "horn", status = "applied", targets = {} }
end

-- Cruise control. args: op = toggle | set | plus | minus, step (m/s, for plus/minus)
BNGS.actions.cruise = function(args)
  local cc = BNGS.cruise()
  if not cc then return { action = "cruise", status = "unsupported", targets = {}, detail = "no cruise control" } end
  local c = cc.getConfiguration() or {}
  local op = args.op or "toggle"
  if op == "toggle" then
    if c.isEnabled then cc.setEnabled(false) elseif (c.targetSpeed or 0) > 0.5 then cc.setEnabled(true) else cc.holdCurrentSpeed() end
  elseif op == "set" then cc.holdCurrentSpeed()
  elseif op == "plus" or op == "minus" then
    if not c.isEnabled then
      if op == "plus" and (c.targetSpeed or 0) > 0.5 then cc.setEnabled(true) else cc.holdCurrentSpeed() end
    else
      cc.changeSpeed((op == "plus" and 1 or -1) * (tonumber(args.step) or 1.389))
    end
  end
  local n = cc.getConfiguration() or {}
  return { action = "cruise", status = "applied", side = {},
           targets = { { role = "cruise", device = "cruiseControl", from = c.isEnabled, to = n.isEnabled, ok = true, speed = n.targetSpeed } } }
end

rawset(_G, "BNGSD_BNGS", BNGS)
