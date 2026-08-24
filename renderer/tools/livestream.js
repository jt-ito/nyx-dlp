/* ── 1. Live Stream Archiver ──────────────────────────────── */
(function () {
  const log      = document.getElementById('ls-log');
  const runBtn   = document.getElementById('ls-run');
  const pauseBtn = document.getElementById('ls-pause');
  const stopBtn  = document.getElementById('ls-stop');
  let currentPid = null;
  let isPaused   = false;

  const pauseIconHTML = pauseBtn.innerHTML;
  const resumeIconHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none"><polygon points="5 3 19 12 5 21 5 3" fill="currentColor"/></svg> Resume`;

  document.getElementById('ls-clear').addEventListener('click', () => clearLog(log));

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

  const lsUrlInput = document.getElementById('ls-url');
  if (lsUrlInput) {
    lsUrlInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        runBtn.click();
      }
    });
  }

  runBtn.addEventListener('click', () => {
    const url         = document.getElementById('ls-url').value.trim();
    const outputDir   = document.getElementById('ls-output').value.trim();
    const format      = document.getElementById('ls-quality').value;
    const cookiesPath = (document.getElementById('ls-use-cookies').checked ? document.getElementById('ls-cookies').value.trim() : '');
    const container   = document.getElementById('ls-container').value;

    if (!url)       { appendLog(log, '⚠ Please enter a stream URL.', 'error'); return; }
    if (!outputDir) { appendLog(log, '⚠ Please choose an output directory.', 'error'); return; }
    const lsPathErr = isProtectedPath(outputDir);
    if (lsPathErr)  { appendLog(log, '⚠ ' + lsPathErr, 'error'); return; }

    clearLog(log);
    appendLog(log, `▶ Starting live archiver...`, 'info');
    appendLog(log, `  URL:    ${url}`, 'cmd');
    appendLog(log, `  Format: ${format}`, 'cmd');
    appendLog(log, `  Container: ${container}`, 'cmd');
    appendLog(log, `  Output: ${outputDir}`, 'cmd');
    if (cookiesPath) appendLog(log, `  Cookies: ${cookiesPath}`, 'cmd');
    appendLog(log, '', 'stdout');
    markBodyStart(log);

    currentPid = null;
    isPaused   = false;
    pauseBtn.innerHTML = pauseIconHTML;
    pauseBtn.classList.remove('paused');

    const bgutilUrl = getSetting('dep-use-bgutil') ? (localStorage.getItem('field:dep-bgutil-url') || '') : '';
    const useDeno   = getSetting('dep-use-deno') ? 'y' : 'n';
    const client = document.getElementById('ls-client')?.value || 'default';
    const fromStart = document.getElementById('ls-from-start')?.checked ? 'y' : 'n';
    const twitchToken = document.getElementById('ls-twitch-token')?.value.trim() || '';
    const concurrent = document.getElementById('ls-concurrent')?.value || '5';
    const autoStreamlink = getSetting('dep-auto-streamlink');
    window.api.runLivestream({ url, outputDir, format, cookiesPath, container, client, fromStart, twitchToken, concurrent, bgutilUrl, useDeno, autoStreamlink });
  });

  if (window.api && window.api.onLivestreamOutput) {
    window.api.onLivestreamOutput((data) => {
      if (data.type === 'pid') {
        currentPid = data.pid;
        runBtn.classList.add('hidden');
        pauseBtn.classList.remove('hidden');
        stopBtn.classList.remove('hidden');
        incRunning('Live Stream Archiver');
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
        decRunning('Live Stream Archiver');
      });
    });
  }
})();
