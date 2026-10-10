// Headless Electron test for "Save Paused Download": pause a yt-dlp job, save it to History,
// check the History filter button, then resume it from History. Uses the real index.html and
// preload.js, with the main-process side stubbed in memory.
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
  console.log(' Save Paused Download Test (headless renderer) ');
  console.log('======================================================\n');

  // In-memory stand-ins for the main-process pieces this feature touches.
  let history = [{ id: 'normal-1', date: new Date().toISOString(), tool: 'yt-dlp', name: 'Finished one', source: 'https://example.com/a', output: 'D:\\x', status: 'success' }];
  const ytRuns = [], stops = [], pauses = [];
  ipcMain.handle('get-history', () => history);
  ipcMain.handle('add-history', (_e, entry) => { history.unshift(entry); return true; });
  ipcMain.handle('delete-history-item', (_e, id) => { history = history.filter(h => h.id !== id); return true; });
  ipcMain.on('run-ytdlp', (_e, opts) => ytRuns.push(opts));
  ipcMain.on('stop-script', (_e, d) => stops.push(d));
  ipcMain.on('pause-script', (_e, d) => pauses.push(d));

  const win = new BrowserWindow({
    show: false,
    webPreferences: { preload: path.join(__dirname, '..', 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: false },
  });
  const errors = [];
  win.webContents.on('console-message', (_e, level, message) => { if (level >= 3 && !/No handler registered/.test(message)) errors.push(message); });
  await win.loadFile(path.join(__dirname, '..', 'index.html'));
  await sleep(1500);
  const run = (code) => win.webContents.executeJavaScript(code);
  const fromMain = (channel, data) => win.webContents.send(channel, data);

  console.log('1. Pausing shows the Save Paused button...');
  await run(`document.querySelector('.nav-item[data-tab="ytdlp"]').click(); 0`);
  await run(`(() => { const set = (id, v) => { const el = document.getElementById(id); el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); }; set('yd-url', 'https://www.youtube.com/watch?v=abcDEF12345'); set('yd-output', 'D:\\\\Downloads'); document.getElementById('yd-run').click(); return 0; })()`);
  await sleep(400);
  assert('run was sent', ytRuns.length === 1, JSON.stringify(ytRuns.map(r => r.url)));
  assert('first run is not flagged as a resume', ytRuns[0] && !ytRuns[0].resumeSaved);
  fromMain('ytdlp-output', { type: 'pid', pid: 555 });
  await sleep(200);
  assert('Save Paused is hidden while running', await run(`document.getElementById('yd-save-paused').classList.contains('hidden')`));
  await run(`document.getElementById('yd-pause').click(); 0`);
  await sleep(300);
  assert('pause was sent to the process', pauses.length === 1 && pauses[0].pid === 555);
  assert('Save Paused appears once paused', !(await run(`document.getElementById('yd-save-paused').classList.contains('hidden')`)));

  console.log('\n2. Saving stores a history entry (even with history turned off) and stops the job...');
  await run(`localStorage.setItem('setting:save-history', 'false'); 0`);
  await run(`document.getElementById('yd-save-paused').click(); 0`);
  await sleep(500);
  const saved = history.find(h => h.savedPaused);
  assert('a saved paused entry was written', !!saved && saved.status === 'paused-saved' && saved.tool === 'yt-dlp');
  assert('it remembers the form', saved && saved.resumeData && saved.resumeData.form['yd-url'] === 'https://www.youtube.com/watch?v=abcDEF12345' && saved.resumeData.form['yd-output'] === 'D:\\Downloads');
  assert('the running process was stopped', stops.some(s => s.pid === 555));
  assert('Save Paused hides again', await run(`document.getElementById('yd-save-paused').classList.contains('hidden')`));
  fromMain('ytdlp-output', { type: 'exit', code: null });
  await sleep(300);

  console.log('\n3. History shows the filter button and the PAUSED card...');
  await run(`document.querySelector('.nav-item[data-tab="history"]').click(); 0`);
  await sleep(700);
  assert('filter button is visible with a count', await run(`(() => { const b = document.getElementById('history-saved-filter'); return !b.classList.contains('hidden') && /\\(1\\)/.test(b.textContent); })()`));
  assert('the saved card has a Resume button', await run(`!!document.querySelector('.history-resume-btn')`));
  assert('both cards show with the filter off', (await run(`document.querySelectorAll('.history-card-wrap').length`)) === 2);
  await run(`document.getElementById('history-saved-filter').click(); 0`);
  await sleep(500);
  assert('filter on: only the saved paused card', (await run(`document.querySelectorAll('.history-card-wrap').length`)) === 1 && await run(`!!document.querySelector('.history-resume-btn')`));
  await run(`document.getElementById('history-saved-filter').click(); 0`);
  await sleep(500);
  assert('clicking again turns the filter off', (await run(`document.querySelectorAll('.history-card-wrap').length`)) === 2);

  console.log('\n4. Resume restores the form and restarts the download...');
  await run(`document.getElementById('yd-url').value = ''; document.getElementById('yd-url').dispatchEvent(new Event('input', { bubbles: true })); 0`);
  await run(`document.querySelector('.history-resume-btn').click(); 0`);
  await sleep(700);
  assert('yt-dlp was started again', ytRuns.length === 2);
  assert('with the saved URL and folder', ytRuns[1] && ytRuns[1].url === 'https://www.youtube.com/watch?v=abcDEF12345' && ytRuns[1].outputDir === 'D:\\Downloads', JSON.stringify(ytRuns[1] && [ytRuns[1].url, ytRuns[1].outputDir]));
  assert('flagged so partial files are kept', ytRuns[1] && ytRuns[1].resumeSaved === true);
  assert('the saved entry was removed once started', !history.some(h => h.savedPaused));
  assert('a normal run afterwards is not flagged', await run(`window._takeResumeFlag() === false`));

  assert('no renderer errors', errors.length === 0, errors.join(' | '));
  console.log(failures ? `\n ${failures} PAUSED-SAVE TEST(S) FAILED` : '\n ✔ ALL PAUSED-SAVE TESTS PASSED');
  app.exit(failures ? 1 : 0);
}).catch((e) => { console.error(e); app.exit(1); });
