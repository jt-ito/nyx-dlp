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
    isPaused = false;
    pauseBtn.innerHTML = pauseIconHTML;
    pauseBtn.classList.remove('paused');
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
    const qualityEl   = document.getElementById('ls-quality');
    const format      = (!qualityEl || qualityEl.disabled || !getSetting('show-ls-quality')) ? 'bestvideo*+bestaudio/best' : (qualityEl.value || 'bestvideo*+bestaudio/best');
    const cookiesPath = (document.getElementById('ls-use-cookies').checked ? document.getElementById('ls-cookies').value.trim() : '');
    const container   = document.getElementById('ls-container').value;

    if (!url)       { appendLog(log, '⚠ Please enter a stream URL.', 'error'); return; }
    if (!outputDir) { appendLog(log, '⚠ Please choose an output directory.', 'error'); return; }
    const lsPathErr = isProtectedPath(outputDir);
    if (lsPathErr)  { appendLog(log, '⚠ ' + lsPathErr, 'error'); return; }

    const startLivestreamDownload = (urlToUse, hasFragment = false) => {
      clearLog(log);
      appendLog(log, `▶ Starting live archiver...`, 'info');
      appendLog(log, `  URL:    ${urlToUse}`, 'cmd');
      appendLog(log, `  Format: ${format}`, 'cmd');
      appendLog(log, `  Container: ${container}`, 'cmd');
      appendLog(log, `  Output: ${outputDir}`, 'cmd');
      if (cookiesPath) appendLog(log, `  Cookies: ${cookiesPath}`, 'cmd');
      if (hasFragment && window.NyxFragmentRescue?.FRAGMENT_NOTICE_TEXT) {
        appendLog(log, window.NyxFragmentRescue.FRAGMENT_NOTICE_TEXT, 'info');
      }
      appendLog(log, '', 'stdout');
      markBodyStart(log);

      currentPid = null;
      isPaused   = false;
      pauseBtn.innerHTML = pauseIconHTML;
      pauseBtn.classList.remove('paused');

      const bgutilUrl = getBgutilUrl();
      const useDeno   = getSetting('dep-use-deno') ? 'y' : 'n';
      const clientEl  = document.getElementById('ls-client');
      const client    = (!clientEl || clientEl.disabled || !getSetting('show-ls-client')) ? 'default' : (clientEl.value || 'default');
      const fromStart = document.getElementById('ls-from-start')?.checked ? 'y' : 'n';
      const tokenEl   = document.getElementById('ls-twitch-token');
      const twitchToken = (!tokenEl || tokenEl.disabled || !getSetting('show-ls-twitch-token')) ? '' : tokenEl.value.trim();
      const concurrent = document.getElementById('ls-concurrent')?.value || '5';
      const engineEl  = document.getElementById('ls-engine');
      const engine    = (!engineEl || engineEl.disabled || !getSetting('show-ls-engine')) ? 'auto' : (engineEl.value || 'auto');
      const durEl     = document.getElementById('ls-duration');
      const streamDuration = (!durEl || durEl.disabled || !getSetting('show-ls-duration')) ? '' : durEl.value.trim();
      const lowLatEl  = document.getElementById('ls-low-latency');
      const twitchLowLatency = (!lowLatEl || lowLatEl.disabled || !getSetting('show-ls-low-latency')) ? false : (lowLatEl.checked || false);
      const ignoreSsl = document.getElementById('ls-ignore-ssl')?.checked || false;
      const edgeEl    = document.getElementById('ls-live-edge');
      const hlsLiveEdge = (!edgeEl || edgeEl.disabled || !getSetting('show-ls-live-edge')) ? '' : edgeEl.value.trim();
      const proxyEl   = document.getElementById('ls-proxy');
      const proxy     = (!proxyEl || proxyEl.disabled || !getSetting('show-ls-proxy')) ? '' : proxyEl.value.trim();
      const lsSyncFix = getSetting('ls-sync-fix');
      const lsTwitchCodecs = getSetting('ls-twitch-codecs');
      const autoStreamlink = getSetting('dep-auto-streamlink');
      window.api.runLivestream({
        url: urlToUse, outputDir, format, cookiesPath, container, client, fromStart, twitchToken,
        concurrent, bgutilUrl, useDeno, autoStreamlink, engine, streamDuration, twitchLowLatency, ignoreSsl,
        hlsLiveEdge, proxy, lsSyncFix, lsTwitchCodecs
      });
    };

    if (window.NyxFragmentRescue?.isFragmentUrl(url)) {
      window.NyxFragmentRescue.promptFragmentRescue({
        originalUrl: url,
        cookiesPath,
        onProceedWithFragment: (isFragment) => {
          startLivestreamDownload(url, isFragment);
        },
        onManifestChosen: (newUrl) => {
          const uInput = document.getElementById('ls-url');
          if (uInput) uInput.value = newUrl;
          startLivestreamDownload(newUrl, false);
        }
      });
      return;
    }

    startLivestreamDownload(url, false);
  });

  if (window.api && window.api.onLivestreamOutput) {
    window.api.onLivestreamOutput((data) => {
      if (data.type === 'pid') {
        if (!currentPid) incRunning('Live Stream Archiver');
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
        pauseBtn.innerHTML = pauseIconHTML;
        pauseBtn.classList.remove('paused');
        isPaused = false;
        currentPid = null;
        decRunning('Live Stream Archiver');
      });
    });
  }
})();
