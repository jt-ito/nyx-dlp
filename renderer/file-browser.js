/* ── Remote Host File & Folder Browser ───────────────────────── */
(function() {
  let modalEl = null;
  let currentDir = '';
  let selectedItems = new Set(); // full paths
  let currentItems = [];
  let currentConfig = { type: 'folder', multiple: false, initialPath: '' };
  let resolvePromise = null;

  function createModalDOM() {
    if (document.getElementById('rfb-modal-overlay')) return;

    modalEl = document.createElement('div');
    modalEl.id = 'rfb-modal-overlay';
    modalEl.className = 'rfb-modal-overlay';
    modalEl.style.display = 'none';

    modalEl.innerHTML = `
      <div class="rfb-modal">
        <!-- Header -->
        <div class="rfb-header">
          <div class="rfb-title-group">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
            <span class="rfb-title" id="rfb-title">Browse Host Filesystem</span>
          </div>
          <button class="rfb-close-btn" id="rfb-close-btn" title="Close">✕</button>
        </div>

        <!-- Toolbar / Navigation -->
        <div class="rfb-toolbar">
          <div class="rfb-nav-actions">
            <button class="rfb-btn-icon" id="rfb-btn-up" title="Up to parent folder">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="18 15 12 9 6 15"/></svg>
            </button>
            <button class="rfb-btn-icon" id="rfb-btn-home" title="Home folder">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
            </button>
            <button class="rfb-btn-icon" id="rfb-btn-new-folder" title="New Folder">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/><line x1="12" y1="11" x2="12" y2="17"/><line x1="9" y1="14" x2="15" y2="14"/></svg>
            </button>
            <div class="rfb-roots" id="rfb-roots"></div>
          </div>
          <div class="rfb-path-container">
            <div class="rfb-breadcrumbs" id="rfb-breadcrumbs"></div>
            <input type="text" class="rfb-path-input" id="rfb-path-input" style="display:none;" />
            <button class="rfb-btn-icon rfb-btn-edit" id="rfb-btn-edit-path" title="Edit Path">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
            </button>
          </div>
          <div class="rfb-search-container">
            <input type="text" class="rfb-search-input" id="rfb-search-input" placeholder="Search in folder..." />
          </div>
        </div>

        <!-- Main Items View -->
        <div class="rfb-body" id="rfb-body">
          <div class="rfb-items-header">
            <span class="rfb-col-name">Name</span>
            <span class="rfb-col-size">Size</span>
            <span class="rfb-col-date">Modified</span>
          </div>
          <div class="rfb-items-list" id="rfb-items-list">
            <!-- Populated dynamically -->
          </div>
        </div>

        <!-- Footer -->
        <div class="rfb-footer">
          <div class="rfb-selected-info" id="rfb-selected-info">
            <span class="rfb-selected-label">Selected:</span>
            <span class="rfb-selected-path" id="rfb-selected-path">None</span>
          </div>
          <div class="rfb-footer-buttons">
            <button class="btn btn-ghost" id="rfb-btn-cancel">Cancel</button>
            <button class="btn btn-primary" id="rfb-btn-select">Select</button>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(modalEl);
    bindModalEvents();
  }

  function formatBytes(bytes) {
    if (!bytes || bytes === 0) return '-';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }

  function formatDate(isoStr) {
    if (!isoStr) return '-';
    try {
      const d = new Date(isoStr);
      return d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch {
      return '-';
    }
  }

  async function invokeBackend(channel, data) {
    if (window.api && window.api._invokeRaw) {
      return window.api._invokeRaw(channel, data);
    }
    // Fallback via WebSocket
    if (window.api && window.api.invoke) {
      return window.api.invoke(channel, data);
    }
    return null;
  }

  async function loadDirectory(targetPath) {
    const listEl = document.getElementById('rfb-items-list');
    if (listEl) listEl.innerHTML = '<div class="rfb-loading">Loading folder contents...</div>';

    try {
      const data = await invokeBackend('fs-browse', {
        path: targetPath,
        type: currentConfig.type
      });

      if (!data || data.error) {
        if (listEl) listEl.innerHTML = `<div class="rfb-empty" style="color:var(--accent-danger);">Error: ${data?.error || 'Unable to access folder'}</div>`;
        return;
      }

      currentDir = data.currentPath;
      currentItems = data.items || [];
      selectedItems.clear();

      if (currentConfig.type === 'folder') {
        selectedItems.add(currentDir);
      }

      renderNavigation(data);
      renderItems();
      updateSelectedUI();
    } catch (e) {
      if (listEl) listEl.innerHTML = `<div class="rfb-empty" style="color:var(--accent-danger);">Error reading directory</div>`;
    }
  }

  function renderNavigation(data) {
    // Breadcrumbs
    const bcContainer = document.getElementById('rfb-breadcrumbs');
    if (bcContainer) {
      bcContainer.innerHTML = '';
      const isWindows = data.currentPath.includes('\\') || /^[a-zA-Z]:/.test(data.currentPath);
      const sep = isWindows ? '\\' : '/';
      const parts = data.currentPath.split(/[\\/]/).filter(Boolean);

      if (!isWindows) {
        const rootItem = document.createElement('span');
        rootItem.className = 'rfb-crumb';
        rootItem.textContent = '/';
        rootItem.onclick = () => loadDirectory('/');
        bcContainer.appendChild(rootItem);
      }

      let builtPath = isWindows ? '' : '';
      parts.forEach((part, index) => {
        if (index > 0 || !isWindows) {
          const s = document.createElement('span');
          s.className = 'rfb-crumb-sep';
          s.textContent = sep;
          bcContainer.appendChild(s);
        }
        builtPath = isWindows ? (builtPath ? builtPath + '\\' + part : part) : (builtPath + '/' + part);
        const thisPath = builtPath;
        const crumb = document.createElement('span');
        crumb.className = 'rfb-crumb';
        crumb.textContent = part;
        crumb.onclick = () => loadDirectory(thisPath);
        bcContainer.appendChild(crumb);
      });
    }

    const pathInput = document.getElementById('rfb-path-input');
    if (pathInput) pathInput.value = data.currentPath;

    // Up button
    const btnUp = document.getElementById('rfb-btn-up');
    if (btnUp) {
      btnUp.disabled = !data.parentPath;
      btnUp.onclick = () => { if (data.parentPath) loadDirectory(data.parentPath); };
    }

    // Home button
    const btnHome = document.getElementById('rfb-btn-home');
    if (btnHome) {
      btnHome.onclick = () => { if (data.homePath) loadDirectory(data.homePath); };
    }

    // Roots / Drives
    const rootsEl = document.getElementById('rfb-roots');
    if (rootsEl) {
      rootsEl.innerHTML = '';
      (data.roots || []).forEach(r => {
        const btn = document.createElement('button');
        btn.className = 'rfb-btn-root';
        btn.textContent = r;
        btn.onclick = () => loadDirectory(r);
        rootsEl.appendChild(btn);
      });
    }
  }

  function renderItems() {
    const listEl = document.getElementById('rfb-items-list');
    if (!listEl) return;
    listEl.innerHTML = '';

    const filterText = (document.getElementById('rfb-search-input')?.value || '').toLowerCase();
    const filtered = currentItems.filter(item => {
      if (filterText && !item.name.toLowerCase().includes(filterText)) return false;
      // In folder selection mode, optionally hide non-folders or show them greyed out
      if (currentConfig.type === 'folder' && !item.isDirectory) return false;
      if (currentConfig.type === 'video' && !item.isDirectory && !item.isVideo) return false;
      return true;
    });

    if (filtered.length === 0) {
      listEl.innerHTML = `<div class="rfb-empty">No matching items in this folder.</div>`;
      return;
    }

    filtered.forEach(item => {
      const row = document.createElement('div');
      row.className = 'rfb-item-row' + (selectedItems.has(item.path) ? ' selected' : '');
      if (item.isDirectory) row.classList.add('is-dir');

      let iconSvg = '';
      if (item.isDirectory) {
        iconSvg = '<svg class="rfb-item-icon dir" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>';
      } else if (item.isVideo) {
        iconSvg = '<svg class="rfb-item-icon video" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></svg>';
      } else if (item.isAudio) {
        iconSvg = '<svg class="rfb-item-icon audio" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>';
      } else {
        iconSvg = '<svg class="rfb-item-icon file" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><polyline points="13 2 13 9 20 9"/></svg>';
      }

      row.innerHTML = `
        <div class="rfb-col-name" title="${item.name}">
          ${iconSvg}
          <span class="rfb-item-label">${item.name}</span>
        </div>
        <div class="rfb-col-size">${formatBytes(item.size)}</div>
        <div class="rfb-col-date">${formatDate(item.mtime)}</div>
      `;

      row.addEventListener('click', (e) => {
        if (item.isDirectory) {
          // In folder picker mode, single click selects the folder, double click opens
          if (currentConfig.type === 'folder') {
            selectedItems.clear();
            selectedItems.add(item.path);
            updateSelectedUI();
            updateItemSelectionClasses();
          }
        } else {
          // File click
          if (currentConfig.multiple) {
            if (selectedItems.has(item.path)) selectedItems.delete(item.path);
            else selectedItems.add(item.path);
          } else {
            selectedItems.clear();
            selectedItems.add(item.path);
          }
          updateSelectedUI();
          updateItemSelectionClasses();
        }
      });

      row.addEventListener('dblclick', () => {
        if (item.isDirectory) {
          loadDirectory(item.path);
        } else {
          // Open / Select file on double click
          selectedItems.clear();
          selectedItems.add(item.path);
          finishSelection();
        }
      });

      listEl.appendChild(row);
    });
  }

  function updateItemSelectionClasses() {
    const listEl = document.getElementById('rfb-items-list');
    if (!listEl) return;
    const rows = listEl.querySelectorAll('.rfb-item-row');
    rows.forEach(r => {
      const name = r.querySelector('.rfb-item-label')?.textContent;
      const match = currentItems.find(i => i.name === name);
      if (match) {
        r.classList.toggle('selected', selectedItems.has(match.path));
      }
    });
  }

  function updateSelectedUI() {
    const infoPath = document.getElementById('rfb-selected-path');
    const selectBtn = document.getElementById('rfb-btn-select');
    if (!infoPath) return;

    if (selectedItems.size === 0) {
      infoPath.textContent = currentConfig.type === 'folder' ? currentDir : 'None';
      if (selectBtn) selectBtn.textContent = currentConfig.type === 'folder' ? 'Select Current Folder' : 'Select';
    } else if (selectedItems.size === 1) {
      const p = Array.from(selectedItems)[0];
      infoPath.textContent = p;
      if (selectBtn) selectBtn.textContent = currentConfig.type === 'folder' ? 'Select Folder' : 'Select File';
    } else {
      infoPath.textContent = `${selectedItems.size} items selected`;
      if (selectBtn) selectBtn.textContent = `Select (${selectedItems.size})`;
    }
  }

  function finishSelection() {
    let result = null;
    if (currentConfig.type === 'folder') {
      if (selectedItems.size > 0) result = Array.from(selectedItems)[0];
      else result = currentDir;
      if (currentConfig.multiple) result = [result];
    } else {
      if (currentConfig.multiple) {
        result = Array.from(selectedItems);
      } else {
        result = selectedItems.size > 0 ? Array.from(selectedItems)[0] : null;
      }
    }

    closeModal(result);
  }

  function closeModal(result = null) {
    if (modalEl) modalEl.style.display = 'none';
    if (resolvePromise) {
      resolvePromise(result);
      resolvePromise = null;
    }
  }

  function bindModalEvents() {
    const closeBtn = document.getElementById('rfb-close-btn');
    const cancelBtn = document.getElementById('rfb-btn-cancel');
    const selectBtn = document.getElementById('rfb-btn-select');
    const editPathBtn = document.getElementById('rfb-btn-edit-path');
    const pathInput = document.getElementById('rfb-path-input');
    const breadcrumbs = document.getElementById('rfb-breadcrumbs');
    const searchInput = document.getElementById('rfb-search-input');
    const newFolderBtn = document.getElementById('rfb-btn-new-folder');

    if (closeBtn) closeBtn.onclick = () => closeModal(null);
    if (cancelBtn) cancelBtn.onclick = () => closeModal(null);
    if (selectBtn) selectBtn.onclick = finishSelection;

    // Edit path toggle
    if (editPathBtn && pathInput && breadcrumbs) {
      editPathBtn.onclick = () => {
        const isEditing = pathInput.style.display !== 'none';
        if (isEditing) {
          pathInput.style.display = 'none';
          breadcrumbs.style.display = 'flex';
          const newP = pathInput.value.trim();
          if (newP && newP !== currentDir) loadDirectory(newP);
        } else {
          pathInput.style.display = 'block';
          breadcrumbs.style.display = 'none';
          pathInput.focus();
          pathInput.select();
        }
      };

      pathInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          editPathBtn.click();
        } else if (e.key === 'Escape') {
          pathInput.style.display = 'none';
          breadcrumbs.style.display = 'flex';
        }
      });
    }

    if (searchInput) {
      searchInput.addEventListener('input', renderItems);
    }

    // New folder prompt
    if (newFolderBtn) {
      newFolderBtn.onclick = async () => {
        const name = prompt('Enter new folder name:');
        if (name && name.trim()) {
          const res = await invokeBackend('fs-create-folder', {
            dirPath: currentDir,
            folderName: name.trim()
          });
          if (res && res.success) {
            await loadDirectory(currentDir);
          } else {
            alert('Failed to create folder: ' + (res?.error || 'Unknown error'));
          }
        }
      };
    }

    // Close on backdrop click
    if (modalEl) {
      modalEl.addEventListener('click', (e) => {
        if (e.target === modalEl) closeModal(null);
      });
    }
  }

  // Public API
  window.remoteFileBrowser = {
    show: function(opts = {}) {
      createModalDOM();
      currentConfig = {
        type: opts.type || 'folder',
        multiple: !!opts.multiple,
        initialPath: opts.initialPath || ''
      };

      const titleEl = document.getElementById('rfb-title');
      if (titleEl) {
        if (currentConfig.type === 'folder') titleEl.textContent = 'Select Folder (Server Filesystem)';
        else if (currentConfig.type === 'video') titleEl.textContent = 'Select Video File (Server Filesystem)';
        else titleEl.textContent = 'Select File(s) (Server Filesystem)';
      }

      if (modalEl) modalEl.style.display = 'flex';
      const searchInp = document.getElementById('rfb-search-input');
      if (searchInp) searchInp.value = '';

      loadDirectory(currentConfig.initialPath || currentDir || '');

      return new Promise((resolve) => {
        resolvePromise = resolve;
      });
    }
  };
})();
