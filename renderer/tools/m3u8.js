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
  const autoRepairChk   = document.getElementById('m3-auto-repair');
  const autoTitleChk    = document.getElementById('m3-auto-title');
  const autoTitleToggle = document.getElementById('m3-auto-title-toggle');
  const twitchChannelIn = document.getElementById('m3-twitch-channel');

  const twitchCard      = document.getElementById('m3-twitch-card');
  const twitchAvatar    = document.getElementById('m3-twitch-avatar');
  const twitchFallback  = document.getElementById('m3-twitch-avatar-fallback');
  const twitchName      = document.getElementById('m3-twitch-name');
  const twitchDate      = document.getElementById('m3-twitch-date');
  const twitchGame      = document.getElementById('m3-twitch-game');
  const twitchTitleIn   = document.getElementById('m3-twitch-title-input');
  const twitchTtLink    = document.getElementById('m3-twitch-tt-link');
  const twitchRefreshBtn = document.getElementById('m3-twitch-refresh-btn');
  const ttRank          = document.getElementById('m3-tt-rank');
  const ttAvg           = document.getElementById('m3-tt-avg-viewers');
  const ttHours         = document.getElementById('m3-tt-hours');
  const ttFollowers     = document.getElementById('m3-tt-followers');

  let currentPid        = null;
  let isPaused          = false;
  let m3MultiMode       = false;
  let activeUrls        = [];
  let currentTwitchMeta = null;
  let metaFetchTimer    = null;

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
    debounceTwitchMeta();
  });

  document.getElementById('m3-encode-toggle').addEventListener('click', (e) => {
    if (e.target.closest('label')) return;
    encodeChk.checked = !encodeChk.checked;
    encodeChk.dispatchEvent(new Event('change'));
  });

  if (autoTitleToggle && autoTitleChk) {
    autoTitleToggle.addEventListener('click', (e) => {
      if (e.target.closest('label')) return;
      autoTitleChk.checked = !autoTitleChk.checked;
      autoTitleChk.dispatchEvent(new Event('change'));
    });
  }

  if (autoTitleChk) {
    autoTitleChk.addEventListener('change', () => {
      if (autoTitleChk.checked) {
        debounceTwitchMeta();
      } else {
        clearTimeout(metaFetchTimer);
        if (twitchCard) twitchCard.classList.add('hidden');
        currentTwitchMeta = null;
        if (twitchTitleIn) { twitchTitleIn.value = ''; twitchTitleIn._userEdited = false; }
      }
    });
  }

  let lastCheckedUrl = '';

  // ── Twitch & TwitchTracker Metadata Resolution ──────────
  async function checkAndFetchTwitchMeta(force = false) {
    const isAutoTitleOn = autoTitleChk ? autoTitleChk.checked : false;
    if (!isAutoTitleOn) {
      if (twitchCard) twitchCard.classList.add('hidden');
      currentTwitchMeta = null;
      return;
    }

    const urls = getM3Urls();
    const primaryUrl = urls[0] || '';
    const channelOverride = twitchChannelIn ? twitchChannelIn.value.trim() : '';

    if (!primaryUrl && !channelOverride) {
      if (twitchCard) twitchCard.classList.add('hidden');
      currentTwitchMeta = null;
      lastCheckedUrl = '';
      if (twitchTitleIn && !twitchTitleIn._userEdited) twitchTitleIn.value = '';
      return;
    }

    if (primaryUrl !== lastCheckedUrl && !force) {
      lastCheckedUrl = primaryUrl;
      currentTwitchMeta = null;
      if (twitchTitleIn && !twitchTitleIn._userEdited) twitchTitleIn.value = '';
    }

    const isTwitchCandidate = channelOverride ||
      primaryUrl.includes('vodvod.top') ||
      primaryUrl.includes('twitchtracker.com') ||
      primaryUrl.includes('cloudfront.net') ||
      primaryUrl.includes('ttvnw.net') ||
      primaryUrl.includes('.m3u8');

    if (!isTwitchCandidate) {
      if (twitchCard) twitchCard.classList.add('hidden');
      currentTwitchMeta = null;
      return;
    }

    if (window.api && window.api.fetchM3u8TwitchMeta) {
      try {
        const meta = await window.api.fetchM3u8TwitchMeta({
          url: primaryUrl,
          channel: channelOverride
        });

        if (meta && (meta.channel || meta.title || meta.streamId)) {
          currentTwitchMeta = meta;
          if (twitchCard) twitchCard.classList.remove('hidden');

          // Populate streamer info
          if (twitchName) twitchName.textContent = meta.displayName || meta.channel || 'Twitch Stream';
          if (meta.profileImage && twitchAvatar) {
            twitchAvatar.src = meta.profileImage;
            twitchAvatar.classList.remove('hidden');
            if (twitchFallback) twitchFallback.classList.add('hidden');
          } else if (twitchAvatar && twitchFallback) {
            twitchAvatar.classList.add('hidden');
            twitchFallback.classList.remove('hidden');
          }

          // Date & Category
          if (twitchDate) {
            if (meta.createdAt) {
              const d = new Date(meta.createdAt);
              twitchDate.textContent = !isNaN(d.getTime()) ? d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : '';
            } else {
              twitchDate.textContent = meta.timestamp ? new Date(meta.timestamp * 1000).toLocaleDateString() : '';
            }
          }
          if (twitchGame) {
            twitchGame.textContent = meta.gameName ? `🎮 ${meta.gameName}` : (meta.streamId ? `ID: ${meta.streamId}` : '');
          }

          // Title input
          if (twitchTitleIn) {
            if (!twitchTitleIn._userEdited || force) {
              twitchTitleIn.value = meta.title || (meta.streamId ? `Stream ${meta.streamId}` : '');
              twitchTitleIn._userEdited = false;
            }
          }

          // TwitchTracker stats
          const tt = meta.twitchTracker?.channel;
          if (tt) {
            if (ttRank) ttRank.textContent = tt.rank ? `#${Number(tt.rank).toLocaleString()}` : '-';
            if (ttAvg) ttAvg.textContent = tt.avgViewers ? Number(tt.avgViewers).toLocaleString() : '-';
            if (ttHours) ttHours.textContent = tt.hoursWatched ? `${Math.round(tt.hoursWatched).toLocaleString()}h` : '-';
            if (ttFollowers) ttFollowers.textContent = tt.followersTotal ? Number(tt.followersTotal).toLocaleString() : (tt.followersGained ? `+${tt.followersGained}` : '-');
          } else {
            if (ttRank) ttRank.textContent = '-';
            if (ttAvg) ttAvg.textContent = '-';
            if (ttHours) ttHours.textContent = '-';
            if (ttFollowers) ttFollowers.textContent = '-';
          }

          // TwitchTracker link
          if (twitchTtLink) {
            const ch = meta.channel;
            if (ch) {
              twitchTtLink.href = meta.streamId ? `https://twitchtracker.com/${ch}/streams/${meta.streamId}` : `https://twitchtracker.com/${ch}`;
              twitchTtLink.style.display = '';
            } else {
              twitchTtLink.style.display = 'none';
            }
          }
        } else {
          if (!channelOverride && twitchCard) twitchCard.classList.add('hidden');
        }
      } catch (err) {
        console.warn('Twitch meta fetch error:', err);
      }
    }
  }

  function debounceTwitchMeta() {
    clearTimeout(metaFetchTimer);
    metaFetchTimer = setTimeout(() => checkAndFetchTwitchMeta(false), 400);
  }

  if (twitchTitleIn) {
    twitchTitleIn.addEventListener('input', () => {
      twitchTitleIn._userEdited = true;
    });
  }

  if (twitchRefreshBtn) {
    twitchRefreshBtn.addEventListener('click', () => {
      checkAndFetchTwitchMeta(true);
    });
  }

  if (twitchChannelIn) {
    twitchChannelIn.addEventListener('input', debounceTwitchMeta);
  }

  // ── Quality preset ──────────────────────────────────────
  const qualityHints = {
    'lossless':      'Bit-perfect copy of the decoded stream. Huge files but zero quality loss.',
    'near-lossless': 'Virtually indistinguishable from the source. Very large files.',
    'high':          'Visually lossless for most content. Recommended for archival.',
    'medium':        'Good quality with noticeably smaller files. Fine for general use.',
    'low':           'Smaller files, visible compression artifacts. Good for previews.',
    'very-low':      'Very small files, high compression. Suitable for quick reference.',
    'custom':        'Manual bitrate control.'
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
  const singleInput = document.getElementById('m3-url');

  function updateM3Count() {
    const n = getM3Urls().length;
    countBadge.textContent = n + (n === 1 ? ' URL' : ' URLs');
  }

  if (singleInput) {
    singleInput.addEventListener('paste', (e) => {
      const pasted = (e.clipboardData || window.clipboardData).getData('text');
      if (pasted && pasted.includes('\n') && pasted.trim().split('\n').filter(l => l.trim()).length > 1) {
        e.preventDefault();
        if (!m3MultiMode) {
          modeBtnM3.click();
        }
        m3Textarea.value = pasted.trim() + '\n';
        updateM3Count();
      }
      currentTwitchMeta = null;
      if (twitchTitleIn) { twitchTitleIn.value = ''; twitchTitleIn._userEdited = false; }
      debounceTwitchMeta();
    });
    singleInput.addEventListener('input', () => {
      if (!m3MultiMode) {
        const singleVal = singleInput.value.trim();
        m3Textarea.value = singleVal ? singleVal + '\n' : '';
      }
      currentTwitchMeta = null;
      if (twitchTitleIn) { twitchTitleIn.value = ''; twitchTitleIn._userEdited = false; }
      debounceTwitchMeta();
    });
  }

  m3Textarea.addEventListener('input', () => {
    updateM3Count();
    const list = getM3Urls();
    if (list.length === 1 && singleInput) {
      singleInput.value = list[0];
    } else if (list.length === 0 && singleInput) {
      singleInput.value = '';
    }
    currentTwitchMeta = null;
    if (twitchTitleIn) { twitchTitleIn.value = ''; twitchTitleIn._userEdited = false; }
    debounceTwitchMeta();
  });

  m3Textarea.addEventListener('paste', (e) => {
    e.preventDefault();
    const pasted = (e.clipboardData || window.clipboardData).getData('text');
    const start  = m3Textarea.selectionStart;
    const end    = m3Textarea.selectionEnd;
    const insert = pasted.endsWith('\n') ? pasted : pasted + '\n';
    m3Textarea.value = m3Textarea.value.substring(0, start) + insert + m3Textarea.value.substring(end);
    m3Textarea.selectionStart = m3Textarea.selectionEnd = start + insert.length;
    updateM3Count();
    currentTwitchMeta = null;
    if (twitchTitleIn) { twitchTitleIn.value = ''; twitchTitleIn._userEdited = false; }
    debounceTwitchMeta();
  });

  modeBtnM3.addEventListener('click', () => {
    m3MultiMode = !m3MultiMode;
    singleDiv.classList.toggle('hidden', m3MultiMode);
    multiDiv.classList.toggle('hidden', !m3MultiMode);
    countBadge.classList.toggle('hidden', !m3MultiMode);
    modeBtnM3.classList.toggle('active', m3MultiMode);
    modeBtnM3.title = m3MultiMode ? 'Switch to single URL' : 'Switch to multi-URL mode';
    
    if (m3MultiMode) {
      const single = singleInput ? singleInput.value.trim() : '';
      if (single) {
        const multiUrls = m3Textarea.value.split('\n').map(l => l.trim()).filter(Boolean);
        if (multiUrls.length <= 1) {
          m3Textarea.value = single + '\n';
        }
      }
      updateM3Count();
    } else {
      const urls = getM3Urls();
      if (singleInput) {
        if (urls.length > 0) {
          singleInput.value = urls[0];
        } else {
          singleInput.value = '';
        }
      }
    }
    currentTwitchMeta = null;
    if (twitchTitleIn) { twitchTitleIn.value = ''; twitchTitleIn._userEdited = false; }
    debounceTwitchMeta();
  });

  function getM3Urls() {
    if (!m3MultiMode) {
      const u = singleInput ? singleInput.value.trim() : '';
      return u ? [u] : [];
    }
    return m3Textarea.value.split('\n').map(l => l.trim()).filter(Boolean);
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

  const m3UrlInput = document.getElementById('m3-url');
  if (m3UrlInput) {
    m3UrlInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        runBtn.click();
      }
    });
  }
  if (m3Textarea) {
    m3Textarea.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        runBtn.click();
      }
    });
  }

  runBtn.addEventListener('click', async () => {
    const urls         = getM3Urls();
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
    const autoRepair   = autoRepairChk ? autoRepairChk.checked : false;
    const autoTitle    = autoTitleChk ? autoTitleChk.checked : false;
    let twitchChannel  = (twitchChannelIn && twitchChannelIn.value.trim()) || (currentTwitchMeta ? currentTwitchMeta.channel : '');
    let customTitle    = autoTitle ? ((twitchTitleIn && twitchTitleIn.value.trim()) || '') : '';

    if (urls.length === 0) { appendLog(log, '⚠ Please enter an M3U8 URL.', 'error'); return; }
    if (!outputDir)        { appendLog(log, '⚠ Please choose an output directory.', 'error'); return; }
    const m3PathErr = isProtectedPath(outputDir);
    if (m3PathErr)         { appendLog(log, '⚠ ' + m3PathErr, 'error'); return; }

    // If autoTitle is enabled and metadata hasn't loaded yet, resolve it before starting
    if (autoTitle && !customTitle && urls.length === 1 && urls[0].includes('.m3u8') && window.api && window.api.fetchM3u8TwitchMeta) {
      if (!currentTwitchMeta || (!currentTwitchMeta.title && !currentTwitchMeta.profileImage)) {
        try {
          const meta = await window.api.fetchM3u8TwitchMeta({ url: urls[0], channel: twitchChannel });
          if (meta) {
            currentTwitchMeta = meta;
            if (meta.title && twitchTitleIn) {
              twitchTitleIn.value = meta.title;
              customTitle = meta.title;
            }
            if (meta.channel) twitchChannel = meta.channel;
          }
        } catch (e) { }
      }
    }

    let customFilename = '';
    if (autoTitle) {
      const parts = [];
      if (customTitle) {
        parts.push(customTitle.replace(/[<>:"/\\|?*\x00-\x1F]/g, '_').trim());
      } else if (currentTwitchMeta?.streamId) {
        parts.push(`Stream ${currentTwitchMeta.streamId}`);
      }
      if (currentTwitchMeta?.createdAt) {
        const d = new Date(currentTwitchMeta.createdAt);
        if (!isNaN(d.getTime())) parts.push(d.toISOString().split('T')[0]);
      } else if (currentTwitchMeta?.timestamp) {
        const d = new Date(currentTwitchMeta.timestamp * 1000);
        if (!isNaN(d.getTime())) parts.push(d.toISOString().split('T')[0]);
      }
      if (parts.length > 0) {
        customFilename = parts.join(' - ').replace(/\s+/g, ' ').trim();
      }
    }

    clearLog(log);
    if (urls.length > 1) {
      appendLog(log, `▶ Starting M3U8 batch (${urls.length} URLs)...`, 'info');
    } else {
      appendLog(log, `▶ Starting M3U8 download...`, 'info');
      appendLog(log, `  URL:    ${urls[0]}`, 'cmd');
    }
    if (autoTitle && twitchChannel) appendLog(log, `  Channel: ${twitchChannel}`, 'cmd');
    if (autoTitle && customTitle) appendLog(log, `  Title:   ${customTitle}`, 'cmd');
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

    window.api.runM3u8({
      urls,
      url: urls[0],
      outputDir,
      startTime,
      endTime,
      encode,
      codec,
      quality,
      bitrate,
      resolution,
      fps,
      audioBitrate,
      container,
      cookiesPath,
      autoRepair,
      autoTitle,
      twitchChannel: autoTitle ? twitchChannel : '',
      customFilename: autoTitle ? customFilename : '',
      rawTitle: autoTitle ? customTitle : ''
    });
  });

  if (window.api && window.api.onM3u8Output) {
    window.api.onM3u8Output((data) => {
      if (data.type === 'pid') {
        if (!currentPid) incRunning('M3U8 Downloader');
        currentPid = data.pid;
        runBtn.classList.add('hidden');
        pauseBtn.classList.remove('hidden');
        stopBtn.classList.remove('hidden');
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
        decRunning('M3U8 Downloader');
      });
    });
  }
})();
