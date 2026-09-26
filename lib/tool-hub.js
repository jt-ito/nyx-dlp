const fs = require('fs');
const path = require('path');
const os = require('os');
const https = require('https');
const { exec, execFile } = require('child_process');
const { shell } = require('electron');

const { getVendorDir, getVendorBaseDir } = require('./vendor-dir');
const { getYtdlpPath, ensureYtdlp } = require('./ensure-ytdlp');
const { getFfmpegPath, getFfprobePath, ensureFfmpeg } = require('./ensure-ffmpeg');
const { getGallerydlPath, ensureGallerydl } = require('./ensure-gallerydl');
const { getIaPath, ensureIa } = require('./ensure-ia');
const { ensureStreamlink } = require('./ensure-streamlink');
const { downloadFileWithProgress } = require('./download-helper');

function execAsync(cmd, options = {}) {
  return new Promise((resolve) => {
    exec(cmd, { timeout: 6000, ...options }, (error, stdout) => {
      resolve(stdout ? stdout.trim() : null);
    });
  });
}

function execFileAsync(file, args = [], options = {}) {
  return new Promise((resolve) => {
    execFile(file, args, { timeout: 6000, ...options }, (error, stdout) => {
      resolve(stdout ? stdout.trim() : null);
    });
  });
}

// GitHub & Codeberg request helper with User-Agent and JSON parsing
function fetchJson(url) {
  return new Promise((resolve, reject) => {
    const opts = {
      headers: {
        'User-Agent': 'nyx-dlp/4.0.8 (https://github.com/jt-ito/nyx-dlp)',
        'Accept': 'application/vnd.github.v3+json, application/json'
      },
      timeout: 15000
    };
    https.get(url, opts, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return fetchJson(res.headers.location).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) {
        return reject(new Error(`HTTP ${res.statusCode}: ${res.statusMessage}`));
      }
      let raw = '';
      res.on('data', chunk => raw += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(raw));
        } catch (e) {
          reject(new Error(`Failed to parse JSON response: ${e.message}`));
        }
      });
    }).on('error', reject).on('timeout', () => reject(new Error('Request timed out')));
  });
}

function formatBytes(bytes) {
  if (!bytes || isNaN(bytes) || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return (bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 2) + ' ' + units[i];
}

function getFileSize(filePath) {
  try {
    if (filePath && fs.existsSync(filePath)) {
      const stat = fs.statSync(filePath);
      return {
        sizeBytes: stat.size,
        sizeFormatted: formatBytes(stat.size),
        mtime: stat.mtime
      };
    }
  } catch (_) {}
  return { sizeBytes: 0, sizeFormatted: 'Unknown', mtime: null };
}

async function getNvidiaGpuInfo() {
  try {
    const out = await execAsync('nvidia-smi --query-gpu=name,driver_version --format=csv,noheader,nounits');
    if (out) {
      const lines = out.split('\n');
      if (lines.length > 0) {
        const parts = lines[0].split(',');
        const name = parts[0] ? parts[0].trim() : '';
        const driver = parts[1] ? parseFloat(parts[1].trim()) : null;
        return { name, driver };
      }
    }
  } catch (_) {}
  return null;
}

// ── 1. Tool Metadata & Detection ──────────────────────────────────────

async function getToolInfo(toolKey) {
  const vendorBase = getVendorBaseDir();
  const isWin = os.platform() === 'win32';
  const isMac = os.platform() === 'darwin';

  switch (toolKey) {
    case 'ytdlp': {
      const exeName = isWin ? 'yt-dlp.exe' : 'yt-dlp';
      const vendorPath = path.join(getVendorDir('ytdlp'), exeName);
      const isVendored = fs.existsSync(vendorPath);
      const resolvedPath = getYtdlpPath();
      let version = null;
      let installed = false;

      if (fs.existsSync(resolvedPath)) {
        const out = await execFileAsync(resolvedPath, ['--version']);
        if (out) {
          version = out.split(/\r?\n/)[0];
          installed = true;
        }
      } else if (resolvedPath === 'yt-dlp') {
        const out = await execAsync('yt-dlp --version');
        if (out) {
          version = out.split(/\r?\n/)[0];
          installed = true;
        }
      }

      const fileStats = isVendored ? getFileSize(vendorPath) : (fs.existsSync(resolvedPath) ? getFileSize(resolvedPath) : null);

      return {
        key: 'ytdlp',
        name: 'yt-dlp',
        description: 'Command-line audio/video downloader from thousands of sites',
        installed,
        version: version || 'Not Detected',
        path: isVendored ? vendorPath : resolvedPath,
        isVendored,
        size: fileStats ? fileStats.sizeFormatted : 'N/A',
        mtime: fileStats && fileStats.mtime ? fileStats.mtime.toLocaleDateString() : 'N/A',
        releasesUrl: 'https://github.com/yt-dlp/yt-dlp/releases',
        hasChannels: true,
        presets: [
          { label: 'Latest Stable (Recommended)', value: 'latest' },
          { label: 'Nightly / Master Build', value: 'nightly' }
        ]
      };
    }

    case 'ffmpeg': {
      const exeName = isWin ? 'ffmpeg.exe' : 'ffmpeg';
      const probeName = isWin ? 'ffprobe.exe' : 'ffprobe';
      const vendorPath = path.join(getVendorDir('ffmpeg'), exeName);
      const probePath = path.join(getVendorDir('ffmpeg'), probeName);
      const isVendored = fs.existsSync(vendorPath);
      const resolvedPath = getFfmpegPath();
      let version = null;
      let installed = false;

      if (fs.existsSync(resolvedPath)) {
        const out = await execFileAsync(resolvedPath, ['-version']);
        if (out) {
          const firstLine = out.split(/\r?\n/)[0] || '';
          const match = firstLine.match(/ffmpeg\s+version\s+([^\s]+)/i);
          version = match ? match[1] : firstLine.replace('ffmpeg version', '').trim().split(' ')[0];
          installed = true;
        }
      } else if (resolvedPath === 'ffmpeg') {
        const out = await execAsync('ffmpeg -version');
        if (out) {
          const firstLine = out.split(/\r?\n/)[0] || '';
          const match = firstLine.match(/ffmpeg\s+version\s+([^\s]+)/i);
          version = match ? match[1] : firstLine.replace('ffmpeg version', '').trim().split(' ')[0];
          installed = true;
        }
      }

      const gpuInfo = await getNvidiaGpuInfo();
      let recommendedPreset = 'latest';
      let driverNote = 'No NVIDIA GPU driver detected (using latest FFmpeg build).';
      if (gpuInfo) {
        const { name, driver } = gpuInfo;
        const isLegacyArch = /GTX\s*(10\d0|9\d0|7\d0|6\d0|16\d0|TITAN\s*X)/i.test(name) || /GeForce\s*(GTX\s*10|GTX\s*9|GTX\s*7|GTX\s*6)/i.test(name);

        if (isLegacyArch || (driver && driver < 522.25 && driver >= 471.41)) {
          recommendedPreset = '5.1';
          driverNote = `${name || 'NVIDIA GPU'} (Pascal/Maxwell/Kepler architecture — FFmpeg 5.1.2 recommended for stable NVENC)`;
        } else if (driver && driver < 471.41) {
          recommendedPreset = '4.4';
          driverNote = `${name || 'Legacy NVIDIA GPU'} (FFmpeg 4.4.1 recommended)`;
        } else {
          recommendedPreset = 'latest';
          driverNote = `${name || 'NVIDIA GPU'} (Driver ${driver || ''} — latest master build recommended)`;
        }
      }

      const fileStats = isVendored ? getFileSize(vendorPath) : (fs.existsSync(resolvedPath) ? getFileSize(resolvedPath) : null);

      return {
        key: 'ffmpeg',
        name: 'FFmpeg & FFprobe',
        description: 'Complete cross-platform solution to record, convert, mux, and stream audio and video',
        installed,
        version: version || 'Not Detected',
        path: isVendored ? vendorPath : resolvedPath,
        probePath: fs.existsSync(probePath) ? probePath : (isVendored ? 'Missing ffprobe' : 'System PATH'),
        isVendored,
        size: fileStats ? fileStats.sizeFormatted : 'N/A',
        mtime: fileStats && fileStats.mtime ? fileStats.mtime.toLocaleDateString() : 'N/A',
        recommendedPreset,
        driverNote,
        presets: [
          { label: 'Latest (Master / Git GPL Build)', value: 'latest' },
          { label: '5.1.2 (Pascal / Maxwell / Kepler GPU Stable)', value: '5.1' },
          { label: '4.4.1 (Older GPU Fallback Build)', value: '4.4' }
        ]
      };
    }

    case 'gallerydl': {
      const exeName = isWin ? 'gallery-dl.exe' : 'gallery-dl';
      const vendorPath = path.join(getVendorDir('gallery-dl'), exeName);
      const isVendored = fs.existsSync(vendorPath);
      const resolvedPath = getGallerydlPath();
      let version = null;
      let installed = false;

      if (fs.existsSync(resolvedPath)) {
        const out = await execFileAsync(resolvedPath, ['--version']);
        if (out) {
          version = out.split(/\r?\n/)[0];
          installed = true;
        }
      } else if (resolvedPath === 'gallery-dl') {
        const out = await execAsync('gallery-dl --version');
        if (out) {
          version = out.split(/\r?\n/)[0];
          installed = true;
        }
      }

      const fileStats = isVendored ? getFileSize(vendorPath) : (fs.existsSync(resolvedPath) ? getFileSize(resolvedPath) : null);

      return {
        key: 'gallerydl',
        name: 'gallery-dl',
        description: 'Image and gallery scraper for image-hosting sites and social media',
        installed,
        version: version || 'Not Detected',
        path: isVendored ? vendorPath : resolvedPath,
        isVendored,
        size: fileStats ? fileStats.sizeFormatted : 'N/A',
        mtime: fileStats && fileStats.mtime ? fileStats.mtime.toLocaleDateString() : 'N/A',
        releasesUrl: 'https://github.com/mikf/gallery-dl/releases',
        presets: [
          { label: 'Latest Stable Release', value: 'latest' }
        ]
      };
    }

    case 'streamlink': {
      let resolvedPath = null;
      let version = null;
      let installed = false;

      const checkCmd = isWin ? 'where streamlink' : 'which streamlink';
      const whereOut = await execAsync(checkCmd, { timeout: 4000 });
      if (whereOut) {
        const lines = whereOut.split(/\r?\n/);
        if (lines.length > 0 && lines[0]) {
          resolvedPath = lines[0].trim();
        }
      }

      if (resolvedPath) {
        const out = await execFileAsync(resolvedPath, ['--version']);
        if (out) {
          const match = out.match(/streamlink\s+([^\s]+)/i);
          version = match ? match[1] : out.split(/\r?\n/)[0];
          installed = true;
        }
      }

      const fileStats = resolvedPath && fs.existsSync(resolvedPath) ? getFileSize(resolvedPath) : null;

      return {
        key: 'streamlink',
        name: 'Streamlink',
        description: 'CLI utility that pipes video streams from various services into a video player or file',
        installed,
        version: version || 'Not Detected',
        path: resolvedPath || 'Not installed',
        isVendored: false,
        size: fileStats ? fileStats.sizeFormatted : 'N/A',
        mtime: fileStats && fileStats.mtime ? fileStats.mtime.toLocaleDateString() : 'N/A',
        presets: [
          { label: 'Latest Stable (Pip / Official)', value: 'latest' }
        ]
      };
    }

    case 'ia': {
      const exeName = isWin ? 'ia.exe' : 'ia';
      const vendorPath = path.join(getVendorDir('ia'), exeName);
      const isVendored = fs.existsSync(vendorPath);
      const resolvedPath = getIaPath();
      let version = null;
      let installed = false;

      if (fs.existsSync(resolvedPath)) {
        const out = await execFileAsync(resolvedPath, ['--version']);
        if (out) {
          version = out.split(/\r?\n/)[0];
          installed = true;
        }
      } else if (resolvedPath === 'ia') {
        const out = await execAsync('ia --version');
        if (out) {
          version = out.split(/\r?\n/)[0];
          installed = true;
        }
      }

      const fileStats = isVendored ? getFileSize(vendorPath) : (fs.existsSync(resolvedPath) ? getFileSize(resolvedPath) : null);

      return {
        key: 'ia',
        name: 'Internet Archive CLI (ia)',
        description: 'Official command-line tool for uploading, metadata editing, and downloading from archive.org',
        installed,
        version: version || 'Not Detected',
        path: isVendored ? vendorPath : (resolvedPath || 'Not installed'),
        isVendored,
        size: fileStats ? fileStats.sizeFormatted : 'N/A',
        mtime: fileStats && fileStats.mtime ? fileStats.mtime.toLocaleDateString() : 'N/A',
        presets: [
          { label: 'Latest Stable', value: 'latest' }
        ]
      };
    }

    case 'deno': {
      let resolvedPath = null;
      let version = null;
      let installed = false;

      // Check vendor directory first
      const exeName = isWin ? 'deno.exe' : 'deno';
      const vendorPath = path.join(getVendorDir('deno'), exeName);
      const isVendored = fs.existsSync(vendorPath);

      if (isVendored) {
        resolvedPath = vendorPath;
      } else {
        const checkCmd = isWin ? 'where deno' : 'which deno';
        const whereOut = await execAsync(checkCmd, { timeout: 4000 });
        if (whereOut) {
          const lines = whereOut.split(/\r?\n/);
          if (lines.length > 0 && lines[0]) {
            resolvedPath = lines[0].trim();
          }
        }
      }

      if (resolvedPath) {
        const out = await execFileAsync(resolvedPath, ['--version']);
        if (out) {
          const firstLine = out.split(/\r?\n/)[0] || '';
          const match = firstLine.match(/deno\s+([^\s]+)/i);
          version = match ? match[1] : firstLine;
          installed = true;
        }
      }

      const fileStats = resolvedPath && fs.existsSync(resolvedPath) ? getFileSize(resolvedPath) : null;

      return {
        key: 'deno',
        name: 'Deno Runtime',
        description: 'Modern JavaScript/TypeScript engine powering bgutil PO-token provider and YouTube challenge solving',
        installed,
        version: version || 'Not Detected',
        path: resolvedPath || 'Not installed',
        isVendored,
        size: fileStats ? fileStats.sizeFormatted : 'N/A',
        mtime: fileStats && fileStats.mtime ? fileStats.mtime.toLocaleDateString() : 'N/A',
        presets: [
          { label: 'Latest Stable', value: 'latest' }
        ]
      };
    }

    default:
      throw new Error(`Unknown tool key: ${toolKey}`);
  }
}

async function getAllToolsInfo() {
  const tools = ['ytdlp', 'ffmpeg', 'gallerydl', 'streamlink', 'ia', 'deno'];
  const results = {};
  await Promise.all(tools.map(async (t) => {
    try {
      results[t] = await getToolInfo(t);
    } catch (e) {
      results[t] = { key: t, name: t, installed: false, error: e.message };
    }
  }));
  return results;
}

// ── 2. Check for Upstream Updates ──────────────────────────────────────

async function checkToolUpdates(toolKey) {
  const current = await getToolInfo(toolKey);
  const result = {
    key: toolKey,
    currentVersion: current.version,
    latestVersion: null,
    updateAvailable: false,
    releases: []
  };

  try {
    switch (toolKey) {
      case 'ytdlp': {
        const releases = await fetchJson('https://api.github.com/repos/yt-dlp/yt-dlp/releases?per_page=15');
        if (Array.isArray(releases) && releases.length > 0) {
          result.latestVersion = releases[0].tag_name;
          result.releases = releases.map(r => ({
            tag: r.tag_name,
            name: r.name || r.tag_name,
            publishedAt: r.published_at ? r.published_at.split('T')[0] : '',
            prerelease: r.prerelease
          }));
          if (current.installed && current.version !== 'Not Detected') {
            result.updateAvailable = current.version !== result.latestVersion;
          }
        }
        break;
      }

      case 'ffmpeg': {
        // Pre-defined static builds
        result.latestVersion = 'latest (git master)';
        result.releases = [
          { tag: 'latest', name: 'FFmpeg Latest (Git Master GPL Build)', publishedAt: 'Rolling' },
          { tag: '5.1', name: 'FFmpeg 5.1.2 (Kepler / Maxwell GPU Support)', publishedAt: 'Archive' },
          { tag: '4.4', name: 'FFmpeg 4.4.1 (Legacy GPU Fallback)', publishedAt: 'Archive' }
        ];
        if (current.installed && current.version) {
          result.updateAvailable = false; // FFmpeg is preset-switched based on user hardware
        }
        break;
      }

      case 'gallerydl': {
        const releases = await fetchJson('https://codeberg.org/api/v1/repos/mikf/gallery-dl/releases?limit=15');
        if (Array.isArray(releases) && releases.length > 0) {
          result.latestVersion = releases[0].tag_name.replace(/^v/, '');
          result.releases = releases.map(r => ({
            tag: r.tag_name,
            name: r.name || r.tag_name,
            publishedAt: r.published_at ? r.published_at.split('T')[0] : '',
            prerelease: r.prerelease
          }));
          if (current.installed && current.version !== 'Not Detected') {
            result.updateAvailable = current.version !== result.latestVersion;
          }
        }
        break;
      }

      case 'streamlink': {
        const releases = await fetchJson('https://api.github.com/repos/streamlink/streamlink/releases?per_page=10');
        if (Array.isArray(releases) && releases.length > 0) {
          result.latestVersion = releases[0].tag_name.replace(/^v/, '');
          result.releases = releases.map(r => ({
            tag: r.tag_name,
            name: r.name || r.tag_name,
            publishedAt: r.published_at ? r.published_at.split('T')[0] : '',
            prerelease: r.prerelease
          }));
          if (current.installed && current.version !== 'Not Detected') {
            result.updateAvailable = current.version !== result.latestVersion;
          }
        }
        break;
      }

      case 'ia': {
        const releases = await fetchJson('https://api.github.com/repos/jjjake/internetarchive/releases?per_page=10');
        if (Array.isArray(releases) && releases.length > 0) {
          result.latestVersion = releases[0].tag_name.replace(/^v/, '');
          result.releases = releases.map(r => ({
            tag: r.tag_name,
            name: r.name || r.tag_name,
            publishedAt: r.published_at ? r.published_at.split('T')[0] : '',
            prerelease: r.prerelease
          }));
          if (current.installed && current.version !== 'Not Detected') {
            result.updateAvailable = current.version !== result.latestVersion;
          }
        }
        break;
      }

      case 'deno': {
        const releases = await fetchJson('https://api.github.com/repos/denoland/deno/releases?per_page=10');
        if (Array.isArray(releases) && releases.length > 0) {
          result.latestVersion = releases[0].tag_name.replace(/^v/, '');
          result.releases = releases.map(r => ({
            tag: r.tag_name,
            name: r.name || r.tag_name,
            publishedAt: r.published_at ? r.published_at.split('T')[0] : '',
            prerelease: r.prerelease
          }));
          if (current.installed && current.version !== 'Not Detected') {
            result.updateAvailable = current.version !== result.latestVersion;
          }
        }
        break;
      }
    }
  } catch (e) {
    result.error = e.message;
  }

  return result;
}

// ── 3. Install, Upgrade, or Downgrade Tool Version ─────────────────────

async function installToolVersion(toolKey, targetVersion = 'latest', progressCb = () => {}) {
  const isWin = os.platform() === 'win32';
  const isMac = os.platform() === 'darwin';

  progressCb({ tool: toolKey, percent: 5, message: `Preparing installation of ${toolKey} (${targetVersion})...` });

  switch (toolKey) {
    case 'ytdlp': {
      const vendorDir = getVendorDir('ytdlp');
      const exeName = isWin ? 'yt-dlp.exe' : (isMac ? 'yt-dlp_macos' : 'yt-dlp');
      const finalExe = isWin ? 'yt-dlp.exe' : 'yt-dlp';
      const targetBin = path.join(vendorDir, finalExe);

      let downloadUrl = '';
      if (targetVersion === 'nightly') {
        downloadUrl = `https://github.com/yt-dlp/yt-dlp-nightly-builds/releases/latest/download/${exeName}`;
      } else if (targetVersion === 'latest') {
        downloadUrl = `https://github.com/yt-dlp/yt-dlp/releases/latest/download/${exeName}`;
      } else {
        const cleanTag = targetVersion.replace(/^v(?=\d{4})/, '');
        downloadUrl = `https://github.com/yt-dlp/yt-dlp/releases/download/${cleanTag}/${exeName}`;
      }

      progressCb({ tool: toolKey, percent: 15, message: `Downloading yt-dlp ${targetVersion}...` });
      try {
        await downloadFileWithProgress(downloadUrl, targetBin, (log) => {
          progressCb({ tool: toolKey, message: log });
        });
      } catch (err) {
        if (err.message && (err.message.includes('404') || err.message.includes('HTTP 404'))) {
          throw new Error(`Version "${targetVersion}" is not real or available for yt-dlp on GitHub Releases.`);
        }
        throw err;
      }

      if (!isWin) {
        fs.chmodSync(targetBin, 0o755);
      }

      progressCb({ tool: toolKey, percent: 100, message: `✔ yt-dlp ${targetVersion} successfully installed!`, done: true });
      return await getToolInfo('ytdlp');
    }

    case 'ffmpeg': {
      const vendorDir = getVendorDir('ffmpeg');
      // Remove existing binaries to force fresh installation
      const exeName = isWin ? 'ffmpeg.exe' : 'ffmpeg';
      const probeName = isWin ? 'ffprobe.exe' : 'ffprobe';
      const existingBin = path.join(vendorDir, exeName);
      const existingProbe = path.join(vendorDir, probeName);
      if (fs.existsSync(existingBin)) {
        try { fs.unlinkSync(existingBin); } catch (_) {}
      }
      if (fs.existsSync(existingProbe)) {
        try { fs.unlinkSync(existingProbe); } catch (_) {}
      }

      progressCb({ tool: toolKey, percent: 15, message: `Downloading and configuring FFmpeg (${targetVersion})...` });
      try {
        await ensureFfmpeg(targetVersion, (log) => {
          progressCb({ tool: toolKey, message: log });
        });
      } catch (err) {
        if (err.message && (err.message.includes('404') || err.message.includes('not real or available'))) {
          throw new Error(`Version "${targetVersion}" is not real or available for FFmpeg.`);
        }
        throw err;
      }

      progressCb({ tool: toolKey, percent: 100, message: `✔ FFmpeg ${targetVersion} successfully installed!`, done: true });
      return await getToolInfo('ffmpeg');
    }

    case 'gallerydl': {
      const vendorDir = getVendorDir('gallery-dl');
      const exeName = isWin ? 'gallery-dl.exe' : (isMac ? 'gallery-dl.mac' : 'gallery-dl.bin');
      const finalExe = isWin ? 'gallery-dl.exe' : 'gallery-dl';
      const targetBin = path.join(vendorDir, finalExe);

      let downloadUrl = '';
      if (targetVersion === 'latest') {
        const release = await fetchJson('https://codeberg.org/api/v1/repos/mikf/gallery-dl/releases/latest');
        const tag = release.tag_name || 'latest';
        downloadUrl = `https://codeberg.org/mikf/gallery-dl/releases/download/${tag}/${exeName}`;
      } else {
        const tag = targetVersion.startsWith('v') ? targetVersion : `v${targetVersion}`;
        downloadUrl = `https://codeberg.org/mikf/gallery-dl/releases/download/${tag}/${exeName}`;
      }

      progressCb({ tool: toolKey, percent: 20, message: `Downloading gallery-dl ${targetVersion}...` });
      try {
        await downloadFileWithProgress(downloadUrl, targetBin, (log) => {
          progressCb({ tool: toolKey, message: log });
        });
      } catch (err) {
        if (err.message && (err.message.includes('404') || err.message.includes('HTTP 404'))) {
          throw new Error(`Version "${targetVersion}" is not real or available for gallery-dl.`);
        }
        throw err;
      }

      if (!isWin) {
        fs.chmodSync(targetBin, 0o755);
      }

      progressCb({ tool: toolKey, percent: 100, message: `✔ gallery-dl ${targetVersion} installed!`, done: true });
      return await getToolInfo('gallerydl');
    }

    case 'streamlink': {
      progressCb({ tool: toolKey, percent: 20, message: `Updating Streamlink via Python pip...` });
      const py = isWin ? 'python' : 'python3';
      const cmd = targetVersion === 'latest'
        ? `"${py}" -m pip install --upgrade streamlink`
        : `"${py}" -m pip install --upgrade streamlink==${targetVersion}`;

      await new Promise((resolve, reject) => {
        exec(cmd, { timeout: 120000 }, (error, stdout, stderr) => {
          if (error) {
            const combined = `${stderr || ''} ${stdout || ''}`;
            if (combined.includes('No matching distribution found') || combined.includes('Could not find a version')) {
              return reject(new Error(`Version "${targetVersion}" is not real or available for Streamlink on PyPI.`));
            }
            reject(new Error(stderr || stdout || error.message));
          } else {
            resolve(stdout);
          }
        });
      });

      progressCb({ tool: toolKey, percent: 100, message: `✔ Streamlink ${targetVersion} installed via pip!`, done: true });
      return await getToolInfo('streamlink');
    }

    case 'ia': {
      const vendorDir = getVendorDir('ia');
      const exeName = isWin ? 'ia.exe' : 'ia';
      const targetBin = path.join(vendorDir, exeName);

      let downloadUrl = '';
      if (targetVersion === 'latest') {
        downloadUrl = `https://github.com/jjjake/internetarchive/releases/latest/download/${exeName}`;
      } else {
        const tag = targetVersion.startsWith('v') ? targetVersion : `v${targetVersion}`;
        downloadUrl = `https://github.com/jjjake/internetarchive/releases/download/${tag}/${exeName}`;
      }

      progressCb({ tool: toolKey, percent: 20, message: `Downloading Internet Archive CLI (${targetVersion})...` });
      try {
        await downloadFileWithProgress(downloadUrl, targetBin, (log) => {
          progressCb({ tool: toolKey, message: log });
        });
      } catch (err) {
        if (err.message && (err.message.includes('404') || err.message.includes('HTTP 404'))) {
          throw new Error(`Version "${targetVersion}" is not real or available for Internet Archive CLI.`);
        }
        throw err;
      }

      if (!isWin) {
        fs.chmodSync(targetBin, 0o755);
      }

      progressCb({ tool: toolKey, percent: 100, message: `✔ IA CLI ${targetVersion} ready!`, done: true });
      return await getToolInfo('ia');
    }

    case 'deno': {
      const vendorDir = getVendorDir('deno');
      const exeName = isWin ? 'deno.exe' : 'deno';
      const targetBin = path.join(vendorDir, exeName);

      let archiveName = '';
      if (isWin) {
        archiveName = 'deno-x86_64-pc-windows-msvc.zip';
      } else if (isMac) {
        archiveName = os.arch() === 'arm64' ? 'deno-aarch64-apple-darwin.zip' : 'deno-x86_64-apple-darwin.zip';
      } else {
        archiveName = os.arch() === 'arm64' ? 'deno-aarch64-unknown-linux-gnu.zip' : 'deno-x86_64-unknown-linux-gnu.zip';
      }

      let downloadUrl = '';
      if (targetVersion === 'latest') {
        downloadUrl = `https://github.com/denoland/deno/releases/latest/download/${archiveName}`;
      } else {
        const tag = targetVersion.startsWith('v') ? targetVersion : `v${targetVersion}`;
        downloadUrl = `https://github.com/denoland/deno/releases/download/${tag}/${archiveName}`;
      }

      const zipPath = path.join(vendorDir, archiveName);
      progressCb({ tool: toolKey, percent: 25, message: `Downloading Deno ${targetVersion}...` });
      try {
        await downloadFileWithProgress(downloadUrl, zipPath, (log) => {
          progressCb({ tool: toolKey, message: log });
        });
      } catch (err) {
        if (err.message && (err.message.includes('404') || err.message.includes('HTTP 404'))) {
          throw new Error(`Version "${targetVersion}" is not real or available for Deno.`);
        }
        throw err;
      }

      progressCb({ tool: toolKey, percent: 75, message: `Extracting Deno executable...` });
      if (isWin) {
        execSync(`tar -xf "${zipPath}" -C "${vendorDir}"`, { stdio: 'ignore' });
      } else {
        execSync(`unzip -o "${zipPath}" -d "${vendorDir}"`, { stdio: 'ignore' });
        fs.chmodSync(targetBin, 0o755);
      }

      if (fs.existsSync(zipPath)) {
        fs.unlinkSync(zipPath);
      }

      progressCb({ tool: toolKey, percent: 100, message: `✔ Deno ${targetVersion} installed at ${targetBin}!`, done: true });
      return await getToolInfo('deno');
    }

    default:
      throw new Error(`Unsupported tool: ${toolKey}`);
  }
}

function openVendorFolder(toolKey) {
  const vendorDir = toolKey ? getVendorDir(toolKey) : getVendorBaseDir();
  if (fs.existsSync(vendorDir)) {
    shell.openPath(vendorDir);
    return true;
  }
  return false;
}

module.exports = {
  getToolInfo,
  getAllToolsInfo,
  checkToolUpdates,
  installToolVersion,
  openVendorFolder
};
