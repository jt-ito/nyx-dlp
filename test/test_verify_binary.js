// verify-binary: rejects short files and checksum mismatches, accepts a good one, tolerates an unreachable checksum list.
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const crypto = require('crypto');
const { verifyBinary, hashFromSums } = require('../lib/verify-binary');

(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nyx-vb-'));
  const good = path.join(dir, 'tool.exe.download');
  fs.copyFileSync(process.execPath, good);                      // a real executable that answers --version
  const sha = crypto.createHash('sha256').update(fs.readFileSync(good)).digest('hex');

  const sums = `${sha}  tool.exe\n${'0'.repeat(64)}  other.exe\n`;
  assert.strictEqual(hashFromSums(sums, 'tool.exe'), sha);
  assert.strictEqual(hashFromSums(sums, 'missing.exe'), null);

  const srv = http.createServer((req, res) => { res.writeHead(req.url === '/bad' ? 200 : 404); res.end(req.url === '/bad' ? `${'f'.repeat(64)}  tool.exe\n` : ''); });
  await new Promise(r => srv.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${srv.address().port}`;
  const goodSums = http.createServer((req, res) => { res.writeHead(200); res.end(sums); });
  await new Promise(r => goodSums.listen(0, '127.0.0.1', r));

  await verifyBinary(good, { name: 'tool.exe', sumsUrl: `http://127.0.0.1:${goodSums.address().port}/SUMS`, minBytes: 1000 });
  console.log('PASS: good file with matching checksum');
  await verifyBinary(good, { name: 'tool.exe', sumsUrl: `${base}/unreachable`, minBytes: 1000 });
  console.log('PASS: unreachable checksum list does not block the install');
  await assert.rejects(verifyBinary(good, { name: 'tool.exe', sumsUrl: `${base}/bad`, minBytes: 1000 }), /checksum does not match/);
  console.log('PASS: checksum mismatch is rejected');
  const tiny = path.join(dir, 'tiny.download'); fs.writeFileSync(tiny, 'x');
  await assert.rejects(verifyBinary(tiny, { minBytes: 1000 }), /failed verification/);
  console.log('PASS: truncated file is rejected');
  const junk = path.join(dir, 'junk.download'); fs.writeFileSync(junk, Buffer.alloc(5000, 1));
  await assert.rejects(verifyBinary(junk, { minBytes: 1000 }), /does not run/);
  console.log('PASS: a file that does not run is rejected');

  const { ytdlpAssetName } = require('../lib/ensure-ytdlp');
  assert.strictEqual(ytdlpAssetName('linux', 'x64'), 'yt-dlp_linux');
  assert.strictEqual(ytdlpAssetName('linux', 'arm64'), 'yt-dlp_linux_aarch64');
  assert.strictEqual(ytdlpAssetName('win32', 'x64'), 'yt-dlp.exe');
  assert.strictEqual(ytdlpAssetName('darwin', 'arm64'), 'yt-dlp_macos');
  console.log('PASS: Linux downloads the standalone yt-dlp build, not the Python script');

  srv.close(); goodSums.close(); fs.rmSync(dir, { recursive: true, force: true });
  console.log('\n ✔ ALL VERIFY-BINARY TESTS PASSED');
})().catch((e) => { console.error('FAIL:', e); process.exit(1); });
