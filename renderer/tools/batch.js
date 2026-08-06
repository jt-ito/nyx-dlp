/* ── 3. Batch Downloader ──────────────────────────────────── */
(function () {
  const log        = document.getElementById('batch-log');
  const runBtn     = document.getElementById('batch-run');
  const pauseBtn   = document.getElementById('batch-pause');
  const stopBtn     = document.getElementById('batch-stop');
  const skipRestBtn = document.getElementById('batch-skip-rest');
  const textarea   = document.getElementById('batch-urls');
  const counter    = document.getElementById('batch-counter');
  const progressWrap = document.getElementById('batch-progress-wrap');
  const progressBar  = document.getElementById('batch-progress-bar');
  const progressLbl  = document.getElementById('batch-progress-label');
  let currentPid = null;
  let isPaused   = false;
  let isResting  = false;
  let skipNextRest = false;
  let countdownTimer = null;
  let lastProgressText = '0 / 0';
  let activeUrls = [];
  
  let batchUrlStatuses = [];
  const statusBtn = document.getElementById('batch-status-btn');
  const statusModal = document.getElementById('batch-status-modal');
  const statusList = document.getElementById('batch-status-list');
  const statusClose = document.getElementById('batch-status-close');

  function renderBatchStatusModal() {
    if (statusModal.style.display === 'none') return;
    statusList.innerHTML = '';
    
    if (batchUrlStatuses.length === 0) {
      statusList.innerHTML = '<div style="padding: 12px; text-align: center; color: var(--text-muted); font-size: 13px;">No URLs in current batch.</div>';
      return;
    }

    batchUrlStatuses.forEach((item) => {
      const el = document.createElement('div');
      el.style.display = 'flex';
      el.style.alignItems = 'center';
      el.style.padding = '8px 12px';
      el.style.background = 'var(--bg-elevated)';
      el.style.border = '1px solid var(--border)';
      el.style.borderRadius = '6px';
      
      let badgeHtml = '';
      if (item.status === 'pending') {
        badgeHtml = `<span style="display: inline-block; padding: 2px 6px; font-size: 11px; font-weight: 600; border-radius: 4px; background: var(--bg-input); color: var(--text-muted); margin-right: 12px; min-width: 80px; text-align: center;">PENDING</span>`;
      } else if (item.status === 'downloading') {
        badgeHtml = `<span style="display: inline-block; padding: 2px 6px; font-size: 11px; font-weight: 600; border-radius: 4px; background: var(--terminal-info); color: var(--bg-body); margin-right: 12px; min-width: 80px; text-align: center;">DOWNLOADING</span>`;
      } else if (item.status === 'done') {
        badgeHtml = `<span style="display: inline-block; padding: 2px 6px; font-size: 11px; font-weight: 600; border-radius: 4px; background: var(--terminal-success); color: var(--bg-body); margin-right: 12px; min-width: 80px; text-align: center;">DONE</span>`;
      } else if (item.status === 'failed') {
        badgeHtml = `<span style="display: inline-block; padding: 2px 6px; font-size: 11px; font-weight: 600; border-radius: 4px; background: var(--terminal-error); color: var(--bg-body); margin-right: 12px; min-width: 80px; text-align: center;">FAILED</span>`;
      }
      
      el.innerHTML = `
        ${badgeHtml}
        <span style="font-family: var(--font-mono); font-size: 12px; color: var(--text); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${item.url}">${item.url}</span>
      `;
      statusList.appendChild(el);
    });
  }

  if (statusBtn) {
    statusBtn.addEventListener('click', () => {
      statusModal.style.display = 'flex';
      renderBatchStatusModal();
    });
  }
  if (statusClose) {
    statusClose.addEventListener('click', () => {
      statusModal.style.display = 'none';
    });
  }
  if (statusModal) {
    statusModal.addEventListener('click', (e) => {
      if (e.target === statusModal) statusModal.style.display = 'none';
    });
  }

  function startRestCountdown(seconds) {
    clearInterval(countdownTimer);
    let rem = seconds;
    const tick = () => {
      const m = Math.floor(rem / 60);
      const s = rem % 60;
      progressLbl.textContent = `Resting… ${m}:${s.toString().padStart(2, '0')} (${lastProgressText})`;
      if (rem <= 0) clearInterval(countdownTimer);
      rem--;
    };
    tick();
    countdownTimer = setInterval(tick, 1000);
  }
  function stopRestCountdown() {
    clearInterval(countdownTimer);
    countdownTimer = null;
    isResting = false;
    updateSkipRestBtn();
    progressLbl.textContent = lastProgressText;
  }

  function updateSkipRestBtn() {
    if (!skipRestBtn) return;
    if (isResting) {
      skipRestBtn.textContent = 'Skip current rest';
    } else {
      skipRestBtn.textContent = 'Skip next rest';
    }
  }

  // Live toggle: send rest state changes to backend mid-download
  document.getElementById('batch-rest').addEventListener('change', function () {
    if (!currentPid) return; // only when batch is running
    const outputDir = document.getElementById('batch-output').value.trim();
    if (!outputDir || !window.api.setBatchRest) return;
    if (this.checked) {
      const customVal = this.dataset.customVal;
      const val = customVal !== undefined ? customVal : 5;
      window.api.setBatchRest({ outputDir, val });
    } else {
      window.api.setBatchRest({ outputDir, val: 0 });
    }
  });

  // Live URL counter
  textarea.addEventListener('input', () => {
    const urls = getUrls();
    counter.textContent = urls.length + (urls.length === 1 ? ' URL' : ' URLs');
  });

  // Auto-newline on paste so each pasted URL lands on its own line
  textarea.addEventListener('paste', (e) => {
    e.preventDefault();
    const pasted = (e.clipboardData || window.clipboardData).getData('text');
    const start  = textarea.selectionStart;
    const end    = textarea.selectionEnd;
    const before = textarea.value.substring(0, start);
    const after  = textarea.value.substring(end);
    const insert = pasted.endsWith('\n') ? pasted : pasted + '\n';
    textarea.value = before + insert + after;
    const newPos = start + insert.length;
    textarea.selectionStart = newPos;
    textarea.selectionEnd   = newPos;
    textarea.dispatchEvent(new Event('input'));
  });

  function getUrls() {
    return textarea.value.split('\n').map(l => l.trim()).filter(l => l.length > 0 && l.startsWith('http'));
  }

  document.getElementById('batch-clear').addEventListener('click', () => clearLog(log));

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
    const urls        = getUrls();
    const outputDir   = document.getElementById('batch-output').value.trim();
    const format      = document.getElementById('batch-format').value;
    let rest          = document.getElementById('batch-rest').checked;
    const customRest  = document.getElementById('batch-rest').dataset.customVal;
    if (rest) {
      rest = customRest !== undefined ? customRest : 5;
    }
    const skipLive    = document.getElementById('batch-skip-live').checked;
    const cookiesPath = (document.getElementById('batch-use-cookies').checked ? document.getElementById('batch-cookies').value.trim() : '');
    const container   = document.getElementById('batch-container').value;
    
    const dlSubs      = document.getElementById('batch-dl-subs').checked;
    const embedSubs   = document.getElementById('batch-embed-subs').checked;
    const dlChat      = document.getElementById('batch-dl-chat').checked;
    const dlThumb     = document.getElementById('batch-dl-thumb').checked;
    const embedThumb  = document.getElementById('batch-embed-thumb').checked;
    const skipDownload= document.getElementById('batch-skip-download').checked;

    if (urls.length === 0) { appendLog(log, '⚠ Please enter at least one valid URL.', 'error'); return; }
    if (!outputDir)        { appendLog(log, '⚠ Please choose an output directory.', 'error'); return; }
    const batchPathErr = isProtectedPath(outputDir);
    if (batchPathErr)      { appendLog(log, '⚠ ' + batchPathErr, 'error'); return; }

    clearLog(log);
    appendLog(log, `▶ Starting batch download of ${urls.length} URL(s)...`, 'info');
    appendLog(log, `  Format: ${format}`, 'cmd');
    appendLog(log, `  Container: ${container}`, 'cmd');
    appendLog(log, `  Rest between downloads: ${rest === false ? 'No' : `Yes (~${customRest !== undefined ? customRest : 5} min)`}`, 'cmd');
    appendLog(log, `  Skip live streams: ${skipLive ? 'Yes' : 'No'}`, 'cmd');
    appendLog(log, `  Output: ${outputDir}`, 'cmd');
    if (cookiesPath) appendLog(log, `  Cookies: ${cookiesPath}`, 'cmd');
    appendLog(log, '', 'stdout');
    markBodyStart(log);

    progressWrap.classList.remove('hidden');
    progressBar.style.width = '0%';
    progressLbl.textContent = `0 / ${urls.length}`;
    
    batchUrlStatuses = urls.map(u => ({ url: u, status: 'pending' }));
    if (statusModal.style.display !== 'none') renderBatchStatusModal();

    currentPid = null;
    isPaused   = false;
    pauseBtn.innerHTML = pauseIconHTML;
    pauseBtn.classList.remove('paused');

    runBtn.classList.add('hidden');
    pauseBtn.classList.remove('hidden');
    stopBtn.classList.remove('hidden');
    skipRestBtn.classList.remove('hidden');
    isResting = false;
    skipNextRest = false;
    updateSkipRestBtn();
    incRunning('Batch Downloader');

    let completedCount = 0;
    let batchTotal = urls.length;
    let _progressPending = false;
    log._batchStats = null;
    window.api.removeAllListeners('batch-output');
    window.api.onBatchOutput((data) => {
      if (data.type === 'pid') { currentPid = data.pid; return; }
      if (data.type === 'rest-start') {
        isResting = true;
        updateSkipRestBtn();
        // If skip-next was pre-armed, fire it now
        if (skipNextRest) {
          skipNextRest = false;
          const outputDir = document.getElementById('batch-output').value.trim();
          if (outputDir && window.api.skipBatchRest) window.api.skipBatchRest({ outputDir });
        } else {
          startRestCountdown(Math.round(data.minutes * 60));
        }
        return;
      }
      if (data.type === 'rest-end') {
        stopRestCountdown();
        return;
      }
      if (data.type === 'stderr' || data.type === 'stdout') {
        let statusChanged = false;
        data.text.split('\n').forEach(line => {
          const m = line.match(/^\[(\d+)\/(\d+)\]\s+Processing:/);
          if (m) {
            stopRestCountdown();
            completedCount = parseInt(m[1], 10) - 1;
            batchTotal     = parseInt(m[2], 10);
            lastProgressText = `${completedCount} / ${batchTotal}`;
            
            if (batchUrlStatuses[completedCount]) {
              batchUrlStatuses[completedCount].status = 'downloading';
              statusChanged = true;
            }
          }
          if (/Finished processing media from|Download failed:/i.test(line)) {
            if (/Download failed:/i.test(line)) {
              if (batchUrlStatuses[completedCount]) batchUrlStatuses[completedCount].status = 'failed';
            } else {
              if (batchUrlStatuses[completedCount]) batchUrlStatuses[completedCount].status = 'done';
            }
            statusChanged = true;
            
            completedCount = Math.min(completedCount + 1, batchTotal);
            lastProgressText = `${completedCount} / ${batchTotal}`;
          }
          // Fallback: also parse the waiting message for countdown (e.g. if rest-start is missed)
          const restMatch = line.match(/Waiting\s+([\d.]+)\s+minutes?\s+before next download/i);
          if (restMatch && !isResting) {
            isResting = true;
            updateSkipRestBtn();
            startRestCountdown(Math.round(parseFloat(restMatch[1]) * 60));
          }
          if (/Rest skipped|Rest disabled/i.test(line)) {
            stopRestCountdown();
          }
          const fm = line.match(/(\d+)\s+downloads?\s+failed/i);
          if (fm) log._batchStats = { failed: parseInt(fm[1], 10), total: urls.length };
        });
        
        if (statusChanged) renderBatchStatusModal();
        
        if (!_progressPending) {
          _progressPending = true;
          requestAnimationFrame(() => {
            _progressPending = false;
            progressBar.style.width = (completedCount / batchTotal * 100) + '%';
            progressLbl.textContent = lastProgressText;
          });
        }
      }
      handleOutput(log, data, (code) => {
        stopRestCountdown();
        if (code === 0) {
          progressBar.style.width = '100%';
          lastProgressText = `${urls.length} / ${urls.length}`;
          progressLbl.textContent = lastProgressText;
        }
        runBtn.classList.remove('hidden');
        pauseBtn.classList.add('hidden');
        stopBtn.classList.add('hidden');
        skipRestBtn.classList.add('hidden');
        pauseBtn.innerHTML = pauseIconHTML;
        pauseBtn.classList.remove('paused');
        isPaused = false;
        isResting = false;
        skipNextRest = false;
        decRunning('Batch Downloader');
      });
    });

    const bgutilUrl = getSetting('dep-use-bgutil') ? (localStorage.getItem('field:dep-bgutil-url') || '') : '';
    const useDeno   = getSetting('dep-use-deno') ? 'y' : 'n';
    window.api.runBatch({ 
      urls, outputDir, format, rest, skipLive, cookiesPath, 
      extraArgs: getBatchExtraArgs(), container, bgutilUrl, useDeno,
      dlSubs, embedSubs, dlChat, dlThumb, embedThumb, skipDownload
    });
  });

  // Skip rest button
  skipRestBtn.addEventListener('click', () => {
    const outputDir = document.getElementById('batch-output').value.trim();
    if (isResting) {
      // Currently resting — skip it immediately
      if (outputDir && window.api.skipBatchRest) window.api.skipBatchRest({ outputDir });
    } else {
      // Not resting yet — arm it so the next rest is auto-skipped
      skipNextRest = !skipNextRest;
      skipRestBtn.textContent = skipNextRest ? 'Skip next rest ✓' : 'Skip next rest';
    }
  });
})();
