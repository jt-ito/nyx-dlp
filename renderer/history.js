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

  async function loadHistory() {
    if (!window.api.getHistory || !historyList) return;
    
    try {
      const history = await window.api.getHistory();
      
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
        } else {
          statusBadge = `<span style="display: inline-block; padding: 2px 6px; font-size: 11px; font-weight: 600; border-radius: 4px; background: var(--terminal-success); color: var(--bg-body); margin-left: 8px;">SUCCESS</span>`;
        }

        const nameHtml = item.name ? `
          <div style="font-size: 13px; font-weight: 600; color: var(--accent); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; display: flex; align-items: center; gap: 6px; margin: 1px 0;" title="${item.name}">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" style="flex-shrink:0;"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            <span style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${item.name}</span>
          </div>
        ` : '';

        wrap.innerHTML = `
          <div class="history-card-body">
            <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 8px;">
              <div style="font-weight: 600; color: var(--text); display: flex; align-items: center;">
                ${item.tool} ${statusBadge}
              </div>
              <div style="font-size: 11.5px; color: var(--text-muted); white-space: nowrap;">${formatDate(item.date)}</div>
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

