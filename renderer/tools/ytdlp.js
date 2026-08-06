/* ── 2. yt-dlp Single ────────────────────────────────────── */
(function () {
  const log      = document.getElementById('yd-log');
  const runBtn   = document.getElementById('yd-run');
  const pauseBtn = document.getElementById('yd-pause');
  const stopBtn  = document.getElementById('yd-stop');
  let currentPid = null;
  let isPaused   = false;

  const pauseIconHTML = pauseBtn.innerHTML;
  const resumeIconHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none"><polygon points="5 3 19 12 5 21 5 3" fill="currentColor"/></svg> Resume`;

  document.getElementById('yd-clear').addEventListener('click', () => clearLog(log));

  stopBtn.addEventListener('click', () => {
    if (currentPid) window.api.stopScript(currentPid);
  });

  pauseBtn.addEventListener('click', () => {
    if (!currentPid) return;
    if (pauseBtn.classList.contains('btn-add-queue')) {
      const newUrls = pauseBtn._newUrls;
      if (newUrls && newUrls.length > 0) {
        activeUrls.push(...newUrls);
        pauseBtn._newUrls = null;
        pauseBtn.innerHTML = isPaused ? resumeIconHTML : pauseIconHTML;
        pauseBtn.classList.remove('btn-add-queue');
        pauseBtn.classList.toggle('paused', isPaused);
        appendLog(log, '✔ Added ' + newUrls.length + ' new URL(s) to the queue.', 'success');
      }
      return;
    }
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
    const url         = document.getElementById('yd-url').value.trim();
    const outputDir   = document.getElementById('yd-output').value.trim();
    const format      = document.getElementById('yd-format').value;
    const cookiesPath = (document.getElementById('yd-use-cookies').checked ? document.getElementById('yd-cookies').value.trim() : '');
    const container   = document.getElementById('yd-container').value;
    const startTime   = document.getElementById('yd-start').value.trim();
    const endTime     = document.getElementById('yd-end').value.trim();
    
    const dlSubs      = document.getElementById('yd-dl-subs').checked;
    const embedSubs   = document.getElementById('yd-embed-subs').checked;
    const dlChat      = document.getElementById('yd-dl-chat').checked;
    const dlThumb     = document.getElementById('yd-dl-thumb').checked;
    const embedThumb  = document.getElementById('yd-embed-thumb').checked;
    const skipDownload= document.getElementById('yd-skip-download').checked;

    if (!url)       { appendLog(log, '⚠ Please enter a URL.', 'error'); return; }
    if (!outputDir) { appendLog(log, '⚠ Please choose an output directory.', 'error'); return; }
    const ydPathErr = isProtectedPath(outputDir);
    if (ydPathErr)  { appendLog(log, '⚠ ' + ydPathErr, 'error'); return; }

    clearLog(log);
    appendLog(log, `▶ Starting yt-dlp download...`, 'info');
    appendLog(log, `  URL:    ${url}`, 'cmd');
    appendLog(log, `  Format: ${format}`, 'cmd');
    appendLog(log, `  Container: ${container}`, 'cmd');
    if (startTime || endTime) appendLog(log, `  Clip: ${startTime || '0:00:00'} → ${endTime || 'end'}`, 'cmd');
    appendLog(log, `  Output: ${outputDir}`, 'cmd');
    if (cookiesPath) appendLog(log, `  Cookies: ${cookiesPath}`, 'cmd');
    appendLog(log, '', 'stdout');
    markBodyStart(log);

    currentPid = null;
    isPaused   = false;
    pauseBtn.innerHTML = pauseIconHTML;
    pauseBtn.classList.remove('paused');

    runBtn.classList.add('hidden');
    pauseBtn.classList.remove('hidden');
    stopBtn.classList.remove('hidden');
    incRunning('yt-dlp');

    window.api.removeAllListeners('ytdlp-output');
    window.api.onYtdlpOutput((data) => {
      if (data.type === 'pid') { currentPid = data.pid; return; }
      handleOutput(log, data, () => {
        runBtn.classList.remove('hidden');
        pauseBtn.classList.add('hidden');
        stopBtn.classList.add('hidden');
        pauseBtn.innerHTML = pauseIconHTML;
        pauseBtn.classList.remove('paused');
        isPaused = false;
        document.getElementById('yd-start').value = '';
        document.getElementById('yd-end').value   = '';
        decRunning('yt-dlp');
      });
    });

    const bgutilUrl = getSetting('dep-use-bgutil') ? (localStorage.getItem('field:dep-bgutil-url') || '') : '';
    const useDeno   = getSetting('dep-use-deno') ? 'y' : 'n';
    const autoYpdl  = getSetting('dep-auto-ypdl');
    window.api.runYtdlp({ 
      url, outputDir, format, cookiesPath, extraArgs: getExtraYtdlpArgs(), 
      container, startTime, endTime, bgutilUrl, useDeno,
      dlSubs, embedSubs, dlChat, dlThumb, embedThumb, skipDownload, autoYpdl
    });
  });
})();
