const fs = require('fs');
const path = require('path');
const https = require('https');
const os = require('os');
const { execSync } = require('child_process');

const { getVendorDir } = require('./vendor-dir');
const VENDOR_DIR = getVendorDir('gallery-dl');

function getGallerydlPath() {
  const exe = os.platform() === 'win32' ? 'gallery-dl.exe' : 'gallery-dl';
  const vendorBin = path.join(VENDOR_DIR, exe);
  if (fs.existsSync(vendorBin)) {
    return vendorBin;
  }
  // fallback to system path
  try {
    const checkCmd = os.platform() === 'win32' ? 'where gallery-dl' : 'which gallery-dl';
    const out = execSync(checkCmd, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    if (out.trim()) return 'gallery-dl';
  } catch (e) {}
  return vendorBin;
}

const { downloadFileWithProgress } = require('./download-helper');

async function ensureGallerydl(autoUpdate = true, sendLog = console.log) {
  const exe = os.platform() === 'win32' ? 'gallery-dl.exe' : (os.platform() === 'darwin' ? 'gallery-dl.mac' : 'gallery-dl.bin');
  const finalExe = os.platform() === 'win32' ? 'gallery-dl.exe' : 'gallery-dl';
  const vendorBin = path.join(VENDOR_DIR, finalExe);

  if (fs.existsSync(vendorBin)) {
    return vendorBin;
  }

  try {
    const checkCmd = os.platform() === 'win32' ? 'where gallery-dl' : 'which gallery-dl';
    const out = execSync(checkCmd, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    if (out.trim()) {
      sendLog(`[setup] Using system gallery-dl (${out.trim().split(/\r?\n/)[0]})`);
      return 'gallery-dl';
    }
  } catch (_) {}

  if (!autoUpdate) {
    sendLog(`[setup] gallery-dl standalone binary not found.`);
    return;
  }
  sendLog(`[setup] gallery-dl not found. Downloading latest release from Codeberg...`);
  try {
    const tag = await new Promise((resolve, reject) => {
      https.get('https://codeberg.org/api/v1/repos/mikf/gallery-dl/releases/latest', { headers: { 'User-Agent': 'Mozilla/5.0' } }, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try { resolve(JSON.parse(data).tag_name); } catch(e) { reject(e); }
        });
      }).on('error', reject);
    });
    if (!tag) throw new Error('Could not determine latest tag from Codeberg');
    const url = `https://codeberg.org/mikf/gallery-dl/releases/download/${tag}/${exe}`;
    
    await downloadFileWithProgress(url, vendorBin, sendLog);
    if (os.platform() !== 'win32') {
      fs.chmodSync(vendorBin, 0o755);
    }
    sendLog(`[setup] ✔ gallery-dl ready: ${vendorBin}`);
    return vendorBin;
  } catch (e) {
    sendLog(`[setup] Failed to download gallery-dl: ${e.message}`);
  }
}

module.exports = {
  getGallerydlPath,
  ensureGallerydl
};
