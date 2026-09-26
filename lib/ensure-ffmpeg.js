const os = require('os');
const path = require('path');
const fs = require('fs');
const https = require('https');
const { execSync } = require('child_process');
// Since we only really need Windows for the GPU legacy stuff, we can focus on built-in tools.
// We can use `tar` command which is available on Windows 10+ for extracting zip files.

const { getVendorDir } = require('./vendor-dir');
const VENDOR_DIR = getVendorDir('ffmpeg');

const URLS = {
  win32: {
    'latest': 'https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-win64-gpl.zip',
    '5.1': 'https://github.com/GyanD/codexffmpeg/releases/download/5.1.2/ffmpeg-5.1.2-full_build.zip',
    '4.4': 'https://github.com/GyanD/codexffmpeg/releases/download/4.4.1/ffmpeg-4.4.1-full_build.zip'
  },
  linux: {
    'latest': 'https://johnvansickle.com/ffmpeg/releases/ffmpeg-release-amd64-static.tar.xz',
    '5.1': 'https://johnvansickle.com/ffmpeg/old-releases/ffmpeg-5.1.1-amd64-static.tar.xz',
    '4.4': 'https://johnvansickle.com/ffmpeg/old-releases/ffmpeg-4.4.1-amd64-static.tar.xz'
  },
  darwin: {
    'latest': 'https://evermeet.cx/ffmpeg/getrelease/zip',
    '5.1': 'https://evermeet.cx/ffmpeg/ffmpeg-5.1.2.zip',
    '4.4': 'https://evermeet.cx/ffmpeg/ffmpeg-4.4.1.zip'
  }
};

function getFfmpegPath() {
  const exe = os.platform() === 'win32' ? 'ffmpeg.exe' : 'ffmpeg';
  const vendorBin = path.join(VENDOR_DIR, exe);
  if (fs.existsSync(vendorBin)) {
    return vendorBin;
  }
  try {
    const checkCmd = os.platform() === 'win32' ? 'where.exe ffmpeg' : 'which ffmpeg';
    const out = execSync(checkCmd, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    const firstLine = out.trim().split(/\r?\n/)[0];
    if (firstLine && fs.existsSync(firstLine)) return firstLine;
  } catch (e) {}
  if (os.platform() === 'darwin') {
    const macPaths = ['/opt/homebrew/bin/ffmpeg', '/usr/local/bin/ffmpeg'];
    for (const p of macPaths) {
      if (fs.existsSync(p)) return p;
    }
  }
  return 'ffmpeg'; // fallback to system PATH
}

function getFfprobePath() {
  const exe = os.platform() === 'win32' ? 'ffprobe.exe' : 'ffprobe';
  const vendorBin = path.join(VENDOR_DIR, exe);
  if (fs.existsSync(vendorBin)) {
    return vendorBin;
  }
  try {
    const checkCmd = os.platform() === 'win32' ? 'where.exe ffprobe' : 'which ffprobe';
    const out = execSync(checkCmd, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    const firstLine = out.trim().split(/\r?\n/)[0];
    if (firstLine && fs.existsSync(firstLine)) return firstLine;
  } catch (e) {}
  if (os.platform() === 'darwin') {
    const macPaths = ['/opt/homebrew/bin/ffprobe', '/usr/local/bin/ffprobe'];
    for (const p of macPaths) {
      if (fs.existsSync(p)) return p;
    }
  }
  return 'ffprobe'; // fallback to system PATH
}

function getNvidiaDriverVersion() {
  try {
    const out = execSync('nvidia-smi --query-gpu=driver_version --format=csv,noheader,nounits', { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] });
    const lines = out.trim().split('\n');
    if (lines.length > 0) {
      return parseFloat(lines[0].split(' ')[0]);
    }
  } catch (e) {
    // No nvidia-smi
  }
  return null;
}

function determineFfmpegVersion(driverVer, isWin) {
  if (driverVer === null) return 'latest';
  try {
    const out = execSync('nvidia-smi --query-gpu=name --format=csv,noheader', { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] });
    const name = out.trim().split('\n')[0] || '';
    if (/GTX\s*(10\d0|9\d0|7\d0|6\d0|16\d0|TITAN\s*X)/i.test(name) || /GeForce\s*(GTX\s*10|GTX\s*9|GTX\s*7|GTX\s*6)/i.test(name)) {
      return '5.1';
    }
  } catch (_) {}

  if (isWin) {
    if (driverVer >= 522.25) return 'latest';
    if (driverVer >= 471.41) return '5.1';
    return '4.4';
  } else {
    if (driverVer >= 520.56) return 'latest';
    if (driverVer >= 470.57) return '5.1';
    return '4.4';
  }
}

const { downloadFileWithProgress } = require('./download-helper');

async function ensureFfmpeg(requestedVersion = 'auto', sendLog = console.log) {
  const exe = os.platform() === 'win32' ? 'ffmpeg.exe' : 'ffmpeg';
  const vendorBin = path.join(VENDOR_DIR, exe);

  if (fs.existsSync(vendorBin)) {
    return vendorBin; // Already vendored
  }

  if (requestedVersion === 'system' || requestedVersion === 'auto') {
    try {
      const checkCmd = os.platform() === 'win32' ? 'where.exe ffmpeg' : 'which ffmpeg';
      const out = execSync(checkCmd, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
      const firstLine = out.trim().split(/\r?\n/)[0];
      if (firstLine && fs.existsSync(firstLine)) {
        sendLog(`[setup] Using system FFmpeg (${firstLine})`);
        return firstLine;
      }
    } catch (_) {}
    if (requestedVersion === 'system') return 'ffmpeg';
  }

  sendLog(`[setup] Detecting environment for FFmpeg (mode: ${requestedVersion})...`);
  
  const osKey = os.platform() === 'win32' ? 'win32' : (os.platform() === 'darwin' ? 'darwin' : 'linux');
  
  let targetVersion = requestedVersion;
  if (requestedVersion === 'auto') {
    const driverVer = getNvidiaDriverVersion();
    if (driverVer) {
      sendLog(`[setup] Detected NVIDIA driver version: ${driverVer}`);
    } else {
      sendLog(`[setup] No NVIDIA GPU or driver detected. Using latest build.`);
    }
    targetVersion = determineFfmpegVersion(driverVer, osKey === 'win32');
  }

  let url = URLS[osKey]?.[targetVersion];
  if (!url) {
    if (targetVersion === '5.1.2') url = URLS[osKey]?.['5.1'];
    else if (targetVersion === '4.4.1') url = URLS[osKey]?.['4.4'];
    else if (osKey === 'win32') {
      const cleanTag = targetVersion.replace(/^v/, '');
      url = `https://github.com/GyanD/codexffmpeg/releases/download/${cleanTag}/ffmpeg-${cleanTag}-full_build.zip`;
    }
  }

  if (!url) {
    sendLog(`[setup] Platform ${os.platform()} not supported for automatic static builds or invalid version.`);
    throw new Error(`Version "${requestedVersion}" is not real or available for FFmpeg.`);
  }

  const archiveExt = url.endsWith('.zip') ? '.zip' : '.tar.xz';
  const archivePath = path.join(VENDOR_DIR, `ffmpeg_archive${archiveExt}`);

  try {
    sendLog(`[setup] Downloading FFmpeg ${targetVersion} from ${url}...`);
    await downloadFileWithProgress(url, archivePath, sendLog);
  } catch (err) {
    if (err.message && (err.message.includes('404') || err.message.includes('HTTP 404'))) {
      throw new Error(`Version "${requestedVersion}" is not real or available for FFmpeg.`);
    }
    throw err;
  }

  try {
    sendLog(`[setup] Extracting FFmpeg...`);
    
    if (archiveExt === '.zip') {
      try {
        // Use built-in tar command on Windows 10+ and macOS
        execSync(`tar -xf "${archivePath}" -C "${VENDOR_DIR}"`, { stdio: 'ignore' });
        
        // Flatten Windows extraction
        const extractedBase = fs.readdirSync(VENDOR_DIR).find(n => n.startsWith('ffmpeg-') && fs.statSync(path.join(VENDOR_DIR, n)).isDirectory());
        if (extractedBase) {
          const binDir = path.join(VENDOR_DIR, extractedBase, 'bin');
          if (fs.existsSync(binDir)) {
            const exes = fs.readdirSync(binDir);
            for (const exe of exes) {
              if (exe.endsWith('.exe') || exe === 'ffmpeg' || exe === 'ffprobe') {
                fs.copyFileSync(path.join(binDir, exe), path.join(VENDOR_DIR, exe));
              }
            }
          }
        }

        if (os.platform() !== 'win32') {
          const ffmpegBin = path.join(VENDOR_DIR, 'ffmpeg');
          if (fs.existsSync(ffmpegBin)) {
            fs.chmodSync(ffmpegBin, 0o755);
            try { execSync(`xattr -d com.apple.quarantine "${ffmpegBin}"`, { stdio: 'ignore' }); } catch (_) {}
          }
          // On macOS, if ffprobe was not in the zip, download ffprobe from evermeet as well
          const ffprobeBin = path.join(VENDOR_DIR, 'ffprobe');
          if (os.platform() === 'darwin' && !fs.existsSync(ffprobeBin)) {
            try {
              const probeZip = path.join(VENDOR_DIR, 'ffprobe_dl.zip');
              sendLog(`[setup] Downloading macOS ffprobe...`);
              await downloadFileWithProgress('https://evermeet.cx/ffmpeg/getrelease/ffprobe/zip', probeZip, sendLog);
              execSync(`tar -xf "${probeZip}" -C "${VENDOR_DIR}"`, { stdio: 'ignore' });
              if (fs.existsSync(probeZip)) fs.unlinkSync(probeZip);
              if (fs.existsSync(ffprobeBin)) {
                fs.chmodSync(ffprobeBin, 0o755);
                try { execSync(`xattr -d com.apple.quarantine "${ffprobeBin}"`, { stdio: 'ignore' }); } catch (_) {}
              }
            } catch (_) {}
          }
        }
      } catch (e) {
        sendLog(`[setup] Failed to extract or flatten FFmpeg: ${e.message}`);
        throw e;
      }
    } else {
      // For linux tar.xz, use tar
      execSync(`tar -xf "${archivePath}" -C "${VENDOR_DIR}"`, { stdio: 'ignore' });
      const files = execSync(`find "${VENDOR_DIR}" -name ffmpeg -type f`, { encoding: 'utf-8' }).trim().split('\n');
      if (files.length > 0 && files[0]) {
        const foundFfmpeg = files[0].trim();
        const binDir = path.dirname(foundFfmpeg);
        fs.copyFileSync(foundFfmpeg, path.join(VENDOR_DIR, 'ffmpeg'));
        fs.chmodSync(path.join(VENDOR_DIR, 'ffmpeg'), 0o755);
        
        const foundFfprobe = path.join(binDir, 'ffprobe');
        if (fs.existsSync(foundFfprobe)) {
          fs.copyFileSync(foundFfprobe, path.join(VENDOR_DIR, 'ffprobe'));
          fs.chmodSync(path.join(VENDOR_DIR, 'ffprobe'), 0o755);
        }
      }
    }
    
    // Clean up
    fs.unlinkSync(archivePath);
    // Cleanup extracted folders
    const contents = fs.readdirSync(VENDOR_DIR);
    for (const item of contents) {
      const itemPath = path.join(VENDOR_DIR, item);
      if (fs.statSync(itemPath).isDirectory()) {
        fs.rmSync(itemPath, { recursive: true, force: true });
      }
    }
    
    sendLog(`[setup] FFmpeg vendored successfully at ${VENDOR_DIR}`);
  } catch (e) {
    sendLog(`[setup] Failed to download/vendor FFmpeg: ${e.message}`);
    if (fs.existsSync(archivePath)) fs.unlinkSync(archivePath);
  }
}

module.exports = {
  getFfmpegPath,
  getFfprobePath,
  ensureFfmpeg
};
