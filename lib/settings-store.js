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

function loadAllSettings() {
  try {
    if (fs.existsSync(settingsFilePath)) {
      const raw = fs.readFileSync(settingsFilePath, 'utf8');
      return JSON.parse(raw);
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
    fs.writeFileSync(settingsFilePath, JSON.stringify(state || {}, null, 2), 'utf8');
  } catch (e) {
    console.error('[settings-store] Error writing settings:', e.message);
  }
}

function updateSetting(id, data) {
  if (!id) return;
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
  loadAllSettings,
  saveAllSettings,
  updateSetting,
  getSettingValue
};
