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
/* Taskbar progress: average of the percentages the running tools reported recently; with none known
 * (ffmpeg jobs, resting batches…) it shows the "working" animation; nothing running clears it. */
const progressByLog = new Map(); // log element id -> { pct, t }
let taskbarLast = '';
let taskbarTimer = null;
function computeTaskbar() {
  if (runningTools.size === 0) return { value: -1 };
  const now = Date.now();
  const fresh = [...progressByLog.values()].filter(p => now - p.t < 8000);
  if (fresh.length === 0) return { value: 2, mode: 'indeterminate' };
  const avg = fresh.reduce((s, p) => s + p.pct, 0) / fresh.length / 100;
  return { value: Math.min(0.99, Math.max(0.01, avg)), mode: 'normal' };
}
function pushTaskbar() {
  taskbarTimer = null;
  const s = computeTaskbar();
  const key = JSON.stringify([s.value === 2 || s.value < 0 ? s.value : Math.round(s.value * 100), s.mode || '']);
  if (key === taskbarLast) return;
  taskbarLast = key;
  if (window.api && window.api.setTaskbarProgress) window.api.setTaskbarProgress(s.value, s.mode);
}
function scheduleTaskbar() {
  if (!taskbarTimer) taskbarTimer = setTimeout(pushTaskbar, 250); // coalesce bursts of progress lines
}
window._reportProgress = (id, pct) => { progressByLog.set(id, { pct, t: Date.now() }); scheduleTaskbar(); };
window._clearProgress = (id) => { progressByLog.delete(id); scheduleTaskbar(); };
setInterval(() => { if (runningTools.size > 0) scheduleTaskbar(); }, 3000); // lets stale percentages age out

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
  scheduleTaskbar();
}
function decRunning(tool) {
  if (tool) runningTools.delete(tool);
  runningCount = Math.max(0, runningTools.size);
  updateRunningTooltip();
  if (runningCount === 0) {
    setStatus('done', 'Done');
  }
  scheduleTaskbar();
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
