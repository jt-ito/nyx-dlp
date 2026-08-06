const fs = require('fs');
const path = require('path');
const https = require('https');
const os = require('os');
const { execSync } = require('child_process');

let VENDOR_DIR = path.join(__dirname, '..', 'vendor', 'ytdlp');
if (process.versions && process.versions.electron) {
  VENDOR_DIR = path.join(require('electron').app.getPath('userData'), 'vendor', 'ytdlp');
}

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

function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' } }, (res) => {
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
    }).on('error', reject);
  });
}

async function ensureYtdlp(sendLog = console.log) {
  const exe = os.platform() === 'win32' ? 'yt-dlp.exe' : (os.platform() === 'darwin' ? 'yt-dlp_macos' : 'yt-dlp_linux');
  const finalExe = os.platform() === 'win32' ? 'yt-dlp.exe' : 'yt-dlp';
  const vendorBin = path.join(VENDOR_DIR, finalExe);

  try {
    fs.mkdirSync(VENDOR_DIR, { recursive: true });
  } catch (e) {
    sendLog(`[setup] Failed to create vendor directory: ${e.message}`);
    throw e;
  }

  if (!fs.existsSync(vendorBin)) {
    sendLog(`[setup] yt-dlp not found. Downloading latest release...`);
    const url = `https://github.com/yt-dlp/yt-dlp/releases/latest/download/${exe}`;
    try {
      await downloadFile(url, vendorBin);
      if (os.platform() !== 'win32') {
        fs.chmodSync(vendorBin, 0o755);
      }
      sendLog(`[setup] yt-dlp downloaded to ${vendorBin}`);
    } catch (e) {
      sendLog(`[setup] Failed to download yt-dlp: ${e.message}`);
    }
  } else {
    // Attempt auto-update via -U
    sendLog(`[setup] Checking for yt-dlp updates...`);
    try {
      const out = execSync(`"${vendorBin}" -U`, { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] });
      const lines = out.trim().split('\n');
      for (const line of lines) {
        if (line.includes('yt-dlp is up to date') || line.includes('Updated yt-dlp')) {
          sendLog(`[setup] ${line.trim()}`);
        }
      }
    } catch (e) {
      sendLog(`[setup] yt-dlp update check failed (network issue or permission denied). Using current version.`);
    }
  }
}

module.exports = {
  getYtdlpPath,
  ensureYtdlp
};
