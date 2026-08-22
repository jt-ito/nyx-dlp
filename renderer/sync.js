/* ── UI State Synchronization ────────────────────────────── */
let isSyncingState = false;

const TRANSIENT_SYNC_IDS = new Set([
  'yd-url', 'batch-urls', 'ls-url', 'm3-url', 'gdl-url',
  'yd-start', 'yd-end', 'm3-start', 'm3-end',
  'concat-output-name',
  'ia-identifier-up', 'ia-identifier-edit', 'ia-identifier-dl',
  'ia-title', 'ia-description', 'ia-creator', 'ia-date', 'ia-collection', 'ia-mediatype', 'ia-subject',
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
  if (window.api.onSyncUiState) {
    window.api.onSyncUiState((data) => {
      isSyncingState = true;
      const el = document.getElementById(data.id) || document.querySelector(`[data-setting="${data.id}"]`);
      if (el) {
        if (data.type === 'checkbox' || data.type === 'radio') {
          if (el.checked !== data.checked) {
             el.checked = data.checked;
             el.dispatchEvent(new Event('change', { bubbles: true }));
          }
        } else {
          if (el.value !== data.value) {
             el.value = data.value;
             el.dispatchEvent(new Event('input', { bubbles: true }));
             el.dispatchEvent(new Event('change', { bubbles: true }));
          }
        }
      }
      isSyncingState = false;
    });
  }

  if (window.api.onFullState) {
    window.api.onFullState((state) => {
      isSyncingState = true;
      Object.keys(state).forEach(id => {
        const data = state[id];
        const el = document.getElementById(id) || document.querySelector(`[data-setting="${id}"]`);
        if (el) {
          if (data.type === 'checkbox' || data.type === 'radio') {
            if (el.checked !== data.checked) {
               el.checked = data.checked;
               el.dispatchEvent(new Event('change', { bubbles: true }));
            }
          } else {
            if (el.value !== data.value) {
               el.value = data.value;
               el.dispatchEvent(new Event('input', { bubbles: true }));
               el.dispatchEvent(new Event('change', { bubbles: true }));
            }
          }
        }
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
