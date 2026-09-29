/**
 * Static bug checks that need no running app. Run via `npm test`.
 *  1. ESLint (eslint.config.js): undefined variables, const reassignment, unreachable code, etc.
 *  2. Every window.api.X used in renderer/ is exposed by preload.js.
 *  3. Every ipcRenderer channel in preload.js has a matching ipcMain handler / sender in main.js.
 *  4. Every `const { a, b } = require('./x')` names something that ./x really exports.
 *  5. Every `<script src>` in index.html exists (and every renderer/*.js is loaded).
 */
const fs = require('fs');
const path = require('path');
const { ESLint } = require('eslint');

const root = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const walk = (dir) => fs.readdirSync(path.join(root, dir), { withFileTypes: true }).flatMap((e) =>
  e.isDirectory() ? walk(path.join(dir, e.name)) : e.name.endsWith('.js') ? [path.join(dir, e.name)] : []);

let failed = 0;
const report = (name, problems) => {
  if (problems.length === 0) return console.log(`  ✔ [PASS] ${name}`);
  failed++;
  console.log(`  ✘ [FAIL] ${name}`);
  problems.forEach((p) => console.log(`      - ${p}`));
};

async function main() {
  console.log('1. ESLint (undefined vars, const reassignment, dead code)...');
  const results = await new ESLint({ cwd: root }).lintFiles(['.']);
  report('ESLint', results.flatMap((r) => r.messages.map((m) =>
    `${path.relative(root, r.filePath)}:${m.line} [${m.ruleId}] ${m.message}`)));

  console.log('\n2. Renderer window.api.* vs preload.js...');
  const preload = read('preload.js');
  const exposed = new Set([...preload.matchAll(/^\s*([A-Za-z_$][\w$]*)\s*:/gm)].map((m) => m[1]));
  const used = new Map();
  for (const f of walk('renderer')) {
    for (const m of read(f).matchAll(/window\.api\??\.([A-Za-z_$][\w$]*)/g)) if (!used.has(m[1])) used.set(m[1], f);
  }
  // remote-api.js installs its own window.api shim (its private fields start with _)
  report('All window.api.* calls are exposed', [...used].filter(([k]) => !exposed.has(k) && !k.startsWith('_'))
    .map(([k, f]) => `window.api.${k} (${f}) is not defined in preload.js`));

  console.log('\n3. IPC channels: preload.js vs main.js...');
  const main = read('main.js');
  const handled = new Set([...main.matchAll(/ipcMain\.(?:handle|on|once)\(\s*['"]([^'"]+)['"]/g)].map((m) => m[1]));
  const problems = [];
  for (const m of preload.matchAll(/ipcRenderer\.(invoke|send|on|once)\(\s*['"]([^'"]+)['"]/g)) {
    const [, kind, chan] = m;
    if (kind === 'invoke' || kind === 'send') {
      if (!handled.has(chan)) problems.push(`preload ${kind}s '${chan}' but main.js has no ipcMain handler for it`);
    } else if (!main.includes(`'${chan}'`) && !main.includes(`"${chan}"`)) {
      problems.push(`preload listens on '${chan}' but main.js never sends it`);
    }
  }
  report('Every preload channel has a counterpart in main.js', problems);

  console.log('\n4. Destructured require() names vs module exports...');
  const requireProblems = [];
  const jsFiles = ['main.js', 'cli.js', 'server.js', ...walk('lib')];
  for (const f of jsFiles) {
    for (const m of read(f).matchAll(/const\s*\{([^}]+)\}\s*=\s*require\(\s*['"](\.[^'"]+)['"]\s*\)/g)) {
      let target = path.resolve(root, path.dirname(f), m[2]);
      if (!fs.existsSync(target)) target += '.js';
      let mod;
      try { mod = require(target); } catch (e) { requireProblems.push(`${f}: cannot load ${m[2]} (${e.message.split('\n')[0]})`); continue; }
      for (const raw of m[1].split(',')) {
        const name = raw.trim().split(':')[0].trim();
        if (name && !(name in mod)) requireProblems.push(`${f}: '${name}' is not exported by ${m[2]}`);
      }
    }
  }
  report('All destructured imports exist', requireProblems);

  console.log('\n5. index.html <script> tags vs renderer/ files...');
  const html = read('index.html');
  const scriptSrcs = [...html.matchAll(/<script[^>]+src\s*=\s*["']([^"']+)["']/g)].map((m) => m[1]).filter((s) => !/^https?:/.test(s));
  const scriptProblems = scriptSrcs.filter((s) => !fs.existsSync(path.join(root, s))).map((s) => `index.html loads missing file ${s}`);
  for (const f of walk('renderer')) {
    const rel = f.replace(/\\/g, '/');
    if (!scriptSrcs.includes(rel)) scriptProblems.push(`${rel} is never loaded by index.html`);
  }
  report('Script tags resolve and no renderer file is orphaned', scriptProblems);

  console.log('\n========================================');
  if (failed) { console.log(` ✘ ${failed} STATIC ANALYSIS CHECK(S) FAILED`); process.exit(1); }
  console.log(' ✔ ALL STATIC ANALYSIS CHECKS PASSED');
}

main().catch((e) => { console.error(e); process.exit(1); });
