// A run refuses to start while a tool it needs is being updated.
const assert = require('assert');
const lock = require('../lib/tool-lock');
const runners = require('../lib/runners');

(async () => {
  assert(lock.begin('ytdlp'), 'first begin succeeds');
  assert(!lock.begin('ytdlp'), 'second begin is refused');

  const msgs = [];
  await runners.runYtdlp({ url: 'x' }, (m) => msgs.push(m));
  assert(msgs[0].type === 'error' && /yt-dlp is being updated/.test(msgs[0].text), 'error mentions the update');
  assert(msgs[1].type === 'exit' && msgs[1].code === 1, 'run exits');

  msgs.length = 0;
  await runners.runSplitter({}, (m) => msgs.push(m)).catch(() => {});
  assert(!msgs.some(m => /being updated/.test(m.text || '')), 'unrelated tool is not blocked');

  lock.end('ytdlp');

  // A YouTube run waits for the bundled PO-token server while it is still starting.
  const bgutil = require('../lib/ensure-bgutil-server');
  const realStatus = bgutil.getStatus, realPing = bgutil.pingUrl;
  let state = 'starting';
  bgutil.getStatus = () => ({ state, detail: '' });
  bgutil.pingUrl = async () => state === 'running';
  setTimeout(() => { state = 'running'; }, 1200);
  const logs = [];
  const t0 = Date.now();
  // Fails fast after the wait (no real yt-dlp URL needed): we only care about the wait + log lines.
  await Promise.race([
    runners.runYtdlp({ bgutilUrl: 'http://127.0.0.1:4416', url: '' }, (m) => logs.push(m)).catch(() => {}),
    new Promise(r => setTimeout(r, 3000))
  ]);
  bgutil.getStatus = realStatus;
  bgutil.pingUrl = realPing;
  const text = logs.map(m => m.text || '').join('');
  assert(/still starting up/.test(text), 'tells the user it is waiting');
  assert(/PO-token server is up/.test(text), 'tells the user it is up');
  assert(Date.now() - t0 >= 1000, 'actually waited');
  assert(!lock.isUpdating('ytdlp'));
  // Splitter space estimate: share of the source for the selected parts, padded.
  const GB = 1024 ** 3;
  const all = runners.splitSpaceNeeded(10 * GB, 4, 4), half = runners.splitSpaceNeeded(10 * GB, 4, 2);
  assert(all > 10 * GB && all < 10.6 * GB, 'all parts needs a bit more than the source');
  assert(half > 5 * GB && half < 5.4 * GB, 'half the parts needs about half');
  // Auto-update only ever moves forward.
  const { isNewerVersion } = require('../lib/auto-update-tools');
  assert(isNewerVersion('1.32.16', '1.32.9'), '16 is newer than 9, not older');
  assert(isNewerVersion('v2026.10.10', '2026.08.19'));
  assert(!isNewerVersion('2026.08.19', '2026.10.10'), 'never downgrades a newer (nightly) build');
  assert(!isNewerVersion('1.32.16', '1.32.16'));
  console.log(' ✔ ALL TOOL-LOCK TESTS PASSED');
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
