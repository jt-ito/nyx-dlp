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
      const { exec } = require('child_process');
      await new Promise((resolve, reject) => {
        exec('pip install yp-dl', { encoding: 'utf8', timeout: 60000, killSignal: 'SIGKILL' }, (error, stdout) => {
          if (error) reject(error);
          else resolve(stdout);
        });
      });
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
