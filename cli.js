#!/usr/bin/env node
/**
 * nyx-dlp CLI — headless command-line interface
 *
 * Usage:
 *   nyx-dlp-cli <tool> [options]
 *
 * Tools:
 *   ytdlp        Download a single video with yt-dlp (supports Smart-Cut clipping)
 *   batch        Batch download URLs (via arguments or stdin pipe)
 *   livestream   Archive YouTube live streams (HLS chunk slicing engine)
 *   m3u8         Download and optionally re-encode M3U8 HLS streams
 *   gallery-dl   Download image sets and galleries
 *   splitter     Losslessly split video into N parts
 *   concat       Concatenate multiple videos into a single file
 *   encoder      Hardware GPU-accelerated video converter & compressor
 *   ia           Internet Archive tools (upload, download, edit metadata, configure)
 *   server       Host the Remote Web Access server headlessly (alias: remote)
 *   encoders     List detected hardware GPU and software encoders
 */

const path = require('path');
const fs = require('fs');
const os = require('os');

function resolveModule(relPath) {
  const candidates = [
    path.join(__dirname, relPath),
    path.join(__dirname, 'resources', 'app.asar', relPath),
    path.join(__dirname, 'resources', 'app', relPath)
  ];
  for (const p of candidates) {
    try {
      if (fs.existsSync(p) || p.includes('app.asar')) {
        return require(p);
      }
    } catch (_) {}
  }
  return require(relPath);
}

const runners = resolveModule('lib/runners.js');
const settingsStore = resolveModule('lib/settings-store.js');

// ── Argument parsing ─────────────────────────────────────────────────
function parseArgs(argv) {
  const positional = [];
  const flags = {};
  let i = 0;
  while (i < argv.length) {
    const arg = argv[i];
    if (arg.startsWith('--')) {
      const key = arg.slice(2);
      // Support --flag=value format
      if (key.includes('=')) {
        const [k, ...rest] = key.split('=');
        flags[k] = rest.join('=');
      } else if (i + 1 >= argv.length || argv[i + 1].startsWith('-')) {
        flags[key] = true;
      } else {
        const val = argv[++i];
        if (flags[key] !== undefined) {
          if (Array.isArray(flags[key])) flags[key].push(val);
          else flags[key] = [flags[key], val];
        } else {
          flags[key] = val;
        }
      }
    } else if (arg.startsWith('-') && arg.length === 2) {
      const key = arg.slice(1);
      if (i + 1 >= argv.length || argv[i + 1].startsWith('-')) {
        flags[key] = true;
      } else {
        flags[key] = argv[++i];
      }
    } else {
      positional.push(arg);
    }
    i++;
  }
  return { positional, flags };
}

function parseExtraArgs(input) {
  if (!input) return [];
  if (Array.isArray(input)) return input;
  try {
    const parsed = JSON.parse(input);
    if (Array.isArray(parsed)) return parsed;
  } catch (_) {}
  return input.split(/\s+/).filter(Boolean);
}

function die(msg) {
  console.error(`\x1b[31mError:\x1b[0m ${msg}`);
  process.exit(1);
}

let activePid = null;
function broadcastTerminal(data) {
  if (data.type === 'pid') activePid = data.pid;
  if (data.type === 'stdout' && data.text) process.stdout.write(data.text);
  if (data.type === 'stderr' && data.text) process.stderr.write(data.text);
  if (data.type === 'error' && data.text) console.error(`\x1b[31m${data.text}\x1b[0m`);
  if (data.type === 'exit') process.exit(data.code || 0);
}

// Graceful termination on Ctrl+C
process.on('SIGINT', () => {
  console.log('\nStopping active process...');
  if (activePid) runners.stopProc(activePid);
  else runners.stopAll();
  process.exit(130);
});

// ── Top-level help ───────────────────────────────────────────────────
const rawArgs = process.argv.slice(2);
const tool = rawArgs[0];

if (!tool || tool === '--help' || tool === '-h') {
  const version = require('./package.json').version;
  console.log(`
\x1b[1mnyx-dlp CLI v${version}\x1b[0m
Modern high-performance media downloading, clipping, processing, and archiving suite.

\x1b[1mUsage:\x1b[0m
  nyx-dlp-cli <tool> [options]

\x1b[1mTools:\x1b[0m
  \x1b[36mytdlp\x1b[0m        Download a single video or clip with Smart-Cut precision
  \x1b[36mbatch\x1b[0m        Batch download multiple URLs with rest intervals & live skipping
  \x1b[36mlivestream\x1b[0m   Archive YouTube live streams (Native HLS chunk engine)
  \x1b[36mm3u8\x1b[0m         Download and optionally re-encode M3U8 HLS streams
  \x1b[36mgallery-dl\x1b[0m   Download image sets and galleries from hundreds of sites
  \x1b[36msplitter\x1b[0m     Losslessly split video into N parts with schedule generation
  \x1b[36mconcat\x1b[0m       Concatenate multiple video files (stream copy or GPU encode)
  \x1b[36mencoder\x1b[0m      GPU-accelerated video re-encoding and transcoding
  \x1b[36mia\x1b[0m           Internet Archive suite (upload, download, edit metadata, auth)
  \x1b[36mserver\x1b[0m       Host the Remote Web Access server headlessly (alias: remote)
  \x1b[36mencoders\x1b[0m     Detect and display available GPU hardware encoders

Run \x1b[33mnyx-dlp-cli <tool> --help\x1b[0m for tool-specific documentation and options.
`);
  process.exit(0);
}

const { positional, flags } = parseArgs(rawArgs.slice(1));
const isHelp = flags.h || flags.help;
const outDir = flags.o || flags.output || flags['output-dir'] || null;

// Normalize tool alias
const toolName = tool.toLowerCase();

switch (toolName) {
  // ── 1. yt-dlp ──────────────────────────────────────────────────────────
  case 'ytdlp':
  case 'yt-dlp': {
    if (isHelp) {
      console.log(`
\x1b[1mTool: ytdlp\x1b[0m — Download a single video or clip with yt-dlp & Smart-Cut

\x1b[1mUsage:\x1b[0m
  nyx-dlp-cli ytdlp <url> -o <dir> [options]

\x1b[1mOptions:\x1b[0m
  -o, --output <dir>        Output directory for downloaded files (required)
  -f, --format <format>     Format selection (default: "bestvideo+bestaudio/best")
  -c, --cookies <path>      Path to cookies.txt file for authenticated downloads
  --container <ext>         Output container (mp4, mkv, webm; default: mp4)
  --client <name>           YouTube client player (web, web_safari, ios, android, tv, default)
  --start-time <HH:MM:SS>   Start timestamp for clipping
  --end-time <HH:MM:SS>     End timestamp for clipping
  --auto-repair             Auto-repair initialization fragment errors
  --retry-ssl               Automatically retry when SSL/TLS handshake errors occur
  --ffmpeg-version <ver>    FFmpeg version (auto, latest, 5.1.4)
  --extra-args '<json>'     JSON array or string of extra yt-dlp arguments

\x1b[1mExamples:\x1b[0m
  nyx-dlp-cli ytdlp "https://youtu.be/xyz" -o ./downloads
  nyx-dlp-cli ytdlp "https://youtu.be/xyz" -o ./clips --start-time 00:01:30 --end-time 00:03:00
`);
      process.exit(0);
    }
    const url = positional[0];
    if (!url) die('URL required. Usage: nyx-dlp-cli ytdlp <url> -o <dir>');
    if (!outDir) die('Output directory required (-o <dir>)');
    fs.mkdirSync(outDir, { recursive: true });

    runners.runYtdlp({
      outputDir: outDir,
      url,
      format: flags.f || flags.format || 'bestvideo+bestaudio/best',
      cookiesPath: flags.c || flags.cookies || '',
      container: flags.container || 'mp4',
      client: flags.client || 'default',
      startTime: flags['start-time'] || flags.start || '',
      endTime: flags['end-time'] || flags.end || '',
      autoRepair: !!flags['auto-repair'],
      retrySsl: !!flags['retry-ssl'],
      ffmpegVersion: flags['ffmpeg-version'] || 'auto',
      extraArgs: parseExtraArgs(flags['extra-args'])
    }, broadcastTerminal);
    break;
  }

  // ── 2. Batch ───────────────────────────────────────────────────────────
  case 'batch': {
    if (isHelp) {
      console.log(`
\x1b[1mTool: batch\x1b[0m — Download multiple URLs with queueing, rest delays & live skipping

\x1b[1mUsage:\x1b[0m
  nyx-dlp-cli batch -o <dir> [options] [url1 url2 ...]
  cat urls.txt | nyx-dlp-cli batch -o <dir> [options]

\x1b[1mOptions:\x1b[0m
  -o, --output <dir>        Output directory (required)
  -f, --format <format>     Format selection (default: "bestvideo+bestaudio/best")
  -c, --cookies <path>      Path to cookies.txt file
  --container <ext>         Output container (mp4, mkv, webm; default: mp4)
  --client <name>           YouTube client (web, web_safari, ios, android, tv, default)
  --rest <seconds>          Rest interval in seconds between downloads (default: 0)
  --skip-live               Skip active live streams in the batch queue
  --auto-repair             Auto-repair initialization fragment errors
  --retry-ssl               Automatically retry on SSL handshake errors
  --ffmpeg-version <ver>    FFmpeg version (auto, latest, 5.1.4)
  --extra-args '<json>'     JSON array or string of extra yt-dlp arguments

\x1b[1mExamples:\x1b[0m
  nyx-dlp-cli batch -o ./batch_dl --rest 15 "https://youtu.be/1" "https://youtu.be/2"
  cat urls.txt | nyx-dlp-cli batch -o ./batch_dl --skip-live
`);
      process.exit(0);
    }
    if (!outDir) die('Output directory required (-o <dir>)');
    fs.mkdirSync(outDir, { recursive: true });

    const batchOpts = {
      outputDir: outDir,
      format: flags.f || flags.format || 'bestvideo+bestaudio/best',
      cookiesPath: flags.c || flags.cookies || '',
      container: flags.container || 'mp4',
      client: flags.client || 'default',
      rest: flags.rest || '0',
      skipLive: !!flags['skip-live'],
      autoRepair: !!flags['auto-repair'],
      retrySsl: !!flags['retry-ssl'],
      ffmpegVersion: flags['ffmpeg-version'] || 'auto',
      extraArgs: parseExtraArgs(flags['extra-args'])
    };

    const urls = positional.length > 0 ? positional : [];
    if (urls.length === 0 && process.stdin.isTTY) {
      die('No URLs provided. Pass URLs as arguments or pipe via stdin.\nExample: cat urls.txt | nyx-dlp-cli batch -o ./output');
    }

    if (urls.length > 0) {
      batchOpts.urls = urls;
      runners.runBatch(batchOpts, broadcastTerminal);
    } else {
      let stdinData = '';
      process.stdin.setEncoding('utf-8');
      process.stdin.on('data', chunk => stdinData += chunk);
      process.stdin.on('end', () => {
        batchOpts.urls = stdinData.split('\n').map(l => l.trim()).filter(Boolean);
        runners.runBatch(batchOpts, broadcastTerminal);
      });
    }
    break;
  }

  // ── 3. Livestream ──────────────────────────────────────────────────────
  case 'livestream':
  case 'live': {
    if (isHelp) {
      console.log(`
\x1b[1mTool: livestream\x1b[0m — Archive YouTube live streams (Native HLS chunk slicing)

\x1b[1mUsage:\x1b[0m
  nyx-dlp-cli livestream <url> -o <dir> [options]

\x1b[1mOptions:\x1b[0m
  -o, --output <dir>        Output directory (required)
  -f, --quality <quality>   Stream quality (best, 1080p60, 1080p, 720p60, 720p, 480p, 360p, audio_only)
  -c, --cookies <path>      Path to cookies.txt file
  --container <ext>         Output container (mp4, mkv, ts; default: mp4)
  --client <name>           Player client (default, web, ios, android, tv)
  --from-start <y|n>        Start recording from stream beginning (default: y)
  --concurrent <n>          Number of concurrent download connections (default: 5)
  --retry-ssl               Automatically retry on SSL handshake errors
  --ffmpeg-version <ver>    FFmpeg version (auto, latest, 5.1.4)

\x1b[1mExamples:\x1b[0m
  nyx-dlp-cli livestream "https://www.youtube.com/watch?v=live_id" -o ./live_archive --quality 1080p60
`);
      process.exit(0);
    }
    const url = positional[0];
    if (!url) die('URL required. Usage: nyx-dlp-cli livestream <url> -o <dir>');
    if (!outDir) die('Output directory required (-o <dir>)');
    fs.mkdirSync(outDir, { recursive: true });

    let fromStartVal = 'y';
    if (flags['from-start'] !== undefined) {
      fromStartVal = (flags['from-start'] === false || flags['from-start'] === 'n' || flags['from-start'] === 'no') ? 'n' : 'y';
    }

    runners.runLivestream({
      outputDir: outDir,
      url,
      format: flags.f || flags.quality || flags.format || 'best',
      cookiesPath: flags.c || flags.cookies || '',
      container: flags.container || 'mp4',
      client: flags.client || 'default',
      fromStart: fromStartVal,
      concurrent: flags.concurrent || '5',
      retrySsl: !!flags['retry-ssl'],
      ffmpegVersion: flags['ffmpeg-version'] || 'auto'
    }, broadcastTerminal);
    break;
  }

  // ── 4. M3U8 ────────────────────────────────────────────────────────────
  case 'm3u8':
  case 'hls': {
    if (isHelp) {
      console.log(`
\x1b[1mTool: m3u8\x1b[0m — Download and optionally re-encode M3U8 HLS streams

\x1b[1mUsage:\x1b[0m
  nyx-dlp-cli m3u8 <url> -o <dir> [options]

\x1b[1mOptions:\x1b[0m
  -o, --output <dir>        Output directory (required)
  -c, --cookies <path>      Path to cookies.txt file
  --encode                  Re-encode stream video with FFmpeg
  --codec <codec>           Codec (h264, hevc, av1, copy; default: h264)
  --bitrate <rate>          Video target bitrate (e.g. 5M, 8000k; default: 5M)
  --resolution <WxH>        Target resolution (e.g. 1920x1080)
  --fps <n>                 Target frame rate (e.g. 30, 60; default: 30)
  --audio-bitrate <rate>    Audio bitrate (e.g. 192k; default: 192k)
  --container <ext>         Output container (mp4, mkv, ts; default: mp4)
  --auto-repair             Auto-repair stream errors
  --custom-headers <str>    Custom HTTP headers for stream requests
  --ffmpeg-version <ver>    FFmpeg version (auto, latest, 5.1.4)

\x1b[1mExamples:\x1b[0m
  nyx-dlp-cli m3u8 "https://example.com/stream.m3u8" -o ./downloads
  nyx-dlp-cli m3u8 "https://example.com/stream.m3u8" -o ./downloads --encode --codec h264 --bitrate 6M
`);
      process.exit(0);
    }
    const url = positional[0];
    if (!url) die('URL required. Usage: nyx-dlp-cli m3u8 <url> -o <dir>');
    if (!outDir) die('Output directory required (-o <dir>)');
    fs.mkdirSync(outDir, { recursive: true });

    runners.runM3u8({
      outputDir: outDir,
      url,
      encode: !!flags.encode,
      codec: flags.codec || 'h264',
      bitrate: flags.bitrate || '5M',
      resolution: flags.resolution || '1920x1080',
      fps: flags.fps || '30',
      audioBitrate: flags['audio-bitrate'] || '192k',
      container: flags.container || 'mp4',
      cookiesPath: flags.c || flags.cookies || '',
      autoRepair: !!flags['auto-repair'],
      customHeaders: flags['custom-headers'] || '',
      ffmpegVersion: flags['ffmpeg-version'] || 'auto'
    }, broadcastTerminal);
    break;
  }

  // ── 5. gallery-dl ──────────────────────────────────────────────────────
  case 'gallery-dl':
  case 'gallery':
  case 'gdl': {
    if (isHelp) {
      console.log(`
\x1b[1mTool: gallery-dl\x1b[0m — Download image galleries and media from hundreds of sites

\x1b[1mUsage:\x1b[0m
  nyx-dlp-cli gallery-dl <url> -o <dir> [options]

\x1b[1mOptions:\x1b[0m
  -o, --output <dir>        Output directory (required)
  -c, --cookies <path>      Path to cookies.txt file
  --filetypes <exts>        Comma-separated list of allowed extensions (e.g. "jpg,png,gif,mp4")
  --metadata                Save image metadata JSON files alongside downloads
  --extra-args '<json>'     JSON array or string of extra gallery-dl arguments

\x1b[1mExamples:\x1b[0m
  nyx-dlp-cli gallery-dl "https://example.com/album" -o ./photos --filetypes "jpg,png" --metadata
`);
      process.exit(0);
    }
    const url = positional[0];
    if (!url) die('URL required. Usage: nyx-dlp-cli gallery-dl <url> -o <dir>');
    if (!outDir) die('Output directory required (-o <dir>)');
    fs.mkdirSync(outDir, { recursive: true });

    runners.runGalleryDl({
      outputDir: outDir,
      url,
      filetypes: flags.filetypes || '',
      metadata: !!flags.metadata,
      cookiesPath: flags.c || flags.cookies || '',
      extraArgs: parseExtraArgs(flags['extra-args'])
    }, broadcastTerminal);
    break;
  }

  // ── 6. Splitter ────────────────────────────────────────────────────────
  case 'splitter':
  case 'split': {
    if (isHelp) {
      console.log(`
\x1b[1mTool: splitter\x1b[0m — Losslessly split video into N equal-duration segments

\x1b[1mUsage:\x1b[0m
  nyx-dlp-cli splitter <file> -o <dir> --parts <n> [options]

\x1b[1mOptions:\x1b[0m
  --parts <n>               Total number of equal parts to divide the video into (required)
  --parts-to-save <range>   Specific parts to export (e.g. "1,3,5" or "1-4"; default: all)
  -o, --output <dir>        Output directory (defaults to directory of input file)
  --format, --container     Target container format (mp4, mkv, ts; default: matches input)
  --ffmpeg-version <ver>    FFmpeg version (auto, latest, 5.1.4)

\x1b[1mExamples:\x1b[0m
  nyx-dlp-cli splitter ./movie.mp4 -o ./parts --parts 4
  nyx-dlp-cli splitter ./movie.mp4 -o ./parts --parts 10 --parts-to-save "1,3,5"
`);
      process.exit(0);
    }
    const file = positional[0];
    if (!file) die('Input file required. Usage: nyx-dlp-cli splitter <file> -o <dir> --parts <n>');
    if (!flags.parts) die('--parts <n> parameter is required');
    const destination = outDir || path.dirname(path.resolve(file));
    fs.mkdirSync(destination, { recursive: true });

    runners.runSplitter({
      file: path.resolve(file),
      parts: flags.parts,
      partsToSave: flags['parts-to-save'] || '',
      containerFormat: flags.format || flags.container || '',
      outputDir: destination,
      ffmpegVersion: flags['ffmpeg-version'] || 'auto'
    }, broadcastTerminal);
    break;
  }

  // ── 7. Concatenator ────────────────────────────────────────────────────
  case 'concat':
  case 'concatenate': {
    if (isHelp) {
      console.log(`
\x1b[1mTool: concat\x1b[0m — Concatenate multiple video files together

\x1b[1mUsage:\x1b[0m
  nyx-dlp-cli concat -o <dir> --output <filename> [options] <file1> <file2> ...

\x1b[1mOptions:\x1b[0m
  --output <filename>       Output filename (e.g. "merged.mp4"; required)
  -o, --output-dir <dir>    Output directory (defaults to directory of first file)
  --force-encode            Force GPU/CPU re-encoding instead of direct stream copy
  --quality <level>         Encode quality profile (high, medium, low; default: high)
  --mkv                     Output container format as MKV
  --codec <codec>           Specific encoder codec (e.g. h264_nvenc, libx264)
  --ffmpeg-version <ver>    FFmpeg version (auto, latest, 5.1.4)

\x1b[1mExamples:\x1b[0m
  nyx-dlp-cli concat -o ./output --output merged.mp4 part1.mp4 part2.mp4 part3.mp4
  nyx-dlp-cli concat -o ./output --output merged.mp4 --force-encode --quality high clip1.mp4 clip2.mov
`);
      process.exit(0);
    }
    const files = positional;
    if (files.length < 2) die('At least 2 files required. Usage: nyx-dlp-cli concat -o <dir> --output <name> <file1> <file2> ...');
    const outName = flags.output || flags.name;
    if (!outName) die('--output <filename> parameter is required');
    const destination = outDir || path.dirname(path.resolve(files[0]));
    fs.mkdirSync(destination, { recursive: true });

    runners.runConcatenator({
      files: files.map(f => path.resolve(f)),
      output: outName,
      forceEncode: !!flags['force-encode'],
      quality: flags.quality || 'high',
      mkv: !!flags.mkv,
      codec: flags.codec || '',
      outputDir: destination,
      ffmpegVersion: flags['ffmpeg-version'] || 'auto'
    }, broadcastTerminal);
    break;
  }

  // ── 8. Video Encoder ───────────────────────────────────────────────────
  case 'encoder':
  case 'encode': {
    if (isHelp) {
      console.log(`
\x1b[1mTool: encoder\x1b[0m — Hardware GPU-accelerated video converter and compressor

\x1b[1mUsage:\x1b[0m
  nyx-dlp-cli encoder -o <dir> [options] <file1> <file2> ...

\x1b[1mOptions:\x1b[0m
  -o, --output <dir>        Output directory (defaults to directory of first file)
  --quality <level>         Quality preset (high, medium, low; default: high)
  --mode <mode>             Processing mode (sequential, parallel, replace; default: sequential)
  --vcodec <codec>          Video codec (auto, h264_nvenc, hevc_nvenc, h264_amf, h264_qsv, libx264, libx265)
  --acodec <codec>          Audio codec (aac, mp3, opus, copy; default: aac)
  --container <ext>         Container format (mp4, mkv, mov; default: mp4)
  --bitrate <rate>          Custom target video bitrate (e.g. 6000k, 10M)
  --crf <n>                 CRF ratefactor for CPU encoding (e.g. 18, 23)
  --fps <n>                 Target frame rate (e.g. 30, 60)
  --resolution <WxH>        Target resolution (e.g. 1920x1080)
  --preset <preset>         Encoder speed/quality preset (e.g. slow, medium, fast, p4, p6)
  --ffmpeg-version <ver>    FFmpeg version (auto, latest, 5.1.4)

\x1b[1mExamples:\x1b[0m
  nyx-dlp-cli encoder -o ./converted --quality high video.mkv
  nyx-dlp-cli encoder -o ./compressed --vcodec auto --quality medium *.mp4
`);
      process.exit(0);
    }
    const files = positional;
    if (files.length === 0) die('At least 1 file required. Usage: nyx-dlp-cli encoder -o <dir> <file1> ...');
    const destination = outDir || path.dirname(path.resolve(files[0]));
    fs.mkdirSync(destination, { recursive: true });

    runners.runEncoder({
      files: files.map(f => path.resolve(f)),
      outputDir: destination,
      mode: flags.mode || 'sequential',
      quality: flags.quality || 'high',
      vcodec: flags.vcodec || '',
      acodec: flags.acodec || 'aac',
      container: flags.container || 'mp4',
      bitrate: flags.bitrate || '',
      crf: flags.crf || '',
      fps: flags.fps || '',
      resolution: flags.resolution || '',
      preset: flags.preset || '',
      ffmpegVersion: flags['ffmpeg-version'] || 'auto'
    }, broadcastTerminal);
    break;
  }

  // ── 9. Internet Archive Suite ──────────────────────────────────────────
  case 'ia':
  case 'ia-upload':
  case 'ia-download':
  case 'ia-edit':
  case 'ia-config':
  case 'ia-auth': {
    const subAction = (toolName === 'ia') ? (positional[0] || '').toLowerCase() : toolName.replace('ia-', '');
    const iaArgs = (toolName === 'ia') ? positional.slice(1) : positional;

    if (isHelp || !subAction || subAction === 'help') {
      console.log(`
\x1b[1mTool: ia\x1b[0m — Internet Archive suite (upload, download, edit metadata, configure)

\x1b[1mUsage:\x1b[0m
  nyx-dlp-cli ia upload --id <id> [options] <files/folders...>
  nyx-dlp-cli ia download <id> -o <dir>
  nyx-dlp-cli ia edit --id <id> [options]
  nyx-dlp-cli ia config [--check | --login | --unlink]

\x1b[1mUpload Options:\x1b[0m
  --id, --identifier <id>   Unique Internet Archive identifier (required)
  --title <text>            Item title
  --description <text>      Item description
  --collection <name>       Collection (e.g. opensource_movies, opensource_audio, community)
  --creator <name>          Creator / Author
  --date <YYYY-MM-DD>       Item creation/recording date
  --subject <tags>          Comma-separated subjects/tags
  --mediatype <type>        Media type (movies, audio, texts, data)
  --language <lang>         Language code (e.g. eng, jpn)
  --license <url>           License URL
  --no-derive               Skip automatic derivative generation

\x1b[1mEdit Metadata Options:\x1b[0m
  --id, --identifier <id>   Item identifier (required)
  --add <key:val>           Add metadata key and value
  --set <key:val>           Modify existing metadata field
  --remove <key:val>        Remove metadata field
  --upload <files...>       Append files to item

\x1b[1mConfig / Auth Options:\x1b[0m
  --check                   Test if current account is authenticated
  --login                   Configure account credentials
  --email <email>           Account email
  --password <password>     Account password
  --unlink                  Log out and remove stored credentials
`);
      process.exit(0);
    }

    if (subAction === 'upload') {
      const identifier = flags.id || flags.identifier;
      if (!identifier) die('--id <identifier> required for Internet Archive upload');
      const files = iaArgs.length > 0 ? iaArgs : [];
      if (files.length === 0) die('At least one file or folder required for upload');

      runners.runIaUpload({
        identifier,
        files: files.map(f => path.resolve(f)),
        title: flags.title || '',
        description: flags.description || '',
        collection: flags.collection || '',
        creator: flags.creator || '',
        date: flags.date || '',
        subject: flags.subject || '',
        mediatype: flags.mediatype || '',
        language: flags.language || '',
        license: flags.license || '',
        noDerive: !!flags['no-derive']
      }, broadcastTerminal);
    } else if (subAction === 'download') {
      const identifier = iaArgs[0] || flags.id || flags.identifier;
      if (!identifier) die('Identifier required. Usage: nyx-dlp-cli ia download <id> -o <dir>');
      if (!outDir) die('Output directory required (-o <dir>)');
      fs.mkdirSync(outDir, { recursive: true });

      runners.runIaDownload({
        identifier,
        outputDir: outDir
      }, broadcastTerminal);
    } else if (subAction === 'edit') {
      const identifier = flags.id || flags.identifier || iaArgs[0];
      if (!identifier) die('--id <identifier> required for metadata editing');

      const actions = [];
      // Support --add key:val, --set key:val, --remove key:val, and files
      const parseKeyVal = (val, actName) => {
        const arr = Array.isArray(val) ? val : [val];
        for (const item of arr) {
          const colonIdx = item.indexOf(':');
          if (colonIdx > 0) {
            actions.push({
              action: actName,
              key: item.slice(0, colonIdx).trim(),
              val: item.slice(colonIdx + 1).trim()
            });
          }
        }
      };

      if (flags.add) parseKeyVal(flags.add, 'add');
      if (flags.set) parseKeyVal(flags.set, 'set');
      if (flags.remove) parseKeyVal(flags.remove, 'remove');
      if (flags.upload) {
        const uploadArr = Array.isArray(flags.upload) ? flags.upload : [flags.upload];
        actions.push({ action: 'upload', files: uploadArr.map(f => path.resolve(f)) });
      }

      if (actions.length === 0) die('No actions provided. Use --add <key:val>, --set <key:val>, --remove <key:val>, or --upload <file>');

      runners.runIaEdit({
        identifier,
        actions
      }, broadcastTerminal);
    } else if (subAction === 'config' || subAction === 'auth') {
      if (flags.unlink) {
        runners.unlinkIa();
        console.log('\x1b[32m✔ Successfully unlinked Internet Archive credentials.\x1b[0m');
        process.exit(0);
      } else if (flags.login || (flags.email && flags.password)) {
        const email = flags.email;
        const password = flags.password;
        if (!email || !password) die('--email and --password required to configure Internet Archive credentials');
        console.log('Authenticating with Internet Archive...');
        runners.runIaConfigure(email, password, true).then(res => {
          if (res && res.success) {
            console.log('\x1b[32m✔ Successfully configured and verified Internet Archive credentials!\x1b[0m');
            process.exit(0);
          } else {
            console.error(`\x1b[31mAuthentication failed:\x1b[0m ${res ? res.error : 'Unknown error'}`);
            process.exit(1);
          }
        });
      } else {
        // Default: check auth status
        console.log('Checking Internet Archive authentication status...');
        runners.checkIaAuth(true).then(isAuthed => {
          if (isAuthed) {
            console.log('\x1b[32m✔ Internet Archive is authenticated and ready.\x1b[0m');
          } else {
            console.log('\x1b[33m⚠ Internet Archive is not configured. Use "nyx-dlp-cli ia config --email <email> --password <pass>" to log in.\x1b[0m');
          }
          process.exit(isAuthed ? 0 : 1);
        });
      }
    } else {
      die(`Unknown IA action: "${subAction}". Available actions: upload, download, edit, config`);
    }
    break;
  }

  // ── 10. Encoders / GPU Diagnostic ──────────────────────────────────────
  case 'encoders':
  case 'gpu-check':
  case 'gpu': {
    console.log('Detecting hardware GPU encoders and FFmpeg runtime...\n');
    const { ensureFfmpeg, getFfmpegPath } = require('./lib/ensure-ffmpeg.js');
    ensureFfmpeg(flags['ffmpeg-version'] || 'auto', (msg) => console.log(msg)).then(() => {
      const ffmpegPath = getFfmpegPath();
      const best = runners.getBestVideoEncoder(ffmpegPath);
      const h264 = runners.getBestH264Encoder(ffmpegPath);
      console.log(`\x1b[1mPrimary Video Encoder:\x1b[0m \x1b[32m${best}\x1b[0m`);
      console.log(`\x1b[1mH.264 Video Encoder:\x1b[0m   \x1b[32m${h264}\x1b[0m`);
      console.log('\nSupported Hardware & Software Encoders:');
      console.log('  • NVIDIA NVENC  (hevc_nvenc, h264_nvenc)');
      console.log('  • AMD AMF      (hevc_amf, h264_amf)');
      console.log('  • Intel QuickSync (hevc_qsv, h264_qsv)');
      console.log('  • CPU Software  (libx264, libx265)\n');
      process.exit(0);
    }).catch(err => {
      console.error('Error detecting encoders:', err);
      process.exit(1);
    });
    break;
  }

  // ── 11. Remote Server / Web Access ─────────────────────────────────────
  case 'server':
  case 'remote':
  case 'serve': {
    if (isHelp) {
      console.log(`
\x1b[1mTool: server\x1b[0m — Host the nyx-dlp Remote Web Access server headlessly

\x1b[1mUsage:\x1b[0m
  nyx-dlp-cli server [options]
  nyx-dlp-cli remote [options]

\x1b[1mOptions:\x1b[0m
  -p, --port <number>       Port number to bind (default: 3000)
  -u, --user <username>     Authentication username (default: "admin")
  --pass, --password <pwd>  Authentication password (default: "secret")
  --pin <digits>            Optional 4-6 digit quick PIN code

\x1b[1mExamples:\x1b[0m
  nyx-dlp-cli server
  nyx-dlp-cli server --port 8080 --user myuser --pass mypass
  nyx-dlp-cli server --port 3000 --pin 1234
`);
      process.exit(0);
    }

    const port = parseInt(flags.p || flags.port) || 3000;
    const user = flags.u || flags.user || 'admin';
    const pass = flags.pass || flags.password || 'secret';
    const pin  = flags.pin ? String(flags.pin) : null;

    const serverModule = resolveModule('server.js');
    console.log(`\x1b[1mStarting nyx-dlp Remote Web Access Server...\x1b[0m\n`);

    serverModule.startServer({ port, user, pass, pin }, __dirname);

    // Get local network IPs
    const nets = os.networkInterfaces();
    const ips = [];
    for (const name of Object.keys(nets)) {
      for (const net of nets[name]) {
        if (net.family === 'IPv4' && !net.internal) {
          ips.push(net.address);
        }
      }
    }

    console.log(`\x1b[32m✔ Remote Web Access server is running!\x1b[0m`);
    console.log(`\n\x1b[1mAccess URLs:\x1b[0m`);
    console.log(`  • Local:   \x1b[36mhttp://localhost:${port}\x1b[0m`);
    ips.forEach(ip => {
      console.log(`  • Network: \x1b[36mhttp://${ip}:${port}\x1b[0m`);
    });

    console.log(`\n\x1b[1mCredentials:\x1b[0m`);
    console.log(`  • Username: \x1b[33m${user}\x1b[0m`);
    console.log(`  • Password: \x1b[33m${pass}\x1b[0m`);
    if (pin) console.log(`  • PIN:      \x1b[33m${pin}\x1b[0m`);

    console.log(`\nPress \x1b[33mCtrl+C\x1b[0m to stop the server.\n`);

    process.on('SIGINT', () => {
      console.log('\nStopping Remote Web Access server...');
      serverModule.stopServer();
      process.exit(0);
    });
    break;
  }

  // ── 11. Config ──────────────────────────────────────────────────────────
  case 'config': {
    if (isHelp) {
      console.log(`
\x1b[1mTool: config\x1b[0m — Inspect or update persistent settings shared between CLI, Web, and App

\x1b[1mUsage:\x1b[0m
  nyx-dlp-cli config
  nyx-dlp-cli config get <key>
  nyx-dlp-cli config set <key> <value>

\x1b[1mExamples:\x1b[0m
  nyx-dlp-cli config
  nyx-dlp-cli config get yd-output
  nyx-dlp-cli config set yd-output /var/media/downloads
  nyx-dlp-cli config set dep-ffmpeg-version latest
`);
      process.exit(0);
    }

    const sub = positional[0]?.toLowerCase();
    if (!sub || sub === 'list') {
      const all = settingsStore.loadAllSettings();
      console.log(`\x1b[1mSettings File:\x1b[0m ${settingsStore.settingsFilePath}\n`);
      if (Object.keys(all).length === 0) {
        console.log('No settings saved yet.');
      } else {
        for (const [k, v] of Object.entries(all)) {
          const valStr = typeof v === 'object' ? (v.type === 'checkbox' ? String(v.checked) : String(v.value)) : String(v);
          console.log(`  \x1b[36m${k.padEnd(26)}\x1b[0m: ${valStr}`);
        }
      }
    } else if (sub === 'get') {
      const key = positional[1];
      if (!key) die('Key required. Usage: nyx-dlp-cli config get <key>');
      const val = settingsStore.getSettingValue(key);
      console.log(val !== null ? val : `(not set)`);
    } else if (sub === 'set') {
      const key = positional[1];
      const val = positional[2];
      if (!key || val === undefined) die('Key and value required. Usage: nyx-dlp-cli config set <key> <value>');
      const boolVal = val === 'true' ? true : (val === 'false' ? false : null);
      if (boolVal !== null) {
        settingsStore.updateSetting(key, { type: 'checkbox', checked: boolVal });
      } else {
        settingsStore.updateSetting(key, { type: 'text', value: val });
      }
      console.log(`\x1b[32m✔ Updated ${key} = ${val}\x1b[0m`);
    }
    break;
  }

  default:
    die(`Unknown tool: "${tool}". Run "nyx-dlp-cli --help" for available tools.`);
}
