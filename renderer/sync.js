/* ── UI State Synchronization ────────────────────────────── */
let isSyncingState = false;

const TRANSIENT_SYNC_IDS = new Set([
  'yd-url', 'batch-urls', 'ls-url', 'm3-url', 'gdl-url',
  'yd-start', 'yd-end', 'm3-start', 'm3-end', 'm3-twitch-title-input',
  'concat-output-name',
  'ia-identifier-up', 'ia-identifier-edit', 'ia-identifier-down', 'ia-identifier-dl',
  'ia-title', 'ia-description', 'ia-creator',
  'ia-date', 'ia-date-y', 'ia-date-m', 'ia-date-d',
  'ia-collection', 'ia-mediatype', 'ia-subject', 'ia-license', 'ia-language',
  'ia-edit-key', 'ia-edit-value',
  'ia-auth-email', 'ia-auth-password'
]);

function broadcastState(el) {
  if (isSyncingState || !window.api || !window.api.syncUiState) return;
  const id = el.id || el.dataset?.setting;
  if (!id || TRANSIENT_SYNC_IDS.has(id)) return;
  window.api.syncUiState({
    id,
    type: el.type,
    value: el.value,
    checked: el.checked
  });
}

document.addEventListener('input', (e) => {
  if (e.target && e.target.matches && e.target.matches('.form-input, .form-textarea, .form-select')) {
    broadcastState(e.target);
  }
});

document.addEventListener('change', (e) => {
  if (e.target && e.target.matches && e.target.matches('.toggle-switch input, input[type="radio"], input[type="checkbox"], .form-select')) {
    broadcastState(e.target);
  }
});

if (window.api) {
  function applyStateToElement(el, data) {
    if (!el || data === undefined || data === null) return;
    const isCheckable = el.type === 'checkbox' || el.type === 'radio';
    if (isCheckable) {
      const targetChecked = (typeof data === 'object' && data !== null)
        ? (data.checked !== undefined ? !!data.checked : !!data.value)
        : (data === true || data === 'true');
      if (el.checked !== targetChecked) {
        el.checked = targetChecked;
        el.dispatchEvent(new Event('change', { bubbles: true }));
      }
    } else {
      let targetValue = (typeof data === 'object' && data !== null)
        ? (data.value !== undefined ? data.value : '')
        : String(data);
      if (targetValue === 'undefined' || targetValue === 'null' || targetValue === undefined || targetValue === null) {
        targetValue = '';
      }
      if (el.value !== targetValue) {
        el.value = targetValue;
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
      }
    }
  }

  if (window.api.onSyncUiState) {
    window.api.onSyncUiState((data) => {
      if (!data || !data.id) return;
      isSyncingState = true;
      const el = document.getElementById(data.id) || document.querySelector(`[data-setting="${data.id}"]`);
      applyStateToElement(el, data);
      isSyncingState = false;
    });
  }

  if (window.api.onFullState) {
    window.api.onFullState((state) => {
      if (!state || typeof state !== 'object') return;
      isSyncingState = true;
      Object.keys(state).forEach(id => {
        const data = state[id];
        const el = document.getElementById(id) || document.querySelector(`[data-setting="${id}"]`);
        applyStateToElement(el, data);
      });
      isSyncingState = false;
    });
  }
}

document.addEventListener('DOMContentLoaded', () => {
  if (window.api && window.api.requestFullState) {
    setTimeout(() => {
      window.api.requestFullState();
    }, 150);
  }
});
