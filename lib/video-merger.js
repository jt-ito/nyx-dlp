// Video Merger engine: joins parts that were split from one video, removing the duplicated
// seconds some splits repeat at part boundaries.
//
//  1. Overlap detection compares tiny grayscale fingerprints of the last frames of part N with the
//     first frames of part N+1 (a real overlap makes the whole region match, a plain continuation does not).
//  2. When parts were copy-split, the first overlapped frame in part N is a keyframe, so part N is cut
//     there with a stream copy: video stays bit-identical and frame exact (concat `outpoint`).
//  3. Audio is joined sample-accurately through an atrim/concat filter (AAC is re-encoded once);
//     stream-copying audio would leave ~20-70 ms of duplicated/missing samples at every seam.
//  4. If a cut is not on a keyframe (or the parts differ) it falls back to one re-encode of the whole output.
//
// The caller supplies `ctx` (ffmpeg/ffprobe paths, run(), log(), aborted(), encoderArgs()) so this module
// has no process-tracking of its own.
const fs = require('fs');
const path = require('path');
const os = require('os');

const FP = 16;                    // fingerprint size (FP x FP gray)
const FP_BYTES = FP * FP;
const WINDOWS = [30, 180];        // seconds searched at the end of part N / start of part N+1
const MATCH_THRESHOLD = 4;        // mean abs gray difference (0-255) for "same frame"
const MIN_OVERLAP_SEC = 0.4;      // anything shorter cannot be told apart from a continuous scene

function frameDiff(a, ai, b, bi) {
  let s = 0;
  const ao = ai * FP_BYTES, bo = bi * FP_BYTES;
  for (let k = 0; k < FP_BYTES; k++) s += Math.abs(a[ao + k] - b[bo + k]);
  return s / FP_BYTES;
}

// Mean frame difference between a[aStart..aStart+n) and b[0..n); capped early at `cap` (returns cap).
function regionDiff(a, aStart, b, n, cap) {
  // cheap rejection on a few evenly spread frames first
  const probes = Math.min(8, n);
  let ps = 0;
  for (let k = 0; k < probes; k++) {
    const i = Math.floor(k * (n - 1) / Math.max(1, probes - 1));
    ps += frameDiff(a, aStart + i, b, i);
  }
  if (ps / probes > cap) return cap;
  let s = 0;
  for (let i = 0; i < n; i++) {
    s += frameDiff(a, aStart + i, b, i);
    if (s > cap * n) return cap;
  }
  return s / n;
}

// a: fingerprints of the end of part N, b: fingerprints of the start of part N+1 (Buffers of FP x FP gray frames).
// Returns { n, diff } for an overlap of n frames, { expand: true } when it may be longer than the window,
// { ambiguous: true } when the picture is too static to place it, or null when there is no overlap.
function findOverlap(a, b, fps) {
  const M = Math.floor(a.length / FP_BYTES), H = Math.floor(b.length / FP_BYTES);
  const minN = Math.max(3, Math.round(MIN_OVERLAP_SEC * fps));
  const maxN = Math.min(M, H);
  if (maxN < minN) return null;
  const cap = MATCH_THRESHOLD * 3;
  const d = new Float64Array(maxN + 1).fill(cap);
  let best = 0;
  for (let n = minN; n <= maxN; n++) {
    d[n] = regionDiff(a, M - n, b, n, cap);
    if (d[n] < d[best] || best === 0) best = n;
  }
  if (!best || d[best] > MATCH_THRESHOLD) return null;
  // a real overlap is a sharp minimum: one frame of misalignment must look clearly worse
  const margin = d[best] < 0.05 ? 0.1 : 0.3;   // a bit-exact match (same source frames) stands out even on a near-static picture
  const sharp = [1, 2, 3].every(k => [best - k, best + k].every(m => m < minN || m > maxN || d[m] >= d[best] * 2 + margin));
  if (!sharp) return { ambiguous: true, n: best, diff: d[best] };
  if (best >= maxN - 1) return { expand: true, n: best, diff: d[best] };
  return { n: best, diff: d[best] };
}

function parseRate(r) {
  const [n, dn] = String(r || '').split('/').map(Number);
  return n > 0 && dn > 0 ? n / dn : (n > 0 ? n : 0);
}

// ffprobe can exit cleanly (code 0) with no output, or output cut short, for a "-read_intervals" start on some
// files. A tail query must reach the end of the file (`minEnd`), so when the seeking variant does not, fall
// back to reading the whole file, which always works.
async function probeOut(ctx, exe, variants, minEnd) {
  let r;
  for (const args of variants) {
    for (let i = 0; i < 2; i++) {
      r = await ctx.run(exe, args, { capture: true });
      const times = String(r.out || '').split(/\r?\n/).map(l => parseFloat(l)).filter(Number.isFinite);
      if (r.code === 0 && times.length && (minEnd === undefined || times.reduce((m, x) => (x > m ? x : m), -Infinity) >= minEnd)) return r;
      if (ctx.aborted()) return r;
      await new Promise(res => setTimeout(res, 300));
    }
  }
  return r;
}

// ffprobe argument variants: seek to `from` first (fast on long files), then read everything.
const fromVariants = (base, from, file) => [
  ...(from > 0 ? [[...base, '-read_intervals', `${Math.floor(from)}%`, file]] : []),
  [...base, file]
];

// The last frame of a part cannot start before its container duration minus a frame or two.
const endOf = (part) => Math.max(0, (part.info.duration || 0) - 1.5);

// ffprobe video packets (pts, dts, keyframe) from `from` seconds to the end.
async function tailPackets(ctx, file, from, minEnd) {
  const r = await probeOut(ctx, ctx.ffprobe, fromVariants(['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'packet=pts_time,dts_time,duration_time,flags',
    '-of', 'csv=p=0'], from, file), minEnd);
  const pk = String(r.out || '').split(/\r?\n/).filter(Boolean).map(l => {
    const [pts, dts, dur, flags] = l.split(',');
    return { pts: parseFloat(pts), dts: parseFloat(dts), dur: parseFloat(dur), key: /K/.test(flags || '') };
  }).filter(p => Number.isFinite(p.pts));
  pk.sort((x, y) => x.pts - y.pts);
  return pk.filter(p => p.pts >= from - 1e-6);
}

// Decoded video frame times (sorted) from `from` seconds to the end. Packets and decoded frames do not always
// pair up one to one at the very end of a stream, so cut points are located on real decoded frames.
async function tailFrames(ctx, file, from, minEnd) {
  // "-read_intervals" with frame output can come back empty (VP9, some mp4s) and the whole-file fallback decodes
  // every frame, which takes minutes on a long part. Seeking packets is fast and reliable, so try it before that.
  const base = ['-v', 'error', '-select_streams', 'v:0', '-of', 'csv=p=0'];
  const fv = fromVariants([...base, '-show_entries', 'frame=pts_time,best_effort_timestamp_time'], from, file);
  const pv = from > 0 ? [[...base, '-show_entries', 'packet=pts_time', '-read_intervals', `${Math.floor(from)}%`, file]] : [];
  const r = await probeOut(ctx, ctx.ffprobe, [...fv.slice(0, -1), ...pv, fv[fv.length - 1]], minEnd);
  return String(r.out || '').split(/\r?\n/).filter(Boolean).map(l => {
    const [a, b] = l.split(',');
    return Number.isFinite(parseFloat(a)) ? parseFloat(a) : parseFloat(b);
  }).filter(Number.isFinite).sort((x, y) => x - y).filter(t => t >= from - 1e-6);
}

// Frames a part carries before its first displayed frame (a copy-split starts at the keyframe before the
// requested time and hides the lead-in). A stream-copy join shows them, so the previous part must be cut
// that many frames earlier for the picture to stay continuous.
async function hiddenLead(ctx, file, vStart) {
  const r = await probeOut(ctx, ctx.ffprobe, [['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'packet=pts_time',
    '-of', 'csv=p=0', '-read_intervals', '%+#1500', file]]);
  return String(r.out || '').split(/\r?\n/).map(parseFloat).filter(t => Number.isFinite(t) && t < vStart - 1e-4).length;
}

async function fingerprints(ctx, file, args) {
  const base = ['-v', 'error', ...args.pre, '-i', file, ...(args.post || []), '-map', '0:V:0', '-an', '-sn', '-dn',
    '-vf', `scale=${FP}:${FP}:flags=area,format=gray`];
  let r = await ctx.run(ctx.ffmpeg, [...base, '-vsync', '0', '-f', 'rawvideo', '-'], { capture: true });
  if (r.code !== 0 && /vsync/i.test(r.err || '')) r = await ctx.run(ctx.ffmpeg, [...base, '-fps_mode', 'passthrough', '-f', 'rawvideo', '-'], { capture: true });
  if (r.code !== 0 && !ctx.aborted()) throw new Error(`could not read frames from ${path.basename(file)}: ${String(r.err).trim().split('\n').pop()}`);
  return r.out || Buffer.alloc(0);
}

// How many frames at the end of `a` are repeated at the start of `b`, and where to cut `a`.
async function detectOverlap(ctx, a, b, opts) {
  const fps = a.fps || 30;
  for (const w of WINDOWS) {
    if (ctx.aborted()) return null;
    const from = Math.max(0, a.vEnd - w);
    const fr = await tailFrames(ctx, a.file, from, endOf(a));
    const pk = await tailPackets(ctx, a.file, from, endOf(a));
    const fa = await fingerprints(ctx, a.file, { pre: ['-ss', from.toFixed(3)] });
    const fb = await fingerprints(ctx, b.file, { pre: [], post: ['-t', String(w)] });
    const res = findOverlap(fa, fb, fps);
    const maxed = from === 0 || w === WINDOWS[WINDOWS.length - 1];
    if (!res) { if (maxed) return null; continue; }
    if (res.expand && !maxed) continue;
    if (res.ambiguous) { ctx.log(`  ⚠ The picture is too static to locate an overlap with certainty; leaving it as is (set an overlap manually if needed).\n`); return null; }
    return cutFor(fr, pk, res.n + b.hidden, res.diff, res.n);
  }
  return null;
}

// The cut is the first overlapped frame of `a`, counted from its last decoded frame; its packet says
// whether it is a keyframe (a stream-copy cut is only exact there) and gives the dts the concat cut needs.
function cutFor(fr, pk, n, diff, shown) {
  if (!fr.length || n > fr.length) return null;
  const pts = fr[fr.length - n];
  const c = pk.find(x => Math.abs(x.pts - pts) < 1e-4);
  return { n, shown: shown === 0 ? 0 : (shown || n), diff, pts, visPts: shown === 0 ? undefined : fr[fr.length - (shown || n)], dts: c ? c.dts : NaN, key: !!(c && c.key) };
}

async function probeParts(ctx, files) {
  const out = [];
  for (const file of files) {
    const info = ctx.probe(file);
    const v = info.primaryVideo;
    if (!v) throw new Error(`${path.basename(file)} has no video stream`);
    const vStart = parseFloat(v.start_time) || 0;
    const fps = parseRate(v.avg_frame_rate) || parseRate(v.r_frame_rate) || 30;
    const fr = await tailFrames(ctx, file, Math.max(0, (info.duration || 0) - 5), endOf({ info }));
    const vEnd = fr.length ? fr[fr.length - 1] + 1 / fps : vStart + (parseFloat(v.duration) || info.duration);
    const starts = info.streams.map(x => parseFloat(x.start_time)).filter(Number.isFinite);
    const hidden = await hiddenLead(ctx, file, vStart);
    out.push({ file, info, vStart, vEnd, hidden, fileStart: starts.length ? starts.reduce((m, x) => (x < m ? x : m), Infinity) : 0, fps,
      sig: [v.codec_name, v.width, v.height, info.primaryAudio ? info.primaryAudio.codec_name : '-'].join(' '),
      hasAudio: !!info.primaryAudio });
  }
  return out;
}

const q = f => `file '${f.replace(/\\/g, '/').replace(/'/g, "'\\''")}'`;

// Segments to keep per part: [start, end) in the part's own video timeline.
// What is kept of each part, in its own timeline and counting visible (decoded) frames only; the audio and the
// re-encode path use this directly.
function segments(parts, cuts) {
  return parts.map((p, i) => {
    const c = cuts[i];
    return { start: p.vStart, end: c ? (c.visPts === undefined ? p.vEnd : c.visPts) : p.vEnd, cut: c };
  });
}

async function mergeParts(ctx, opts) {
  const files = opts.files;
  const parts = await probeParts(ctx, files);
  const mismatch = new Set(parts.map(p => p.sig)).size > 1;
  const noAudio = parts.some(p => !p.hasAudio);

  const cuts = new Array(parts.length).fill(null);
  const mode = opts.overlapMode || 'auto';
  for (let i = 0; i < parts.length - 1; i++) {
    if (ctx.aborted()) return { aborted: true };
    const label = `${i + 1} → ${i + 2}`;
    if (mode === 'none') continue;
    ctx.log(`[Merger] Checking join ${label} (${path.basename(files[i])} → ${path.basename(files[i + 1])})...\n`);
    let cut = null;
    if (mode === 'manual') {
      const n = Math.round((opts.overlapSeconds || 0) * parts[i].fps);
      if (n > 0) {
        const from = Math.max(0, parts[i].vEnd - (opts.overlapSeconds || 0) - 5);
        cut = cutFor(await tailFrames(ctx, files[i], from, endOf(parts[i])), await tailPackets(ctx, files[i], from, endOf(parts[i])), n + parts[i + 1].hidden, 0, n);
      }
    } else {
      cut = await detectOverlap(ctx, parts[i], parts[i + 1], opts);
    }
    if (cut) {
      cuts[i] = cut;
      ctx.log(`  ✔ Overlap found: ${cut.shown} frames (${(cut.shown / parts[i].fps).toFixed(2)}s)${cut.diff ? `, match error ${cut.diff.toFixed(2)}` : ''}. Cut at ${cut.pts.toFixed(3)}s: ${cut.key ? "keyframe" : "not a keyframe"}.\n`);
    } else {
      ctx.log(`  ✔ No overlap, joining directly.\n`);
    }
  }
  // A copy-split part starts at the keyframe before the requested time and hides the lead-in; a stream-copy
  // join would show those frames, so they count as overlap with the previous part even when none was detected.
  if (mode !== 'none') {
    for (let i = 0; i < parts.length - 1; i++) {
      if (cuts[i] || parts[i + 1].hidden < 3) continue;
      const from = Math.max(0, parts[i].vEnd - parts[i + 1].hidden / parts[i].fps - 5);
      cuts[i] = cutFor(await tailFrames(ctx, files[i], from, endOf(parts[i])), await tailPackets(ctx, files[i], from, endOf(parts[i])), parts[i + 1].hidden, 0, 0);
      if (cuts[i]) ctx.log(`[Merger] Part ${i + 2} carries ${parts[i + 1].hidden} lead-in frames that repeat the end of part ${i + 1}; trimming them.\n`);
    }
  }
  if (ctx.aborted()) return { aborted: true };

  const firstLead = parts[0].hidden >= 3;
  if (firstLead && !opts.forceEncode) ctx.log('[Merger] ⚠ The first part starts with hidden lead-in frames, so the output will be re-encoded to drop them.\n');
  const needsEncode = !!opts.forceEncode || mismatch || firstLead || cuts.some(c => c && !c.key);
  const seg = segments(parts, cuts);
  if (!opts.forceEncode && mismatch) ctx.log('[Merger] ⚠ The parts differ in codec/resolution, so the output will be re-encoded.\n');
  else if (!opts.forceEncode && cuts.some(c => c && !c.key)) ctx.log('[Merger] ⚠ An overlap does not start on a keyframe (the parts were probably encoded separately), so the output will be re-encoded to cut it exactly.\n');

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'nyx-merge-'));
  const cleanup = () => { try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (_) {} };
  try {
    const args = ['-y'];
    const audioChain = [];
    let vFilter = '';
    const last = parts.length - 1;

    if (!needsEncode) {
      const list = seg.map((s, i) => {
        if (i === last) return q(files[i]);
        let l = q(files[i]);
        if (s.cut) l += `\noutpoint ${((Number.isFinite(s.cut.dts) ? s.cut.dts : s.cut.pts) - parts[i].fileStart - 0.0005).toFixed(6)}`;
        // The next part's hidden lead-in frames are shown, starting where this part's cut ends, so they push
        // the next part's own start that much later on the timeline.
        const keepEnd = s.cut ? s.cut.pts : parts[i].vEnd;
        return l + `\nduration ${(keepEnd - parts[i].vStart + parts[i + 1].hidden / parts[i].fps).toFixed(6)}`;
      }).join('\n');
      const lf = path.join(tmp, 'video.txt');
      fs.writeFileSync(lf, list);
      args.push('-f', 'concat', '-safe', '0', '-i', lf);
    } else {
      files.forEach(f => args.push('-i', f));
    }
    if (!noAudio && !needsEncode) files.forEach(f => args.push('-i', f));
    const aBase = needsEncode ? 0 : 1;
    const a0 = parts[0].info.primaryAudio || {};
    const aFmt = `aformat=sample_rates=${a0.sample_rate || 48000}:channel_layouts=${a0.channels === 1 ? 'mono' : 'stereo'}`;
    if (!noAudio) {
      const aParts = seg.map((s, i) => `[${aBase + i}:a:0]atrim=start=${s.start.toFixed(6)}${i === last && !s.cut ? '' : `:end=${s.end.toFixed(6)}`},asetpts=PTS-STARTPTS,${aFmt}[a${i}]`);
      audioChain.push(...aParts, `${seg.map((_, i) => `[a${i}]`).join('')}concat=n=${parts.length}:v=0:a=1[aout]`);
    }
    if (needsEncode) {
      const v = seg.map((s, i) => `[${i}:V:0]trim=start=${s.start.toFixed(6)}${i === last && !s.cut ? '' : `:end=${s.end.toFixed(6)}`},setpts=PTS-STARTPTS[v${i}]`);
      vFilter = `${v.join(';')};${seg.map((_, i) => `[v${i}]`).join('')}concat=n=${parts.length}:v=1:a=0[vout]`;
    }
    const graph = [vFilter, ...audioChain].filter(Boolean).join(';');
    if (graph) args.push('-filter_complex', graph);
    args.push('-map', needsEncode ? '[vout]' : '0:V:0');
    if (!noAudio) args.push('-map', '[aout]');
    if (needsEncode) args.push(...ctx.encoderArgs()); else args.push('-c:v', 'copy');
    if (!noAudio) args.push('-c:a', 'aac', '-b:a', '192k');
    if (/\.(mp4|m4v|mov)$/i.test(opts.outputPath)) args.push('-movflags', '+faststart');
    args.push(opts.outputPath);

    ctx.log(`\n[Merger] ${needsEncode ? 'Re-encoding' : 'Joining (video stream copy, frame-exact cuts)'}...\n`);
    const r = await ctx.run(ctx.ffmpeg, args, { stream: true });
    if (ctx.aborted()) return { aborted: true };
    if (r.code !== 0) return { error: `ffmpeg exited with code ${r.code}` };

    const expected = seg.reduce((s, x) => s + (x.end - x.start), 0);
    return { expected, cuts: cuts.filter(Boolean).length, encoded: needsEncode };
  } finally {
    cleanup();
  }
}

module.exports = { findOverlap, mergeParts, FP_BYTES };
