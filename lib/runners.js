const { spawn, execFile } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const https = require('https');
const { pauseProcess, resumeProcess, killProcess } = require('./runner-utils');
const { getYtdlpPath, ensureYtdlp } = require('./ensure-ytdlp');
const { getFfmpegPath, ensureFfmpeg } = require('./ensure-ffmpeg');

const { getIaPath, ensureIa } = require('./ensure-ia');
const { ensureStreamlink } = require('./ensure-streamlink');
const { ensurePssuspend } = require('./ensure-pssuspend');
const { getYpdlPath, ensureYpdl } = require('./ensure-ypdl');

const activeProcs = new Map();
const baseEnv = { ...process.env, PYTHONUNBUFFERED: '1', PYTHONIOENCODING: 'utf-8' };

let cachedBestEncoder = null;
let cachedH264Encoder = null;

function getBestVideoEncoder(ffmpegPath) {
  if (cachedBestEncoder) return cachedBestEncoder;
  const encoders = [
    'hevc_nvenc', 'hevc_amf', 'hevc_qsv',
    'h264_nvenc', 'h264_amf', 'h264_qsv'
  ];

  for (const enc of encoders) {
    try {
      const args = ['-hide_banner', '-f', 'lavfi', '-i', 'color=c=black:s=256x256:r=1', '-c:v', enc, '-t', '1', '-f', 'null', '-'];
      require('child_process').execFileSync(ffmpegPath, args, { stdio: 'ignore' });
      cachedBestEncoder = enc;
      return enc;
    } catch (e) { }
  }
  cachedBestEncoder = 'libx264';
  return 'libx264';
}

function getBestH264Encoder(ffmpegPath) {
  if (cachedH264Encoder) return cachedH264Encoder;
  const encoders = ['h264_nvenc', 'h264_amf', 'h264_qsv'];
  for (const enc of encoders) {
    try {
      const args = ['-hide_banner', '-f', 'lavfi', '-i', 'color=c=black:s=256x256:r=1', '-c:v', enc, '-t', '1', '-f', 'null', '-'];
      require('child_process').execFileSync(ffmpegPath, args, { stdio: 'ignore' });
      cachedH264Encoder = enc;
      return enc;
    } catch (e) { }
  }
  cachedH264Encoder = 'libx264';
  return 'libx264';
}

function hasGpuEncoder(ffmpegPath) {
  const enc = getBestH264Encoder(ffmpegPath);
  return enc && enc !== 'libx264';
}

function hmsToSecs(ts) {
  if (!ts) return 0;
  let str = String(ts).trim();
  if (!str) return 0;
  if (/^\d+(\.\d+)?$/.test(str)) return parseFloat(str);

  if (str.includes(':')) {
    const parts = str.split(':').map(Number);
    if (!parts.some(isNaN)) {
      if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
      if (parts.length === 2) return parts[0] * 60 + parts[1];
      return parts[0];
    }
  }

  if (str.includes('.')) {
    const dotParts = str.split('.');
    if (dotParts.length >= 3) {
      const h = Number(dotParts[0]);
      const m = Number(dotParts[1]);
      const s = dotParts.length >= 4 ? Number(dotParts[2] + '.' + dotParts[3]) : Number(dotParts[2]);
      if (!isNaN(h) && !isNaN(m) && !isNaN(s)) {
        return h * 3600 + m * 60 + s;
      }
    }
  }

  const parts = str.split(/[\s,]+/).map(Number);
  if (!parts.some(isNaN) && parts.length > 0) {
    if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
    if (parts.length === 2) return parts[0] * 60 + parts[1];
    return parts[0];
  }
  return 0;
}

async function safeReplaceFile(srcFixed, destTarget) {
  if (!srcFixed || !fs.existsSync(srcFixed)) return false;
  try {
    const fixedSize = fs.statSync(srcFixed).size;
    if (fixedSize < 1000) return false;
  } catch (e) {
    return false;
  }

  for (let attempt = 0; attempt < 8; attempt++) {
    try {
      if (fs.existsSync(destTarget)) {
        try {
          fs.unlinkSync(destTarget);
        } catch (unlinkErr) {
          const staleBackup = `${destTarget}.stale_${Date.now()}_${attempt}`;
          try {
            fs.renameSync(destTarget, staleBackup);
            setTimeout(() => { try { fs.unlinkSync(staleBackup); } catch (e) { } }, 3000);
          } catch (renameErr) {
            await new Promise(r => setTimeout(r, 600));
            continue;
          }
        }
      }
      fs.renameSync(srcFixed, destTarget);
      return true;
    } catch (err) {
      await new Promise(r => setTimeout(r, 600));
    }
  }

  // If replacing failed, do NOT delete srcFixed; rename srcFixed to destTarget directly
  try {
    if (!fs.existsSync(destTarget)) {
      fs.renameSync(srcFixed, destTarget);
      return true;
    }
  } catch (e) { }
  return false;
}

async function fixTimestamps(filePath, broadcast) {
  if (!filePath || !fs.existsSync(filePath)) return;
  const ffmpeg = getFfmpegPath();
  const dir = path.dirname(filePath);
  const ext = path.extname(filePath);
  const base = path.basename(filePath, ext);
  const fixedOut = path.join(dir, `${base}_fixed_${Date.now()}${ext}`);

  broadcast({ type: 'stdout', text: `\n▶ [Post-Process] Normalizing 00:00:00 start timestamp & duration (lossless remux)...\n` });

  const args = ['-y', '-ss', '0', '-i', filePath, '-c', 'copy', '-map', '0:v', '-map', '0:a', '-avoid_negative_ts', 'make_zero', '-fflags', '+genpts+discardcorrupt', '-map_chapters', '-1', fixedOut];

  const remuxProc = spawn(ffmpeg, args, { cwd: dir });
  activeProcs.set(remuxProc.pid, remuxProc);
  broadcast({ type: 'pid', pid: remuxProc.pid });

  remuxProc.stderr.on('data', (d) => broadcast({ type: 'stdout', text: d.toString() }));
  remuxProc.stdout.on('data', (d) => broadcast({ type: 'stdout', text: d.toString() }));

  const remuxCode = await new Promise(resolve => remuxProc.on('close', resolve));
  activeProcs.delete(remuxProc.pid);

  if (remuxCode === 0 && fs.existsSync(fixedOut) && fs.statSync(fixedOut).size > 1000) {
    const replaced = await safeReplaceFile(fixedOut, filePath);
    if (replaced) {
      broadcast({ type: 'stdout', text: `\n✔ [Post-Process] Video duration and start timestamp successfully normalized.\n` });
    } else {
      broadcast({ type: 'stdout', text: `\n✔ [Post-Process] Normalized video saved as ${path.basename(fixedOut)}.\n` });
    }
  }
}

async function resolveTempFiles(dir) {
  if (!dir || !fs.existsSync(dir)) return null;
  try {
    const files = fs.readdirSync(dir);
    for (const file of files) {
      if (file.includes('.temp.') || file.endsWith('.temp')) {
        const tempPath = path.join(dir, file);
        const targetName = file.replace(/\.temp(?=\.|$)/g, '');
        const targetPath = path.join(dir, targetName);

        await new Promise(r => setTimeout(r, 600));
        const ok = await safeReplaceFile(tempPath, targetPath);
        if (ok) return targetPath;
      }
    }
  } catch (e) { }
  return null;
}

function getFolderName(url) {
  try {
    const u = new URL(url);
    if (u.hostname.includes('youtube.com')) {
      if (u.pathname.includes('/live/')) return u.pathname.split('/').pop();
      return u.searchParams.get('v') || u.pathname.split('/').pop();
    }
    if (u.hostname.includes('youtu.be')) {
      return u.pathname.split('/').pop();
    }
    let name = u.pathname.split('/').pop();
    if (!name) name = u.hostname;
    return name.replace(/[^a-zA-Z0-9_\-]/g, '_');
  } catch (e) {
    return 'download_' + Date.now();
  }
}

function isChannelOrPlaylist(url) {
  if (!url) return false;
  return url.includes('/@') || url.includes('/channel/') || url.includes('/c/') || url.includes('/user/') || url.includes('playlist?list=');
}

function getChannelFolderName(url) {
  try {
    const u = new URL(url);
    const parts = u.pathname.split('/').filter(Boolean);
    for (const p of parts) {
      if (p.startsWith('@')) return p;
      if (['channel', 'c', 'user'].includes(p)) {
        const idx = parts.indexOf(p);
        if (idx >= 0 && idx < parts.length - 1) return parts[idx + 1];
      }
    }
    if (u.searchParams.has('list')) return 'playlist_' + u.searchParams.get('list');
  } catch (e) { }
  return 'channel_' + Date.now();
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function moveFilesUp(tempDir, targetDir) {
  if (!fs.existsSync(tempDir)) return;
  try {
    const files = fs.readdirSync(tempDir);
    for (const file of files) {
      const src = path.join(tempDir, file);
      let dest = path.join(targetDir, file);
      if (fs.existsSync(dest)) {
        const ext = path.extname(file);
        const name = path.basename(file, ext);
        let counter = 1;
        while (fs.existsSync(dest)) {
          dest = path.join(targetDir, `${name} (${counter})${ext}`);
          counter++;
        }
      }
      // Retry with backoff: large files can be transiently locked right after ffmpeg
      // finishes writing them (antivirus real-time scan, Windows Search indexing, or a
      // not-yet-fully-released handle from the ffmpeg/yt-dlp process itself). Only
      // retry on EBUSY/EPERM specifically — anything else is a real error, fail fast.
      const maxAttempts = 6;
      let lastErr = null;
      let moved = false;
      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
          fs.renameSync(src, dest);
          moved = true;
          break;
        } catch (e) {
          lastErr = e;
          if (e.code !== 'EBUSY' && e.code !== 'EPERM') throw e;
          if (attempt < maxAttempts) {
            console.error(`[moveFilesUp] rename locked (attempt ${attempt}/${maxAttempts}), retrying in ${attempt}s: ${e.message}`);
            await sleep(attempt * 1000);
          }
        }
      }
      if (!moved) {
        // Last resort: copy+delete instead of rename. A lock that blocks the exclusive
        // access rename needs can sometimes still permit a plain read for copying —
        // worth trying before giving up and leaving the file stranded in tempDir.
        // IMPORTANT: verify the copy actually completed (matching size) before treating
        // it as successful or deleting the source — a copy interrupted by the same
        // lock partway through can silently leave a truncated/0-byte destination file
        // without throwing, which would otherwise get "confirmed" and have its real
        // source data deleted out from under it.
        try {
          console.error(`[moveFilesUp] rename still locked after ${maxAttempts} attempts, falling back to copy+delete`);
          const srcSize = fs.statSync(src).size;
          fs.copyFileSync(src, dest);
          const destSize = fs.statSync(dest).size;
          if (destSize !== srcSize) {
            try { fs.unlinkSync(dest); } catch (cleanupErr) { }
            throw new Error(`Copy fallback produced a truncated file (${destSize} of ${srcSize} bytes) — source left in place at ${src}`);
          }
          fs.unlinkSync(src);
        } catch (copyErr) {
          throw lastErr || copyErr;
        }
      }
    }
    fs.rmdirSync(tempDir);
  } catch (e) {
    console.error('Failed to move files up:', e);
  }
}

function downloadImage(url, dest) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' } }, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        return downloadImage(res.headers.location, dest).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) {
        return reject(new Error(`Failed to download: ${res.statusCode}`));
      }
      const file = fs.createWriteStream(dest);
      res.pipe(file);
      file.on('finish', () => { file.close(); resolve(); });
      file.on('error', reject);
    }).on('error', reject);
  });
}

async function downloadCommunityImages(jsonPath, broadcast) {
  if (!fs.existsSync(jsonPath)) return;
  try {
    broadcast({ type: 'stdout', text: `\n[Post-Processing] Parsing ${path.basename(jsonPath)} for images...\n` });
    const content = fs.readFileSync(jsonPath, 'utf8');
    const posts = JSON.parse(content);
    const dir = path.dirname(jsonPath);
    const baseName = path.basename(jsonPath, '_posts.json'); // e.g. @AliasforPatreon
    let totalImages = 0;

    // Quick count
    for (const post of posts) {
      if (post.images && post.images.length > 0) totalImages += post.images.length;
    }

    if (totalImages === 0) {
      broadcast({ type: 'stdout', text: `[Post-Processing] No images found to download.\n` });
      return;
    }

    broadcast({ type: 'stdout', text: `[Post-Processing] Found ${totalImages} image(s) to download.\n` });

    let downloaded = 0;
    for (const post of posts) {
      if (!post.images || post.images.length === 0) continue;

      // Extract post ID from post_link (e.g. .../post/UgkxCFJlAS...)
      let postId = 'unknown';
      if (post.post_link) {
        const parts = post.post_link.split('/');
        postId = parts[parts.length - 1];
      }

      for (let i = 0; i < post.images.length; i++) {
        const imgUrl = post.images[i];
        const dest = path.join(dir, `${baseName}_${postId}_img_${i + 1}.jpg`);
        if (!fs.existsSync(dest)) {
          broadcast({ type: 'stdout', text: `Downloading image ${downloaded + 1}/${totalImages} (${postId})... ` });
          try {
            await downloadImage(imgUrl, dest);
            broadcast({ type: 'stdout', text: `Done.\n` });
          } catch (err) {
            broadcast({ type: 'stdout', text: `Failed (${err.message}).\n` });
          }
        } else {
          broadcast({ type: 'stdout', text: `Image ${downloaded + 1}/${totalImages} already exists, skipping.\n` });
        }
        downloaded++;
      }
    }
    broadcast({ type: 'stdout', text: `[Post-Processing] Finished downloading images.\n` });
  } catch (err) {
    broadcast({ type: 'stdout', text: `\n[Post-Processing] Error downloading images: ${err.message}\n` });
  }
}

async function prepareEnv(opts, broadcast) {
  if (opts.installFfmpeg) {
    broadcast({ type: 'stdout', text: '[prepareEnv] Ensuring FFmpeg...\n' });
    await ensureFfmpeg(opts.ffmpegVersion, (msg) => broadcast({ type: 'stdout', text: msg + '\n' }));
    broadcast({ type: 'stdout', text: '[prepareEnv] FFmpeg ready.\n' });
  }
  broadcast({ type: 'stdout', text: '[prepareEnv] Ensuring yt-dlp...\n' });
  await ensureYtdlp((msg) => broadcast({ type: 'stdout', text: msg + '\n' }));
  broadcast({ type: 'stdout', text: '[prepareEnv] yt-dlp ready.\n' });
  if (os.platform() === 'win32') {
    broadcast({ type: 'stdout', text: '[prepareEnv] Ensuring pssuspend...\n' });
    await ensurePssuspend((msg) => broadcast({ type: 'stdout', text: msg + '\n' }));
    broadcast({ type: 'stdout', text: '[prepareEnv] pssuspend ready.\n' });
  }
  broadcast({ type: 'stdout', text: '[prepareEnv] Environment ready.\n' });
}

function spawnRunner(exe, args, opts, broadcast) {
  broadcast({ type: 'stdout', text: `Spawning: ${exe} ${args.join(' ')}\n\n` });

  try {
    if (opts.tempDir && !fs.existsSync(opts.tempDir)) {
      fs.mkdirSync(opts.tempDir, { recursive: true });
    }

    // Ensure outputDir exists to prevent spawn ENOTDIR/ENOENT
    if (opts.outputDir && !fs.existsSync(opts.outputDir)) {
      fs.mkdirSync(opts.outputDir, { recursive: true });
    }
  } catch (err) {
    broadcast({ type: 'error', text: `Failed to create directory: ${err.message}` });
    return;
  }

  let child;
  try {
    child = spawn(exe, args, {
      cwd: opts.tempDir || opts.outputDir,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: opts.env || baseEnv
    });
  } catch (err) {
    broadcast({ type: 'error', text: `Failed to spawn process: ${err.message}` });
    return;
  }

  activeProcs.set(child.pid, child);
  broadcast({ type: 'pid', pid: child.pid });

  child.stdout.on('data', (data) => broadcast({ type: 'stdout', text: data.toString() }));
  child.stderr.on('data', (data) => broadcast({ type: 'stderr', text: data.toString() }));

  child.on('close', async (code) => {
    activeProcs.delete(child.pid);
    if (!child._isKilledByUser && code === 0 && opts.tempDir && !opts.keepTemp && !opts.suppressExit) {
      await moveFilesUp(opts.tempDir, opts.outputDir);
    }
    if (!opts.suppressExit) {
      broadcast({ type: 'exit', code: child._isKilledByUser ? null : code });
    }
  });

  child.on('error', (err) => {
    broadcast({ type: 'error', text: err.message });
  });

  return child;
}

// 1. YouTube Live Stream Archiver
async function runLivestream(opts, broadcast) {
  await prepareEnv(opts, broadcast);
  opts.tempDir = path.join(opts.outputDir, getFolderName(opts.url));

  if (opts.url.includes('twitch.tv') && opts.fromStart !== 'y') {
    try {
      await ensureStreamlink(opts.autoStreamlink !== 'false' && opts.autoStreamlink !== false, (msg) => broadcast({ type: 'stdout', text: msg + '\n' }));
    } catch (e) {
      broadcast({ type: 'exit', code: 1 });
      return;
    }
    const args = [];
    if (opts.twitchToken) {
      args.push('--twitch-api-header', `Authorization=OAuth ${opts.twitchToken}`);
    }
    // Twitch disable ads is useful even without turbo, but streamlink uses the token to get ad-free natively if turbo/subbed
    args.push('--twitch-disable-ads');

    args.push(opts.url);

    let quality = 'best';
    if (opts.format && opts.format.includes('1080')) quality = '1080p60,1080p,best';
    else if (opts.format && opts.format.includes('720')) quality = '720p60,720p,best';
    else if (opts.format && opts.format.includes('480')) quality = '480p,best';
    else if (opts.format && opts.format.includes('360')) quality = '360p,best';
    else if (opts.format && opts.format.includes('audio')) quality = 'audio_only,audio';

    args.push(quality);

    let ext = opts.container || 'mp4';
    args.push('-o', `{author} - {time:%Y%m%d_%H%M%S}.${ext}`);

    spawnRunner('streamlink', args, opts, broadcast);
  } else {
    const ytDlp = getYtdlpPath();
    const ffmpegPath = getFfmpegPath();
    const args = [
      opts.url,
      '-f', opts.format,
      '--merge-output-format', opts.container || 'mp4',
      '--ffmpeg-location', ffmpegPath,
      '--postprocessor-args', 'ffmpeg_i:-hwaccel auto',
    ];
    if (opts.cookiesPath && fs.existsSync(opts.cookiesPath)) args.push('--cookies', opts.cookiesPath);
    if (opts.fromStart === 'y') args.push('--live-from-start');
    if (opts.concurrent) args.push('--concurrent-fragments', opts.concurrent);

    if (opts.url.includes('twitch.tv') && opts.twitchToken) {
      args.push('--add-header', `Authorization: OAuth ${opts.twitchToken}`);
    }

    if (opts.bgutilUrl) {
      args.push('--extractor-args', `youtubepot-bgutilhttp:base_url=${opts.bgutilUrl}`);
    } else if (opts.useDeno === 'y') {
      args.push('--extractor-args', 'youtube:po_token=pot:bgutil');
    }

    spawnRunner(ytDlp, args, opts, broadcast);
  }
}

async function interceptYtdlpAutoRepair(opts, broadcast) {
  if (!opts.autoRepair) return false;
  if (!opts.url.includes('twitch.tv')) return false;

  broadcast({ type: 'stdout', text: `\n▶ [Auto-Repair] Twitch VOD detected. Initializing Slicing Orchestrator...\n` });

  const { spawn } = require('child_process');
  const path = require('path');
  const fs = require('fs');
  const https = require('https');
  const ytDlp = getYtdlpPath();
  const ffmpeg = getFfmpegPath();

  // 1. Fetch metadata & dump JSON
  broadcast({ type: 'stdout', text: `▶ [Auto-Repair] Fetching metadata and M3U8 URL...\n` });
  const infoArgs = [opts.url, '--dump-json', '--skip-download'];

  if (opts.embedSubs || opts.dlSubs) infoArgs.push('--write-subs', '--write-auto-subs');
  if (opts.embedThumb || opts.dlThumb) infoArgs.push('--write-thumbnail');
  if (opts.embedMetadata) infoArgs.push('--write-info-json');
  if (opts.cookiesPath && fs.existsSync(opts.cookiesPath)) infoArgs.push('--cookies', opts.cookiesPath);
  if (opts.extraArgs) infoArgs.push(...opts.extraArgs);

  const workDir = path.join(opts.outputDir || process.cwd(), '.temp_repair_' + (opts.url.match(/\d+/) || [Date.now()])[0]);
  fs.mkdirSync(workDir, { recursive: true });

  let jsonOutput = '';
  const infoCode = await new Promise((resolve) => {
    const child = spawn(ytDlp, infoArgs, { cwd: workDir });
    child.stdout.on('data', d => jsonOutput += d.toString());
    child.stderr.on('data', d => broadcast({ type: 'stderr', text: d.toString() }));
    child.on('close', resolve);
  });

  if (infoCode !== 0) {
    broadcast({ type: 'stderr', text: `\n▶ [Auto-Repair] Failed to fetch metadata (code ${infoCode}). Aborting.\n` });
    if (!opts.suppressExit) broadcast({ type: 'exit', code: infoCode });
    return true;
  }

  let info;
  try {
    const lines = jsonOutput.trim().split('\n');
    info = JSON.parse(lines[lines.length - 1]);
  } catch (e) {
    broadcast({ type: 'stderr', text: `\n▶ [Auto-Repair] Failed to parse yt-dlp JSON. Aborting.\n` });
    if (!opts.suppressExit) broadcast({ type: 'exit', code: 1 });
    return true;
  }

  const m3u8Url = info.url || info.manifest_url;
  if (!m3u8Url || !m3u8Url.includes('.m3u8')) {
    broadcast({ type: 'stderr', text: `\n▶ [Auto-Repair] Could not extract M3U8 URL. Aborting.\n` });
    if (!opts.suppressExit) broadcast({ type: 'exit', code: 1 });
    return true;
  }

  // Find exact base filename
  let baseName = info._filename ? info._filename.replace(/\.[^.]+$/, '') : `${info.title} [${info.id}]`;
  let baseNamePrefix = path.basename(baseName);

  // Stop Button Mock Process
  const mockPid = -(Math.floor(Math.random() * 100000) + 1000);
  const mockProc = { _isKilledByUser: false };
  activeProcs.set(mockPid, mockProc);
  broadcast({ type: 'pid', pid: mockPid });

  // 2. Fetch & Slice M3U8
  broadcast({ type: 'stdout', text: `▶ [Auto-Repair] Fetching raw M3U8 manifest...\n` });
  let manifest;
  try {
    manifest = await new Promise((resolve, reject) => {
      https.get(m3u8Url, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => resolve(data));
      }).on('error', reject);
    });
  } catch (e) {
    broadcast({ type: 'stderr', text: `\n▶ [Auto-Repair] Failed to fetch M3U8: ${e.message}\n` });
    if (!opts.suppressExit) broadcast({ type: 'exit', code: 1 });
    return true;
  }

  // 2. Parse M3U8 for Fragments & Rewrite to Local
  const rawLines = manifest.split('\n');
  const chunkUrls = [];
  const localM3u8Lines = [];
  let globalIndex = 0;

  for (const line of rawLines) {
    if (line.startsWith('#EXT-X-MAP')) {
      const match = line.match(/URI="([^"]+)"/);
      if (match) {
        let u = match[1];
        if (!u.startsWith('http')) {
          const baseUrl = m3u8Url.substring(0, m3u8Url.lastIndexOf('/') + 1);
          u = baseUrl + u;
        }
        chunkUrls.push(u);
        localM3u8Lines.push(line.replace(match[1], `chunk_${String(globalIndex).padStart(5, '0')}.mp4`));
        globalIndex++;
      } else {
        localM3u8Lines.push(line);
      }
    } else if (line.match(/^[0-9a-zA-Z\-_]+(\.mp4|\.ts)/) && !line.startsWith('http')) {
      const baseUrl = m3u8Url.substring(0, m3u8Url.lastIndexOf('/') + 1);
      chunkUrls.push(baseUrl + line.trim());
      localM3u8Lines.push(`chunk_${String(globalIndex).padStart(5, '0')}.mp4`);
      globalIndex++;
    } else if (line.startsWith('http')) {
      chunkUrls.push(line.trim());
      localM3u8Lines.push(`chunk_${String(globalIndex).padStart(5, '0')}.mp4`);
      globalIndex++;
    } else {
      localM3u8Lines.push(line);
    }
  }

  const localM3u8Path = path.join(workDir, 'local.m3u8');
  fs.writeFileSync(localM3u8Path, localM3u8Lines.join('\n'));

  broadcast({ type: 'stdout', text: `▶ [Auto-Repair] Found ${chunkUrls.length} fragments in stream.\n` });
  broadcast({ type: 'stdout', text: `▶ [Auto-Repair] Downloading fragments at Native Speed (15x Concurrency)...\n` });

  const chunkFiles = [];
  let downloadedCount = 0;
  let lastPercent = -1;
  const total = chunkUrls.length;

  const activeStreams = new Set();
  const http = require('http');

  async function downloadChunk(url, dest, retries = 10) {
    const client = url.startsWith('https') ? https : http;
    for (let i = 0; i < retries; i++) {
      try {
        await new Promise((resolve, reject) => {
          const req = client.get(url, { timeout: 15000 }, (res) => {
            if (res.statusCode !== 200) {
              res.resume();
              return reject(new Error(`HTTP ${res.statusCode}`));
            }
            const file = fs.createWriteStream(dest);
            activeStreams.add(file);
            res.pipe(file);
            file.on('finish', () => { file.close(); activeStreams.delete(file); resolve(); });
            file.on('error', (err) => { activeStreams.delete(file); reject(err); });
          });
          req.on('error', reject);
          req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
        });
        return;
      } catch (e) {
        if (i === retries - 1) throw e;
        await new Promise(r => setTimeout(r, 1000));
      }
    }
  }

  const executing = new Set();
  const concurrency = 15;

  for (let i = 0; i < chunkUrls.length; i++) {
    const url = chunkUrls[i];
    const dest = path.join(workDir, `chunk_${String(i).padStart(5, '0')}.mp4`);
    chunkFiles.push(dest);

    if (mockProc._isKilledByUser) {
      throw new Error('Stopped by user');
    }

    if (fs.existsSync(dest) && fs.statSync(dest).size > 0) {
      downloadedCount++;
      continue;
    }

    const p = downloadChunk(url, dest).then(() => {
      executing.delete(p);
      downloadedCount++;
      const percent = ((downloadedCount / total) * 100).toFixed(1);
      if (percent !== lastPercent) {
        broadcast({ type: 'stdout', text: `\r[download]  ${percent}% (Native Repair: ${downloadedCount}/${total} fragments)` });
        lastPercent = percent;
      }
    }).catch(err => {
      broadcast({ type: 'stderr', text: `\n▶ [Auto-Repair] Failed to download chunk ${i}: ${err.message}\n` });
      throw err;
    });

    executing.add(p);

    if (executing.size >= concurrency) {
      await Promise.race(executing);
    }
  }

  if (mockProc._isKilledByUser) throw new Error('Stopped by user');

  await Promise.all(executing);
  broadcast({ type: 'stdout', text: '\n▶ [Auto-Repair] All fragments downloaded successfully.\n' });

  // 4. Remux & Finalize
  broadcast({ type: 'stdout', text: `▶ [Auto-Repair] Remuxing fragments and finalizing file...\n` });

  let finalOut;
  if (info._filename) {
    finalOut = path.resolve(opts.outputDir || process.cwd(), info._filename.replace(/\.[^.]+$/, '.mp4'));
  } else {
    finalOut = path.join(opts.outputDir || process.cwd(), `${baseNamePrefix}.mp4`);
  }
  fs.mkdirSync(path.dirname(finalOut), { recursive: true });

  let cArgs = ['-y', '-hwaccel', 'auto', '-allowed_extensions', 'ALL', '-i', localM3u8Path];

  const baseFilePrefix = info._filename ? path.join(workDir, info._filename.replace(/\.[^.]+$/, '')) : path.join(workDir, baseNamePrefix);
  const thumbFile = ['.jpg', '.webp', '.png'].map(ext => baseFilePrefix + ext).find(f => fs.existsSync(f));
  const subFiles = ['.vtt', '.srt'].map(ext => baseFilePrefix + ext).filter(f => fs.existsSync(f));
  const jsonFile = fs.existsSync(baseFilePrefix + '.info.json') ? baseFilePrefix + '.info.json' : null;

  let hasThumb = opts.embedThumb && thumbFile;
  let hasSub = opts.embedSubs && subFiles.length > 0;

  if (hasThumb) cArgs.push('-i', thumbFile);
  if (hasSub) subFiles.forEach(sub => cArgs.push('-i', sub));

  cArgs.push('-c', 'copy');

  if (hasSub) cArgs.push('-c:s', 'mov_text');

  cArgs.push('-map', '0');
  let mapIdx = 1;
  if (hasThumb) {
    cArgs.push('-map', `${mapIdx++}`, '-disposition:v:1', 'attached_pic');
  }
  if (hasSub) {
    subFiles.forEach(() => cArgs.push('-map', `${mapIdx++}`));
  }

  if (opts.embedMetadata && info.title) {
    cArgs.push('-metadata', `title=${info.title}`);
  }

  cArgs.push(finalOut);

  let mCode = 1;
  try {
    mCode = await new Promise(resolve => {
      const child = spawnRunner(ffmpeg, cArgs, { ...opts, suppressExit: true, cwd: workDir }, broadcast);
      if (!child) resolve(1);
      else child.on('close', resolve);
    });
    if (mCode !== 0) throw new Error('FFmpeg remux failed.');

    // Save requested metadata files out of workDir before cleanup
    if (opts.dlThumb && thumbFile) {
      const dest = path.resolve(opts.outputDir || process.cwd(), path.relative(workDir, thumbFile));
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.renameSync(thumbFile, dest);
    }
    if (opts.dlSubs) {
      subFiles.forEach(sub => {
        const dest = path.resolve(opts.outputDir || process.cwd(), path.relative(workDir, sub));
        fs.mkdirSync(path.dirname(dest), { recursive: true });
        fs.renameSync(sub, dest);
      });
    }
    if (opts.keepTemp && jsonFile) {
      const dest = path.resolve(opts.outputDir || process.cwd(), path.relative(workDir, jsonFile));
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.renameSync(jsonFile, dest);
    }

    broadcast({ type: 'stdout', text: `\n▶ [Auto-Repair] Successfully saved to ${finalOut}\n` });
  } catch (e) {
    if (e.message !== 'Stopped by user') {
      broadcast({ type: 'stderr', text: `\n▶ [Auto-Repair] Remuxing failed: ${e.message}\n` });
    }
  } finally {
    for (const stream of activeStreams) {
      try { stream.destroy(); } catch (e) { }
    }
    try { fs.rmSync(workDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); } catch (e) { console.error(e); }
  }

  if (!opts.suppressExit) broadcast({ type: 'exit', code: mCode === 0 ? 0 : null });
  return true;
}

async function smartCutClip(targetFile, finalDest, clipDuration, broadcast) {
  const ffmpeg = getFfmpegPath();
  const workDir = path.dirname(targetFile);

  let wasKilled = false;
  async function runFfmpeg(stepArgs) {
    const proc = spawn(ffmpeg, stepArgs, { cwd: workDir });
    activeProcs.set(proc.pid, proc);
    broadcast({ type: 'pid', pid: proc.pid });
    proc.stderr.on('data', (d) => broadcast({ type: 'stdout', text: d.toString() }));
    proc.stdout.on('data', (d) => broadcast({ type: 'stdout', text: d.toString() }));
    const stepCode = await new Promise((resolve) => {
      proc.on('close', (c) => {
        if (proc._isKilledByUser) wasKilled = true;
        resolve(c);
      });
    });
    activeProcs.delete(proc.pid);
    return stepCode;
  }

  broadcast({ type: 'stdout', text: `\n▶ [Smart-Cut] Losslessly remuxing clip, stripping ghost chapters & container tags...\n` });

  // Direct lossless stream copy that removes 47h ghost chapters and data tracks in 1 single pass
  const remuxArgs = [
    '-y',
    '-fflags', '+genpts+discardcorrupt',
    '-i', targetFile,
    '-map', '0:v:0', '-map', '0:a?',
    '-c', 'copy',
    '-map_chapters', '-1'
  ];
  if (clipDuration > 0) remuxArgs.push('-t', String(clipDuration));
  remuxArgs.push(finalDest);

  const code = await runFfmpeg(remuxArgs);
  if (wasKilled) {
    try { if (fs.existsSync(finalDest)) fs.unlinkSync(finalDest); } catch (e) { }
    broadcast({ type: 'stdout', text: `\n⏹ [Smart-Cut] Process stopped by user.\n` });
    return -1;
  }

  if (code === 0 && fs.existsSync(finalDest) && fs.statSync(finalDest).size > 1000) {
    broadcast({ type: 'stdout', text: `✔ [Smart-Cut] Complete! Output saved to: ${finalDest}\n` });
  } else {
    broadcast({ type: 'stderr', text: `⚠ [Smart-Cut] Remux returned code ${code}, moving original file.\n` });
    try { fs.copyFileSync(targetFile, finalDest); } catch (e) { }
  }
  return code;
}

function fetchHttpText(url) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : require('http');
    client.get(url, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' } }, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302 || res.statusCode === 307) {
        return fetchHttpText(res.headers.location).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) {
        return reject(new Error('HTTP ' + res.statusCode));
      }
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => resolve(data));
      res.on('error', reject);
    }).on('error', reject);
  });
}

async function downloadHlsClip(opts, broadcast) {
  await prepareEnv(opts, broadcast);
  const ytDlp = getYtdlpPath();
  const ffmpeg = getFfmpegPath();

  broadcast({ type: 'stdout', text: `\n▶ [HLS-Native] Resolving direct stream playlist for ${opts.url}...\n` });

  // 1. Fetch JSON metadata / direct m3u8 URL from yt-dlp
  let infoJson = null;
  try {
    const metaArgs = ['--dump-single-json', '--no-warnings', opts.url];
    if (opts.cookiesPath && fs.existsSync(opts.cookiesPath)) metaArgs.push('--cookies', opts.cookiesPath);
    const metaRes = await new Promise((resolve) => {
      const proc = spawn(ytDlp, metaArgs);
      let out = '';
      proc.stdout.on('data', d => out += d);
      proc.on('close', () => {
        try { resolve(JSON.parse(out)); } catch (e) { resolve(null); }
      });
    });
    infoJson = metaRes;
  } catch (e) { }

  let m3u8Url = infoJson?.url;
  if (!m3u8Url) {
    const gArgs = ['-g', opts.url];
    if (opts.cookiesPath && fs.existsSync(opts.cookiesPath)) gArgs.push('--cookies', opts.cookiesPath);
    const gRes = require('child_process').spawnSync(ytDlp, gArgs, { encoding: 'utf8' });
    m3u8Url = gRes.stdout ? gRes.stdout.trim().split(/\r?\n/)[0] : null;
  }

  if (!m3u8Url || !m3u8Url.includes('.m3u8')) {
    broadcast({ type: 'stderr', text: `⚠ [HLS-Native] Could not resolve m3u8 URL. Falling back to standard runner.\n` });
    return false;
  }

  // 2. Fetch the m3u8 text
  broadcast({ type: 'stdout', text: `▶ [HLS-Native] Parsing HLS segment manifest in memory...\n` });
  let m3u8Text = '';
  try {
    m3u8Text = await fetchHttpText(m3u8Url);
  } catch (e) {
    broadcast({ type: 'stderr', text: `⚠ [HLS-Native] Failed to fetch playlist: ${e.message}\n` });
    return false;
  }

  // If master playlist, pick best variant
  if (m3u8Text.includes('#EXT-X-STREAM-INF')) {
    const lines = m3u8Text.split(/\r?\n/);
    let variantUrl = null;
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].startsWith('#EXT-X-STREAM-INF') && i + 1 < lines.length) {
        const nextLine = lines[i + 1].trim();
        if (nextLine && !nextLine.startsWith('#')) {
          const base = m3u8Url.substring(0, m3u8Url.lastIndexOf('/') + 1);
          variantUrl = nextLine.startsWith('http') ? nextLine : base + nextLine;
          break;
        }
      }
    }
    if (variantUrl) {
      m3u8Url = variantUrl;
      m3u8Text = await fetchHttpText(m3u8Url);
    }
  }

  // 3. Parse segments and calculate exact cumulative timestamps
  const baseUrl = m3u8Url.substring(0, m3u8Url.lastIndexOf('/') + 1);
  const lines = m3u8Text.split(/\r?\n/);
  const segments = [];
  let currentTime = 0;
  let currentDuration = 10;

  for (const line of lines) {
    if (line.startsWith('#EXTINF:')) {
      const durStr = line.substring(8).split(',')[0].trim();
      currentDuration = parseFloat(durStr) || 10;
    } else if (line && !line.startsWith('#')) {
      const fullUrl = line.startsWith('http') ? line : baseUrl + line;
      segments.push({
        url: fullUrl,
        duration: currentDuration,
        startTime: currentTime,
        endTime: currentTime + currentDuration
      });
      currentTime += currentDuration;
    }
  }

  if (segments.length === 0) {
    broadcast({ type: 'stderr', text: `⚠ [HLS-Native] No media segments found in playlist.\n` });
    return false;
  }

  const startSec = opts.startTime ? hmsToSecs(opts.startTime) : 0;
  const endSec = opts.endTime ? hmsToSecs(opts.endTime) : currentTime;
  const clipDuration = (endSec > startSec) ? (endSec - startSec) : 0;

  // Filter exact segments needed
  const slicedSegs = segments.filter(s => s.endTime >= startSec && s.startTime <= endSec);
  if (slicedSegs.length === 0) {
    broadcast({ type: 'stderr', text: `⚠ [HLS-Native] No segments match the requested time range.\n` });
    return false;
  }

  const leadOffset = Math.max(0, startSec - slicedSegs[0].startTime);

  broadcast({
    type: 'stdout',
    text: `✔ [HLS-Native] Sliced ${slicedSegs.length} chunks (${(slicedSegs.reduce((a, b) => a + b.duration, 0) / 3600).toFixed(2)} hrs). Lead offset: ${leadOffset.toFixed(2)}s\n`
  });

  // 4. Construct local sliced manifest
  let customM3u8 = '#EXTM3U\n#EXT-X-VERSION:3\n#EXT-X-TARGETDURATION:15\n';
  for (const s of slicedSegs) {
    customM3u8 += `#EXTINF:${s.duration.toFixed(3)},\n${s.url}\n`;
  }
  customM3u8 += '#EXT-X-ENDLIST\n';

  const outDir = opts.outputDir || process.cwd();
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  const startTag = opts.startTime ? opts.startTime.replace(/:/g, '.') : '0';
  const endTag = opts.endTime ? opts.endTime.replace(/:/g, '.') : 'end';
  const cleanTitle = (infoJson?.title || 'video').replace(/[/\\?%*:|"<>]/g, '_').trim();
  const finalFilename = `${cleanTitle} [${infoJson?.id || 'clip'}] [${startTag}-${endTag}].mp4`;
  const finalDest = path.join(outDir, finalFilename);

  const manifestPath = path.join(outDir, `temp_hls_slice_${Date.now()}.m3u8`);
  fs.writeFileSync(manifestPath, customM3u8, 'utf8');

  // 5. Spawn FFmpeg to download directly from the sliced manifest
  broadcast({ type: 'stdout', text: `▶ [HLS-Native] Downloading and muxing directly at full speed...\n` });

  const ffmpegArgs = [
    '-y',
    '-protocol_whitelist', 'file,http,https,tcp,tls',
    '-fflags', '+genpts+discardcorrupt'
  ];
  if (leadOffset > 0.05) {
    ffmpegArgs.push('-ss', String(leadOffset));
  }
  ffmpegArgs.push('-i', manifestPath);
  if (clipDuration > 0) {
    ffmpegArgs.push('-t', String(clipDuration));
  }
  ffmpegArgs.push(
    '-c', 'copy',
    '-map', '0:v:0',
    '-map', '0:a:0?',
    '-avoid_negative_ts', 'make_zero',
    finalDest
  );

  let wasKilled = false;
  const code = await new Promise((resolve) => {
    const proc = spawn(ffmpeg, ffmpegArgs, { cwd: outDir });
    activeProcs.set(proc.pid, proc);
    broadcast({ type: 'pid', pid: proc.pid });
    proc.stderr.on('data', (d) => broadcast({ type: 'stdout', text: d.toString() }));
    proc.stdout.on('data', (d) => broadcast({ type: 'stdout', text: d.toString() }));
    proc.on('close', (c) => {
      if (proc._isKilledByUser) wasKilled = true;
      activeProcs.delete(proc.pid);
      resolve(c);
    });
  });

  // Cleanup
  try { if (fs.existsSync(manifestPath)) fs.unlinkSync(manifestPath); } catch (e) { }

  if (wasKilled) {
    try { if (fs.existsSync(finalDest)) fs.unlinkSync(finalDest); } catch (e) { }
    broadcast({ type: 'stdout', text: `\n⏹ [HLS-Native] Process stopped by user.\n` });
    if (!opts.suppressExit) broadcast({ type: 'exit', code: null });
    return true; // Return true to prevent falling back to yt-dlp
  }

  if (code === 0 && fs.existsSync(finalDest) && fs.statSync(finalDest).size > 1000) {
    broadcast({ type: 'stdout', text: `\n✔ [HLS-Native] Clip successfully downloaded and saved to: ${finalDest}\n` });
    if (!opts.suppressExit) broadcast({ type: 'exit', code: 0 });
    return true;
  }
  return false;
}

// 2. yt-dlp Single
async function runYtdlp(opts, broadcast) {
  const isHlsClip = (opts.startTime || opts.endTime) &&
    (opts.url.includes('twitch.tv') || opts.url.includes('kick.com') || opts.url.includes('.m3u8'));

  if (isHlsClip && !opts._fallbackStandard) {
    const ok = await downloadHlsClip(opts, broadcast);
    if (ok) return;
    broadcast({ type: 'stdout', text: `[HLS-Native] Falling back to standard yt-dlp runner...\n` });
  }

  if (opts.url.includes('/community') || opts.url.includes('/posts')) {
    await ensureYpdl(opts.autoYpdl !== false && opts.autoYpdl !== 'false', (msg) => broadcast({ type: 'stdout', text: msg + '\n' }));
    const ypdl = getYpdlPath();
    const cleanUrl = opts.url.replace(/\/community\/?$/, '').replace(/\/posts\/?$/, '');
    const channelName = cleanUrl.split('/').pop();
    const outDir = path.join(opts.outputDir || process.cwd(), `${channelName}_community`);
    if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

    const args = ['-f', outDir, cleanUrl];
    const child = spawnRunner(ypdl, args, { ...opts, suppressExit: true }, broadcast);
    child.on('close', async (code) => {
      if (code === 0 && !child._isKilledByUser) {
        const jsonPath = path.join(outDir, `${channelName}_posts.json`);
        await downloadCommunityImages(jsonPath, broadcast);
      }
      broadcast({ type: 'exit', code: child._isKilledByUser ? null : code });
    });
    return;
  }

  if (opts.getUrl) {
    const ytDlp = getYtdlpPath();
    const args = [opts.url, '-f', opts.format, '-g'];
    if (opts.cookiesPath && fs.existsSync(opts.cookiesPath)) args.push('--cookies', opts.cookiesPath);
    spawnRunner(ytDlp, args, { ...opts, suppressExit: true }, broadcast);
    return;
  }

  await prepareEnv(opts, broadcast);
  const ytDlp = getYtdlpPath();
  const ffmpegPath = getFfmpegPath();
  const args = [
    opts.url,
    '-f', opts.format,
    '--merge-output-format', opts.container || 'mp4',
    '--remote-components', 'ejs:github',
    '--no-part'
  ];
  if (ffmpegPath && ffmpegPath !== 'ffmpeg' && fs.existsSync(ffmpegPath)) {
    args.push('--ffmpeg-location', ffmpegPath);
  }

  if (opts.skipDownload) {
    args.push('--skip-download');
  } else {
    args.push('--embed-metadata');
  }

  let subLangs = [];
  if (opts.dlSubs) {
    args.push('--write-subs', '--write-auto-subs');
    subLangs.push('en');
    if (opts.embedSubs && !opts.skipDownload) {
      args.push('--embed-subs', '--convert-subs', 'srt');
    }
  } else {
    args.push('--no-write-subs');
  }

  if (opts.dlChat) {
    if (!opts.dlSubs) args.push('--write-subs');
    subLangs.push('live_chat');
  }
  if (subLangs.length > 0) {
    args.push('--sub-langs', subLangs.join(','));
  }

  if (opts.dlThumb) {
    args.push('--write-thumbnail');
    if (opts.embedThumb && !opts.skipDownload) args.push('--embed-thumbnail');
  } else {
    args.push('--no-write-thumbnail');
  }

  if (opts.cookiesPath && fs.existsSync(opts.cookiesPath)) args.push('--cookies', opts.cookiesPath);
  let isClip = !!(opts.startTime || opts.endTime);
  if (isClip) {
    const startVal = opts.startTime ? opts.startTime.trim() : '0';
    const endVal = opts.endTime ? opts.endTime.trim() : 'inf';

    args.push('--download-sections', `*${startVal}-${endVal}`);

    // If m3u8 or livestream VOD, apply resilient reconnect args with fast HLS seeking
    if (opts.url.includes('.m3u8') || opts.url.includes('twitch.tv') || opts.url.includes('kick.com')) {
      const includeDiscardcorrupt = !!opts._discardcorruptRetry;
      const fetchFflags = includeDiscardcorrupt ? '+genpts+discardcorrupt+igndts' : '+genpts+igndts';
      args.push('--downloader-args', `ffmpeg_i:-reconnect 1 -reconnect_streamed 1 -reconnect_delay_max 30 -reconnect_on_network_error 1 -reconnect_on_http_error 4xx,5xx -err_detect ignore_err -fflags ${fetchFflags}`);
    }

    // Add exact requested clip tag to filename
    const startTag = opts.startTime ? opts.startTime.replace(/:/g, '.') : '0';
    const endTag = opts.endTime ? opts.endTime.replace(/:/g, '.') : 'end';
    args.push('-o', `%(title)s [%(id)s] [${startTag}-${endTag}].%(ext)s`);
  }
  if (opts.bgutilUrl) {
    args.push('--extractor-args', `youtubepot-bgutilhttp:base_url=${opts.bgutilUrl}`);
  } else if (opts.useDeno === 'y') {
    // If no URL is provided but bgutil is toggled, default to the script mode (Deno)
    // Note: older versions used youtube:po_token=pot:bgutil, but new yt-dlp handles it automatically or via youtubepot-bgutilscript
    args.push('--extractor-args', 'youtube:po_token=pot:bgutil');
  }

  if (opts.extraArgs) args.push(...opts.extraArgs);

  if (isChannelOrPlaylist(opts.url)) {
    opts.tempDir = path.join(opts.outputDir, getChannelFolderName(opts.url));
    opts.keepTemp = true;
  } else {
    opts.tempDir = path.join(opts.outputDir, getFolderName(opts.url));
    opts.keepTemp = false;
  }
  const childOpts = { ...opts };
  if (opts.autoRepair || opts.startTime || opts.endTime) childOpts.suppressExit = true;

  let downloadedFilePath = null;
  let downloadedMediaDuration = 0;
  let needsRepair = false;

  const child = spawnRunner(ytDlp, args, childOpts, broadcast);

  const captureOutput = (d) => {
    const text = d.toString();
    if (text.includes('Initialization fragment found after media fragments')) {
      needsRepair = true;
    }
    const timeMatches = text.matchAll(/time=(\d+:\d+:\d+(?:\.\d+)?)/g);
    for (const m of timeMatches) {
      const t = hmsToSecs(m[1]);
      if (t > downloadedMediaDuration) downloadedMediaDuration = t;
    }
    const dest = text.match(/\[download\]\s+Destination:\s+(.+)/i) ||
      text.match(/\[Merger\]\s+Merging formats into "(.+?)"/i) ||
      text.match(/\[download\]\s+(.+?)\s+has already been downloaded/i);
    if (dest && dest[1]) {
      const p = dest[1].trim();
      downloadedFilePath = path.isAbsolute(p) ? p : path.join(opts.tempDir || opts.outputDir, p);
    }
  };

  child.stdout.on('data', captureOutput);
  child.stderr.on('data', captureOutput);

  child.on('close', async (code) => {
    if (child._isKilledByUser) return;

    if (code !== 0 && opts.autoRepair && needsRepair) {
      broadcast({ type: 'stdout', text: `\n▶ [Auto-Repair] Initialization fragment error detected. Triggering repair sequence...\n` });
      await interceptYtdlpAutoRepair(opts, broadcast);
      return;
    }

    if (code !== 0 && (opts.startTime || opts.endTime) && !opts._discardcorruptRetry) {
      await runYtdlp({ ...opts, _discardcorruptRetry: true }, broadcast);
      return;
    }

    const searchDir = opts.tempDir || opts.outputDir;
    let recoveredFile = await resolveTempFiles(searchDir);
    if (recoveredFile) {
      broadcast({ type: 'stdout', text: `\n✔ [Windows File Lock Recovery] Successfully finalized ${path.basename(recoveredFile)}\n` });
      code = 0;
    }

    if (code === 0 && (opts.startTime || opts.endTime)) {
      let targetFile = recoveredFile || downloadedFilePath;
      if (!targetFile || !fs.existsSync(targetFile)) {
        if (fs.existsSync(searchDir)) {
          const files = fs.readdirSync(searchDir);
          const vFile = files.find(f => (f.endsWith('.mp4') || f.endsWith('.mkv') || f.endsWith('.webm') || f.endsWith('.ts')) && !f.includes('.temp') && !f.includes('smartcut_'));
          if (vFile) targetFile = path.join(searchDir, vFile);
        }
      }
      if (targetFile && fs.existsSync(targetFile)) {
        const finalDest = path.join(opts.outputDir, path.basename(targetFile));

        const startSec = opts.startTime ? hmsToSecs(opts.startTime) : 0;
        const endSec = opts.endTime ? hmsToSecs(opts.endTime) : 0;
        const clipDuration = (endSec > startSec) ? (endSec - startSec) : 0;

        const isInsideTemp = opts.tempDir && path.resolve(targetFile).startsWith(path.resolve(opts.tempDir));

        if (isInsideTemp) {
          const cutCode = await smartCutClip(targetFile, finalDest, clipDuration, broadcast);
          if (cutCode === 0 && fs.existsSync(finalDest) && fs.statSync(finalDest).size > 1000) {
            broadcast({ type: 'stdout', text: `\n✔ [Smart-Cut] Video successfully processed and saved to ${finalDest}\n` });
            try { fs.rmSync(opts.tempDir, { recursive: true, force: true }); } catch (e) { }
          } else {
            broadcast({ type: 'stderr', text: `\n⚠ [Smart-Cut] Smart-Cut returned code ${cutCode}, moving original file.\n` });
            await moveFilesUp(opts.tempDir, opts.outputDir);
          }
        } else {
          // If already in outputDir, run smartCutClip to a temp file then safe-replace
          const tempDest = path.join(opts.outputDir, `smartcut_final_${Date.now()}_${path.basename(targetFile)}`);
          const cutCode = await smartCutClip(targetFile, tempDest, clipDuration, broadcast);
          if (cutCode === 0 && fs.existsSync(tempDest) && fs.statSync(tempDest).size > 1000) {
            await safeReplaceFile(tempDest, finalDest);
            broadcast({ type: 'stdout', text: `\n✔ [Smart-Cut] Video successfully processed and saved to ${finalDest}\n` });
          } else {
            await fixTimestamps(targetFile, broadcast);
          }
        }
      }
    }

    if (code === 0 && opts.tempDir && !opts.keepTemp && fs.existsSync(opts.tempDir)) {
      await moveFilesUp(opts.tempDir, opts.outputDir);
    }

    if (!opts.suppressExit) {
      broadcast({ type: 'exit', code });
    }
  });
}

// 3. Batch Downloader
async function runBatch(opts, broadcast) {
  await prepareEnv(opts, broadcast);
  const ytDlp = getYtdlpPath();

  // We handle batch downloading recursively in JS to allow for the rest intervals
  let urls = (opts.urls || []).map(u => ({ url: u, isRetry: false }));
  let restTime = parseInt(opts.rest) || 0;
  let batchTotal = urls.length;
  let completedCount = 0;

  // Create a recursive function to process the queue
  async function processQueue() {
    // Read any new urls added to queue_additions.txt
    try {
      const qFile = path.join(opts.outputDir, 'queue_additions.txt');
      if (fs.existsSync(qFile)) {
        const added = fs.readFileSync(qFile, 'utf-8').split('\n').filter(u => u.trim());
        urls.push(...added.map(u => ({ url: u, isRetry: false })));
        batchTotal += added.length;
        fs.unlinkSync(qFile);
        broadcast({ type: 'stdout', text: `\n[Batch] Added ${added.length} new URLs from queue.\n` });
      }
    } catch (e) { }

    // Check for updated rest state
    try {
      const rFile = path.join(opts.outputDir, 'rest_state.txt');
      if (fs.existsSync(rFile)) {
        const newRest = parseInt(fs.readFileSync(rFile, 'utf-8'));
        if (!isNaN(newRest)) restTime = newRest;
        fs.unlinkSync(rFile);
      }
    } catch (e) { }

    if (urls.length === 0) {
      broadcast({ type: 'stdout', text: `\n[Batch] Queue empty. Done.\n` });
      broadcast({ type: 'exit', code: 0 });
      return;
    }

    const currentJob = urls.shift();
    const currentUrl = currentJob.url;
    completedCount++;
    broadcast({ type: 'stdout', text: `\n[${completedCount}/${batchTotal}] Processing: ${currentUrl}\n` });

    if (currentUrl.includes('/community') || currentUrl.includes('/posts')) {
      await ensureYpdl(opts.autoYpdl !== false && opts.autoYpdl !== 'false', (msg) => broadcast({ type: 'stdout', text: msg + '\n' }));
      const ypdl = getYpdlPath();
      const cleanUrl = currentUrl.replace(/\/community\/?$/, '').replace(/\/posts\/?$/, '');
      const channelName = cleanUrl.split('/').pop();
      const outDir = path.join(opts.outputDir || process.cwd(), `${channelName}_community`);
      if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

      const args = ['-f', outDir, cleanUrl];
      const child = spawnRunner(ypdl, args, { ...opts, suppressExit: true }, broadcast);

      child.on('close', async (code) => {
        if (child._isKilledByUser) {
          broadcast({ type: 'stdout', text: '\n[Batch] Stopped by user.\n' });
          broadcast({ type: 'exit', code: null });
        } else {
          if (code === 0) {
            const jsonPath = path.join(outDir, `${channelName}_posts.json`);
            await downloadCommunityImages(jsonPath, broadcast);
          }
          if (restTime > 0 && urls.length > 0) {
            broadcast({ type: 'stdout', text: `\n[Batch] Resting for ${restTime} seconds...\n` });
            const timer = setTimeout(processQueue, restTime * 1000);
            activeProcs.set('batch_rest', { kill: () => clearTimeout(timer) });
          } else {
            processQueue();
          }
        }
      });
      return;
    }

    const handleNextBatchItem = (wasSkippedLive, currentJob, currentUrl) => {
      if (urls.length > 0) {
        if (wasSkippedLive && !currentJob.isRetry) {
          processQueue();
        } else if (restTime > 0) {
          broadcast({ type: 'stdout', text: `\n[Batch] Waiting ${restTime} minutes before next download...\n` });
          broadcast({ type: 'rest-start', minutes: restTime });
          let elapsed = 0;
          let totalMs = restTime * 60 * 1000;

          const intervalId = setInterval(() => {
            try {
              const sFile = path.join(opts.outputDir, 'skip_rest.txt');
              if (fs.existsSync(sFile)) {
                fs.unlinkSync(sFile);
                clearInterval(intervalId);
                activeProcs.delete(restPid);
                broadcast({ type: 'stdout', text: `\n[Batch] Rest skipped.\n` });
                broadcast({ type: 'rest-end' });
                processQueue();
                return;
              }
            } catch (e) { }
            try {
              const rFile = path.join(opts.outputDir, 'rest_state.txt');
              if (fs.existsSync(rFile)) {
                const newRest = parseInt(fs.readFileSync(rFile, 'utf-8'));
                fs.unlinkSync(rFile);
                if (!isNaN(newRest)) {
                  restTime = newRest;
                  if (newRest === 0) {
                    clearInterval(intervalId);
                    activeProcs.delete(restPid);
                    broadcast({ type: 'stdout', text: `\n[Batch] Rest disabled. Continuing...\n` });
                    broadcast({ type: 'rest-end' });
                    processQueue();
                    return;
                  }
                  totalMs = newRest * 60 * 1000;
                }
              }
            } catch (e) { }
            elapsed += 1000;
            if (elapsed >= totalMs) {
              clearInterval(intervalId);
              activeProcs.delete(restPid);
              broadcast({ type: 'rest-end' });
              processQueue();
            }
          }, 1000);

          const restPid = -Date.now();
          activeProcs.set(restPid, {
            kill: () => {
              clearInterval(intervalId);
              activeProcs.delete(restPid);
              broadcast({ type: 'rest-end' });
            }
          });
          broadcast({ type: 'pid', pid: restPid });
        } else {
          const isYt = (u) => u.includes('youtube.com') || u.includes('youtu.be');
          if (isYt(currentUrl) && isYt(urls[0].url)) {
            broadcast({ type: 'stdout', text: `\n[Batch] Auto-resting 5 seconds between YouTube downloads...\n` });
            const timer = setTimeout(processQueue, 5000);
            const restPid = -Date.now();
            activeProcs.set(restPid, { kill: () => clearTimeout(timer) });
          } else {
            processQueue();
          }
        }
      } else {
        broadcast({ type: 'exit', code: 0 });
      }
    };

    if (await interceptYtdlpAutoRepair({ ...opts, url: currentUrl, suppressExit: true }, broadcast)) {
      handleNextBatchItem(false, currentJob, currentUrl);
      return;
    }

    const ytDlp = getYtdlpPath();
    const ffmpegPath = getFfmpegPath();
    const args = [
      currentUrl,
      '-f', opts.format,
      '--merge-output-format', opts.container || 'mp4',
      '--ffmpeg-location', ffmpegPath,
      '--remote-components', 'ejs:github',
      '--no-part',
      '--downloader-args', 'ffmpeg_i:-hwaccel auto',
      '--postprocessor-args', 'ffmpeg_i:-hwaccel auto'
    ];

    if (opts.skipDownload) {
      args.push('--skip-download');
    } else {
      args.push('--embed-metadata');
    }

    let subLangs = [];
    if (opts.dlSubs) {
      args.push('--write-subs', '--write-auto-subs');
      subLangs.push('en');
      if (opts.embedSubs && !opts.skipDownload) {
        args.push('--embed-subs', '--convert-subs', 'srt');
      }
    } else {
      args.push('--no-write-subs');
    }

    if (opts.dlChat) {
      if (!opts.dlSubs) args.push('--write-subs');
      subLangs.push('live_chat');
    }
    if (subLangs.length > 0) {
      args.push('--sub-langs', subLangs.join(','));
    }

    if (opts.dlThumb) {
      args.push('--write-thumbnail');
      if (opts.embedThumb && !opts.skipDownload) args.push('--embed-thumbnail');
    } else {
      args.push('--no-write-thumbnail');
    }

    if (opts.skipLive) args.push('--match-filter', '!is_live');
    if (opts.cookiesPath && fs.existsSync(opts.cookiesPath)) args.push('--cookies', opts.cookiesPath);

    if (opts.bgutilUrl) {
      args.push('--extractor-args', `youtubepot-bgutilhttp:base_url=${opts.bgutilUrl}`);
    } else if (opts.useDeno === 'y') {
      args.push('--extractor-args', 'youtube:po_token=pot:bgutil');
    }

    if (opts.extraArgs) args.push(...opts.extraArgs);

    let tempDir;
    if (isChannelOrPlaylist(currentUrl)) {
      tempDir = path.join(opts.outputDir, getChannelFolderName(currentUrl));
      opts.keepTemp = true;
    } else {
      tempDir = path.join(opts.outputDir, getFolderName(currentUrl));
      opts.keepTemp = false;
    }
    opts.tempDir = tempDir;

    if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });

    const child = spawn(ytDlp, args, { cwd: tempDir, stdio: ['pipe', 'pipe', 'pipe'], env: baseEnv });
    activeProcs.set(child.pid, child);
    broadcast({ type: 'pid', pid: child.pid });


    let wasSkippedLive = false;
    let needsRepair = false;
    child.stdout.on('data', (d) => {
      const text = d.toString();
      if (text.includes('does not pass filter !is_live')) wasSkippedLive = true;
      broadcast({ type: 'stdout', text });
    });
    child.stderr.on('data', (d) => {
      const text = d.toString();
      if (text.includes('Initialization fragment found after media fragments')) needsRepair = true;
      broadcast({ type: 'stderr', text });
    });

    child.on('close', async (code) => {
      activeProcs.delete(child.pid);
      if (child._isKilledByUser) {
        broadcast({ type: 'exit', code: null });
        return;
      }

      let isRepaired = false;
      if (code !== 0 && needsRepair && opts.autoRepair) {
        broadcast({ type: 'stdout', text: `\n▶ [Auto-Repair] Initialization fragment error detected in Batch. Triggering repair sequence...\n` });
        isRepaired = await interceptYtdlpAutoRepair({ ...opts, url: currentUrl, suppressExit: true }, broadcast);
      }

      if (!wasSkippedLive && (code === 0 || isRepaired)) {
        await moveFilesUp(tempDir, opts.outputDir);
      }

      if (wasSkippedLive) {
        if (!currentJob.isRetry) {
          urls.push({ url: currentUrl, isRetry: true });
          completedCount--; // Revert completion tick
          broadcast({ type: 'stdout', text: `\n[Batch] Stream is live. Pushed to the end of the queue.\n` });
        } else {
          fs.appendFileSync(path.join(opts.outputDir, 'failed.txt'), currentUrl + '\n');
          broadcast({ type: 'stdout', text: `\n[Batch] Stream is STILL live. Skipped and logged to failed.txt.\n` });
        }
      }

      handleNextBatchItem(wasSkippedLive, currentJob, currentUrl);
    });

    child.on('error', (err) => {
      broadcast({ type: 'error', text: err.message });
      broadcast({ type: 'exit', code: 1 });
    });
  }

  processQueue();
}

function getFfmpegEncodeArgs(opts) {
  let args = [];
  const encode = opts.encode;

  if (encode) {
    let codec = opts.codec || 'auto';
    if (codec === 'auto') {
      codec = getBestVideoEncoder(getFfmpegPath());
    }
    const quality = opts.quality || 'medium';
    const isNvenc = codec.includes('nvenc');
    const isAmf = codec.includes('amf');
    const isQsv = codec.includes('qsv');
    const isHevc = codec.includes('265') || codec.includes('hevc');

    args.push('-c:v', codec);

    let cq = '24', crf = isHevc ? '26' : '23';
    if (quality === 'lossless') { cq = '0'; crf = '0'; }
    else if (quality === 'near-lossless') { cq = '10'; crf = isHevc ? '14' : '12'; }
    else if (quality === 'high') { cq = '18'; crf = isHevc ? '20' : '18'; }
    else if (quality === 'medium') { cq = '24'; crf = isHevc ? '26' : '23'; }
    else if (quality === 'low') { cq = '30'; crf = isHevc ? '32' : '28'; }

    if (quality === 'lossless') {
      if (isNvenc) args.push('-rc', 'lossless');
      else if (isAmf) args.push('-rc', 'cqp', '-qp_i', '0', '-qp_p', '0', '-qp_b', '0');
      else if (isQsv) args.push('-global_quality', '1');
      else args.push('-crf', '0', '-preset', 'veryslow');
    } else if (quality === 'custom') {
      if (opts.bitrate && opts.bitrate !== 'source') args.push('-b:v', opts.bitrate);
    } else {
      if (isNvenc) args.push('-rc', 'vbr', '-cq', cq, '-preset', 'p4');
      else if (isAmf) args.push('-rc', 'cqp', '-qp_i', cq, '-qp_p', cq, '-qp_b', cq);
      else if (isQsv) args.push('-global_quality', cq);
      else args.push('-crf', crf, '-preset', 'medium');
    }

    if (opts.resolution && opts.resolution !== 'source') args.push('-s', opts.resolution);
    if (opts.fps && opts.fps !== 'source') args.push('-r', opts.fps);
    args.push('-c:a', 'aac');
    if (opts.audioBitrate && opts.audioBitrate !== 'source') args.push('-b:a', opts.audioBitrate);
  } else {
    args.push('-c', 'copy');
  }
  return args;
}

// 4. M3U8 Downloader
async function runM3u8(opts, broadcast) {
  if (opts.installFfmpeg) await ensureFfmpeg(opts.ffmpegVersion, (msg) => broadcast({ type: 'stdout', text: msg + '\n' }));
  const ffmpeg = getFfmpegPath();
  opts.outputDir = opts.outputDir || process.cwd();

  // Format ffmpeg args
  const url = opts.url;
  let output;
  if (opts.startTime || opts.endTime) {
    const startTag = opts.startTime ? opts.startTime.replace(/:/g, '.') : '0';
    const endTag = opts.endTime ? opts.endTime.replace(/:/g, '.') : 'end';
    output = `download_${Date.now()}_[${startTag}-${endTag}].${opts.container || 'mp4'}`;
  } else {
    output = `download_${Date.now()}.${opts.container || 'mp4'}`;
  }

  if (opts.autoRepair && url.startsWith('http')) {
    broadcast({ type: 'stdout', text: '▶ [Auto-Repair] Fetching M3U8 manifest...\n' });
    try {
      const manifest = await new Promise((resolve, reject) => {
        https.get(url, (res) => {
          let data = '';
          res.on('data', chunk => data += chunk);
          res.on('end', () => resolve(data));
        }).on('error', reject);
      });

      const lines = manifest.split('\n');
      const parts = [];
      let currentPart = [];
      const baseUrl = url.substring(0, url.lastIndexOf('/') + 1);

      for (let line of lines) {
        line = line.trim();
        if (!line) continue;
        if (line.startsWith('#EXT-X-MAP:URI=')) {
          if (currentPart.length > 0 && currentPart.some(l => l.endsWith('.mp4') || l.endsWith('.ts'))) {
            parts.push(currentPart);
          }
          currentPart = ['#EXTM3U', '#EXT-X-VERSION:3', '#EXT-X-TARGETDURATION:10'];
          let mapUrl = line.split('"')[1];
          if (!mapUrl.startsWith('http')) mapUrl = baseUrl + mapUrl;
          currentPart.push(`#EXT-X-MAP:URI="${mapUrl}"`);
          continue;
        }

        if (line.match(/^[0-9a-zA-Z\-_]+(\.mp4|\.ts)/) && !line.startsWith('http')) {
          currentPart.push(baseUrl + line);
        } else {
          if (currentPart.length > 0 && !line.startsWith('#EXTM3U') && !line.startsWith('#EXT-X-VERSION') && !line.startsWith('#EXT-X-TARGETDURATION')) {
            currentPart.push(line);
          }
        }
      }
      if (currentPart.length > 0) parts.push(currentPart);

      if (parts.length > 1) {
        broadcast({ type: 'stdout', text: `▶ [Auto-Repair] Found mid-stream resets. Sliced into ${parts.length} parts.\n` });
        const partFiles = [];
        const tempFiles = [];

        for (let i = 0; i < parts.length; i++) {
          const partM3u8 = path.join(opts.outputDir, `part_${Date.now()}_${i}.m3u8`);
          const partMp4 = path.join(opts.outputDir, `part_${Date.now()}_${i}.mp4`);
          fs.writeFileSync(partM3u8, parts[i].join('\n'));
          partFiles.push(partMp4);
          tempFiles.push(partM3u8, partMp4);

          broadcast({ type: 'stdout', text: `\n▶ [Auto-Repair] Downloading Part ${i + 1}/${parts.length}...\n` });
          const pArgs = ['-y', '-hwaccel', 'auto'];
          if (opts.cookiesPath && fs.existsSync(opts.cookiesPath)) pArgs.push('-cookies', `file ${opts.cookiesPath.replace(/\\/g, '/')}`);
          pArgs.push('-allowed_extensions', 'ALL', '-protocol_whitelist', 'file,http,https,tcp,tls,crypto');
          pArgs.push('-i', partM3u8, '-c', 'copy', partMp4);

          const code = await new Promise((resolve) => {
            const child = spawnRunner(ffmpeg, pArgs, { ...opts, suppressExit: true }, broadcast);
            if (!child) resolve(1);
            else child.on('close', resolve);
          });

          if (code !== 0) {
            broadcast({ type: 'error', text: `Failed downloading part ${i + 1}.` });
            broadcast({ type: 'exit', code });
            return;
          }
        }

        broadcast({ type: 'stdout', text: `\n▶ [Auto-Repair] Concatenating parts into final video...\n` });
        const concatList = path.join(opts.outputDir, `concat_${Date.now()}.txt`);
        fs.writeFileSync(concatList, partFiles.map(f => `file '${f.replace(/\\/g, '/').replace(/'/g, "'\\''")}'`).join('\n'));
        tempFiles.push(concatList);

        let finalArgs = ['-y', '-hwaccel', 'auto', '-f', 'concat', '-safe', '0', '-i', concatList];
        if (opts.startTime) finalArgs.push('-ss', opts.startTime);
        if (opts.endTime) finalArgs.push('-to', opts.endTime);
        finalArgs.push(...getFfmpegEncodeArgs(opts));
        finalArgs.push('-max_muxing_queue_size', '4096', '-ignore_unknown', output);

        const finalCode = await new Promise((resolve) => {
          const child = spawnRunner(ffmpeg, finalArgs, { ...opts, suppressExit: true }, broadcast);
          if (!child) resolve(1);
          else child.on('close', resolve);
        });

        broadcast({ type: 'stdout', text: `\n▶ [Auto-Repair] Cleaning up temporary files...\n` });
        for (const f of tempFiles) {
          try { if (fs.existsSync(f)) fs.unlinkSync(f); } catch (e) { }
        }

        if (!opts.suppressExit) broadcast({ type: 'exit', code: finalCode });
        return;
      } else {
        broadcast({ type: 'stdout', text: `▶ [Auto-Repair] No mid-stream resets found. Proceeding normally...\n\n` });
      }
    } catch (err) {
      broadcast({ type: 'stdout', text: `▶ [Auto-Repair] Failed to fetch/parse M3U8: ${err.message}. Proceeding normally...\n\n` });
    }
  }

  let args = ['-y', '-hwaccel', 'auto'];

  if (url.startsWith('http')) {
    args.push(
      '-reconnect', '1',
      '-reconnect_streamed', '1',
      '-reconnect_delay_max', '60',
      '-reconnect_on_http_error', '4xx,5xx',
      '-reconnect_on_network_error', '1',
      '-rw_timeout', '30000000'
    );
  }

  if (opts.cookiesPath && fs.existsSync(opts.cookiesPath)) {
    args.push('-cookies', `file ${opts.cookiesPath.replace(/\\/g, '/')}`);
  }

  // Resilience flags for HLS streams with mid-stream init segments / discontinuities
  args.push('-fflags', '+genpts+discardcorrupt+igndts');
  args.push('-err_detect', 'ignore_err');
  args.push('-analyzeduration', '100000000');  // 100s — give ffmpeg time to understand complex streams
  args.push('-probesize', '100000000');         // 100MB — probe enough data to detect all stream params

  if (opts.startTime) args.push('-ss', opts.startTime);
  if (opts.endTime) args.push('-to', opts.endTime);

  // If local file, allow all extensions
  if (!url.startsWith('http')) {
    args.push('-allowed_extensions', 'ALL', '-protocol_whitelist', 'file,http,https,tcp,tls,crypto');
  }

  args.push('-i', url);

  args.push(...getFfmpegEncodeArgs(opts));

  if (opts.startTime || opts.endTime) {
    args.push('-avoid_negative_ts', 'make_zero');
  }

  args.push('-max_muxing_queue_size', '4096', '-ignore_unknown', output);

  opts.outputDir = opts.outputDir || process.cwd();
  spawnRunner(ffmpeg, args, opts, broadcast);
}

// 5. gallery-dl (Python script port to CLI)
async function runGalleryDl(opts, broadcast) {
  const { getGallerydlPath, ensureGallerydl } = require('./ensure-gallerydl');
  await ensureGallerydl(true, (msg) => broadcast({ type: 'stdout', text: msg + '\n' }));
  const bin = getGallerydlPath();

  const args = [opts.url];
  if (opts.cookiesPath && fs.existsSync(opts.cookiesPath)) args.push('--cookies', opts.cookiesPath);
  if (opts.filetypes && opts.filetypes.trim().toLowerCase() !== 'all') {
    args.push('--filter', `extension in (${opts.filetypes.split(',').map(s => `'${s.trim()}'`).join(',')})`);
  }
  if (opts.metadata) args.push('--write-metadata');

  spawnRunner(bin, args, opts, broadcast);
}

// 6. Splitter
async function runSplitter(opts, broadcast) {
  if (opts.installFfmpeg) await ensureFfmpeg(opts.ffmpegVersion, (msg) => broadcast({ type: 'stdout', text: msg + '\n' }));
  const ffmpeg = getFfmpegPath();

  const ext = path.extname(opts.file);
  const base = path.basename(opts.file, ext);
  const outDir = opts.outputDir || path.dirname(opts.file);
  const parts = parseInt(opts.parts) || 2;

  let partsToSaveSet = new Set();
  if (typeof opts.partsToSave === 'string' && opts.partsToSave.trim()) {
    const tokens = opts.partsToSave.split(',').map(s => s.trim()).filter(Boolean);
    for (const t of tokens) {
      if (t.includes('-')) {
        let [s, e] = t.split('-').map(Number);
        if (s && e && s <= e) {
          for (let i = s; i <= e; i++) partsToSaveSet.add(i - 1);
        }
      } else {
        const n = parseInt(t);
        if (n && n > 0) partsToSaveSet.add(n - 1);
      }
    }
  }

  if (partsToSaveSet.size === 0) {
    for (let i = 0; i < parts; i++) partsToSaveSet.add(i);
  }

  const savedPartsList = Array.from(partsToSaveSet).map(i => i + 1).sort((a, b) => a - b).join(', ');
  broadcast({ type: 'stdout', text: `Splitting ${base}${ext} into ${parts} parts (saving parts: ${savedPartsList})...\n` });

  // Note: a real splitter needs ffprobe to get duration, then ffmpeg -ss -t.
  // We'll write a simple script wrapper later or do it inline here.
  // For simplicity:
  const ffprobe = path.join(path.dirname(ffmpeg), os.platform() === 'win32' ? 'ffprobe.exe' : 'ffprobe');
  const { exec } = require('child_process');
  const duration = await new Promise((resolve) => {
    exec(`"${ffprobe}" -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${opts.file}"`, { encoding: 'utf-8' }, (err, stdout) => {
      resolve(parseFloat((stdout || '').trim()));
    });
  });

  if (isNaN(duration)) {
    broadcast({ type: 'error', text: 'Could not determine video duration.\n' });
    broadcast({ type: 'exit', code: 1 });
    return;
  }

  const partDuration = duration / parts;

  let splitTimestamps = [];
  const fmt = (s) => {
    const h = Math.floor(s / 3600).toString().padStart(2, '0');
    const m = Math.floor((s % 3600) / 60).toString().padStart(2, '0');
    const sec = Math.floor(s % 60).toString().padStart(2, '0');
    return `${h}:${m}:${sec}`;
  };

  for (let i = 0; i < parts; i++) {
    const start = i * partDuration;
    const end = (i === parts - 1) ? duration : (start + partDuration);
    splitTimestamps.push(`${fmt(start)} - ${fmt(end)} Part ${i + 1}`);
  }

  require('fs').writeFileSync(path.join(outDir, `${base}.txt`), splitTimestamps.join('\n'));
  broadcast({ type: 'stdout', text: `\nCreated timestamp file: ${base}.txt\n` });

  let success = true;

  // Sequential split to avoid overwhelming system
  for (let i = 0; i < parts; i++) {
    if (!partsToSaveSet.has(i)) continue;

    const start = i * partDuration;
    const output = path.join(outDir, `${base}_part${i + 1}${opts.containerFormat ? '.' + opts.containerFormat : ext}`);

    broadcast({ type: 'stdout', text: `Extracting part ${i + 1}/${parts} [start: ${start.toFixed(2)}s, duration: ${partDuration.toFixed(2)}s]\n` });

    const args = ['-y', '-i', opts.file, '-ss', String(start), '-t', String(partDuration), '-c', 'copy', output];
    const child = spawn(ffmpeg, args, { stdio: ['ignore', 'ignore', 'pipe'], env: baseEnv });
    activeProcs.set(child.pid, child);
    broadcast({ type: 'pid', pid: child.pid });

    child.stderr.on('data', (data) => {
      broadcast({ type: 'stderr', text: data.toString() });
    });

    await new Promise(resolve => {
      child.on('close', code => {
        activeProcs.delete(child.pid);
        if (child._isKilledByUser) { success = false; broadcast({ type: 'exit', code: null }); return; }
        if (code !== 0) success = false;
        resolve();
      });
    });

    if (!success) break;
  }

  broadcast({ type: 'stdout', text: success ? '\nDone.\n' : '\nFailed.\n' });
  broadcast({ type: 'exit', code: success ? 0 : 1 });
}

// 7. Concatenator
async function runConcatenator(opts, broadcast) {
  if (opts.installFfmpeg) await ensureFfmpeg(opts.ffmpegVersion, (msg) => broadcast({ type: 'stdout', text: msg + '\n' }));
  const ffmpeg = getFfmpegPath();

  opts.outputDir = opts.outputDir || path.dirname(opts.files[0]);

  // Generate timestamps file
  const ffprobe = path.join(path.dirname(ffmpeg), os.platform() === 'win32' ? 'ffprobe.exe' : 'ffprobe');
  let timestamps = [];
  let currentTime = 0;

  for (const file of opts.files) {
    try {
      const out = require('child_process').execSync(`"${ffprobe}" -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${file}"`, { encoding: 'utf-8' });
      const duration = parseFloat(out.trim());
      if (isNaN(duration)) throw new Error('NaN');

      const fmt = (s) => {
        const h = Math.floor(s / 3600).toString().padStart(2, '0');
        const m = Math.floor((s % 3600) / 60).toString().padStart(2, '0');
        const sec = Math.floor(s % 60).toString().padStart(2, '0');
        return `${h}:${m}:${sec}`;
      };

      const startFmt = fmt(currentTime);
      currentTime += duration;
      const endFmt = fmt(currentTime);
      timestamps.push(`${startFmt} - ${endFmt}`);
    } catch (e) {
      timestamps.push(`[Unknown] - [Unknown]`);
    }
  }

  if (timestamps.length > 0) {
    const ext = path.extname(opts.output);
    const base = path.basename(opts.output, ext);
    const txtPath = path.join(opts.outputDir, `${base}.txt`);
    require('fs').writeFileSync(txtPath, timestamps.join('\n'));
    broadcast({ type: 'stdout', text: `\n[Concatenator] Created timestamp file: ${base}.txt\n` });
  }

  if (opts.forceEncode) {
    const encoder = getBestVideoEncoder(ffmpeg);
    broadcast({ type: 'stdout', text: `\n[Concatenator] Force re-encode enabled. Using encoder: ${encoder}\n` });

    // Use filter_complex to allow merging files with different resolutions/codecs
    const args = ['-y'];
    opts.files.forEach(f => { args.push('-i', f); });

    let filter = '';
    for (let i = 0; i < opts.files.length; i++) {
      filter += `[${i}:v:0][${i}:a:0]`;
    }
    filter += `concat=n=${opts.files.length}:v=1:a=1[v][a]`;

    let cq = '28', crf = '27';
    if (opts.quality === 'high') { cq = '24'; crf = '23'; }
    else if (opts.quality === 'low') { cq = '32'; crf = '31'; }

    let vargs = ['-c:v', encoder, '-preset', 'fast'];
    if (encoder.includes('nvenc')) {
      vargs.push('-rc', 'vbr', '-cq', cq, '-b:v', '0');
    } else if (encoder.includes('amf')) {
      vargs.push('-rc', 'cqp', '-qp_i', cq, '-qp_p', cq, '-qp_b', cq);
    } else if (encoder.includes('qsv')) {
      vargs.push('-global_quality', cq);
    } else {
      vargs.push('-crf', crf);
    }

    args.push('-filter_complex', filter, '-map', '[v]', '-map', '[a]', ...vargs, '-c:a', 'aac', opts.output);
    const child = spawnRunner(ffmpeg, args, opts, broadcast);
  } else if (opts.useMkvFix) {
    // Intermediate MKV workflow for lossless stream copy
    const tempDir = path.join(opts.outputDir, 'concat_temp_' + Date.now());
    if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });

    let mkvFiles = [];
    let ok = true;

    for (let i = 0; i < opts.files.length; i++) {
      const file = opts.files[i];
      const mkvFile = path.join(tempDir, `part_${i}.mkv`);
      mkvFiles.push(mkvFile);

      broadcast({ type: 'stdout', text: `\n[Concatenator] Preparing part ${i + 1}/${opts.files.length} (normalizing timestamps to MKV)...\n` });

      const args = ['-y', '-i', file, '-c', 'copy', mkvFile];
      const child = spawn(ffmpeg, args, { cwd: opts.outputDir, stdio: ['ignore', 'pipe', 'pipe'], env: baseEnv });
      activeProcs.set(child.pid, child);

      child.stdout.on('data', (data) => broadcast({ type: 'stdout', text: data.toString() }));
      child.stderr.on('data', (data) => broadcast({ type: 'stderr', text: data.toString() }));

      await new Promise(resolve => {
        child.on('close', code => {
          activeProcs.delete(child.pid);
          if (child._isKilledByUser || code !== 0) ok = false;
          resolve();
        });
      });

      if (!ok) break;
    }

    if (!ok) {
      broadcast({ type: 'error', text: '\nPreparation of files failed or was stopped.\n' });
      broadcast({ type: 'exit', code: 1 });
      try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch (e) { }
      return;
    }

    broadcast({ type: 'stdout', text: `\n[Concatenator] Merging MKV files...\n` });
    const listFile = path.join(tempDir, 'concat_list.txt');
    const fileLines = mkvFiles.map(f => `file '${f.replace(/'/g, "'\\''")}'`).join('\n');
    fs.writeFileSync(listFile, fileLines);

    const args = ['-y', '-fflags', '+genpts', '-f', 'concat', '-safe', '0', '-i', listFile, '-c', 'copy', opts.output];
    const child = spawnRunner(ffmpeg, args, opts, broadcast);

    child.on('close', () => {
      try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch (e) { }
    });
  } else {
    // Direct lossless stream copy using advanced timestamp correction flags
    const listFile = path.join(opts.outputDir, 'concat_list_' + Date.now() + '.txt');
    const fileLines = opts.files.map(f => `file '${f.replace(/'/g, "'\\''")}'`).join('\n');
    fs.writeFileSync(listFile, fileLines);

    broadcast({ type: 'stdout', text: `\n[Concatenator] Merging files directly (ignoring DTS gaps)...\n` });

    const args = ['-y', '-fflags', '+genpts+igndts', '-f', 'concat', '-safe', '0', '-i', listFile, '-c', 'copy', opts.output];
    const child = spawnRunner(ffmpeg, args, opts, broadcast);

    child.on('close', () => {
      try { fs.unlinkSync(listFile) } catch (e) { }
    });
  }
}

// 8. Encoder
async function runEncoder(opts, broadcast) {
  if (opts.installFfmpeg) await ensureFfmpeg(opts.ffmpegVersion, (msg) => broadcast({ type: 'stdout', text: msg + '\n' }));
  const ffmpeg = getFfmpegPath();

  opts.outputDir = opts.outputDir || path.dirname(opts.files[0]);

  for (const file of opts.files) {
    const ext = path.extname(file);
    const base = path.basename(file, ext);
    const output = path.join(opts.outputDir, `${base}_encoded.mp4`);

    broadcast({ type: 'stdout', text: `Encoding ${base}${ext} -> ${base}_encoded.mp4...\n` });
    const args = ['-y', '-i', file];

    let resolvedVcodec = opts.vcodec;
    if (resolvedVcodec === 'auto') {
      resolvedVcodec = getBestVideoEncoder(ffmpeg);
      broadcast({ type: 'stdout', text: `Auto-resolved video codec to: ${resolvedVcodec}\n` });
    }

    if (resolvedVcodec && resolvedVcodec !== 'none') {
      args.push('-c:v', resolvedVcodec);
      if (resolvedVcodec !== 'copy') {
        let cq = '28', crf = '27';
        if (opts.quality === 'high') { cq = '24'; crf = '23'; }
        else if (opts.quality === 'low') { cq = '32'; crf = '31'; }

        args.push('-preset', 'fast');
        if (resolvedVcodec.includes('nvenc')) {
          args.push('-rc', 'vbr', '-cq', cq, '-b:v', '0');
        } else if (resolvedVcodec.includes('amf')) {
          args.push('-rc', 'cqp', '-qp_i', cq, '-qp_p', cq, '-qp_b', cq);
        } else if (resolvedVcodec.includes('qsv')) {
          args.push('-global_quality', cq);
        } else {
          args.push('-crf', crf);
        }
      }
    }

    if (opts.acodec) args.push('-c:a', opts.acodec);
    args.push(output);

    const child = spawn(ffmpeg, args, { cwd: opts.outputDir, stdio: ['ignore', 'pipe', 'pipe'], env: baseEnv });
    activeProcs.set(child.pid, child);

    let ok = true;
    await new Promise(resolve => {
      child.on('close', code => {
        activeProcs.delete(child.pid);
        if (child._isKilledByUser) { ok = false; broadcast({ type: 'exit', code: null }); return; }
        if (code !== 0) ok = false;
        resolve();
      });
    });

    if (!ok) {
      broadcast({ type: 'error', text: 'Encoding failed for ' + base + '\n' });
      break;
    }
  }

  broadcast({ type: 'stdout', text: '\nEncoding complete.\n' });
  broadcast({ type: 'exit', code: 0 });
}

// 9. Internet Archive Upload
async function runIaUpload(opts, broadcast) {
  try {
    await ensureIa(opts.autoIa !== 'false' && opts.autoIa !== false, (msg) => broadcast({ type: 'stdout', text: msg + '\n' }));
  } catch (e) {
    broadcast({ type: 'exit', code: 1 });
    return;
  }
  const iaBin = getIaPath();

  const baseArgs = ['upload', opts.identifier];

  if (opts.title) baseArgs.push('--metadata', `title:${opts.title}`);
  if (opts.description) baseArgs.push('--metadata', `description:${opts.description}`);
  if (opts.collection) baseArgs.push('--metadata', `collection:${opts.collection}`);
  if (opts.creator) baseArgs.push('--metadata', `creator:${opts.creator}`);
  if (opts.date) baseArgs.push('--metadata', `date:${opts.date}`);
  if (opts.language) baseArgs.push('--metadata', `language:${opts.language}`);
  if (opts.license) baseArgs.push('--metadata', `licenseurl:${opts.license}`);

  if (opts.subject) {
    const tags = opts.subject.split(',').map(s => s.trim()).filter(Boolean);
    for (const tag of tags) baseArgs.push('--metadata', `subject:${tag}`);
  }

  let mediatype = opts.mediatype;
  if (!mediatype && opts.collection) {
    if (opts.collection === 'opensource_movies') mediatype = 'movies';
    else if (opts.collection === 'opensource_audio') mediatype = 'audio';
  }
  if (mediatype) baseArgs.push('--metadata', `mediatype:${mediatype}`);

  if (opts.noDerive) {
    baseArgs.push('--no-derive');
  }

  // Preserve folder structures instead of flattening them
  baseArgs.push('--keep-directories');

  // Group files by their parent directory to maintain relative structure
  const groups = {};
  for (const f of opts.files) {
    const dir = path.dirname(f);
    let base = path.basename(f);
    try {
      if (fs.statSync(f).isDirectory()) {
        base += '/'; // Append POSIX trailing slash to prevent folder name duplication bug and consecutive slashes (//) in IA CLI
      }
    } catch (e) { }
    if (!groups[dir]) groups[dir] = [];
    groups[dir].push(base);
  }

  const MAX_RETRIES = 3;
  let isKilled = false;

  for (const dir of Object.keys(groups)) {
    if (isKilled) break;
    const filesToUpload = groups[dir];
    const args = [...baseArgs, ...filesToUpload];
    let attempt = 0;

    const runAttempt = () => {
      return new Promise((resolve) => {
        broadcast({ type: 'stdout', text: `Spawning in ${dir}:\n${iaBin} ${args.join(' ')}\n\n` });
        const env = { ...baseEnv, COLUMNS: '1000' };
        const child = spawn(iaBin, args, {
          cwd: dir,
          stdio: ['pipe', 'pipe', 'pipe'],
          env: env
        });
        activeProcs.set(child.pid, child);
        broadcast({ type: 'pid', pid: child.pid });

        child.stdout.on('data', (data) => broadcast({ type: 'stdout', text: data.toString() }));
        child.stderr.on('data', (data) => broadcast({ type: 'stderr', text: data.toString() }));

        child.on('close', (code) => {
          activeProcs.delete(child.pid);
          if (child._isKilledByUser) {
            isKilled = true;
            broadcast({ type: 'exit', code: null });
            resolve(true);
          } else {
            resolve(code === 0);
          }
        });

        child.on('error', (err) => {
          broadcast({ type: 'error', text: err.message });
          resolve(false);
        });
      });
    };

    while (attempt < MAX_RETRIES) {
      attempt++;
      if (attempt > 1) {
        broadcast({ type: 'stdout', text: `\n--- Upload Attempt ${attempt} of ${MAX_RETRIES} ---\n` });
      }
      const success = await runAttempt();
      if (isKilled) return;
      if (success) break; // Break retry loop, proceed to next group if any

      if (attempt < MAX_RETRIES) {
        broadcast({ type: 'stdout', text: `\n⚠ Upload failed! Retrying in 5 seconds...\n\n` });
        await new Promise(r => setTimeout(r, 5000));
      } else {
        broadcast({ type: 'exit', code: 1 });
        return;
      }
    }
  }

  if (!isKilled) {
    broadcast({ type: 'exit', code: 0 });
  }
}

// 10.5 Internet Archive Edit Metadata
async function runIaEdit(opts, broadcast) {
  try {
    await ensureIa(opts.autoIa !== 'false' && opts.autoIa !== false, (msg) => broadcast({ type: 'stdout', text: msg + '\n' }));
  } catch (e) {
    broadcast({ type: 'exit', code: 1 });
    return;
  }
  const iaBin = getIaPath();

  const metadataArgs = ['metadata', opts.identifier];
  let hasMetadata = false;
  const uploadFiles = [];

  for (const act of opts.actions) {
    if (act.action === 'upload') {
      uploadFiles.push(...act.files);
    } else {
      metadataArgs.push(`--${act.action}`);
      metadataArgs.push(`${act.key}:${act.val}`);
      hasMetadata = true;
    }
  }

  opts.env = { ...baseEnv, COLUMNS: '1000' };

  if (hasMetadata && uploadFiles.length > 0) {
    // Run metadata, then run upload
    broadcast({ type: 'stdout', text: `▶ Running metadata changes...\n` });
    const metaProc = spawn(iaBin, metadataArgs, { env: opts.env });

    metaProc.stdout.on('data', (d) => broadcast({ type: 'stdout', text: d.toString() }));
    metaProc.stderr.on('data', (d) => broadcast({ type: 'stdout', text: d.toString() })); // Send stderr to stdout for visibility

    metaProc.on('close', (code) => {
      if (code !== 0) {
        broadcast({ type: 'stdout', text: `\n❌ Metadata update failed with code ${code}.\n` });
        broadcast({ type: 'exit', code });
        return;
      }
      broadcast({ type: 'stdout', text: `\n▶ Running file upload...\n` });
      const uploadArgs = ['upload', opts.identifier, ...uploadFiles];
      spawnRunner(iaBin, uploadArgs, opts, broadcast);
    });

    // Bind current PID for stopping
    broadcast({ type: 'pid', pid: metaProc.pid });
    activeProcs.set(metaProc.pid, metaProc);
    metaProc.on('exit', () => activeProcs.delete(metaProc.pid));
  } else if (hasMetadata) {
    spawnRunner(iaBin, metadataArgs, opts, broadcast);
  } else if (uploadFiles.length > 0) {
    const uploadArgs = ['upload', opts.identifier, ...uploadFiles];
    spawnRunner(iaBin, uploadArgs, opts, broadcast);
  } else {
    broadcast({ type: 'stdout', text: `\n⚠ No valid actions found.\n` });
    broadcast({ type: 'exit', code: 0 });
  }
}

// 11. Internet Archive Download
async function runIaDownload(opts, broadcast) {
  try {
    await ensureIa(opts.autoIa !== 'false' && opts.autoIa !== false, (msg) => broadcast({ type: 'stdout', text: msg + '\n' }));
  } catch (e) {
    broadcast({ type: 'exit', code: 1 });
    return;
  }
  const iaBin = getIaPath();

  const args = ['download', opts.identifier, '--destdir', opts.outputDir];
  opts.env = { ...baseEnv, COLUMNS: '1000' };

  spawnRunner(iaBin, args, opts, broadcast);
}

// 11. Internet Archive Auth Helpers
function checkIaAuth(autoIa) {
  return new Promise((resolve) => {
    ensureIa(autoIa !== 'false' && autoIa !== false, () => { }).then(() => {
      const iaBin = getIaPath();
      execFile(iaBin, ['configure', '--check'], (error) => {
        resolve(!error);
      });
    }).catch(() => resolve(false));
  });
}

function runIaConfigure(email, password, autoIa) {
  return new Promise((resolve) => {
    ensureIa(autoIa !== 'false' && autoIa !== false, () => { }).then(() => {
      const iaBin = getIaPath();
      execFile(iaBin, ['configure', '--username', email, '--password', password], (error, stdout, stderr) => {
        if (error) {
          resolve({ success: false, error: stderr || stdout || error.message });
        } else {
          resolve({ success: true });
        }
      });
    }).catch((e) => {
      resolve({ success: false, error: e.message });
    });
  });
}

function unlinkIa() {
  const os = require('os');
  const possiblePaths = [
    path.join(os.homedir(), '.config', 'internetarchive', 'ia.ini'),
    path.join(os.homedir(), '.ia'),
    path.join(os.homedir(), '.config', 'ia.ini')
  ];
  for (const p of possiblePaths) {
    if (fs.existsSync(p)) {
      try { fs.unlinkSync(p); } catch (e) { }
    }
  }
}

function stopProc(pid) {
  const p = activeProcs.get(pid);
  if (p) {
    p._isKilledByUser = true;
    if (typeof p.kill === 'function' && pid < 0) {
      try { p.kill(); } catch (e) { }
    }
  }
  if (pid > 0) killProcess(pid);
}

function stopAll() {
  for (const [pid] of activeProcs.entries()) {
    stopProc(pid);
  }
  activeProcs.clear();
}

module.exports = {
  runLivestream,
  runYtdlp,
  runBatch,
  runM3u8,
  runGalleryDl,
  runSplitter,
  runConcatenator,
  runEncoder,
  runIaUpload,
  runIaEdit,
  runIaDownload,
  checkIaAuth,
  runIaConfigure,
  unlinkIa,
  pauseProc: pauseProcess,
  resumeProc: resumeProcess,
  stopProc,
  stopAll,
  getBestH264Encoder,
  getBestVideoEncoder,
  smartCutClip
};