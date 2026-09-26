const http = require('http');
const path = require('path');
const fs = require('fs');
const { app } = require('electron');
const { parseNetscapeCookies, convertNetscapeCookieToElectron, loadCookiesIntoSession } = require('../lib/cookie-utils');
const { sniffManifestFromPage } = require('../lib/manifest-sniffer');

const FRAGMENT_URL_REGEX = /\.(ts|m4s|m4a|m4v)(\?.*)?$/i;
const MANIFEST_URL_REGEX = /\.(m3u8|mpd)(\?.*)?$/i;

function isFragmentUrl(url) {
  if (!url || typeof url !== 'string') return false;
  const trimmed = url.trim();
  return FRAGMENT_URL_REGEX.test(trimmed) && !MANIFEST_URL_REGEX.test(trimmed);
}

let failures = 0;
function assert(desc, condition, detail = '') {
  if (condition) {
    console.log(`  ✔ [PASS] ${desc}`);
  } else {
    console.error(`  ✖ [FAIL] ${desc} ${detail ? `(${detail})` : ''}`);
    failures++;
  }
}

async function runTests() {
  console.log('\n======================================================');
  console.log(' Fragment Detection & Manifest Rescue Test Suite ');
  console.log('======================================================\n');

  // ── 1. Fragment Detection Regex Tests ─────────────────────────────
  console.log('1. Testing Fragment URL Regex Matching...');
  assert('Matches raw .ts URL', isFragmentUrl('https://edge.cdn.example.com/stream/chunk_001.ts'));
  assert('Matches .ts URL with query params', isFragmentUrl('https://edge.cdn.example.com/seg.ts?token=abc123&exp=456'));
  assert('Matches raw .m4s URL', isFragmentUrl('https://example.com/video/init.m4s'));
  assert('Matches .m4s with query params', isFragmentUrl('https://example.com/video/seg-1.m4s?sig=xyz'));
  assert('Matches .m4a segment URL', isFragmentUrl('https://cdn.site.com/audio/frag_10.m4a?id=99'));
  assert('Matches .m4v segment URL', isFragmentUrl('https://cdn.site.com/video/chunk_2.m4v'));
  assert('Rejects .m3u8 playlist', !isFragmentUrl('https://example.com/master.m3u8'));
  assert('Rejects .m3u8 with query params', !isFragmentUrl('https://example.com/index.m3u8?token=foo'));
  assert('Rejects .mpd DASH manifest', !isFragmentUrl('https://example.com/manifest.mpd'));
  assert('Rejects standard .mp4 video', !isFragmentUrl('https://example.com/full_video.mp4'));
  assert('Rejects regular webpage URL', !isFragmentUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ'));

  // ── 2. Netscape Cookie Parser & Conversion Tests ─────────────────
  console.log('\n2. Testing Netscape Cookie Parser & Electron Shape Translation...');
  const sampleNetscape = [
    '# Netscape HTTP Cookie File',
    '# This is a comment',
    '.example.com\tTRUE\t/\tTRUE\t1893456000\tsession_id\tabc123xyz',
    '#HttpOnly_.sub.example.com\tTRUE\t/api\tFALSE\t1893456000\ttoken\tsecret_val',
    'plain.com\tFALSE\t/\tFALSE\t0\tsession_only\tval999',
  ].join('\n');

  const parsed = parseNetscapeCookies(sampleNetscape);
  assert('Parsed correct number of cookies', parsed.length === 3);

  // Cookie 1: Subdomain, secure
  const c1 = parsed[0];
  assert('Cookie 1 domain preserved', c1.domain === '.example.com');
  assert('Cookie 1 includeSubdomains flag true', c1.includeSubdomains === true);
  assert('Cookie 1 secure true', c1.secure === true);
  assert('Cookie 1 not httpOnly', c1.httpOnly === false);
  assert('Cookie 1 expiration date parsed', c1.expirationDate === 1893456000);

  const e1 = convertNetscapeCookieToElectron(c1, 'https://test.example.com/video');
  assert('e1 URL is https', e1.url.startsWith('https://'));
  assert('e1 URL has no leading dot in host', !e1.url.includes('https://.'));
  assert('e1 domain has leading dot for subdomains', e1.domain === '.example.com');
  assert('e1 secure is true', e1.secure === true);

  // Cookie 2: #HttpOnly_, sub-subdomain, insecure
  const c2 = parsed[1];
  assert('Cookie 2 httpOnly true', c2.httpOnly === true);
  assert('Cookie 2 domain stripped #HttpOnly_', c2.domain === '.sub.example.com');
  assert('Cookie 2 secure false', c2.secure === false);

  const e2 = convertNetscapeCookieToElectron(c2, 'http://sub.example.com/api');
  assert('e2 httpOnly is true', e2.httpOnly === true);
  assert('e2 secure is false', e2.secure === false);

  // Cookie 3: Host-only, session (0 expiration)
  const c3 = parsed[2];
  assert('Cookie 3 not subdomains', c3.includeSubdomains === false);
  assert('Cookie 3 expiration undefined (session)', c3.expirationDate === undefined);

  const e3 = convertNetscapeCookieToElectron(c3, 'http://plain.com/');
  assert('e3 domain is undefined for host-only', e3.domain === undefined);
  assert('e3 expirationDate is undefined', e3.expirationDate === undefined);

  // ── 3. Real Server Integration Test: Cookie Authentication ────────
  console.log('\n3. Testing Real Cookie-Gated Page Authentication in Electron Session...');
  let receivedCookieHeader = null;
  const authServer = http.createServer((req, res) => {
    if (req.url === '/protected-page') {
      receivedCookieHeader = req.headers.cookie || '';
      if (receivedCookieHeader.includes('session_id=auth_success_123')) {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(`<!DOCTYPE html><html><body><h1>Authenticated</h1><script>fetch('/stream/video.m3u8');</script></body></html>`);
      } else {
        res.writeHead(403, { 'Content-Type': 'text/plain' });
        res.end('Forbidden: Missing cookie');
      }
    } else if (req.url === '/stream/video.m3u8') {
      res.writeHead(200, { 'Content-Type': 'application/vnd.apple.mpegurl' });
      res.end('#EXTM3U\n#EXT-X-VERSION:3\n#EXTINF:6.0,\nseg1.ts\n');
    } else {
      res.writeHead(404);
      res.end('Not found');
    }
  });

  await new Promise((resolve) => authServer.listen(0, '127.0.0.1', resolve));
  const serverPort = authServer.address().port;
  const baseUrl = `http://127.0.0.1:${serverPort}`;

  // Create temporary netscape cookie file
  const tmpCookieFile = path.join(__dirname, 'tmp_test_cookies.txt');
  fs.writeFileSync(tmpCookieFile, `127.0.0.1\tFALSE\t/\tFALSE\t1893456000\tsession_id\tauth_success_123\n`);

  try {
    const candidates = await sniffManifestFromPage(`${baseUrl}/protected-page`, {
      cookiesPath: tmpCookieFile,
      timeoutMs: 5000,
      settleMs: 800
    });

    assert('Real cookie-gated server received transmitted Cookie header', receivedCookieHeader && receivedCookieHeader.includes('session_id=auth_success_123'));
    assert('Sniffer successfully captured manifest from cookie-authenticated page', candidates.length > 0 && candidates[0].url.includes('/stream/video.m3u8'));
  } finally {
    authServer.close();
    if (fs.existsSync(tmpCookieFile)) fs.unlinkSync(tmpCookieFile);
  }

  // ── 4. Sniffer Error & Timeout Graceful Handling ───────────────────
  console.log('\n4. Testing Sniffer Graceful Timeout on Non-Existent Page...');
  const emptyCandidates = await sniffManifestFromPage('http://127.0.0.1:59999/non-existent-page', {
    timeoutMs: 1500,
    settleMs: 500
  });
  assert('Sniffer resolved gracefully with empty array for unreachable page', Array.isArray(emptyCandidates) && emptyCandidates.length === 0);

  // ── 5. Confident Resolution Probing & Variant Mapping ──────────────
  console.log('\n5. Testing Confident Resolution Detection & Variant Mapping...');
  const probeServer = http.createServer((req, res) => {
    if (req.url === '/page') {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(`
        <html><body>
          <script>
            fetch('/master.m3u8');
            setTimeout(() => fetch('/stream-360p.m3u8'), 100);
          </script>
        </body></html>
      `);
    } else if (req.url === '/master.m3u8') {
      res.writeHead(200, { 'Content-Type': 'application/vnd.apple.mpegurl' });
      res.end(`#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=6000000,RESOLUTION=1920x1080,FRAME-RATE=60.000\nhttp://127.0.0.1:${probePort}/stream-1080p.m3u8\n#EXT-X-STREAM-INF:BANDWIDTH=800000,RESOLUTION=640x360\nhttp://127.0.0.1:${probePort}/stream-360p.m3u8\n`);
    } else if (req.url === '/stream-360p.m3u8') {
      res.writeHead(200, { 'Content-Type': 'application/vnd.apple.mpegurl' });
      res.end(`#EXTM3U\n#EXT-X-TARGETDURATION:2\n#EXTINF:2.0,\nseg0.ts\n`);
    } else {
      res.writeHead(404);
      res.end();
    }
  });

  await new Promise(r => probeServer.listen(0, '127.0.0.1', r));
  const probePort = probeServer.address().port;

  try {
    const resCandidates = await sniffManifestFromPage(`http://127.0.0.1:${probePort}/page`, {
      timeoutMs: 4000,
      settleMs: 600
    });

    assert('Captured 2 manifests from probe server', resCandidates.length >= 2);
    const masterCand = resCandidates.find(c => c.isMaster);
    const subCand = resCandidates.find(c => !c.isMaster);

    assert('Master playlist flagged with isMaster: true', !!masterCand && masterCand.isMaster === true);
    assert('Master playlist has confident max resolution badge', !!masterCand && masterCand.resolutionBadgeText === '⭐ 1080p60 Max');
    assert('Sub-stream mapped from master variant to 360p', !!subCand && subCand.resolutionBadgeText === '360p');
    assert('Sub-stream has isConfident: true', !!subCand && subCand.isConfident === true);
    assert('Master playlist is sorted first in candidate list', resCandidates[0] === masterCand);
  } finally {
    probeServer.close();
  }

  console.log('\n------------------------------------------------------');
  if (failures === 0) {
    console.log(' ALL TESTS PASSED SUCCESSFULLY! ✔');
  } else {
    console.error(` ${failures} TEST(S) FAILED! ✖`);
  }
  console.log('------------------------------------------------------\n');

  app.on('window-all-closed', (e) => e.preventDefault());
  app.exit(failures === 0 ? 0 : 1);
}

app.on('window-all-closed', (e) => e.preventDefault());
app.whenReady().then(runTests);

