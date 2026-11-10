// curl's raw "####" progress bar must never reach the log: only a clean percentage does.
const assert = require('assert');
const { curlPercent } = require('../lib/download-helper');

assert.strictEqual(curlPercent('\r######################                       45.2%'), 45.2);
assert.strictEqual(curlPercent('######### 12.0%\r############ 31.5%'), 31.5, 'takes the latest value in a chunk');
assert.strictEqual(curlPercent('\r######################################################## 100.0%\n'), 100);
assert.strictEqual(curlPercent('#=#=#'), null, 'curl\'s half-drawn start-up bar has no percentage');
assert.strictEqual(curlPercent('######'), null);
assert.strictEqual(curlPercent('curl: (22) The requested URL returned error: 404'), null, 'errors are not progress');

// aria2c on Linux/macOS: the Hub shows the right package-manager command for the system.
const { aria2ManualCommands } = require('../lib/tool-hub');
assert.strictEqual(aria2ManualCommands('win32'), null, 'Windows installs it itself');
assert.strictEqual(aria2ManualCommands('darwin').install, 'brew install aria2');
const nl = String.fromCharCode(10);
const rel = (...lines) => lines.join(nl);
assert.strictEqual(aria2ManualCommands('linux', rel('NAME="Ubuntu"', 'ID=ubuntu', 'ID_LIKE=debian')).install, 'sudo apt install aria2');
assert.strictEqual(aria2ManualCommands('linux', rel('ID="rocky"', 'ID_LIKE="rhel centos fedora"')).update, 'sudo dnf upgrade aria2');
assert.strictEqual(aria2ManualCommands('linux', 'ID=arch').install, 'sudo pacman -S aria2');
assert.strictEqual(aria2ManualCommands('linux', 'ID=somethingelse'), null, 'unknown distro: no guessed command');
process.stdout.write(' ✔ ALL DOWNLOAD-PROGRESS TESTS PASSED\n');
