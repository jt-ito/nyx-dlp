// Video Merger: overlap detection on synthetic fingerprints, plus a real ffmpeg round trip that cuts a
// video into overlapping / contiguous parts and checks the merge reproduces every frame of the original.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const assert = require('assert');
const { findOverlap, FP_BYTES } = require('../lib/video-merger');

// ── 1. findOverlap on made-up frames ─────────────────────────────────────────
function walk(n, seed) {              // frames that drift like real video: each differs a little from the last
  let x = seed, f = Buffer.alloc(FP_BYTES);
  const rnd = () => (x = (x * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  for (let i = 0; i < FP_BYTES; i++) f[i] = Math.floor(rnd() * 256);
  const out = [];
  for (let k = 0; k < n; k++) {
    f = Buffer.from(f.map(v => Math.max(0, Math.min(255, v + Math.round((rnd() - 0.5) * 24)))));
    out.push(f);
  }
  return out;
}
const cat = (frames) => Buffer.concat(frames);
const all = walk(600, 7);
const a = all.slice(0, 300), tail = all.slice(300 - 90, 300);
assert.strictEqual(findOverlap(cat(a), cat([...tail, ...all.slice(300, 400)]), 30).n, 90, 'finds a 90 frame overlap');
assert.strictEqual(findOverlap(cat(a), cat(all.slice(300, 500)), 30), null, 'a plain continuation is not an overlap');
const still = Array.from({ length: 300 }, () => Buffer.alloc(FP_BYTES, 128));
const stillRes = findOverlap(cat(still), cat(still), 30);
assert(!stillRes || stillRes.ambiguous || stillRes.expand, 'a static picture is never reported as an exact overlap');
console.log('PASS: overlap detection');

// ── 2. real ffmpeg round trip ────────────────────────────────────────────────
const { getFfmpegPath, getFfprobePath } = require('../lib/ensure-ffmpeg');
const ffmpeg = getFfmpegPath();
if (!ffmpeg || !fs.existsSync(ffmpeg) || !fs.existsSync(getFfprobePath())) {
  console.log('SKIP: no vendored ffmpeg, round trip not run');
  process.exit(0);
}
const runners = require('../lib/runners');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nyx-merger-test-'));
const ff = (...args) => { const r = spawnSync(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-y', ...args], { cwd: dir }); assert.strictEqual(r.status, 0, String(r.stderr)); return r; };
const frameHashes = (f) => { ff('-i', f, '-an', '-f', 'framemd5', 'h.md5'); return fs.readFileSync(path.join(dir, 'h.md5'), 'utf8').split(/\r?\n/).filter(l => l && l[0] !== '#').map(l => l.split(',')[5].trim()); };
const audioBytes = (f) => { ff('-i', f, '-vn', '-f', 's16le', '-ac', '1', 'au.raw'); return fs.statSync(path.join(dir, 'au.raw')).size; };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

function merge(files, extra = {}) {
  return new Promise((resolve) => {
    const out = path.join(dir, extra.name || 'merged.mp4');
    let log = '';
    runners.runMerger({ files, output: out, outputDir: dir, overlapMode: 'auto', ...extra }, (m) => {
      if (m.text) log += m.text;
      if (m.type === 'exit') resolve({ code: m.code, out, log });
    });
  });
}

(async () => {
  try {
    // 36 s of a never-repeating picture with B-frames and a keyframe every 2 s, plus a tone
    ff('-f', 'lavfi', '-i', 'mandelbrot=s=320x180:r=30', '-f', 'lavfi', '-i', 'sine=f=440', '-t', '36', '-c:v', 'libx264', '-g', '60', '-bf', '2', '-pix_fmt', 'yuv420p', '-c:a', 'aac', 'full.mp4');
    const want = frameHashes('full.mp4');
    assert.strictEqual(want.length, 1080);

    // copy-split with a repeated 3 s at each boundary (the case the tool exists for)
    ff('-i', 'full.mp4', '-t', '15', '-c', 'copy', 'a.mp4');
    ff('-ss', '12', '-i', 'full.mp4', '-t', '15', '-c', 'copy', 'b.mp4');
    ff('-ss', '24', '-i', 'full.mp4', '-c', 'copy', 'c.mp4');
    await sleep(1000);
    let r = await merge(['a.mp4', 'b.mp4', 'c.mp4'].map(f => path.join(dir, f)));
    assert.strictEqual(r.code, 0, r.log);
    assert(/video untouched/.test(r.log), 'a copy-split overlap is removed without re-encoding\n' + r.log);
    await sleep(1000);
    assert.deepStrictEqual(frameHashes(r.out), want, 'merged video has exactly the original frames');
    console.log('PASS: overlapping parts merge frame-exact');

    // overlap told to us instead of detected
    r = await merge(['a.mp4', 'b.mp4', 'c.mp4'].map(f => path.join(dir, f)), { overlapMode: 'manual', overlapSeconds: 3.07, name: 'manual.mp4' });
    assert.strictEqual(r.code, 0, r.log);
    await sleep(1000);
    assert.deepStrictEqual(frameHashes(r.out), want, 'manual overlap gives the same result');
    console.log('PASS: manual overlap');

    // contiguous parts (no overlap at all) must be left alone
    fs.mkdirSync(path.join(dir, 'seg'));
    ff('-i', 'full.mp4', '-c', 'copy', '-f', 'segment', '-segment_time', '12', '-reset_timestamps', '1', 'seg/p%d.mp4');
    await sleep(1000);
    const parts = fs.readdirSync(path.join(dir, 'seg')).sort().map(f => path.join(dir, 'seg', f));
    r = await merge(parts, { name: 'contig.mp4' });
    assert.strictEqual(r.code, 0, r.log);
    assert(/No overlap/.test(r.log) && !/Overlap found/.test(r.log), 'no overlap is invented\n' + r.log);
    await sleep(1000);
    assert.deepStrictEqual(frameHashes(r.out), want, 'contiguous parts join without losing or repeating a frame');
    console.log('PASS: contiguous parts merge unchanged');

    // Parts cut in the middle of a GOP (keyframes every 47 frames): each part starts at the keyframe before the
    // requested time and hides the lead-in. This is what real splits look like.
    ff('-f', 'lavfi', '-i', 'mandelbrot=s=320x180:r=30', '-f', 'lavfi', '-i', 'sine=f=440', '-t', '36', '-c:v', 'libx264', '-g', '47', '-keyint_min', '47', '-sc_threshold', '0', '-bf', '2', '-pix_fmt', 'yuv420p', '-c:a', 'aac', 'odd.mp4');
    const wantOdd = frameHashes('odd.mp4');
    ff('-i', 'odd.mp4', '-t', '15', '-c', 'copy', 'oa.mp4');
    ff('-ss', '12', '-i', 'odd.mp4', '-t', '15', '-c', 'copy', 'ob.mp4');
    ff('-ss', '24', '-i', 'odd.mp4', '-c', 'copy', 'oc.mp4');
    await sleep(1000);
    r = await merge(['oa.mp4', 'ob.mp4', 'oc.mp4'].map(f => path.join(dir, f)), { name: 'odd_out.mp4' });
    assert.strictEqual(r.code, 0, r.log);
    await sleep(1000);
    const gotOdd = frameHashes(r.out);
    assert.deepStrictEqual(gotOdd, wantOdd, 'mid-GOP parts merge to exactly the original frames\n' + r.log);
    const audioDiff = Math.abs(audioBytes(r.out) - audioBytes('odd.mp4'));
    assert(audioDiff < 4096, 'audio length matches the original within one AAC frame (off by ' + audioDiff + ' bytes)');
    console.log('PASS: parts split mid-GOP (hidden lead-in frames)');

    // refusing nonsense
    r = await merge([path.join(dir, 'a.mp4')]);
    assert.strictEqual(r.code, 1);
    console.log('\n ✔ ALL VIDEO MERGER TESTS PASSED');
  } catch (e) {
    console.error('FAIL:', e.message);
    process.exitCode = 1;
  } finally {
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch (_) {}
  }
})();
