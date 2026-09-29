const fs = require('fs');
const path = require('path');
const https = require('https');
const os = require('os');
const { execSync } = require('child_process');

const { getVendorDir } = require('./vendor-dir');
const { downloadFileWithProgress } = require('./download-helper');

// yt-dlp only speaks the bgutil PO-token protocol (http or script mode) once this
// yt-dlp *plugin* (a handful of pure-Python files, not the bgutil server itself) is
// present. yt-dlp looks for plugins in a "yt-dlp-plugins" folder next to its own
// executable — see https://github.com/yt-dlp/yt-dlp#installing-plugins ("Executable
// location"). Without this, every bgutil extractor-arg (the HTTP server URL, the
// local-deno script mode) is silently ignored and downloads with cookies fall back
// to whatever legacy format doesn't require a PO Token (usually 360p).
function getPluginDir() {
  return path.join(getVendorDir('ytdlp'), 'yt-dlp-plugins', 'bgutil-ytdlp-pot-provider');
}

function isInstalled() {
  return fs.existsSync(path.join(getPluginDir(), 'yt_dlp_plugins', 'extractor', 'getpot_bgutil_http.py'));
}

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'nyx-dlp' } }, (res) => {
      if (res.statusCode !== 200) { res.resume(); return reject(new Error(`HTTP ${res.statusCode}`)); }
      let data = '';
      res.on('data', (c) => data += c);
      res.on('end', () => { try { resolve(JSON.parse(data)); } catch (e) { reject(e); } });
    }).on('error', reject);
  });
}

async function ensureBgutilPlugin(sendLog = console.log) {
  if (isInstalled()) return true;

  const pluginDir = getPluginDir();
  try {
    sendLog('[setup] bgutil PO-token yt-dlp plugin not found. Downloading...');
    fs.mkdirSync(pluginDir, { recursive: true });

    const pkg = await fetchJson('https://pypi.org/pypi/bgutil-ytdlp-pot-provider/json');
    const wheel = (pkg.urls || []).find(u => u.packagetype === 'bdist_wheel');
    if (!wheel) throw new Error('No wheel release found on PyPI');

    const whlPath = path.join(pluginDir, wheel.filename);
    await downloadFileWithProgress(wheel.url, whlPath, sendLog);

    // A .whl is a plain zip; extract just the yt_dlp_plugins/ folder it contains.
    if (os.platform() === 'win32') {
      execSync(`tar -xf "${whlPath}" -C "${pluginDir}"`, { stdio: 'ignore' });
    } else {
      execSync(`unzip -o "${whlPath}" -d "${pluginDir}"`, { stdio: 'ignore' });
    }
    fs.unlinkSync(whlPath);
    for (const entry of fs.readdirSync(pluginDir)) {
      if (entry.endsWith('.dist-info')) fs.rmSync(path.join(pluginDir, entry), { recursive: true, force: true });
    }

    if (!isInstalled()) throw new Error('Extraction did not produce the expected plugin files');
    sendLog(`[setup] ✔ bgutil PO-token plugin ready (v${pkg.info.version})`);
    return true;
  } catch (e) {
    sendLog(`[setup] Failed to install bgutil PO-token plugin: ${e.message} (PO-token requests will be ignored)`);
    return false;
  }
}

module.exports = {
  getPluginDir,
  ensureBgutilPlugin
};
