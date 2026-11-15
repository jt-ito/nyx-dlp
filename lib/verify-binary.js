// Checks a freshly downloaded tool binary before it replaces the working one: size, SHA-256 against the
// publisher's checksum file (when one is reachable), and that it actually runs.
const fs = require('fs');
const crypto = require('crypto');
const https = require('https');
const http = require('http');
const { execFile } = require('child_process');

function fetchText(url, redirects = 5, timeoutMs = 15000) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http;
    const req = client.get(url, { headers: { 'User-Agent': 'nyx-dlp' }, timeout: timeoutMs }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location && redirects > 0) {
        res.resume();
        return resolve(fetchText(new URL(res.headers.location, url).toString(), redirects - 1, timeoutMs));
      }
      if (res.statusCode !== 200) { res.resume(); return reject(new Error(`HTTP ${res.statusCode}`)); }
      let data = '';
      res.setEncoding('utf8');
      res.on('data', (c) => { data += c; if (data.length > 1 << 20) req.destroy(new Error('too large')); });
      res.on('end', () => resolve(data));
    });
    req.on('timeout', () => req.destroy(new Error('timed out')));
    req.on('error', reject);
  });
}

function sha256File(file) {
  return new Promise((resolve, reject) => {
    const h = crypto.createHash('sha256');
    fs.createReadStream(file).on('data', (d) => h.update(d)).on('end', () => resolve(h.digest('hex'))).on('error', reject);
  });
}

// "<hash>  <file name>" lines, as in yt-dlp's SHA2-256SUMS
function hashFromSums(text, name) {
  for (const line of String(text).split(/\r?\n/)) {
    const m = /^([0-9a-f]{64})\s+\*?(.+?)\s*$/i.exec(line);
    if (m && m[2] === name) return m[1].toLowerCase();
  }
  return null;
}

function runVersion(file, args, timeoutMs) {
  return new Promise((resolve, reject) => {
    try {
      execFile(file, args, { timeout: timeoutMs, windowsHide: true }, (err, stdout) => {
        if (err) return reject(new Error(`it does not run (${err.code || err.message})`));
        if (!String(stdout).trim()) return reject(new Error('it printed no version'));
        resolve(String(stdout).trim().split(/\r?\n/)[0]);
      });
    } catch (err) {   // some platforms throw straight away for a file that is not an executable
      reject(new Error(`it does not run (${err.code || err.message})`));
    }
  });
}

// opts: { name, sumsUrl, minBytes, versionArgs, skipRun }. Throws "Downloaded file failed verification: ..." when bad.
// A checksum file that cannot be fetched (offline mirror, rate limit) does not fail the install; a mismatch does.
async function verifyBinary(file, opts = {}) {
  const fail = (why) => { throw new Error(`Downloaded file failed verification: ${why}`); };
  const size = fs.statSync(file).size;
  if (size < (opts.minBytes || 1000000)) fail(`only ${size} bytes`);
  if (opts.sumsUrl && opts.name) {
    let sums = null;
    try { sums = await fetchText(opts.sumsUrl); } catch (_) { }
    const want = sums ? hashFromSums(sums, opts.name) : null;
    if (want) {
      const got = await sha256File(file);
      if (got !== want) fail('checksum does not match the published one');
    }
  }
  if (!opts.skipRun) {
    if (process.platform !== 'win32') { try { fs.chmodSync(file, 0o755); } catch (_) { } }   // a fresh download is not executable yet
    try { await runVersion(file, opts.versionArgs || ['--version'], opts.timeoutMs || 30000); } catch (e) { fail(e.message); }
  }
}

module.exports = { verifyBinary, hashFromSums, sha256File, fetchText };
