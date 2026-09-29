/* ── 9. Internet Archive ───────────────────────────────────── */
(function () {
  const log = document.getElementById('ia-log');

  const modeBtns = document.querySelectorAll('#ia-mode-toggle .segment');
  const uploadForm = document.getElementById('ia-upload-form');
  const editForm = document.getElementById('ia-edit-form');
  const downloadForm = document.getElementById('ia-download-form');

  let currentPid = null;
  let currentMode = 'upload';

  // ── Concurrent upload tabs (browser-tab style) ────────────────────────────
  // Each tab is its own independent upload session: its own form field values
  // while unsent ('draft'), its own output log once started, so several
  // uploads can run at once and you switch between them like browser tabs.
  // tabId -> { id, status: 'draft'|'running'|'done'|'error'|'stopped', label,
  //            tabEl, viewEl, log, pid, opts, snapshot, _stopRequested }
  const uploadTabs = new Map();
  let selectedTabId = null;
  let activeUploadCount = 0;

  // Shows the plain shared log (edit/download) vs. the tab-based upload UI.
  // The upload output console is always visible (like every other tool's), not
  // just once you've started a job — only the tab strip is conditional (no point
  // showing tabs until there's more than one upload open).
  function updateIaTerminalVisibility() {
    const singleWrap = document.getElementById('ia-single-terminal-wrap');
    const jobHost = document.getElementById('ia-upload-terminal-host');
    const jobsBar = document.getElementById('ia-jobs-bar');
    const isUpload = currentMode === 'upload';
    if (singleWrap) singleWrap.classList.toggle('hidden', isUpload);
    if (jobHost) jobHost.classList.toggle('hidden', !isUpload);
    if (jobsBar) jobsBar.classList.toggle('hidden', !isUpload || uploadTabs.size <= 1);
  }

  // Mode switching
  modeBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      modeBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const mode = btn.dataset.mode;
      currentMode = mode;
      if (mode === 'upload') {
        uploadForm.style.display = '';
        uploadForm.classList.remove('hidden');
        editForm.style.display = 'none';
        editForm.classList.add('hidden');
        downloadForm.style.display = 'none';
        downloadForm.classList.add('hidden');
      } else if (mode === 'edit') {
        uploadForm.style.display = 'none';
        uploadForm.classList.add('hidden');
        editForm.style.display = '';
        editForm.classList.remove('hidden');
        downloadForm.style.display = 'none';
        downloadForm.classList.add('hidden');
      } else {
        uploadForm.style.display = 'none';
        uploadForm.classList.add('hidden');
        editForm.style.display = 'none';
        editForm.classList.add('hidden');
        downloadForm.style.display = '';
        downloadForm.classList.remove('hidden');
      }
      updateIaTerminalVisibility();
      if (currentMode === 'upload' && selectedTabId) {
        const tab = uploadTabs.get(selectedTabId);
        if (tab) activateLogView(tab.log);
      }
    });
  });

  document.getElementById('ia-upload-clear').addEventListener('click', () => {
    const tab = selectedTabId ? uploadTabs.get(selectedTabId) : null;
    if (tab && tab.log) clearLog(tab.log);
  });
  document.getElementById('ia-edit-clear').addEventListener('click', () => clearLog(log));
  document.getElementById('ia-download-clear').addEventListener('click', () => clearLog(log));

  // Reset Info Modal Logic
  const resetBtn = document.getElementById('ia-upload-reset');
  const resetModal = document.getElementById('ia-reset-modal');
  const resetCancel = document.getElementById('ia-reset-cancel');
  const resetSubmit = document.getElementById('ia-reset-submit');

  resetBtn.addEventListener('click', () => {
    resetModal.style.display = 'flex';
  });
  resetCancel.addEventListener('click', () => {
    resetModal.style.display = 'none';
  });
  function normalizeIdentifier(str) {
    if (!str) return '';
    return str.toLowerCase()
      .replace(/[\s_]+/g, '-')
      .replace(/[^a-z0-9-]/g, '')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');
  }

  function triggerCharCountPop(counterEl) {
    if (!counterEl) return;
    counterEl.classList.remove('char-count-pop');
    void counterEl.offsetWidth; // Force CSS reflow to re-trigger animation
    counterEl.classList.add('char-count-pop');
  }

  // Helper for character count updates
  function updateCharCount(inputEl, counterEl) {
    if (!inputEl || !counterEl) return;
    const len = inputEl.value.length;
    counterEl.classList.remove('char-count-warn', 'char-count-valid', 'char-count-error', 'char-count-limit');
    if (len === 0) {
      counterEl.textContent = '0 / 100';
      counterEl.classList.add('char-count-warn');
    } else if (len < 5) {
      counterEl.textContent = `${len} / 100 (min 5)`;
      counterEl.classList.add('char-count-warn');
    } else if (len > 100) {
      counterEl.textContent = `${len} / 100 (max 100)`;
      counterEl.classList.add('char-count-error');
    } else {
      counterEl.textContent = `${len} / 100`;
      counterEl.classList.add('char-count-valid');
    }
  }

  function setupIdentifierInput(inputEl, counterEl, onUserModified) {
    if (!inputEl || !counterEl) return;

    counterEl.addEventListener('animationend', () => {
      counterEl.classList.remove('char-count-pop');
    });

    // Block typing past 100 characters and trigger pop animation
    inputEl.addEventListener('keydown', (e) => {
      // Allow control keys, shortcuts (Ctrl/Cmd+A, C, V, X, Z), navigation, backspace, delete
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (['Backspace', 'Delete', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Tab', 'Home', 'End', 'Enter', 'Escape'].includes(e.key)) return;

      if (e.key.length === 1) { // Single printable character
        const selectedLength = inputEl.selectionEnd - inputEl.selectionStart;
        const currentLength = inputEl.value.length;
        const resultingLength = currentLength - selectedLength + 1;

        if (resultingLength > 100) {
          e.preventDefault();
          triggerCharCountPop(counterEl);
        }
      }
    });

    // Paste handling: normalize pasted text, allow full text even if > 100 chars
    inputEl.addEventListener('paste', (e) => {
      e.preventDefault();
      const pasted = (e.clipboardData || window.clipboardData).getData('text');
      const normalized = normalizeIdentifier(pasted);
      const start = inputEl.selectionStart;
      const end = inputEl.selectionEnd;
      const before = inputEl.value.substring(0, start);
      const after = inputEl.value.substring(end);
      const combined = before + normalized + after;
      inputEl.value = combined;
      const newPos = start + normalized.length;
      inputEl.selectionStart = newPos;
      inputEl.selectionEnd = newPos;
      counterEl.classList.remove('char-count-pop');
      inputEl.dispatchEvent(new Event('input', { bubbles: true }));
      inputEl.dispatchEvent(new Event('change', { bubbles: true }));
      updateCharCount(inputEl, counterEl);
      if (onUserModified) onUserModified(true);
    });

    // Normalize on blur
    inputEl.addEventListener('blur', () => {
      if (inputEl.value) {
        inputEl.value = normalizeIdentifier(inputEl.value);
        counterEl.classList.remove('char-count-pop');
        inputEl.dispatchEvent(new Event('change', { bubbles: true }));
        updateCharCount(inputEl, counterEl);
      }
    });

    // General input listener
    inputEl.addEventListener('input', (e) => {
      if (e.isTrusted && onUserModified) {
        onUserModified(e.target.value.length > 0);
      }
      counterEl.classList.remove('char-count-pop');
      updateCharCount(inputEl, counterEl);
    });

    updateCharCount(inputEl, counterEl);
  }

  const iaIdUp = document.getElementById('ia-identifier-up');
  const iaIdUpCount = document.getElementById('ia-identifier-up-count');
  const iaIdEdit = document.getElementById('ia-identifier-edit');
  const iaIdEditCount = document.getElementById('ia-identifier-edit-count');
  const iaIdDown = document.getElementById('ia-identifier-down');
  const iaIdDownCount = document.getElementById('ia-identifier-down-count');
  const iaTitle = document.getElementById('ia-title');

  let idModifiedByUser = !!(iaIdUp && iaIdUp.value);
  let titleModifiedByUser = !!(iaTitle && iaTitle.value);
  let collectionModifiedByUser = false;

  setupIdentifierInput(iaIdUp, iaIdUpCount, (modified) => {
    idModifiedByUser = modified !== undefined ? modified : true;
  });
  setupIdentifierInput(iaIdEdit, iaIdEditCount);
  setupIdentifierInput(iaIdDown, iaIdDownCount);

  // ── Upload form field snapshot (captured per-tab so switching between a
  // draft tab and a running/finished tab doesn't lose what you were typing) ──
  function blankFieldSnapshot() {
    return {
      files: [], identifier: '', title: '', description: '', subject: '',
      collection: 'opensource_movies', creator: '', dateY: '', dateM: '', dateD: '',
      language: '', license: '', mediatype: '', noDerive: false,
      idModifiedByUser: false, titleModifiedByUser: false, collectionModifiedByUser: false
    };
  }

  function captureFieldSnapshot() {
    return {
      files: Array.from(document.getElementById('ia-files').querySelectorAll('.sortable-item')).map(el => el.dataset.path),
      identifier: iaIdUp?.value || '',
      title: iaTitle?.value || '',
      description: document.getElementById('ia-description')?.value || '',
      subject: document.getElementById('ia-subject')?.value || '',
      collection: document.getElementById('ia-collection')?.value || 'opensource_movies',
      creator: document.getElementById('ia-creator')?.value || '',
      dateY: document.getElementById('ia-date-y')?.value || '',
      dateM: document.getElementById('ia-date-m')?.value || '',
      dateD: document.getElementById('ia-date-d')?.value || '',
      language: document.getElementById('ia-language')?.value || '',
      license: document.getElementById('ia-license')?.value || '',
      mediatype: document.getElementById('ia-mediatype')?.value || '',
      noDerive: document.getElementById('ia-noderive')?.checked || false,
      idModifiedByUser, titleModifiedByUser, collectionModifiedByUser
    };
  }

  function applyFieldSnapshot(snap) {
    const fileList = document.getElementById('ia-files');
    if (fileList) {
      fileList.innerHTML = '<div class="sortable-empty-state">No files selected. Use the browse button to add files.</div>';
      (snap.files || []).forEach(p => window.addSortableItem?.(fileList, p));
    }
    if (iaIdUp) iaIdUp.value = snap.identifier || '';
    updateCharCount(iaIdUp, iaIdUpCount);
    if (iaTitle) iaTitle.value = snap.title || '';
    const iaDesc = document.getElementById('ia-description');
    if (iaDesc) iaDesc.value = snap.description || '';
    const iaCreator = document.getElementById('ia-creator');
    if (iaCreator) iaCreator.value = snap.creator || '';
    const dY = document.getElementById('ia-date-y');
    const dM = document.getElementById('ia-date-m');
    const dD = document.getElementById('ia-date-d');
    if (dY) dY.value = snap.dateY || '';
    if (dM) dM.value = snap.dateM || '';
    if (dD) dD.value = snap.dateD || '';
    const iaSubj = document.getElementById('ia-subject');
    if (iaSubj) iaSubj.value = snap.subject || '';
    const iaLic = document.getElementById('ia-license');
    if (iaLic) iaLic.value = snap.license || '';
    const iaCol = document.getElementById('ia-collection');
    if (iaCol) iaCol.value = snap.collection || 'opensource_movies';
    const iaMed = document.getElementById('ia-mediatype');
    if (iaMed) iaMed.value = snap.mediatype || '';
    const iaLang = document.getElementById('ia-language');
    if (iaLang) iaLang.value = snap.language || '';
    const iaNd = document.getElementById('ia-noderive');
    if (iaNd) iaNd.checked = !!snap.noDerive;

    idModifiedByUser = !!snap.idModifiedByUser;
    titleModifiedByUser = !!snap.titleModifiedByUser;
    collectionModifiedByUser = !!snap.collectionModifiedByUser;

    const errEl = document.getElementById('ia-upload-form-error');
    if (errEl) errEl.classList.add('hidden');
  }

  function resetUploadFields() { applyFieldSnapshot(blankFieldSnapshot()); }

  if (resetSubmit) {
    resetSubmit.addEventListener('click', () => {
      resetUploadFields();
      const tab = selectedTabId ? uploadTabs.get(selectedTabId) : null;
      if (tab) tab.snapshot = blankFieldSnapshot();
      resetModal.style.display = 'none';
    });
  }

  // Date Auto-Focus Logic
  const dateY = document.getElementById('ia-date-y');
  const dateM = document.getElementById('ia-date-m');
  const dateD = document.getElementById('ia-date-d');

  if (dateY && dateM && dateD) {
    dateY.addEventListener('input', () => {
      dateY.value = dateY.value.replace(/[^0-9]/g, '');
      if (dateY.value.length === 4) dateM.focus();
    });
    dateM.addEventListener('input', () => {
      dateM.value = dateM.value.replace(/[^0-9]/g, '');
      if (dateM.value !== '') {
        let val = parseInt(dateM.value, 10);
        if (val > 12) dateM.value = '12';
        if (dateM.value === '00') dateM.value = '01';
      }
      if (dateM.value.length === 2) dateD.focus();
    });
    dateD.addEventListener('input', () => {
      dateD.value = dateD.value.replace(/[^0-9]/g, '');
      if (dateD.value !== '') {
        let val = parseInt(dateD.value, 10);
        if (val > 31) dateD.value = '31';
        if (dateD.value === '00') dateD.value = '01';
      }
    });
    dateM.addEventListener('keydown', (e) => {
      if (e.key === 'Backspace' && dateM.value.length === 0) dateY.focus();
    });
    dateD.addEventListener('keydown', (e) => {
      if (e.key === 'Backspace' && dateD.value.length === 0) dateM.focus();
    });
  }

  // Auto-populate Title and Collection from File Selection
  const iaFiles = document.getElementById('ia-files');
  const iaCollection = document.getElementById('ia-collection');

  if (iaCollection) {
    iaCollection.addEventListener('change', (e) => {
      if (e.isTrusted) {
        collectionModifiedByUser = true;
      }
    });
  }

  if (iaTitle && iaFiles) {
    iaTitle.addEventListener('input', (e) => {
      if (e.isTrusted) {
        titleModifiedByUser = e.target.value.length > 0;
      }
    });
    
    // Sortable list logic
    const updateSortableList = (container, listId) => {
      const items = Array.from(container.querySelectorAll('.sortable-item'));
      if (items.length > 0) {
        const firstFile = items[0].dataset.path;
        if (firstFile && listId === 'ia-files') {
          // auto populate logic for upload form
          const filenameWithExt = firstFile.split(/[/\\]/).pop();
          const lastDot = filenameWithExt.lastIndexOf('.');
          const filename = lastDot > 0 ? filenameWithExt.substring(0, lastDot) : filenameWithExt;
          const ext = lastDot > 0 ? filenameWithExt.substring(lastDot + 1).toLowerCase() : '';
          
          if (!titleModifiedByUser && iaTitle) {
            iaTitle.value = filename;
            iaTitle.dispatchEvent(new Event('input', { bubbles: true }));
          }

          if (!idModifiedByUser && iaIdUp) {
            iaIdUp.value = normalizeIdentifier(filename);
            iaIdUp.dispatchEvent(new Event('input', { bubbles: true }));
            iaIdUp.dispatchEvent(new Event('change', { bubbles: true }));
            updateCharCount(iaIdUp, iaIdUpCount);
          }

          if (iaCollection && !collectionModifiedByUser) {
            const videoExts = ['mp4', 'mkv', 'avi', 'mov', 'webm', 'ts', 'flv'];
            const audioExts = ['mp3', 'wav', 'flac', 'ogg', 'm4a', 'aac'];
            
            if (videoExts.includes(ext)) {
              iaCollection.value = 'opensource_movies';
            } else if (audioExts.includes(ext)) {
              iaCollection.value = 'opensource_audio';
            } else {
              iaCollection.value = 'opensource_media';
            }
            iaCollection.dispatchEvent(new Event('change', { bubbles: true }));
          }
        }
      } else if (listId === 'ia-files') {
        if (iaTitle) {
          iaTitle.value = '';
          titleModifiedByUser = false;
          iaTitle.dispatchEvent(new Event('input', { bubbles: true }));
        }
        if (iaIdUp) {
          iaIdUp.value = '';
          idModifiedByUser = false;
          iaIdUp.dispatchEvent(new Event('input', { bubbles: true }));
        }
      }
    };

    iaFiles.addEventListener('change', () => updateSortableList(iaFiles, 'ia-files'));
    
    const iaEditFiles = document.getElementById('ia-edit-files');
    if (iaEditFiles) {
      iaEditFiles.addEventListener('change', () => updateSortableList(iaEditFiles, 'ia-edit-files'));
    }
  }

  const uploadStop = document.getElementById('ia-upload-stop');
  const downloadStop = document.getElementById('ia-download-stop');

  const stopHandler = () => {
    if (currentPid) window.api.stopScript(currentPid);
    else if (window.api && window.api.stopScript) window.api.stopScript();
  };
  downloadStop?.addEventListener('click', stopHandler);
  uploadStop?.addEventListener('click', () => {
    const tab = selectedTabId ? uploadTabs.get(selectedTabId) : null;
    if (!tab || tab.status !== 'running') return;
    // pid may not have arrived from main.js yet — stop as soon as it does.
    if (tab.pid) window.api.stopScript(tab.pid);
    else tab._stopRequested = true;
  });
  const editStop = document.getElementById('ia-edit-stop');
  editStop?.addEventListener('click', stopHandler);

  // IA Auth Modals
  const configBtn = document.getElementById('ia-config-btn');
  const loginModal = document.getElementById('ia-login-modal');
  const connectedModal = document.getElementById('ia-connected-modal');
  const unlinkModal = document.getElementById('ia-unlink-modal');
  
  configBtn.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    unlinkModal.style.display = 'flex';
  });

  document.getElementById('ia-unlink-cancel').addEventListener('click', () => {
    unlinkModal.style.display = 'none';
  });

  document.getElementById('ia-unlink-submit').addEventListener('click', async () => {
    const btn = document.getElementById('ia-unlink-submit');
    btn.disabled = true;
    btn.innerText = 'Unlinking...';
    await window.api.runIaUnlink();
    unlinkModal.style.display = 'none';
    btn.disabled = false;
    btn.innerText = 'Unlink';
    configBtn.innerText = 'Login to IA';
    configBtn.classList.remove('btn-success');
    configBtn.classList.add('btn-ghost');
    appendLog(log, '✔ Internet Archive account unlinked.', 'success');
  });
  
  const emailInput = document.getElementById('ia-auth-email');
  const passwordInput = document.getElementById('ia-auth-password');
  const authError = document.getElementById('ia-auth-error');
  const submitBtn = document.getElementById('ia-auth-submit');
  
  let connectedTimeout = null;

  configBtn.addEventListener('click', async () => {
    configBtn.disabled = true;
    configBtn.innerText = 'Checking...';
    
    const autoIa = getSetting('dep-auto-ia');
    const isAuth = await window.api.checkIaAuth(autoIa);
    
    configBtn.disabled = false;
    configBtn.innerText = isAuth ? 'Logged into IA' : 'Login to IA';
    if (isAuth) {
      configBtn.classList.remove('btn-ghost');
      configBtn.classList.add('btn-success');
    } else {
      configBtn.classList.remove('btn-success');
      configBtn.classList.add('btn-ghost');
    }

    if (isAuth) {
      connectedModal.style.display = 'flex';
      if (connectedTimeout) clearTimeout(connectedTimeout);
      connectedTimeout = setTimeout(() => {
        connectedModal.style.display = 'none';
      }, 10000);
    } else {
      authError.style.display = 'none';
      loginModal.style.display = 'flex';
    }
  });

  document.getElementById('ia-auth-cancel').addEventListener('click', () => {
    loginModal.style.display = 'none';
  });

  document.getElementById('ia-connected-close').addEventListener('click', () => {
    connectedModal.style.display = 'none';
    if (connectedTimeout) clearTimeout(connectedTimeout);
  });

  submitBtn.addEventListener('click', async () => {
    const email = emailInput.value.trim();
    const password = passwordInput.value;
    
    if (!email || !password) {
      authError.innerText = 'Please enter both email and password.';
      authError.style.display = 'block';
      return;
    }

    authError.style.display = 'none';
    submitBtn.disabled = true;
    submitBtn.innerText = 'Authenticating...';

    const autoIa = getSetting('dep-auto-ia');
    const result = await window.api.runIaConfigure(email, password, autoIa);

    submitBtn.disabled = false;
    submitBtn.innerText = 'Login';

    if (result.success) {
      loginModal.style.display = 'none';
      passwordInput.value = ''; // clear password for security
      configBtn.innerText = 'Logged into IA';
      configBtn.classList.remove('btn-ghost');
      configBtn.classList.add('btn-success');
      appendLog(log, '✔ Successfully authenticated with Internet Archive.', 'success');
    } else {
      authError.innerText = result.error || 'Authentication failed.';
      authError.style.display = 'block';
    }
  });

  function setupRun(runBtn, stopBtn, handlerName, apiCall, buildOpts) {
    runBtn.addEventListener('click', async () => {
      const opts = await buildOpts();
      if (!opts) return; // Validation failed

      clearLog(log);
      appendLog(log, `▶ Starting ${handlerName}...`, 'info');
      appendLog(log, '', 'stdout');
      markBodyStart(log);

      currentPid = null;
      runBtn.classList.add('hidden');
      stopBtn.classList.remove('hidden');
      incRunning('Internet Archive');

      apiCall(opts);
    });
  }

  if (window.api && window.api.onIaOutput) {
    window.api.onIaOutput((data) => {
      // Upload tabs are tagged with jobId (= tab id) by main.js (see prepareRunner)
      // so several concurrent uploads sharing the single 'ia-output' channel can
      // be routed back to their own tab/log instead of clobbering one shared log.
      if (data.jobId) {
        const tab = uploadTabs.get(data.jobId);
        if (!tab) return; // tab was closed client-side; ignore stray late events
        if (data.type === 'pid') {
          tab.pid = data.pid;
          if (tab._stopRequested) window.api.stopScript(tab.pid);
          return;
        }
        handleOutput(tab.log, data, (code) => onTabExit(tab, code));
        return;
      }
      if (data.type === 'pid') {
        currentPid = data.pid;
        return;
      }
      handleOutput(log, data, () => {
        document.querySelectorAll('#ia-edit-run, #ia-download-run').forEach(b => b.classList.remove('hidden'));
        document.querySelectorAll('#ia-edit-stop, #ia-download-stop').forEach(b => b.classList.add('hidden'));
        currentPid = null;
        decRunning('Internet Archive');
      });
    });
  }

  // ── Upload tabs (browser-tab style concurrent uploads) ───────────────────
  const jobTabsEl = document.getElementById('ia-job-tabs');
  const jobHostEl = document.getElementById('ia-upload-terminal-host');
  const uploadRunBtn = document.getElementById('ia-upload-run');

  function tabStatusLabel(status) {
    return { draft: 'New', running: 'Running', done: 'Done', error: 'Failed', stopped: 'Stopped' }[status] || status;
  }

  function updateTabChipUI(tab) {
    if (!tab.tabEl) return;
    tab.tabEl.className = 'ia-job-tab status-' + tab.status + (tab.id === selectedTabId ? ' active' : '');
    tab.tabEl.title = `${tab.label} — ${tabStatusLabel(tab.status)}`;
  }

  // Run/Stop toggle by hidden class exactly like every other tool's action row —
  // Stop only appears while the selected tab is actually running.
  function updateSelectedTabControls() {
    const tab = selectedTabId ? uploadTabs.get(selectedTabId) : null;
    const isRunning = !!tab && tab.status === 'running';
    if (uploadRunBtn) uploadRunBtn.classList.toggle('hidden', isRunning);
    if (uploadStop) uploadStop.classList.toggle('hidden', !isRunning);
  }

  // Switches which tab's form + output log is shown (both stay visible, like
  // every other tool's panel — only which tab's data fills them changes).
  function selectTab(tabId) {
    const tab = uploadTabs.get(tabId);
    if (!tab) return;
    if (selectedTabId && selectedTabId !== tabId) {
      const prev = uploadTabs.get(selectedTabId);
      if (prev) prev.snapshot = captureFieldSnapshot();
    }
    selectedTabId = tabId;
    for (const t of uploadTabs.values()) {
      t.tabEl?.classList.toggle('active', t.id === tabId);
      t.viewEl?.classList.toggle('active', t.id === tabId);
    }
    applyFieldSnapshot(tab.snapshot || blankFieldSnapshot());
    activateLogView(tab.log);
    updateSelectedTabControls();
    updateIaTerminalVisibility();
  }

  function closeTab(tabId) {
    const tab = uploadTabs.get(tabId);
    if (!tab) return;
    if (tab.status === 'running') {
      // Stop it first — closing a running upload's tab must not orphan the process.
      if (tab.pid) window.api.stopScript(tab.pid);
      else tab._stopRequested = true;
      return;
    }
    tab.tabEl?.remove();
    tab.viewEl?.remove();
    uploadTabs.delete(tabId);
    if (uploadTabs.size === 0) {
      selectTab(createTab().id);
    } else if (selectedTabId === tabId) {
      selectTab([...uploadTabs.keys()].pop());
    } else {
      updateIaTerminalVisibility();
    }
  }

  function createTab() {
    const id = 'ia-tab-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7);
    const tabEl = document.createElement('div');
    tabEl.className = 'ia-job-tab status-draft';
    tabEl.innerHTML = `<span class="ia-job-dot"></span><span class="ia-job-label"></span><span class="ia-job-close" title="Close tab">✕</span>`;
    tabEl.querySelector('.ia-job-label').textContent = 'New Upload';
    tabEl.addEventListener('click', (e) => {
      if (e.target.closest('.ia-job-close')) return;
      selectTab(id);
    });
    tabEl.querySelector('.ia-job-close').addEventListener('click', (e) => {
      e.stopPropagation();
      closeTab(id);
    });
    jobTabsEl.appendChild(tabEl);

    // The output console is created up front and stays visible the whole time
    // this tab exists — same as every other tool's log panel — it's just empty
    // until you click Upload.
    const logId = 'ia-log-' + id;
    const viewEl = document.createElement('div');
    viewEl.className = 'terminal-wrap ia-job-view';
    viewEl.innerHTML = `
      <div class="terminal-container">
        <div class="terminal-header">
          <div style="display: flex; align-items: center; gap: 12px;">
            <span class="terminal-title">Output</span>
            <div class="terminal-actions">
              <button class="btn-term-action btn-term-scroll" title="Follow log" data-terminal="${logId}">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M19 12l-7 7-7-7"/></svg>
              </button>
              <button class="btn-term-action btn-term-copy" title="Copy output" data-terminal="${logId}">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
              </button>
            </div>
          </div>
          <div class="terminal-dots"><span></span><span></span><span></span></div>
        </div>
        <div class="terminal-body" id="${logId}" data-log-el="true" data-ia-tool="1"></div>
      </div>`;
    jobHostEl.appendChild(viewEl);

    const tab = { id, status: 'draft', label: 'New Upload', tabEl, viewEl, log: viewEl.querySelector('.terminal-body'), pid: null, opts: null, snapshot: blankFieldSnapshot(), _stopRequested: false };
    uploadTabs.set(id, tab);
    updateIaTerminalVisibility();
    return tab;
  }

  // "+" next to Target File(s) — like a browser's new-tab button. If the current
  // tab is already a blank draft there's nothing to add, so just keep it selected.
  document.getElementById('ia-add-concurrent-upload').addEventListener('click', () => {
    const current = selectedTabId ? uploadTabs.get(selectedTabId) : null;
    if (current && current.status === 'draft') return;
    selectTab(createTab().id);
  });

  function startTab(tab, opts) {
    tab.status = 'running';
    tab.opts = opts;
    tab.label = opts.identifier || (opts.files[0] || '').split(/[\\/]/).pop() || 'Upload';
    tab.tabEl.querySelector('.ia-job-label').textContent = tab.label;
    updateTabChipUI(tab);
    clearLog(tab.log); // re-running an already-used tab starts its console fresh

    // Record to history right as the upload starts (matches prior single-upload behavior)
    const downloadName = opts.title || (opts.files.length > 0 ? opts.files[0].split(/[\\/]/).pop() : opts.identifier);
    const historyEntry = {
      id: tab.id,
      date: new Date().toISOString(),
      tool: 'Internet Archive',
      subTool: 'upload',
      name: downloadName,
      source: opts.identifier ? `archive.org/details/${opts.identifier}` : `${opts.files.length} File(s)`,
      output: `https://archive.org/details/${opts.identifier}`,
      status: 'running',
      uploadData: { ...opts }
    };
    tab.log._currentIaJob = historyEntry;
    if (window.api && window.api.addHistory && (!window.shouldRecordHistory || window.shouldRecordHistory(historyEntry))) {
      window.api.addHistory(historyEntry).then(() => {
        if (window._refreshHistory) window._refreshHistory();
      });
    }

    if (activeUploadCount === 0) incRunning('Internet Archive');
    activeUploadCount++;

    appendLog(tab.log, '▶ Starting IA Upload...', 'info');
    appendLog(tab.log, '', 'stdout');
    markBodyStart(tab.log);

    window.api.runIaUpload({ ...opts, jobId: tab.id });

    // Refresh the view now that this (selected) tab has left the draft state.
    if (tab.id === selectedTabId) selectTab(tab.id);
  }

  function onTabExit(tab, code) {
    tab.status = code === 0 ? 'done' : (code === null ? 'stopped' : 'error');
    updateTabChipUI(tab);
    activeUploadCount = Math.max(0, activeUploadCount - 1);
    if (activeUploadCount === 0) decRunning('Internet Archive');
    if (tab.id === selectedTabId) updateSelectedTabControls();
  }

  // The initial tab, present from the start (mirrors the classic single-upload form).
  selectTab(createTab().id);
  updateIaTerminalVisibility();

  // Reads + validates the upload form as it currently stands. excludeTabId is the
  // tab about to be (re-)started — its own stale opts.identifier (from a prior
  // run) shouldn't trip the "already uploading" check against itself.
  function readAndValidateUploadOpts(excludeTabId) {
    const files = Array.from(document.getElementById('ia-files').querySelectorAll('.sortable-item')).map(el => el.dataset.path);
    const identifier = document.getElementById('ia-identifier-up').value.trim();
    const title = document.getElementById('ia-title').value.trim();
    const description = document.getElementById('ia-description').value.trim();
    const subject = document.getElementById('ia-subject').value.trim();
    const collection = document.getElementById('ia-collection').value;
    const creator = document.getElementById('ia-creator')?.value?.trim() || '';

    const y = document.getElementById('ia-date-y')?.value?.trim() || '';
    const m = document.getElementById('ia-date-m')?.value?.trim() || '';
    const d = document.getElementById('ia-date-d')?.value?.trim() || '';
    let date = '';
    if (y && m && d) date = `${y}-${m}-${d}`;
    else if (y && m) date = `${y}-${m}`;
    else if (y) date = y;

    const language = document.getElementById('ia-language')?.value?.trim() || '';
    const license = document.getElementById('ia-license')?.value?.trim() || '';
    const mediatype = document.getElementById('ia-mediatype')?.value || '';
    const noDerive = document.getElementById('ia-noderive')?.checked || false;

    const errEl = document.getElementById('ia-upload-form-error');
    const showError = (msg) => {
      if (errEl) {
        errEl.textContent = msg;
        errEl.classList.remove('hidden');
        errEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
      return null;
    };
    if (errEl) errEl.classList.add('hidden');

    if (files.length === 0) return showError('⚠ Please select at least one file to upload.');
    if (!identifier) return showError('⚠ Please provide an identifier.');
    if (identifier.length < 5) return showError('⚠ Identifier must be at least 5 characters.');
    if (identifier.length > 100) return showError(`⚠ Identifier exceeds the 100-character maximum limit (${identifier.length}/100). Please shorten it before uploading.`);
    if (!description) return showError('⚠ Please provide a description.');
    if (!subject) return showError('⚠ Please provide subject tags.');
    for (const t of uploadTabs.values()) {
      if (t.id !== excludeTabId && t.status === 'running' && t.opts?.identifier === identifier) {
        return showError(`⚠ '${identifier}' is already uploading in another tab.`);
      }
    }

    const autoIa = getSetting('dep-auto-ia');
    return { files, identifier, title, description, subject, collection, creator, date, language, license, mediatype, noDerive, autoIa };
  }

  function warnIfIdentifierAlreadyExists(identifier, targetTabId) {
    fetch(`https://archive.org/metadata/${identifier}`)
      .then(res => res.json())
      .then(data => {
        if (data && data.metadata) {
          const t = uploadTabs.get(targetTabId);
          if (t && t.log) appendLog(t.log, `⚠ Identifier '${identifier}' already exists. If you do not own it, the upload will fail with Access Denied.`, 'warning');
        }
      })
      .catch(() => {}); // Ignore if fetch fails
  }

  uploadRunBtn.addEventListener('click', () => {
    const tab = selectedTabId ? uploadTabs.get(selectedTabId) : null;
    if (!tab || tab.status === 'running') return;
    const opts = readAndValidateUploadOpts(tab.id);
    if (!opts) return;
    warnIfIdentifierAlreadyExists(opts.identifier, tab.id);
    startTab(tab, opts);
  });

  // "Add to Queue" — starts the CURRENT form's data as a brand-new tab running
  // in the background, without touching or switching away from the tab you're
  // looking at. Handy for firing off several similar uploads back to back:
  // tweak one field, click, tweak again, click, etc.
  document.getElementById('ia-upload-add-queue').addEventListener('click', () => {
    const opts = readAndValidateUploadOpts(null);
    if (!opts) return;
    const newTab = createTab();
    warnIfIdentifierAlreadyExists(opts.identifier, newTab.id);
    startTab(newTab, opts);
  });

  window.fillIaUploadForm = function (data) {
    if (!data) return;

    // Switch tab to IA
    const iaNavBtn = document.querySelector('.nav-item[data-tab="ia"]');
    if (iaNavBtn) iaNavBtn.click();

    // Switch mode to Upload
    const uploadModeBtn = document.querySelector('#ia-mode-toggle .segment[data-mode="upload"]');
    if (uploadModeBtn) uploadModeBtn.click();

    // The form is only live/visible while a draft (not-yet-started) tab is selected —
    // open one if the currently selected tab has already started or finished.
    const activeTab = selectedTabId ? uploadTabs.get(selectedTabId) : null;
    if (!activeTab || activeTab.status !== 'draft') selectTab(createTab().id);

    // Fill primary metadata
    if (iaIdUp) {
      iaIdUp.value = data.identifier || '';
      idModifiedByUser = true;
      iaIdUp.dispatchEvent(new Event('input', { bubbles: true }));
      updateCharCount(iaIdUp, iaIdUpCount);
    }

    if (iaTitle) {
      iaTitle.value = data.title || '';
      titleModifiedByUser = true;
      iaTitle.dispatchEvent(new Event('input', { bubbles: true }));
    }

    const descEl = document.getElementById('ia-description');
    if (descEl) {
      descEl.value = data.description || '';
      descEl.dispatchEvent(new Event('input', { bubbles: true }));
    }

    const subjEl = document.getElementById('ia-subject');
    if (subjEl) {
      subjEl.value = data.subject || '';
      subjEl.dispatchEvent(new Event('input', { bubbles: true }));
    }

    if (iaCollection) {
      iaCollection.value = data.collection || 'opensource_movies';
      collectionModifiedByUser = true;
      iaCollection.dispatchEvent(new Event('change', { bubbles: true }));
    }

    // Advanced options
    const creatorEl = document.getElementById('ia-creator');
    if (creatorEl) {
      creatorEl.value = data.creator || '';
      creatorEl.dispatchEvent(new Event('input', { bubbles: true }));
    }

    if (dateY && dateM && dateD) {
      if (data.date) {
        const parts = data.date.split('-');
        dateY.value = parts[0] || '';
        dateM.value = parts[1] || '';
        dateD.value = parts[2] || '';
      } else {
        dateY.value = data.dateY || '';
        dateM.value = data.dateM || '';
        dateD.value = data.dateD || '';
      }
    }

    const langEl = document.getElementById('ia-language');
    if (langEl) {
      langEl.value = data.language || '';
      langEl.dispatchEvent(new Event('change', { bubbles: true }));
    }

    const licEl = document.getElementById('ia-license');
    if (licEl) {
      licEl.value = data.license || '';
      licEl.dispatchEvent(new Event('input', { bubbles: true }));
    }

    const mediaEl = document.getElementById('ia-mediatype');
    if (mediaEl) {
      mediaEl.value = data.mediatype || '';
      mediaEl.dispatchEvent(new Event('change', { bubbles: true }));
    }

    const noDeriveEl = document.getElementById('ia-noderive');
    if (noDeriveEl) {
      noDeriveEl.checked = !!data.noDerive;
      noDeriveEl.dispatchEvent(new Event('change', { bubbles: true }));
    }

    // Populate file list
    if (iaFiles) {
      iaFiles.innerHTML = '';
      if (Array.isArray(data.files) && data.files.length > 0) {
        data.files.forEach(fp => {
          if (window.addSortableItem) {
            window.addSortableItem(iaFiles, fp);
          }
        });
      } else {
        iaFiles.innerHTML = '<div class="sortable-empty-state">No files selected. Use the browse button to add files.</div>';
      }
    }

    // Open advanced accordion if any advanced option has a value
    const hasAdv = !!(data.creator || data.date || data.dateY || data.language || data.license || data.mediatype || data.noDerive);
    const advBody = document.getElementById('ia-adv');
    const advToggle = document.querySelector('.form-adv-toggle[data-adv="ia-adv"]');
    if (hasAdv && advBody && !advBody.classList.contains('open')) {
      advBody.classList.add('open');
      if (advToggle) advToggle.setAttribute('aria-expanded', 'true');
    }

    // Visual feedback (flash highlight)
    [iaIdUp, iaTitle, descEl, subjEl].forEach(el => {
      if (el) {
        el.classList.add('flash-highlight');
        setTimeout(() => el.classList.remove('flash-highlight'), 1200);
      }
    });
  };

  // Queue Builder Logic
  const addActionBtn = document.getElementById('ia-edit-add-action');
  const queueList = document.getElementById('ia-edit-queue-list');
  const actionSelect = document.getElementById('ia-edit-action');
  const keyGroup = document.getElementById('ia-edit-key-group');
  const valueGroup = document.getElementById('ia-edit-value-group');
  const filesGroup = document.getElementById('ia-edit-files-group');
  
  const keyInput = document.getElementById('ia-edit-key');
  const valInput = document.getElementById('ia-edit-value');
  const filesList = document.getElementById('ia-edit-files');
  
  let queuedEdits = [];

  const updateQueueUI = () => {
    queueList.innerHTML = '';
    if (queuedEdits.length === 0) {
      queueList.innerHTML = '<div class="ia-edit-queue-empty">No actions queued. Add actions above.</div>';
      return;
    }
    
    queuedEdits.forEach((edit, index) => {
      const pill = document.createElement('div');
      pill.className = 'ia-edit-pill';
      
      let actionText = '';
      let contentText = '';
      
      if (edit.action === 'upload') {
        actionText = '📁 Upload';
        contentText = `${edit.files.length} file(s)`;
      } else {
        const actionLabels = {
          'modify': '✎ Modify',
          'append': '+ Append',
          'append-list': '▤ Add Tag',
          'remove': '✖ Remove'
        };
        actionText = actionLabels[edit.action] || edit.action;
        contentText = edit.action === 'remove' ? edit.key : `${edit.key}: "${edit.val}"`;
      }
      
      pill.innerHTML = `
        <span class="ia-edit-pill-action">${actionText}</span>
        <span class="ia-edit-pill-content">${contentText}</span>
        <button class="ia-edit-pill-remove" title="Remove action">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
            <path d="M18 6L6 18M6 6l12 12"></path>
          </svg>
        </button>
      `;
      
      pill.querySelector('.ia-edit-pill-remove').addEventListener('click', (e) => {
        e.preventDefault();
        queuedEdits.splice(index, 1);
        updateQueueUI();
      });
      
      queueList.appendChild(pill);
    });
  };

  actionSelect.addEventListener('change', () => {
    if (actionSelect.value === 'upload') {
      keyGroup.style.display = 'none';
      valueGroup.style.display = 'none';
      filesGroup.style.display = '';
    } else {
      keyGroup.style.display = '';
      valueGroup.style.display = '';
      filesGroup.style.display = 'none';
    }
  });

  filesList.addEventListener('change', () => {
    const items = Array.from(filesList.querySelectorAll('.sortable-item'));
    if (items.length === 0) {
      filesList.innerHTML = '<div class="sortable-empty-state">No files selected. Use the browse button to add files.</div>';
    }
  });

  addActionBtn.addEventListener('click', (e) => {
    e.preventDefault();
    const action = actionSelect.value;
    
    if (action === 'upload') {
      const files = Array.from(filesList.querySelectorAll('.sortable-item')).map(el => el.dataset.path);
      if (files.length === 0) {
        appendLog(log, '⚠ Please select at least one file before adding to queue.', 'warning');
        return;
      }
      queuedEdits.push({ action, files });
      filesList.innerHTML = '<div class="sortable-empty-state">No files selected. Use the browse button to add files.</div>';
    } else {
      const key = keyInput.value.trim();
      const val = valInput.value.trim();
      
      if (!key) {
        appendLog(log, '⚠ Please provide a metadata key.', 'warning');
        return;
      }
      queuedEdits.push({ action, key, val });
      keyInput.value = '';
      valInput.value = '';
    }
    
    updateQueueUI();
  });

  const editResetBtn = document.getElementById('ia-edit-reset');
  if (editResetBtn) {
    editResetBtn.addEventListener('click', (e) => {
      e.preventDefault();
      document.getElementById('ia-identifier-edit').value = '';
      updateCharCount(iaIdEdit, iaIdEditCount);
      keyInput.value = '';
      valInput.value = '';
      filesList.innerHTML = '<div class="sortable-empty-state">No files selected. Use the browse button to add files.</div>';
      queuedEdits = [];
      updateQueueUI();
    });
  }

  // Edit Logic
  setupRun(
    document.getElementById('ia-edit-run'),
    editStop,
    'IA Edit Metadata',
    window.api.runIaEdit,
    () => {
      const identifier = document.getElementById('ia-identifier-edit').value.trim();
      if (!identifier) { appendLog(log, '⚠ Please provide an identifier.', 'error'); return null; }

      if (queuedEdits.length === 0) { 
        appendLog(log, '⚠ Please add at least one edit action to the queue.', 'error'); 
        return null; 
      }
      
      const autoIa = getSetting('dep-auto-ia');
      const historyEntry = {
        id: 'ia-edit-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7),
        date: new Date().toISOString(),
        tool: 'Internet Archive',
        subTool: 'edit',
        name: identifier,
        source: `archive.org/details/${identifier}`,
        output: `${queuedEdits.length} Action(s)`,
        status: 'running'
      };
      log._currentIaJob = historyEntry;
      if (window.api && window.api.addHistory && (!window.shouldRecordHistory || window.shouldRecordHistory(historyEntry))) {
        window.api.addHistory(historyEntry).then(() => {
          if (window._refreshHistory) window._refreshHistory();
        });
      }
      return { identifier, actions: queuedEdits, autoIa };
    }
  );

  // Download Logic
  setupRun(
    document.getElementById('ia-download-run'),
    downloadStop,
    'IA Download',
    window.api.runIaDownload,
    () => {
      const identifier = document.getElementById('ia-identifier-down').value.trim();
      const outputDir = document.getElementById('ia-output').value.trim();

      if (!identifier) { appendLog(log, '⚠ Please provide an identifier to download.', 'error'); return null; }
      if (identifier.length < 5 || identifier.length > 100) { appendLog(log, '⚠ Identifier must be between 5 and 100 characters.', 'error'); return null; }
      if (!outputDir) { appendLog(log, '⚠ Please specify an output directory.', 'error'); return null; }

      const autoIa = getSetting('dep-auto-ia');
      const historyEntry = {
        id: 'ia-dl-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7),
        date: new Date().toISOString(),
        tool: 'Internet Archive',
        subTool: 'download',
        name: identifier,
        source: `archive.org/details/${identifier}`,
        output: outputDir,
        status: 'running'
      };
      log._currentIaJob = historyEntry;
      if (window.api && window.api.addHistory && (!window.shouldRecordHistory || window.shouldRecordHistory(historyEntry))) {
        window.api.addHistory(historyEntry).then(() => {
          if (window._refreshHistory) window._refreshHistory();
        });
      }
      return { identifier, outputDir, autoIa };
    }
  );

  const iaDownInput = document.getElementById('ia-identifier-down');
  if (iaDownInput) {
    iaDownInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        document.getElementById('ia-download-run')?.click();
      }
    });
  }

  // Check IA auth on load
  setTimeout(async () => {
    try {
      const autoIa = getSetting('dep-auto-ia');
      const isAuth = await window.api.checkIaAuth(autoIa);
      if (isAuth) {
        configBtn.innerText = 'Logged into IA';
        configBtn.classList.remove('btn-ghost');
        configBtn.classList.add('btn-success');
      }
    } catch (err) {
      console.error('Failed to check IA auth on load', err);
    }
  }, 500);

})();
