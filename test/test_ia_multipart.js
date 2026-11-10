// Resumable Internet Archive uploads (lib/ia-multipart.js) against a local mock of the archive.org S3 API:
// part-by-part upload, per-part retry after dropped connections / SlowDown / redirects, resume after a stop,
// and a fresh start when archive.org forgot the upload.
const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');
const { uploadFile, createControl, itemHeaders, pickPartSize } = require('../lib/ia-multipart');

const MIB = 1024 * 1024;
const md5 = (b) => crypto.createHash('md5').update(b).digest('hex');

// ── mock archive.org ─────────────────────────────────────────────────────────
function startServer() {
  const s = { uploads: new Map(), files: new Map(), puts: [], faults: {}, auth: [], headers: [], port: 0, nextId: 1 };
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://x');
    s.auth.push(req.headers.authorization);
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('aborted', () => {});
    req.on('end', () => {
      const body = Buffer.concat(chunks);
      const key = url.pathname.replace(/^\/redir/, '');
      const send = (code, text, h = {}) => { res.writeHead(code, { 'Content-Type': 'application/xml', ...h }); res.end(text); };
      const q = url.searchParams;
      if (req.method === 'POST' && q.has('uploads')) {
        s.headers.push(req.headers);
        const id = 'up' + s.nextId++;
        s.uploads.set(id, { key, parts: {} });
        return send(200, `<InitiateMultipartUploadResult><UploadId>${id}</UploadId></InitiateMultipartUploadResult>`);
      }
      const up = s.uploads.get(q.get('uploadId'));
      if (!up) return send(404, '<Error><Code>NoSuchUpload</Code><Message>gone</Message></Error>');
      if (req.method === 'GET') {
        const xml = Object.entries(up.parts).map(([n, b]) => `<Part><PartNumber>${n}</PartNumber><ETag>"${md5(b)}"</ETag><Size>${b.length}</Size></Part>`).join('');
        return send(200, `<ListPartsResult>${xml}</ListPartsResult>`);
      }
      if (req.method === 'PUT') {
        const n = parseInt(q.get('partNumber'), 10);
        const f = s.faults[n];
        if (f === 'slowdown') { delete s.faults[n]; return send(503, '<Error><Code>SlowDown</Code><Message>slow</Message></Error>'); }
        if (f === 'redirect' && !url.pathname.startsWith('/redir')) { delete s.faults[n]; return send(307, '', { Location: `/redir${url.pathname}${url.search}` }); }
        s.puts.push(n);
        up.parts[n] = body;
        return send(200, '', { ETag: `"${md5(body)}"` });
      }
      if (req.method === 'POST') {
        s.headers.push(req.headers);
        const nums = [...body.toString().matchAll(/<PartNumber>(\d+)<\/PartNumber><ETag>([^<]+)<\/ETag>/g)];
        for (const [, n, etag] of nums) assert.strictEqual(etag, `"${md5(up.parts[n])}"`, 'complete lists the right etags');
        s.files.set(up.key, Buffer.concat(nums.map(([, n]) => up.parts[n])));
        return send(200, '<CompleteMultipartUploadResult/>');
      }
      send(405, '');
    });
  });
  // Fault: kill the socket on the first attempt of a part, as soon as its body starts arriving.
  const origEmit = server.emit.bind(server);
  server.emit = (ev, req, res, ...rest) => {
    if (ev === 'request' && req.method === 'PUT') {
      const n = parseInt(new URL(req.url, 'http://x').searchParams.get('partNumber'), 10);
      if (s.faults[n] === 'reset') { delete s.faults[n]; req.once('data', () => req.socket.destroy()); }
    }
    return origEmit(ev, req, res, ...rest);
  };
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => { s.port = server.address().port; s.close = () => server.close(); resolve(s); }));
}

(async () => {
  // header building
  const h = itemHeaders({ title: 'Café', subject: ['a', 'b'], empty: '' }, { noDerive: true, sizeHint: 5 });
  assert.strictEqual(h['x-archive-meta-title'], 'uri(' + encodeURIComponent('Café') + ')', 'non-ASCII goes through uri()');
  assert.strictEqual(h['x-archive-meta01-subject'], 'a');
  assert.strictEqual(h['x-archive-meta02-subject'], 'b');
  assert.strictEqual(h['x-archive-queue-derive'], '0');
  assert(!('x-archive-meta-empty' in h));
  assert.strictEqual(pickPartSize(50 * 1024 * MIB), 64 * MIB, 'a 50 GB file keeps 64 MiB parts');
  assert(pickPartSize(2 * 1024 * 1024 * MIB) > 64 * MIB && Math.ceil(2 * 1024 * 1024 * MIB / pickPartSize(2 * 1024 * 1024 * MIB)) <= 9000, 'a 2 TB file grows the part size to stay under the part limit');
  console.log('PASS: headers and part sizing');

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nyx-iamp-'));
  const file = path.join(dir, 'big.bin');
  const data = crypto.randomBytes(5 * MIB + 12345);          // 6 parts of 1 MiB
  fs.writeFileSync(file, data);
  const stateDir = path.join(dir, 'state');
  const base = (srv, extra = {}) => ({ file, identifier: 'item1', key: 'big.bin', accessKey: 'AK', secretKey: 'SK', endpoint: `http://127.0.0.1:${srv.port}`, partSize: MIB, stateDir, backoffScale: 0.001, log: () => {}, ...extra });

  const srv = await startServer();
  try {
    // 1. plain
    let r = await uploadFile(base(srv, { meta: { title: 'T' }, noDerive: true }));
    assert.strictEqual(r.parts, 6);
    assert.strictEqual(md5(srv.files.get('/item1/big.bin')), md5(data), 'the assembled file is identical');
    assert(srv.auth.every(a => a === 'LOW AK:SK'), 'every request is authenticated');
    assert.strictEqual(srv.headers[0]['x-archive-meta-title'], 'T');
    assert.strictEqual(srv.headers[0]['x-archive-queue-derive'], '0');
    assert.strictEqual(srv.headers[0]['x-archive-auto-make-bucket'], '1');
    assert.strictEqual(fs.readdirSync(stateDir).length, 0, 'finished uploads leave no state behind');
    console.log('PASS: multipart upload');

    // 2. dropped connection, SlowDown and a redirect each cost one part, not the file
    srv.puts.length = 0; srv.files.clear();
    srv.faults = { 2: 'reset', 3: 'slowdown', 4: 'redirect' };
    const logs = [];
    r = await uploadFile(base(srv, { log: (t) => logs.push(t) }));
    assert.strictEqual(md5(srv.files.get('/item1/big.bin')), md5(data), 'identical after faults');
    assert.deepStrictEqual([...new Set(srv.puts)].sort(), [1, 2, 3, 4, 5, 6]);
    assert(logs.some(l => /Part 2\/6/.test(l)), 'the reset part was retried: ' + logs.join('|'));
    assert(logs.some(l => /Part 3\/6.*SlowDown|Part 3\/6.*slow/i.test(l)), 'SlowDown was waited out');
    assert(srv.puts.filter(n => n === 1).length === 1, 'finished parts are not re-sent');
    console.log('PASS: retries per part');

    // 3. stop halfway, then run again: only the missing parts go up
    srv.puts.length = 0; srv.files.clear(); srv.faults = {};
    const ctl = createControl();
    await assert.rejects(uploadFile(base(srv, { ctl, onProgress: (p) => { if (p.partNumber === 3 && p.sent >= 3 * MIB) ctl.abort(); } })), (e) => e.code === 'ABORTED');
    assert.strictEqual(fs.readdirSync(stateDir).length, 1, 'the unfinished upload is remembered');
    const sentBefore = srv.puts.length;
    srv.puts.length = 0;
    r = await uploadFile(base(srv));
    assert.strictEqual(r.resumed, true);
    assert(sentBefore >= 2 && srv.puts.length <= 6 - 2, `resume skipped the finished parts (sent ${srv.puts.length} after ${sentBefore} before)`);
    assert.strictEqual(md5(srv.files.get('/item1/big.bin')), md5(data), 'identical after resume');
    console.log('PASS: resume after stop');

    // 4. archive.org forgot the upload: start over cleanly
    srv.puts.length = 0; srv.files.clear();
    const ctl2 = createControl();
    await assert.rejects(uploadFile(base(srv, { ctl: ctl2, onProgress: (p) => { if (p.partNumber === 2 && p.sent >= 2 * MIB) ctl2.abort(); } })), (e) => e.code === 'ABORTED');
    srv.uploads.clear();
    srv.puts.length = 0;
    r = await uploadFile(base(srv));
    assert.strictEqual(md5(srv.files.get('/item1/big.bin')), md5(data), 'identical after a fresh start');
    assert.deepStrictEqual([...new Set(srv.puts)].sort(), [1, 2, 3, 4, 5, 6], 'everything was sent again');
    console.log('PASS: expired upload restarts');

    // 5. a changed file never resumes into stale parts
    const ctl3 = createControl();
    await assert.rejects(uploadFile(base(srv, { ctl: ctl3, onProgress: (p) => { if (p.partNumber === 2 && p.sent >= 2 * MIB) ctl3.abort(); } })), (e) => e.code === 'ABORTED');
    const data2 = crypto.randomBytes(5 * MIB + 99);
    fs.writeFileSync(file, data2);
    srv.files.clear();
    r = await uploadFile(base(srv));
    assert.strictEqual(r.resumed, false);
    assert.strictEqual(md5(srv.files.get('/item1/big.bin')), md5(data2), 'the new contents were uploaded');
    console.log('PASS: changed file starts over');

    // 6. bad keys are not retried forever
    srv.uploads.clear();
    const t0 = Date.now();
    const bad = http.createServer((q, s) => { s.writeHead(403); s.end('<Error><Code>AccessDenied</Code><Message>no</Message></Error>'); });
    await new Promise(r2 => bad.listen(0, '127.0.0.1', r2));
    await assert.rejects(uploadFile(base({ port: bad.address().port }, { stateDir: path.join(dir, 'state2') })), (e) => e.status === 403 && !e.retryable);
    bad.close();
    assert(Date.now() - t0 < 5000);
    console.log('PASS: auth errors fail fast');

    // 7. through the real runner: progress lines, stop + resume
    const runners = require('../lib/runners');
    fs.writeFileSync(file, data);
    srv.files.clear(); srv.uploads.clear(); srv.puts.length = 0;
    const runUpload = (onMsg) => new Promise((resolve) => {
      runners.runIaUpload({ files: [file], identifier: 'item2', title: 'Hello', subject: 'a, b', noDerive: true, resumableMinBytes: 1,
        iaKeys: { access: 'AK', secret: 'SK' }, iaEndpoint: `http://127.0.0.1:${srv.port}`, iaPartSize: MIB, iaStateDir: path.join(dir, 'state3'), iaBackoffScale: 0.001 },
        (m) => { onMsg && onMsg(m); if (m.type === 'exit') resolve(m.code); });
    });
    let pid = null, out = '';
    let code = await runUpload((m) => {
      if (m.type === 'pid') pid = m.pid;
      if (m.text) out += m.text;
      if (m.text && /uploading big\.bin: (\d+)%/.test(m.text) && srv.puts.length >= 2 && pid) { const p = pid; pid = null; runners.stopProc(p); }
    });
    assert.strictEqual(code, null, 'Stop ends the run without an error exit\n' + out);
    assert(/Progress on big\.bin is saved/.test(out));
    assert.strictEqual(fs.readdirSync(path.join(dir, 'state3')).length, 1);
    out = ''; srv.puts.length = 0;
    code = await runUpload((m) => { if (m.text) out += m.text; });
    assert.strictEqual(code, 0, out);
    assert(/uploading big\.bin: 100%/.test(out) && /\(resumed\)/.test(out), out);
    assert.strictEqual(md5(srv.files.get('/item2/big.bin')), md5(data));
    assert(srv.puts.length < 6, 'the second run only sent what was missing');
    assert.strictEqual(srv.headers.find(h => h['x-archive-meta-title'] === 'Hello')['x-archive-meta02-subject'], 'b');
    console.log('PASS: runner integration (progress, stop, resume)');

    console.log('\n ✔ ALL IA MULTIPART TESTS PASSED');
  } catch (e) {
    console.error('FAIL:', e && e.stack || e);
    process.exitCode = 1;
  } finally {
    srv.close();
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch (_) { /* ignore */ }
  }
})();
