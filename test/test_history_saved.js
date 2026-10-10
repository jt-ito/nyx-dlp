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
  console.log(' Saved Paused History Test (real app, history OFF) ');
  console.log('======================================================\n');

  const app = spawn(electronExe, [root, `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`], { stdio: 'ignore' });
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
    await sleep(2000);

    // Turn "Save history" OFF through the real settings checkbox so main.js sees it.
    await evalJs(`(() => { const cb = document.querySelector('[data-setting="save-history"]'); cb.checked = false; cb.dispatchEvent(new Event('change', { bubbles: true })); return 0; })()`);
    await sleep(600);

    const normal = { id: 'n1', date: new Date().toISOString(), tool: 'yt-dlp', name: 'normal', source: 'x', output: 'y', status: 'success' };
    const saved = { id: 'p1', date: new Date(Date.now() - 400 * 864e5).toISOString(), tool: 'yt-dlp', name: 'saved', source: 'x', output: 'y', status: 'paused-saved', savedPaused: true, resumeData: { tool: 'ytdlp', form: {} } };

    console.log('1. With history switched off...');
    assert('a normal entry is NOT recorded', (await evalJs(`window.api.addHistory(${JSON.stringify(normal)})`)) === false);
    assert('a saved paused entry IS recorded', (await evalJs(`window.api.addHistory(${JSON.stringify(saved)})`)) === true);

    console.log('2. It survives retention and Clear History...');
    await evalJs(`window.api.syncUiState({ id: 'history-retention', type: 'select-one', value: '7' }); 0`);
    await sleep(400);
    const afterRetention = await evalJs(`window.api.getHistory()`);
    assert('a 400-day-old saved entry is kept despite 7-day retention', afterRetention.some(h => h.id === 'p1'), JSON.stringify(afterRetention.map(h => h.id)));
    await evalJs(`window.api.clearHistory()`);
    const afterClear = await evalJs(`window.api.getHistory()`);
    assert('Clear History keeps saved paused entries', afterClear.length === 1 && afterClear[0].id === 'p1', JSON.stringify(afterClear.map(h => h.id)));
    await evalJs(`window.api.deleteHistoryItem('p1')`);
    assert('deleting it removes it', (await evalJs(`window.api.getHistory()`)).length === 0);
    ws.close();
  } catch (e) {
    assert('test ran without errors', false, e.message);
  }
  cleanup();
  console.log(failures ? `\n ${failures} SAVED-HISTORY TEST(S) FAILED` : '\n ✔ ALL SAVED-HISTORY TESTS PASSED');
  process.exit(failures ? 1 : 0);
})();
