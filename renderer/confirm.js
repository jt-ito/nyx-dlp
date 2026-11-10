/* In-app replacement for window.confirm(): matches the app's modals and theme.
   Usage: if (await nyxConfirm({ title, message, confirmText, danger })) { ... } */
(function () {
  let modal = null;

  function build() {
    modal = document.createElement('div');
    modal.style.cssText = 'display:none; position:fixed; inset:0; background:rgba(0,0,0,0.5); z-index:4000; align-items:center; justify-content:center;';
    modal.innerHTML = `
      <div style="background:var(--bg-surface); padding:24px; border-radius:8px; border:1px solid var(--border); box-shadow:var(--shadow); width:400px; max-width:90vw;">
        <h3 data-r="title" style="margin-bottom:12px; font-size:16px; font-weight:600;"></h3>
        <p data-r="message" style="font-size:14px; color:var(--text); margin-bottom:24px; white-space:pre-line;"></p>
        <div style="display:flex; justify-content:flex-end; gap:8px;">
          <button class="btn btn-ghost" data-r="cancel"></button>
          <button class="btn btn-primary" data-r="ok"></button>
        </div>
      </div>`;
    document.body.appendChild(modal);
  }

  window.nyxConfirm = function ({ title = 'Are you sure?', message = '', confirmText = 'Confirm', cancelText = 'Cancel', danger = false } = {}) {
    if (!modal) build();
    const q = (k) => modal.querySelector(`[data-r="${k}"]`);
    q('title').textContent = title;
    q('message').textContent = message;
    q('cancel').textContent = cancelText;
    const ok = q('ok');
    ok.textContent = confirmText;
    ok.style.cssText = danger ? 'background:#ff5f57; color:#fff; border:none;' : '';
    modal.style.display = 'flex';
    ok.focus();

    return new Promise((resolve) => {
      const done = (result) => {
        modal.style.display = 'none';
        document.removeEventListener('keydown', onKey, true);
        q('ok').onclick = q('cancel').onclick = modal.onclick = null;
        resolve(result);
      };
      const onKey = (e) => {
        if (e.key === 'Escape') { e.preventDefault(); done(false); }
      };
      document.addEventListener('keydown', onKey, true);
      q('ok').onclick = () => done(true);
      q('cancel').onclick = () => done(false);
      modal.onclick = (e) => { if (e.target === modal) done(false); };
    });
  };
})();
