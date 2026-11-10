// Headless Electron test for Settings -> Backup & Restore (export, confirm, import, bad files).
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
  console.log(' Settings Backup & Restore Test (headless renderer) ');
  console.log('======================================================\n');

  const saved = [], synced = [];
  ipcMain.handle('get-all-settings', () => ({
    'yd-output': { type: 'text', value: 'D:\\Downloads' },
    'dep-use-deno': { type: 'checkbox', checked: true },
    'discord-bot-token': { type: 'password', value: 'SECRET-TOKEN-VALUE' },
    'remote-access-pass': { type: 'password', value: 'hunter2' },
    'remote-access-pin': { type: 'password', value: '1234' },
  }));
  ipcMain.handle('save-text-file', (_e, d) => { saved.push(d); return 'C:/fake/' + d.defaultName; });
  ipcMain.on('sync-ui-state', (_e, d) => synced.push(d));
  ipcMain.handle('get-history', () => []);

  const win = new BrowserWindow({
    show: false,
    webPreferences: { preload: path.join(__dirname, '..', 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: false },
  });
  const errors = [];
  win.webContents.on('console-message', (_e, level, message) => { if (level >= 3 && !/No handler registered/.test(message)) errors.push(message); });
  await win.loadFile(path.join(__dirname, '..', 'index.html'));
  await sleep(1500);
  const run = (code) => win.webContents.executeJavaScript(code);
  const status = () => run(`document.getElementById('settings-backup-status').textContent`);
  const importText = (text) => run(`(() => {
    const input = document.getElementById('settings-import-file');
    const dt = new DataTransfer(); dt.items.add(new File([${JSON.stringify(text)}], 'backup.json', { type: 'application/json' }));
    input.files = dt.files; input.dispatchEvent(new Event('change', { bubbles: true })); return 0; })()`);

  console.log('1. Export...');
  await run(`localStorage.setItem('theme', 'oled'); localStorage.setItem('nyx-ia-autofill', '[]'); document.getElementById('settings-export-btn').click(); 0`);
  await sleep(500);
  const file = saved[saved.length - 1];
  const out = file ? JSON.parse(file.content) : null;
  assert('a JSON backup was written', !!out && out.nyxSettings === 1 && file.filters && file.filters[0].extensions[0] === 'json');
  assert('it holds the saved settings', out && out.state['yd-output'].value === 'D:\\Downloads' && out.state['dep-use-deno'].checked === true);
  assert('credentials are left out (token, password, PIN)', out && !('discord-bot-token' in out.state) && !('remote-access-pass' in out.state) && !('remote-access-pin' in out.state) && !/SECRET-TOKEN-VALUE|hunter2/.test(file.content));
  assert('and so are carried browser-side extras like the theme', out && out.local.theme === 'oled' && out.local['nyx-ia-autofill'] === '[]');
  assert('the status says how many', /Saved 2 settings \(3 credentials left out\)/.test(await status()), await status());

  console.log('\n2. Import asks first...');
  const backup = JSON.stringify({ nyxSettings: 1, state: {
    'yd-output': { type: 'text', value: 'E:\\Videos' },
    'dep-use-deno': { type: 'checkbox', checked: false },
    'discord-bot-token': { type: 'password', value: 'EVIL' },
    'nonsense': 'not an entry',
  }, local: { theme: 'dracula', somethingElse: 'ignored' } });
  await run(`window.__reloaded = 0; window._reloadApp = () => { window.__reloaded++; }; 0`);
  await importText(backup);
  await sleep(300);
  assert('a confirmation appears with the count (credentials and junk dropped)', (await run(`getComputedStyle(document.getElementById('settings-import-modal')).display`)) === 'flex' && /^2 settings$/.test(await run(`document.getElementById('settings-import-count').textContent`)));
  assert('nothing has changed yet', (await run(`localStorage.getItem('theme')`)) === 'oled');
  await run(`document.getElementById('settings-import-cancel').click(); 0`);
  await sleep(200);
  assert('Cancel leaves everything alone', (await run(`localStorage.getItem('theme')`)) === 'oled' && (await run(`window.__reloaded`)) === 0);

  console.log('\n3. Restore...');
  await importText(backup);
  await sleep(300);
  synced.length = 0;
  await run(`document.getElementById('settings-import-confirm').click(); 0`);
  await sleep(900);
  assert('values land in their controls', (await run(`document.getElementById('yd-output').value`)) === 'E:\\Videos' && (await run(`document.querySelector('[data-setting="dep-use-deno"]').checked`)) === false);
  assert('the main process was told (so it is saved on disk)', synced.some(d => d.id === 'yd-output' && d.value === 'E:\\Videos') && synced.some(d => d.id === 'dep-use-deno' && d.checked === false), JSON.stringify(synced.map(d => d.id)));
  assert('browser-side extras are restored, unknown keys ignored', (await run(`localStorage.getItem('theme')`)) === 'dracula' && (await run(`localStorage.getItem('somethingElse')`)) === null);
  assert('no credential was applied', !synced.some(d => d.id === 'discord-bot-token'));
  assert('the window reloads to pick everything up', (await run(`window.__reloaded`)) === 1);

  console.log('\n4. Bad files...');
  await importText('definitely not json');
  await sleep(300);
  assert('not JSON is rejected', /not valid JSON/.test(await status()));
  await importText(JSON.stringify({ hello: 'world' }));
  await sleep(300);
  assert('some other JSON file is rejected', /not a nyx-dlp settings backup/.test(await status()));
  assert('and no confirmation opened for either', (await run(`getComputedStyle(document.getElementById('settings-import-modal')).display`)) === 'none');

  assert('no renderer errors', errors.length === 0, errors.join(' | '));
  console.log(failures ? `\n ${failures} SETTINGS-BACKUP TEST(S) FAILED` : '\n ✔ ALL SETTINGS-BACKUP TESTS PASSED');
  app.exit(failures ? 1 : 0);
}).catch((e) => { console.error(e); app.exit(1); });
