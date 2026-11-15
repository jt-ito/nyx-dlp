// download-helper: swaps the file into place, keeps the old file on failure, retries transient errors.
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const { downloadFileWithProgress } = require('../lib/download-helper');

(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nyx-dl-'));
  const body = Buffer.alloc(4096, 7);
  let hits = 0;
  const srv = http.createServer((req, res) => {
    hits++;
    if (req.url === '/flaky' && hits === 1) { res.writeHead(503); return res.end(); }
    if (req.url === '/missing') { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'Content-Length': body.length });
    res.end(body);
  });
  await new Promise(r => srv.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${srv.port || srv.address().port}`;
  const logs = [];

  const dest = path.join(dir, 'tool.bin');
  fs.writeFileSync(dest, 'old');
  await downloadFileWithProgress(`${base}/ok`, dest, (m) => logs.push(m));
  assert.strictEqual(fs.readFileSync(dest).length, 4096, 'new file replaces the old one');
  assert(!fs.existsSync(dest + '.download'), 'no side file left behind');
  console.log('PASS: download replaces the file');

  hits = 0;
  fs.unlinkSync(dest);
  await downloadFileWithProgress(`${base}/flaky`, dest, (m) => logs.push(m));
  assert.strictEqual(hits, 2, 'a 503 is retried once');
  assert(logs.some(m => /retrying/i.test(m)));
  assert.strictEqual(fs.readFileSync(dest).length, 4096);
  console.log('PASS: transient failure is retried');

  hits = 0;
  fs.writeFileSync(dest, 'keep me');
  await assert.rejects(downloadFileWithProgress(`${base}/missing`, dest, () => {}), /404/);
  assert.strictEqual(hits, 1, '404 is not retried');
  assert.strictEqual(fs.readFileSync(dest, 'utf8'), 'keep me', 'a failed download leaves the old file alone');
  console.log('PASS: failure keeps the existing file');

  srv.close();
  fs.rmSync(dir, { recursive: true, force: true });
  console.log('\n ✔ ALL DOWNLOAD-HELPER TESTS PASSED');
})().catch((e) => { console.error('FAIL:', e); process.exit(1); });
