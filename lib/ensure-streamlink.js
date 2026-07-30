const os = require('os');
const { execSync } = require('child_process');

async function ensureStreamlink(allowDownload = true, sendLog = console.log) {
  if (typeof allowDownload === 'function') {
    sendLog = allowDownload;
    allowDownload = true;
  }

  // Check system path first
  try {
    const checkCmd = os.platform() === 'win32' ? 'where streamlink' : 'which streamlink';
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
    const py = os.platform() === 'win32' ? 'python' : 'python3';
    execSync(`${py} -m pip install --upgrade streamlink`, { stdio: 'ignore' });
    sendLog(`[setup] Streamlink successfully installed via pip.`);
    return 'streamlink'; // should be in path now
  } catch (e) {
    sendLog(`[error] Failed to install via pip. You may need to install Python or Streamlink manually.`);
    throw new Error('Streamlink installation failed.');
  }
}

module.exports = { ensureStreamlink };
