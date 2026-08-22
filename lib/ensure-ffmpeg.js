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
  if (isWin) {
    if (driverVer >= 610.00) return 'latest';
    if (driverVer >= 471.41) return '5.1';
    return '4.4';
  } else {
    if (driverVer >= 610.00) return 'latest';
    if (driverVer >= 470.57) return '5.1';
    return '4.4';
  }
}

function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }, timeout: 30000 }, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        return downloadFile(res.headers.location, dest).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) {
        return reject(new Error(`Failed to download: ${res.statusCode}`));
      }
      const file = fs.createWriteStream(dest);
      res.pipe(file);
      file.on('finish', () => {
        file.close();
        resolve();
      });
      file.on('error', reject);
    });
    req.on('timeout', () => { req.destroy(); reject(new Error('Download timed out')); });
    req.on('error', reject);
  });
}

async function ensureFfmpeg(requestedVersion = 'auto', sendLog = console.log) {
  const exe = os.platform() === 'win32' ? 'ffmpeg.exe' : 'ffmpeg';
  const vendorBin = path.join(VENDOR_DIR, exe);

  if (fs.existsSync(vendorBin)) {
    return; // Already vendored
  }

  if (requestedVersion === 'system') {
    return; // User explicitly requested system FFmpeg
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

  const url = URLS[osKey]?.[targetVersion];
  if (!url) {
    sendLog(`[setup] Platform ${os.platform()} not supported for automatic static builds or invalid version.`);
    return;
  }

  try {
    fs.mkdirSync(VENDOR_DIR, { recursive: true });
  } catch (e) {
    sendLog(`[setup] Failed to create FFmpeg vendor directory: ${e.message}`);
    throw e;
  }
  const archiveExt = url.endsWith('.zip') ? '.zip' : '.tar.xz';
  const archivePath = path.join(VENDOR_DIR, `ffmpeg_archive${archiveExt}`);

  try {
    sendLog(`[setup] Downloading FFmpeg ${targetVersion} from ${url}...`);
    try {
      await downloadFile(url, archivePath);
    } catch (e) {
      sendLog(`[setup] Failed to download FFmpeg: ${e.message}`);
      throw e;
    }
    sendLog(`[setup] Extracting FFmpeg...`);
    
    if (archiveExt === '.zip') {
      try {
        // Use built-in tar command on Windows 10+
        execSync(`tar -xf "${archivePath}" -C "${VENDOR_DIR}"`, { stdio: 'ignore' });
        
        // Flatten Windows extraction
        const extractedBase = fs.readdirSync(VENDOR_DIR).find(n => n.startsWith('ffmpeg-') && fs.statSync(path.join(VENDOR_DIR, n)).isDirectory());
        if (extractedBase) {
          const binDir = path.join(VENDOR_DIR, extractedBase, 'bin');
          if (fs.existsSync(binDir)) {
            const exes = fs.readdirSync(binDir);
            for (const exe of exes) {
              if (exe.endsWith('.exe')) {
                fs.copyFileSync(path.join(binDir, exe), path.join(VENDOR_DIR, exe));
              }
            }
          }
        }
      } catch (e) {
        sendLog(`[setup] Failed to extract or flatten FFmpeg (Windows): ${e.message}`);
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
