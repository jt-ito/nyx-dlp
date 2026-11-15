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
  if (os.platform() === 'darwin') {
    const macPaths = ['/opt/homebrew/bin/yt-dlp', '/usr/local/bin/yt-dlp'];
    for (const p of macPaths) {
      if (fs.existsSync(p)) return p;
    }
  }
  return vendorBin;
}

// A yt-dlp that nyx-dlp installed itself once is expected to stay: if it vanishes, put it back instead of
// quietly running whatever old copy is on PATH (that is how an out-of-date build ends up used for YouTube).
function wasManagedBefore() {
  try { return String(require('./settings-store').getSettingValue('tool-managed:ytdlp', '')) === '1'; } catch (_) { return false; }
}
function markManaged() {
  try {
    const st = require('./settings-store');
    st.updateSetting('tool-managed:ytdlp', { id: 'tool-managed:ytdlp', type: 'text', value: '1' });
  } catch (_) { }
}

function findSystemYtdlp(sendLog) {
  try {
    const checkCmd = os.platform() === 'win32' ? 'where yt-dlp' : 'which yt-dlp';
    const out = execSync(checkCmd, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    if (out.trim()) {
      const where = out.trim().split(/\r?\n/)[0];
      let ver = '';
      try { ver = execSync('yt-dlp --version', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 10000 }).trim(); } catch (_) {}
      // Not the copy nyx-dlp manages, so it may be old (YouTube breaks old builds within days): say so loudly.
      sendLog(`WARNING: [setup] nyx-dlp's own yt-dlp is missing, so the yt-dlp on your PATH is being used (${where}, version ${ver || 'unknown'}). It may be out of date and cause errors like HTTP 403. Install yt-dlp from Tools & Engines to use the managed copy.`);
      return 'yt-dlp';
    }
  } catch (_) {}
  if (os.platform() === 'darwin') {
    const macPaths = ['/opt/homebrew/bin/yt-dlp', '/usr/local/bin/yt-dlp'];
    for (const p of macPaths) {
      if (fs.existsSync(p)) {
        sendLog(`[setup] Using Homebrew yt-dlp (${p})`);
        return p;
      }
    }
  }
  return null;
}

// The release asset to download. On Linux the plain "yt-dlp" asset is a ~3 MB Python script that needs Python;
// the standalone PyInstaller builds are the ones named yt-dlp_linux*.
function ytdlpAssetName(platform = os.platform(), arch = os.arch()) {
  if (platform === 'win32') return 'yt-dlp.exe';
  if (platform === 'darwin') return 'yt-dlp_macos';
  if (arch === 'arm64') return 'yt-dlp_linux_aarch64';
  if (arch === 'arm') return 'yt-dlp_linux_armv7l';
  return 'yt-dlp_linux';
}

async function ensureYtdlp(sendLog = console.log) {
  const exe = ytdlpAssetName();
  const finalExe = os.platform() === 'win32' ? 'yt-dlp.exe' : 'yt-dlp';
  const vendorBin = path.join(VENDOR_DIR, finalExe);

  if (fs.existsSync(vendorBin)) {
    if (!wasManagedBefore()) markManaged();   // remember that we own it, so a later disappearance gets repaired
    return vendorBin;
  }

  const heal = wasManagedBefore();
  if (!heal) {
    const sys = findSystemYtdlp(sendLog);
    if (sys) return sys;
  }

  sendLog(heal ? '[setup] The managed yt-dlp is missing. Reinstalling it...' : '[setup] yt-dlp not found on system. Downloading latest standalone release...');
  const url = `https://github.com/yt-dlp/yt-dlp/releases/latest/download/${exe}`;
  try {
    const { verifyBinary } = require('./verify-binary');
    await downloadFileWithProgress(url, vendorBin, sendLog, 5, (tmp) => verifyBinary(tmp, {
      name: exe, sumsUrl: url.replace(/[^/]+$/, 'SHA2-256SUMS'), minBytes: 5000000
    }));
    if (os.platform() !== 'win32') {
      fs.chmodSync(vendorBin, 0o755);
    }
    markManaged();
    sendLog(`[setup] ✔ yt-dlp ready: ${vendorBin}`);
    return vendorBin;
  } catch (e) {
    sendLog(`[setup] Failed to download yt-dlp: ${e.message}`);
    if (heal) {
      const sys = findSystemYtdlp(sendLog);
      if (sys) return sys;
    }
    throw e;
  }
}

module.exports = {
  getYtdlpPath,
  ensureYtdlp,
  ytdlpAssetName
};
