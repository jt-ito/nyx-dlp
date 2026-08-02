const fs = require('fs');
const path = require('path');
const https = require('https');
const os = require('os');
const { execSync } = require('child_process');

let VENDOR_DIR = path.join(__dirname, '..', 'vendor', 'pssuspend');
if (process.versions && process.versions.electron) {
  VENDOR_DIR = path.join(require('electron').app.getPath('userData'), 'vendor', 'pssuspend');
}

function getPssuspendPath() {
  if (os.platform() !== 'win32') return null;
  return path.join(VENDOR_DIR, 'pssuspend64.exe');
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

async function ensurePssuspend(sendLog = console.log) {
  if (os.platform() !== 'win32') return;

  const exePath = getPssuspendPath();

  try {
    fs.mkdirSync(VENDOR_DIR, { recursive: true });
  } catch (e) {
    sendLog(`[setup] Failed to create pssuspend vendor directory: ${e.message}`);
    throw e;
  }

  if (fs.existsSync(exePath)) {
    return; // Already vendored
  }

  sendLog(`[setup] pssuspend64.exe not found. Downloading Sysinternals PsTools...`);
  const zipPath = path.join(VENDOR_DIR, 'PSTools.zip');

  try {
    await downloadFile('https://download.sysinternals.com/files/PSTools.zip', zipPath);
    sendLog(`[setup] Extracting PsTools...`);

    // Use built-in tar on Windows to extract
    execSync(`tar -xf "${zipPath}" -C "${VENDOR_DIR}"`, { stdio: 'ignore' });

    if (!fs.existsSync(exePath)) {
      throw new Error('Extraction did not produce pssuspend64.exe');
    }

    // Clean up zip
    try { fs.unlinkSync(zipPath); } catch (e) {}

    sendLog(`[setup] pssuspend64.exe ready.`);
  } catch (err) {
    sendLog(`[setup] Error setting up pssuspend: ${err.message}`);
    throw err;
  }
}

module.exports = {
  getPssuspendPath,
  ensurePssuspend
};
