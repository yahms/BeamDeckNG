-- BeamDeckNG MP-MCP: start the listener when this mod loads.
-- If a copy from somewhere else is already running (a local copy loaded before joining a BeamMP
-- server), replace it with this one, so the server's own copy and allowlist are what runs.
setExtensionUnloadMode("beamdeckngMP", "manual")
local mine
pcall(function() mine = FS:getOriginArchivePathRelative("/scripts/beamdeckng_mp/modScript.lua") end)
local running = extensions.beamdeckngMP
if not running then
  extensions.load("beamdeckngMP")
elseif running.loadedFrom and running.loadedFrom() ~= mine then
  extensions.reload("beamdeckngMP")
end
