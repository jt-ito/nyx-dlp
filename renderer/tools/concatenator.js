/* ── 7. Video Concatenator ───────────────────────────────── */
(function () {
  const log      = document.getElementById('concat-log');
  const runBtn   = document.getElementById('concat-run');
  const pauseBtn = document.getElementById('concat-pause');
  const stopBtn  = document.getElementById('concat-stop');
  const fileList = document.getElementById('concat-file-list');
  let currentPid = null;
  let isPaused   = false;

  const pauseIconHTML  = pauseBtn.innerHTML;
  const resumeIconHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none"><polygon points="5 3 19 12 5 21 5 3" fill="currentColor"/></svg> Resume`;

  document.getElementById('concat-clear').addEventListener('click', () => clearLog(log));
  stopBtn.addEventListener('click', () => { if (currentPid) window.api.stopScript(currentPid); });
  
  // Initialize right-click context menu text if saved
  const savedQuality = localStorage.getItem('field:concat-quality');
  if (savedQuality) {
    const toggle = document.getElementById('concat-force');
    const desc = document.querySelector('#concat-force-toggle .toggle-desc');
    if (toggle) toggle.dataset.quality = savedQuality;
    if (desc) {
      const capVal = savedQuality.charAt(0).toUpperCase() + savedQuality.slice(1);
      desc.textContent = `Force a full re-encode using ${capVal} quality settings.`;
    }
  }

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
    const output     = document.getElementById('concat-output-name').value.trim();
    const outputDir  = document.getElementById('concat-output-dir').value.trim();
    const forceToggle = document.getElementById('concat-force');
    const forceEncode = forceToggle?.checked;
    const useMkvFix = document.getElementById('concat-mkv')?.checked;
    const quality = forceToggle?.dataset?.quality || localStorage.getItem('field:concat-quality') || 'medium';

    if (files.length < 2) { appendLog(log, '⚠ Please select at least 2 video files.', 'error'); return; }
    if (!output)          { appendLog(log, '⚠ Please enter an output filename.', 'error'); return; }

    clearLog(log);
    appendLog(log, `▶ Starting concatenation...`, 'info');
    appendLog(log, `  Files: ${files.length}`, 'cmd');
    appendLog(log, `  Output: ${output}`, 'cmd');
    if (forceEncode) appendLog(log, `  Force re-encode: Yes (Quality: ${quality})`, 'cmd');
    if (useMkvFix) appendLog(log, '  Use MKV Sync: Yes', 'cmd');
    appendLog(log, '', 'stdout');
    markBodyStart(log);

    currentPid = null;
    isPaused   = false;
    pauseBtn.innerHTML = pauseIconHTML;
    pauseBtn.classList.remove('paused');
    runBtn.classList.add('hidden');
    pauseBtn.classList.remove('hidden');
    stopBtn.classList.remove('hidden');

    window.api.runConcatenator({ files, output, forceEncode: !!forceEncode, useMkvFix: !!useMkvFix, quality, outputDir: outputDir || '' });
  });

  if (window.api && window.api.onConcatenatorOutput) {
    window.api.onConcatenatorOutput((data) => {
      if (data.type === 'pid') {
        currentPid = data.pid;
        runBtn.classList.add('hidden');
        pauseBtn.classList.remove('hidden');
        stopBtn.classList.remove('hidden');
        incRunning('Concatenator');
        return;
      }
      handleOutput(log, data, () => {
        runBtn.classList.remove('hidden');
        pauseBtn.classList.add('hidden');
        stopBtn.classList.add('hidden');
        pauseBtn.innerHTML = pauseIconHTML;
        pauseBtn.classList.remove('paused');
        isPaused = false;
        currentPid = null;
        decRunning('Concatenator');
      });
    });
  }
})();
