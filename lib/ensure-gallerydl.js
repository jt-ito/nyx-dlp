const fs = require('fs');
const path = require('path');
const https = require('https');
const os = require('os');
const { execSync } = require('child_process');

let VENDOR_DIR = path.join(__dirname, '..', 'vendor', 'gallery-dl');
if (process.versions && process.versions.electron) {
  VENDOR_DIR = path.join(require('electron').app.getPath('userData'), 'vendor', 'gallery-dl');
}

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

async function ensureGallerydl(autoUpdate = true, sendLog = console.log) {
  const exe = os.platform() === 'win32' ? 'gallery-dl.exe' : (os.platform() === 'darwin' ? 'gallery-dl.mac' : 'gallery-dl.bin');
  const finalExe = os.platform() === 'win32' ? 'gallery-dl.exe' : 'gallery-dl';
  const vendorBin = path.join(VENDOR_DIR, finalExe);

  try {
    fs.mkdirSync(VENDOR_DIR, { recursive: true });
  } catch (e) {
    sendLog(`[setup] Failed to create vendor directory: ${e.message}`);
    throw e;
  }

  if (!fs.existsSync(vendorBin)) {
    if (!autoUpdate) {
      sendLog(`[setup] gallery-dl standalone binary not found. Please install gallery-dl to vendor/gallery-dl/${finalExe}`);
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
      
      await downloadFile(url, vendorBin);
      if (os.platform() !== 'win32') {
        fs.chmodSync(vendorBin, 0o755);
      }
      sendLog(`[setup] gallery-dl downloaded to ${vendorBin}`);
    } catch (e) {
      sendLog(`[setup] Failed to download gallery-dl: ${e.message}`);
    }

  } else if (autoUpdate) {
    sendLog(`[setup] Checking for gallery-dl updates...`);
    try {
      const { exec } = require('child_process');
      const out = await new Promise((resolve, reject) => {
        exec(`"${vendorBin}" -U`, { encoding: 'utf-8', timeout: 15000, killSignal: 'SIGKILL' }, (error, stdout) => {
          if (error) reject(error);
          else resolve(stdout);
        });
      });
      const lines = out.trim().split('\n');
      for (const line of lines) {
        if (line.includes('gallery-dl is up to date') || line.includes('Updated gallery-dl')) {
          sendLog(`[setup] ${line.trim()}`);
        }
      }
    } catch (e) {
      sendLog(`[setup] gallery-dl update check failed or timed out. Using current version.`);
    }
  }
}

module.exports = {
  getGallerydlPath,
  ensureGallerydl
};
