const fs = require('fs');
const path = require('path');
const https = require('https');
const os = require('os');
const { execSync } = require('child_process');

const { getVendorDir } = require('./vendor-dir');
const { downloadFileWithProgress } = require('./download-helper');
const VENDOR_DIR = getVendorDir('ytdlp');

function getYtdlpPath() {
  const exe = os.platform() === 'win32' ? 'yt-dlp.exe' : 'yt-dlp';
  const vendorBin = path.join(VENDOR_DIR, exe);
  if (fs.existsSync(vendorBin)) {
    return vendorBin;
  }
  // fallback to system path
  try {
    const checkCmd = os.platform() === 'win32' ? 'where yt-dlp' : 'which yt-dlp';
    const out = execSync(checkCmd, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    if (out.trim()) return 'yt-dlp';
  } catch (e) {}
  return vendorBin;
}

async function ensureYtdlp(sendLog = console.log) {
  const exe = os.platform() === 'win32' ? 'yt-dlp.exe' : (os.platform() === 'darwin' ? 'yt-dlp_macos' : 'yt-dlp');
  const finalExe = os.platform() === 'win32' ? 'yt-dlp.exe' : 'yt-dlp';
  const vendorBin = path.join(VENDOR_DIR, finalExe);

  // If already vendored or available on system PATH
  if (fs.existsSync(vendorBin)) {
    return vendorBin;
  }

  try {
    const checkCmd = os.platform() === 'win32' ? 'where yt-dlp' : 'which yt-dlp';
    const out = execSync(checkCmd, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    if (out.trim()) {
      sendLog(`[setup] Using system yt-dlp (${out.trim().split(/\r?\n/)[0]})`);
      return 'yt-dlp';
    }
  } catch (_) {}

  sendLog(`[setup] yt-dlp not found on system. Downloading latest standalone release...`);
  const url = `https://github.com/yt-dlp/yt-dlp/releases/latest/download/${exe}`;
  try {
    await downloadFileWithProgress(url, vendorBin, sendLog);
    if (os.platform() !== 'win32') {
      fs.chmodSync(vendorBin, 0o755);
    }
    sendLog(`[setup] ✔ yt-dlp ready: ${vendorBin}`);
    return vendorBin;
  } catch (e) {
    sendLog(`[setup] Failed to download yt-dlp: ${e.message}`);
    throw e;
  }
}

module.exports = {
  getYtdlpPath,
  ensureYtdlp
};
