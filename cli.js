#!/usr/bin/env node
/**
 * nyx-dlp CLI — headless command-line interface
 *
 * Usage:
 *   nyx-dlp-cli <tool> [options]
 *
 * Tools:
 *   ytdlp       <url> -o <dir> [-f format] [-c cookies] [--container mp4] [--extra-args '["--arg"]']
 *   batch       -o <dir> [-f format] [-c cookies] [--container mp4] [--rest seconds] [--extra-args '["--arg"]'] < urls.txt
 *   livestream  <url> -o <dir> [-f format] [-c cookies] [--container mp4] [--client default]
 *   m3u8        <url> -o <dir> [--encode] [--codec h264] [--bitrate 5M] [--resolution 1920x1080]
 *   gallery-dl  <url> -o <dir> [--filetypes "jpg,png,gif"] [--metadata] [-c cookies]
 *   splitter    <file> -o <dir> --parts <n> [--format mp4]
 *   concat      -o <dir> --output <name> [--force-encode] <file1> <file2> ...
 *   encoder     -o <dir> [--mode sequential] [--vcodec libx264] [--acodec aac] <file1> ...
 */

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

// Resolve scripts directory — either bundled alongside or in dev
const scriptsDir = fs.existsSync(path.join(__dirname, 'resources', 'scripts'))
  ? path.join(__dirname, 'resources', 'scripts')
  : path.join(__dirname, 'scripts');

const pythonCmd = process.platform === 'win32' ? 'python' : 'python3';

// ── Argument parsing ─────────────────────────────────────────────────
function parseArgs(argv) {
  const positional = [];
  const flags = {};
  let i = 0;
  while (i < argv.length) {
    const arg = argv[i];
    if (arg.startsWith('--')) {
      const key = arg.slice(2);
      // Boolean-style flags (no next arg or next arg is also a flag)
      if (i + 1 >= argv.length || argv[i + 1].startsWith('--') || argv[i + 1].startsWith('-')) {
        flags[key] = true;
      } else {
        flags[key] = argv[++i];
      }
    } else if (arg.startsWith('-') && arg.length === 2) {
      const key = arg.slice(1);
      if (i + 1 < argv.length) {
        flags[key] = argv[++i];
      } else {
        flags[key] = true;
      }
    } else {
      positional.push(arg);
    }
    i++;
  }
  return { positional, flags };
}

function die(msg) {
  console.error(`Error: ${msg}`);
  process.exit(1);
}

function runPython(scriptName, args, cwd, stdinLines = []) {
  const scriptPath = path.join(scriptsDir, scriptName);
  if (!fs.existsSync(scriptPath)) {
    die(`Script not found: ${scriptPath}`);
  }

  // Ensure output dir exists
  if (cwd) {
    fs.mkdirSync(cwd, { recursive: true });
  }

  const proc = spawn(pythonCmd, ['-u', scriptPath, ...args], {
    cwd: cwd || process.cwd(),
    stdio: ['pipe', 'inherit', 'inherit'],
    env: { ...process.env, PYTHONUNBUFFERED: '1', PYTHONIOENCODING: 'utf-8' }
  });

  for (const line of stdinLines) {
    proc.stdin.write(line + '\n');
  }
  proc.stdin.end();

  proc.on('close', (code) => process.exit(code || 0));
  proc.on('error', (err) => die(err.message));
}

// ── Tool dispatch ────────────────────────────────────────────────────
const tool = process.argv[2];
const { positional, flags } = parseArgs(process.argv.slice(3));
const outDir = flags.o || flags.output || null;

if (!tool || tool === '--help' || tool === '-h') {
  console.log(`
nyx-dlp CLI v${require('./package.json').version}

Usage: nyx-dlp-cli <tool> [options]

Tools:
  ytdlp        Download a single video with yt-dlp
  batch        Batch download URLs (pipe via stdin)
  livestream   Archive a YouTube live stream
  m3u8         Download and optionally encode an M3U8 stream
  gallery-dl   Download images/media with gallery-dl
  splitter     Split a video into N parts
  concat       Concatenate multiple videos
  encoder      Re-encode video files

Run "nyx-dlp-cli <tool> --help" for tool-specific options.
`);
  process.exit(0);
}

switch (tool) {
  case 'ytdlp': {
    const url = positional[0];
    if (!url) die('URL required. Usage: nyx-dlp-cli ytdlp <url> -o <dir>');
    if (!outDir) die('Output directory required (-o <dir>)');
    const format = flags.f || flags.format || 'bestvideo+bestaudio/best';
    const cookies = flags.c || flags.cookies || '';
    const container = flags.container || 'mp4';
    const extraArgs = flags['extra-args'] || '[]';
    const startTime = flags['start-time'] || '';
    const endTime = flags['end-time'] || '';
    runPython('yt-dlp.py', [url, format, cookies, extraArgs, container, startTime, endTime, 'local', 'n'], outDir);
    break;
  }

  case 'batch': {
    if (!outDir) die('Output directory required (-o <dir>)');
    const format = flags.f || flags.format || 'bestvideo+bestaudio/best';
    const rest = flags.rest || '0';
    const cookies = flags.c || flags.cookies || '';
    const container = flags.container || 'mp4';
    const extraArgs = flags['extra-args'] || '[]';
    // Read URLs from stdin or positional args
    const urls = positional.length > 0 ? positional : [];
    if (urls.length === 0 && process.stdin.isTTY) {
      die('Pipe URLs via stdin or pass them as arguments.\nExample: cat urls.txt | nyx-dlp-cli batch -o ./output');
    }
    if (urls.length > 0) {
      runPython('yt-dlp_multi.py', [format, rest, cookies, extraArgs, container, 'local', 'n'], outDir, [...urls, '']);
    } else {
      // Forward stdin directly
      const proc = spawn(pythonCmd, ['-u', path.join(scriptsDir, 'yt-dlp_multi.py'), format, rest, cookies, extraArgs, container, 'local', 'n'], {
        cwd: outDir,
        stdio: ['inherit', 'inherit', 'inherit'],
        env: { ...process.env, PYTHONUNBUFFERED: '1', PYTHONIOENCODING: 'utf-8' }
      });
      proc.on('close', (code) => process.exit(code || 0));
      proc.on('error', (err) => die(err.message));
    }
    break;
  }

  case 'livestream': {
    const url = positional[0];
    if (!url) die('URL required. Usage: nyx-dlp-cli livestream <url> -o <dir>');
    if (!outDir) die('Output directory required (-o <dir>)');
    const format = flags.f || flags.format || 'best';
    const cookies = flags.c || flags.cookies || '';
    const container = flags.container || 'mp4';
    const client = flags.client || 'default';
    const fromStart = flags['from-start'] || 'y';
    const concurrent = flags.concurrent || '5';
    runPython('yt-archiver.py', [url, format, cookies, container, 'local', 'n', client, fromStart, concurrent], outDir);
    break;
  }

  case 'm3u8': {
    const url = positional[0];
    if (!url) die('URL required. Usage: nyx-dlp-cli m3u8 <url> -o <dir>');
    if (!outDir) die('Output directory required (-o <dir>)');
    const encode = flags.encode ? 'y' : 'n';
    const codec = flags.codec || 'h264';
    const bitrate = flags.bitrate || '5M';
    const resolution = flags.resolution || '1920x1080';
    const fps = flags.fps || '30';
    const audioBitrate = flags['audio-bitrate'] || '192k';
    const container = flags.container || 'mp4';
    const cookies = flags.c || flags.cookies || '';
    runPython('Download_and_convert_a_m3u8_url.py', [url, encode, codec, bitrate, resolution, fps, audioBitrate, container, cookies], outDir);
    break;
  }

  case 'gallery-dl': {
    const url = positional[0];
    if (!url) die('URL required. Usage: nyx-dlp-cli gallery-dl <url> -o <dir>');
    if (!outDir) die('Output directory required (-o <dir>)');
    const filetypes = flags.filetypes || '';
    const metadata = flags.metadata ? 'y' : 'n';
    const cookies = flags.c || flags.cookies || '';
    runPython('gallery-dl.py', [url, filetypes, metadata, cookies, 'y'], outDir);
    break;
  }

  case 'splitter': {
    const file = positional[0];
    if (!file) die('File required. Usage: nyx-dlp-cli splitter <file> -o <dir> --parts <n>');
    const parts = flags.parts;
    if (!parts) die('--parts <n> required');
    const targetDir = outDir || path.dirname(file);
    const args = [file, parts, targetDir];
    if (flags.format) args.push('--format', flags.format);
    runPython('video-splitter.py', args, targetDir);
    break;
  }

  case 'concat': {
    const files = positional;
    if (files.length < 2) die('At least 2 files required. Usage: nyx-dlp-cli concat -o <dir> --output <name> <file1> <file2> ...');
    const outputName = flags.output;
    if (!outputName) die('--output <filename> required');
    const targetDir = outDir || path.dirname(files[0]);
    const args = ['--output', outputName];
    if (flags['force-encode']) args.push('--force-encode');
    args.push(...files);
    runPython('video-concatenator.py', args, targetDir);
    break;
  }

  case 'encoder': {
    const files = positional;
    if (files.length === 0) die('At least 1 file required. Usage: nyx-dlp-cli encoder -o <dir> <file1> ...');
    const targetDir = outDir || path.dirname(files[0]);
    const args = [];
    if (flags.mode) args.push('--mode', flags.mode);
    if (flags.vcodec) args.push('--vcodec', flags.vcodec);
    if (flags.acodec) args.push('--acodec', flags.acodec);
    args.push(...files);
    runPython('video-encoder.py', args, targetDir);
    break;
  }

  default:
    die(`Unknown tool: "${tool}". Run "nyx-dlp-cli --help" for available tools.`);
}
