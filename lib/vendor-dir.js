const path = require('path');
const os = require('os');
const fs = require('fs');

function getVendorBaseDir() {
  // If Electron is running:
  if (process.versions && process.versions.electron) {
    try {
      const electron = require('electron');
      const app = electron.app || (electron.remote && electron.remote.app);
      if (app && app.getPath) {
        return path.join(app.getPath('userData'), 'vendor');
      }
    } catch (_) {}
  }

  // Check if the local app vendor directory is writable
  const localVendor = path.join(__dirname, '..', 'vendor');
  try {
    if (!fs.existsSync(localVendor)) {
      fs.mkdirSync(localVendor, { recursive: true });
    }
    // Test write permission
    fs.accessSync(localVendor, fs.constants.W_OK);
    return localVendor;
  } catch (_) {
    // Read-only directory (e.g. /opt/nyx-dlp, /usr/local, root-owned unpacked dir)
    let userBase = '';
    if (process.platform === 'win32') {
      userBase = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
    } else if (process.platform === 'darwin') {
      userBase = path.join(os.homedir(), 'Library', 'Application Support');
    } else {
      userBase = process.env.XDG_DATA_HOME || path.join(os.homedir(), '.local', 'share');
    }
    const userVendor = path.join(userBase, 'nyx-dlp', 'vendor');
    try {
      if (!fs.existsSync(userVendor)) {
        fs.mkdirSync(userVendor, { recursive: true });
      }
    } catch (_) {}
    return userVendor;
  }
}

function getVendorDir(subfolder) {
  const base = getVendorBaseDir();
  const target = subfolder ? path.join(base, subfolder) : base;
  try {
    if (!fs.existsSync(target)) {
      fs.mkdirSync(target, { recursive: true });
    }
  } catch (_) {}
  return target;
}

module.exports = {
  getVendorBaseDir,
  getVendorDir
};
