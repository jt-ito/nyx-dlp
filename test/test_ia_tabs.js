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
  const savedFiles = [];
  ipcMain.handle('save-text-file', (_e, d) => { savedFiles.push(d); return 'C:/fake/' + d.defaultName; });
  const stops = [];
  ipcMain.on('stop-script', (_e, d) => stops.push(d));
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

  console.log('\n8. IA download link parsing...');
  const parsed = await run(`[
    'https://archive.org/download/example-game-collection/Example%20Game%20-%20%5BEU%5D%20%5BEN%5D%20%5B1.02%5D.pkg',
    'https://archive.org/details/example-game-collection',
    'https://archive.org/download/example-game-collection',
    'archive.org/download/some-item-id/folder/sub/',
    'my-plain-item-id',
    'https://evil.example.com/download/some-item-id',
    'https://archive.org/about',
  ].map(parseIaLink)`);
  assert('download link to one file', parsed[0] && parsed[0].identifier === 'example-game-collection' && parsed[0].files[0] === 'Example Game - [EU] [EN] [1.02].pkg', JSON.stringify(parsed[0]));
  assert('details link = whole item', parsed[1] && parsed[1].identifier === 'example-game-collection' && !parsed[1].files.length && !parsed[1].glob);
  assert('download link without file = whole item', parsed[2] && parsed[2].identifier === 'example-game-collection' && !parsed[2].files.length);
  assert('folder link becomes a glob', parsed[3] && parsed[3].identifier === 'some-item-id' && parsed[3].glob === 'folder/sub/*', JSON.stringify(parsed[3]));
  assert('plain identifier still works', parsed[4] && parsed[4].identifier === 'my-plain-item-id');
  assert('non-archive.org and non-item links are rejected', parsed[5] === null && parsed[6] === null);

  console.log('\n9. Exit confirmation modal...');
  const answers = [];
  ipcMain.on('exit-confirm-response', (_e, ok) => answers.push(ok));
  win.webContents.send('confirm-exit', { work: ['yt-dlp', 'Internet Archive queue (2 waiting)'] });
  await sleep(300);
  assert('modal opens listing running work', await run(`getComputedStyle(document.getElementById('exit-confirm-modal')).display === 'flex' && document.getElementById('exit-confirm-list').children.length === 2`));
  await run(`document.getElementById('exit-confirm-cancel').click(); 0`);
  await sleep(200);
  assert('Keep Running closes it and answers "no"', answers[0] === false && (await run(`document.getElementById('exit-confirm-modal').style.display === 'none'`)));
  win.webContents.send('confirm-exit', { work: ['yt-dlp'] });
  await sleep(300);
  await run(`document.getElementById('exit-confirm-submit').click(); 0`);
  await sleep(200);
  assert('Quit Anyway answers "yes"', answers[1] === true);

  console.log('\n9b. Tab strip shrinks like a browser, then wraps upward...');
  await run(`document.querySelector('.nav-item[data-tab="ia"]').click(); 0`);
  // The earlier steps left 4 tabs; open enough more that even the minimum width can't fit one row.
  await run(`for (let i = 0; i < 20; i++) document.getElementById('ia-add-concurrent-upload').click(); 0`);
  await sleep(400);
  const geo = await run(`(() => {
    const strip = document.getElementById('ia-job-tabs');
    const tabs = [...strip.querySelectorAll('.ia-job-tab')];
    const r = (el) => { const b = el.getBoundingClientRect(); return { l: b.left, r: b.right, t: b.top, w: b.width }; };
    return { n: tabs.length, stripW: strip.getBoundingClientRect().width, tabs: tabs.map(t => ({ ...r(t), dot: r(t.querySelector('.ia-job-dot')), badge: t.querySelector('.ia-job-kind') ? r(t.querySelector('.ia-job-kind')) : null, active: t.classList.contains('active') })) };
  })()`);
  const minW = Math.min(...geo.tabs.filter(t => !t.active).map(t => t.w));
  const rows = [...new Set(geo.tabs.map(t => Math.round(t.t)))].sort((a, b) => a - b);
  assert('24 tabs are open', geo.n === 24, `n=${geo.n}`);
  assert('tabs shrink to ~56px before wrapping', minW >= 55 && minW <= 80, `min=${minW}`);
  assert('active tab keeps room for its close button', geo.tabs.find(t => t.active).w >= 90);
  assert('they wrap onto more than one row', rows.length > 1, JSON.stringify(rows));
  assert('the oldest tab is on the bottom row, newest on the top', geo.tabs[0].t > geo.tabs[geo.tabs.length - 1].t, `${geo.tabs[0].t} vs ${geo.tabs[geo.tabs.length - 1].t}`);
  assert('dot and C/Q badge stay fully visible on every tab', geo.tabs.every(t => t.dot.l >= t.l - 0.5 && t.dot.r <= t.r + 0.5 && (!t.badge || (t.badge.l >= t.l - 0.5 && t.badge.r <= t.r + 0.5))));
  await run(`const closers = [...document.querySelectorAll('#ia-job-tabs .ia-job-close')]; closers.slice(1).forEach(c => c.click()); 0`);
  await sleep(300);
  // Tabs that were still uploading asked for confirmation instead of closing; dismiss that popup.
  await run(`document.getElementById('ia-close-running-cancel').click(); 0`);

  console.log('\n9c. Middle-click closes a tab, Ctrl+Shift+T reopens it with its info...');
  const tabCount = () => run(`document.querySelectorAll('#ia-job-tabs .ia-job-tab').length`);
  const middleClickActive = () => run(`document.querySelector('#ia-job-tabs .ia-job-tab.active').dispatchEvent(new MouseEvent('auxclick', { button: 1, bubbles: true, cancelable: true })); 0`);
  const reopenKey = () => run(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'T', ctrlKey: true, shiftKey: true, bubbles: true, cancelable: true })); 0`);
  // Earlier sections closed plenty of tabs; start from an empty recently-closed list.
  await run(`document.getElementById('ia-queue-menu-btn').click(); 0`);
  await sleep(200);
  await run(`[...document.querySelectorAll('#ia-queue-menu .ia-qm-btn')].find(b => /Clear recently closed/.test(b.textContent))?.click(); document.body.click(); 0`);
  await sleep(200);
  await run(`document.getElementById('ia-add-concurrent-upload').click(); __t.fill('reopen-me-12345'); 0`);
  const before = await tabCount();
  await middleClickActive();
  await sleep(300);
  assert('middle-click closed the tab (no popup for an idle tab)', (await tabCount()) === before - 1 && (await run(`getComputedStyle(document.getElementById('ia-close-running-modal')).display`)) === 'none');
  await reopenKey();
  await sleep(300);
  assert('Ctrl+Shift+T brought it back', (await tabCount()) === before);
  assert('with its identifier and file still filled in', (await run(`__t.val('ia-identifier-up')`)) === 'reopen-me-12345' && (await run(`document.querySelectorAll('#ia-files .sortable-item').length`)) === 1);
  assert('and its Concurrent badge', (await run(`document.getElementById('ia-tab-kind').textContent`)) === 'Concurrent');

  // A tab that is still uploading asks first.
  const uploadsBefore = uploads.length;
  await run(`__t.click('ia-upload-run'); 0`);
  await sleep(300);
  const closeJobId = uploads[uploadsBefore] && uploads[uploadsBefore].jobId;
  sendIa({ type: 'pid', pid: 31337, jobId: closeJobId });
  await sleep(200);
  await middleClickActive();
  await sleep(300);
  assert('middle-click on an uploading tab shows the warning', (await run(`getComputedStyle(document.getElementById('ia-close-running-modal')).display`)) === 'flex' && (await tabCount()) === before);
  await run(`document.getElementById('ia-close-running-cancel').click(); 0`);
  await sleep(200);
  assert('Keep Uploading leaves it alone', (await tabCount()) === before && !stops.some(s => s.pid === 31337));
  await middleClickActive();
  await sleep(300);
  await run(`document.getElementById('ia-close-running-submit').click(); 0`);
  await sleep(300);
  assert('Stop & Close sends the stop', stops.some(s => s.pid === 31337));
  sendIa({ type: 'exit', code: null, jobId: closeJobId });
  await sleep(400);
  assert('and the tab closes once the upload has stopped', (await tabCount()) === before - 1);
  await reopenKey();
  await sleep(300);
  assert('it can be reopened with its info', (await tabCount()) === before && (await run(`__t.val('ia-identifier-up')`)) === 'reopen-me-12345');

  // Recently-closed list in the menu, and clearing it.
  await middleClickActive();
  await sleep(300);
  await run(`document.getElementById('ia-queue-menu-btn').click(); 0`);
  await sleep(300);
  assert('the menu lists recently closed tabs', /Recently closed/.test(await run(`document.getElementById('ia-queue-menu').textContent`)));
  await run(`[...document.querySelectorAll('#ia-queue-menu .ia-qm-btn')].find(b => /Clear recently closed/.test(b.textContent)).click(); 0`);
  await sleep(200);
  assert('Clear empties it', !/Recently closed/.test(await run(`document.getElementById('ia-queue-menu').textContent`)));
  await run(`document.body.click(); 0`);
  await reopenKey();
  await sleep(200);
  assert('so Ctrl+Shift+T has nothing to reopen', (await tabCount()) === before - 1);

  console.log('\n9d. Autofill saves and restores whole fields, spacing included...');
  const descExact = "Stream VOD\n\n\nCaseOh's links:\nhttps://www.youtube.com/@CaseOh\nhttps://www.twitch.tv/caseoh_\nhttps://x.com/caseoh_\n";
  await run(`localStorage.removeItem('nyx-ia-autofill'); document.querySelector('.nav-item[data-tab="ia"]').click(); document.getElementById('ia-add-concurrent-upload').click(); 0`);
  await run(`(() => {
    const set = (id, v) => { const el = document.getElementById(id); el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); };
    set('ia-identifier-up', 'caseoh-vod-0001'); set('ia-title', 'CaseOh VOD 1');
    set('ia-description', ${JSON.stringify(descExact)});
    set('ia-subject', 'caseoh; twitch; vod'); set('ia-creator', 'caseoh');
    return 0; })()`);
  await run(`document.getElementById('ia-autofill-btn').click(); 0`);
  assert('Autofill popup opens (empty at first)', (await run(`getComputedStyle(document.getElementById('ia-autofill-modal')).display`)) === 'flex' && /Nothing saved yet/.test(await run(`document.getElementById('ia-autofill-list').textContent`)));
  await run(`document.getElementById('ia-autofill-save-new').click(); 0`);
  const checks = await run(`Object.fromEntries([...document.querySelectorAll('#ia-autofill-fields input[type="checkbox"]')].map(c => [c.dataset.key, c.checked]))`);
  assert('per-upload fields (identifier, title) start unticked, the rest ticked', checks.identifier === false && checks.title === false && checks.description === true && checks.subject === true && checks.creator === true, JSON.stringify(checks));
  assert('Save is disabled until it has a name', await run(`document.getElementById('ia-autofill-save-confirm').disabled`));
  await run(`(() => { const n = document.getElementById('ia-autofill-name'); n.value = 'CaseOh'; n.dispatchEvent(new Event('input', { bubbles: true })); document.getElementById('ia-autofill-save-confirm').click(); return 0; })()`);
  await sleep(200);
  assert('it is listed after saving', /CaseOh/.test(await run(`document.getElementById('ia-autofill-list').textContent`)));
  const stored = JSON.parse(await run(`localStorage.getItem('nyx-ia-autofill')`));
  assert('the description is stored exactly (blank lines kept)', stored[0] && stored[0].fields.description === descExact, JSON.stringify(stored[0] && stored[0].fields.description));
  assert('identifier and title were not stored', stored[0] && !('identifier' in stored[0].fields) && !('title' in stored[0].fields));
  await run(`document.getElementById('ia-autofill-close').click(); document.getElementById('ia-add-concurrent-upload').click(); 0`);
  assert('a new tab starts blank', (await run(`__t.val('ia-description')`)) === '' && (await run(`__t.val('ia-creator')`)) === '');
  await run(`document.getElementById('ia-autofill-btn').click(); document.querySelector('#ia-autofill-list .ia-af-item').click(); 0`);
  await sleep(200);
  assert('choosing it fills the description with the exact spacing', (await run(`__t.val('ia-description')`)) === descExact);
  assert('and the tags and creator', (await run(`__t.val('ia-subject')`)) === 'caseoh; twitch; vod' && (await run(`__t.val('ia-creator')`)) === 'caseoh');
  assert('but leaves identifier/title alone', (await run(`__t.val('ia-identifier-up')`)) === '' && (await run(`__t.val('ia-title')`)) === '');
  assert('and the popup closed', (await run(`getComputedStyle(document.getElementById('ia-autofill-modal')).display`)) === 'none');
  // Saving under the same name replaces it, and Delete asks twice.
  await run(`document.getElementById('ia-autofill-btn').click(); document.getElementById('ia-autofill-save-new').click(); (() => { const n = document.getElementById('ia-autofill-name'); n.value = 'caseoh'; n.dispatchEvent(new Event('input', { bubbles: true })); })(); 0`);
  assert('reusing a name warns that it will replace', /already exists/.test(await run(`document.getElementById('ia-autofill-name-note').textContent`)));
  await run(`document.getElementById('ia-autofill-save-confirm').click(); 0`);
  assert('still just one saved set', JSON.parse(await run(`localStorage.getItem('nyx-ia-autofill')`)).length === 1);
  await run(`document.querySelector('#ia-autofill-list .ia-af-del').click(); 0`);
  assert('the first Delete click only arms it', JSON.parse(await run(`localStorage.getItem('nyx-ia-autofill')`)).length === 1);
  await run(`document.querySelector('#ia-autofill-list .ia-af-del').click(); 0`);
  assert('the second one deletes it', JSON.parse(await run(`localStorage.getItem('nyx-ia-autofill')`)).length === 0);
  await run(`document.getElementById('ia-autofill-close').click(); 0`);

  console.log('\n9d2. Autofill placeholders, export and import...');
  const tokenDesc = "Stream {date}\n\nVOD: https://www.twitch.tv/videos/{vod}\nTitle: {title}\n";
  await run(`localStorage.removeItem('nyx-ia-autofill'); document.querySelector('.nav-item[data-tab="ia"]').click(); document.getElementById('ia-add-concurrent-upload').click(); 0`);
  await run(`(() => {
    const set = (id, v) => { const el = document.getElementById(id); el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); };
    set('ia-description', ${JSON.stringify(tokenDesc)}); set('ia-subject', 'tag-one; tag-two');
    document.getElementById('ia-autofill-btn').click(); document.getElementById('ia-autofill-save-new').click();
    const n = document.getElementById('ia-autofill-name'); n.value = 'Tokens'; n.dispatchEvent(new Event('input', { bubbles: true }));
    document.getElementById('ia-autofill-save-confirm').click(); document.getElementById('ia-autofill-close').click(); return 0; })()`);
  await run(`document.getElementById('ia-add-concurrent-upload').click(); document.getElementById('ia-autofill-btn').click(); document.querySelector('#ia-autofill-list .ia-af-item').click(); 0`);
  await sleep(200);
  const asked = await run(`[...document.querySelectorAll('#ia-autofill-token-inputs input')].map(i => i.dataset.token)`);
  assert('only the custom placeholder is asked for ({date} and {title} are filled at upload)', asked.length === 1 && asked[0] === 'vod', JSON.stringify(asked));
  await run(`document.querySelector('#ia-autofill-token-inputs input').value = '123456'; document.getElementById('ia-autofill-tokens-apply').click(); 0`);
  await sleep(200);
  const filledDesc = await run(`__t.val('ia-description')`);
  assert('it is substituted, the other placeholders and spacing stay', filledDesc === "Stream {date}\n\nVOD: https://www.twitch.tv/videos/123456\nTitle: {title}\n", JSON.stringify(filledDesc));

  const upBefore = uploads.length;
  await run(`(() => {
    const set = (id, v) => { const el = document.getElementById(id); el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); };
    window.addSortableItem(document.getElementById('ia-files'), 'D:/Videos/token-test.mp4');
    set('ia-identifier-up', 'token-test-0001'); set('ia-title', 'Token Title');
    set('ia-date-y', '2026'); set('ia-date-m', '10'); set('ia-date-d', '14');
    document.getElementById('ia-upload-run').click(); return 0; })()`);
  await sleep(400);
  const sent = uploads[upBefore];
  assert('on upload, {date} and {title} are filled from the form', sent && sent.description === "Stream 2026-10-14\n\nVOD: https://www.twitch.tv/videos/123456\nTitle: Token Title", JSON.stringify(sent && sent.description));

  await run(`document.getElementById('ia-add-concurrent-upload').click(); document.getElementById('ia-autofill-btn').click(); document.getElementById('ia-autofill-export').click(); 0`);
  await sleep(300);
  const exported = savedFiles[savedFiles.length - 1];
  const exportedJson = exported ? JSON.parse(exported.content) : null;
  assert('Export writes a JSON file with every set', exportedJson && exportedJson.nyxAutofill === 1 && exportedJson.presets.length === 1 && exportedJson.presets[0].name === 'Tokens' && exported.filters && exported.filters[0].extensions[0] === 'json');

  const importFile = (text) => run(`(() => {
    const input = document.getElementById('ia-autofill-import-file');
    const dt = new DataTransfer(); dt.items.add(new File([${JSON.stringify(text)}], 'sets.json', { type: 'application/json' }));
    input.files = dt.files; input.dispatchEvent(new Event('change', { bubbles: true })); return 0; })()`);
  await importFile(JSON.stringify({ nyxAutofill: 1, presets: [
    { name: 'tokens', fields: { description: 'replaced description' } },
    { name: 'Another', fields: { creator: 'someone', subject: 'x; y', bogus: 'ignored' } },
    { name: '', fields: { creator: 'no name' } },
  ] }));
  await sleep(500);
  const afterImport = JSON.parse(await run(`localStorage.getItem('nyx-ia-autofill')`));
  assert('Import adds new sets and replaces same-named ones', afterImport.length === 2 && afterImport.find(p => p.name === 'tokens').fields.description === 'replaced description' && afterImport.some(p => p.name === 'Another'), JSON.stringify(afterImport.map(p => p.name)));
  assert('unknown fields and nameless sets are dropped', !('bogus' in afterImport.find(p => p.name === 'Another').fields));
  assert('it reports what happened', /Imported 2 sets \(1 replaced\)/.test(await run(`document.getElementById('ia-autofill-status').textContent`)), await run(`document.getElementById('ia-autofill-status').textContent`));
  await importFile('this is not json');
  await sleep(300);
  assert('a bad file is rejected without touching the saved sets', /not valid JSON/.test(await run(`document.getElementById('ia-autofill-status').textContent`)) && JSON.parse(await run(`localStorage.getItem('nyx-ia-autofill')`)).length === 2);
  await run(`document.getElementById('ia-autofill-close').click(); 0`);

  console.log('\n9e. Drag and drop onto tools...');
  await run(`window.__drop = (sel, o) => {
    const target = document.querySelector(sel);
    const dt = new DataTransfer();
    (o.files || []).forEach((p) => { const f = new File(['x'], p.split('/').pop()); Object.defineProperty(f, 'path', { value: p }); dt.items.add(f); });
    if (o.text) { dt.setData('text/plain', o.text); dt.setData('text/uri-list', o.text); }
    const over = new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: dt });
    target.dispatchEvent(over);
    const panel = target.closest('.tab-panel');
    const highlighted = !!panel && panel.classList.contains('nyx-drop-active');
    const drop = new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt });
    target.dispatchEvent(drop);
    return { overPrevented: over.defaultPrevented, dropPrevented: drop.defaultPrevented, highlighted, clearedAfter: !(panel && panel.classList.contains('nyx-drop-active')) };
  }; 0`);
  const nav = async (tab) => { await run(`document.querySelector('.nav-item[data-tab="${tab}"]').click(); 0`); await sleep(250); };
  const count = (sel) => run(`document.querySelectorAll('${sel}').length`);

  await nav('splitter');
  let r = await run(`__drop('#tab-splitter .panel-header', { files: ['D:/Videos/clip-one.mp4', 'D:/Videos/clip-two.mp4'] })`);
  assert('Splitter: the panel lights up while dragging over it', r.highlighted && r.overPrevented);
  assert('Splitter: the first dropped file becomes the input', (await run(`document.getElementById('sp-file').value`)) === 'D:/Videos/clip-one.mp4');
  assert('Splitter: highlight clears after the drop', r.clearedAfter);

  await nav('concatenator');
  await run(`__drop('#tab-concatenator .panel-header', { files: ['D:/Videos/a.mp4', 'D:/Videos/b.mp4'] })`);
  assert('Concatenator: dropped files are added', (await count('#concat-file-list .sortable-item')) === 2);
  await run(`__drop('#concat-file-list', { files: ['D:/Videos/c.mp4'] })`);
  assert('Concatenator: dropping on the list itself adds each file once (no doubles)', (await count('#concat-file-list .sortable-item')) === 3);

  await nav('encoder');
  await run(`__drop('#tab-encoder .panel-header', { files: ['D:/Videos/e1.mp4', 'D:/Videos/e2.mp4'] })`);
  assert('Encoder: dropped files are added', (await count('#enc-file-list .sortable-item')) === 2);

  await nav('ytdlp');
  r = await run(`__drop('#tab-ytdlp .panel-header', { text: 'https://www.youtube.com/watch?v=dropTest001' })`);
  assert('yt-dlp: a dropped link fills the URL field', (await run(`document.getElementById('yd-url').value`)) === 'https://www.youtube.com/watch?v=dropTest001' && r.highlighted);

  await nav('batch');
  await run(`document.getElementById('batch-urls').value = ''; __drop('#tab-batch .panel-header', { text: 'https://example.com/one https://example.com/two' })`);
  await run(`__drop('#tab-batch .panel-header', { text: 'https://example.com/two' })`);
  assert('Batch: links are appended once each', (await run(`document.getElementById('batch-urls').value`)) === 'https://example.com/one\nhttps://example.com/two');

  await nav('ia');
  await run(`document.querySelector('#ia-mode-toggle [data-mode="upload"]').click(); document.getElementById('ia-add-concurrent-upload').click(); 0`);
  await sleep(200);
  await run(`__drop('#tab-ia .panel-header', { files: ['D:/Videos/upload-me.mp4'] })`);
  assert('Internet Archive: dropped files go into the upload list', (await count('#ia-files .sortable-item')) === 1);
  await run(`document.querySelector('#ia-mode-toggle [data-mode="download"]').click(); 0`);
  await sleep(200);
  await run(`__drop('#tab-ia .panel-header', { text: 'https://archive.org/details/some-item-id' })`);
  assert('Internet Archive (Download): a dropped link fills the field', (await run(`document.getElementById('ia-identifier-down').value`)) === 'https://archive.org/details/some-item-id');
  await run(`document.querySelector('#ia-mode-toggle [data-mode="upload"]').click(); 0`);

  await nav('history');
  r = await run(`__drop('#tab-history .tab-header', { files: ['D:/Videos/stray.mp4'] })`);
  assert('Dropping a file where nothing accepts it is swallowed (no window navigation)', r.dropPrevented && r.overPrevented && !r.highlighted);

  console.log('\n10. Progress of a second stream shows after the first hits 100%...');
  const shown = await run(`(() => {
    const el = document.createElement('div');
    document.body.appendChild(el);
    const feed = (t) => handleOutput(el, { type: 'stdout', text: t + '\\n' });
    feed('[download] Destination: video.f401.mp4');
    feed('[download] 100% of  412.80MiB in 00:00:22 at 18.71MiB/s');
    feed('[download] Destination: audio.f251.webm');
    feed('[download]  42.0% of    9.62MiB at    2.40MiB/s ETA 00:04');
    const n = el._liveProgresses ? el._liveProgresses.size : 0;
    el.remove();
    return n;
  })()`);
  assert('audio progress line is pinned after the video stream completes', shown === 1, `pinned=${shown}`);

  console.log('\n11. No renderer errors...');
  assert('no console errors / uncaught exceptions', errors.length === 0, errors.join(' | '));

  console.log(failures ? `\n ${failures} IA TAB TEST(S) FAILED` : '\n ✔ ALL IA TAB TESTS PASSED');
  app.exit(failures ? 1 : 0);
}).catch((e) => { console.error(e); app.exit(1); });
