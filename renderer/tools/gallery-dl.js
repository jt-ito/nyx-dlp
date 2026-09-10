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

  const gdlUrlInput = document.getElementById('gdl-url');
  const gdlTextarea = document.getElementById('gdl-urls');

  // Prevent stale URLs from previous state sync or localStorage pollutions
  try {
    localStorage.removeItem('field:gdl-urls');
    localStorage.removeItem('field:gdl-url');
  } catch (_) {}
  if (gdlUrlInput && !gdlUrlInput.value.trim() && gdlTextarea) {
    gdlTextarea.value = '';
  }

  function scrollToCursor(ta) {
    if (!ta) return;
    requestAnimationFrame(() => {
      const lastNewline = ta.value.lastIndexOf('\n');
      if (ta.selectionStart >= lastNewline || ta.selectionStart >= ta.value.length - 1) {
        ta.scrollTop = ta.scrollHeight;
      } else {
        const lines = ta.value.substring(0, ta.selectionStart).split('\n');
        const lineIndex = lines.length - 1;
        const totalLines = ta.value.split('\n').length;
        const lineHeight = ta.scrollHeight / Math.max(totalLines, 1);
        const cursorY = lineIndex * lineHeight;
        if (cursorY >= ta.scrollTop + ta.clientHeight - lineHeight * 2) {
          ta.scrollTop = Math.min(ta.scrollHeight, cursorY - ta.clientHeight + lineHeight * 3);
        } else if (cursorY < ta.scrollTop) {
          ta.scrollTop = Math.max(0, cursorY - lineHeight);
        }
      }
    });
  }

  function updateGdlCount() {
    const n = getGdlUrls().length;
    counterGdl.textContent = n + (n === 1 ? ' URL' : ' URLs');
  }

  gdlTextarea.addEventListener('input', () => {
    updateGdlCount();
    const list = getGdlUrls();
    if (list.length === 1 && gdlUrlInput) {
      gdlUrlInput.value = list[0];
    } else if (list.length === 0 && gdlUrlInput) {
      gdlUrlInput.value = '';
    }
    scrollToCursor(gdlTextarea);
  });

  gdlTextarea.addEventListener('paste', (e) => {
    e.preventDefault();
    const pasted = (e.clipboardData || window.clipboardData).getData('text');
    const start  = gdlTextarea.selectionStart;
    const end    = gdlTextarea.selectionEnd;
    const before = gdlTextarea.value.substring(0, start);
    const after  = gdlTextarea.value.substring(end);
    const insert = pasted.endsWith('\n') ? pasted : pasted + '\n';
    gdlTextarea.value = before + insert + after;
    const newPos = start + insert.length;
    gdlTextarea.selectionStart = newPos;
    gdlTextarea.selectionEnd   = newPos;
    updateGdlCount();
    scrollToCursor(gdlTextarea);
  });

  modeBtnGdl.addEventListener('click', () => {
    gdlMultiMode = !gdlMultiMode;
    singleDivGdl.classList.toggle('hidden', gdlMultiMode);
    multiDivGdl.classList.toggle('hidden', !gdlMultiMode);
    counterGdl.classList.toggle('hidden', !gdlMultiMode);
    modeBtnGdl.classList.toggle('active', gdlMultiMode);
    modeBtnGdl.title = gdlMultiMode ? 'Switch to single URL' : 'Switch to multi-URL mode';
    if (gdlMultiMode) {
      const single = gdlUrlInput ? gdlUrlInput.value.trim() : '';
      if (single) {
        const multiUrls = gdlTextarea.value.split('\n').map(l => l.trim()).filter(Boolean);
        if (multiUrls.length <= 1 || !multiUrls.includes(single)) {
          gdlTextarea.value = single + '\n';
        }
      }
      updateGdlCount();
      scrollToCursor(gdlTextarea);
      if (gdlTextarea) {
        setTimeout(() => gdlTextarea.focus(), 50);
      }
    } else {
      const urls = getGdlUrls();
      if (gdlUrlInput) {
        gdlUrlInput.value = urls.length > 0 ? urls[0] : '';
      }
    }
  });

  function getGdlUrls() {
    if (!gdlMultiMode) {
      const u = (gdlUrlInput ? gdlUrlInput.value : document.getElementById('gdl-url')?.value || '').trim();
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

  if (gdlUrlInput) {
    gdlUrlInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        runBtn.click();
      }
    });

    gdlUrlInput.addEventListener('input', () => {
      if (!gdlMultiMode) {
        const singleVal = gdlUrlInput.value.trim();
        gdlTextarea.value = singleVal ? singleVal + '\n' : '';
        updateGdlCount();
      }
    });

    gdlUrlInput.addEventListener('paste', (e) => {
      const pasted = (e.clipboardData || window.clipboardData).getData('text');
      if (pasted && pasted.includes('\n') && pasted.trim().split('\n').filter(l => l.trim()).length > 1) {
        e.preventDefault();
        if (!gdlMultiMode) {
          modeBtnGdl.click();
        }
        gdlTextarea.value = pasted.trim() + '\n';
        updateGdlCount();
        scrollToCursor(gdlTextarea);
      }
    });
  }
  if (gdlTextarea) {
    gdlTextarea.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        runBtn.click();
      }
    });
  }

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

    window.api.runGalleryDl({ urls, url: urls[0], outputDir, filetypes, metadata, cookiesPath, installGdl });
  });

  if (window.api && window.api.onGalleryDlOutput) {
    let urlIdx = 0;
    window.api.onGalleryDlOutput((data) => {
      if (data.type === 'pid') {
        currentPid = data.pid;
        runBtn.classList.add('hidden');
        pauseBtn.classList.remove('hidden');
        stopBtn.classList.remove('hidden');
        incRunning('gallery-dl');
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
        decRunning('gallery-dl');
      });
    });
  }
})();
