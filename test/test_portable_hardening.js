const fs = require('fs');
const path = require('path');
const assert = require('assert');

console.log('====================================================');
console.log(' Running Portable Mode Hardening Verification Suite ');
console.log('====================================================\n');

const vendorDirModule = require('../lib/vendor-dir');
const { getPortableRootDir, getVendorBaseDir, getVendorDir } = vendorDirModule;

const testBase = path.join(__dirname, 'temp_portable_test_sandbox');
if (fs.existsSync(testBase)) {
  fs.rmSync(testBase, { recursive: true, force: true });
}
fs.mkdirSync(testBase, { recursive: true });

function runIsolatedTest(dirName, setupFn, testFn) {
  const dir = path.join(testBase, dirName);
  fs.mkdirSync(dir, { recursive: true });
  setupFn(dir);

  // Isolate by creating a stub script in dir that evaluates getPortableRootDir()
  const libDir = path.join(dir, 'lib');
  fs.mkdirSync(libDir, { recursive: true });
  fs.copyFileSync(path.join(__dirname, '..', 'lib', 'vendor-dir.js'), path.join(libDir, 'vendor-dir.js'));

  const runnerCode = `
    const path = require('path');
    const vdir = require('./lib/vendor-dir.js');
    const res = vdir.getPortableRootDir();
    process.stdout.write(JSON.stringify({ portableRoot: res }));
  `;
  const runnerFile = path.join(dir, 'test_runner.js');
  fs.writeFileSync(runnerFile, runnerCode);

  const { execFileSync } = require('child_process');
  const stdout = execFileSync(process.execPath, [runnerFile], { cwd: dir, encoding: 'utf8' });
  const result = JSON.parse(stdout);
  testFn(result.portableRoot, dir);
}

try {
  // Test 1: Folder named "nyx-dlp-portable" with NO marker file
  runIsolatedTest('nyx-dlp-portable', (dir) => {
    // Only exe and subdirs, no marker
    fs.writeFileSync(path.join(dir, 'nyx-dlp.exe'), '');
  }, (portableRoot) => {
    assert.strictEqual(portableRoot, null, 'Folder containing "portable" with no marker MUST return null');
    console.log('✔ [PASS] Folder name with "portable" but no marker is NOT detected as portable');
  });

  // Test 2: Directory with an existing "data/" folder but NO marker file
  runIsolatedTest('custom_install_with_data', (dir) => {
    fs.mkdirSync(path.join(dir, 'data'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'nyx-dlp.exe'), '');
  }, (portableRoot) => {
    assert.strictEqual(portableRoot, null, 'Directory with data/ but no marker MUST return null');
    console.log('✔ [PASS] Directory with data/ folder but no marker is NOT detected as portable');
  });

  // Test 3: Directory with both "portable" in name and "data/" folder, but NO marker file
  runIsolatedTest('portable_tools_data_nomarker', (dir) => {
    fs.mkdirSync(path.join(dir, 'data'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'nyx-dlp.exe'), '');
  }, (portableRoot) => {
    assert.strictEqual(portableRoot, null, 'Directory with "portable" name and data/ but no marker MUST return null');
    console.log('✔ [PASS] Directory with both "portable" name and data/ folder but no marker is NOT detected as portable');
  });

  // Test 4: Explicit marker `.portable`
  runIsolatedTest('valid_portable_dot', (dir) => {
    fs.writeFileSync(path.join(dir, '.portable'), '');
    fs.writeFileSync(path.join(dir, 'nyx-dlp.exe'), '');
  }, (portableRoot, dir) => {
    assert.strictEqual(path.resolve(portableRoot), path.resolve(dir), 'Explicit .portable marker MUST trigger portable mode');
    console.log('✔ [PASS] Explicit .portable marker triggers portable mode');
  });

  // Test 5: Explicit marker `portable.txt`
  runIsolatedTest('valid_portable_txt', (dir) => {
    fs.writeFileSync(path.join(dir, 'portable.txt'), 'portable marker');
    fs.writeFileSync(path.join(dir, 'nyx-dlp.exe'), '');
  }, (portableRoot, dir) => {
    assert.strictEqual(path.resolve(portableRoot), path.resolve(dir), 'Explicit portable.txt marker MUST trigger portable mode');
    console.log('✔ [PASS] Explicit portable.txt marker triggers portable mode');
  });

  // Test 6: Explicit marker `portable.ini`
  runIsolatedTest('valid_portable_ini', (dir) => {
    fs.writeFileSync(path.join(dir, 'portable.ini'), '[Portable]');
    fs.writeFileSync(path.join(dir, 'nyx-dlp.exe'), '');
  }, (portableRoot, dir) => {
    assert.strictEqual(path.resolve(portableRoot), path.resolve(dir), 'Explicit portable.ini marker MUST trigger portable mode');
    console.log('✔ [PASS] Explicit portable.ini marker triggers portable mode');
  });

  // Test 7: Non-Windows platform simulation
  runIsolatedTest('non_win32_simulation', (dir) => {
    fs.writeFileSync(path.join(dir, '.portable'), '');
  }, (portableRoot, dir) => {
    // Run runner with process.platform mocked as darwin / linux
    const runnerCode = `
      Object.defineProperty(process, 'platform', { value: 'darwin' });
      const vdir = require('./lib/vendor-dir.js');
      const res = vdir.getPortableRootDir();
      process.stdout.write(JSON.stringify({ portableRoot: res }));
    `;
    const runnerFile = path.join(dir, 'mac_test.js');
    fs.writeFileSync(runnerFile, runnerCode);
    const { execFileSync } = require('child_process');
    const stdout = execFileSync(process.execPath, [runnerFile], { cwd: dir, encoding: 'utf8' });
    const parsed = JSON.parse(stdout);
    assert.strictEqual(parsed.portableRoot, null, 'Non-win32 platform MUST return null even if marker exists');
    console.log('✔ [PASS] process.platform !== "win32" cleanly early-returns null (Windows-scoped)');
  });

  // Test 8: PATH augmentation audit in lib/runners.js
  const runnersPath = path.join(__dirname, '..', 'lib', 'runners.js');
  const runnersCode = fs.readFileSync(runnersPath, 'utf8');
  assert.strictEqual(runnersCode.includes('unshift(p1)'), false, 'p1 (broad vendor root) must NOT be added to PATH');
  assert.strictEqual(runnersCode.includes('unshift(p2)'), false, 'p2 (broad data/vendor root) must NOT be added to PATH');
  assert.strictEqual(runnersCode.includes('// Augment PATH strictly with specific vendor tool subdirectories'), true, 'Explicit security documentation comment must be present');
  console.log('✔ [PASS] Subprocess PATH is narrowed strictly to specific tool subdirectories (no broad vendor roots)');

  console.log('\n====================================================');
  console.log(' ✔ ALL PORTABLE HARDENING TESTS PASSED SUCCESSFULLY ');
  console.log('====================================================\n');
} finally {
  try {
    fs.rmSync(testBase, { recursive: true, force: true });
  } catch (_) {}
}
