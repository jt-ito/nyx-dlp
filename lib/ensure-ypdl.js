const { execSync } = require('child_process');
const os = require('os');

function getYpdlPath() {
  return os.platform() === 'win32' ? 'yp-dl.exe' : 'yp-dl';
}

async function ensureYpdl(autoInstall, sendLog = console.log) {
  try {
    const checkCmd = os.platform() === 'win32' ? 'where yp-dl' : 'which yp-dl';
    execSync(checkCmd, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  } catch (e) {
    if (!autoInstall) {
      const msg = `[setup] YoutubeCommunityScraper (yp-dl) is not installed. Please enable auto-install in settings or install it manually to download community posts.`;
      sendLog(msg);
      throw new Error(msg);
    }
    sendLog(`[setup] yp-dl not found. Installing via pip...`);
    try {
      execSync('pip install yp-dl', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
      sendLog(`[setup] yp-dl successfully installed via pip.`);
    } catch (err) {
      sendLog(`[setup] Failed to install yp-dl via pip. Please ensure Python and pip are installed.`);
      throw err;
    }
  }
}

module.exports = {
  getYpdlPath,
  ensureYpdl
};
