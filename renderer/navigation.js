/* ── Window Controls ──────────────────────────────────────── */
document.getElementById('btnMin').addEventListener('click',   () => window.api.minimize());
document.getElementById('btnMax').addEventListener('click',   () => window.api.maximize());
document.getElementById('btnClose').addEventListener('click', () => window.api.close());

/* ── Tab Navigation ──────────────────────────────────────── */
document.querySelectorAll('.nav-item').forEach(btn => {
  btn.addEventListener('click', () => {
    if (!btn.dataset.tab) return;
    
    const activePanel = document.querySelector('.tab-panel.active');
    if (activePanel) {
      const contentEl = document.querySelector('.content');
      if (contentEl) activePanel._savedScroll = contentEl.scrollTop;
    }
    document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    const panel = document.getElementById('tab-' + btn.dataset.tab);
    if (panel) {
      panel.classList.add('active');
      updateOptsForTab(btn.dataset.tab);
      if (panel._savedScroll !== undefined) {
        const contentEl = document.querySelector('.content');
        if (contentEl) contentEl.scrollTop = panel._savedScroll;
      }
      panel.querySelectorAll('[data-terminal]').forEach(t => t._updateScrollBtn?.());
      panel.querySelectorAll('[data-log-el]').forEach(logEl => {
        if (logEl._hasUnflushed || (logEl._pendingLines?.length ?? 0) > 0) {
          logEl._hasUnflushed = false;
          flushPendingLogsSync(logEl);
          if (logEl._autoFollow !== false) {
            const scrollEl = logEl._scrollEl || logEl;
            scrollEl.scrollTop = scrollEl.scrollHeight;
            logEl._lastScrollTop = scrollEl.scrollTop;
          }
          logEl._updateScrollBtn?.();
        }
      });
    }
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
    let res;
    if (type === 'file') {
        res = await window.api.pickFile();
      } else if (type === 'video') {
        res = await window.api.pickVideo();
      } else if (type === 'multi-file') {
      res = await window.api.pickFiles();
    } else {
      res = await window.api.pickFolder();
    }
    if (res) {
      const target = document.getElementById(btn.dataset.target);
      if (target) {
        if (target.classList.contains('sortable-list')) {
          if (type === 'multi-file') {
            res.forEach(filepath => window.addSortableItem(target, filepath));
          }
        } else if (type === 'multi-file') {
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
window.addSortableItem = function(container, filepath) {
  const emptyState = container.querySelector('.sortable-empty-state');
  if (emptyState) emptyState.remove();

  const item = document.createElement('div');
  item.className = 'sortable-item';
  item.draggable = true;
  item.dataset.path = filepath;

  const dragHandle = document.createElement('div');
  dragHandle.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M8 6h8M8 12h8M8 18h8" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
  dragHandle.style.cursor = 'grab';
  dragHandle.style.color = 'var(--text-subtle)';

  const content = document.createElement('div');
  content.className = 'sortable-item-content';
  content.title = filepath;
  const filename = filepath.split('\\').pop().split('/').pop();
  content.textContent = filename;

  const removeBtn = document.createElement('div');
  removeBtn.className = 'sortable-item-remove';
  removeBtn.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none"><line x1="18" y1="6" x2="6" y2="18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><line x1="6" y1="6" x2="18" y2="18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
  removeBtn.onclick = () => {
    item.remove();
    if (container.children.length === 0) {
      container.innerHTML = '<div class="sortable-empty-state">No files selected. Use the browse button to add videos.</div>';
    }
    container.dispatchEvent(new Event('change', { bubbles: true }));
  };

  item.appendChild(dragHandle);
  item.appendChild(content);
  item.appendChild(removeBtn);

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
    container.dispatchEvent(new Event('change', { bubbles: true }));
  });

  container.appendChild(item);
  container.dispatchEvent(new Event('change', { bubbles: true }));
};
