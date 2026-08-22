const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const os = require('os');
const { spawn } = require('child_process');

function downloadFileWithProgress(url, dest, sendLog = console.log, maxRedirects = 5) {
  return new Promise((resolve, reject) => {
    if (maxRedirects < 0) {
      return reject(new Error('Too many redirects while downloading'));
    }

    // Try fast system curl if on Linux/macOS
    if (os.platform() !== 'win32') {
      try {
        const curl = spawn('curl', ['-fL', '--progress-bar', '-o', dest, url]);
        let lastReport = 0;
        curl.stderr.on('data', (d) => {
          const now = Date.now();
          if (now - lastReport > 2000) {
            lastReport = now;
            sendLog(`[setup] Downloading... ${d.toString().trim()}`);
          }
        });
        curl.on('close', (code) => {
          if (code === 0 && fs.existsSync(dest) && fs.statSync(dest).size > 1000) {
            return resolve();
          }
          // If curl failed, fallback to native node stream
          downloadWithNodeHttp(url, dest, sendLog, maxRedirects).then(resolve).catch(reject);
        });
        curl.on('error', () => {
          downloadWithNodeHttp(url, dest, sendLog, maxRedirects).then(resolve).catch(reject);
        });
        return;
      } catch (_) {
        // Fallback to node http
      }
    }

    downloadWithNodeHttp(url, dest, sendLog, maxRedirects).then(resolve).catch(reject);
  });
}

function downloadWithNodeHttp(url, dest, sendLog, maxRedirects) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http;
    const req = client.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) nyx-dlp/3.0',
        'Accept': '*/*'
      },
      timeout: 45000
    }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        let redirectUrl = res.headers.location;
        if (!redirectUrl.startsWith('http')) {
          const u = new URL(url);
          redirectUrl = `${u.protocol}//${u.host}${redirectUrl}`;
        }
        res.resume();
        return downloadFileWithProgress(redirectUrl, dest, sendLog, maxRedirects - 1).then(resolve).catch(reject);
      }

      if (res.statusCode !== 200) {
        res.resume();
        return reject(new Error(`Server responded with HTTP ${res.statusCode}`));
      }

      const totalBytes = parseInt(res.headers['content-length'] || '0', 10);
      let downloadedBytes = 0;
      let lastLogTime = 0;

      const fileStream = fs.createWriteStream(dest);

      res.on('data', (chunk) => {
        downloadedBytes += chunk.length;
        const now = Date.now();
        if (now - lastLogTime > 1500 && totalBytes > 0) {
          lastLogTime = now;
          const pct = ((downloadedBytes / totalBytes) * 100).toFixed(1);
          const mbDown = (downloadedBytes / 1048576).toFixed(1);
          const mbTotal = (totalBytes / 1048576).toFixed(1);
          sendLog(`[setup] Downloading: ${pct}% (${mbDown} MB / ${mbTotal} MB)...`);
        }
      });

      res.pipe(fileStream);

      fileStream.on('finish', () => {
        fileStream.close(() => resolve());
      });

      fileStream.on('error', (err) => {
        fs.unlink(dest, () => {});
        reject(err);
      });
    });

    req.on('timeout', () => {
      req.destroy();
      fs.unlink(dest, () => {});
      reject(new Error('Connection timed out'));
    });

    req.on('error', (err) => {
      fs.unlink(dest, () => {});
      reject(err);
    });
  });
}

module.exports = {
  downloadFileWithProgress
};
