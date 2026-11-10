const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const os = require('os');
const { execSync, spawn } = require('child_process');

const { getVendorDir } = require('./vendor-dir');
const { downloadFileWithProgress } = require('./download-helper');
const { getDenoPath, ensureDeno } = require('./ensure-deno');

const DEFAULT_PORT = 4416;
const REPO = 'Brainicism/bgutil-ytdlp-pot-provider';

let serverProc = null;
let serverPort = DEFAULT_PORT;
let serverStarting = null; // in-flight start promise, so concurrent callers share one attempt
let lastStatus = { state: 'stopped', detail: '' }; // stopped | installing | starting | running | error

function getServerDir() {
  return path.join(getVendorDir('bgutil-server'), 'server');
}

function getStatus() {
  return { ...lastStatus, port: serverPort, url: `http://127.0.0.1:${serverPort}` };
}

let statusListener = null;
function onStatusChange(fn) { statusListener = fn; }

function setStatus(state, detail = '') {
  lastStatus = { state, detail };
  if (statusListener) { try { statusListener(getStatus()); } catch (_) {} }
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

function isSourceInstalled() {
  return fs.existsSync(path.join(getServerDir(), 'src', 'main.ts'));
}

function areDepsInstalled() {
  return fs.existsSync(path.join(getServerDir(), 'node_modules'));
}

function getInstalledVersion() {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(getServerDir(), 'package.json'), 'utf8'));
    return pkg.version || null;
  } catch (_) {
    return null;
  }
}

async function getLatestTag() {
  const tags = await fetchJson(`https://api.github.com/repos/${REPO}/tags`);
  const tag = tags[0]?.name;
  if (!tag) throw new Error('Could not resolve latest bgutil-ytdlp-pot-provider tag');
  return tag;
}

// Downloads the (small, pure source — no build artifacts) server/ subfolder of the
// bgutil-ytdlp-pot-provider repo, pinned to its latest tagged release so it stays in
// step with the yt-dlp plugin we install alongside it (see ensure-bgutil-plugin.js).
// `force` re-downloads even if already installed (used by the Tool Hub's Update button).
async function ensureServerSource(sendLog, force = false) {
  if (isSourceInstalled() && !force) return;
  const serverDir = getServerDir();
  const rootDir = path.dirname(serverDir);
  fs.mkdirSync(rootDir, { recursive: true });

  sendLog('[bgutil] Downloading PO-token server source...');
  const tag = await getLatestTag();

  const tarPath = path.join(rootDir, 'src.tar.gz');
  await downloadFileWithProgress(`https://github.com/${REPO}/archive/refs/tags/${tag}.tar.gz`, tarPath, sendLog);

  sendLog('[bgutil] Extracting server source...');
  execSync(`tar -xf "${tarPath}" -C "${rootDir}"`, { stdio: 'ignore' });
  fs.unlinkSync(tarPath);

  const extractedDir = fs.readdirSync(rootDir).find(n => n.startsWith('bgutil-ytdlp-pot-provider-'));
  if (!extractedDir) throw new Error('Extraction did not produce the expected folder');
  if (fs.existsSync(serverDir)) fs.rmSync(serverDir, { recursive: true, force: true });
  fs.renameSync(path.join(rootDir, extractedDir, 'server'), serverDir);
  fs.rmSync(path.join(rootDir, extractedDir), { recursive: true, force: true });

  if (!isSourceInstalled()) throw new Error('Server source is missing src/main.ts after extraction');
  sendLog(`[bgutil] ✔ Server source ${tag} ready`);
}

// `deno install` resolves + caches this project's npm dependencies (including the
// native `canvas` package) into Deno's own npm-compat cache. No system Node/npm or
// Docker needed — this is a one-time step; Deno's cache is reused on every later run.
function ensureServerDeps(sendLog, denoPath, force = false) {
  return new Promise((resolve, reject) => {
    if (areDepsInstalled() && !force) return resolve();
    sendLog('[bgutil] Installing PO-token server dependencies (one-time, ~100MB)...');
    const child = spawn(denoPath, ['install'], { cwd: getServerDir(), stdio: ['ignore', 'pipe', 'pipe'] });
    let lastLog = 0;
    const onData = (d) => {
      const now = Date.now();
      if (now - lastLog > 1500) { lastLog = now; sendLog('[bgutil] ' + d.toString().trim().split(/\r?\n/).pop()); }
    };
    child.stdout.on('data', onData);
    child.stderr.on('data', onData);
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0 && areDepsInstalled()) { sendLog('[bgutil] ✔ Server dependencies ready'); resolve(); }
      else reject(new Error(`deno install exited with code ${code}`));
    });
  });
}

// True if something already answers the bgutil /ping on this port (e.g. a Docker container).
function pingServer(port) {
  return new Promise((resolve) => {
    const req = http.get({ host: '127.0.0.1', port, path: '/ping', timeout: 2000 }, (res) => { res.resume(); resolve(res.statusCode === 200); });
    req.on('timeout', () => { req.destroy(); resolve(false); });
    req.on('error', () => resolve(false));
  });
}

// Same check for a full base URL (bundled or user-supplied server).
function pingUrl(baseUrl) {
  return new Promise((resolve) => {
    let req;
    try { req = http.get(String(baseUrl).replace(/\/+$/, '') + '/ping', { timeout: 2000 }, (res) => { res.resume(); resolve(res.statusCode === 200); }); }
    catch (_) { return resolve(false); }
    req.on('timeout', () => { req.destroy(); resolve(false); });
    req.on('error', () => resolve(false));
  });
}

function isRunning() {
  return !!(serverProc && !serverProc.killed);
}

// Starts the PO-token HTTP server in the background and keeps it running for the
// life of the app (see main.js), so every yt-dlp download can just point at it with
// zero per-download setup. `port` lets the user rebind it (e.g. if 4416 is taken).
async function startBgutilServer(sendLog = console.log, port = DEFAULT_PORT) {
  port = parseInt(port, 10) || DEFAULT_PORT;
  if (isRunning() && serverPort === port) return getStatus();
  if (isRunning() && serverPort !== port) stopBgutilServer();
  if (serverStarting) return serverStarting;

  serverStarting = (async () => {
    try {
      serverPort = port;
      setStatus('installing');
      const denoPath = await ensureDeno(sendLog);
      await ensureServerSource(sendLog);
      await ensureServerDeps(sendLog, denoPath);

      setStatus('starting');
      sendLog(`[bgutil] Starting PO-token server on port ${port}...`);
      const child = spawn(denoPath, ['run', '--allow-all', 'src/main.ts', '--port', String(port)], {
        cwd: getServerDir(),
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true
      });
      serverProc = child;

      let outTail = '';
      let exitCode = null;
      const ready = await new Promise((resolve) => {
        let settled = false;
        const finish = (ok) => { if (!settled) { settled = true; resolve(ok); } };
        const onData = (d) => {
          const text = d.toString();
          outTail = (outTail + text).slice(-2000);
          if (/started pot server/i.test(text)) finish(true);
        };
        child.stdout.on('data', onData);
        child.stderr.on('data', onData);
        child.on('exit', (code) => { exitCode = code === null ? -1 : code; finish(false); });
        setTimeout(() => finish(isRunning()), 15000);
      });

      if (!ready) {
        if (exitCode !== null) serverProc = null; // it already died; don't report it as running
        const inUse = /EADDRINUSE|address already in use|AddrInUse/i.test(outTail);
        if (inUse && await pingServer(port)) {
          // Something else (often a Docker container) is already serving bgutil on this port: just use it.
          setStatus('running', `Using the bgutil server already running on port ${port}`);
          sendLog(`[bgutil] ✔ A bgutil server is already running on port ${port}; using it.`);
          return getStatus();
        }
        const lastLine = outTail.trim().split(/\r?\n/).filter(Boolean).pop() || '';
        const reason = inUse
          ? `Port ${port} is already in use by another program. Change the bundled server's port in Settings.`
          : (exitCode !== null ? `Server exited right away (code ${exitCode})${lastLine ? ': ' + lastLine : ''}` : 'Server did not report ready in time');
        sendLog(`[bgutil] ${reason}`);
        if (outTail.trim()) sendLog('[bgutil] Server output:\n' + outTail.trim());
        setStatus('error', reason);
        return getStatus();
      }
      setStatus('running');
      sendLog(`[bgutil] ✔ PO-token server ready at http://127.0.0.1:${port}`);
      child.on('exit', (code) => {
        if (serverProc === child) serverProc = null;
        if (lastStatus.state !== 'stopped') setStatus('error', `Server exited unexpectedly (code ${code})`);
      });
      return getStatus();
    } catch (e) {
      setStatus('error', e.message);
      sendLog(`[bgutil] Failed to start PO-token server: ${e.message}`);
      return getStatus();
    } finally {
      serverStarting = null;
    }
  })();

  return serverStarting;
}

// Called at launch, before the delayed start, so a run begun in that gap waits instead of
// seeing "stopped".
function expectStart() {
  if (lastStatus.state === 'stopped') setStatus('starting', 'Waiting to start');
}

function stopBgutilServer() {
  setStatus('stopped');
  if (serverProc) {
    try { serverProc.kill(); } catch (_) {}
    serverProc = null;
  }
}

module.exports = {
  DEFAULT_PORT,
  getServerDir,
  getStatus,
  getInstalledVersion,
  getLatestTag,
  onStatusChange,
  isRunning,
  isSourceInstalled,
  areDepsInstalled,
  ensureServerSource,
  ensureServerDeps,
  startBgutilServer,
  expectStart,
  pingUrl,
  stopBgutilServer
};
