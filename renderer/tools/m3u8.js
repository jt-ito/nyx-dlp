/* ── 4. M3U8 Downloader ──────────────────────────────────── */
(function () {
  const log        = document.getElementById('m3-log');
  const runBtn     = document.getElementById('m3-run');
  const pauseBtn   = document.getElementById('m3-pause');
  const stopBtn    = document.getElementById('m3-stop');
  const encodeChk  = document.getElementById('m3-encode');
  const encodeOpts = document.querySelectorAll('.encode-options');
  const modeBtnM3  = document.getElementById('m3-url-mode-btn');
  const singleDiv       = document.getElementById('m3-url-single');
  const multiDiv        = document.getElementById('m3-url-multi');
  const countBadge      = document.getElementById('m3-url-counter');
  const autoRepairChk   = document.getElementById('m3-auto-repair');
  const autoTitleChk    = document.getElementById('m3-auto-title');
  const autoTitleToggle = document.getElementById('m3-auto-title-toggle');
  const nativeHlsChk    = document.getElementById('m3-native-hls');
  const nativeHlsToggle = document.getElementById('m3-native-hls-toggle');
  const twitchBadge     = document.getElementById('m3-twitch-badge');
  const twitchCard      = document.getElementById('m3-twitch-card');
  const twitchAvatar    = document.getElementById('m3-twitch-avatar');
  const twitchFallback  = document.getElementById('m3-twitch-avatar-fallback');
  const twitchName      = document.getElementById('m3-twitch-name');
  const twitchDate      = document.getElementById('m3-twitch-date');
  const twitchGame      = document.getElementById('m3-twitch-game');
  const twitchTitleIn   = document.getElementById('m3-twitch-title-input');
  const twitchTtLink    = document.getElementById('m3-twitch-tt-link');
  const twitchRefreshBtn = document.getElementById('m3-twitch-refresh-btn');
  const channelEditRow  = document.getElementById('m3-channel-edit-row');
  const manualChannelIn = document.getElementById('m3-manual-channel-input');
  const saveChannelBtn  = document.getElementById('m3-save-channel-btn');
  const metaLoadingMsg  = document.getElementById('m3-meta-loading-msg');
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
  let activeMetaFetchPromise = null;

  const pauseIconHTML  = pauseBtn.innerHTML;
  const resumeIconHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none"><polygon points="5 3 19 12 5 21 5 3" fill="currentColor"/></svg> Resume`;

  const TWITCH_FALLBACK_SVG = `<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M11.571 4.714h1.715v5.143H11.57zm4.715 0H18v5.143h-1.714zM6 0L1.714 4.286v15.428h5.143V24l4.286-4.286h3.428L22.286 12V0zm14.571 11.143l-3.428 3.428h-3.429l-3 3v-3H6.857V1.714h13.714Z"/></svg>`;
  const KICK_FALLBACK_SVG = `<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M1.333 0h8v5.333H12v2.667h2.667V5.333h2.666V2.667h2.667V0h2.667v8h-2.667v2.667h-2.666v2.666h2.666V16h2.667v8h-2.667v-2.667h-2.667v-2.666h-2.666V16h-2.667v2.667H9.333V24h-8V0zm8 8H6.667v8h2.666v-2.667H12v-2.666H9.333V8z"/></svg>`;

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

  if (nativeHlsToggle && nativeHlsChk) {
    nativeHlsToggle.addEventListener('click', (e) => {
      if (e.target.closest('label')) return;
      nativeHlsChk.checked = !nativeHlsChk.checked;
      nativeHlsChk.dispatchEvent(new Event('change'));
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

  // ── Twitch & Kick Metadata Resolution ──────────
  async function checkAndFetchTwitchMeta(force = false) {
    const isAutoTitleOn = autoTitleChk ? autoTitleChk.checked : false;
    if (!isAutoTitleOn) {
      if (twitchCard) twitchCard.classList.add('hidden');
      currentTwitchMeta = null;
      return;
    }

    const urls = getM3Urls();
    const primaryUrl = urls[0] || '';

    if (!primaryUrl) {
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

    const isMetaCandidate = primaryUrl.includes('vodvod.top') ||
      primaryUrl.includes('twitchtracker.com') ||
      primaryUrl.includes('kicktracker.net') ||
      primaryUrl.includes('kick.com') ||
      primaryUrl.includes('cloudfront.net') ||
      primaryUrl.includes('ttvnw.net') ||
      primaryUrl.includes('.m3u8');

    if (!isMetaCandidate) {
      if (twitchCard) twitchCard.classList.add('hidden');
      currentTwitchMeta = null;
      if (metaLoadingMsg) metaLoadingMsg.classList.add('hidden');
      return;
    }

    if (twitchCard) twitchCard.classList.remove('hidden');
    if (metaLoadingMsg) {
      metaLoadingMsg.classList.remove('hidden');
      metaLoadingMsg.style.color = '#ff4d4d';
      metaLoadingMsg.textContent = '⏳ Pulling stream info, please wait...';
    }
    if (twitchTitleIn && !twitchTitleIn._userEdited && !twitchTitleIn.value) {
      twitchTitleIn.placeholder = '⏳ Pulling stream info, please wait...';
    }

    if (window.api && window.api.fetchM3u8TwitchMeta) {
      try {
        activeMetaFetchPromise = window.api.fetchM3u8TwitchMeta({
          url: primaryUrl
        });
        const meta = await activeMetaFetchPromise;

        if (meta && (meta.channel || meta.title || meta.streamId)) {
          currentTwitchMeta = meta;
          if (twitchCard) twitchCard.classList.remove('hidden');

          // Populate streamer info
          if (twitchName) twitchName.textContent = meta.displayName || meta.channel || 'Live Stream';
          const isKick = meta.source === 'kick' || !!meta.kickTrackerUrl;
          if (twitchBadge) {
            twitchBadge.textContent = isKick ? 'Kick Stream' : 'Twitch VOD';
          }
          if (twitchFallback) {
            twitchFallback.innerHTML = isKick ? KICK_FALLBACK_SVG : TWITCH_FALLBACK_SVG;
            if (isKick) {
              twitchFallback.style.color = '#53fc18';
            } else {
              twitchFallback.style.color = '';
            }
          }
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

          // Stats (TwitchTracker or KickTracker)
          const tt = meta.twitchTracker?.channel;
          const ks = meta.stats;
          if (ks) {
            if (ttRank) ttRank.textContent = ks.peakViewers ? `${ks.peakViewers} peak` : '-';
            if (ttAvg) ttAvg.textContent = ks.avgViewers || '-';
            if (ttHours) ttHours.textContent = ks.hoursWatched ? `${ks.hoursWatched}h` : (ks.hoursStreamed ? `${ks.hoursStreamed}h` : '-');
            if (ttFollowers) ttFollowers.textContent = ks.hoursStreamed ? `${ks.hoursStreamed}h live` : '-';
          } else if (tt) {
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

          // Tracker link (TwitchTracker or KickTracker)
          if (twitchTtLink) {
            const ch = meta.channel;
            if (meta.kickTrackerUrl) {
              twitchTtLink.href = meta.kickTrackerUrl;
              twitchTtLink.title = 'View on KickTracker';
              twitchTtLink.style.display = '';
            } else if (ch) {
              twitchTtLink.href = meta.streamId ? `https://twitchtracker.com/${ch}/streams/${meta.streamId}` : `https://twitchtracker.com/${ch}`;
              twitchTtLink.title = 'View on TwitchTracker';
              twitchTtLink.style.display = '';
            } else {
              twitchTtLink.style.display = 'none';
            }
          }
          // Show or hide Streamer linking box (only for unmapped Kick streams)
          const isUnmappedKick = isKick && (!meta.channel || meta.channel === 'Kick Stream' || !meta.stats);
          if (channelEditRow) {
            channelEditRow.classList.toggle('hidden', !isUnmappedKick);
          }
          if (manualChannelIn) {
            manualChannelIn.value = (meta.channel && !meta.channel.includes(' ') && meta.channel !== 'Kick Stream') ? meta.channel : '';
          }
        } else {
          if (twitchCard) twitchCard.classList.add('hidden');
        }
      } catch (err) {
        console.warn('Metadata fetch error:', err);
      } finally {
        activeMetaFetchPromise = null;
        if (metaLoadingMsg) metaLoadingMsg.classList.add('hidden');
        if (twitchTitleIn) twitchTitleIn.placeholder = 'Stream Title...';
      }
    }
  }

  async function linkManualChannel() {
    const rawChannel = manualChannelIn ? manualChannelIn.value.trim().toLowerCase() : '';
    if (!rawChannel) return;
    const urls = getM3Urls();
    const primaryUrl = urls[0] || '';
    const ivsMatch = primaryUrl.match(/\/ivs\/v1\/\d+\/([^\/]+)\//);
    const ivsId = ivsMatch ? ivsMatch[1] : '';

    if (ivsId && window.api && window.api.saveKickIvsMapping) {
      await window.api.saveKickIvsMapping({ ivsId, channel: rawChannel });
    }

    if (metaLoadingMsg) {
      metaLoadingMsg.classList.remove('hidden');
      metaLoadingMsg.style.color = '#50fa7b';
      metaLoadingMsg.textContent = `⏳ Linking ${rawChannel} & fetching stream info...`;
    }

    try {
      if (window.api && window.api.fetchM3u8TwitchMeta) {
        const meta = await window.api.fetchM3u8TwitchMeta({ url: primaryUrl, channel: rawChannel });
        if (meta) {
          currentTwitchMeta = meta;
          if (channelEditRow && meta.channel && meta.channel !== 'Kick Stream') {
            channelEditRow.classList.add('hidden');
          }
          if (twitchName) twitchName.textContent = meta.displayName || meta.channel;
          if (meta.title && twitchTitleIn) {
            twitchTitleIn.value = meta.title;
            twitchTitleIn._userEdited = false;
          }
          if (meta.profileImage && twitchAvatar) {
            twitchAvatar.src = meta.profileImage;
            twitchAvatar.classList.remove('hidden');
            if (twitchFallback) twitchFallback.classList.add('hidden');
          }
          if (meta.kickTrackerUrl && twitchTtLink) {
            twitchTtLink.href = meta.kickTrackerUrl;
            twitchTtLink.style.display = '';
          }
          const ks = meta.stats;
          if (ks) {
            if (ttRank) ttRank.textContent = ks.peakViewers ? `${ks.peakViewers} peak` : '-';
            if (ttAvg) ttAvg.textContent = ks.avgViewers || '-';
            if (ttHours) ttHours.textContent = ks.hoursWatched ? `${ks.hoursWatched}h` : (ks.hoursStreamed ? `${ks.hoursStreamed}h` : '-');
            if (ttFollowers) ttFollowers.textContent = ks.hoursStreamed ? `${ks.hoursStreamed}h live` : '-';
          }
        }
      }
    } catch (_) {}

    if (metaLoadingMsg) metaLoadingMsg.classList.add('hidden');
  }

  if (saveChannelBtn) {
    saveChannelBtn.addEventListener('click', linkManualChannel);
  }
  if (manualChannelIn) {
    manualChannelIn.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        linkManualChannel();
      }
    });
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

  if (twitchTtLink) {
    twitchTtLink.addEventListener('click', (e) => {
      e.preventDefault();
      const url = twitchTtLink.getAttribute('href');
      if (url && url !== '#' && window.api && window.api.openExternal) {
        window.api.openExternal(url);
      }
    });
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
      const pUrl = getM3Urls()[0] || '';
      if (pUrl !== lastCheckedUrl) {
        currentTwitchMeta = null;
        if (twitchTitleIn && !twitchTitleIn._userEdited) twitchTitleIn.value = '';
      }
      debounceTwitchMeta();
    });
    singleInput.addEventListener('input', () => {
      if (!m3MultiMode) {
        const singleVal = singleInput.value.trim();
        m3Textarea.value = singleVal ? singleVal + '\n' : '';
      }
      const pUrl = getM3Urls()[0] || '';
      if (pUrl !== lastCheckedUrl) {
        currentTwitchMeta = null;
        if (twitchTitleIn && !twitchTitleIn._userEdited) twitchTitleIn.value = '';
      }
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
    const pUrl = list[0] || '';
    if (pUrl !== lastCheckedUrl) {
      currentTwitchMeta = null;
      if (twitchTitleIn && !twitchTitleIn._userEdited) twitchTitleIn.value = '';
    }
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
    const pUrl = getM3Urls()[0] || '';
    if (pUrl !== lastCheckedUrl) {
      currentTwitchMeta = null;
      if (twitchTitleIn && !twitchTitleIn._userEdited) twitchTitleIn.value = '';
    }
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
    const currentPrimary = getM3Urls()[0] || '';
    if (currentPrimary !== lastCheckedUrl) {
      debounceTwitchMeta();
    }
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
    const nativeHls    = nativeHlsChk ? nativeHlsChk.checked : false;
    const autoTitle    = autoTitleChk ? autoTitleChk.checked : false;
    let twitchChannel  = (twitchChannelIn && twitchChannelIn.value.trim()) || (currentTwitchMeta ? currentTwitchMeta.channel : '');
    let customTitle    = autoTitle ? ((twitchTitleIn && twitchTitleIn.value.trim()) || '') : '';

    if (urls.length === 0) { appendLog(log, '⚠ Please enter an M3U8 URL.', 'error'); return; }
    if (!outputDir)        { appendLog(log, '⚠ Please choose an output directory.', 'error'); return; }
    const m3PathErr = isProtectedPath(outputDir);
    if (m3PathErr)         { appendLog(log, '⚠ ' + m3PathErr, 'error'); return; }

    // If autoTitle is enabled and metadata is still actively being fetched:
    if (autoTitle && (activeMetaFetchPromise || metaFetchTimer || (!currentTwitchMeta && urls.length === 1 && urls[0].includes('.m3u8')))) {
      if (twitchCard) {
        twitchCard.classList.remove('hidden');
        twitchCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
      window.scrollTo({ top: 0, behavior: 'smooth' });

      if (metaLoadingMsg) {
        metaLoadingMsg.classList.remove('hidden');
        metaLoadingMsg.style.color = '#ff4d4d';
        metaLoadingMsg.textContent = '⏳ Pulling stream info, please wait...';
      }
      if (twitchTitleIn && !twitchTitleIn.value) {
        twitchTitleIn.placeholder = '⏳ Pulling stream info, please wait...';
      }

      if (metaFetchTimer) {
        clearTimeout(metaFetchTimer);
        metaFetchTimer = null;
        checkAndFetchTwitchMeta(true);
      }

      if (activeMetaFetchPromise) {
        appendLog(log, '⏳ Pulling stream info before download starts...', 'cmd');
        try {
          await activeMetaFetchPromise;
        } catch (_) {}
      } else if (!currentTwitchMeta && urls.length === 1 && window.api && window.api.fetchM3u8TwitchMeta) {
        try {
          appendLog(log, '⏳ Pulling stream info before download starts...', 'cmd');
          await checkAndFetchTwitchMeta(true);
        } catch (_) {}
      }

      if (metaLoadingMsg) metaLoadingMsg.classList.add('hidden');
      if (twitchTitleIn) twitchTitleIn.placeholder = 'Stream Title...';

      // Update customTitle and channel with newly resolved metadata
      customTitle = autoTitle ? ((twitchTitleIn && twitchTitleIn.value.trim()) || '') : '';
      twitchChannel = currentTwitchMeta ? currentTwitchMeta.channel : '';
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
    if (nativeHls) appendLog(log, `  Engine: Native HLS (15x concurrency)`, 'cmd');
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
      nativeHls,
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
