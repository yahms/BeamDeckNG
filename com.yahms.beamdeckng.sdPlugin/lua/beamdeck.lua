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

  -- nitrous: armed (sprays by itself above cut-in rpm at full throttle), override (manual spray), active (spraying)
  local n2o = controller.getController("nitrousOxideInjection")
  if n2o then
    local bottle
    for _, st in pairs(energyStorage.getStorages() or {}) do
      if st.type == "n2oTank" then bottle = st.remainingRatio end
    end
    s.n2o = { armed = (e.nitrousOxideArm or 0) >= 1, override = (e.nitrousOxideOverride or 0) >= 1,
              active = e.nitrousOxideActive == true or e.nitrousOxideActive == 1, bottle = bottle }
  end

  -- the game's own powertrain button bar (bottom right), as this vehicle registered it
  s.pt = BNGS.ptButtons()

  -- JATO: jatoInput is the switch, jato the actual thrust, jatofuel 0..1
  if controller.getController("jato") then
    s.jato = { on = (e.jatoInput or 0) >= 0.5, firing = (e.jato or 0) > 0, fuel = e.jatofuel }
  end
  return s
end

-- Mirror of the game's simple powertrain control bar. Controllers push their buttons to the UI
-- through ui_simplePowertrainControl.setButton; we wrap it once per vehicle VM to keep the latest
-- state of each button, then ask everything to re-send.
function BNGS.ptStore()
  local store = rawget(_G, "BNGSD_PT")
  if store then return store end
  local spc = extensions.ui_simplePowertrainControl
  if not spc and extensions.load then pcall(extensions.load, "ui_simplePowertrainControl"); spc = extensions.ui_simplePowertrainControl end
  if not spc or not spc.setButton then return nil end
  store = { order = {}, byId = {} }
  rawset(_G, "BNGSD_PT", store)
  local orig = spc.setButton
  spc.setButton = function(id, uiName, icon, color, ringValue, onClick, remove, active)
    if remove then store.byId[id] = nil
    else
      if not store.byId[id] then table.insert(store.order, id) end
      store.byId[id] = { id = id, name = uiName, icon = icon, color = color, ring = ringValue, click = onClick, active = active }
    end
    return orig(id, uiName, icon, color, ringValue, onClick, remove, active)
  end
  pcall(spc.updateButtons)
  return store
end

function BNGS.ptButtons()
  local store = BNGS.ptStore()
  if not store then return nil end
  local out = {}
  for _, id in ipairs(store.order) do
    local b = store.byId[id]
    if b then table.insert(out, { id = b.id, name = b.name, icon = b.icon, color = b.color, ring = b.ring }) end
  end
  return out
end

-- Press one of the game's powertrain buttons: runs exactly what the game's own button runs.
BNGS.actions.pt_click = function(args)
  local store = BNGS.ptStore()
  local b = store and store.byId[args.id]
  if not b or type(b.click) ~= "string" then return { action = "pt_click", status = "unsupported", targets = {}, detail = "no such button" } end
  local fn, err = loadstring(b.click)
  if not fn then return { action = "pt_click", status = "failed", targets = {}, detail = tostring(err) } end
  fn()
  return { action = "pt_click", status = "applied", targets = { { role = "pt", device = b.id, ui = b.name, ok = true } } }
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

-- Step a driveModes controller to its next (or previous) mode. Uses the controller's own
-- next/previousDriveMode, so it cycles exactly the modes the game cycles for this config (disabled
-- modes in the vehicle data are skipped, as in game).
-- args: which = "tc" | "center" | <controller name>, dir = 1 | -1
BNGS.actions.drive_mode_step = function(args)
  local cc
  if args.which == "tc" then cc = tcCtrl()
  elseif args.which == "center" then cc = centerCtrl()
  else cc = dmCtrls()[args.which] end
  if not cc then return { action = "drive_mode_step", status = "unsupported", targets = {}, detail = "no matching drive mode controller" } end
  local c = cc.c
  local cur = c.getCurrentDriveModeKey()
  local step = (args.dir or 1) < 0 and c.previousDriveMode or c.nextDriveMode
  if step then
    step()
  else
    -- older controllers: walk the modes in the game's order
    local list = {}
    for _, m in pairs(cc.modes) do table.insert(list, m) end
    table.sort(list, function(x, y) return (x.order or 0) < (y.order or 0) end)
    local idx = 0
    for i, m in ipairs(list) do if m.key == cur then idx = i end end
    c.setDriveMode(list[((idx - 1 + (args.dir or 1)) % #list) + 1].key)
  end
  local now = c.getCurrentDriveModeKey()
  local m = cc.modes[now]
  return { action = "drive_mode_step", status = (now ~= cur) and "applied" or "already", side = {},
           targets = { { role = "controller", device = cc.name, ui = m and m.name or now, from = cur, to = now, ok = now ~= cur } } }
end

-- Mirror of the game's simple powertrain control bar. Controllers push their buttons to the UI
-- through ui_simplePowertrainControl.setButton; we wrap it once per vehicle VM to keep the latest
-- state of each button, then ask everything to re-send.
function BNGS.ptStore()
  local store = rawget(_G, "BNGSD_PT")
  if store then return store end
  local spc = extensions.ui_simplePowertrainControl
  if not spc and extensions.load then pcall(extensions.load, "ui_simplePowertrainControl"); spc = extensions.ui_simplePowertrainControl end
  if not spc or not spc.setButton then return nil end
  store = { order = {}, byId = {} }
  rawset(_G, "BNGSD_PT", store)
  local orig = spc.setButton
  spc.setButton = function(id, uiName, icon, color, ringValue, onClick, remove, active)
    if remove then store.byId[id] = nil
    else
      if not store.byId[id] then table.insert(store.order, id) end
      store.byId[id] = { id = id, name = uiName, icon = icon, color = color, ring = ringValue, click = onClick, active = active }
    end
    return orig(id, uiName, icon, color, ringValue, onClick, remove, active)
  end
  pcall(spc.updateButtons)
  return store
end

function BNGS.ptButtons()
  local store = BNGS.ptStore()
  if not store then return nil end
  local out = {}
  for _, id in ipairs(store.order) do
    local b = store.byId[id]
    if b then table.insert(out, { id = b.id, name = b.name, icon = b.icon, color = b.color, ring = b.ring }) end
  end
  return out
end

-- Press one of the game's powertrain buttons: runs exactly what the game's own button runs.
BNGS.actions.pt_click = function(args)
  local store = BNGS.ptStore()
  local b = store and store.byId[args.id]
  if not b or type(b.click) ~= "string" then return { action = "pt_click", status = "unsupported", targets = {}, detail = "no such button" } end
  local fn, err = loadstring(b.click)
  if not fn then return { action = "pt_click", status = "failed", targets = {}, detail = tostring(err) } end
  fn()
  return { action = "pt_click", status = "applied", targets = { { role = "pt", device = b.id, ui = b.name, ok = true } } }
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

-- Nitrous, the way the game's own N2O button does it.
-- args: op = toggle | arm | disarm (arming purges the lines), or op = spray with state = 1 | 0 (manual override)
BNGS.actions.n2o = function(args)
  local c = controller.getController("nitrousOxideInjection")
  if not c then return { action = "n2o", status = "unsupported", targets = {}, detail = "no nitrous fitted" } end
  local op = args.op or "toggle"
  if op == "spray" then
    c.setOverride(tonumber(args.state) == 1)
    return { action = "n2o", status = "applied", targets = {} }
  end
  local armed = (electrics.values.nitrousOxideArm or 0) >= 1
  local want = (op == "toggle" and not armed) or op == "arm"
  local res = { action = "n2o", side = {}, targets = { { role = "boost", device = "nitrousOxideArm", ui = "nitrous", from = armed and 1 or 0, want = want and 1 or 0 } } }
  if armed == want then res.targets[1].to = res.targets[1].from; res.targets[1].ok = true; res.status = "already"; return res end
  c.toggleActive()
  res.status = "pending"
  res.checks = { { src = "e", key = "nitrousOxideArm", expect = want and 1 or 0 } }
  return res
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
