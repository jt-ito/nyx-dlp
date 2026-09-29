// Bug-finding lint only (undefined vars, const reassignment, dead code, etc.), not style.
// Run via `npm test` (test/verify_static_analysis.js).
const js = require('@eslint/js');
const globals = require('globals');
const espree = require('espree');
const fs = require('fs');
const path = require('path');

// Renderer files are plain <script> tags sharing ONE global scope, so a top-level
// declaration (or `window.x = ...`) in one file is a legitimate global in the others.
const rendererGlobals = {};
(function collect(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { collect(p); continue; }
    if (!e.name.endsWith('.js')) continue;
    const src = fs.readFileSync(p, 'utf8');
    for (const m of src.matchAll(/window\.([A-Za-z_$][\w$]*)\s*=[^=]/g)) rendererGlobals[m[1]] = 'writable';
    for (const n of espree.parse(src, { ecmaVersion: 2023, sourceType: 'script' }).body) {
      if (n.type === 'FunctionDeclaration' || n.type === 'ClassDeclaration') rendererGlobals[n.id.name] = 'writable';
      else if (n.type === 'VariableDeclaration') {
        for (const d of n.declarations) if (d.id.type === 'Identifier') rendererGlobals[d.id.name] = 'writable';
      }
    }
  }
})(path.join(__dirname, 'renderer'));

module.exports = [
  { ignores: ['node_modules/**', 'vendor/**', 'dist/**', 'scratch/**'] },
  {
    files: ['**/*.js'],
    languageOptions: { ecmaVersion: 2023, sourceType: 'commonjs', globals: globals.node },
    rules: {
      ...js.configs.recommended.rules,
      'no-use-before-define': ['error', { functions: false, classes: false, variables: false }],
      // Style/noise rules that don't indicate bugs in this codebase
      'no-unused-vars': 'off',
      'no-empty': 'off',
      'no-useless-escape': 'off',
      'no-control-regex': 'off',
      'no-prototype-builtins': 'off',
      'no-inner-declarations': 'off',
      'no-async-promise-executor': 'off',
      'no-case-declarations': 'off',
      'no-constant-condition': 'off',
      'no-misleading-character-class': 'off',
    },
  },
  {
    files: ['renderer/**/*.js'],
    languageOptions: { sourceType: 'script', globals: { ...globals.browser, ...rendererGlobals } },
    rules: { 'no-redeclare': 'off' }, // cross-file globals are seeded above, so redeclare fires on their own definitions
  },
  // Dual-mode module (Node + browser)
  { files: ['lib/site-presets.js'], languageOptions: { globals: { ...globals.node, ...globals.browser } } },
];
