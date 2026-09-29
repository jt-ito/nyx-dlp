const path = require('path');
const os = require('os');
const fs = require('fs');

/**
 * Resolves the canonical portable root directory if an explicit portable marker exists.
 * Portable mode is currently designed and scoped strictly to Windows (process.platform === 'win32').
 * On macOS, executables run from inside a signed .app bundle (YourApp.app/Contents/MacOS/),
 * where runtime writes break code-signing seals. On Linux, packaging and symlinks require a
 * distinct specification.
 *
 * Precedence:
 *   1. Packaged executable directory (exe-adjacent .portable, portable.txt, or portable.ini)
 *   2. Project root directory (path.join(__dirname, '..', '.portable')) - dev / CLI testing fallback
 * Returns the directory containing the explicit portable marker, or null if not in portable mode.
 */
function getPortableRootDir() {
  // Portable mode is currently supported on Windows only
  if (process.platform !== 'win32') {
    return null;
  }

  try {
    const markers = ['.portable', 'portable.txt', 'portable.ini'];

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
    if (exeDir) {
      for (const m of markers) {
        if (fs.existsSync(path.join(exeDir, m))) return exeDir;
      }
    }

    // 2. Dev / CLI project root fallback (adjacent to package.json)
    const projectRoot = path.join(__dirname, '..');
    for (const m of markers) {
      if (fs.existsSync(path.join(projectRoot, m))) return projectRoot;
    }
  } catch (_) {}
  return null;
}

function getVendorBaseDir() {
  const portableRoot = getPortableRootDir();

  // 1. Portable mode: always keep vendor binaries strictly inside the portable folder
  if (portableRoot) {
    // Prefer existing <portableRoot>/vendor if present and writable
    const rootVendor = path.join(portableRoot, 'vendor');
    if (fs.existsSync(rootVendor)) {
      try {
        fs.accessSync(rootVendor, fs.constants.W_OK);
        return rootVendor;
      } catch (_) {}
    }

    // Default portable vendor location: <portableRoot>/data/vendor (alongside userData)
    const dataVendor = path.join(portableRoot, 'data', 'vendor');
    try {
      if (!fs.existsSync(dataVendor)) {
        fs.mkdirSync(dataVendor, { recursive: true });
      }
      fs.accessSync(dataVendor, fs.constants.W_OK);
      return dataVendor;
    } catch (_) {}

    // Fallback: try creating <portableRoot>/vendor
    try {
      if (!fs.existsSync(rootVendor)) {
        fs.mkdirSync(rootVendor, { recursive: true });
      }
      fs.accessSync(rootVendor, fs.constants.W_OK);
      return rootVendor;
    } catch (_) {}
  }

  // 2. Packaged installed app (NSIS / DMG / AppImage installed in system directories):
  // System directories like Program Files are read-only, so use userData/vendor
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
        } catch (_) {}
      }
    } catch (_) {}
  }

  // 3. Standalone CLI fallback (or dev/unpackaged Electron with no portable marker): %APPDATA% / XDG / Library
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

function getVendorDir(subfolder) {
  if (!subfolder) return getVendorBaseDir();

  const portableRoot = getPortableRootDir();
  if (portableRoot) {
    // If tool binary folder already exists in either <portableRoot>/vendor or <portableRoot>/data/vendor, return it
    const candidate1 = path.join(portableRoot, 'vendor', subfolder);
    const candidate2 = path.join(portableRoot, 'data', 'vendor', subfolder);
    if (fs.existsSync(candidate1)) return candidate1;
    if (fs.existsSync(candidate2)) return candidate2;
  }

  const base = getVendorBaseDir();
  const target = path.join(base, subfolder);
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
