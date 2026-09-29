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

  const stopOriginalHTML = stopBtn.innerHTML;

  stopBtn.addEventListener('click', () => {
    stopBtn.disabled = true;
    isPaused = false;
    pauseBtn.innerHTML = pauseIconHTML;
    pauseBtn.classList.remove('paused');
    appendLog(log, '⏹ Stopping yt-dlp download...', 'warning');
    if (currentPid) window.api.stopScript(currentPid);
    else window.api.stopScript();
  });

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

  const ydUrlInput = document.getElementById('yd-url');
  const autoPresetsToggle = document.getElementById('yd-auto-presets-toggle');
  const presetBadge = document.getElementById('yd-preset-badge');
  const presetBadgeText = document.getElementById('yd-preset-badge-text');
  const presetClearBtn = document.getElementById('yd-preset-clear');

  let activePresetConcurrent = null;
  let activePresetExtraArgs = '';

  if (autoPresetsToggle) {
    const savedAuto = localStorage.getItem('field:yd-auto-presets-toggle');
    if (savedAuto !== null) autoPresetsToggle.checked = savedAuto === 'true';
    autoPresetsToggle.addEventListener('change', () => {
      localStorage.setItem('field:yd-auto-presets-toggle', autoPresetsToggle.checked);
      checkAndApplySitePreset();
    });
  }

  function checkAndApplySitePreset() {
    if (!ydUrlInput) return;
    const url = ydUrlInput.value.trim();
    if (!url || (autoPresetsToggle && !autoPresetsToggle.checked)) {
      if (presetBadge) presetBadge.style.display = 'none';
      activePresetConcurrent = null;
      activePresetExtraArgs = '';
      return;
    }

    const presets = typeof window.getSitePresets === 'function'
      ? window.getSitePresets()
      : (window.NyxSitePresets ? window.NyxSitePresets.DEFAULT_SITE_PRESETS : []);

    const matched = window.NyxSitePresets ? window.NyxSitePresets.matchSitePreset(url, presets) : null;
    if (!matched) {
      if (presetBadge) presetBadge.style.display = 'none';
      activePresetConcurrent = null;
      activePresetExtraArgs = '';
      return;
    }

    // Apply preset values to form controls
    activePresetConcurrent = matched.concurrent || null;
    activePresetExtraArgs = matched.extraArgs || '';

    const applyVal = (id, val) => {
      const el = document.getElementById(id);
      if (el && val !== undefined && el.value !== val) {
        el.value = val;
        el.dispatchEvent(new Event('change', { bubbles: true }));
      }
    };

    const applyCheck = (id, checked) => {
      const el = document.getElementById(id);
      if (el && checked !== undefined && el.checked !== !!checked) {
        el.checked = !!checked;
        el.dispatchEvent(new Event('change', { bubbles: true }));
      }
    };

    if (matched.format) applyVal('yd-format', matched.format);
    if (matched.container) applyVal('yd-container', matched.container);
    if (matched.client) applyVal('yd-client', matched.client);
    if (matched.useCookies !== undefined) applyCheck('yd-use-cookies', matched.useCookies);
    if (matched.dlSubs !== undefined) applyCheck('yd-dl-subs', matched.dlSubs);
    if (matched.embedSubs !== undefined) applyCheck('yd-embed-subs', matched.embedSubs);
    if (matched.dlThumb !== undefined) applyCheck('yd-dl-thumb', matched.dlThumb);
    if (matched.embedThumb !== undefined) applyCheck('yd-embed-thumb', matched.embedThumb);
    if (matched.dlDesc !== undefined) applyCheck('yd-dl-desc', matched.dlDesc);
    if (matched.dlComments !== undefined) applyCheck('yd-dl-comments', matched.dlComments);
    if (matched.dlChat !== undefined) applyCheck('yd-dl-chat', matched.dlChat);
    if (matched.autoRepair !== undefined) applyCheck('yd-auto-repair', matched.autoRepair);

    if (presetBadge) {
      if (presetBadgeText) presetBadgeText.textContent = `⚡ ${matched.name || 'Site'} Preset Applied`;
      presetBadge.style.display = 'inline-flex';
    }
  }

  if (ydUrlInput) {
    let debounceTimer = null;
    ydUrlInput.addEventListener('input', () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(checkAndApplySitePreset, 120);
    });
    ydUrlInput.addEventListener('paste', () => {
      setTimeout(checkAndApplySitePreset, 50);
    });
    ydUrlInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        runBtn.click();
      }
    });
  }

  if (presetClearBtn) {
    presetClearBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (presetBadge) presetBadge.style.display = 'none';
      activePresetConcurrent = null;
      activePresetExtraArgs = '';
    });
  }

  runBtn.addEventListener('click', () => {
    const url         = document.getElementById('yd-url').value.trim();
    const outputDir   = document.getElementById('yd-output').value.trim();
    const formatEl    = document.getElementById('yd-format');
    const format      = (!formatEl || formatEl.disabled || !getSetting('show-yd-format')) ? 'bestvideo*+bestaudio/best' : (formatEl.value || 'bestvideo*+bestaudio/best');
    const cookiesPath = (document.getElementById('yd-use-cookies').checked ? document.getElementById('yd-cookies').value.trim() : '');
    const container   = document.getElementById('yd-container').value;
    const startTime   = document.getElementById('yd-start').value.trim();
    const endTime     = document.getElementById('yd-end').value.trim();
    
    const dlSubs      = document.getElementById('yd-dl-subs').checked;
    const embedSubs   = document.getElementById('yd-embed-subs').checked;
    const dlChat      = document.getElementById('yd-dl-chat').checked;
    const dlComments  = document.getElementById('yd-dl-comments')?.checked || false;
    const dlDesc      = document.getElementById('yd-dl-desc')?.checked || false;
    const dlTitle     = document.getElementById('yd-dl-title')?.checked || false;
    const dlThumb     = document.getElementById('yd-dl-thumb').checked;
    const embedThumb  = document.getElementById('yd-embed-thumb').checked;
    const skipDownload= document.getElementById('yd-skip-download').checked;
    const getUrl      = document.getElementById('yd-get-url').checked;
    const autoRepair  = document.getElementById('yd-auto-repair').checked;
    const twitchSubOnly = document.getElementById('yd-twitch-sub-only')?.checked ?? true;

    if (!url)       { appendLog(log, '⚠ Please enter a URL.', 'error'); return; }
    if (!outputDir) { appendLog(log, '⚠ Please choose an output directory.', 'error'); return; }
    const ydPathErr = isProtectedPath(outputDir);
    if (ydPathErr)  { appendLog(log, '⚠ ' + ydPathErr, 'error'); return; }

    const startYtdlpDownload = (urlToUse, hasFragment = false) => {
      clearLog(log);
      if (getUrl) {
        appendLog(log, `▶ Grabbing direct stream URL...`, 'info');
        appendLog(log, `  URL:    ${urlToUse}`, 'cmd');
        if (cookiesPath) appendLog(log, `  Cookies: ${cookiesPath}`, 'cmd');
      } else {
        appendLog(log, `▶ Starting yt-dlp download...`, 'info');
        appendLog(log, `  URL:    ${urlToUse}`, 'cmd');
        appendLog(log, `  Format: ${format}`, 'cmd');
        appendLog(log, `  Container: ${container}`, 'cmd');
        if (startTime || endTime) appendLog(log, `  Clip: ${startTime || '0:00:00'} → ${endTime || 'end'}`, 'cmd');
        appendLog(log, `  Output: ${outputDir}`, 'cmd');
        if (cookiesPath) appendLog(log, `  Cookies: ${cookiesPath}`, 'cmd');
        if (activePresetConcurrent) appendLog(log, `  Concurrent Fragments: ${activePresetConcurrent}`, 'cmd');
      }
      if (hasFragment && window.NyxFragmentRescue?.FRAGMENT_NOTICE_TEXT) {
        appendLog(log, window.NyxFragmentRescue.FRAGMENT_NOTICE_TEXT, 'info');
      }
      appendLog(log, '', 'stdout');
      markBodyStart(log);

      currentPid = null;
      isPaused   = false;
      pauseBtn.innerHTML = pauseIconHTML;
      pauseBtn.classList.remove('paused');

      runBtn.classList.add('hidden');
      pauseBtn.classList.remove('hidden');
      const bgutilUrl = getBgutilUrl();
      const useDeno   = getSetting('dep-use-deno') ? 'y' : 'n';
      const autoYpdl  = getSetting('dep-auto-ypdl');

      let extraArgs = getExtraYtdlpArgs();
      if (activePresetExtraArgs) {
        const extraList = activePresetExtraArgs.split(/\s+/).filter(Boolean);
        extraArgs = [...extraArgs, ...extraList];
      }

      window.api.runYtdlp({ 
        url: urlToUse, outputDir, format, cookiesPath, extraArgs, 
        container, startTime, endTime, bgutilUrl, useDeno,
        concurrent: activePresetConcurrent,
        dlSubs, embedSubs, dlChat, dlComments, dlDesc, dlTitle, dlThumb, embedThumb, skipDownload, autoYpdl, getUrl, autoRepair, twitchSubOnly
      });
    };

    if (window.NyxFragmentRescue?.isFragmentUrl(url)) {
      window.NyxFragmentRescue.promptFragmentRescue({
        originalUrl: url,
        cookiesPath,
        onProceedWithFragment: (isFragment) => {
          startYtdlpDownload(url, isFragment);
        },
        onManifestChosen: (newUrl) => {
          const uInput = document.getElementById('yd-url');
          if (uInput) uInput.value = newUrl;
          startYtdlpDownload(newUrl, false);
        }
      });
      return;
    }

    startYtdlpDownload(url, false);
  });

  if (window.api && window.api.onYtdlpOutput) {
    window.api.onYtdlpOutput((data) => {
      if (data.type === 'pid') {
        if (!currentPid) incRunning('yt-dlp');
        currentPid = data.pid;
        runBtn.classList.add('hidden');
        pauseBtn.classList.remove('hidden');
        stopBtn.classList.remove('hidden');
        if (isPaused) {
          pauseBtn.innerHTML = resumeIconHTML;
          pauseBtn.classList.add('paused');
        } else {
          pauseBtn.innerHTML = pauseIconHTML;
          pauseBtn.classList.remove('paused');
        }
        return;
      }
      handleOutput(log, data, () => {
        runBtn.classList.remove('hidden');
        pauseBtn.classList.add('hidden');
        stopBtn.classList.add('hidden');
        stopBtn.disabled = false;
        stopBtn.innerHTML = stopOriginalHTML;
        pauseBtn.innerHTML = pauseIconHTML;
        pauseBtn.classList.remove('paused');
        isPaused = false;
        currentPid = null;
        document.getElementById('yd-start').value = '';
        document.getElementById('yd-end').value   = '';
        decRunning('yt-dlp');
      });
    });
  }
})();
