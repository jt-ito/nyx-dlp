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
        historyList.innerHTML = '<div style="padding: 24px; text-align: center; color: var(--text-muted);">No history found. Jobs will appear here when they finish successfully.</div>';
        return;
      }
      
      historyList.innerHTML = '';
      
      history.forEach(item => {
        const el = document.createElement('div');
        el.style.background = 'var(--bg-elevated)';
        el.style.border = '1px solid var(--border)';
        el.style.borderRadius = '6px';
        el.style.padding = '12px 16px';
        el.style.display = 'flex';
        el.style.flexDirection = 'column';
        el.style.gap = '6px';
        
        let statusBadge = '';
        if (item.status === 'partial') {
          statusBadge = `<span style="display: inline-block; padding: 2px 6px; font-size: 11px; font-weight: 600; border-radius: 4px; background: var(--terminal-warning); color: var(--bg-body); margin-left: 8px;">PARTIAL</span>`;
        } else {
          statusBadge = `<span style="display: inline-block; padding: 2px 6px; font-size: 11px; font-weight: 600; border-radius: 4px; background: var(--terminal-success); color: var(--bg-body); margin-left: 8px;">SUCCESS</span>`;
        }
        
        el.innerHTML = `
          <div style="display: flex; justify-content: space-between; align-items: flex-start;">
            <div style="font-weight: 600; color: var(--text); display: flex; align-items: center;">
              ${item.tool} ${statusBadge}
            </div>
            <div style="font-size: 12px; color: var(--text-muted);">${formatDate(item.date)}</div>
          </div>
          <div style="font-size: 13px; color: var(--text); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${item.source}">
            <span style="color: var(--text-subtle); margin-right: 4px;">Source:</span> ${item.source}
          </div>
          <div style="font-size: 13px; color: var(--text); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${item.output}">
            <span style="color: var(--text-subtle); margin-right: 4px;">Output:</span> ${item.output}
          </div>
        `;
        
        historyList.appendChild(el);
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
