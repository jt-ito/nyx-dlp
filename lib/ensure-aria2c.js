const fs = require('fs');
const path = require('path');
const os = require('os');
const https = require('https');
const { execSync, execFile } = require('child_process');

const { getVendorDir } = require('./vendor-dir');
const { downloadFileWithProgress } = require('./download-helper');
const VENDOR_DIR = getVendorDir('aria2c');

const EXE = os.platform() === 'win32' ? 'aria2c.exe' : 'aria2c';

function getAria2Path() {
  const vendorBin = path.join(VENDOR_DIR, EXE);
  if (fs.existsSync(vendorBin)) return vendorBin;
  try {
    const checkCmd = os.platform() === 'win32' ? 'where.exe aria2c.exe' : 'which aria2c';
    const out = execSync(checkCmd, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    const first = out.trim().split(/\r?\n/)[0];
    if (first && first.trim()) return first.trim();
  } catch (_) {}
  return vendorBin;
}

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'nyx-dlp', 'Accept': 'application/vnd.github.v3+json' }, timeout: 15000 }, (res) => {
      if (res.statusCode !== 200) return reject(new Error(`HTTP ${res.statusCode}`));
      let raw = '';
      res.on('data', (c) => raw += c);
      res.on('end', () => { try { resolve(JSON.parse(raw)); } catch (e) { reject(e); } });
    }).on('error', reject).on('timeout', function () { this.destroy(new Error('timed out')); });
  });
}

// Windows: aria2 only publishes official binaries for Windows (as .zip with a
// versioned top-level folder). Other platforms use the system package.
async function installWindowsRelease(tag, sendLog) {
  const url = tag && tag !== 'latest'
    ? `https://api.github.com/repos/aria2/aria2/releases/tags/${tag.startsWith('release-') ? tag : 'release-' + tag.replace(/^v/, '')}`
    : 'https://api.github.com/repos/aria2/aria2/releases/latest';
  const release = await fetchJson(url);
  const asset = (release.assets || []).find(a => /win-64bit.*\.zip$/i.test(a.name));
  if (!asset) throw new Error('No 64-bit Windows build found in that aria2 release.');

  fs.mkdirSync(VENDOR_DIR, { recursive: true });
  const zipPath = path.join(VENDOR_DIR, asset.name);
  const extractDir = path.join(VENDOR_DIR, '_extract');
  sendLog(`[setup] Downloading aria2c (${asset.name})...`);
  await downloadFileWithProgress(asset.browser_download_url, zipPath, sendLog);
  try {
    fs.rmSync(extractDir, { recursive: true, force: true });
    fs.mkdirSync(extractDir, { recursive: true });
    // Windows' own bsdtar (reads .zip); a Git-for-Windows tar earlier on PATH can't.
    const sysTar = path.join(process.env.SystemRoot || 'C:\Windows', 'System32', 'tar.exe');
    execSync(`"${fs.existsSync(sysTar) ? sysTar : 'tar'}" -xf "${zipPath}" -C "${extractDir}"`, { stdio: 'ignore' });
    const inner = fs.readdirSync(extractDir).map(d => path.join(extractDir, d, EXE)).find(p => fs.existsSync(p))
      || (fs.existsSync(path.join(extractDir, EXE)) ? path.join(extractDir, EXE) : null);
    if (!inner) throw new Error('aria2c.exe not found in the downloaded archive.');
    fs.copyFileSync(inner, path.join(VENDOR_DIR, EXE));
  } finally {
    fs.rmSync(extractDir, { recursive: true, force: true });
    fs.rmSync(zipPath, { force: true });
  }
  return path.join(VENDOR_DIR, EXE);
}

// Returns the aria2c path, or null if it isn't available (callers fall back to
// the plain `ia download`). Never throws for "not available".
async function ensureAria2c(allowDownload = true, sendLog = console.log) {
  const existing = getAria2Path();
  if (fs.existsSync(existing) || existing === 'aria2c') return existing;

  if (!allowDownload) {
    sendLog('[setup] aria2c not found and auto-download is disabled — using the standard IA downloader.');
    return null;
  }
  if (os.platform() !== 'win32') {
    sendLog('[setup] aria2c not found. Install it with your package manager (e.g. "brew install aria2" / "apt install aria2") — using the standard IA downloader for now.');
    return null;
  }
  try {
    const bin = await installWindowsRelease('latest', sendLog);
    sendLog(`[setup] ✔ aria2c ready: ${bin}`);
    return bin;
  } catch (e) {
    sendLog(`[setup] Failed to install aria2c (${e.message}) — using the standard IA downloader.`);
    return null;
  }
}

function getAria2Version(bin) {
  return new Promise((resolve) => {
    execFile(bin, ['--version'], { timeout: 4000 }, (err, stdout) => {
      const m = !err && /aria2 version (\S+)/i.exec(stdout || '');
      resolve(m ? m[1] : null);
    });
  });
}

module.exports = { getAria2Path, ensureAria2c, installWindowsRelease, getAria2Version, VENDOR_DIR };
