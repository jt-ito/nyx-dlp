// Streamlink install: plain pip first, a private venv when the OS blocks system-wide pip.
const assert = require('assert');
const { installStreamlink } = require('../lib/ensure-streamlink');

const blocked = () => Object.assign(new Error('pip failed'), { output: 'error: externally-managed-environment\n x This environment is externally managed' });
const log = () => {};

(async () => {
  // 1. normal system: one pip call, no venv
  let calls = [];
  await installStreamlink('latest', log, { venvExists: () => false, run: async (c, a) => { calls.push([c, ...a]); } });
  assert.strictEqual(calls.length, 1);
  assert(calls[0].includes('pip') && calls[0].includes('streamlink'));

  // 2. PEP 668 system: pip refused -> create venv -> pip inside the venv
  calls = [];
  await installStreamlink('8.0.0', log, {
    venvExists: () => false,
    run: async (c, a) => { calls.push([c, ...a]); if (a.includes('pip') && calls.length === 1) throw blocked(); }
  });
  assert.strictEqual(calls.length, 3, 'pip, venv, pip-in-venv');
  assert(calls[1].includes('venv'), 'second step creates the venv');
  assert(calls[2].includes('streamlink==8.0.0') && /venv/.test(calls[2][0]), 'third step installs the pinned version into the venv');

  // 3. venv already there: straight to the venv, never the system pip
  calls = [];
  await installStreamlink('latest', log, { venvExists: () => true, run: async (c, a) => { calls.push([c, ...a]); } });
  assert.strictEqual(calls.length, 1);
  assert(/venv/.test(calls[0][0]));

  // 4. no python3-venv: clear message
  await assert.rejects(installStreamlink('latest', log, {
    venvExists: () => false,
    run: async (c, a) => { if (a.includes('pip')) throw blocked(); throw new Error('ensurepip is not available'); }
  }), /python3-venv/);

  // 5. unknown version: friendly error, no venv attempt
  await assert.rejects(installStreamlink('0.0.0', log, {
    venvExists: () => false,
    run: async () => { throw Object.assign(new Error('x'), { output: 'ERROR: No matching distribution found for streamlink==0.0.0' }); }
  }), /not real or available/);

  process.stdout.write(' ✔ ALL STREAMLINK-INSTALL TESTS PASSED\n');
  process.exit(0);
})().catch(e => { process.stdout.write(String(e.stack || e) + '\n'); process.exit(1); });
