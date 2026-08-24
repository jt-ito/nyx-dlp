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
  let completedCount = 0;
  let batchTotal = 1;
  let lastProgressText = '0 / 0';
  let activeUrls = [];
  
  const pauseIconHTML  = pauseBtn.innerHTML;
  const resumeIconHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none"><polygon points="5 3 19 12 5 21 5 3" fill="currentColor"/></svg> Resume`;

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

  textarea.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      runBtn.click();
    }
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
    const dlComments  = document.getElementById('batch-dl-comments')?.checked || false;
    const dlDesc      = document.getElementById('batch-dl-desc')?.checked || false;
    const dlTitle     = document.getElementById('batch-dl-title')?.checked || false;
    const dlThumb     = document.getElementById('batch-dl-thumb').checked;
    const embedThumb  = document.getElementById('batch-embed-thumb').checked;
    const skipDownload= document.getElementById('batch-skip-download').checked;
    const autoRepair  = document.getElementById('batch-auto-repair').checked;
    const autoYpdl    = getSetting('dep-auto-ypdl');

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

    completedCount = 0;
    batchTotal = urls.length;
    lastProgressText = `0 / ${urls.length}`;
    progressWrap.classList.remove('hidden');
    progressBar.style.width = '0%';
    progressLbl.textContent = lastProgressText;
    
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

    try {
      console.log('[BATCH DEBUG] About to call getBatchExtraArgs');
      const extraArgs = getBatchExtraArgs();
      console.log('[BATCH DEBUG] extraArgs:', extraArgs);
      const bgutilUrl = getSetting('dep-use-bgutil') ? (localStorage.getItem('field:dep-bgutil-url') || '') : '';
      const useDeno   = getSetting('dep-use-deno') ? 'y' : 'n';
      console.log('[BATCH DEBUG] About to call window.api.runBatch');
      window.api.runBatch({ 
        urls, outputDir, format, rest, skipLive, cookiesPath, 
        extraArgs, container, bgutilUrl, useDeno,
        dlSubs, embedSubs, dlChat, dlComments, dlDesc, dlTitle, dlThumb, embedThumb, skipDownload, autoRepair
      });
      console.log('[BATCH DEBUG] window.api.runBatch called successfully');
    } catch (e) {
      console.error('[BATCH DEBUG] ERROR:', e);
      appendLog(log, '⚠ Internal error: ' + e.message, 'error');
    }
  });

  // Skip rest button
  skipRestBtn.addEventListener('click', () => {
    const outputDir = document.getElementById('batch-output').value.trim();
    if (isResting) {
      if (outputDir && window.api.skipBatchRest) window.api.skipBatchRest({ outputDir });
    } else {
      skipNextRest = !skipNextRest;
      skipRestBtn.textContent = skipNextRest ? 'Skip next rest ✓' : 'Skip next rest';
    }
  });

  if (window.api && window.api.onBatchOutput) {
    let _progressPending = false;
    log._batchStats = null;

    window.api.onBatchOutput((data) => {
      if (data.type === 'pid') {
        currentPid = data.pid;
        runBtn.classList.add('hidden');
        pauseBtn.classList.remove('hidden');
        stopBtn.classList.remove('hidden');
        skipRestBtn.classList.remove('hidden');
        incRunning('Batch Downloader');
        return;
      }
      if (data.type === 'rest-start') {
        isResting = true;
        updateSkipRestBtn();
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
          const m = line.match(/^\[(\d+)\/(\d+)\]\s+Processing:\s*(.*)/);
          if (m) {
            stopRestCountdown();
            const currentItemIndex = parseInt(m[1], 10) - 1;
            batchTotal     = parseInt(m[2], 10);
            const currentUrl = m[3] ? m[3].trim() : '';
            
            if (batchUrlStatuses) {
              while (batchUrlStatuses.length <= currentItemIndex) {
                batchUrlStatuses.push({ url: currentUrl || 'URL', status: 'pending' });
              }
              batchUrlStatuses[currentItemIndex].status = 'downloading';
              if (currentUrl) batchUrlStatuses[currentItemIndex].url = currentUrl;
              statusChanged = true;
            }
          }

          const finishMatch = line.match(/^\[Batch\]\s+(Finished processing|Download failed):\s*(.*)/i);
          if (finishMatch) {
            const action = finishMatch[1].toLowerCase();
            const targetUrl = finishMatch[2].trim();
            const isFailed = action.includes('failed');

            if (batchUrlStatuses) {
              const matchedItem = targetUrl ? batchUrlStatuses.find(item => item.url === targetUrl && item.status === 'downloading') : null;
              if (matchedItem) {
                matchedItem.status = isFailed ? 'failed' : 'done';
              } else {
                const downloadingItem = batchUrlStatuses.find(item => item.status === 'downloading');
                if (downloadingItem) {
                  downloadingItem.status = isFailed ? 'failed' : 'done';
                }
              }
            }

            completedCount = Math.min(completedCount + 1, batchTotal);
            lastProgressText = `${completedCount} / ${batchTotal}`;
            statusChanged = true;
          }

          const restMatch = line.match(/Waiting\s+([\d.]+)\s+minutes?\s+before next download/i);
          if (restMatch && !isResting) {
            isResting = true;
            updateSkipRestBtn();
            startRestCountdown(Math.round(parseFloat(restMatch[1]) * 60));
          }
          if (/Rest skipped|Rest disabled/i.test(line)) {
            stopRestCountdown();
          }
        });
        
        if (statusChanged) renderBatchStatusModal();
        
        if (!_progressPending) {
          _progressPending = true;
          requestAnimationFrame(() => {
            _progressPending = false;
            if (progressBar && progressLbl) {
              progressBar.style.width = (completedCount / batchTotal * 100) + '%';
              progressLbl.textContent = lastProgressText;
            }
          });
        }
      }
      handleOutput(log, data, (code) => {
        stopRestCountdown();
        if (code === 0 && progressBar && progressLbl) {
          progressBar.style.width = '100%';
          if (completedCount < batchTotal) {
            completedCount = batchTotal;
          }
          lastProgressText = `${batchTotal} / ${batchTotal}`;
          progressLbl.textContent = lastProgressText;
          if (batchUrlStatuses) {
            batchUrlStatuses.forEach(item => {
              if (item.status === 'pending' || item.status === 'downloading') {
                item.status = 'done';
              }
            });
            renderBatchStatusModal();
          }
        }
        runBtn.classList.remove('hidden');
        pauseBtn.classList.add('hidden');
        stopBtn.classList.add('hidden');
        skipRestBtn.classList.add('hidden');
        pauseBtn.innerHTML = pauseIconHTML;
        pauseBtn.classList.remove('paused');
        isPaused = false;
        isResting = false;
        currentPid = null;
        skipNextRest = false;
        decRunning('Batch Downloader');
      });
    });
  }
})();
