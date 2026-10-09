// Runtime test for runBatch: drives the real batch loop with spawn() and the
// ensure-* downloaders stubbed, so crashes inside the async queue (like reading
// the undefined `opts.url` when cookies were on) surface as test failures
// instead of a silently frozen batch. Static analysis can't catch those.
const path = require('path');
const fs = require('fs');
const os = require('os');
const { EventEmitter } = require('events');
const childProcess = require('child_process');

const spawned = [];
childProcess.spawn = (exe, args) => {
  const child = new EventEmitter();
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.stdin = { write() {}, end() {} };
  child.pid = 40000 + spawned.length;
  child.kill = () => {};
  spawned.push({ exe, args });
  setImmediate(() => child.emit('close', 0));
  return child;
};

const stub = (rel, exports) => {
  const id = require.resolve(rel);
  require.cache[id] = { id, filename: id, loaded: true, exports };
};
stub('../lib/ensure-ytdlp', { getYtdlpPath: () => 'yt-dlp', ensureYtdlp: async () => {} });
stub('../lib/ensure-treespend', { ensureTreespend: () => {} });

const { runBatch } = require('../lib/runners');

let failures = 0;
function assert(desc, ok, detail = '') {
  if (ok) console.log(`  ✔ [PASS] ${desc}`);
  else { console.error(`  ✖ [FAIL] ${desc}${detail ? ` (${detail})` : ''}`); failures++; }
}

async function runCase(name, extra) {
  const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nyx-batch-'));
  const events = [];
  const errors = [];
  const onRejection = (e) => errors.push(e);
  process.on('unhandledRejection', onRejection);
  spawned.length = 0;
  const done = new Promise((resolve) => {
    const broadcast = (m) => { events.push(m); if (m.type === 'exit') resolve(m); };
    runBatch({
      urls: ['https://www.youtube.com/watch?v=oqWDq8CMavQ'],
      format: 'bv+ba/bestvideo+bestaudio/best',
      container: 'mp4',
      rest: 0,
      outputDir,
      ...extra(outputDir),
    }, broadcast).catch((e) => { errors.push(e); resolve({ type: 'exit', code: 'threw' }); });
  });
  const timeout = new Promise((resolve) => setTimeout(() => resolve({ type: 'timeout' }), 10000));
  const result = await Promise.race([done, timeout]);
  await new Promise((r) => setImmediate(r));
  process.removeListener('unhandledRejection', onRejection);
  fs.rmSync(outputDir, { recursive: true, force: true });
  console.log(`\n${name}`);
  assert('batch reaches exit instead of freezing', result.type === 'exit' && result.code === 0, JSON.stringify(result));
  assert('no unhandled errors in the queue loop', errors.length === 0, errors.map(e => e && e.message).join('; '));
  return events;
}

(async () => {
  console.log('\n======================================================');
  console.log(' Batch Runtime Test (stubbed spawn) ');
  console.log('======================================================');

  const cookieFile = path.join(os.tmpdir(), 'nyx-test-cookies.txt');
  fs.writeFileSync(cookieFile, '# Netscape HTTP Cookie File\n');

  await runCase('YouTube URL with cookies', () => ({ cookiesPath: cookieFile }));
  assert('yt-dlp was spawned', spawned.length === 1);
  const args = (spawned[0] && spawned[0].args) || [];
  assert('passes --cookies', args.includes('--cookies') && args.includes(cookieFile));
  assert('adds youtube:formats=missing_pot for cookied YouTube', args.includes('youtube:formats=missing_pot'));

  await runCase('YouTube URL without cookies', () => ({}));
  assert('yt-dlp was spawned', spawned.length === 1);
  assert('no --cookies without a cookies file', !(spawned[0] && spawned[0].args.includes('--cookies')));

  fs.rmSync(cookieFile, { force: true });
  if (failures) { console.error(`\n ${failures} BATCH RUNTIME TEST(S) FAILED`); process.exit(1); }
  console.log('\n ✔ ALL BATCH RUNTIME TESTS PASSED');
  process.exit(0);
})();
