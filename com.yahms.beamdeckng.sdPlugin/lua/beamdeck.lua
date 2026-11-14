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
  return s
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

rawset(_G, "BNGSD_BNGS", BNGS)
