/* ── Status Bar ─────────────────────────────────────────── */
const statusDot  = document.getElementById('statusDot');
const statusText = document.getElementById('statusText');
const statusWrap = document.getElementById('statusWrap');
var runningCount = 0;
const runningTools = new Set();

function setStatus(state, text) {
  if (statusDot) statusDot.className = 'status-dot ' + (state || '');
  if (statusText) statusText.textContent = text || 'Idle';
}
function updateRunningTooltip() {
  if (statusWrap) statusWrap.title = runningTools.size > 0 ? [...runningTools].join('\n') : '';
}
function incRunning(tool) {
  if (tool) {
    if (runningTools.has(tool)) {
      // Already tracked as running for this tool
      return;
    }
    runningTools.add(tool);
  }
  runningCount = Math.max(runningCount + 1, runningTools.size);
  updateRunningTooltip();
  setStatus('running', 'Running...');
}
function decRunning(tool) {
  if (tool) runningTools.delete(tool);
  runningCount = Math.max(0, runningTools.size);
  updateRunningTooltip();
  if (runningCount === 0) {
    setStatus('done', 'Done');
  }
}

/* ── Exit confirmation (main.js asks before quitting while tasks run) ── */
(function () {
  const modal = document.getElementById('exit-confirm-modal');
  const list = document.getElementById('exit-confirm-list');
  const cancelBtn = document.getElementById('exit-confirm-cancel');
  const submitBtn = document.getElementById('exit-confirm-submit');
  if (!modal || !window.api || !window.api.onConfirmExit) return;

  const respond = (ok) => {
    modal.style.display = 'none';
    window.api.respondExitConfirm(ok);
  };
  window.api.onConfirmExit(({ work }) => {
    list.textContent = '';
    for (const name of work) {
      const li = document.createElement('li');
      li.textContent = name;
      list.appendChild(li);
    }
    modal.style.display = 'flex';
    cancelBtn.focus();
  });
  cancelBtn.addEventListener('click', () => respond(false));
  submitBtn.addEventListener('click', () => respond(true));
  modal.addEventListener('click', (e) => { if (e.target === modal) respond(false); });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && modal.style.display !== 'none') respond(false);
  });
})();
