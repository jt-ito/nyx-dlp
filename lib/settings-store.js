const fs = require('fs');
const path = require('path');
const os = require('os');

function getConfigDir() {
  // 1. If Electron is running, userData is the source of truth (in portable mode, it is <portableRoot>/data)
  if (process.versions && process.versions.electron) {
    try {
      const electron = require('electron');
      const app = electron.app || (electron.remote && electron.remote.app);
      if (app && app.getPath) {
        const uPath = app.getPath('userData');
        if (uPath) return uPath;
      }
    } catch (_) {}
  }

  // 2. Standalone / CLI portable root check
  try {
    const { getPortableRootDir } = require('./vendor-dir');
    const portableRoot = getPortableRootDir();
    if (portableRoot) {
      const dataDir = path.join(portableRoot, 'data');
      if (!fs.existsSync(dataDir)) {
        try { fs.mkdirSync(dataDir, { recursive: true }); } catch (_) {}
      }
      return dataDir;
    }
  } catch (_) {}

  // 3. Fallback for non-portable standalone CLI
  let baseDir = '';
  if (process.platform === 'win32') {
    baseDir = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
  } else {
    baseDir = process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config');
  }
  const nyxDir = path.join(baseDir, 'nyx-dlp');
  try {
    if (!fs.existsSync(nyxDir)) {
      fs.mkdirSync(nyxDir, { recursive: true });
    }
  } catch (_) {}
  return nyxDir;
}

function getSettingsFilePath() {
  return path.join(getConfigDir(), 'nyx-settings.json');
}

const TRANSIENT_KEYS = new Set([
  'yd-url', 'batch-urls', 'ls-url', 'm3-url', 'm3-urls', 'gdl-url', 'gdl-urls',
  'yd-start', 'yd-end', 'm3-start', 'm3-end', 'm3-twitch-title-input',
  'concat-output-name',
  'mg-output-name',
  'sp-file',
  'ia-identifier-up', 'ia-identifier-edit', 'ia-identifier-down', 'ia-identifier-dl',
  'ia-title', 'ia-description', 'ia-creator',
  'ia-date', 'ia-date-y', 'ia-date-m', 'ia-date-d',
  'ia-collection', 'ia-mediatype', 'ia-subject', 'ia-license', 'ia-language',
  'ia-edit-key', 'ia-edit-value',
  'ia-auth-email', 'ia-auth-password'
]);

function loadAllSettings() {
  const filePath = getSettingsFilePath();
  try {
    if (fs.existsSync(filePath)) {
      const raw = fs.readFileSync(filePath, 'utf8');
      const parsed = JSON.parse(raw);
      let changed = false;
      for (const k of Object.keys(parsed)) {
        if (TRANSIENT_KEYS.has(k)) {
          delete parsed[k];
          changed = true;
        }
      }
      if (changed) saveAllSettings(parsed);
      return parsed;
    }
  } catch (e) {
    console.error('[settings-store] Error reading settings:', e.message);
  }
  return {};
}

function saveAllSettings(state) {
  const filePath = getSettingsFilePath();
  try {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const sanitized = {};
    for (const [k, v] of Object.entries(state || {})) {
      if (!TRANSIENT_KEYS.has(k)) sanitized[k] = v;
    }
    fs.writeFileSync(filePath, JSON.stringify(sanitized, null, 2), 'utf8');
  } catch (e) {
    console.error('[settings-store] Error writing settings:', e.message);
  }
}

function updateSetting(id, data) {
  if (!id || TRANSIENT_KEYS.has(id)) return;
  const current = loadAllSettings();
  if (data === 'undefined' || data === 'null') {
    delete current[id];
  } else if (data && typeof data === 'object' && (data.value === 'undefined' || data.value === 'null')) {
    delete current[id];
  } else {
    current[id] = data;
  }
  saveAllSettings(current);
  return current;
}

function getSettingValue(id, fallback = null) {
  const current = loadAllSettings();
  if (current[id] !== undefined && current[id] !== null) {
    let val = current[id];
    if (val && typeof val === 'object') {
      if (val.type === 'checkbox') return !!val.checked;
      if (val.value !== undefined) val = val.value;
    }
    if (val === 'undefined' || val === 'null' || val === undefined || val === null) {
      return fallback;
    }
    return val;
  }
  return fallback;
}

// The Discord bot's download folder. 'discord-download-dir' (what the settings field syncs on every
// edit) is the only source of truth. Older versions also kept 'discordDownloadDir' and a copy in
// app-settings.json; those are read once to migrate, then ignored, so a stale copy can never win.
const DISCORD_DIR_KEY = 'discord-download-dir';

function getDiscordDownloadDir(legacy = '') {
  const all = loadAllSettings();
  const saved = all[DISCORD_DIR_KEY];
  if (saved === undefined || saved === null) {
    const old = String(all.discordDownloadDir || legacy || '').trim();
    if (old && old !== 'undefined' && old !== 'null') {
      updateSetting(DISCORD_DIR_KEY, { id: DISCORD_DIR_KEY, type: 'text', value: old });
      return old;
    }
    return '';
  }
  return String(getSettingValue(DISCORD_DIR_KEY, '') || '').trim();
}

// Called when connecting the bot with a folder from the UI. A blank value (field not filled in yet)
// must never wipe a saved folder; clearing it on purpose is done by emptying the field itself.
function rememberDiscordDownloadDir(dir) {
  const d = String(dir || '').trim();
  if (!d || d === 'undefined' || d === 'null') return;
  updateSetting(DISCORD_DIR_KEY, { id: DISCORD_DIR_KEY, type: 'text', value: d });
}

module.exports = {
  getDiscordDownloadDir,
  rememberDiscordDownloadDir,
  get settingsFilePath() { return getSettingsFilePath(); },
  getConfigDir,
  getSettingsFilePath,
  loadAllSettings,
  saveAllSettings,
  updateSetting,
  getSettingValue
};
