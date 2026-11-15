// Keeps the vendored tools fresh while nyx-dlp is open (desktop app and headless server share this).
// First pass 30s after start, then every 6h. Never touches a tool while any run is active
// (a running .exe can't be replaced on Windows) and only moves to a newer version on the channel the
// user chose (stable or nightly; a pinned version is left alone).
const toolHub = require('./tool-hub');
const runners = require('./runners');

// ffmpeg is hardware-preset based, so it stays manual. Streamlink only counts when it lives in nyx-dlp's
// own venv (a system / pip copy isn't ours to touch, see isVendored below). bgutil restarts its server
// when updated, and is moved together with the yt-dlp plugin so the two stay on one release.
const AUTO_TOOLS = ['ytdlp', 'gallerydl', 'streamlink', 'aria2c', 'deno', 'bgutil'];

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

// Updates one tool if it is ours, on a channel we follow, and behind. Returns the new version or null.
async function updateTool(tool, broadcast, onUpdated) {
  const info = await toolHub.getToolInfo(tool);
  if (!info) return null;
  const channel = toolHub.getChannel ? toolHub.getChannel(tool) : 'latest';
  if (channel === 'pinned') return null;                          // the user chose a specific version
  if (channel === 'nightly' && tool !== 'ytdlp') return null;     // only yt-dlp has a nightly we can follow
  const target = channel === 'nightly' ? 'nightly' : 'latest';

  // Our own yt-dlp vanished (the app silently used a system copy instead): put it back.
  const lost = tool === 'ytdlp' && !info.isVendored && toolHub.wasManaged && toolHub.wasManaged('ytdlp');
  if (lost) {
    console.log('[Auto-Update] ytdlp: managed copy is missing, reinstalling');
    broadcast('tool-hub-progress', { tool, percent: 1, message: 'Reinstalling yt-dlp...' });
    const done = await toolHub.installToolVersion(tool, target, (p) => broadcast('tool-hub-progress', p));
    onUpdated(tool, (done && done.version) || target);
    return (done && done.version) || target;
  }

  // Only tools nyx-dlp installed itself: a system / user-managed copy is the user's to update.
  if (!info.installed || !info.isVendored) return null;
  const res = await toolHub.checkToolUpdates(tool);
  // isNewerVersion keeps a user's newer build from being "updated" backwards.
  if (!res.updateAvailable || !res.latestVersion || !isNewerVersion(res.latestVersion, res.currentVersion)) return null;
  console.log(`[Auto-Update] ${tool}: ${res.currentVersion} -> ${res.latestVersion}`);
  broadcast('tool-hub-progress', { tool, percent: 1, message: `Auto-updating to ${res.latestVersion}...` });
  await toolHub.installToolVersion(tool, target, (p) => broadcast('tool-hub-progress', p));
  onUpdated(tool, res.latestVersion);
  return res.latestVersion;
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
        await updateTool(tool, broadcast, onUpdated);
      } catch (err) {
        console.log(`[Auto-Update] ${tool} skipped:`, err.message);
      }
    }
  } finally {
    running = false;
  }
}

// Used when a YouTube download fails the way an out-of-date yt-dlp does (HTTP 403, bot check): update right
// away instead of waiting for the next round. Returns the new version, or null if nothing newer exists.
async function updateYtdlpNow(broadcast = () => {}, onUpdated = () => {}) {
  if (running) return null;
  try { if (!require('./settings-store').getSettingValue('dep-auto-update-tools', true)) return null; } catch (_) {}
  running = true;
  try {
    return await updateTool('ytdlp', broadcast, onUpdated);
  } catch (err) {
    console.log('[Auto-Update] ytdlp skipped:', err.message);
    return null;
  } finally {
    running = false;
  }
}

function startAutoUpdateTools(broadcast, onUpdated) {
  setTimeout(() => autoUpdateTools(broadcast, onUpdated), 30000);
  setInterval(() => autoUpdateTools(broadcast, onUpdated), 6 * 60 * 60 * 1000);
}

module.exports = { autoUpdateTools, updateYtdlpNow, startAutoUpdateTools, isNewerVersion };
