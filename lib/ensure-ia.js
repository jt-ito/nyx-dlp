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
    const checkCmd = os.platform() === 'win32' ? 'where.exe ia.exe' : 'which ia';
    const out = execSync(checkCmd, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    const lines = out.trim().split(/\r?\n/);
    if (lines.length > 0 && lines[0].trim()) return lines[0].trim();
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

// Upstream only publishes a Python .pex (a single-file app with a python3 shebang), no native binary.
// On Linux/macOS that runs directly once downloaded; Windows has no equivalent, so it needs `pip install internetarchive`.
function getJson(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'nyx-dlp' }, timeout: 15000 }, (res) => {
      let body = '';
      res.on('data', (d) => { body += d; });
      res.on('end', () => {
        if (res.statusCode !== 200) return reject(new Error('HTTP ' + res.statusCode));
        try { resolve(JSON.parse(body)); } catch (e) { reject(e); }
      });
    }).on('error', reject);
  });
}

async function installIa(version = 'latest', sendLog = console.log) {
  if (os.platform() === 'win32') {
    throw new Error('The Internet Archive CLI has no standalone Windows build. Install Python, then run "pip install internetarchive"; nyx-dlp will detect ia automatically.');
  }
  let url;
  if (version === 'latest') {
    const rel = await getJson('https://api.github.com/repos/jjjake/internetarchive/releases/latest');
    const asset = (rel.assets || []).find(a => /\.pex$/i.test(a.name));
    if (!asset) throw new Error('No downloadable build found in the latest Internet Archive CLI release.');
    url = asset.browser_download_url;
  } else {
    const v = String(version).replace(/^v/, '');
    url = `https://github.com/jjjake/internetarchive/releases/download/v${v}/ia-${v}-py3-none-any.pex`;
  }
  fs.mkdirSync(VENDOR_DIR, { recursive: true });
  const dest = path.join(VENDOR_DIR, 'ia');
  sendLog(`[setup] Downloading Internet Archive CLI...`);
  try {
    await downloadFile(url, dest);
  } catch (e) {
    if (/404/.test(e.message)) throw new Error(`Version "${version}" is not real or available for Internet Archive CLI.`);
    throw e;
  }
  fs.chmodSync(dest, 0o755);
  return dest;
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
    const checkCmd = os.platform() === 'win32' ? 'where.exe ia.exe' : 'which ia';
    const out = execSync(checkCmd, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    const lines = out.trim().split(/\r?\n/);
    if (lines.length > 0 && lines[0].trim()) {
      const fullPath = lines[0].trim();
      sendLog(`[setup] IA CLI found in system PATH (${fullPath}).`);
      return fullPath;
    }
  } catch (e) {}

  if (!allowDownload) {
    sendLog(`[error] Internet Archive CLI not found and auto-download is disabled. Please enable it in Settings or install it manually.`);
    throw new Error('IA CLI not found and auto-download is disabled.');
  }

  sendLog(`[setup] IA CLI not found. Installing...`);
  try {
    const bin = await installIa('latest', sendLog);
    sendLog(`[setup] IA CLI installed to ${bin}`);
    return bin;
  } catch (e) {
    sendLog(`[setup] Failed to install IA CLI: ${e.message}`);
    throw e;
  }
}

module.exports = {
  getIaPath,
  ensureIa,
  installIa
};
