/* ── Disk Space ─────────────────────────────────────────── */
const diskSpace = (() => {
  // Map tab name -> output directory input id
  const TAB_OUTPUT_IDS = {
    ytdlp:        'yd-output',
    livestream:   'ls-output',
    batch:        'batch-output',
    m3u8:         'm3-output',
    gallery:      'gdl-output',
    splitter:     'sp-output',
    concatenator: 'concat-output-dir',
  };

  const pill        = document.getElementById('diskSpacePill');
  const modeGrp     = document.getElementById('disk-space-mode-group');
  const staticGrp   = document.getElementById('disk-static-drive-group');
  const radioAuto   = document.getElementById('disk-mode-auto');
  const radioStatic = document.getElementById('disk-mode-static');
  const staticInput = document.getElementById('disk-static-drive');

  let enabled   = false;
  let pollTimer = null;
  let activeTab = document.querySelector('.nav-item.active')?.dataset.tab || 'ytdlp';

  // Centralized shared drive cache: driveRoot -> { free, total, timestamp }
  const sharedDriveCache = new Map();

  function getDriveRoot(dirPath) {
    if (!dirPath || typeof dirPath !== 'string') return null;
    const trimmed = dirPath.trim();
    if (!trimmed) return null;
    // Windows drive letter: C:, C:\, C:/, D:\foo\bar
    const winMatch = trimmed.match(/^([a-zA-Z]:)[/\\]?/);
    if (winMatch) {
      return winMatch[1].toUpperCase() + '\\';
    }
    // UNC path: \\server\share
    const uncMatch = trimmed.match(/^(\\\\[^\\]+\\[^\\]+)/);
    if (uncMatch) {
      return uncMatch[1];
    }
    if (trimmed.startsWith('/')) {
      return '/';
    }
    return trimmed;
  }

  function getActiveDrivePath() {
    const mode = localStorage.getItem('disk-space-mode') || 'auto';
    if (mode === 'static') {
      const drive = (localStorage.getItem('disk-static-drive') || '').trim();
      return drive || null;
    }
    const outputId = TAB_OUTPUT_IDS[activeTab];
    const val = outputId ? (document.getElementById(outputId)?.value.trim() || '') : '';
    return val || null;
  }

  function fmtGB(bytes) {
    const gb = bytes / (1024 ** 3);
    return gb >= 10 ? gb.toFixed(1) + ' GB' : gb.toFixed(2) + ' GB';
  }

  function updatePill() {
    if (!enabled || !pill) return;
    const drivePath = getActiveDrivePath();
    if (!drivePath) {
      pill.textContent = '— free';
      pill.className = 'disk-space-pill';
      return;
    }
    const root = getDriveRoot(drivePath);
    if (!root) {
      pill.textContent = '— free';
      pill.className = 'disk-space-pill';
      return;
    }

    const cached = sharedDriveCache.get(root);
    if (!cached) {
      pill.textContent = '? free';
      pill.className = 'disk-space-pill';
      return;
    }

    const freeGB = cached.free / (1024 ** 3);
    pill.textContent = fmtGB(cached.free) + ' free';
    pill.className = 'disk-space-pill' + (freeGB < 5 ? ' critical' : freeGB < 20 ? ' low' : '');
  }

  async function refresh() {
    if (!enabled) return;
    const mode = localStorage.getItem('disk-space-mode') || 'auto';
    const uniqueRoots = new Set();

    if (mode === 'static') {
      const staticVal = (localStorage.getItem('disk-static-drive') || '').trim();
      const root = getDriveRoot(staticVal);
      if (root) uniqueRoots.add(root);
    } else {
      for (const id of Object.values(TAB_OUTPUT_IDS)) {
        const val = document.getElementById(id)?.value?.trim();
        const root = getDriveRoot(val);
        if (root) uniqueRoots.add(root);
      }
    }

    if (uniqueRoots.size === 0) {
      updatePill();
      return;
    }

    // Fetch disk space once per unique root drive and store in shared cache
    await Promise.all(Array.from(uniqueRoots).map(async (root) => {
      try {
        const result = await window.api.getDiskSpace(root);
        if (result) {
          sharedDriveCache.set(root, { ...result, timestamp: Date.now() });
        }
      } catch (_) {}
    }));

    updatePill();
  }

  function startPolling() { refresh(); pollTimer = setInterval(refresh, 10000); }
  function stopPolling()  { clearInterval(pollTimer); pollTimer = null; }

  function setEnabled(val) {
    enabled = val;
    pill.style.display = val ? '' : 'none';
    if (modeGrp) modeGrp.style.display = val ? '' : 'none';
    if (val) startPolling();
    else     stopPolling();
  }

  function syncStaticGroup() {
    const isStatic = radioStatic?.checked;
    if (staticGrp) staticGrp.style.display = isStatic ? '' : 'none';
    localStorage.setItem('disk-space-mode', isStatic ? 'static' : 'auto');
    refresh();
  }
  radioAuto?.addEventListener('change',   syncStaticGroup);
  radioStatic?.addEventListener('change', syncStaticGroup);

  staticInput?.addEventListener('input', () => {
    localStorage.setItem('disk-static-drive', staticInput.value);
    refresh();
  });

  const savedMode = localStorage.getItem('disk-space-mode') || 'auto';
  if (savedMode === 'static' && radioStatic) { radioStatic.checked = true; if (staticGrp) staticGrp.style.display = ''; }
  const savedDrive = localStorage.getItem('disk-static-drive') || '';
  if (savedDrive && staticInput) staticInput.value = savedDrive;

  Object.values(TAB_OUTPUT_IDS).forEach(id => {
    document.getElementById(id)?.addEventListener('input', () => { if (enabled) refresh(); });
  });

  document.querySelectorAll('.nav-item[data-tab]').forEach(btn => {
    btn.addEventListener('click', () => {
      activeTab = btn.dataset.tab;
      if (enabled) {
        updatePill();
        refresh();
      }
    });
  });

  function getSpaceForPath(dirPath) {
    const root = getDriveRoot(dirPath);
    return root ? (sharedDriveCache.get(root) || null) : null;
  }

  return { setEnabled, refresh, updatePill, getDriveRoot, getSpaceForPath, sharedDriveCache };
})();

// Apply disk-space setting now that the module is initialized
applySetting('show-disk-space', getSetting('show-disk-space'));
