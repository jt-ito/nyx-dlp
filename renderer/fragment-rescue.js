/* ── Fragment URL Detection & Manifest Rescue ─────────────────── */
(function () {
  const FRAGMENT_URL_REGEX = /\.(ts|m4s|m4a|m4v)(\?.*)?$/i;
  const MANIFEST_URL_REGEX = /\.(m3u8|mpd)(\?.*)?$/i;

  function isFragmentUrl(url) {
    if (!url || typeof url !== 'string') return false;
    const trimmed = url.trim();
    return FRAGMENT_URL_REGEX.test(trimmed) && !MANIFEST_URL_REGEX.test(trimmed);
  }

  const FRAGMENT_NOTICE_TEXT = 'ℹ This was a single fragment (.ts/.m4s), not the full playlist. Enable "Attempt manifest detection for fragment URLs" in Settings to get help finding the full stream next time.';

  // DOM Elements - Single Tool Modal
  const modalSingle         = document.getElementById('frag-rescue-modal');
  const closeSingleBtn      = document.getElementById('frag-rescue-close-btn');
  const stepPrompt          = document.getElementById('frag-rescue-step-prompt');
  const downloadSingleBtn   = document.getElementById('frag-rescue-download-btn');
  const findSingleBtn       = document.getElementById('frag-rescue-find-btn');
  const stepSearch          = document.getElementById('frag-rescue-step-search');
  const pageUrlIn           = document.getElementById('frag-rescue-page-url');
  const cookiesIn           = document.getElementById('frag-rescue-cookies');
  const cookiesPickBtn      = document.getElementById('frag-rescue-cookies-pick');
  const statusEl            = document.getElementById('frag-rescue-status');
  const backBtn             = document.getElementById('frag-rescue-back-btn');
  const fallbackBtn         = document.getElementById('frag-rescue-fallback-btn');
  const searchBtn           = document.getElementById('frag-rescue-search-btn');
  const stepResults         = document.getElementById('frag-rescue-step-results');
  const candidatesList      = document.getElementById('frag-rescue-candidates-list');
  const retryBtn            = document.getElementById('frag-rescue-retry-btn');
  const resultsDlBtn        = document.getElementById('frag-rescue-results-download-btn');

  // DOM Elements - Batch Modal
  const modalBatch          = document.getElementById('batch-fragment-modal');
  const closeBatchBtn       = document.getElementById('batch-frag-close-btn');
  const batchItemsList      = document.getElementById('batch-frag-items-list');
  const batchCancelBtn      = document.getElementById('batch-frag-cancel-btn');
  const batchSkipAllBtn     = document.getElementById('batch-frag-skip-all-btn');
  const batchStartBtn       = document.getElementById('batch-frag-start-btn');

  let singleCallbacks = null;
  let batchCallbacks = null;
  let batchState = [];

  // Wire Single Modal close / dismiss
  function closeSingleModal() {
    if (modalSingle) modalSingle.style.display = 'none';
    singleCallbacks = null;
  }

  if (closeSingleBtn) closeSingleBtn.addEventListener('click', closeSingleModal);
  if (modalSingle) {
    modalSingle.addEventListener('click', (e) => {
      if (e.target === modalSingle) closeSingleModal();
    });
  }

  if (cookiesPickBtn && cookiesIn) {
    cookiesPickBtn.addEventListener('click', async () => {
      if (window.api && window.api.pickFile) {
        const file = await window.api.pickFile();
        if (file) cookiesIn.value = file;
      }
    });
  }

  if (downloadSingleBtn) {
    downloadSingleBtn.addEventListener('click', () => {
      const cb = singleCallbacks?.onProceedWithFragment;
      closeSingleModal();
      if (cb) cb();
    });
  }

  if (fallbackBtn) {
    fallbackBtn.addEventListener('click', () => {
      const cb = singleCallbacks?.onProceedWithFragment;
      closeSingleModal();
      if (cb) cb();
    });
  }

  if (resultsDlBtn) {
    resultsDlBtn.addEventListener('click', () => {
      const cb = singleCallbacks?.onProceedWithFragment;
      closeSingleModal();
      if (cb) cb();
    });
  }

  if (findSingleBtn) {
    findSingleBtn.addEventListener('click', () => {
      if (stepPrompt) stepPrompt.style.display = 'none';
      if (stepResults) stepResults.style.display = 'none';
      if (stepSearch) stepSearch.style.display = 'block';
      if (statusEl) {
        statusEl.textContent = '';
        statusEl.style.color = 'var(--text-muted)';
      }
      if (fallbackBtn) fallbackBtn.style.display = 'none';
      if (searchBtn) {
        searchBtn.disabled = false;
        searchBtn.textContent = 'Search';
      }
      if (pageUrlIn) pageUrlIn.focus();
    });
  }

  if (backBtn) {
    backBtn.addEventListener('click', () => {
      if (stepSearch) stepSearch.style.display = 'none';
      if (stepResults) stepResults.style.display = 'none';
      if (stepPrompt) stepPrompt.style.display = 'block';
    });
  }

  if (retryBtn) {
    retryBtn.addEventListener('click', () => {
      if (stepResults) stepResults.style.display = 'none';
      if (stepSearch) stepSearch.style.display = 'block';
      if (statusEl) {
        statusEl.textContent = '';
        statusEl.style.color = 'var(--text-muted)';
      }
      if (searchBtn) {
        searchBtn.disabled = false;
        searchBtn.textContent = 'Search';
      }
      if (pageUrlIn) pageUrlIn.focus();
    });
  }

  if (searchBtn) {
    searchBtn.addEventListener('click', async () => {
      const pageUrl = pageUrlIn ? pageUrlIn.value.trim() : '';
      if (!pageUrl) {
        if (statusEl) {
          statusEl.textContent = '⚠ Please enter the watch / embed page URL.';
          statusEl.style.color = '#ff6b6b';
        }
        return;
      }

      const cookiesPath = cookiesIn ? cookiesIn.value.trim() : '';
      if (statusEl) {
        statusEl.textContent = '⏳ Sniffing network requests for master manifests (up to 12s)...';
        statusEl.style.color = 'var(--accent, #6366f1)';
      }
      searchBtn.disabled = true;
      searchBtn.textContent = 'Searching…';
      if (fallbackBtn) fallbackBtn.style.display = 'none';

      try {
        const res = await window.api.sniffManifest({
          pageUrl,
          cookiesPath,
          timeoutMs: 12000
        });

        const candidates = (res && res.candidates) || [];
        if (candidates.length > 0) {
          renderCandidatesList(candidates);
          if (stepSearch) stepSearch.style.display = 'none';
          if (stepResults) stepResults.style.display = 'block';
        } else {
          if (statusEl) {
            statusEl.textContent = "✖ Couldn't detect a manifest from that page within 12s.";
            statusEl.style.color = '#ff6b6b';
          }
          if (fallbackBtn) fallbackBtn.style.display = 'inline-block';
          searchBtn.disabled = false;
          searchBtn.textContent = 'Retry';
        }
      } catch (err) {
        if (statusEl) {
          statusEl.textContent = `✖ Sniffing failed: ${err.message || 'Unknown error'}`;
          statusEl.style.color = '#ff6b6b';
        }
        if (fallbackBtn) fallbackBtn.style.display = 'inline-block';
        searchBtn.disabled = false;
        searchBtn.textContent = 'Retry';
      }
    });
  }

  function renderCandidatesList(candidates) {
    if (!candidatesList) return;
    candidatesList.innerHTML = '';
    candidates.forEach((cand) => {
      const item = document.createElement('div');
      const isMaster = !!cand.isMaster;
      item.style.cssText = `display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 12px 14px; background: var(--bg-elevated); border: 1px solid ${isMaster ? 'rgba(34, 197, 94, 0.4)' : 'var(--border)'}; border-radius: 8px; margin-bottom: 8px; ${isMaster ? 'box-shadow: 0 0 10px rgba(34, 197, 94, 0.08);' : ''}`;

      const left = document.createElement('div');
      left.style.cssText = 'overflow: hidden; flex: 1; display: flex; flex-direction: column; gap: 4px;';

      const tagRow = document.createElement('div');
      tagRow.style.cssText = 'display: flex; align-items: center; flex-wrap: wrap; gap: 6px;';

      const isM3u8 = cand.url.includes('.m3u8') || (cand.contentTypeHint && cand.contentTypeHint.includes('mpegurl'));
      const formatBadge = document.createElement('span');
      formatBadge.textContent = isM3u8 ? 'HLS (.m3u8)' : 'DASH (.mpd)';
      formatBadge.style.cssText = 'font-size: 10px; font-weight: 600; padding: 2px 6px; border-radius: 4px; background: rgba(99, 102, 241, 0.2); color: var(--accent);';
      tagRow.appendChild(formatBadge);

      if (isMaster) {
        const masterBadge = document.createElement('span');
        masterBadge.textContent = cand.resolutionLabel ? `⭐ Master: ${cand.resolutionLabel}` : '⭐ Master Playlist (All Qualities)';
        masterBadge.style.cssText = 'font-size: 10px; font-weight: 700; padding: 2px 7px; border-radius: 4px; background: rgba(34, 197, 94, 0.2); color: #22c55e; border: 1px solid rgba(34, 197, 94, 0.3);';
        tagRow.appendChild(masterBadge);
      } else {
        const subBadge = document.createElement('span');
        subBadge.textContent = cand.resolutionLabel ? `Sub-Stream (${cand.resolutionLabel})` : 'Single-Quality Sub-Stream';
        subBadge.style.cssText = 'font-size: 10px; font-weight: 500; padding: 2px 6px; border-radius: 4px; background: rgba(148, 163, 184, 0.15); color: var(--text-muted);';
        tagRow.appendChild(subBadge);

        const warnBadge = document.createElement('span');
        warnBadge.textContent = '⚠ Single quality only';
        warnBadge.style.cssText = 'font-size: 10px; font-style: italic; color: #f59e0b;';
        tagRow.appendChild(warnBadge);
      }

      const urlSpan = document.createElement('div');
      urlSpan.textContent = cand.url;
      urlSpan.title = cand.url;
      urlSpan.style.cssText = 'font-size: 11px; font-family: var(--font-mono); color: var(--text); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;';

      left.appendChild(tagRow);
      left.appendChild(urlSpan);

      // Right side actions & resolution badge (styled like IA uploader sortable-item-size)
      const right = document.createElement('div');
      right.style.cssText = 'display: flex; align-items: center; gap: 8px; flex-shrink: 0;';

      const badgeText = cand.resolutionBadgeText || (isMaster ? '⭐ Master' : 'Single Rendition');
      const resBadge = document.createElement('span');
      resBadge.className = `manifest-res-badge ${isMaster ? 'is-master' : 'is-substream'} ${cand.isConfident ? 'is-confident' : ''}`;
      resBadge.textContent = badgeText;
      resBadge.title = cand.isConfident
        ? `Detected Resolution: ${badgeText}`
        : 'Detected Stream Quality';
      right.appendChild(resBadge);

      const useBtn = document.createElement('button');
      useBtn.type = 'button';
      useBtn.className = isMaster ? 'btn btn-primary' : 'btn-substream';
      useBtn.textContent = isMaster ? 'Use Master (Recommended)' : 'Use Sub-Stream';
      useBtn.style.cssText = `font-size: 12px; font-weight: 600; padding: 7px 16px; min-width: 185px; min-height: 32px; justify-content: center; text-align: center; white-space: nowrap; flex-shrink: 0; ${isMaster ? 'box-shadow: 0 2px 8px var(--accent-glow);' : ''}`;
      useBtn.addEventListener('click', () => {
        const cb = singleCallbacks?.onManifestChosen;
        closeSingleModal();
        if (cb) cb(cand.url);
      });

      right.appendChild(useBtn);

      item.appendChild(left);
      item.appendChild(right);
      candidatesList.appendChild(item);
    });
  }

  /**
   * Prompts the user when a single-URL tool encounters a fragment URL.
   */
  function promptFragmentRescue({ originalUrl, cookiesPath, onProceedWithFragment, onManifestChosen }) {
    const isFragment = isFragmentUrl(originalUrl);
    const isOptIn = typeof getSetting === 'function' && getSetting('detect-fragment-manifests');

    if (!isFragment || !isOptIn) {
      onProceedWithFragment(isFragment);
      return;
    }

    singleCallbacks = { onProceedWithFragment, onManifestChosen };

    if (pageUrlIn) pageUrlIn.value = '';
    if (cookiesIn) cookiesIn.value = cookiesPath || '';
    if (stepPrompt) stepPrompt.style.display = 'block';
    if (stepSearch) stepSearch.style.display = 'none';
    if (stepResults) stepResults.style.display = 'none';
    if (modalSingle) modalSingle.style.display = 'flex';
  }

  // ── Consolidated Batch Modal Logic ────────────────────────────
  function closeBatchModal() {
    if (modalBatch) modalBatch.style.display = 'none';
    batchCallbacks = null;
    batchState = [];
  }

  if (closeBatchBtn) closeBatchBtn.addEventListener('click', closeBatchModal);
  if (batchCancelBtn) batchCancelBtn.addEventListener('click', closeBatchModal);
  if (modalBatch) {
    modalBatch.addEventListener('click', (e) => {
      if (e.target === modalBatch) closeBatchModal();
    });
  }

  if (batchSkipAllBtn) {
    batchSkipAllBtn.addEventListener('click', () => {
      if (!batchCallbacks) return;
      const { originalUrls, onProceed } = batchCallbacks;
      closeBatchModal();
      onProceed(originalUrls);
    });
  }

  if (batchStartBtn) {
    batchStartBtn.addEventListener('click', () => {
      if (!batchCallbacks) return;
      const { originalUrls, onProceed } = batchCallbacks;
      const updated = originalUrls.map(url => {
        const found = batchState.find(s => s.originalUrl === url);
        return (found && found.resolvedUrl) ? found.resolvedUrl : url;
      });
      closeBatchModal();
      onProceed(updated);
    });
  }

  function renderBatchModalItems() {
    if (!batchItemsList) return;
    batchItemsList.innerHTML = '';

    batchState.forEach((item, index) => {
      const row = document.createElement('div');
      row.style.cssText = 'background: var(--bg-elevated); border: 1px solid var(--border); border-radius: 8px; padding: 12px; display: flex; flex-direction: column; gap: 8px;';

      const topRow = document.createElement('div');
      topRow.style.cssText = 'display: flex; align-items: center; justify-content: space-between; gap: 10px;';

      const titleSpan = document.createElement('div');
      titleSpan.style.cssText = 'font-size: 12px; font-weight: 600; color: var(--text); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex: 1;';
      titleSpan.textContent = `#${index + 1}: ${item.originalUrl}`;
      titleSpan.title = item.originalUrl;

      const statusBadge = document.createElement('span');
      statusBadge.style.cssText = 'font-size: 11px; padding: 2px 8px; border-radius: 4px; flex-shrink: 0;';
      if (item.resolvedUrl) {
        statusBadge.textContent = '✔ Manifest Replaced';
        statusBadge.style.background = 'rgba(34, 197, 94, 0.2)';
        statusBadge.style.color = '#22c55e';
      } else if (item.isSkipped) {
        statusBadge.textContent = 'Fragment (As-Is)';
        statusBadge.style.background = 'rgba(234, 179, 8, 0.2)';
        statusBadge.style.color = '#eab308';
      } else {
        statusBadge.textContent = 'Fragment URL';
        statusBadge.style.background = 'rgba(99, 102, 241, 0.2)';
        statusBadge.style.color = 'var(--accent)';
      }

      topRow.appendChild(titleSpan);
      topRow.appendChild(statusBadge);
      row.appendChild(topRow);

      if (!item.resolvedUrl) {
        const inputRow = document.createElement('div');
        inputRow.style.cssText = 'display: flex; gap: 8px; align-items: center;';

        const pageIn = document.createElement('input');
        pageIn.type = 'text';
        pageIn.className = 'form-input';
        pageIn.placeholder = 'Paste watch / embed page URL...';
        pageIn.style.cssText = 'font-size: 11px; flex: 1; font-family: var(--font-mono);';
        pageIn.value = item.pageUrl || '';
        pageIn.addEventListener('input', () => { item.pageUrl = pageIn.value.trim(); });

        const sniffBtn = document.createElement('button');
        sniffBtn.type = 'button';
        sniffBtn.className = 'btn btn-primary';
        sniffBtn.textContent = 'Find Manifest';
        sniffBtn.style.cssText = 'font-size: 11px; padding: 4px 10px; white-space: nowrap;';

        const msgRow = document.createElement('div');
        msgRow.style.cssText = 'font-size: 11px; color: var(--text-muted); display: none;';

        sniffBtn.addEventListener('click', async () => {
          if (!item.pageUrl) {
            msgRow.textContent = '⚠ Please enter page URL first.';
            msgRow.style.color = '#ff6b6b';
            msgRow.style.display = 'block';
            return;
          }
          sniffBtn.disabled = true;
          sniffBtn.textContent = 'Sniffing…';
          msgRow.textContent = '⏳ Sniffing network requests (up to 12s)...';
          msgRow.style.color = 'var(--accent)';
          msgRow.style.display = 'block';

          try {
            const res = await window.api.sniffManifest({
              pageUrl: item.pageUrl,
              cookiesPath: item.cookiesPath || '',
              timeoutMs: 12000
            });
            const candidates = (res && res.candidates) || [];
            if (candidates.length > 0) {
              item.resolvedUrl = candidates[0].url;
              item.resolutionBadgeText = candidates[0].resolutionBadgeText;
              item.isMaster = candidates[0].isMaster;
              renderBatchModalItems();
            } else {
              msgRow.textContent = "✖ Couldn't detect manifest from that page.";
              msgRow.style.color = '#ff6b6b';
              sniffBtn.disabled = false;
              sniffBtn.textContent = 'Retry';
            }
          } catch (err) {
            msgRow.textContent = `✖ Error: ${err.message || 'Sniffing failed'}`;
            msgRow.style.color = '#ff6b6b';
            sniffBtn.disabled = false;
            sniffBtn.textContent = 'Retry';
          }
        });

        inputRow.appendChild(pageIn);
        inputRow.appendChild(sniffBtn);
        row.appendChild(inputRow);
        row.appendChild(msgRow);
      } else {
        const resWrap = document.createElement('div');
        resWrap.style.cssText = 'display: flex; align-items: center; justify-content: space-between; gap: 8px;';

        const resolvedText = document.createElement('div');
        resolvedText.style.cssText = 'font-size: 11px; font-family: var(--font-mono); color: #22c55e; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex: 1;';
        resolvedText.textContent = `↳ ${item.resolvedUrl}`;
        resWrap.appendChild(resolvedText);

        if (item.resolutionBadgeText) {
          const resBadge = document.createElement('span');
          resBadge.className = `manifest-res-badge ${item.isMaster ? 'is-master' : 'is-substream'} is-confident`;
          resBadge.textContent = item.resolutionBadgeText;
          resWrap.appendChild(resBadge);
        }

        row.appendChild(resWrap);
      }

      batchItemsList.appendChild(row);
    });
  }

  /**
   * Pre-scans batch queue for fragment URLs and shows consolidated dialog if opt-in is enabled.
   */
  function handleBatchFragmentCheck({ urls, cookiesPath, onProceed }) {
    const isOptIn = typeof getSetting === 'function' && getSetting('detect-fragment-manifests');
    const fragmentList = urls.filter(isFragmentUrl);

    if (!isOptIn || fragmentList.length === 0) {
      onProceed(urls);
      return;
    }

    batchCallbacks = { originalUrls: urls, onProceed };
    batchState = fragmentList.map(url => ({
      originalUrl: url,
      pageUrl: '',
      cookiesPath: cookiesPath || '',
      resolvedUrl: null,
      isSkipped: false
    }));

    renderBatchModalItems();
    if (modalBatch) modalBatch.style.display = 'flex';
  }

  // Export to window
  window.NyxFragmentRescue = {
    isFragmentUrl,
    FRAGMENT_NOTICE_TEXT,
    promptFragmentRescue,
    handleBatchFragmentCheck
  };
})();
