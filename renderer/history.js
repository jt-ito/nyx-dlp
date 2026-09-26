/* ── History UI ────────────────────────────────────────────── */
(function() {
  const historyList = document.getElementById('history-list');
  const clearBtn = document.getElementById('history-clear');

  const PAGE_SIZE = 40;
  let allFilteredHistory = [];
  let currentRenderedCount = 0;
  let isHistoryDirty = true;
  let loadMoreBtn = null;
  let intersectionObserver = null;

  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function formatDate(isoString) {
    if (!isoString) return '';
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return String(isoString);
    const today = new Date();
    
    // Check if it's today
    if (d.getDate() === today.getDate() && 
        d.getMonth() === today.getMonth() && 
        d.getFullYear() === today.getFullYear()) {
      return `Today, ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    }
    
    return `${d.toLocaleDateString()} ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
  }

  function shouldRecordHistory(entry) {
    if (!entry) return false;
    if (typeof getSetting === 'function' && getSetting('save-history') === false) return false;

    const tool = (entry.tool || '').toLowerCase();
    if (typeof getSetting === 'function') {
      if (tool.includes('yt-dlp') && getSetting('history-exclude-ytdlp')) return false;
      if (tool.includes('batch') && getSetting('history-exclude-batch')) return false;
      if ((tool.includes('live') || tool.includes('stream')) && getSetting('history-exclude-livestream')) return false;
      if (tool.includes('m3u8') && getSetting('history-exclude-m3u8')) return false;
      if (tool.includes('gallery') && getSetting('history-exclude-gallery')) return false;
      if (tool.includes('splitter') && getSetting('history-exclude-splitter')) return false;
      if (tool.includes('concat') && getSetting('history-exclude-concatenator')) return false;
      if (tool.includes('encoder') && getSetting('history-exclude-encoder')) return false;
      if ((tool.includes('internet archive') || tool.includes('ia')) && getSetting('history-exclude-ia')) return false;
    }

    const excludeSitesStr = (localStorage.getItem('field:history-exclude-sites') || document.getElementById('history-exclude-sites')?.value || '').trim();
    if (excludeSitesStr) {
      const excludeSites = excludeSitesStr.split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
      const sourceStr = (entry.source || '').toLowerCase();
      const nameStr = (entry.name || '').toLowerCase();
      const outputStr = (entry.output || '').toLowerCase();

      for (const site of excludeSites) {
        const cleanSite = site.replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/.*$/, '');
        if (cleanSite && (sourceStr.includes(cleanSite) || nameStr.includes(cleanSite) || outputStr.includes(cleanSite))) {
          return false;
        }
      }
    }

    return true;
  }
  window.shouldRecordHistory = shouldRecordHistory;

  function createCardElement(item) {
    const wrap = document.createElement('div');
    wrap.className = 'history-card-wrap';
    wrap.dataset.id = item.id || item.date || '';
    if (item.uploadData) {
      wrap._uploadData = item.uploadData;
    }

    let statusBadge = '';
    const isToolActuallyRunning = typeof runningTools !== 'undefined' && item.tool && runningTools.has(item.tool);
    if (item.status === 'partial') {
      statusBadge = `<span style="display: inline-block; padding: 2px 6px; font-size: 11px; font-weight: 600; border-radius: 4px; background: var(--terminal-warning); color: var(--bg-body); margin-left: 8px;">PARTIAL</span>`;
    } else if (item.status === 'failed') {
      statusBadge = `<span style="display: inline-block; padding: 2px 6px; font-size: 11px; font-weight: 600; border-radius: 4px; background: var(--danger); color: #fff; margin-left: 8px;">FAILED</span>`;
    } else if (item.status === 'stopped') {
      statusBadge = `<span style="display: inline-block; padding: 2px 6px; font-size: 11px; font-weight: 600; border-radius: 4px; background: var(--border); color: var(--text-muted); margin-left: 8px;">STOPPED</span>`;
    } else if (item.status === 'running') {
      if (isToolActuallyRunning) {
        statusBadge = `<span style="display: inline-block; padding: 2px 6px; font-size: 11px; font-weight: 600; border-radius: 4px; background: var(--accent); color: #fff; margin-left: 8px;">RUNNING</span>`;
      } else {
        statusBadge = `<span style="display: inline-block; padding: 2px 6px; font-size: 11px; font-weight: 600; border-radius: 4px; background: var(--border); color: var(--text-muted); margin-left: 8px;">STOPPED</span>`;
      }
    } else {
      statusBadge = `<span style="display: inline-block; padding: 2px 6px; font-size: 11px; font-weight: 600; border-radius: 4px; background: var(--terminal-success); color: var(--bg-body); margin-left: 8px;">SUCCESS</span>`;
    }

    const nameHtml = item.name ? `
      <div style="font-size: 13px; font-weight: 600; color: var(--accent); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; display: flex; align-items: center; gap: 6px; margin: 1px 0;" title="${escapeHtml(item.name)}">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" style="flex-shrink:0;"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
        <span style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${escapeHtml(item.name)}</span>
      </div>
    ` : '';

    const fillBtnHtml = item.uploadData ? `
      <button type="button" class="history-fill-btn" title="Auto-fill this upload metadata and files into Internet Archive tool">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
          <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
        </svg>
        <span>Fill Form</span>
      </button>
    ` : '';

    wrap.innerHTML = `
      <div class="history-card-body">
        <div style="display: flex; justify-content: space-between; align-items: center; gap: 8px;">
          <div style="font-weight: 600; color: var(--text); display: flex; align-items: center; flex-wrap: wrap; gap: 4px;">
            ${escapeHtml(item.tool || 'Download')} ${statusBadge}
          </div>
          <div style="display: flex; align-items: center; gap: 8px;">
            ${fillBtnHtml}
            <div style="font-size: 11.5px; color: var(--text-muted); white-space: nowrap;">${formatDate(item.date)}</div>
          </div>
        </div>
        ${nameHtml}
        <div style="font-size: 12px; color: var(--text); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${escapeHtml(item.source || '')}">
          <span style="color: var(--text-subtle); margin-right: 4px;">Source:</span> ${escapeHtml(item.source || '')}
        </div>
        <div style="font-size: 12px; color: var(--text-muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${escapeHtml(item.output || '')}">
          <span style="color: var(--text-subtle); margin-right: 4px;">Output:</span> ${escapeHtml(item.output || '')}
        </div>
      </div>
      <div class="history-right-trigger"></div>
      <div class="history-delete-container">
        <button type="button" class="history-delete-btn" title="Delete this entry">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>
      </div>
    `;

    return wrap;
  }

  function renderNextBatch() {
    if (!historyList || currentRenderedCount >= allFilteredHistory.length) {
      if (loadMoreBtn) {
        if (intersectionObserver) intersectionObserver.unobserve(loadMoreBtn);
        loadMoreBtn.remove();
        loadMoreBtn = null;
      }
      return;
    }

    if (loadMoreBtn) {
      if (intersectionObserver) intersectionObserver.unobserve(loadMoreBtn);
      loadMoreBtn.remove();
      loadMoreBtn = null;
    }

    const fragment = document.createDocumentFragment();
    const nextCount = Math.min(currentRenderedCount + PAGE_SIZE, allFilteredHistory.length);

    for (let i = currentRenderedCount; i < nextCount; i++) {
      fragment.appendChild(createCardElement(allFilteredHistory[i]));
    }
    currentRenderedCount = nextCount;

    historyList.appendChild(fragment);

    if (currentRenderedCount < allFilteredHistory.length) {
      const remaining = allFilteredHistory.length - currentRenderedCount;
      loadMoreBtn = document.createElement('button');
      loadMoreBtn.className = 'btn btn-ghost history-load-more-btn';
      loadMoreBtn.style.cssText = 'align-self: center; margin: 16px 0; padding: 8px 22px; font-size: 12px; font-weight: 600; border-radius: 6px; border: 1px solid var(--border); color: var(--text-muted); cursor: pointer;';
      loadMoreBtn.textContent = `Load More (${remaining} remaining)`;
      loadMoreBtn.addEventListener('click', () => {
        renderNextBatch();
      });
      historyList.appendChild(loadMoreBtn);

      if (!intersectionObserver && typeof IntersectionObserver !== 'undefined') {
        const scrollRoot = document.querySelector('.content');
        intersectionObserver = new IntersectionObserver((entries) => {
          if (entries[0] && entries[0].isIntersecting) {
            renderNextBatch();
          }
        }, { root: scrollRoot || null, rootMargin: '300px' });
      }

      if (intersectionObserver && loadMoreBtn) {
        intersectionObserver.observe(loadMoreBtn);
      }
    }
  }

  async function loadHistory(force = false) {
    if (!window.api || !window.api.getHistory || !historyList) return;
    
    // If cache is clean and already rendered, do nothing (instant 0ms tab switch!)
    if (!force && !isHistoryDirty && currentRenderedCount > 0) {
      return;
    }

    try {
      let history = await window.api.getHistory();
      
      const retentionVal = localStorage.getItem('field:history-retention') || document.getElementById('history-retention')?.value || 'never';
      const days = parseInt(retentionVal, 10);
      if (!isNaN(days) && days > 0 && Array.isArray(history)) {
        const cutoffTime = Date.now() - (days * 24 * 60 * 60 * 1000);
        history = history.filter(item => {
          if (!item.date) return true;
          const itemTime = new Date(item.date).getTime();
          return isNaN(itemTime) || itemTime >= cutoffTime;
        });
      }
      
      allFilteredHistory = Array.isArray(history) ? history : [];
      isHistoryDirty = false;
      currentRenderedCount = 0;

      if (loadMoreBtn && intersectionObserver) {
        intersectionObserver.unobserve(loadMoreBtn);
      }
      loadMoreBtn = null;

      if (allFilteredHistory.length === 0) {
        historyList.innerHTML = '<div style="padding: 32px; text-align: center; color: var(--text-muted); font-size: 13px;">No history found. Jobs will appear here when they finish successfully.</div>';
        return;
      }
      
      historyList.innerHTML = '';
      renderNextBatch();
    } catch (e) {
      console.error('Failed to load history', e);
    }
  }

  // Event Delegation for History List actions (Delete & Fill Form)
  if (historyList) {
    historyList.addEventListener('click', async (e) => {
      const delBtn = e.target.closest('.history-delete-btn');
      if (delBtn) {
        e.stopPropagation();
        const wrap = delBtn.closest('.history-card-wrap');
        if (!wrap) return;
        const itemId = wrap.dataset.id;
        wrap.classList.add('deleting');
        setTimeout(async () => {
          wrap.remove();
          if (historyList.querySelectorAll('.history-card-wrap').length === 0) {
            historyList.innerHTML = '<div style="padding: 32px; text-align: center; color: var(--text-muted); font-size: 13px;">No history found. Jobs will appear here when they finish successfully.</div>';
          }
          if (window.api && window.api.deleteHistoryItem && itemId) {
            await window.api.deleteHistoryItem(itemId);
          }
          allFilteredHistory = allFilteredHistory.filter(h => (h.id || h.date) !== itemId);
        }, 220);
        return;
      }

      const fillBtn = e.target.closest('.history-fill-btn');
      if (fillBtn) {
        e.stopPropagation();
        const wrap = fillBtn.closest('.history-card-wrap');
        if (!wrap || !wrap._uploadData) return;
        if (window.fillIaUploadForm) {
          window.fillIaUploadForm(wrap._uploadData);
          fillBtn.classList.add('filled');
          fillBtn.innerHTML = `
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
              <polyline points="20 6 9 17 4 12"/>
            </svg>
            <span>Filled!</span>
          `;
          setTimeout(() => {
            fillBtn.classList.remove('filled');
            fillBtn.innerHTML = `
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
              </svg>
              <span>Fill Form</span>
            `;
          }, 1500);
        }
      }
    });
  }

  const retentionEl = document.getElementById('history-retention');
  if (retentionEl) {
    retentionEl.addEventListener('change', () => {
      loadHistory(true);
    });
  }

  if (clearBtn) {
    clearBtn.addEventListener('click', async () => {
      if (confirm('Are you sure you want to clear your download history? This cannot be undone.')) {
        await window.api.clearHistory();
        loadHistory(true);
      }
    });
  }

  // Reload history when the tab is clicked, with cache-dirty check
  document.querySelectorAll('.nav-item').forEach(btn => {
    btn.addEventListener('click', () => {
      if (btn.dataset.tab === 'history') {
        loadHistory(false);
      }
    });
  });

  // Expose for terminal.js to call after adding a new item
  window._refreshHistory = () => {
    isHistoryDirty = true;
    const historyPanel = document.getElementById('tab-history');
    if (historyPanel && historyPanel.classList.contains('active')) {
      loadHistory(true);
    }
  };
  
  // Initial load
  loadHistory(true);
})();
