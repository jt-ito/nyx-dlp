// Headless Electron test for the Internet Archive upload tabs/queue. Loads the
// real index.html + preload.js, drives the real buttons, and watches the IPC
// the renderer sends, so runtime errors in ia.js (not just lint) fail the test.
const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');

let failures = 0;
function assert(desc, ok, detail = '') {
  if (ok) console.log(`  ✔ [PASS] ${desc}`);
  else { console.error(`  ✖ [FAIL] ${desc}${detail ? ` (${detail})` : ''}`); failures++; }
}
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

app.whenReady().then(async () => {
  console.log('\n======================================================');
  console.log(' IA Upload Tabs & Queue Test (headless renderer) ');
  console.log('======================================================\n');

  const uploads = [];
  ipcMain.on('run-ia-upload', (_e, opts) => uploads.push(opts));
  ipcMain.handle('get-history', () => []);
  ipcMain.handle('add-history', () => true);

  const win = new BrowserWindow({
    show: false,
    webPreferences: { preload: path.join(__dirname, '..', 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: false },
  });
  const errors = [];
  win.webContents.on('console-message', (_e, level, message) => { if (level >= 3 && !/No handler registered/.test(message)) errors.push(message); }); // unmocked main-process IPC is expected here
  win.webContents.on('preload-error', (_e, p, err) => errors.push('preload: ' + err.message));
  win.webContents.on('render-process-gone', () => errors.push('renderer crashed'));
  await win.loadFile(path.join(__dirname, '..', 'index.html'));
  await sleep(1500);

  const run = (code) => win.webContents.executeJavaScript(code);
  const sendIa = (data) => win.webContents.send('ia-output', data);

  // Helpers inside the page.
  await run(`
    window.__t = {
      fill(id) {
        const files = document.getElementById('ia-files');
        files.innerHTML = '';
        const it = document.createElement('div');
        it.className = 'sortable-item';
        it.dataset.path = 'C:\\\\fake\\\\' + id + '.txt';
        files.appendChild(it);
        const set = (el, v) => { document.getElementById(el).value = v; document.getElementById(el).dispatchEvent(new Event('input', { bubbles: true })); };
        set('ia-identifier-up', id);
        set('ia-description', 'desc ' + id);
        set('ia-subject', 'tag');
      },
      click: (id) => document.getElementById(id).click(),
      tabs: () => [...document.querySelectorAll('#ia-job-tabs .ia-job-tab')].map(t => ({
        cls: t.className, kind: t.querySelector('.ia-job-kind')?.textContent || '', label: t.querySelector('.ia-job-label').textContent })),
      val: (id) => document.getElementById(id).value,
      hidden: (id) => document.getElementById(id).classList.contains('hidden'),
    };
    // Shrink the 30s queue gap so the test doesn't wait for it.
    const st = window.setTimeout;
    window.setTimeout = (fn, ms, ...a) => st(fn, ms >= 30000 ? 60 : ms, ...a);
    0;
  `);

  console.log('1. Concurrent tab + queued tabs open with the right badges...');
  await run(`__t.click('ia-add-concurrent-upload'); __t.click('ia-upload-add-queue'); __t.click('ia-upload-add-queue'); 0`);
  const tabs0 = await run('__t.tabs()');
  assert('4 tabs (initial + concurrent + 2 queued)', tabs0.length === 4, JSON.stringify(tabs0));
  assert('kinds are [-,C,Q,Q]', tabs0.map(t => t.kind).join(',') === ',C,Q,Q');
  assert('badge above Target File(s) says Queued on the selected queued tab', (await run(`document.getElementById('ia-tab-kind').textContent`)) === 'Queued');

  console.log('\n2. Queue runs in press order, one at a time...');
  // tabs are [initial, C, Q1, Q2]; Q2 is selected. Queue Q2 first, then Q1.
  await run(`__t.fill('queue-two'); __t.click('ia-upload-run'); 0`);
  await sleep(200);
  assert('first queued press starts immediately', uploads.length === 1 && uploads[0].identifier === 'queue-two');
  assert('form is not cleared after pressing Upload', (await run(`__t.val('ia-identifier-up')`)) === 'queue-two');
  await run(`document.querySelectorAll('#ia-job-tabs .ia-job-tab')[2].click(); 0`);
  await run(`__t.fill('queue-one'); __t.click('ia-upload-run'); 0`);
  await sleep(200);
  assert('second queued press waits (nothing else started)', uploads.length === 1);
  const tabs1 = await run('__t.tabs()');
  assert('second tab shows waiting state', /status-waiting/.test(tabs1[2].cls), tabs1[2].cls);
  assert('Stop button visible for a waiting tab', !(await run(`__t.hidden('ia-upload-stop')`)));

  console.log('\n3. Stale-edit warning...');
  await run(`document.getElementById('ia-title').value='changed'; document.getElementById('ia-title').dispatchEvent(new Event('input', { bubbles: true })); 0`);
  assert('warning shows when editing a queued upload', !(await run(`__t.hidden('ia-edit-warning')`)));

  console.log('\n4. Concurrent tab ignores the queue...');
  await run(`document.querySelectorAll('#ia-job-tabs .ia-job-tab')[1].click(); __t.fill('concurrent-one'); __t.click('ia-upload-run'); 0`);
  await sleep(200);
  assert('concurrent upload starts immediately while the queue is busy', uploads.length === 2 && uploads[1].identifier === 'concurrent-one');

  console.log('\n5. Next queued item starts after the previous one finishes...');
  const jobId = uploads[0].jobId;
  sendIa({ type: 'pid', pid: 99999, jobId });
  sendIa({ type: 'exit', code: 0, jobId });
  await sleep(500);
  assert('queued item 2 started after item 1 exited', uploads.length === 3 && uploads[2].identifier === 'queue-one', `uploads=${uploads.map(u => u.identifier)}`);

  console.log('\n6. Queue menu...');
  await run(`document.getElementById('ia-queue-menu-btn').click(); 0`);
  const menuText = await run(`document.getElementById('ia-queue-menu').textContent`);
  assert('menu lists Queue and Concurrent sections', /Queue/.test(menuText) && /Concurrent/.test(menuText) && /concurrent-one/.test(menuText), menuText);

  console.log('\n7. "Disable Automatic Derivation" is never reset...');
  await run(`const nd = document.getElementById('ia-noderive'); nd.checked = true; document.querySelectorAll('#ia-job-tabs .ia-job-tab')[0].click(); document.querySelectorAll('#ia-job-tabs .ia-job-tab')[3].click(); document.getElementById('ia-upload-reset')?.click(); 0`);
  assert('checkbox keeps its state across tab switches', await run(`document.getElementById('ia-noderive').checked`));

  console.log('\n8. No renderer errors...');
  assert('no console errors / uncaught exceptions', errors.length === 0, errors.join(' | '));

  console.log(failures ? `\n ${failures} IA TAB TEST(S) FAILED` : '\n ✔ ALL IA TAB TESTS PASSED');
  app.exit(failures ? 1 : 0);
}).catch((e) => { console.error(e); app.exit(1); });
