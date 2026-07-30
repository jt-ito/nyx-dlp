/* ── Status Bar ─────────────────────────────────────────── */
const statusDot  = document.getElementById('statusDot');
const statusText = document.getElementById('statusText');
const statusWrap = document.getElementById('statusWrap');
var runningCount = 0;
const runningTools = new Set();

function setStatus(state, text) {
  statusDot.className = 'status-dot ' + (state || '');
  statusText.textContent = text || 'Idle';
}
function updateRunningTooltip() {
  statusWrap.title = runningTools.size > 0 ? [...runningTools].join('\n') : '';
}
function incRunning(tool) {
  runningCount++;
  if (tool) runningTools.add(tool);
  updateRunningTooltip();
  setStatus('running', 'Running...');
}
function decRunning(tool) {
  runningCount = Math.max(0, runningCount - 1);
  if (tool) runningTools.delete(tool);
  updateRunningTooltip();
  if (runningCount === 0) setStatus('done', 'Done');
}
