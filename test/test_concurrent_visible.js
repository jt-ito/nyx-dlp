// Concurrent Fragments placement: Live Archiver keeps it in the always-visible form; yt-dlp and Batch keep it
// inside "More options" (and hide it when the same option is pinned, so it never shows twice).
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const html = read('index.html');

for (const t of ['ls', 'yd', 'batch']) {
  const group = html.indexOf(`id="${t}-concurrent-group"`);
  const adv = html.indexOf(`id="${t}-adv"`);
  assert(group > 0, `${t}: concurrent fragments field exists`);
  if (t === 'ls') assert(adv > 0 && group < adv, 'ls: field is before (outside) the collapsed Advanced section');
  else assert(adv > 0 && group > adv, `${t}: field is inside the More options section`);
}

// the fields reach the runners, and are ignored when the same option is pinned
const yd = read('renderer/tools/ytdlp.js'), batch = read('renderer/tools/batch.js'), opts = read('renderer/ytdlp-opts.js');
assert(/yd-concurrent/.test(yd) && /concurrentPinned\?\.\('ytdlp-opt:'\)/.test(yd));
assert(/batch-concurrent/.test(batch) && /concurrentPinned\?\.\('batch-opt:'\)/.test(batch));
assert(/dup-hidden/.test(opts) && /pin:' \+ prefix \+ 'concurrent-fragments'/.test(opts), 'built-in field is hidden when the option is pinned');
assert(/\.dup-hidden\s*\{\s*display:\s*none\s*!important/.test(read('styles.css')));
process.stdout.write(' ✔ ALL CONCURRENT-VISIBLE TESTS PASSED\n');
