/**
 * Automated UI & DOM Integrity Test Suite for nyx-dlp
 *
 * Verifies:
 * 1. HTML tag hierarchy & balance (no unclosed tags, proper nesting).
 * 2. Presence of all essential tab panels and action buttons.
 * 3. Static document.getElementById references across renderer scripts.
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const rootDir = path.resolve(__dirname, '..');
const htmlPath = path.join(rootDir, 'index.html');
const rendererDir = path.join(rootDir, 'renderer');

let failures = 0;

function report(testName, passed, details = '') {
  if (passed) {
    console.log(`  ✔ [PASS] ${testName}`);
  } else {
    console.error(`  ✖ [FAIL] ${testName}`);
    if (details) console.error(`    ↳ ${details}`);
    failures++;
  }
}

console.log('\n========================================');
console.log(' nyx-dlp UI Integrity Verification Test ');
console.log('========================================\n');

// ── Test 1: HTML Tag Balance & Well-Formedness ──────────────────
console.log('1. Checking HTML Tag Hierarchy & Balance in index.html...');
const html = fs.readFileSync(htmlPath, 'utf8');

const voidTags = new Set([
  'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input',
  'link', 'meta', 'param', 'source', 'track', 'wbr'
]);

const tagRegex = /<\/?([a-zA-Z0-9]+)(?:\s+[^>]*)?>/g;
const stack = [];
let match;
let lineNum = 1;
let lastIndex = 0;
let tagErrors = [];

while ((match = tagRegex.exec(html)) !== null) {
  const lineCount = html.substring(lastIndex, match.index).split('\n').length - 1;
  lineNum += lineCount;
  lastIndex = match.index;

  const fullTag = match[0];
  const tagName = match[1].toLowerCase();
  const isClosing = fullTag.startsWith('</');
  const isSelfClosing = fullTag.endsWith('/>') || voidTags.has(tagName);

  if (isSelfClosing && !isClosing) continue;

  if (!isClosing) {
    stack.push({ tag: tagName, line: lineNum });
  } else {
    if (stack.length === 0) {
      tagErrors.push(`Unexpected closing tag </${tagName}> at line ${lineNum} with empty stack`);
    } else {
      const top = stack.pop();
      if (top.tag !== tagName) {
        tagErrors.push(`Mismatched tag: expected </${top.tag}> (opened at line ${top.line}), but found </${tagName}> at line ${lineNum}`);
      }
    }
  }
}

if (stack.length > 0) {
  tagErrors.push(`${stack.length} unclosed tag(s) remaining at EOF (top: <${stack[stack.length - 1].tag}> from line ${stack[stack.length - 1].line})`);
}

report('Tag balance check', tagErrors.length === 0, tagErrors.join('\n    ↳ '));

// ── Test 2: Essential Tab Panels & Action Buttons ──────────────
console.log('\n2. Verifying Essential Action Buttons & Tab Panels...');
const requiredElements = [
  // Primary tool run buttons
  'yd-run', 'ls-run', 'batch-run', 'm3-run', 'gdl-run',
  'sp-run', 'concat-run', 'enc-run', 'ia-upload-run', 'ia-edit-run', 'ia-download-run',
  // Stop controls
  'yd-stop', 'ls-stop', 'batch-stop', 'm3-stop', 'gdl-stop',
  'sp-stop', 'concat-stop', 'enc-stop', 'ia-upload-stop', 'ia-edit-stop', 'ia-download-stop',
  // Tab panels
  'tab-ytdlp', 'tab-livestream', 'tab-batch', 'tab-m3u8', 'tab-gallery',
  'tab-splitter', 'tab-concatenator', 'tab-encoder', 'tab-ia', 'tab-history', 'tab-settings',
  'tab-tool-hub'
];

// Extract all IDs from index.html
const idRegex = /id=["']([^"']+)["']/g;
const htmlIds = new Set();
let idMatch;
while ((idMatch = idRegex.exec(html)) !== null) {
  htmlIds.add(idMatch[1]);
}

const missingRequired = requiredElements.filter(id => !htmlIds.has(id));
report('Required tab panels and action buttons exist', missingRequired.length === 0,
  missingRequired.length ? `Missing elements: ${missingRequired.join(', ')}` : '');

// ── Test 3: Static getElementById Reference Verification ─────────
console.log('\n3. Verifying JavaScript document.getElementById References...');

function collectJsFiles(dir) {
  const results = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...collectJsFiles(full));
    } else if (entry.isFile() && entry.name.endsWith('.js')) {
      results.push(full);
    }
  }
  return results;
}

const jsFiles = collectJsFiles(rendererDir);
const getByIdRegex = /document\.getElementById\(["']([^"']+)["']\)/g;
let totalReferences = 0;
const unresolvedIds = new Map();

// Allowlist for dynamically generated IDs created at runtime by scripts
const dynamicPrefixes = [
  'rfb-',
  'tool-card-',
  'btn-check-',
  'btn-update-',
  'btn-switch-',
  'select-version-',
  'custom-row-',
  'input-custom-version-',
  'progress-wrap-',
  'progress-bar-',
  'progress-msg-',
  'tool-ver-badge-',
  'tool-update-pill-',
  'tool-status-badge-',
  'tool-status-container-',
  'btn-update-text-'
];
const dynamicAllowlist = new Set([
  'toast-container',
  'toast-container-bottom-left',
  'toast-container-bottom-right',
  'notification-badge',
  'active-drag-clone',
  'theme-grid-container',
  'easterEggDarkSlot',
  'sp-calc-copy-all-parts',
  'sp-calc-copy-all-text'
]);

function isDynamicId(id) {
  if (dynamicAllowlist.has(id)) return true;
  for (const prefix of dynamicPrefixes) {
    if (id.startsWith(prefix)) return true;
  }
  return false;
}

for (const jsFile of jsFiles) {
  const content = fs.readFileSync(jsFile, 'utf8');
  let refMatch;
  while ((refMatch = getByIdRegex.exec(content)) !== null) {
    totalReferences++;
    const id = refMatch[1];
    if (!htmlIds.has(id) && !isDynamicId(id)) {
      if (!unresolvedIds.has(id)) unresolvedIds.set(id, []);
      unresolvedIds.get(id).push(path.relative(rootDir, jsFile));
    }
  }
}

const unresolvedList = [];
for (const [id, files] of unresolvedIds.entries()) {
  unresolvedList.push(`#${id} in ${[...new Set(files)].join(', ')}`);
}

report(`Static getElementById references (${totalReferences} audited)`, unresolvedList.length === 0,
  unresolvedList.length ? `Unresolved IDs (${unresolvedList.length}):\n    ↳ ${unresolvedList.join('\n    ↳ ')}` : '');

// ── Test 4: JavaScript Syntax & AST Compilation ─────────────────
console.log('\n4. Verifying JavaScript Syntax & AST Compilation in renderer/ and lib/...');
const libDir = path.join(rootDir, 'lib');
const allJsFiles = [
  ...collectJsFiles(rendererDir),
  ...(fs.existsSync(libDir) ? collectJsFiles(libDir) : [])
];
let syntaxErrors = [];
for (const jsFile of allJsFiles) {
  const content = fs.readFileSync(jsFile, 'utf8');
  try {
    new vm.Script(content, { filename: path.relative(rootDir, jsFile) });
  } catch (err) {
    syntaxErrors.push(`${path.relative(rootDir, jsFile)}: ${err.message}`);
  }
}

report(`JavaScript syntax & AST compilation (${allJsFiles.length} files audited)`, syntaxErrors.length === 0,
  syntaxErrors.length ? `Syntax errors:\n    ↳ ${syntaxErrors.join('\n    ↳ ')}` : '');

console.log('\n========================================');
if (failures === 0) {
  console.log(` ✔ ALL INTEGRITY CHECKS PASSED (Total IDs: ${htmlIds.size}, Audited Refs: ${totalReferences})`);
  console.log('========================================\n');
  process.exit(0);
} else {
  console.error(` ✖ FAILED: ${failures} integrity check(s) failed.`);
  console.log('========================================\n');
  process.exit(1);
}
