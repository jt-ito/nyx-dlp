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

const runners = require('./lib/runners.js');

function broadcastTerminal(data) {
  if (data.type === 'stdout' && data.text) process.stdout.write(data.text);
  if (data.type === 'stderr' && data.text) process.stderr.write(data.text);
  if (data.type === 'error' && data.text) console.error('Error:', data.text);
  if (data.type === 'exit') process.exit(data.code || 0);
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

// Prepare opts
const opts = { outputDir: outDir };
if (outDir) fs.mkdirSync(outDir, { recursive: true });

switch (tool) {
  case 'ytdlp': {
    const url = positional[0];
    if (!url) die('URL required. Usage: nyx-dlp-cli ytdlp <url> -o <dir>');
    if (!outDir) die('Output directory required (-o <dir>)');
    opts.url = url;
    opts.format = flags.f || flags.format || 'bestvideo+bestaudio/best';
    opts.cookiesPath = flags.c || flags.cookies || '';
    opts.container = flags.container || 'mp4';
    opts.extraArgs = JSON.parse(flags['extra-args'] || '[]');
    opts.startTime = flags['start-time'] || '';
    opts.endTime = flags['end-time'] || '';
    runners.runYtdlp(opts, broadcastTerminal);
    break;
  }

  case 'batch': {
    if (!outDir) die('Output directory required (-o <dir>)');
    opts.format = flags.f || flags.format || 'bestvideo+bestaudio/best';
    opts.rest = flags.rest || '0';
    opts.cookiesPath = flags.c || flags.cookies || '';
    opts.container = flags.container || 'mp4';
    opts.extraArgs = JSON.parse(flags['extra-args'] || '[]');
    const urls = positional.length > 0 ? positional : [];
    if (urls.length === 0 && process.stdin.isTTY) {
      die('Pipe URLs via stdin or pass them as arguments.\nExample: cat urls.txt | nyx-dlp-cli batch -o ./output');
    }
    opts.urls = urls;
    
    if (urls.length > 0) {
      runners.runBatch(opts, broadcastTerminal);
    } else {
      let stdinData = '';
      process.stdin.setEncoding('utf-8');
      process.stdin.on('data', chunk => stdinData += chunk);
      process.stdin.on('end', () => {
        opts.urls = stdinData.split('\n').map(l => l.trim()).filter(Boolean);
        runners.runBatch(opts, broadcastTerminal);
      });
    }
    break;
  }

  case 'livestream': {
    const url = positional[0];
    if (!url) die('URL required. Usage: nyx-dlp-cli livestream <url> -o <dir>');
    if (!outDir) die('Output directory required (-o <dir>)');
    opts.url = url;
    opts.format = flags.f || flags.format || 'best';
    opts.cookiesPath = flags.c || flags.cookies || '';
    opts.container = flags.container || 'mp4';
    opts.client = flags.client || 'default';
    opts.fromStart = flags['from-start'] || 'y';
    opts.concurrent = flags.concurrent || '5';
    runners.runLivestream(opts, broadcastTerminal);
    break;
  }

  case 'm3u8': {
    const url = positional[0];
    if (!url) die('URL required. Usage: nyx-dlp-cli m3u8 <url> -o <dir>');
    if (!outDir) die('Output directory required (-o <dir>)');
    opts.url = url;
    opts.encode = !!flags.encode;
    opts.codec = flags.codec || 'h264';
    opts.bitrate = flags.bitrate || '5M';
    opts.resolution = flags.resolution || '1920x1080';
    opts.fps = flags.fps || '30';
    opts.audioBitrate = flags['audio-bitrate'] || '192k';
    opts.container = flags.container || 'mp4';
    opts.cookiesPath = flags.c || flags.cookies || '';
    runners.runM3u8(opts, broadcastTerminal);
    break;
  }

  case 'gallery-dl': {
    const url = positional[0];
    if (!url) die('URL required. Usage: nyx-dlp-cli gallery-dl <url> -o <dir>');
    if (!outDir) die('Output directory required (-o <dir>)');
    opts.url = url;
    opts.filetypes = flags.filetypes || '';
    opts.metadata = !!flags.metadata;
    opts.cookiesPath = flags.c || flags.cookies || '';
    runners.runGalleryDl(opts, broadcastTerminal);
    break;
  }

  case 'splitter': {
    const file = positional[0];
    if (!file) die('File required. Usage: nyx-dlp-cli splitter <file> -o <dir> --parts <n>');
    if (!flags.parts) die('--parts <n> required');
    opts.file = file;
    opts.parts = flags.parts;
    opts.partsToSave = flags['parts-to-save'];
    opts.containerFormat = flags.format;
    opts.outputDir = outDir || path.dirname(file);
    runners.runSplitter(opts, broadcastTerminal);
    break;
  }

  case 'concat': {
    const files = positional;
    if (files.length < 2) die('At least 2 files required. Usage: nyx-dlp-cli concat -o <dir> --output <name> <file1> <file2> ...');
    if (!flags.output) die('--output <filename> required');
    opts.files = files;
    opts.output = flags.output;
    opts.forceEncode = !!flags['force-encode'];
    opts.outputDir = outDir || path.dirname(files[0]);
    runners.runConcatenator(opts, broadcastTerminal);
    break;
  }

  case 'encoder': {
    const files = positional;
    if (files.length === 0) die('At least 1 file required. Usage: nyx-dlp-cli encoder -o <dir> <file1> ...');
    opts.files = files;
    opts.mode = flags.mode;
    opts.vcodec = flags.vcodec;
    opts.acodec = flags.acodec;
    opts.outputDir = outDir || path.dirname(files[0]);
    runners.runEncoder(opts, broadcastTerminal);
    break;
  }

  default:
    die(`Unknown tool: "${tool}". Run "nyx-dlp-cli --help" for available tools.`);
}
