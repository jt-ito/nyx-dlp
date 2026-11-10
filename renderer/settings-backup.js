/* ── Settings backup & restore ───────────────────────────────
 * Export: every saved setting (the same state the main process keeps on disk) plus the few
 * browser-side extras (theme, disk-space mode, Internet Archive Autofill sets) in one JSON file.
 * Tokens and passwords are never written to it.
 * Import: asks first, then applies each value to its control (so the normal save/sync paths run),
 * and reloads the window so every screen picks the restored values up.
 */
(function () {
  const $ = (id) => document.getElementById(id);
  const exportBtn = $('settings-export-btn');
  const importBtn = $('settings-import-btn');
  const importFile = $('settings-import-file');
  const statusEl = $('settings-backup-status');
  const modal = $('settings-import-modal');
  if (!exportBtn || !importBtn || !importFile) return;

  // Browser-side values worth carrying over (everything else lives in the main-process state).
  const LOCAL_KEYS = ['theme', 'lastLightTheme', 'lastDarkTheme', 'disk-space-mode', 'disk-static-drive', 'nyx-ia-autofill'];
  // Never exported or imported: anything that looks like a credential.
  const SECRET_RE = /token|password|secret|(^|[:_-])pass($|[:_-])|(^|[:_-])pin($|[:_-])/i;
  const say = (msg) => { if (statusEl) statusEl.textContent = msg; };

  function validEntry(e) {
    if (!e || typeof e !== 'object') return false;
    return typeof e.value === 'string' || typeof e.value === 'number' || typeof e.checked === 'boolean';
  }

  async function exportSettings() {
    let state = {};
    try { state = (await window.api.invoke('get-all-settings')) || {}; } catch (_) {}
    const clean = {};
    let skipped = 0;
    Object.keys(state).forEach((id) => {
      if (SECRET_RE.test(id)) { skipped++; return; }
      if (validEntry(state[id])) clean[id] = state[id];
    });
    const local = {};
    LOCAL_KEYS.forEach((k) => { try { const v = localStorage.getItem(k); if (v !== null) local[k] = v; } catch (_) {} });
    const payload = { nyxSettings: 1, app: 'nyx-dlp', appVersion: (window.api && window.api.appVersion) || '', exportedAt: new Date().toISOString(), state: clean, local };
    const where = await window.api.saveTextFile({ defaultName: 'nyx-dlp-settings.json', content: JSON.stringify(payload, null, 2), filters: [{ name: 'JSON', extensions: ['json'] }] });
    if (where) say(`Saved ${Object.keys(clean).length} settings${skipped ? ` (${skipped} credential${skipped === 1 ? '' : 's'} left out)` : ''}.`);
  }

  // Parsed backup waiting for the user's confirmation.
  let pending = null;

  function readBackup(text) {
    let data;
    try { data = JSON.parse(text); } catch (_) { return { error: 'That file is not valid JSON.' }; }
    if (!data || data.nyxSettings !== 1 || typeof data.state !== 'object' || data.state === null) return { error: 'That is not a nyx-dlp settings backup.' };
    const state = {};
    Object.keys(data.state).forEach((id) => {
      if (id.length <= 100 && !SECRET_RE.test(id) && validEntry(data.state[id])) state[id] = data.state[id];
    });
    const local = {};
    if (data.local && typeof data.local === 'object') {
      LOCAL_KEYS.forEach((k) => { if (typeof data.local[k] === 'string') local[k] = data.local[k]; });
    }
    if (Object.keys(state).length === 0 && Object.keys(local).length === 0) return { error: 'No settings found in that file.' };
    return { state, local };
  }

  function applyBackup({ state, local }) {
    Object.entries(local).forEach(([k, v]) => { try { localStorage.setItem(k, v); } catch (_) {} });
    Object.entries(state).forEach(([id, entry]) => {
      const el = document.getElementById(id) || document.querySelector(`[data-setting="${id}"]`);
      const isCheck = typeof entry.checked === 'boolean';
      if (el) {
        // Through the control itself, so persistence and the main-process sync run as for a normal edit.
        if (el.type === 'checkbox' || el.type === 'radio') el.checked = isCheck ? entry.checked : !!entry.value;
        else el.value = String(entry.value === undefined ? '' : entry.value);
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
      } else if (window.api.syncUiState) {
        // Not on screen right now (dynamic lists such as site presets): store it straight to the main process.
        window.api.syncUiState(isCheck ? { id, type: 'checkbox', checked: entry.checked } : { id, type: 'text', value: String(entry.value) });
        if (id === 'site-presets') { try { localStorage.setItem('field:site-presets', String(entry.value)); } catch (_) {} }
      }
    });
    // Let the sync messages leave before the window reloads with the restored settings.
    setTimeout(() => (window._reloadApp || (() => location.reload()))(), 400);
  }

  function hideModal() { if (modal) modal.style.display = 'none'; pending = null; }

  exportBtn.addEventListener('click', () => { exportSettings().catch((e) => say('Could not export: ' + e.message)); });
  importBtn.addEventListener('click', () => importFile.click());
  importFile.addEventListener('change', () => {
    const file = importFile.files && importFile.files[0];
    importFile.value = '';
    if (!file) return;
    const reader = new FileReader();
    reader.onerror = () => say('Could not read that file.');
    reader.onload = () => {
      const parsed = readBackup(String(reader.result || ''));
      if (parsed.error) { say(parsed.error); return; }
      pending = parsed;
      const n = Object.keys(parsed.state).length;
      $('settings-import-count').textContent = `${n} setting${n === 1 ? '' : 's'}`;
      if (modal) modal.style.display = 'flex'; else applyBackup(parsed);
    };
    reader.readAsText(file);
  });
  $('settings-import-cancel')?.addEventListener('click', hideModal);
  modal?.addEventListener('click', (e) => { if (e.target === modal) hideModal(); });
  $('settings-import-confirm')?.addEventListener('click', () => {
    const p = pending;
    hideModal();
    if (p) { say('Restoring…'); applyBackup(p); }
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && modal && modal.style.display !== 'none') hideModal(); });
})();
