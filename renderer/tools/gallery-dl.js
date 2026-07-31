/* ── 5. gallery-dl ───────────────────────────────────────── */
(function () {
  const log      = document.getElementById('gdl-log');
  const runBtn   = document.getElementById('gdl-run');
  const pauseBtn = document.getElementById('gdl-pause');
  const stopBtn  = document.getElementById('gdl-stop');
  const modeBtnGdl   = document.getElementById('gdl-url-mode-btn');
  const singleDivGdl = document.getElementById('gdl-url-single');
  const multiDivGdl  = document.getElementById('gdl-url-multi');
  const counterGdl   = document.getElementById('gdl-url-counter');
  let currentPid = null;
  let isPaused   = false;
  let gdlMultiMode = false;
  let activeUrls   = [];

  const pauseIconHTML  = pauseBtn.innerHTML;
  const resumeIconHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none"><polygon points="5 3 19 12 5 21 5 3" fill="currentColor"/></svg> Resume`;

  const gdlTextarea = document.getElementById('gdl-urls');
  function updateGdlCount() {
    const n = getGdlUrls().length;
    counterGdl.textContent = n + (n === 1 ? ' URL' : ' URLs');
  }
  gdlTextarea.addEventListener('input', updateGdlCount);
  gdlTextarea.addEventListener('paste', (e) => {
    e.preventDefault();
    const pasted = (e.clipboardData || window.clipboardData).getData('text');
    const start  = gdlTextarea.selectionStart;
    const end    = gdlTextarea.selectionEnd;
    const insert = pasted.endsWith('\n') ? pasted : pasted + '\n';
    gdlTextarea.value = gdlTextarea.value.substring(0, start) + insert + gdlTextarea.value.substring(end);
    gdlTextarea.selectionStart = gdlTextarea.selectionEnd = start + insert.length;
    updateGdlCount();
  });
  modeBtnGdl.addEventListener('click', () => {
    gdlMultiMode = !gdlMultiMode;
    singleDivGdl.classList.toggle('hidden', gdlMultiMode);
    multiDivGdl.classList.toggle('hidden', !gdlMultiMode);
    counterGdl.classList.toggle('hidden', !gdlMultiMode);
    modeBtnGdl.classList.toggle('active', gdlMultiMode);
    modeBtnGdl.title = gdlMultiMode ? 'Switch to single URL' : 'Switch to multi-URL mode';
    if (gdlMultiMode) {
      const single = document.getElementById('gdl-url').value.trim();
      if (single && !gdlTextarea.value.trim()) gdlTextarea.value = single + '\n';
      updateGdlCount();
    }
  });
  function getGdlUrls() {
    if (!gdlMultiMode) {
      const u = document.getElementById('gdl-url').value.trim();
      return u ? [u] : [];
    }
    return gdlTextarea.value.split('\n').map(l => l.trim()).filter(l => l.startsWith('http'));
  }

  document.getElementById('gdl-clear').addEventListener('click', () => clearLog(log));
  stopBtn.addEventListener('click', () => { if (currentPid) window.api.stopScript(currentPid); });

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
    activeUrls         = getGdlUrls();
    const urls         = activeUrls;
    const outputDir    = document.getElementById('gdl-output').value.trim();
    const filetypes    = document.getElementById('gdl-filetypes').value.trim();
    const metadata     = document.getElementById('gdl-meta').checked;
    const cookiesPath  = (document.getElementById('gdl-use-cookies').checked ? document.getElementById('gdl-cookies').value.trim() : '');
    const installGdl   = getSetting('dep-install-gdl') ? 'y' : 'n';

    if (urls.length === 0) { appendLog(log, '⚠ Please enter a URL.', 'error'); return; }
    if (!outputDir)        { appendLog(log, '⚠ Please choose an output directory.', 'error'); return; }
    const gdlPathErr = isProtectedPath(outputDir);
    if (gdlPathErr)        { appendLog(log, '⚠ ' + gdlPathErr, 'error'); return; }

    clearLog(log);
    if (urls.length > 1) {
      appendLog(log, `▶ Starting gallery-dl batch (${urls.length} URLs)...`, 'info');
    } else {
      appendLog(log, '▶ Starting gallery-dl...', 'info');
      appendLog(log, `  URL:    ${urls[0]}`, 'cmd');
    }
    appendLog(log, `  Output: ${outputDir}`, 'cmd');
    if (filetypes) appendLog(log, `  Filter: ${filetypes}`, 'cmd');
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
    incRunning('gallery-dl');

    let urlIdx = 0;
    if (urls.length > 1) appendLog(log, `▶ [1/${urls.length}] ${urls[0]}`, 'info');

    window.api.removeAllListeners('gallery-dl-output');
    window.api.onGalleryDlOutput((data) => {
      if (data.type === 'pid') { currentPid = data.pid; return; }
      if (data.type === 'exit' && urlIdx < urls.length - 1) {
        const failed = data.code !== 0 || !!log._hasError;
        log._hasError = false;
        if (failed) appendLog(log, `✖ URL ${urlIdx + 1}/${urls.length} failed (code ${data.code})`, 'error');
        else        appendLog(log, `✔ URL ${urlIdx + 1}/${urls.length} complete.`, 'success');
        urlIdx++;
        currentPid = null;
        appendLog(log, `▶ [${urlIdx + 1}/${urls.length}] ${urls[urlIdx]}`, 'info');
        window.api.runGalleryDl({ url: urls[urlIdx], outputDir, filetypes, metadata, cookiesPath, installGdl });
      } else {
        handleOutput(log, data, () => {
          runBtn.classList.remove('hidden');
          pauseBtn.classList.add('hidden');
          stopBtn.classList.add('hidden');
          pauseBtn.innerHTML = pauseIconHTML;
          pauseBtn.classList.remove('paused');
          isPaused = false;
          decRunning('gallery-dl');
        });
      }
    });

    window.api.runGalleryDl({ url: urls[0], outputDir, filetypes, metadata, cookiesPath, installGdl });
  });
})();
