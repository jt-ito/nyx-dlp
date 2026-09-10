const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawnSync } = require('child_process');

const { getVendorDir } = require('./vendor-dir');
const VENDOR_DIR = getVendorDir('treespend');

function getTreespendPath() {
  if (os.platform() !== 'win32') return null;
  return path.join(VENDOR_DIR, 'treespend.exe');
}

function ensureTreespend(sendLog = () => {}) {
  if (os.platform() !== 'win32') return;

  const exePath = getTreespendPath();
  if (fs.existsSync(exePath)) return;

  try {
    fs.mkdirSync(VENDOR_DIR, { recursive: true });
    const csSource = path.join(__dirname, 'treespend.cs');
    const cscPaths = [
      'C:\\Windows\\Microsoft.NET\\Framework64\\v4.0.30319\\csc.exe',
      'C:\\Windows\\Microsoft.NET\\Framework\\v4.0.30319\\csc.exe'
    ];
    let csc = cscPaths.find(p => fs.existsSync(p));
    if (csc && fs.existsSync(csSource)) {
      sendLog('[setup] Building native treespend.exe helper...');
      spawnSync(csc, ['/nologo', '/optimize', '/target:exe', `/out:${exePath}`, csSource], { stdio: 'ignore', timeout: 10000 });
      if (fs.existsSync(exePath)) {
        sendLog('[setup] treespend.exe ready.');
      }
    }
  } catch (err) {
    sendLog(`[setup] Warning: treespend compilation skipped: ${err.message}`);
  }
}

module.exports = {
  getTreespendPath,
  ensureTreespend
};
