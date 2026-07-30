const { spawn, execFile } = require('child_process');
const fs = require('fs');
const path = require('path');
const { pauseProcess, resumeProcess, killProcess } = require('./runner-utils');
const { getYtdlpPath, ensureYtdlp } = require('./ensure-ytdlp');
const { getFfmpegPath, ensureFfmpeg } = require('./ensure-ffmpeg');
const { getIaPath, ensureIa } = require('./ensure-ia');
const { ensureStreamlink } = require('./ensure-streamlink');

const activeProcs = new Map();
const baseEnv = { ...process.env, PYTHONUNBUFFERED: '1', PYTHONIOENCODING: 'utf-8' };

function hmsToSecs(ts) {
  if (!ts) return 0;
  const parts = ts.trim().split(':').map(Number);
  if (parts.some(isNaN)) return 0;
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return parts[0];
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
  } catch(e) {
    return 'download_' + Date.now();
  }
}

function moveFilesUp(tempDir, targetDir) {
  if (!fs.existsSync(tempDir)) return;
  try {
    const files = fs.readdirSync(tempDir);
    for (const file of files) {
      fs.renameSync(path.join(tempDir, file), path.join(targetDir, file));
    }
    fs.rmdirSync(tempDir);
  } catch (e) {
    console.error('Failed to move files up:', e);
  }
}

async function prepareEnv(opts, broadcast) {
  if (opts.installFfmpeg) {
    await ensureFfmpeg(opts.ffmpegVersion, (msg) => broadcast({ type: 'stdout', text: msg + '\n' }));
  }
  await ensureYtdlp((msg) => broadcast({ type: 'stdout', text: msg + '\n' }));
}

function spawnRunner(exe, args, opts, broadcast) {
  broadcast({ type: 'stdout', text: `Spawning: ${exe} ${args.join(' ')}\n\n` });
  
  if (opts.tempDir && !fs.existsSync(opts.tempDir)) {
    fs.mkdirSync(opts.tempDir, { recursive: true });
  }

  const child = spawn(exe, args, {
    cwd: opts.tempDir || opts.outputDir,
    stdio: ['pipe', 'pipe', 'pipe'],
    env: baseEnv
  });

  activeProcs.set(child.pid, child);
  broadcast({ type: 'pid', pid: child.pid });

  child.stdout.on('data', (data) => broadcast({ type: 'stdout', text: data.toString() }));
  child.stderr.on('data', (data) => broadcast({ type: 'stderr', text: data.toString() }));

  child.on('close', (code) => {
    activeProcs.delete(child.pid);
    if (!child._isKilledByUser && code === 0 && opts.tempDir) {
      moveFilesUp(opts.tempDir, opts.outputDir);
    }
    broadcast({ type: 'exit', code: child._isKilledByUser ? null : code });
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
    const args = [
      opts.url,
      '-f', opts.format,
      '--merge-output-format', opts.container || 'mp4',
      '--ffmpeg-location', getFfmpegPath(),
    ];
    if (opts.cookiesPath && fs.existsSync(opts.cookiesPath)) args.push('--cookies', opts.cookiesPath);
    if (opts.fromStart === 'y') args.push('--live-from-start');
    if (opts.concurrent) args.push('--concurrent-fragments', opts.concurrent);
    
    if (opts.url.includes('twitch.tv') && opts.twitchToken) {
      args.push('--add-header', `Authorization: OAuth ${opts.twitchToken}`);
    }
    
    spawnRunner(ytDlp, args, opts, broadcast);
  }
}

// 2. yt-dlp Single
async function runYtdlp(opts, broadcast) {
  await prepareEnv(opts, broadcast);
  const ytDlp = getYtdlpPath();
  const args = [
    opts.url,
    '-f', opts.format,
    '--merge-output-format', opts.container || 'mp4',
    '--ffmpeg-location', getFfmpegPath(),
    '--write-auto-subs', '--sub-langs', 'en',
    '--remote-components', 'ejs:github',
    '--embed-subs', '--convert-subs', 'srt', '--embed-metadata'
  ];
  if (opts.cookiesPath && fs.existsSync(opts.cookiesPath)) args.push('--cookies', opts.cookiesPath);
  if (opts.startTime || opts.endTime) {
    const s = hmsToSecs(opts.startTime);
    const e = hmsToSecs(opts.endTime) || 'inf';
    args.push('--download-sections', `*${s}-${e}`, '--force-keyframes-at-cuts');
  }
  if (opts.extraArgs) args.push(...opts.extraArgs);

  opts.tempDir = path.join(opts.outputDir, getFolderName(opts.url));
  spawnRunner(ytDlp, args, opts, broadcast);
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
    } catch(e) {}
    
    // Check for updated rest state
    try {
      const rFile = path.join(opts.outputDir, 'rest_state.txt');
      if (fs.existsSync(rFile)) {
        const newRest = parseInt(fs.readFileSync(rFile, 'utf-8'));
        if (!isNaN(newRest)) restTime = newRest;
        fs.unlinkSync(rFile);
      }
    } catch(e) {}

    if (urls.length === 0) {
      broadcast({ type: 'stdout', text: `\n[Batch] Queue empty. Done.\n` });
      broadcast({ type: 'exit', code: 0 });
      return;
    }

    const currentJob = urls.shift();
    const currentUrl = currentJob.url;
    completedCount++;
    broadcast({ type: 'stdout', text: `\n[${completedCount}/${batchTotal}] Processing: ${currentUrl}\n` });

    const args = [
      currentUrl,
      '-f', opts.format,
      '--merge-output-format', opts.container || 'mp4',
      '--ffmpeg-location', getFfmpegPath(),
      '--embed-subs', '--convert-subs', 'srt', '--embed-metadata',
      '--remote-components', 'ejs:github'
    ];
    if (opts.skipLive) args.push('--match-filter', '!is_live');
    if (opts.cookiesPath && fs.existsSync(opts.cookiesPath)) args.push('--cookies', opts.cookiesPath);
    if (opts.extraArgs) args.push(...opts.extraArgs);

    const tempDir = path.join(opts.outputDir, getFolderName(currentUrl));
    if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });

    const child = spawn(ytDlp, args, { cwd: tempDir, stdio: ['pipe', 'pipe', 'pipe'], env: baseEnv });
    activeProcs.set(child.pid, child);
    broadcast({ type: 'pid', pid: child.pid });

    
    let wasSkippedLive = false;
    child.stdout.on('data', (d) => {
      const text = d.toString();
      if (text.includes('does not pass filter !is_live')) wasSkippedLive = true;
      broadcast({ type: 'stdout', text });
    });
    child.stderr.on('data', (d) => broadcast({ type: 'stderr', text: d.toString() }));

    child.on('close', (code) => {
      activeProcs.delete(child.pid);
      if (child._isKilledByUser) {
        broadcast({ type: 'exit', code: null });
        return;
      }
      
      if (!wasSkippedLive && code === 0) {
        moveFilesUp(tempDir, opts.outputDir);
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
      
      if (urls.length > 0) {
        if (wasSkippedLive && !currentJob.isRetry) {
          // If we pushed to back of queue, skip the rest timer
          processQueue();
        } else {
          broadcast({ type: 'stdout', text: `\n[Batch] Waiting ${restTime} minutes before next download...\n` });
        let elapsed = 0;
        const totalMs = restTime * 60 * 1000;
        
        // Polling loop for rest time
        const intervalId = setInterval(() => {
          elapsed += 1000;
          if (elapsed >= totalMs) {
            clearInterval(intervalId);
            processQueue();
          }
        }, 1000);

        // Allow stopping during rest
        const restPid = -Date.now(); 
        activeProcs.set(restPid, { kill: () => { clearInterval(intervalId); broadcast({ type: 'exit', code: null }); } });
        broadcast({ type: 'pid', pid: restPid });
        }
      } else {
        broadcast({ type: 'exit', code: 0 });
      }
    });
    
    child.on('error', (err) => {
      broadcast({ type: 'error', text: err.message });
      broadcast({ type: 'exit', code: 1 });
    });
  }

  processQueue();
}

// 4. M3U8 Downloader
async function runM3u8(opts, broadcast) {
  if (opts.installFfmpeg) await ensureFfmpeg(opts.ffmpegVersion, (msg) => broadcast({ type: 'stdout', text: msg + '\n' }));
  const ffmpeg = getFfmpegPath();
  
  // Format ffmpeg args
  const url = opts.url;
  const encode = opts.encode; // true/false
  const output = `download_${Date.now()}.${opts.container || 'mp4'}`;
  
  let args = ['-y', '-i', url];
  
  if (encode) {
    args.push('-c:v', opts.codec || 'libx264');
    if (opts.bitrate) args.push('-b:v', opts.bitrate);
    if (opts.resolution) args.push('-s', opts.resolution);
    if (opts.fps) args.push('-r', opts.fps);
    args.push('-c:a', 'aac');
    if (opts.audioBitrate) args.push('-b:a', opts.audioBitrate);
  } else {
    args.push('-c', 'copy');
  }
  
  args.push(output);
  
  opts.outputDir = opts.outputDir || process.cwd();
  spawnRunner(ffmpeg, args, opts, broadcast);
}

// 5. gallery-dl (Python script port to CLI)
async function runGalleryDl(opts, broadcast) {
  // Gallery-DL is usually installed via python. 
  // If we eliminate python, we must provide gallery-dl executable or use npx?
  // Since we want to eliminate python, let's use the gallery-dl.exe standalone binary.
  const gdlDir = path.join(__dirname, '..', 'vendor', 'gallery-dl');
  const exe = os.platform() === 'win32' ? 'gallery-dl.exe' : 'gallery-dl';
  const gdlBin = path.join(gdlDir, exe);
  
  if (!fs.existsSync(gdlBin)) {
    broadcast({ type: 'stdout', text: '[setup] gallery-dl standalone binary not found. Please install gallery-dl to vendor/gallery-dl/gallery-dl.exe\n' });
    broadcast({ type: 'exit', code: 1 });
    return;
  }
  
  const args = [opts.url];
  if (opts.cookiesPath && fs.existsSync(opts.cookiesPath)) args.push('--cookies', opts.cookiesPath);
  if (opts.filetypes) args.push('--filter', `extension in (${opts.filetypes.split(',').map(s=>`'${s.trim()}'`).join(',')})`);
  if (opts.metadata) args.push('--write-metadata');
  
  spawnRunner(gdlBin, args, opts, broadcast);
}

// 6. Splitter
async function runSplitter(opts, broadcast) {
  if (opts.installFfmpeg) await ensureFfmpeg(opts.ffmpegVersion, (msg) => broadcast({ type: 'stdout', text: msg + '\n' }));
  const ffmpeg = getFfmpegPath();
  
  const ext = path.extname(opts.file);
  const base = path.basename(opts.file, ext);
  const outDir = opts.outputDir || path.dirname(opts.file);
  const parts = parseInt(opts.parts) || 2;
  
  broadcast({ type: 'stdout', text: `Splitting ${base}${ext} into ${parts} parts...\n` });
  
  // Note: a real splitter needs ffprobe to get duration, then ffmpeg -ss -t.
  // We'll write a simple script wrapper later or do it inline here.
  // For simplicity:
  const ffprobe = path.join(path.dirname(ffmpeg), os.platform() === 'win32' ? 'ffprobe.exe' : 'ffprobe');
  const out = require('child_process').execSync(`"${ffprobe}" -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${opts.file}"`, {encoding:'utf-8'});
  const duration = parseFloat(out.trim());
  
  if (isNaN(duration)) {
    broadcast({ type: 'error', text: 'Could not determine video duration.\n' });
    broadcast({ type: 'exit', code: 1 });
    return;
  }
  
  const partDuration = duration / parts;
  let success = true;
  
  // Sequential split to avoid overwhelming system
  for (let i = 0; i < parts; i++) {
    const start = i * partDuration;
    const output = path.join(outDir, `${base}_part${i+1}${opts.containerFormat ? '.'+opts.containerFormat : ext}`);
    
    broadcast({ type: 'stdout', text: `Extracting part ${i+1}/${parts} [start: ${start.toFixed(2)}s, duration: ${partDuration.toFixed(2)}s]\n` });
    
    const args = ['-y', '-i', opts.file, '-ss', String(start), '-t', String(partDuration), '-c', 'copy', output];
    const child = spawn(ffmpeg, args, { stdio: ['ignore', 'pipe', 'pipe'], env: baseEnv });
    activeProcs.set(child.pid, child);
    
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
  const listFile = path.join(opts.outputDir, 'concat_list.txt');
  const fileLines = opts.files.map(f => `file '${f.replace(/'/g, "'\\''")}'`).join('\n');
  fs.writeFileSync(listFile, fileLines);
  
  const args = ['-y', '-f', 'concat', '-safe', '0', '-i', listFile];
  if (opts.forceEncode) {
    args.push('-c:v', 'libx264', '-preset', 'fast', '-c:a', 'aac');
  } else {
    args.push('-c', 'copy');
  }
  args.push(opts.output);
  
  const child = spawnRunner(ffmpeg, args, opts, broadcast);
  child.on('close', () => fs.unlinkSync(listFile));
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
    if (opts.vcodec) args.push('-c:v', opts.vcodec);
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
  
  const args = ['upload', opts.identifier, ...opts.files];
  
  if (opts.title) args.push('--metadata', `title:${opts.title}`);
  if (opts.description) args.push('--metadata', `description:${opts.description}`);
  if (opts.collection) args.push('--metadata', `collection:${opts.collection}`);
  if (opts.creator) args.push('--metadata', `creator:${opts.creator}`);
  if (opts.date) args.push('--metadata', `date:${opts.date}`);
  if (opts.language) args.push('--metadata', `language:${opts.language}`);
  if (opts.license) args.push('--metadata', `licenseurl:${opts.license}`);
  
  if (opts.subject) {
    const tags = opts.subject.split(',').map(s => s.trim()).filter(Boolean);
    for (const tag of tags) args.push('--metadata', `subject:${tag}`);
  }

  let mediatype = opts.mediatype;
  if (!mediatype && opts.collection) {
    if (opts.collection === 'opensource_movies') mediatype = 'movies';
    else if (opts.collection === 'opensource_audio') mediatype = 'audio';
  }
  if (mediatype) args.push('--metadata', `mediatype:${mediatype}`);
  
  const MAX_RETRIES = 3;
  let attempt = 0;
  let isKilled = false;

  const runAttempt = () => {
    return new Promise((resolve) => {
      broadcast({ type: 'stdout', text: `Spawning: ${iaBin} ${args.join(' ')}\n\n` });
      const child = spawn(iaBin, args, {
        cwd: opts.tempDir || opts.outputDir,
        stdio: ['pipe', 'pipe', 'pipe'],
        env: baseEnv
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
    if (success) {
      broadcast({ type: 'exit', code: 0 });
      return;
    }
    if (attempt < MAX_RETRIES) {
      broadcast({ type: 'stdout', text: `\n⚠ Upload failed! Retrying in 5 seconds...\n\n` });
      await new Promise(r => setTimeout(r, 5000));
    }
  }
  
  broadcast({ type: 'stdout', text: `\n❌ Upload failed after ${MAX_RETRIES} attempts.\n` });
  broadcast({ type: 'exit', code: 1 });
}

// 10. Internet Archive Download
async function runIaDownload(opts, broadcast) {
  try {
    await ensureIa(opts.autoIa !== 'false' && opts.autoIa !== false, (msg) => broadcast({ type: 'stdout', text: msg + '\n' }));
  } catch (e) {
    broadcast({ type: 'exit', code: 1 });
    return;
  }
  const iaBin = getIaPath();
  
  const args = ['download', opts.identifier, '--destdir', opts.outputDir];
  
  spawnRunner(iaBin, args, opts, broadcast);
}

// 11. Internet Archive Auth Helpers
function checkIaAuth(autoIa) {
  return new Promise((resolve) => {
    ensureIa(autoIa !== 'false' && autoIa !== false, () => {}).then(() => {
      const iaBin = getIaPath();
      execFile(iaBin, ['configure', '--check'], (error) => {
        resolve(!error);
      });
    }).catch(() => resolve(false));
  });
}

function runIaConfigure(email, password, autoIa) {
  return new Promise((resolve) => {
    ensureIa(autoIa !== 'false' && autoIa !== false, () => {}).then(() => {
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

function stopProc(pid) {
  const p = activeProcs.get(pid);
  if (p) {
    p._isKilledByUser = true;
    if (typeof p.kill === 'function' && pid < 0) {
      try { p.kill(); } catch (e) {}
    }
  }
  if (pid > 0) killProcess(pid);
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
  runIaDownload,
  checkIaAuth,
  runIaConfigure,
  pauseProc: pauseProcess,
  resumeProc: resumeProcess,
  stopProc
};
