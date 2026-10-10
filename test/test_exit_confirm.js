// End-to-end test of the exit confirmation: launches the REAL app (main.js) with a
// throwaway profile, fakes a running tool, closes the window and checks the in-app
// modal blocks/permits the exit. Run with plain node (npm test does).
const { spawn } = require('child_process');
const http = require('http');
const path = require('path');
const os = require('os');
const fs = require('fs');
const WebSocket = require('ws');

const root = path.resolve(__dirname, '..');
const electronExe = require('electron'); // path to the electron binary
const port = 9400 + Math.floor(Math.random() * 400);
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'nyx-exit-test-'));

let failures = 0;
function assert(desc, ok, detail = '') {
  if (ok) console.log(`  ✔ [PASS] ${desc}`);
  else { console.error(`  ✖ [FAIL] ${desc}${detail ? ` (${detail})` : ''}`); failures++; }
}
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const getJson = (url) => new Promise((resolve, reject) => {
  http.get(url, (res) => { let d = ''; res.on('data', c => d += c); res.on('end', () => { try { resolve(JSON.parse(d)); } catch (e) { reject(e); } }); }).on('error', reject);
});

(async () => {
  console.log('\n======================================================');
  console.log(' Exit Confirmation End-to-End Test (real app) ');
  console.log('======================================================\n');

  const app = spawn(electronExe, [root, `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`], { stdio: 'ignore' });
  let exited = false;
  app.on('exit', () => { exited = true; });
  const cleanup = () => { try { app.kill(); } catch (_) {} try { fs.rmSync(profile, { recursive: true, force: true }); } catch (_) {} };

  try {
    let target = null;
    for (let i = 0; i < 60 && !target; i++) {
      await sleep(500);
      try { target = (await getJson(`http://127.0.0.1:${port}/json`)).find(t => t.type === 'page' && /index\.html/.test(t.url)); } catch (_) {}
    }
    if (!target) throw new Error('app window never appeared');

    const ws = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((r, j) => { ws.on('open', r); ws.on('error', j); });
    let id = 0; const pending = new Map();
    ws.on('message', (m) => { const d = JSON.parse(m); if (d.id && pending.has(d.id)) { pending.get(d.id)(d); pending.delete(d.id); } });
    const evalJs = (expression) => new Promise((resolve) => {
      const i = ++id; pending.set(i, resolve);
      ws.send(JSON.stringify({ id: i, method: 'Runtime.evaluate', params: { expression, awaitPromise: true, returnByValue: true } }));
    }).then(r => r.result && r.result.result ? r.result.result.value : undefined);

    await sleep(2000); // let renderer scripts finish

    console.log('2. Closing while a tool is running asks first...');
    await evalJs(`incRunning('Test Tool'); 0`);
    await evalJs(`window.api.close(); 0`);
    await sleep(1500);
    assert('app is still running after close', !exited);
    assert('modal is showing and lists the running tool',
      await evalJs(`getComputedStyle(document.getElementById('exit-confirm-modal')).display === 'flex' && document.getElementById('exit-confirm-list').textContent.includes('Test Tool')`));

    console.log('3. Keep Running cancels the exit...');
    await evalJs(`document.getElementById('exit-confirm-cancel').click(); 0`);
    await sleep(1000);
    assert('app still running after Keep Running', !exited);
    assert('modal is hidden again', await evalJs(`document.getElementById('exit-confirm-modal').style.display === 'none'`));

    console.log('4. Quit Anyway exits...');
    await evalJs(`window.api.close(); 0`);
    await sleep(1500);
    await evalJs(`document.getElementById('exit-confirm-submit').click(); 0`);
    for (let i = 0; i < 20 && !exited; i++) await sleep(500);
    assert('app exited after Quit Anyway', exited);
    ws.close();
  } catch (e) {
    assert('test ran without errors', false, e.message);
  }

  cleanup();

  if (!failures) {
    // 1. Nothing running → closes right away (fresh launch).
    const app2 = spawn(electronExe, [root, `--remote-debugging-port=${port + 1}`, `--user-data-dir=${profile}`], { stdio: 'ignore' });
    let exited2 = false;
    app2.on('exit', () => { exited2 = true; });
    try {
      let t = null;
      for (let i = 0; i < 60 && !t; i++) {
        await sleep(500);
        try { t = (await getJson(`http://127.0.0.1:${port + 1}/json`)).find(x => x.type === 'page' && /index\.html/.test(x.url)); } catch (_) {}
      }
      const ws2 = new WebSocket(t.webSocketDebuggerUrl);
      await new Promise((r, j) => { ws2.on('open', r); ws2.on('error', j); });
      await sleep(2000);
      ws2.send(JSON.stringify({ id: 1, method: 'Runtime.evaluate', params: { expression: 'window.api.close(); 0' } }));
      for (let i = 0; i < 20 && !exited2; i++) await sleep(500);
      console.log('\n1. Closing with nothing running exits immediately...');
      assert('app exited without a prompt', exited2);
    } catch (e) {
      assert('idle-close test ran without errors', false, e.message);
    }
    try { app2.kill(); } catch (_) {}
    try { fs.rmSync(profile, { recursive: true, force: true }); } catch (_) {}
  }

  console.log(failures ? `\n ${failures} EXIT CONFIRM TEST(S) FAILED` : '\n ✔ ALL EXIT CONFIRM TESTS PASSED');
  process.exit(failures ? 1 : 0);
})();
