/* ── Settings Initialization ─────────────────────────────── */
(function () {
  // Apply all settings on init (skip disk-space — its module isn't ready yet or already applied)
  Object.keys(SETTINGS_MAP).forEach(key => {
    if (key === 'show-disk-space') return;
    applySetting(key, getSetting(key));
  });

  // Set version number dynamically
  const verEl = document.getElementById('settings-version');
  if (verEl && window.api && window.api.appVersion) verEl.textContent = 'nyx-dlp v' + window.api.appVersion;

  // Sync checkbox states and listen for changes
  document.querySelectorAll('[data-setting]').forEach(chk => {
    chk.checked = getSetting(chk.dataset.setting);
    chk.addEventListener('change', () => {
      localStorage.setItem('setting:' + chk.dataset.setting, chk.checked);
      applySetting(chk.dataset.setting, chk.checked);
      // Auto-fill bgutil default URL when toggled on and field is empty
      if (chk.dataset.setting === 'dep-use-bgutil' && chk.checked) {
        const urlField = document.getElementById('dep-bgutil-url');
        if (urlField && !urlField.value.trim()) {
          urlField.value = 'http://127.0.0.1:4416';
          localStorage.setItem('field:dep-bgutil-url', urlField.value);
        }
      }
    });
  });

  // Accordion: yt-dlp Advanced Options
  const advToggle = document.getElementById('ytdlp-advanced-toggle');
  const advBody   = document.getElementById('ytdlp-advanced-body');
  if (advToggle && advBody) {
    advToggle.addEventListener('click', () => {
      const open = advBody.classList.toggle('open');
      advToggle.setAttribute('aria-expanded', open);
      if (open && !advBody.dataset.rendered) {
        advBody.dataset.rendered = '1';
        renderYtdlpOpts('');
        const ytdlpSearch = document.getElementById('ytdlp-opts-search');
        if (ytdlpSearch) {
          ytdlpSearch.addEventListener('input', () => renderYtdlpOpts(ytdlpSearch.value));
        }
      }
    });
  }

  // Accordion: Batch Advanced Options
  const batchAdvToggle = document.getElementById('batch-advanced-toggle');
  const batchAdvBody   = document.getElementById('batch-advanced-body');
  if (batchAdvToggle && batchAdvBody) {
    batchAdvToggle.addEventListener('click', () => {
      const open = batchAdvBody.classList.toggle('open');
      batchAdvToggle.setAttribute('aria-expanded', open);
      if (open && !batchAdvBody.dataset.rendered) {
        batchAdvBody.dataset.rendered = '1';
        renderBatchOpts('');
        const batchSearch = document.getElementById('batch-opts-search');
        if (batchSearch) {
          batchSearch.addEventListener('input', () => renderBatchOpts(batchSearch.value));
        }
      }
    });
  }
})();
