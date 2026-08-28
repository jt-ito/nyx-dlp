/* ── 8. Video Encoder ────────────────────────────────────── */
(function () {
  const log      = document.getElementById('enc-log');
  const runBtn   = document.getElementById('enc-run');
  const pauseBtn = document.getElementById('enc-pause');
  const stopBtn  = document.getElementById('enc-stop');
  const fileList = document.getElementById('enc-file-list');
  let currentPid = null;
  let isPaused   = false;

  const pauseIconHTML  = pauseBtn.innerHTML;
  const resumeIconHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none"><polygon points="5 3 19 12 5 21 5 3" fill="currentColor"/></svg> Resume`;

  document.getElementById('enc-clear').addEventListener('click', () => clearLog(log));
  stopBtn.addEventListener('click', () => { if (currentPid) window.api.stopScript(currentPid); });
  
  const vcodecSelect = document.getElementById('enc-vcodec');
  const encQualityGroup = document.getElementById('enc-quality-group');
  if (vcodecSelect && encQualityGroup) {
    vcodecSelect.addEventListener('change', (e) => {
      encQualityGroup.style.display = (e.target.value === 'copy' || e.target.value === 'none') ? 'none' : 'block';
    });
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
    const files     = Array.from(fileList.querySelectorAll('.sortable-item')).map(el => el.dataset.path);
    const outputDir = document.getElementById('enc-output-dir').value.trim();
    const mode      = document.getElementById('enc-mode').value;
    const vcodec    = document.getElementById('enc-vcodec').value;
    const acodec    = document.getElementById('enc-acodec').value;
    const quality   = document.getElementById('enc-quality')?.value || 'medium';

    if (files.length === 0) { appendLog(log, '⚠ Please select at least one video file.', 'error'); return; }

    clearLog(log);
    appendLog(log, `▶ Starting encoder (${mode})...`, 'info');
    appendLog(log, `  Files:  ${files.length}`, 'cmd');
    appendLog(log, `  Vcodec: ${vcodec} (Quality: ${quality})`, 'cmd');
    appendLog(log, `  Acodec: ${acodec}`, 'cmd');
    appendLog(log, `  Mode:   ${mode}`, 'cmd');
    appendLog(log, '', 'stdout');
    markBodyStart(log);

    currentPid = null;
    isPaused   = false;
    pauseBtn.innerHTML = pauseIconHTML;
    pauseBtn.classList.remove('paused');
    runBtn.classList.add('hidden');
    pauseBtn.classList.remove('hidden');
    stopBtn.classList.remove('hidden');

    window.api.runEncoder({ files, mode, vcodec, acodec, quality, outputDir: outputDir || '' });
  });

  if (window.api && window.api.onEncoderOutput) {
    window.api.onEncoderOutput((data) => {
      if (data.type === 'pid') {
        currentPid = data.pid;
        runBtn.classList.add('hidden');
        pauseBtn.classList.remove('hidden');
        stopBtn.classList.remove('hidden');
        incRunning('Encoder');
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
        decRunning('Encoder');
      });
    });
  }
})();
