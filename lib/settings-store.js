const fs = require('fs');
const path = require('path');
const os = require('os');

function getConfigDir() {
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

const settingsFilePath = path.join(getConfigDir(), 'nyx-settings.json');

const TRANSIENT_KEYS = new Set([
  'yd-url', 'batch-urls', 'ls-url', 'm3-url', 'gdl-url',
  'yd-start', 'yd-end', 'm3-start', 'm3-end',
  'concat-output-name',
  'ia-identifier-up', 'ia-identifier-edit', 'ia-identifier-dl',
  'ia-title', 'ia-description', 'ia-creator', 'ia-date', 'ia-collection', 'ia-mediatype', 'ia-subject',
  'ia-auth-email', 'ia-auth-password'
]);

function loadAllSettings() {
  try {
    if (fs.existsSync(settingsFilePath)) {
      const raw = fs.readFileSync(settingsFilePath, 'utf8');
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
  try {
    const dir = path.dirname(settingsFilePath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const sanitized = {};
    for (const [k, v] of Object.entries(state || {})) {
      if (!TRANSIENT_KEYS.has(k)) sanitized[k] = v;
    }
    fs.writeFileSync(settingsFilePath, JSON.stringify(sanitized, null, 2), 'utf8');
  } catch (e) {
    console.error('[settings-store] Error writing settings:', e.message);
  }
}

function updateSetting(id, data) {
  if (!id || TRANSIENT_KEYS.has(id)) return;
  const current = loadAllSettings();
  current[id] = data;
  saveAllSettings(current);
  return current;
}

function getSettingValue(id, fallback = null) {
  const current = loadAllSettings();
  if (current[id] !== undefined) {
    if (current[id] && typeof current[id] === 'object') {
      if (current[id].type === 'checkbox') return current[id].checked;
      if (current[id].value !== undefined) return current[id].value;
    }
    return current[id];
  }
  return fallback;
}

module.exports = {
  settingsFilePath,
  getConfigDir,
  loadAllSettings,
  saveAllSettings,
  updateSetting,
  getSettingValue
};
