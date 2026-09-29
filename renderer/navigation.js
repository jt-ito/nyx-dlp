/* ── Window Controls ──────────────────────────────────────── */
document.getElementById('btnMin').addEventListener('click',   () => window.api.minimize());
document.getElementById('btnMax').addEventListener('click',   () => window.api.maximize());
document.getElementById('btnClose').addEventListener('click', () => window.api.close());

/* ── Tab Navigation ──────────────────────────────────────── */
window.switchTab = function(tabName) {
  if (!tabName) return;
  const activePanel = document.querySelector('.tab-panel.active');
  if (activePanel) {
    const contentEl = document.querySelector('.content');
    if (contentEl) activePanel._savedScroll = contentEl.scrollTop;
  }
  document.querySelectorAll('.nav-item').forEach(b => {
    b.classList.toggle('active', b.dataset.tab === tabName);
  });
  document.querySelectorAll('.tab-panel').forEach(p => {
    p.classList.toggle('active', p.id === 'tab-' + tabName);
  });
  const panel = document.getElementById('tab-' + tabName);
  if (panel) {
    if (typeof updateOptsForTab === 'function') updateOptsForTab(tabName);
    const contentEl = document.querySelector('.content');
    if (contentEl) {
      contentEl.classList.toggle('settings-mode', tabName === 'settings');
    }
    if (tabName === 'tool-hub') {
      panel._savedScroll = 0;
      if (contentEl) contentEl.scrollTop = 0;
      panel.scrollTop = 0;
    } else if (tabName === 'settings') {
      if (typeof window.switchSettingsCategory === 'function') {
        window.switchSettingsCategory('general');
      }
      panel._savedScroll = 0;
      if (contentEl) contentEl.scrollTop = 0;
      panel.scrollTop = 0;
    } else if (panel._savedScroll !== undefined) {
      if (contentEl) contentEl.scrollTop = panel._savedScroll;
    }
    panel.querySelectorAll('[data-terminal]').forEach(t => t._updateScrollBtn?.());
    // Only flush logs that are actually visible now — a background IA upload job
    // log nested in this panel but not the selected job tab stays buffered.
    panel.querySelectorAll('[data-log-el]').forEach(logEl => {
      if (typeof isLogPanelVisible === 'function' && !isLogPanelVisible(logEl)) return;
      if (typeof activateLogView === 'function') activateLogView(logEl);
    });
  }
};

document.querySelectorAll('.nav-item').forEach(btn => {
  btn.addEventListener('click', () => {
    if (btn.dataset.tab) window.switchTab(btn.dataset.tab);
  });
});

/* ── Form-level advanced section toggles ────────────────── */
document.addEventListener('click', e => {
  const btn = e.target.closest('.form-adv-toggle');
  if (!btn) return;
  const body = document.getElementById(btn.dataset.adv);
  if (!body) return;
  const open = body.classList.toggle('open');
  btn.setAttribute('aria-expanded', String(open));
});

/* ── Folder Picker ───────────────────────────────────────── */
document.querySelectorAll('.btn-folder').forEach(btn => {
  btn.addEventListener('click', async () => {
    const type = btn.dataset.pickType;
    const targetEl = document.getElementById(btn.dataset.target);
    const initVal = targetEl && targetEl.value ? targetEl.value.trim() : '';
    let res;
    if (type === 'file') {
      res = await window.api.pickFile(initVal);
    } else if (type === 'video') {
      res = await window.api.pickVideo(initVal);
    } else if (type === 'multi-file') {
      res = await window.api.pickFiles(initVal);
    } else if (type === 'multi-any-file') {
      res = await window.api.pickAnyFiles(initVal);
    } else if (type === 'multi-folders') {
      res = await window.api.pickFolders(initVal);
    } else {
      res = await window.api.pickFolder(initVal);
    }
    if (res) {
      const target = document.getElementById(btn.dataset.target);
      if (target) {
        if (target.classList.contains('sortable-list')) {
          if (type === 'multi-file' || type === 'multi-any-file' || type === 'multi-folders') {
            res.forEach(filepath => window.addSortableItem(target, filepath));
          }
        } else if (type === 'multi-file' || type === 'multi-any-file' || type === 'multi-folders') {
          const current = target.value.trim();
          target.value = current ? current + '\n' + res.join('\n') : res.join('\n');
          target.dispatchEvent(new Event('input', { bubbles: true }));
        } else {
          target.value = res;
          target.dispatchEvent(new Event('input', { bubbles: true }));
        }
      }
    }
  });
});

/* ── Sortable List Logic ─────────────────────────────────── */
window.formatFileSize = function(bytes) {
  if (!bytes || bytes <= 0 || isNaN(bytes)) return '';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return (bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 2) + ' ' + units[i];
};

window.updateSortableListState = function(container) {
  if (!container) return;
  const items = Array.from(container.querySelectorAll('.sortable-item'));
  items.forEach((item, idx) => {
    let indexBadge = item.querySelector('.sortable-item-index');
    if (!indexBadge) {
      indexBadge = document.createElement('span');
      indexBadge.className = 'sortable-item-index';
      const handle = item.querySelector('.sortable-item-handle') || item.firstElementChild;
      if (handle && handle.nextSibling) {
        item.insertBefore(indexBadge, handle.nextSibling);
      } else {
        item.insertBefore(indexBadge, item.firstChild);
      }
    }
    indexBadge.textContent = String(idx + 1);
    indexBadge.title = `Position ${idx + 1} in concatenation sequence`;
  });

  const summaryEl = document.getElementById(container.id + '-summary');
  if (summaryEl) {
    if (items.length === 0) {
      summaryEl.style.display = 'none';
      summaryEl.innerHTML = '';
    } else {
      summaryEl.style.display = 'inline-flex';
      let totalBytes = 0;
      let knownSizes = 0;
      items.forEach(el => {
        const sizeBadge = el.querySelector('.sortable-item-size');
        const b = parseInt(sizeBadge?.dataset?.bytes || '0', 10);
        if (b > 0) {
          totalBytes += b;
          knownSizes++;
        }
      });
      const sizeText = knownSizes > 0 ? ` (${window.formatFileSize(totalBytes)})` : '';
      summaryEl.innerHTML = `<span>Merge order: <strong>1 → ${items.length}</strong></span><span class="sortable-summary-divider">•</span><span>${items.length} file${items.length === 1 ? '' : 's'}${sizeText}</span>`;
    }
  }
};

window.addSortableItem = function(container, filepath) {
  const emptyState = container.querySelector('.sortable-empty-state');
  if (emptyState) emptyState.remove();

  const item = document.createElement('div');
  item.className = 'sortable-item';
  item.draggable = true;
  item.dataset.path = filepath;

  const dragHandle = document.createElement('div');
  dragHandle.className = 'sortable-item-handle';
  dragHandle.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M8 6h8M8 12h8M8 18h8" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
  dragHandle.style.cursor = 'grab';
  dragHandle.style.color = 'var(--text-subtle)';
  dragHandle.title = 'Drag to reorder merge sequence';

  const indexBadge = document.createElement('span');
  indexBadge.className = 'sortable-item-index';

  const content = document.createElement('div');
  content.className = 'sortable-item-content';
  content.title = filepath;
  const filename = filepath.split('\\').pop().split('/').pop();
  content.textContent = filename;

  const sizeBadge = document.createElement('span');
  sizeBadge.className = 'sortable-item-size';
  sizeBadge.textContent = '...';
  sizeBadge.style.display = 'none';

  const removeBtn = document.createElement('div');
  removeBtn.className = 'sortable-item-remove';
  removeBtn.title = 'Remove file';
  removeBtn.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none"><line x1="18" y1="6" x2="6" y2="18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><line x1="6" y1="6" x2="18" y2="18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
  removeBtn.onclick = () => {
    item.remove();
    if (container.children.length === 0) {
      container.innerHTML = '<div class="sortable-empty-state">No files selected. Use the browse button to add videos.</div>';
    }
    window.updateSortableListState(container);
    container.dispatchEvent(new Event('change', { bubbles: true }));
  };

  item.appendChild(dragHandle);
  item.appendChild(indexBadge);
  item.appendChild(content);
  item.appendChild(sizeBadge);
  item.appendChild(removeBtn);

  // Asynchronously query file size
  if (window.api && window.api.getFileStats) {
    window.api.getFileStats(filepath).then(stats => {
      if (stats && typeof stats.size === 'number' && stats.size > 0) {
        sizeBadge.dataset.bytes = String(stats.size);
        sizeBadge.textContent = window.formatFileSize(stats.size);
        sizeBadge.style.display = 'inline-flex';
        window.updateSortableListState(container);
      }
    }).catch(() => {});
  }

  // Setup desktop OS file drag & drop on container if not yet initialized
  const listContainer = container.closest('.sortable-list-container') || container;
  if (!listContainer._hasDropInit) {
    listContainer._hasDropInit = true;
    listContainer.addEventListener('dragover', (e) => {
      if (e.dataTransfer && e.dataTransfer.types && Array.from(e.dataTransfer.types).includes('Files')) {
        e.preventDefault();
        listContainer.classList.add('drag-over');
      }
    });
    listContainer.addEventListener('dragleave', (e) => {
      if (!listContainer.contains(e.relatedTarget)) {
        listContainer.classList.remove('drag-over');
      }
    });
    listContainer.addEventListener('drop', (e) => {
      listContainer.classList.remove('drag-over');
      if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        e.preventDefault();
        for (const f of e.dataTransfer.files) {
          if (f.path) window.addSortableItem(container, f.path);
        }
      }
    });
  }

  item.addEventListener('dragstart', (e) => {
    item.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
    window._draggingItem = item;
  });
  item.addEventListener('dragend', () => {
    item.classList.remove('dragging');
    window._draggingItem = null;
    container.querySelectorAll('.sortable-item').forEach(el => {
      el.classList.remove('drag-over-top', 'drag-over-bottom');
    });
  });
  item.addEventListener('dragover', (e) => {
    e.preventDefault();
    if (!window._draggingItem || window._draggingItem === item) return;
    const rect = item.getBoundingClientRect();
    const mid = rect.top + rect.height / 2;
    if (e.clientY < mid) {
      item.classList.add('drag-over-top');
      item.classList.remove('drag-over-bottom');
    } else {
      item.classList.add('drag-over-bottom');
      item.classList.remove('drag-over-top');
    }
  });
  item.addEventListener('dragleave', () => {
    item.classList.remove('drag-over-top', 'drag-over-bottom');
  });
  item.addEventListener('drop', (e) => {
    e.preventDefault();
    item.classList.remove('drag-over-top', 'drag-over-bottom');
    if (!window._draggingItem || window._draggingItem === item) return;
    const rect = item.getBoundingClientRect();
    const mid = rect.top + rect.height / 2;
    if (e.clientY < mid) {
      container.insertBefore(window._draggingItem, item);
    } else {
      container.insertBefore(window._draggingItem, item.nextSibling);
    }
    window.updateSortableListState(container);
    container.dispatchEvent(new Event('change', { bubbles: true }));
  });

  container.appendChild(item);
  window.updateSortableListState(container);
  container.dispatchEvent(new Event('change', { bubbles: true }));
};

/* ── Bottom-Right Path Copy Toast Notification ───────────── */
window.showPathCopiedToast = function(pathText) {
  if (!pathText) return;
  let container = document.getElementById('toast-container-bottom-right');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container-bottom-right';
    document.body.appendChild(container);
  }

  while (container.children.length >= 3) {
    container.removeChild(container.firstChild);
  }

  const toast = document.createElement('div');
  toast.className = 'path-toast';
  toast.innerHTML = `
    <div class="path-toast-icon">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <polyline points="20 6 9 17 4 12"></polyline>
      </svg>
    </div>
    <div class="path-toast-body">
      <div class="path-toast-title">
        <span>Path copied to clipboard</span>
      </div>
      <div class="path-toast-detail" title="${pathText}">${pathText}</div>
    </div>
  `;

  toast.style.cursor = 'pointer';
  toast.addEventListener('click', () => {
    toast.classList.add('fade-out');
    setTimeout(() => toast.remove(), 250);
  });

  container.appendChild(toast);

  setTimeout(() => {
    if (toast.isConnected) {
      toast.classList.add('fade-out');
      setTimeout(() => toast.remove(), 250);
    }
  }, 2800);
};

/* ── Global Notification Toast Popup ──────────────────────── */
window.showNotificationToast = function(msg, type = 'info', title = null) {
  if (!msg) return;
  let container = document.getElementById('toast-container-bottom-right');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container-bottom-right';
    document.body.appendChild(container);
  }

  while (container.children.length >= 3) {
    container.removeChild(container.firstChild);
  }

  const toast = document.createElement('div');
  toast.className = 'path-toast';

  let iconSvg = '';
  let defaultTitle = 'Notification';
  let iconBg = 'rgba(59, 130, 246, 0.15)';
  let iconColor = '#60a5fa';
  let iconBorder = 'rgba(59, 130, 246, 0.3)';

  if (type === 'success') {
    defaultTitle = 'Success';
    iconBg = 'rgba(16, 185, 129, 0.15)';
    iconColor = '#34d399';
    iconBorder = 'rgba(16, 185, 129, 0.3)';
    iconSvg = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>`;
  } else if (type === 'warning') {
    defaultTitle = 'Notice';
    iconBg = 'rgba(245, 158, 11, 0.15)';
    iconColor = '#fbbf24';
    iconBorder = 'rgba(245, 158, 11, 0.35)';
    iconSvg = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>`;
  } else if (type === 'error') {
    defaultTitle = 'Error';
    iconBg = 'rgba(239, 68, 68, 0.15)';
    iconColor = '#f87171';
    iconBorder = 'rgba(239, 68, 68, 0.35)';
    iconSvg = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>`;
  } else {
    // info
    defaultTitle = 'Status';
    iconBg = 'rgba(59, 130, 246, 0.15)';
    iconColor = '#60a5fa';
    iconBorder = 'rgba(59, 130, 246, 0.3)';
    iconSvg = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>`;
  }

  toast.innerHTML = `
    <div class="path-toast-icon" style="background: ${iconBg}; color: ${iconColor}; border-color: ${iconBorder};">
      ${iconSvg}
    </div>
    <div class="path-toast-body">
      <div class="path-toast-title">
        <span>${title || defaultTitle}</span>
      </div>
      <div class="path-toast-detail" style="font-family: inherit; font-size: 11.5px; direction: ltr; white-space: normal; line-height: 1.35; max-width: 380px;" title="${msg}">${msg}</div>
    </div>
  `;

  toast.style.cursor = 'pointer';
  toast.addEventListener('click', () => {
    toast.classList.add('fade-out');
    setTimeout(() => toast.remove(), 250);
  });

  container.appendChild(toast);

  setTimeout(() => {
    if (toast.isConnected) {
      toast.classList.add('fade-out');
      setTimeout(() => toast.remove(), 250);
    }
  }, 4000);
};


