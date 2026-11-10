// Keeps the vendored tools fresh while nyx-dlp is open (desktop app and headless server share this).
// First pass 30s after start, then every 6h. Never touches a tool while any run is active
// (a running .exe can't be replaced on Windows) and only moves to a newer stable version.
const toolHub = require('./tool-hub');
const runners = require('./runners');

// ffmpeg is hardware-preset based and bgutil restarts a server, so both stay manual. Streamlink only
// counts when it lives in nyx-dlp's own venv (a system / pip copy isn't ours to touch, see isVendored below).
const AUTO_TOOLS = ['ytdlp', 'gallerydl', 'streamlink', 'aria2c', 'deno'];

// True if `latest` is a newer dotted version than `current` ("1.32.9" < "1.32.16", "v" prefix ok).
function isNewerVersion(latest, current) {
  const parts = (v) => (v || '').replace(/^v/i, '').trim().split('.').map(n => parseInt(n) || 0);
  const l = parts(latest), c = parts(current);
  for (let i = 0; i < Math.max(l.length, c.length); i++) {
    if ((l[i] || 0) > (c[i] || 0)) return true;
    if ((l[i] || 0) < (c[i] || 0)) return false;
  }
  return false;
}

let running = false;
async function autoUpdateTools(broadcast = () => {}, onUpdated = () => {}) {
  if (running) return;
  try { if (!require('./settings-store').getSettingValue('dep-auto-update-tools', true)) return; } catch (_) {}
  running = true;
  try {
    for (const tool of AUTO_TOOLS) {
      if (runners.getActiveTaskCount() > 0) return; // try again next round
      try {
        const info = await toolHub.getToolInfo(tool);
        // Only tools nyx-dlp installed itself: a system / user-managed copy is the user's to update.
        if (!info || !info.installed || !info.isVendored) continue;
        const res = await toolHub.checkToolUpdates(tool);
        // isNewerVersion keeps a user's nightly/pinned newer build from being "updated" backwards.
        if (!res.updateAvailable || !res.latestVersion || !isNewerVersion(res.latestVersion, res.currentVersion)) continue;
        console.log(`[Auto-Update] ${tool}: ${res.currentVersion} -> ${res.latestVersion}`);
        broadcast('tool-hub-progress', { tool, percent: 1, message: `Auto-updating to ${res.latestVersion}...` });
        await toolHub.installToolVersion(tool, 'latest', (p) => broadcast('tool-hub-progress', p));
        onUpdated(tool, res.latestVersion);
      } catch (err) {
        console.log(`[Auto-Update] ${tool} skipped:`, err.message);
      }
    }
  } finally {
    running = false;
  }
}

function startAutoUpdateTools(broadcast, onUpdated) {
  setTimeout(() => autoUpdateTools(broadcast, onUpdated), 30000);
  setInterval(() => autoUpdateTools(broadcast, onUpdated), 6 * 60 * 60 * 1000);
}

module.exports = { autoUpdateTools, startAutoUpdateTools, isNewerVersion };
