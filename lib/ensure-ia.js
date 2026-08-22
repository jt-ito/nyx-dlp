const fs = require('fs');
const path = require('path');
const https = require('https');
const os = require('os');
const { execSync } = require('child_process');

const { getVendorDir } = require('./vendor-dir');
const VENDOR_DIR = getVendorDir('ia');

function getIaPath() {
  const exe = os.platform() === 'win32' ? 'ia.exe' : 'ia';
  const vendorBin = path.join(VENDOR_DIR, exe);
  if (fs.existsSync(vendorBin)) {
    return vendorBin;
  }
  // fallback to system path
  try {
    const checkCmd = os.platform() === 'win32' ? 'where ia' : 'which ia';
    const out = execSync(checkCmd, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    if (out.trim()) return 'ia';
  } catch (e) {}
  return vendorBin;
}

function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }, timeout: 30000 }, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        return downloadFile(res.headers.location, dest).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) {
        return reject(new Error(`Failed to download: ${res.statusCode}`));
      }
      const file = fs.createWriteStream(dest);
      res.pipe(file);
      file.on('finish', () => {
        file.close();
        resolve();
      });
      file.on('error', reject);
    });
    req.on('timeout', () => { req.destroy(); reject(new Error('Download timed out')); });
    req.on('error', reject);
  });
}

async function ensureIa(allowDownload = true, sendLog = console.log) {
  if (typeof allowDownload === 'function') {
    sendLog = allowDownload;
    allowDownload = true;
  }

  const exe = os.platform() === 'win32' ? 'ia.exe' : 'ia';
  const vendorBin = path.join(VENDOR_DIR, exe);

  if (fs.existsSync(vendorBin)) {
    sendLog(`[setup] IA CLI is ready.`);
    return vendorBin;
  }

  // Also check system path
  try {
    const checkCmd = os.platform() === 'win32' ? 'where ia' : 'which ia';
    const out = execSync(checkCmd, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    if (out.trim()) {
      sendLog(`[setup] IA CLI found in system PATH.`);
      return 'ia';
    }
  } catch (e) {}

  if (!allowDownload) {
    sendLog(`[error] Internet Archive CLI not found and auto-download is disabled. Please enable it in Settings or install it manually.`);
    throw new Error('IA CLI not found and auto-download is disabled.');
  }

  fs.mkdirSync(VENDOR_DIR, { recursive: true });

  sendLog(`[setup] IA CLI not found. Downloading latest release...`);
  // Internet Archive CLI releases
  const url = `https://github.com/jjjake/internetarchive/releases/latest/download/${exe}`;
  try {
    await downloadFile(url, vendorBin);
    if (os.platform() !== 'win32') {
      fs.chmodSync(vendorBin, 0o755);
    }
    sendLog(`[setup] IA CLI downloaded to ${vendorBin}`);
    return vendorBin;
  } catch (e) {
    sendLog(`[setup] Failed to download IA CLI: ${e.message}`);
    throw e;
  }
}

module.exports = {
  getIaPath,
  ensureIa
};
