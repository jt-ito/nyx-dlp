const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync, execFile } = require('child_process');

const { getVendorDir } = require('./vendor-dir');
const { downloadFileWithProgress } = require('./download-helper');
const VENDOR_DIR = getVendorDir('deno');

function execFileAsync(cmd, args) {
  return new Promise((resolve) => {
    execFile(cmd, args, { timeout: 4000 }, (err, stdout) => resolve(err ? null : stdout));
  });
}

function getDenoPath() {
  const exe = os.platform() === 'win32' ? 'deno.exe' : 'deno';
  const vendorBin = path.join(VENDOR_DIR, exe);
  if (fs.existsSync(vendorBin)) return vendorBin;
  try {
    const checkCmd = os.platform() === 'win32' ? 'where deno' : 'which deno';
    const out = execSync(checkCmd, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    const lines = out.trim().split(/\r?\n/);
    if (lines.length > 0 && lines[0].trim()) return lines[0].trim();
  } catch (e) {}
  return vendorBin;
}

async function ensureDeno(sendLog = console.log) {
  const exe = os.platform() === 'win32' ? 'deno.exe' : 'deno';
  const vendorBin = path.join(VENDOR_DIR, exe);
  if (fs.existsSync(vendorBin)) return vendorBin;

  try {
    const checkCmd = os.platform() === 'win32' ? 'where deno' : 'which deno';
    const out = execSync(checkCmd, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    const lines = out.trim().split(/\r?\n/);
    if (lines.length > 0 && lines[0].trim()) {
      const sysPath = lines[0].trim();
      if (await execFileAsync(sysPath, ['--version'])) {
        sendLog(`[setup] Using system Deno (${sysPath})`);
        return sysPath;
      }
    }
  } catch (_) {}

  const isWin = os.platform() === 'win32';
  const isMac = os.platform() === 'darwin';
  let archiveName;
  if (isWin) archiveName = 'deno-x86_64-pc-windows-msvc.zip';
  else if (isMac) archiveName = os.arch() === 'arm64' ? 'deno-aarch64-apple-darwin.zip' : 'deno-x86_64-apple-darwin.zip';
  else archiveName = os.arch() === 'arm64' ? 'deno-aarch64-unknown-linux-gnu.zip' : 'deno-x86_64-unknown-linux-gnu.zip';

  fs.mkdirSync(VENDOR_DIR, { recursive: true });
  const zipPath = path.join(VENDOR_DIR, archiveName);
  sendLog('[setup] Deno not found. Downloading latest release...');
  try {
    await downloadFileWithProgress(`https://github.com/denoland/deno/releases/latest/download/${archiveName}`, zipPath, sendLog);
    sendLog('[setup] Extracting Deno...');
    if (isWin) {
      execSync(`tar -xf "${zipPath}" -C "${VENDOR_DIR}"`, { stdio: 'ignore' });
    } else {
      execSync(`unzip -o "${zipPath}" -d "${VENDOR_DIR}"`, { stdio: 'ignore' });
      fs.chmodSync(vendorBin, 0o755);
    }
    fs.unlinkSync(zipPath);
    sendLog(`[setup] ✔ Deno ready: ${vendorBin}`);
    return vendorBin;
  } catch (e) {
    sendLog(`[setup] Failed to download Deno: ${e.message}`);
    throw e;
  }
}

module.exports = {
  getDenoPath,
  ensureDeno
};
