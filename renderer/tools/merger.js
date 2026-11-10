/* ── 7b. Video Merger ────────────────────────────────────── */
(function () {
  const log      = document.getElementById('mg-log');
  const runBtn   = document.getElementById('mg-run');
  const pauseBtn = document.getElementById('mg-pause');
  const stopBtn  = document.getElementById('mg-stop');
  const fileList = document.getElementById('mg-file-list');
  const modeSel  = document.getElementById('mg-overlap-mode');
  const secGroup = document.getElementById('mg-overlap-sec-group');
  let currentPid = null;
  let isPaused   = false;

  const pauseIconHTML  = pauseBtn.innerHTML;
  const resumeIconHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none"><polygon points="5 3 19 12 5 21 5 3" fill="currentColor"/></svg> Resume`;

  function showIdle() {
    runBtn.classList.remove('hidden');
    runBtn.removeAttribute('disabled');
    pauseBtn.classList.add('hidden');
    stopBtn.classList.add('hidden');
    pauseBtn.innerHTML = pauseIconHTML;
    pauseBtn.classList.remove('paused');
    isPaused = false;
  }

  document.getElementById('mg-clear').addEventListener('click', () => clearLog(log));
  stopBtn.addEventListener('click', () => {
    if (currentPid) window.api.stopScript(currentPid);
    showIdle();
  });

  if (fileList) {
    window.updateSortableListState(fileList);
    fileList.addEventListener('change', () => window.updateSortableListState(fileList));
  }

  const syncMode = () => secGroup.classList.toggle('hidden', modeSel.value !== 'manual');
  modeSel.addEventListener('change', syncMode);
  syncMode();
  // the saved value is restored after load; follow it
  window.addEventListener('load', syncMode);
  setTimeout(syncMode, 500);

  pauseBtn.addEventListener('click', () => {
    if (!currentPid) return;
    if (!isPaused) {
      isPaused = true;
      window.api.pauseScript(currentPid);
      pauseBtn.innerHTML = resumeIconHTML;
      pauseBtn.classList.add('paused');
      appendLog(log, '⏸ Paused.', 'info');
    } else {
      isPaused = false;
      window.api.resumeScript(currentPid);
      pauseBtn.innerHTML = pauseIconHTML;
      pauseBtn.classList.remove('paused');
      appendLog(log, '▶ Resumed.', 'info');
    }
  });

  runBtn.addEventListener('click', () => {
    const files      = Array.from(fileList.querySelectorAll('.sortable-item')).map(el => el.dataset.path);
    const outputInput = document.getElementById('mg-output-name');
    const output     = outputInput.value.trim();
    const outputDir  = document.getElementById('mg-output-dir').value.trim();
    const overlapMode = modeSel.value;
    const overlapSeconds = parseFloat(document.getElementById('mg-overlap-sec').value) || 0;
    const forceEncode = document.getElementById('mg-force').checked;

    if (files.length < 2) { appendLog(log, '⚠ Please select at least 2 video parts.', 'error'); return; }
    if (!output) {
      appendLog(log, '⚠ Please enter an output filename.', 'error');
      outputInput.focus();
      outputInput.classList.add('flash-highlight');
      setTimeout(() => outputInput.classList.remove('flash-highlight'), 1200);
      return;
    }
    if (overlapMode === 'manual' && overlapSeconds <= 0) {
      appendLog(log, '⚠ Enter how many seconds are repeated at each boundary, or choose Auto-detect.', 'error');
      return;
    }

    clearLog(log);
    appendLog(log, '▶ Starting merge...', 'info');
    appendLog(log, `  Parts: ${files.length}`, 'cmd');
    appendLog(log, `  Output: ${output}`, 'cmd');
    appendLog(log, `  Overlap: ${overlapMode === 'manual' ? overlapSeconds + 's' : (overlapMode === 'none' ? 'none' : 'auto-detect')}`, 'cmd');
    if (forceEncode) appendLog(log, '  Always re-encode: Yes', 'cmd');
    appendLog(log, '', 'stdout');
    markBodyStart(log);

    currentPid = null;
    isPaused   = false;
    pauseBtn.innerHTML = pauseIconHTML;
    pauseBtn.classList.remove('paused');
    runBtn.classList.add('hidden');
    pauseBtn.classList.remove('hidden');
    stopBtn.classList.remove('hidden');

    window.api.runMerger({ files, output, outputDir, overlapMode, overlapSeconds, forceEncode, quality: 'high' });
  });

  if (window.api && window.api.onMergerOutput) {
    window.api.onMergerOutput((data) => {
      if (data.type === 'pid') {
        if (!currentPid) incRunning('Video Merger');
        currentPid = data.pid;
        runBtn.classList.add('hidden');
        pauseBtn.classList.remove('hidden');
        stopBtn.classList.remove('hidden');
        if (isPaused) {
          pauseBtn.innerHTML = resumeIconHTML;
          pauseBtn.classList.add('paused');
        }
        return;
      }
      handleOutput(log, data, () => {
        showIdle();
        currentPid = null;
        decRunning('Video Merger');
      });
    });
  }
})();
