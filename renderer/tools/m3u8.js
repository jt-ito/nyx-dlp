/* ── 4. M3U8 Downloader ──────────────────────────────────── */
(function () {
  const log        = document.getElementById('m3-log');
  const runBtn     = document.getElementById('m3-run');
  const pauseBtn   = document.getElementById('m3-pause');
  const stopBtn    = document.getElementById('m3-stop');
  const encodeChk  = document.getElementById('m3-encode');
  const encodeOpts = document.querySelectorAll('.encode-options');
  const modeBtnM3  = document.getElementById('m3-url-mode-btn');
  const singleDiv  = document.getElementById('m3-url-single');
  const multiDiv   = document.getElementById('m3-url-multi');
  const countBadge = document.getElementById('m3-url-counter');
  let currentPid  = null;
  let isPaused    = false;
  let m3MultiMode = false;
  let activeUrls  = [];

  const pauseIconHTML  = pauseBtn.innerHTML;
  const resumeIconHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none"><polygon points="5 3 19 12 5 21 5 3" fill="currentColor"/></svg> Resume`;

  // Toggle encode options
  encodeChk.addEventListener('change', () => {
    encodeOpts.forEach(el => el.classList.toggle('hidden', !encodeChk.checked));
  });
  
  // Initialize visibility based on current state
  encodeOpts.forEach(el => el.classList.toggle('hidden', !encodeChk.checked));
  window.addEventListener('DOMContentLoaded', () => {
    encodeOpts.forEach(el => el.classList.toggle('hidden', !encodeChk.checked));
  });

  document.getElementById('m3-encode-toggle').addEventListener('click', (e) => {
    if (e.target.closest('label')) return;
    encodeChk.checked = !encodeChk.checked;
    encodeChk.dispatchEvent(new Event('change'));
  });

  // ── Quality preset ──────────────────────────────────────
  const qualityHints = {
    'lossless':      'Bit-perfect copy of the decoded stream. Huge files but zero quality loss.',
    'near-lossless': 'Virtually indistinguishable from the source. Very large files.',
    'high':          'Visually lossless for most content. Recommended for archival.',
    'medium':        'Good quality with noticeably smaller files. Fine for general use.',
    'low':           'Acceptable quality, much smaller files. Good for previews or bandwidth-limited use.',
    'custom':        'Specify your own bitrate below.'
  };
  const qualitySelect = document.getElementById('m3-quality');
  const qualityHint   = document.getElementById('m3-quality-hint');
  const customBitrateGroup = document.getElementById('m3-custom-bitrate-group');

  qualitySelect.addEventListener('change', () => {
    const val = qualitySelect.value;
    qualityHint.textContent = qualityHints[val] || '';
    if (val === 'custom') {
      customBitrateGroup.style.cssText = '';
      customBitrateGroup.classList.remove('hidden');
    } else {
      customBitrateGroup.style.display = 'none';
      customBitrateGroup.style.setProperty('display', 'none', 'important');
    }
  });

  // ── URL mode toggle ──────────────────────────────────────
  const m3Textarea = document.getElementById('m3-urls');
  function updateM3Count() {
    const n = getM3Urls().length;
    countBadge.textContent = n + (n === 1 ? ' URL' : ' URLs');
  }
  m3Textarea.addEventListener('input', updateM3Count);
  m3Textarea.addEventListener('paste', (e) => {
    e.preventDefault();
    const pasted = (e.clipboardData || window.clipboardData).getData('text');
    const start  = m3Textarea.selectionStart;
    const end    = m3Textarea.selectionEnd;
    const insert = pasted.endsWith('\n') ? pasted : pasted + '\n';
    m3Textarea.value = m3Textarea.value.substring(0, start) + insert + m3Textarea.value.substring(end);
    m3Textarea.selectionStart = m3Textarea.selectionEnd = start + insert.length;
    updateM3Count();
  });
  modeBtnM3.addEventListener('click', () => {
    m3MultiMode = !m3MultiMode;
    singleDiv.classList.toggle('hidden', m3MultiMode);
    multiDiv.classList.toggle('hidden', !m3MultiMode);
    countBadge.classList.toggle('hidden', !m3MultiMode);
    modeBtnM3.classList.toggle('active', m3MultiMode);
    modeBtnM3.title = m3MultiMode ? 'Switch to single URL' : 'Switch to multi-URL mode';
    
    const singleInput = document.getElementById('m3-url');
    if (m3MultiMode) {
      const single = singleInput.value.trim();
      if (single && !m3Textarea.value.trim()) {
        m3Textarea.value = single + '\n';
      } else if (!single && m3Textarea.value.trim().split('\n').filter(l => l.trim()).length <= 1) {
        // If single is empty and multi only had 1 or 0 URLs, clear multi to stay in sync
        m3Textarea.value = '';
      }
      updateM3Count();
    } else {
      const urls = m3Textarea.value.split('\n').map(l => l.trim()).filter(Boolean);
      if (urls.length === 1) {
        singleInput.value = urls[0];
      } else if (urls.length === 0) {
        singleInput.value = '';
      }
    }
  });
  function getM3Urls() {
    if (!m3MultiMode) {
      const u = document.getElementById('m3-url').value.trim();
      return u ? [u] : [];
    }
    return m3Textarea.value.split('\n').map(l => l.trim()).filter(l => l.startsWith('http'));
  }

  document.getElementById('m3-clear').addEventListener('click', () => clearLog(log));
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
    activeUrls         = getM3Urls();
    const urls         = activeUrls;
    const outputDir    = document.getElementById('m3-output').value.trim();
    const startTime    = document.getElementById('m3-start').value.trim();
    const endTime      = document.getElementById('m3-end').value.trim();
    const encode       = encodeChk.checked;
    const container    = document.getElementById('m3-container').value;
    const codec        = document.getElementById('m3-codec').value;
    const quality      = document.getElementById('m3-quality').value;
    const bitrate      = quality === 'custom' ? document.getElementById('m3-bitrate').value : 'source';
    const resolution   = document.getElementById('m3-resolution').value;
    const fps          = document.getElementById('m3-fps').value;
    const audioBitrate = document.getElementById('m3-audio-bitrate').value;
    const cookiesPath  = (document.getElementById('m3-use-cookies').checked ? document.getElementById('m3-cookies').value.trim() : '');
    const autoRepair   = document.getElementById('m3-auto-repair').checked;

    if (urls.length === 0) { appendLog(log, '⚠ Please enter an M3U8 URL.', 'error'); return; }
    if (!outputDir)        { appendLog(log, '⚠ Please choose an output directory.', 'error'); return; }
    const m3PathErr = isProtectedPath(outputDir);
    if (m3PathErr)         { appendLog(log, '⚠ ' + m3PathErr, 'error'); return; }

    clearLog(log);
    if (urls.length > 1) {
      appendLog(log, `▶ Starting M3U8 batch (${urls.length} URLs)...`, 'info');
    } else {
      appendLog(log, `▶ Starting M3U8 download...`, 'info');
      appendLog(log, `  URL:    ${urls[0]}`, 'cmd');
    }
    if (startTime || endTime) appendLog(log, `  Clip:   ${startTime || '0:00:00'} → ${endTime || 'end'}`, 'cmd');
    appendLog(log, `  Output: ${outputDir}`, 'cmd');
    if (encode) {
      const presetLabel = quality === 'custom' ? `Custom (${bitrate})` : quality.charAt(0).toUpperCase() + quality.slice(1).replace('-', '-');
      appendLog(log, `  Codec:  ${codec}`, 'cmd');
      appendLog(log, `  Quality: ${presetLabel}  ${resolution !== 'source' ? resolution : 'source res'}  ${fps !== 'source' ? fps + 'fps' : 'source fps'}`, 'cmd');
      appendLog(log, `  Audio:  ${audioBitrate} AAC`, 'cmd');
    } else {
      appendLog(log, `  Re-encode: No (direct ${container.toUpperCase()} download)`, 'cmd');
    }
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
    incRunning('M3U8 Downloader');

    let urlIdx = 0;
    if (urls.length > 1) appendLog(log, `▶ [1/${urls.length}] ${urls[0]}`, 'info');

    window.api.removeAllListeners('m3u8-output');
    window.api.onM3u8Output((data) => {
      if (data.type === 'pid') { currentPid = data.pid; return; }
      if (data.type === 'exit' && urlIdx < urls.length - 1) {
        if (log._liveProgresses && log._liveProgresses.size > 0) {
          log._liveProgresses.clear();
          if (typeof triggerRaf === 'function') triggerRaf(log);
        }
        const failed = data.code !== 0 || !!log._hasError;
        log._hasError = false;
        if (failed) appendLog(log, `✖ URL ${urlIdx + 1}/${urls.length} failed (code ${data.code})`, 'error');
        else        appendLog(log, `✔ URL ${urlIdx + 1}/${urls.length} complete.`, 'success');
        urlIdx++;
        currentPid = null;
        appendLog(log, `▶ [${urlIdx + 1}/${urls.length}] ${urls[urlIdx]}`, 'info');
        window.api.runM3u8({ url: urls[urlIdx], outputDir, startTime, endTime, encode, codec, quality, bitrate, resolution, fps, audioBitrate, container, cookiesPath, autoRepair });
      } else {
        handleOutput(log, data, () => {
          runBtn.classList.remove('hidden');
          pauseBtn.classList.add('hidden');
          stopBtn.classList.add('hidden');
          pauseBtn.innerHTML = pauseIconHTML;
          pauseBtn.classList.remove('paused');
          isPaused = false;
          decRunning('M3U8 Downloader');
        });
      }
    });

    window.api.runM3u8({ url: urls[0], outputDir, startTime, endTime, encode, codec, quality, bitrate, resolution, fps, audioBitrate, container, cookiesPath, autoRepair });
  });
})()
