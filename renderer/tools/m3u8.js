/* ── 4. M3U8 Downloader ──────────────────────────────────── */
(function () {
  const log        = document.getElementById('m3-log');
  const runBtn     = document.getElementById('m3-run');
  const pauseBtn   = document.getElementById('m3-pause');
  const stopBtn    = document.getElementById('m3-stop');
  const encodeChk  = document.getElementById('m3-encode');
  const encodeOpts = document.querySelectorAll('.encode-options');
  const modeBtnM3       = document.getElementById('m3-url-mode-btn');
  const singleDiv       = document.getElementById('m3-url-single');
  const multiDiv        = document.getElementById('m3-url-multi');
  const countBadge      = document.getElementById('m3-url-counter');
  const m3UrlInput      = document.getElementById('m3-url');
  const singleInput     = m3UrlInput;
  const m3Textarea      = document.getElementById('m3-urls');

  // Prevent stale URLs from previous state sync or localStorage pollutions
  try {
    localStorage.removeItem('field:m3-urls');
    localStorage.removeItem('field:m3-url');
  } catch (_) {}
  if (m3UrlInput) m3UrlInput.value = '';
  if (m3Textarea) m3Textarea.value = '';
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
  function updateEncodeOptsVisibility() {
    const isShown = encodeChk.checked && !encodeChk.disabled && (typeof getSetting !== 'function' || getSetting('show-m3-encode'));
    encodeOpts.forEach(el => el.classList.toggle('hidden', !isShown));
  }
  encodeChk.addEventListener('change', updateEncodeOptsVisibility);
  
  // Initialize visibility based on current state
  updateEncodeOptsVisibility();
  window.addEventListener('DOMContentLoaded', () => {
    updateEncodeOptsVisibility();
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

  // ── Master Playlist Discovery (Opt-in) ────────
  const probeBtn            = document.getElementById('m3-probe-btn');
  const probeStatus         = document.getElementById('m3-probe-status');
  const discoveryResultCard = document.getElementById('m3-discovery-result');
  const discoveryUrlPreview = document.getElementById('m3-discovery-url-preview');
  const discoveryKeepBtn    = document.getElementById('m3-discovery-keep-btn');
  const discoveryApplyBtn   = document.getElementById('m3-discovery-apply-btn');

  const sessionNegativeCache = new Set();
  let discoveredMasterUrl = null;

  if (probeBtn && m3UrlInput) {
    probeBtn.addEventListener('click', async () => {
      const url = m3UrlInput.value.trim();
      if (!url) {
        if (probeStatus) probeStatus.textContent = 'Please enter an M3U8 URL first.';
        return;
      }

      // Check signed URL heuristic
      const isSigned = /(?:[?&](?:token|hmac|hdnts|policy|signature|exp|st)=)/i.test(url);
      if (isSigned) {
        if (probeStatus) {
          probeStatus.innerHTML = '<span style="color: #f59e0b;">ℹ Signed URL detected; parent-path discovery is unlikely to work.</span>';
        }
        return;
      }

      // Check session negative cache
      if (sessionNegativeCache.has(url)) {
        if (probeStatus) probeStatus.textContent = 'No master manifest found at parent paths (cached).';
        return;
      }

      probeBtn.disabled = true;
      const spanEl = probeBtn.querySelector('span');
      const origText = spanEl ? spanEl.textContent : 'Try to find other qualities';
      if (spanEl) spanEl.textContent = 'Checking...';
      if (probeStatus) probeStatus.textContent = 'Probing candidate master manifests...';

      try {
        let res = null;
        if (window.api && window.api.probeMasterPlaylist) {
          res = await window.api.probeMasterPlaylist({ url });
        } else if (window.api && window.api.invoke) {
          res = await window.api.invoke('probe-master-playlist', { url });
        }

        if (res && res.success && res.masterUrl) {
          discoveredMasterUrl = res.masterUrl;
          if (discoveryUrlPreview) discoveryUrlPreview.textContent = res.masterUrl;
          if (discoveryResultCard) {
            discoveryResultCard.style.display = 'flex';
            discoveryResultCard.classList.remove('hidden');
          }
          if (probeStatus) probeStatus.innerHTML = '<span style="color: #10b981;">✓ Master manifest found!</span>';
        } else {
          sessionNegativeCache.add(url);
          if (probeStatus) probeStatus.textContent = res?.message || 'No master manifest found at parent paths.';
        }
      } catch (err) {
        if (probeStatus) probeStatus.textContent = 'Probe error: ' + (err.message || 'Network error');
      } finally {
        probeBtn.disabled = false;
        if (spanEl) spanEl.textContent = origText;
      }
    });

    if (discoveryKeepBtn) {
      discoveryKeepBtn.addEventListener('click', () => {
        if (discoveryResultCard) {
          discoveryResultCard.style.display = 'none';
          discoveryResultCard.classList.add('hidden');
        }
        if (probeStatus) probeStatus.textContent = 'Kept original rendition.';
      });
    }

    if (discoveryApplyBtn) {
      discoveryApplyBtn.addEventListener('click', () => {
        if (discoveredMasterUrl) {
          m3UrlInput.value = discoveredMasterUrl;
          m3UrlInput.dispatchEvent(new Event('input', { bubbles: true }));
          m3UrlInput.dispatchEvent(new Event('change', { bubbles: true }));
        }
        if (discoveryResultCard) {
          discoveryResultCard.style.display = 'none';
          discoveryResultCard.classList.add('hidden');
        }
        if (probeStatus) probeStatus.innerHTML = '<span style="color: #10b981;">✓ Switched to Master Playlist.</span>';
      });
    }

    m3UrlInput.addEventListener('input', () => {
      if (discoveryResultCard) {
        discoveryResultCard.style.display = 'none';
        discoveryResultCard.classList.add('hidden');
      }
      if (probeStatus) probeStatus.textContent = '';
      discoveredMasterUrl = null;
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
        renderTwitchMetaCard(meta, force);
      } catch (err) {
        console.warn('Metadata fetch error:', err);
      } finally {
        activeMetaFetchPromise = null;
        if (metaLoadingMsg) metaLoadingMsg.classList.add('hidden');
        if (twitchTitleIn) twitchTitleIn.placeholder = 'Stream Title...';
      }
    }
  }

  function renderTwitchMetaCard(meta, force = false, batchIndex = null, batchTotal = null) {
    if (!meta || (!meta.channel && !meta.title && !meta.streamId)) {
      if (twitchCard && batchTotal === null) twitchCard.classList.add('hidden');
      return;
    }

    currentTwitchMeta = meta;
    if (twitchCard) {
      twitchCard.classList.remove('hidden');
      if (batchIndex !== null) {
        twitchCard.classList.remove('m3-card-pulse');
        void twitchCard.offsetWidth;
        twitchCard.classList.add('m3-card-pulse');
      }
    }

    // Populate streamer info
    if (twitchName) twitchName.textContent = meta.displayName || meta.channel || 'Live Stream';
    const isKick = meta.source === 'kick' || !!meta.kickTrackerUrl;
    if (twitchBadge) {
      if (batchTotal && batchTotal > 1) {
        twitchBadge.textContent = `${isKick ? 'Kick Stream' : 'Twitch VOD'} [${batchIndex + 1}/${batchTotal}]`;
      } else {
        twitchBadge.textContent = isKick ? 'Kick Stream' : 'Twitch VOD';
      }
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
      if (!twitchTitleIn._userEdited || force || batchIndex !== null) {
        twitchTitleIn.value = meta.title || (meta.streamId ? `Stream ${meta.streamId}` : '');
        if (batchIndex === null) {
          twitchTitleIn._userEdited = false;
        }
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
          renderTwitchMetaCard(meta, true);
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
      twitchTitleIn._userEdited = !!twitchTitleIn.value.trim();
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
  function updateM3Count() {
    if (!countBadge) return;
    const n = getM3Urls().length;
    countBadge.textContent = n + (n === 1 ? ' URL' : ' URLs');
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

  function syncMultiToSingle() {
    const lines = m3Textarea ? m3Textarea.value.split('\n').map(l => l.trim()).filter(Boolean) : [];
    if (singleInput) {
      singleInput.value = lines.length > 0 ? lines[0] : '';
    }
    updateM3Count();
    const pUrl = lines[0] || '';
    if (pUrl !== lastCheckedUrl) {
      currentTwitchMeta = null;
      if (twitchTitleIn && !twitchTitleIn._userEdited) twitchTitleIn.value = '';
    }
    debounceTwitchMeta();
  }

  if (singleInput) {
    singleInput.addEventListener('paste', (e) => {
      const pasted = (e.clipboardData || window.clipboardData)?.getData('text') || '';
      const lines = pasted.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
      const spaceUrls = pasted.trim().split(/\s+/).filter(u => /^https?:\/\//i.test(u));

      if (lines.length > 1) {
        e.preventDefault();
        if (!m3MultiMode && modeBtnM3) {
          modeBtnM3.click();
        }
        if (m3Textarea) {
          m3Textarea.value = lines.join('\n') + '\n';
        }
        if (singleInput) {
          singleInput.value = lines[0] || '';
        }
        updateM3Count();
        if (m3Textarea) {
          scrollToCursor(m3Textarea);
          setTimeout(() => m3Textarea.focus(), 50);
        }
      } else if (spaceUrls.length > 1) {
        e.preventDefault();
        if (!m3MultiMode && modeBtnM3) {
          modeBtnM3.click();
        }
        if (m3Textarea) {
          m3Textarea.value = spaceUrls.join('\n') + '\n';
        }
        if (singleInput) {
          singleInput.value = spaceUrls[0] || '';
        }
        updateM3Count();
        if (m3Textarea) {
          scrollToCursor(m3Textarea);
          setTimeout(() => m3Textarea.focus(), 50);
        }
      }
      const pUrl = getM3Urls()[0] || '';
      if (pUrl !== lastCheckedUrl) {
        currentTwitchMeta = null;
        if (twitchTitleIn && !twitchTitleIn._userEdited) twitchTitleIn.value = '';
      }
      debounceTwitchMeta();
    });

    singleInput.addEventListener('input', () => {
      const singleVal = singleInput.value.trim();
      if (!m3MultiMode && m3Textarea) {
        m3Textarea.value = singleVal ? singleVal + '\n' : '';
      }
      updateM3Count();
      const pUrl = getM3Urls()[0] || '';
      if (pUrl !== lastCheckedUrl) {
        currentTwitchMeta = null;
        if (twitchTitleIn && !twitchTitleIn._userEdited) twitchTitleIn.value = '';
      }
      debounceTwitchMeta();
    });
  }

  if (m3Textarea) {
    m3Textarea.addEventListener('input', () => {
      syncMultiToSingle();
      scrollToCursor(m3Textarea);
    });

    m3Textarea.addEventListener('paste', (e) => {
      e.preventDefault();
      const pasted = (e.clipboardData || window.clipboardData)?.getData('text') || '';
      const spaceUrls = pasted.trim().split(/\s+/).filter(u => /^https?:\/\//i.test(u));
      let insertText = pasted;
      if (!pasted.includes('\n') && !pasted.includes('\r') && spaceUrls.length > 1) {
        insertText = spaceUrls.join('\n');
      }
      const start  = m3Textarea.selectionStart;
      const end    = m3Textarea.selectionEnd;
      const before = m3Textarea.value.substring(0, start);
      const after  = m3Textarea.value.substring(end);
      const insert = insertText.endsWith('\n') ? insertText : insertText + '\n';
      m3Textarea.value = before + insert + after;
      const newPos = start + insert.length;
      m3Textarea.selectionStart = newPos;
      m3Textarea.selectionEnd   = newPos;
      syncMultiToSingle();
      scrollToCursor(m3Textarea);
    });
  }

  if (modeBtnM3) {
    modeBtnM3.addEventListener('click', () => {
      const switchingToMulti = !m3MultiMode;
      m3MultiMode = switchingToMulti;
      if (singleDiv) singleDiv.classList.toggle('hidden', m3MultiMode);
      if (multiDiv) multiDiv.classList.toggle('hidden', !m3MultiMode);
      if (countBadge) countBadge.classList.toggle('hidden', !m3MultiMode);
      modeBtnM3.classList.toggle('active', m3MultiMode);
      modeBtnM3.title = m3MultiMode ? 'Switch to single URL' : 'Switch to multi-URL mode';
      
      if (switchingToMulti) {
        // Expanding to multi-mode
        const singleVal = singleInput ? singleInput.value.trim() : '';
        const currentMultiLines = m3Textarea ? m3Textarea.value.split('\n').map(l => l.trim()).filter(Boolean) : [];
        if (!singleVal) {
          if (m3Textarea) m3Textarea.value = '';
        } else {
          if (currentMultiLines.length === 0 || currentMultiLines[0] !== singleVal) {
            if (m3Textarea) m3Textarea.value = singleVal + '\n';
          }
        }
        updateM3Count();
        if (m3Textarea) {
          scrollToCursor(m3Textarea);
          setTimeout(() => m3Textarea.focus(), 50);
        }
      } else {
        // Collapsing to single-mode
        const multiLines = m3Textarea ? m3Textarea.value.split('\n').map(l => l.trim()).filter(Boolean) : [];
        if (singleInput) {
          singleInput.value = multiLines.length > 0 ? multiLines[0] : '';
          setTimeout(() => singleInput.focus(), 50);
        }
        updateM3Count();
      }

      const currentPrimary = getM3Urls()[0] || '';
      if (currentPrimary !== lastCheckedUrl) {
        debounceTwitchMeta();
      }
    });
  }

  function getM3Urls() {
    if (!m3MultiMode) {
      const u = singleInput ? singleInput.value.trim() : '';
      return u ? [u] : [];
    }
    return m3Textarea ? m3Textarea.value.split('\n').map(l => l.trim()).filter(Boolean) : [];
  }

  document.getElementById('m3-clear').addEventListener('click', () => clearLog(log));
  stopBtn.addEventListener('click', () => {
    if (currentPid) window.api.stopScript(currentPid);
    isPaused = false;
    pauseBtn.innerHTML = pauseIconHTML;
    pauseBtn.classList.remove('paused');
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
    const encode       = (!encodeChk || encodeChk.disabled || (typeof getSetting === 'function' && !getSetting('show-m3-encode'))) ? false : encodeChk.checked;
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
    const userEditedTitle = !!(twitchTitleIn && twitchTitleIn._userEdited && twitchTitleIn.value.trim());
    let twitchChannel  = (manualChannelIn && manualChannelIn.value.trim()) || (currentTwitchMeta ? currentTwitchMeta.channel : '');
    let customTitle    = autoTitle ? ((twitchTitleIn && twitchTitleIn.value.trim()) || '') : '';

    if (urls.length === 0) { appendLog(log, '⚠ Please enter an M3U8 URL.', 'error'); return; }
    if (!outputDir)        { appendLog(log, '⚠ Please choose an output directory.', 'error'); return; }
    const m3PathErr = isProtectedPath(outputDir);
    if (m3PathErr)         { appendLog(log, '⚠ ' + m3PathErr, 'error'); return; }

    const startM3u8Download = async (urlsToUse, hasFragment = false) => {
      // If autoTitle is enabled and metadata is still actively being fetched:
      if (autoTitle && (activeMetaFetchPromise || metaFetchTimer || (!currentTwitchMeta && urlsToUse.length === 1 && urlsToUse[0].includes('.m3u8')))) {
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
        } else if (!currentTwitchMeta && urlsToUse.length === 1 && window.api && window.api.fetchM3u8TwitchMeta) {
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

      const effectiveFilename = (urlsToUse.length > 1 && !userEditedTitle) ? '' : customFilename;
      const effectiveTitle    = (urlsToUse.length > 1 && !userEditedTitle) ? '' : customTitle;
      const effectiveChannel  = (urlsToUse.length > 1 && !userEditedTitle) ? '' : twitchChannel;

      clearLog(log);
      if (urlsToUse.length > 1) {
        appendLog(log, `▶ Starting M3U8 batch (${urlsToUse.length} URLs)...`, 'info');
        appendLog(log, `  Auto-Name: Dynamic per-stream resolution enabled`, 'cmd');
      } else {
        appendLog(log, `▶ Starting M3U8 download...`, 'info');
        appendLog(log, `  URL:    ${urlsToUse[0]}`, 'cmd');
      }
      if (autoTitle && effectiveChannel) appendLog(log, `  Channel: ${effectiveChannel}`, 'cmd');
      if (autoTitle && effectiveTitle)   appendLog(log, `  Title:   ${effectiveTitle}`, 'cmd');
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
      stopBtn.classList.remove('hidden');

      window.api.runM3u8({
        urls: urlsToUse,
        url: urlsToUse[0],
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
        twitchChannel: autoTitle ? effectiveChannel : '',
        customFilename: autoTitle ? effectiveFilename : '',
        rawTitle: autoTitle ? effectiveTitle : '',
        userEditedTitle
      });
    };

    if (urls.length === 1 && window.NyxFragmentRescue?.isFragmentUrl(urls[0])) {
      window.NyxFragmentRescue.promptFragmentRescue({
        originalUrl: urls[0],
        cookiesPath,
        onProceedWithFragment: (isFragment) => {
          startM3u8Download(urls, isFragment);
        },
        onManifestChosen: (newUrl) => {
          if (m3UrlInput) m3UrlInput.value = newUrl;
          startM3u8Download([newUrl], false);
        }
      });
      return;
    } else if (urls.length > 1 && window.NyxFragmentRescue) {
      window.NyxFragmentRescue.handleBatchFragmentCheck({
        urls,
        cookiesPath,
        onProceed: (resolvedUrls) => {
          const hasFrag = resolvedUrls.some(window.NyxFragmentRescue.isFragmentUrl);
          startM3u8Download(resolvedUrls, hasFrag);
        }
      });
      return;
    }

    startM3u8Download(urls, false);
  });

  if (window.api && window.api.onM3u8Output) {
    window.api.onM3u8Output((data) => {
      if (data.type === 'pid') {
        if (!currentPid) incRunning('M3U8 Downloader');
        currentPid = data.pid;
        runBtn.classList.add('hidden');
        pauseBtn.classList.remove('hidden');
        stopBtn.classList.remove('hidden');
        if (isPaused) {
          pauseBtn.innerHTML = resumeIconHTML;
          pauseBtn.classList.add('paused');
        }
        return;
      }
      if (data.type === 'm3u8-meta') {
        renderTwitchMetaCard(data.meta, true, data.index, data.total);
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
