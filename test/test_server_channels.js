// Every channel the browser shim sends must have a handler in server.js (headless CLI has no main.js).
const fs = require('fs');
const path = require('path');
const read = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const shim = read('renderer/remote-api.js');
const srv = read('server.js');

const HEADLESS_NOOP = new Set(['show-notification']); // desktop-only toast
const channels = [...new Set([
  ...[...shim.matchAll(/type:\s*'ipc-send',\s*channel:\s*'([^']+)'/g)].map(m => m[1]),
  ...[...shim.matchAll(/invoke\('([a-z0-9-]+)'/g)].map(m => m[1])
])].filter(c => !HEADLESS_NOOP.has(c));

const missing = channels.filter(c => !srv.includes("'" + c + "'"));
if (missing.length) {
  console.error('FAIL: shim channels without a server.js handler:', missing.join(', '));
  process.exit(1);
}
console.log(`PASS: ${channels.length} shim channels all handled by server.js`);
