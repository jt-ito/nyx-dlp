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
let nextBehavior = null;
childProcess.spawn = (exe, args, options) => {
  const child = new EventEmitter();
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.stdin = { write() {}, end() {} };
  child.pid = 40000 + spawned.length;
  child.kill = () => {};
  let filesAtSpawn = [];
  try { filesAtSpawn = fs.readdirSync(options.cwd); } catch (_) {} // what was in the working dir when yt-dlp started
  spawned.push({ exe, args, filesAtSpawn });
  setImmediate(() => {
    const b = nextBehavior; nextBehavior = null; // a one-off failure for the next spawn: { stderr, code }
    if (b && b.stderr) child.stderr.emit('data', Buffer.from(b.stderr));
    child.emit('close', b ? (b.code === undefined ? 1 : b.code) : 0);
  });
  return child;
};

const stub = (rel, exports) => {
  const id = require.resolve(rel);
  require.cache[id] = { id, filename: id, loaded: true, exports };
};
stub('../lib/ensure-ytdlp', { getYtdlpPath: () => 'yt-dlp', ensureYtdlp: async () => {} });
stub('../lib/ensure-treespend', { ensureTreespend: () => {} });
// Count Twitch restricted-VOD handoffs without touching the network.
const realTwitchMeta = require('../lib/twitch-meta');
let restrictedVodHandoffs = 0;
stub('../lib/twitch-meta', { ...realTwitchMeta, resolveTwitchSubOnlyVod: async () => { restrictedVodHandoffs++; return null; } });

const { runBatch, runYtdlp } = require('../lib/runners');

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
      urls: ['https://www.youtube.com/watch?v=Xb7TgR2mKp4'],
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

  // yt-dlp 2026.08+ crashes with a NoneType error when Twitch withholds a VOD's playback token.
  const noToken = "ERROR: 'NoneType' object is not subscriptable\n";
  nextBehavior = { stderr: noToken, code: 1 };
  restrictedVodHandoffs = 0;
  const twitchEvents = await runCase('Twitch VOD with no playback token', () => ({ urls: ['https://www.twitch.tv/videos/123456789'], twitchSubOnly: true }));
  assert('it is handed to the restricted-VOD handling', restrictedVodHandoffs === 1, `calls=${restrictedVodHandoffs}`);
  assert('and the log explains it (too new, or restricted)', twitchEvents.some(e => e.type === 'stdout' && /did not give out a playback token.*too new.*restricted/.test(e.text)));
  nextBehavior = { stderr: noToken, code: 1 };
  restrictedVodHandoffs = 0;
  const ytEvents = await runCase('Same crash text on another site', () => ({}));
  assert('is not mistaken for a restricted Twitch VOD', restrictedVodHandoffs === 0 && !ytEvents.some(e => e.type === 'stdout' && /playback token/.test(e.text)));

  // Same thing through the single-download runner (the one the yt-dlp tool uses).
  {
    nextBehavior = { stderr: noToken, code: 1 };
    restrictedVodHandoffs = 0;
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nyx-single-'));
    const singleEvents = [];
    await new Promise((resolve) => {
      const done = setTimeout(resolve, 5000);
      runYtdlp({ url: 'https://www.twitch.tv/videos/123456789', outputDir: dir, format: 'bestvideo+bestaudio/best', container: 'mp4', twitchSubOnly: true },
        (m) => { singleEvents.push(m); if (m.type === 'exit') { clearTimeout(done); resolve(); } }).catch(() => resolve());
    });
    fs.rmSync(dir, { recursive: true, force: true });
    console.log('\nTwitch VOD with no playback token (single download)');
    assert('it is handed to the restricted-VOD handling', restrictedVodHandoffs === 1, `calls=${restrictedVodHandoffs}`);
    assert('and the log explains it (too new, or restricted)', singleEvents.some(e => e.type === 'stdout' && /did not give out a playback token.*too new.*restricted/.test(e.text)));
  }

  // Saved-paused downloads: resuming must keep yt-dlp's partial files; a normal run starts clean.
  const seedPartial = (dir) => {
    const tmp = path.join(dir, 'Xb7TgR2mKp4'); // the batch temp folder for this URL
    fs.mkdirSync(tmp, { recursive: true });
    fs.writeFileSync(path.join(tmp, 'video.f401.mp4'), 'partial');
  };
  await runCase('Resume of a saved paused download', (dir) => { seedPartial(dir); return { resumeSaved: true }; });
  assert('partial file is still there when yt-dlp starts', spawned[0] && spawned[0].filesAtSpawn.includes('video.f401.mp4'), JSON.stringify(spawned[0] && spawned[0].filesAtSpawn));
  await runCase('Normal run over leftover files', (dir) => { seedPartial(dir); return {}; });
  assert('leftovers are cleared for a normal run', spawned[0] && !spawned[0].filesAtSpawn.includes('video.f401.mp4'), JSON.stringify(spawned[0] && spawned[0].filesAtSpawn));

  console.log('\nIA aria2c input file');
  const { buildAria2Input } = require('../lib/runners');
  const input = buildAria2Input('some-item', ['top.pkg', 'dir/sub/My File [1].bin'], path.join(os.tmpdir(), 'out'), 'Authorization: LOW a:b');
  assert('encodes URLs per segment', input.includes('https://archive.org/download/some-item/dir/sub/My%20File%20%5B1%5D.bin'));
  assert('saves under <out>/<id>/<subdir> with the plain file name', input.includes(`dir=${path.join(os.tmpdir(), 'out', 'some-item', 'dir', 'sub')}`) && input.includes('out=My File [1].bin'));
  assert('auth header goes in the input file, not on the command line', input.includes('header=Authorization: LOW a:b'));

  console.log('\nIA aria2c log formatting');
  const { createAria2Formatter } = require('../lib/runners');
  const lines = [];
  const fmt = createAria2Formatter((m) => { if (m.type === 'stdout') lines.push(...m.text.split('\n').filter(Boolean)); }, 'Example Game.pkg');
  const raw = [
    '[#a6f475 0B/0B CN:1 DL:0B]                                  \r',
    '\n *** Download Progress Summary as of Fri Oct 09 17:55:45 2026 *** \n=====================\n[#a6f475 0B/0B CN:1 DL:0B]\nFILE: C:/Users/you/Desktop/x/Example Game - [EU] [EN] [1.02].pkg\n-------------------------------------------------------------------------------\n',
    '10/09 17:55:53 [ERROR] CUID#8 - Download aborted. URI=https://archive.org/x\nException: [AbstractCommand.cc:351] errorCode=22 URI=https://dn.archive.org/x\n  -> [HttpSkipResponseCommand.cc:239] errorCode=22 The response status is not successful. status=500\n',
    '10/09 17:55:53 [ERROR] CUID#12 - Download aborted. URI=https://archive.org/x\nException: [AbstractCommand.cc:351] errorCode=22\n  -> [HttpSkipResponseCommand.cc:239] errorCode=22 The response status is not successful. status=500\n',
    '[#a6f475 365MiB/620MiB(58%) CN:14 DL:54MiB ETA:4s]\r',
    '\nDownload Results:\ngid   |stat|avg speed  |path/URI\n======+====+===========+=====\na6f475|OK  |    23MiB/s|C:/Users/you/Desktop/x/Example Game - [EU] [EN] [1.02].pkg\nStatus Legend:\n(OK):download completed.\n',
  ];
  raw.forEach((text) => fmt({ type: 'stdout', text }));
  fmt({ type: 'exit', code: 0 });
  assert('progress becomes one IA-style "Downloading" line', lines.some(l => /^Downloading Example Game.*: 58%\|.*\| 365MiB\/620MiB \[54MiB\/s, ETA 4s\]$/.test(l)), JSON.stringify(lines));
  assert('file name is learned from the FILE: summary line', lines.filter(l => l.startsWith('Downloading Example Game - [EU]')).length >= 1);
  assert('summary banners and results table are dropped', !lines.some(l => /Download Progress Summary|^={5,}|gid\s+\||Status Legend|^-{10,}|^FILE:/.test(l)), JSON.stringify(lines));
  assert('repeated HTTP 500 errors collapse into a single warning', lines.filter(l => l.startsWith('⚠ Server returned HTTP 500')).length === 1 && !lines.some(l => /CUID|Exception|AbstractCommand/.test(l)), JSON.stringify(lines));
  assert('result row becomes a Completed line', lines.some(l => /^✔ Completed Example Game - \[EU\] \[EN\] \[1\.02\]\.pkg — 100% \(avg 23MiB\/s\)$/.test(l)), JSON.stringify(lines));

  fs.rmSync(cookieFile, { force: true });
  if (failures) { console.error(`\n ${failures} BATCH RUNTIME TEST(S) FAILED`); process.exit(1); }
  console.log('\n ✔ ALL BATCH RUNTIME TESTS PASSED');
  process.exit(0);
})();
