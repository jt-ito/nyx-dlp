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
