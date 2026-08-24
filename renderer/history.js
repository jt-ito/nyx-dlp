/* ── History UI ────────────────────────────────────────────── */
(function() {
  const historyList = document.getElementById('history-list');
  const clearBtn = document.getElementById('history-clear');

  function formatDate(isoString) {
    const d = new Date(isoString);
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

  async function loadHistory() {
    if (!window.api.getHistory || !historyList) return;
    
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
      
      if (!history || history.length === 0) {
        historyList.innerHTML = '<div style="padding: 32px; text-align: center; color: var(--text-muted); font-size: 13px;">No history found. Jobs will appear here when they finish successfully.</div>';
        return;
      }
      
      historyList.innerHTML = '';
      
      history.forEach((item) => {
        const wrap = document.createElement('div');
        wrap.className = 'history-card-wrap';
        wrap.dataset.id = item.id || item.date;

        let statusBadge = '';
        if (item.status === 'partial') {
          statusBadge = `<span style="display: inline-block; padding: 2px 6px; font-size: 11px; font-weight: 600; border-radius: 4px; background: var(--terminal-warning); color: var(--bg-body); margin-left: 8px;">PARTIAL</span>`;
        } else if (item.status === 'failed') {
          statusBadge = `<span style="display: inline-block; padding: 2px 6px; font-size: 11px; font-weight: 600; border-radius: 4px; background: var(--danger); color: #fff; margin-left: 8px;">FAILED</span>`;
        } else if (item.status === 'running') {
          statusBadge = `<span style="display: inline-block; padding: 2px 6px; font-size: 11px; font-weight: 600; border-radius: 4px; background: var(--accent); color: #fff; margin-left: 8px;">RUNNING</span>`;
        } else {
          statusBadge = `<span style="display: inline-block; padding: 2px 6px; font-size: 11px; font-weight: 600; border-radius: 4px; background: var(--terminal-success); color: var(--bg-body); margin-left: 8px;">SUCCESS</span>`;
        }

        const nameHtml = item.name ? `
          <div style="font-size: 13px; font-weight: 600; color: var(--accent); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; display: flex; align-items: center; gap: 6px; margin: 1px 0;" title="${item.name}">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" style="flex-shrink:0;"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            <span style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${item.name}</span>
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
                ${item.tool} ${statusBadge}
              </div>
              <div style="display: flex; align-items: center; gap: 8px;">
                ${fillBtnHtml}
                <div style="font-size: 11.5px; color: var(--text-muted); white-space: nowrap;">${formatDate(item.date)}</div>
              </div>
            </div>
            ${nameHtml}
            <div style="font-size: 12px; color: var(--text); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${item.source}">
              <span style="color: var(--text-subtle); margin-right: 4px;">Source:</span> ${item.source}
            </div>
            <div style="font-size: 12px; color: var(--text-muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${item.output}">
              <span style="color: var(--text-subtle); margin-right: 4px;">Output:</span> ${item.output}
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

        const trigger = wrap.querySelector('.history-right-trigger');
        const delContainer = wrap.querySelector('.history-delete-container');

        const setHover = (val) => wrap.classList.toggle('hover-right', val);

        if (trigger) {
          trigger.addEventListener('mouseenter', () => setHover(true));
          trigger.addEventListener('mouseleave', (e) => {
            if (!delContainer || !delContainer.contains(e.relatedTarget)) setHover(false);
          });
        }
        if (delContainer) {
          delContainer.addEventListener('mouseenter', () => setHover(true));
          delContainer.addEventListener('mouseleave', (e) => {
            if (!trigger || !trigger.contains(e.relatedTarget)) setHover(false);
          });
        }

        const fillBtn = wrap.querySelector('.history-fill-btn');
        if (fillBtn && item.uploadData) {
          fillBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (window.fillIaUploadForm) {
              window.fillIaUploadForm(item.uploadData);
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
          });
        }

        const deleteBtn = wrap.querySelector('.history-delete-btn');
        if (deleteBtn) {
          deleteBtn.addEventListener('click', async (e) => {
            e.stopPropagation();
            wrap.classList.add('deleting');
            setTimeout(async () => {
              wrap.remove();
              if (historyList.children.length === 0) {
                historyList.innerHTML = '<div style="padding: 32px; text-align: center; color: var(--text-muted); font-size: 13px;">No history found. Jobs will appear here when they finish successfully.</div>';
              }
              if (window.api.deleteHistoryItem) {
                await window.api.deleteHistoryItem(item.id || item.date);
              }
            }, 220);
          });
        }

        historyList.appendChild(wrap);
      });
    } catch (e) {
      console.error('Failed to load history', e);
    }
  }

  const retentionEl = document.getElementById('history-retention');
  if (retentionEl) {
    retentionEl.addEventListener('change', () => {
      loadHistory();
    });
  }

  if (clearBtn) {
    clearBtn.addEventListener('click', async () => {
      if (confirm('Are you sure you want to clear your download history? This cannot be undone.')) {
        await window.api.clearHistory();
        loadHistory();
      }
    });
  }

  // Reload history when the tab is clicked
  document.querySelectorAll('.nav-item').forEach(btn => {
    btn.addEventListener('click', () => {
      if (btn.dataset.tab === 'history') {
        loadHistory();
      }
    });
  });

  // Expose for terminal.js to call after adding a new item
  window._refreshHistory = loadHistory;
  
  // Initial load
  loadHistory();
})();

