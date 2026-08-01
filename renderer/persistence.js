/* ── Form field persistence ────────────────────────────── */
(function () {
  function fkey(id) { return 'field:' + id; }

  // Text inputs — save on every keystroke
  const TEXT_IDS = [
    'ls-output',    'ls-cookies', 'ls-concurrent',
    'yd-output',    'yd-cookies',
    'batch-output', 'batch-cookies',
    'm3-output',    'm3-cookies',
    'gdl-output',   'gdl-cookies',
    'sp-output',
    'concat-output-dir',
    'dep-bgutil-url'
  ];

  // Select dropdowns — save on change
  const SELECT_IDS = [
    'ls-quality', 'ls-client', 'ls-container',
    'yd-format',
    'yd-container', 'yd-client',
    'batch-format', 'batch-container', 'batch-client',
    'm3-encode-codec', 'm3-container',
    'sp-container',
    'gdl-filetypes',
    'dep-ffmpeg-version',
    'concat-quality',
    'enc-quality'
  ];

  // Checkboxes on the tool tabs (not settings-page toggles) — save on change
  const CHECK_IDS = [
    'batch-rest', 'batch-skip-live', 'm3-encode', 'gdl-meta',
    'ls-use-cookies', 'ls-from-start', 'yd-use-cookies', 'batch-use-cookies', 'm3-use-cookies', 'gdl-use-cookies',
    'ia-noderive', 'concat-force', 'concat-mkv'
  ];

  TEXT_IDS.forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    const v = localStorage.getItem(fkey(id));
    if (v !== null) el.value = v;
    el.addEventListener('input', () => localStorage.setItem(fkey(id), el.value));
  });

  SELECT_IDS.forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    const v = localStorage.getItem(fkey(id));
    if (v !== null && [...el.options].some(o => o.value === v)) el.value = v;
    el.addEventListener('change', () => localStorage.setItem(fkey(id), el.value));
  });

  CHECK_IDS.forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    const v = localStorage.getItem(fkey(id));
    // Default overrides for checkboxes that should be ON out of the box
    const defaults = {
      'batch-rest': true,
      'ls-use-cookies': true,
      'yd-use-cookies': true,
      'batch-use-cookies': true,
      'm3-use-cookies': true,
      'gdl-use-cookies': true
    };
    el.checked = v !== null ? v === 'true' : (defaults[id] ?? false);
    el.dispatchEvent(new Event('change'));
    el.addEventListener('change', () => localStorage.setItem(fkey(id), el.checked));
  });

  // Auto-fill bgutil default URL on load if enabled and no value has been saved
  const bgutilField = document.getElementById('dep-bgutil-url');
  if (bgutilField && getSetting('dep-use-bgutil') && !bgutilField.value.trim()) {
    bgutilField.value = 'http://127.0.0.1:4416';
    localStorage.setItem('field:dep-bgutil-url', bgutilField.value);
  }
})();
