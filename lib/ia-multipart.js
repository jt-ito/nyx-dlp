// Resumable uploads for archive.org through its S3-like API (multipart).
//
// `ia upload` sends a file as one PUT, so any dropped connection restarts the whole file. Here the file is
// sent in parts: a failed part is retried on its own, and the upload id + finished parts are kept on disk,
// so even stopping the app (or a long outage) resumes where it left off.
//
//   POST   /<item>/<key>?uploads                      -> UploadId
//   PUT    /<item>/<key>?partNumber=N&uploadId=ID     -> ETag      (one per part, retried independently)
//   GET    /<item>/<key>?uploadId=ID                  -> parts the server already has (used on resume)
//   POST   /<item>/<key>?uploadId=ID  <xml part list> -> completes the file
const fs = require('fs');
const path = require('path');
const os = require('os');
const https = require('https');
const http = require('http');
const crypto = require('crypto');

const DEFAULT_ENDPOINT = 'https://s3.us.archive.org';
const MIB = 1024 * 1024;
const MAX_PARTS = 9000;               // S3 allows 10000
const DEFAULT_PART_SIZE = 64 * MIB;   // the most a dropped connection can cost
const IDLE_TIMEOUT_MS = 60 * 1000;    // no bytes either way for this long = dead connection

// The keys `ia configure` stores.
function readIaKeys() {
  const home = os.homedir();
  for (const p of [path.join(home, '.config', 'internetarchive', 'ia.ini'), path.join(home, '.ia'), path.join(home, '.config', 'ia.ini')]) {
    try {
      const ini = fs.readFileSync(p, 'utf-8');
      const access = /^\s*access\s*=\s*(\S+)/im.exec(ini);
      const secret = /^\s*secret\s*=\s*(\S+)/im.exec(ini);
      if (access && secret) return { access: access[1], secret: secret[1] };
    } catch (_) { /* try the next location */ }
  }
  return null;
}

function pickPartSize(size, wanted) {
  const minForCount = Math.ceil(size / MAX_PARTS / MIB) * MIB;
  return Math.max(wanted || DEFAULT_PART_SIZE, minForCount);
}

// IAS3 headers are ASCII only; anything else travels as uri(percent-encoded).
const hv = (v) => (/^[\x20-\x7e]*$/.test(String(v)) ? String(v) : `uri(${encodeURIComponent(String(v))})`);

// meta: { title: 'x', subject: ['a', 'b'], ... } -> x-archive-meta-title / x-archive-metaNN-subject
function itemHeaders(meta = {}, { noDerive = false, sizeHint } = {}) {
  const h = { 'x-archive-auto-make-bucket': '1' };
  for (const [k, v] of Object.entries(meta)) {
    if (v === undefined || v === null || v === '') continue;
    if (Array.isArray(v)) {
      v.forEach((one, i) => { h[`x-archive-meta${String(i + 1).padStart(2, '0')}-${k}`] = hv(one); });
    } else {
      h[`x-archive-meta-${k}`] = hv(v);
    }
  }
  if (noDerive) h['x-archive-queue-derive'] = '0';
  if (sizeHint) h['x-archive-size-hint'] = String(sizeHint);
  return h;
}

const encKey = (key) => key.split('/').map(encodeURIComponent).join('/');
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const xmlTag = (xml, tag) => { const m = new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`).exec(xml); return m ? m[1] : null; };

class UploadError extends Error {
  constructor(message, { retryable = false, status = 0, code = '' } = {}) {
    super(message);
    this.retryable = retryable;
    this.status = status;
    this.code = code;
  }
}

// One HTTP exchange. `body` is a string, or { file, start, end } to stream that slice of a file.
// Follows redirects (IAS3 sends 307s and wants the Authorization header kept) and, for streamed bodies,
// waits for "100 Continue" so a redirect or SlowDown answer does not cost a whole part of upload.
function request(ctl, method, urlStr, { headers = {}, body = null, onBytes, md5 } = {}, hops = 0) {
  return new Promise((resolve, reject) => {
    if (ctl.aborted) return reject(new UploadError('Stopped', { code: 'ABORTED' }));
    const url = new URL(urlStr);
    const lib = url.protocol === 'http:' ? http : https;
    const streamed = body && typeof body === 'object';
    const length = streamed ? body.end - body.start : (body ? Buffer.byteLength(body) : 0);
    const h = { ...headers, 'Content-Length': String(length) };
    if (streamed) h.Expect = '100-continue';

    const req = lib.request(url, { method, headers: h });
    ctl._req = req;
    let finished = false;
    const done = (fn, val) => { if (!finished) { finished = true; ctl._req = null; fn(val); } };
    req.setTimeout(IDLE_TIMEOUT_MS, () => req.destroy(new UploadError('Connection timed out', { retryable: true, code: 'ETIMEDOUT' })));

    let sending = false;
    let fallback = null;
    const send = () => {
      if (sending || finished) return;
      sending = true;
      if (!streamed) { req.end(body || undefined); return; }
      const rs = fs.createReadStream(body.file, { start: body.start, end: body.end - 1, highWaterMark: 256 * 1024 });
      ctl._rs = rs;
      rs.on('data', (c) => { if (onBytes) onBytes(c.length); if (md5) md5.update(c); });
      rs.on('error', (e) => req.destroy(e));
      rs.pipe(req);
    };
    if (streamed) {
      req.on('continue', send);
      fallback = setTimeout(send, 3000);   // a server that ignores Expect still gets its body
    } else {
      send();
    }

    req.on('response', (res) => {
      clearTimeout(fallback);
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('error', (e) => done(reject, wrapNet(e)));
      res.on('end', () => {
        if (ctl._rs) { ctl._rs.destroy(); ctl._rs = null; }
        const text = Buffer.concat(chunks).toString('utf8');
        if (streamed) req.destroy();   // answered before the whole body went out (redirect, SlowDown): drop the connection
        if ([301, 302, 307, 308].includes(res.statusCode) && res.headers.location && hops < 6) {
          finished = true;
          return resolve(request(ctl, method, new URL(res.headers.location, url).toString(), { headers, body, onBytes, md5 }, hops + 1));
        }
        done(resolve, { status: res.statusCode, headers: res.headers, text });
      });
    });
    req.on('error', (e) => { clearTimeout(fallback); if (ctl._rs) { ctl._rs.destroy(); ctl._rs = null; } done(reject, wrapNet(e)); });
  });
}

function wrapNet(e) {
  if (e instanceof UploadError) return e;
  return new UploadError(`${e.code || 'Network error'}: ${e.message}`, { retryable: true, code: e.code || 'NETWORK' });
}

// Turns a non-2xx answer into an UploadError (retryable for throttling and server trouble).
function failure(res, what) {
  const code = xmlTag(res.text, 'Code') || '';
  const msg = xmlTag(res.text, 'Message') || res.text.replace(/\s+/g, ' ').slice(0, 200);
  const retryable = res.status >= 500 || [408, 429].includes(res.status) || /SlowDown|InternalError|ServiceUnavailable|RequestTimeout/i.test(code);
  return new UploadError(`${what} failed (HTTP ${res.status}${code ? ' ' + code : ''}): ${msg}`, { retryable, status: res.status, code });
}

// Runs `fn` until it works, waiting longer after each retryable failure.
async function withRetry(ctl, label, fn, { retries = 40, log, scale = 1 }) {
  for (let attempt = 1; ; attempt++) {
    try {
      return await fn(attempt);
    } catch (e) {
      if (ctl.aborted) throw new UploadError('Stopped', { code: 'ABORTED' });
      if (!(e instanceof UploadError) || !e.retryable || attempt >= retries) throw e;
      const slow = /SlowDown/i.test(e.code);
      const wait = Math.min(60, slow ? 15 + attempt * 5 : 2 * 2 ** Math.min(attempt - 1, 5));
      log(`  ⚠ ${label}: ${e.message}. Retrying in ${wait}s (attempt ${attempt + 1} of ${retries})...`);
      await ctl.sleep(wait * 1000 * scale);
    }
  }
}

function stateFile(stateDir, identifier, key, file) {
  const id = crypto.createHash('sha1').update(`${identifier}\n${key}\n${path.resolve(file)}`).digest('hex');
  return path.join(stateDir, `${id}.json`);
}

// Creates the control handle a caller uses to pause / stop an upload.
function createControl() {
  const ctl = {
    aborted: false, paused: false, _req: null, _rs: null, _wake: null,
    abort() { ctl.aborted = true; ctl.paused = false; if (ctl._req) ctl._req.destroy(); if (ctl._rs) ctl._rs.destroy(); if (ctl._wake) ctl._wake(); },
    pause() { ctl.paused = true; },
    resume() { ctl.paused = false; if (ctl._wake) ctl._wake(); },
    // a sleep that a stop cuts short
    sleep(ms) { return new Promise((r) => { const t = setTimeout(done, ms); function done() { ctl._wake = null; clearTimeout(t); r(); } ctl._wake = done; }); },
    async waitIfPaused() { while (ctl.paused && !ctl.aborted) await ctl.sleep(250); }
  };
  return ctl;
}

/**
 * Uploads `file` as `key` in item `identifier`.
 * opts: { file, identifier, key, accessKey, secretKey, meta, noDerive, endpoint, partSize, stateDir, retries,
 *         ctl, log(text), onProgress({ sent, total, partNumber, parts }) }
 * Resolves { resumed, parts }. Rejects UploadError; { code: 'ABORTED' } when stopped (progress is kept).
 */
async function uploadFile(opts) {
  try {
    return await uploadOnce(opts);
  } catch (e) {
    // the upload id was dropped by archive.org: forget it and begin again, once
    if (e && e.code === 'NoSuchUpload' && !opts._restarted) {
      try { fs.unlinkSync(stateFile(opts.stateDir, opts.identifier, opts.key || path.basename(opts.file), opts.file)); } catch (_) { /* none */ }
      if (opts.log) opts.log('  The upload expired on archive.org; starting it over.');
      return uploadOnce({ ...opts, _restarted: true });
    }
    throw e;
  }
}

async function uploadOnce(opts) {
  const ctl = opts.ctl || createControl();
  const log = opts.log || (() => {});
  const endpoint = (opts.endpoint || DEFAULT_ENDPOINT).replace(/\/+$/, '');
  const key = opts.key || path.basename(opts.file);
  const base = `${endpoint}/${encodeURIComponent(opts.identifier)}/${encKey(key)}`;
  const retries = opts.retries || 40;
  const st = fs.statSync(opts.file);
  const total = st.size;
  const auth = { authorization: `LOW ${opts.accessKey}:${opts.secretKey}` };
  const itemH = itemHeaders(opts.meta, { noDerive: opts.noDerive, sizeHint: total });
  fs.mkdirSync(opts.stateDir, { recursive: true });
  const sfile = stateFile(opts.stateDir, opts.identifier, key, opts.file);
  const save = (s) => fs.writeFileSync(sfile, JSON.stringify(s));

  // ── 1. resume or start ────────────────────────────────────────────────────
  let state = null;
  try { state = JSON.parse(fs.readFileSync(sfile, 'utf8')); } catch (_) { /* none */ }
  if (state && (state.size !== total || state.mtimeMs !== st.mtimeMs || !state.uploadId)) {
    log('  The file changed since the last attempt; starting it over.');
    try { await request(ctl, 'DELETE', `${base}?uploadId=${encodeURIComponent(state.uploadId)}`, { headers: auth }); } catch (_) { /* best effort */ }
    state = null;
  }
  let resumed = false;
  if (state) {
    // ask the server what it really has; trust the local record if it cannot say
    try {
      const res = await request(ctl, 'GET', `${base}?uploadId=${encodeURIComponent(state.uploadId)}`, { headers: auth });
      if (res.status === 404 || /NoSuchUpload/i.test(res.text)) {
        log('  The earlier upload expired on archive.org; starting it over.');
        state = null;
      } else if (res.status === 200 && /<Part>/.test(res.text)) {
        const have = {};
        for (const m of res.text.matchAll(/<Part>([\s\S]*?)<\/Part>/g)) {
          const n = parseInt(xmlTag(m[1], 'PartNumber'), 10);
          const etag = xmlTag(m[1], 'ETag');
          const size = parseInt(xmlTag(m[1], 'Size'), 10);
          const expected = Math.min(state.partSize, total - (n - 1) * state.partSize);
          if (n > 0 && etag && (!size || size === expected)) have[n] = etag;
        }
        state.etags = have;
      }
    } catch (e) {
      if (ctl.aborted) throw e;
    }
    resumed = !!state;
  }
  if (!state) {
    const partSize = pickPartSize(total, opts.partSize);
    state = await withRetry(ctl, 'Starting upload', async () => {
      const res = await request(ctl, 'POST', `${base}?uploads`, { headers: { ...auth, ...itemH } });
      if (res.status < 200 || res.status >= 300) throw failure(res, 'Starting the upload');
      const uploadId = xmlTag(res.text, 'UploadId');
      if (!uploadId) throw new UploadError('archive.org did not return an upload id', { status: res.status, code: 'NoUploadId' });
      return { identifier: opts.identifier, key, size: total, mtimeMs: st.mtimeMs, uploadId, partSize, etags: {} };
    }, { retries, log, scale: opts.backoffScale });
    save(state);
  }

  // ── 2. parts ──────────────────────────────────────────────────────────────
  const partSize = state.partSize;
  const parts = Math.max(1, Math.ceil(total / partSize));
  const doneBytes = () => Object.keys(state.etags).reduce((s, n) => s + Math.min(partSize, total - (n - 1) * partSize), 0);
  let inFlight = 0;
  const report = (partNumber) => opts.onProgress && opts.onProgress({ sent: doneBytes() + inFlight, total, partNumber, parts });
  if (resumed) log(`  Resuming: ${Object.keys(state.etags).length} of ${parts} parts are already on archive.org.`);
  report(0);

  for (let n = 1; n <= parts; n++) {
    if (state.etags[n]) continue;
    await ctl.waitIfPaused();
    if (ctl.aborted) throw new UploadError('Stopped', { code: 'ABORTED' });
    const start = (n - 1) * partSize;
    const end = Math.min(total, start + partSize);
    const etag = await withRetry(ctl, `Part ${n}/${parts}`, async () => {
      inFlight = 0;
      const md5 = crypto.createHash('md5');
      let res;
      try {
        res = await request(ctl, 'PUT', `${base}?partNumber=${n}&uploadId=${encodeURIComponent(state.uploadId)}`, {
          headers: { ...auth }, body: { file: opts.file, start, end }, md5,
          onBytes: (b) => { inFlight += b; report(n); }
        });
      } finally { inFlight = 0; }
      if (res.status === 404 && /NoSuchUpload/i.test(res.text)) throw new UploadError('The upload no longer exists on archive.org', { status: 404, code: 'NoSuchUpload' });
      if (res.status < 200 || res.status >= 300) throw failure(res, `Part ${n}`);
      return res.headers.etag || `"${md5.digest('hex')}"`;
    }, { retries, log, scale: opts.backoffScale });
    state.etags[n] = etag;
    save(state);
    report(n);
  }

  // ── 3. complete ───────────────────────────────────────────────────────────
  const xml = '<CompleteMultipartUpload>' + Array.from({ length: parts }, (_, i) => `<Part><PartNumber>${i + 1}</PartNumber><ETag>${state.etags[i + 1]}</ETag></Part>`).join('') + '</CompleteMultipartUpload>';
  await withRetry(ctl, 'Finishing upload', async () => {
    const res = await request(ctl, 'POST', `${base}?uploadId=${encodeURIComponent(state.uploadId)}`, { headers: { ...auth, ...itemH, 'Content-Type': 'application/xml' }, body: xml });
    if (res.status < 200 || res.status >= 300) throw failure(res, 'Finishing the upload');
    if (/<Error>/.test(res.text)) throw failure({ status: 500, text: res.text }, 'Finishing the upload');   // S3 can answer 200 with an error body
  }, { retries, log, scale: opts.backoffScale });

  try { fs.unlinkSync(sfile); } catch (_) { /* already gone */ }
  return { resumed, parts };
}

module.exports = { uploadFile, createControl, readIaKeys, pickPartSize, itemHeaders, UploadError, DEFAULT_PART_SIZE };
