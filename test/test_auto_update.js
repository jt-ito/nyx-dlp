// Tool auto-update: honours the setting, skips while busy, never downgrades, only touches installed tools.
const assert = require('assert');
const toolHub = require('../lib/tool-hub');
const runners = require('../lib/runners');
const store = require('../lib/settings-store');
const { autoUpdateTools } = require('../lib/auto-update-tools');

(async () => {
  const installed = [];
  const events = [];
  const info = {
    ytdlp: { installed: true, vendored: true, current: '2026.08.19', latest: '2026.10.10' },   // update
    gallerydl: { installed: true, vendored: true, current: '1.33.0-dev', latest: '1.32.16' },  // newer nightly: no downgrade
    streamlink: { installed: false, vendored: false, current: null, latest: '9.9.9' },          // not installed
    // aria2c is a system copy the user manages: left alone even though it is behind
    aria2c: { installed: true, vendored: false, current: '1.36.0', latest: '1.37.0' },
    deno: { installed: true, vendored: true, current: '2.0.0', latest: '2.1.0' }               // update
  };
  toolHub.getToolInfo = async (t) => ({ installed: info[t].installed, isVendored: info[t].vendored });
  toolHub.checkToolUpdates = async (t) => ({ currentVersion: info[t].current, latestVersion: info[t].latest, updateAvailable: info[t].current !== info[t].latest });
  toolHub.installToolVersion = async (t, v) => { installed.push([t, v]); };
  const broadcast = () => {};
  const onUpdated = (tool, version) => events.push(['tool-auto-updated', { tool, version }]);
  const realGet = store.getSettingValue;
  const realCount = runners.getActiveTaskCount;
  console.log = () => {}; // the updater logs each step

  store.getSettingValue = () => false; // setting off
  await autoUpdateTools(broadcast, onUpdated);
  assert.strictEqual(installed.length, 0, 'does nothing when switched off');

  store.getSettingValue = () => true;
  runners.getActiveTaskCount = () => 1; // something is running
  await autoUpdateTools(broadcast, onUpdated);
  assert.strictEqual(installed.length, 0, 'does nothing while a task is running');

  runners.getActiveTaskCount = () => 0;
  await autoUpdateTools(broadcast, onUpdated);
  assert.deepStrictEqual(installed.map(x => x[0]), ['ytdlp', 'deno'], 'updates only vendored, installed tools that are behind');
  assert(installed.every(x => x[1] === 'latest'));
  assert.deepStrictEqual(events.filter(e => e[0] === 'tool-auto-updated').map(e => e[1].tool), ['ytdlp', 'deno'], 'tells the UI');

  store.getSettingValue = realGet; runners.getActiveTaskCount = realCount;
  process.stdout.write(' ✔ ALL AUTO-UPDATE TESTS PASSED\n');
  process.exit(0);
})().catch(e => { process.stdout.write(String(e.stack || e) + '\n'); process.exit(1); });
