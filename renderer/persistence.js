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
    'dep-bgutil-url',
    'ntf-storage-threshold',
    'discord-download-dir',
    'history-exclude-sites'
  ];

  // Select dropdowns — save on change
  const SELECT_IDS = [
    'ls-quality', 'ls-client', 'ls-container',
    'yd-format',
    'yd-container', 'yd-client',
    'batch-format', 'batch-container', 'batch-client',
    'm3-codec', 'm3-container',
    'sp-container',
    'gdl-filetypes',
    'dep-ffmpeg-version',
    'concat-quality',
    'enc-quality',
    'history-retention'
  ];

  // Checkboxes on the tool tabs (not settings-page toggles) — save on change
  const CHECK_IDS = [
    'batch-rest', 'batch-skip-live', 'm3-encode', 'gdl-meta',
    'ls-use-cookies', 'ls-from-start', 'yd-use-cookies', 'batch-use-cookies', 'm3-use-cookies', 'gdl-use-cookies',
    'ia-noderive', 'concat-force', 'concat-mkv',
    'yd-auto-repair', 'batch-auto-repair', 'm3-auto-repair', 'm3-native-hls', 'm3-auto-title',
    'yd-dl-subs', 'yd-embed-subs', 'yd-dl-chat', 'yd-dl-comments', 'yd-dl-desc', 'yd-dl-title', 'yd-dl-thumb', 'yd-embed-thumb', 'yd-skip-download', 'yd-get-url',
    'batch-dl-subs', 'batch-embed-subs', 'batch-dl-chat', 'batch-dl-comments', 'batch-dl-desc', 'batch-dl-title', 'batch-dl-thumb', 'batch-embed-thumb', 'batch-skip-download'
  ];

  TEXT_IDS.forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    const v = localStorage.getItem(fkey(id));
    if (v !== null && v !== 'undefined' && v !== 'null') {
      el.value = v;
    } else if (v === 'undefined' || v === 'null') {
      localStorage.removeItem(fkey(id));
    }
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
      'gdl-use-cookies': true,
      'm3-auto-title': true,
      'yd-dl-subs': true,
      'yd-embed-subs': true,
      'yd-dl-thumb': true,
      'yd-embed-thumb': true,
      'batch-dl-subs': true,
      'batch-embed-subs': true,
      'batch-dl-thumb': true,
      'batch-embed-thumb': true
    };
    el.checked = v !== null ? v === 'true' : (defaults[id] ?? false);
    el.dispatchEvent(new Event('change'));
    el.addEventListener('change', () => localStorage.setItem(fkey(id), el.checked));
  });

})();

