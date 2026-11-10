// The Discord download folder must stick: one source of truth, never wiped by accident, and a stale
// older copy must never override a newer edit.
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

// Isolated config dir (settings-store reads these env vars on every call when not under Electron).
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'nyx-dir-test-'));
process.env.APPDATA = tmp;
process.env.XDG_CONFIG_HOME = tmp;
const store = require('../lib/settings-store');
const bot = require('../lib/discord-bot');
const settingsFile = () => store.settingsFilePath;
const uiSync = (value) => store.updateSetting('discord-download-dir', { id: 'discord-download-dir', type: 'text', value });
const fresh = () => { try { fs.unlinkSync(settingsFile()); } catch (_) {} bot.downloadDir = ''; };
const defaultDir = path.join(os.homedir(), 'Downloads', 'nyx-dlp');
const A = path.join(tmp, 'first'), B = path.join(tmp, 'second');

// 1. nothing saved: default folder
fresh();
assert.strictEqual(store.getDiscordDownloadDir(), '');
assert.strictEqual(bot.getEffectiveDownloadDir(), defaultDir);

// 2. older versions' copy is migrated once
fresh();
store.updateSetting('discordDownloadDir', A);
assert.strictEqual(store.getDiscordDownloadDir(), A);
assert.strictEqual(store.loadAllSettings()['discord-download-dir'].value, A, 'migrated into the real key');

// 3. a newer edit beats the stale older copy (this used to revert to A after a restart)
uiSync(B);
assert.strictEqual(store.getDiscordDownloadDir(), B);
assert.strictEqual(store.getDiscordDownloadDir(A), B, 'app-settings legacy value is ignored once the real key exists');
assert.strictEqual(bot.getEffectiveDownloadDir(), B);

// 4. connecting with a blank field never wipes the saved folder
store.rememberDiscordDownloadDir('');
store.rememberDiscordDownloadDir('undefined');
store.rememberDiscordDownloadDir(null);
assert.strictEqual(store.getDiscordDownloadDir(), B);
store.rememberDiscordDownloadDir(A);
assert.strictEqual(store.getDiscordDownloadDir(), A, 'a real folder is remembered');

// 5. a change made while the bot is running applies immediately (the bot used to keep its start-up copy)
bot.downloadDir = A;           // what start() was given
uiSync(B);                     // user edits the field afterwards
assert.strictEqual(bot.getEffectiveDownloadDir(), B);

// 6. emptying the field on purpose really goes back to the default
uiSync('');
assert.strictEqual(store.getDiscordDownloadDir(A), '', 'explicit empty is respected, not re-migrated');
bot.downloadDir = '';
assert.strictEqual(bot.getEffectiveDownloadDir(), defaultDir);

fs.rmSync(tmp, { recursive: true, force: true });
process.stdout.write(' ✔ ALL DISCORD-DIR TESTS PASSED\n');
process.exit(0);
