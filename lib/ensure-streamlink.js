const fs = require('fs');
const os = require('os');
const path = require('path');
const { execSync, execFile } = require('child_process');
const { getVendorDir } = require('./vendor-dir');

const isWin = () => os.platform() === 'win32';

// Streamlink is a pip package. On Debian/Ubuntu the system Python is "externally managed" and
// refuses pip installs, so we fall back to a private venv under the vendor folder.
function getVenvDir() { return path.join(getVendorDir('streamlink'), 'venv'); }
function getVenvBin(name) { return path.join(getVenvDir(), isWin() ? 'Scripts' : 'bin', isWin() ? `${name}.exe` : name); }
function getVenvStreamlink() { const p = getVenvBin('streamlink'); return fs.existsSync(p) ? p : null; }

// Path to run: our venv copy if there is one, otherwise whatever is on PATH.
function getStreamlinkPath() { return getVenvStreamlink() || 'streamlink'; }

function run(cmd, args) {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { timeout: 180000, killSignal: 'SIGKILL', maxBuffer: 10 * 1024 * 1024 }, (error, stdout, stderr) => {
      if (error) { error.output = `${stderr || ''}\n${stdout || ''}`; reject(error); } else resolve(stdout);
    });
  });
}

// Installs or upgrades Streamlink. `deps.run` / `deps.venvExists` exist so the decision logic is testable.
async function installStreamlink(version = 'latest', sendLog = console.log, deps = {}) {
  const exec = deps.run || run;
  const venvExists = deps.venvExists || (() => !!getVenvStreamlink());
  const py = isWin() ? 'python' : 'python3';
  const spec = version === 'latest' ? 'streamlink' : `streamlink==${version}`;
  const pipArgs = () => ['-m', 'pip', 'install', '--upgrade', spec];

  try {
    if (venvExists()) {
      await exec(getVenvBin('python'), pipArgs());
      return;
    }
    await exec(py, pipArgs());
  } catch (err) {
    const out = (err.output || '') + (err.message || '');
    if (/No matching distribution found|Could not find a version/i.test(out)) {
      throw new Error(`Version "${version}" is not real or available for Streamlink on PyPI.`);
    }
    if (!/externally-managed-environment/i.test(out) || venvExists()) {
      throw new Error((err.output || err.message || '').trim().split('\n')[0] || 'pip install failed');
    }
    sendLog('[setup] This system blocks system-wide pip installs; installing Streamlink into its own virtual environment instead...');
    try {
      fs.mkdirSync(path.dirname(getVenvDir()), { recursive: true });
      await exec(py, ['-m', 'venv', getVenvDir()]);
    } catch (venvErr) {
      throw new Error('Could not create a Python virtual environment. On Debian/Ubuntu run: sudo apt install python3-venv (or install streamlink with apt).');
    }
    await exec(getVenvBin('python'), pipArgs());
  }
}

async function ensureStreamlink(allowDownload = true, sendLog = console.log) {
  if (typeof allowDownload === 'function') {
    sendLog = allowDownload;
    allowDownload = true;
  }

  const venvBin = getVenvStreamlink();
  if (venvBin) return venvBin;

  // Check system path
  try {
    const checkCmd = isWin() ? 'where streamlink' : 'which streamlink';
    const out = execSync(checkCmd, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    if (out.trim()) {
      return 'streamlink';
    }
  } catch (e) {}

  if (!allowDownload) {
    sendLog(`[error] Streamlink is not found and auto-download is disabled. Please enable it in Settings or install it manually.`);
    throw new Error('Streamlink is required but not found.');
  }

  // Try installing via pip if python is available
  sendLog(`[setup] Streamlink not found. Attempting to install via pip...`);
  try {
    await installStreamlink('latest', sendLog);
    sendLog(`[setup] Streamlink successfully installed.`);
    return getStreamlinkPath();
  } catch (e) {
    sendLog(`[error] Failed to install Streamlink: ${e.message}`);
    throw new Error('Streamlink installation failed.');
  }
}

module.exports = { ensureStreamlink, installStreamlink, getStreamlinkPath, getVenvStreamlink };
