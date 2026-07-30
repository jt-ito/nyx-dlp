/* ── 6. Video Splitter ───────────────────────────────────── */
(function () {
  const log      = document.getElementById('split-log');
  const runBtn   = document.getElementById('split-run');
  const pauseBtn = document.getElementById('split-pause');
  const stopBtn  = document.getElementById('split-stop');
  let currentPid = null;
  let isPaused   = false;

  const pauseIconHTML  = pauseBtn.innerHTML;
  const resumeIconHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none"><polygon points="5 3 19 12 5 21 5 3" fill="currentColor"/></svg> Resume`;

  document.getElementById('split-clear').addEventListener('click', () => clearLog(log));
  stopBtn.addEventListener('click', () => { if (currentPid) window.api.stopScript(currentPid); });

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
    const file       = document.getElementById('split-file').value.trim();
    const parts      = document.getElementById('split-parts').value;
    const outputDir  = document.getElementById('split-output').value.trim();
    const container  = document.getElementById('split-container')?.value;

    if (!file)  { appendLog(log, '⚠ Please select a video file.', 'error'); return; }

    clearLog(log);
    appendLog(log, `▶ Starting splitter...`, 'info');
    appendLog(log, `  File:  ${file}`, 'cmd');
    appendLog(log, `  Parts: ${parts}`, 'cmd');
    if (outputDir) appendLog(log, `  Output: ${outputDir}`, 'cmd');
    appendLog(log, '', 'stdout');
    markBodyStart(log);

    currentPid = null;
    isPaused   = false;
    pauseBtn.innerHTML = pauseIconHTML;
    pauseBtn.classList.remove('paused');
    runBtn.classList.add('hidden');
    pauseBtn.classList.remove('hidden');
    stopBtn.classList.remove('hidden');
    incRunning('Splitter');

    window.api.removeAllListeners('splitter-output');
    window.api.onSplitterOutput((data) => {
      if (data.type === 'pid') { currentPid = data.pid; return; }
      handleOutput(log, data, () => {
        runBtn.classList.remove('hidden');
        pauseBtn.classList.add('hidden');
        stopBtn.classList.add('hidden');
        pauseBtn.innerHTML = pauseIconHTML;
        pauseBtn.classList.remove('paused');
        isPaused = false;
        decRunning('Splitter');
      });
    });

    window.api.runSplitter({ file, parts: parseInt(parts), outputDir: outputDir || '', containerFormat: container || '' });
  });
})();
