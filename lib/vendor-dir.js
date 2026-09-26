const path = require('path');
const os = require('os');
const fs = require('fs');

/**
 * Resolves the canonical portable root directory if a .portable marker exists.
 * Precedence:
 *   1. Packaged executable directory (exe-adjacent .portable) - primary canonical case
 *   2. Project root directory (path.join(__dirname, '..', '.portable')) - dev / CLI fallback
 * Returns the directory containing .portable, or null if not in portable mode.
 */
function getPortableRootDir() {
  try {
    // 1. Check exe-adjacent location (packaged Electron or compiled binary)
    let exeDir = null;
    if (process.versions && process.versions.electron) {
      try {
        const electron = require('electron');
        const app = electron.app || (electron.remote && electron.remote.app);
        if (app && app.getPath) {
          exeDir = path.dirname(app.getPath('exe'));
        }
      } catch (_) {}
    }
    if (!exeDir && process.execPath) {
      const baseName = path.basename(process.execPath).toLowerCase();
      if (!baseName.startsWith('node')) {
        exeDir = path.dirname(process.execPath);
      }
    }
    if (exeDir && fs.existsSync(path.join(exeDir, '.portable'))) {
      return exeDir;
    }

    // 2. Dev / CLI project root fallback (adjacent to package.json)
    const projectRoot = path.join(__dirname, '..');
    if (fs.existsSync(path.join(projectRoot, '.portable'))) {
      return projectRoot;
    }
  } catch (_) {}
  return null;
}

function getVendorBaseDir() {
  // 1. If Electron is running, userData is the single source of truth.
  // main.js already calls app.setPath('userData', dataDir) when in portable mode.
  // Therefore, app.getPath('userData') is guaranteed to match the exact userData root,
  // preventing any split-brain state between app settings/data and vendor binaries.
  if (process.versions && process.versions.electron) {
    try {
      const electron = require('electron');
      const app = electron.app || (electron.remote && electron.remote.app);
      if (app && app.getPath) {
        const vendorDir = path.join(app.getPath('userData'), 'vendor');
        try {
          if (!fs.existsSync(vendorDir)) {
            fs.mkdirSync(vendorDir, { recursive: true });
          }
          fs.accessSync(vendorDir, fs.constants.W_OK);
          return vendorDir;
        } catch (_) {
          // If userData/vendor is not writable (e.g. read-only mount), fall through to writable userBase
        }
      }
    } catch (_) {}
  }

  // 2. Non-Electron / Standalone CLI mode: use shared portable root helper
  const portableRoot = getPortableRootDir();
  if (portableRoot) {
    const portableVendor = path.join(portableRoot, 'data', 'vendor');
    try {
      if (!fs.existsSync(portableVendor)) {
        fs.mkdirSync(portableVendor, { recursive: true });
      }
      fs.accessSync(portableVendor, fs.constants.W_OK);
      return portableVendor;
    } catch (_) {
      // Read-only portable volume: fall through to writable userBase below
    }
  }

  // 3. Check if local application ./vendor directory is writable
  const localVendor = path.join(__dirname, '..', 'vendor');
  try {
    if (!fs.existsSync(localVendor)) {
      fs.mkdirSync(localVendor, { recursive: true });
    }
    fs.accessSync(localVendor, fs.constants.W_OK);
    return localVendor;
  } catch (_) {
    // 4. Read-only directory fallback: %APPDATA% / XDG / Library
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
  getPortableRootDir,
  getVendorBaseDir,
  getVendorDir
};
