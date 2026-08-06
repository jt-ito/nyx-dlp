/* ── 9. Internet Archive ───────────────────────────────────── */
(function () {
  const log = document.getElementById('ia-log');

  const modeBtns = document.querySelectorAll('#ia-mode-toggle .segment');
  const uploadForm = document.getElementById('ia-upload-form');
  const editForm = document.getElementById('ia-edit-form');
  const downloadForm = document.getElementById('ia-download-form');

  let currentPid = null;
  
  // Mode switching
  modeBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      modeBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const mode = btn.dataset.mode;
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
    });
  });

  document.getElementById('ia-upload-clear').addEventListener('click', () => clearLog(log));
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
  resetSubmit.addEventListener('click', () => {
    document.getElementById('ia-identifier-up').value = '';
    document.getElementById('ia-title').value = '';
    document.getElementById('ia-description').value = '';
    document.getElementById('ia-creator').value = '';
    document.getElementById('ia-date-y').value = '';
    document.getElementById('ia-date-m').value = '';
    document.getElementById('ia-date-d').value = '';
    document.getElementById('ia-subject').value = '';
    document.getElementById('ia-license').value = '';
    document.getElementById('ia-collection').value = 'opensource_movies';
    document.getElementById('ia-mediatype').value = '';
    document.getElementById('ia-language').value = '';
    const fileList = document.getElementById('ia-files');
    if (fileList) fileList.innerHTML = '<div class="sortable-empty-state">No files selected. Use the browse button to add files.</div>';
    
    // Also reset identifier tracking
    idModifiedByUser = false;
    titleModifiedByUser = false;

    resetModal.style.display = 'none';
  });
  
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

  // Auto-populate Identifier from Title
  const iaTitle = document.getElementById('ia-title');
  const iaIdUp = document.getElementById('ia-identifier-up');
  let idModifiedByUser = !!(iaIdUp && iaIdUp.value); // if it has a value on load from persistence, assume modified unless empty

  if (iaTitle && iaIdUp) {
    iaIdUp.addEventListener('input', (e) => {
      if (e.isTrusted) {
        // If user clears it completely, allow auto-populating again
        idModifiedByUser = e.target.value.length > 0;
      }
    });
    iaIdUp.addEventListener('blur', () => {
      if (iaIdUp.value) {
        iaIdUp.value = iaIdUp.value.toLowerCase().replace(/[\s_]+/g, '-').replace(/[^a-z0-9-]/g, '').replace(/-+/g, '-').replace(/^-|-$/g, '');
        iaIdUp.dispatchEvent(new Event('change', { bubbles: true }));
      }
    });

  }

  // Auto-populate Title and Collection from File Selection
  const iaFiles = document.getElementById('ia-files');
  const iaCollection = document.getElementById('ia-collection');
  let titleModifiedByUser = !!(iaTitle && iaTitle.value);
  let collectionModifiedByUser = false;

  if (iaCollection) {
    iaCollection.addEventListener('change', (e) => {
      if (e.isTrusted) {
        collectionModifiedByUser = true;
      }
    });
  }

  if (iaTitle && iaFiles) {
    iaTitle.addEventListener('input', (e) => {
      if (e.isTrusted) { // Only mark as user modified if it was an actual user typing
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
            iaIdUp.value = filename.toLowerCase().replace(/[\s_]+/g, '-').replace(/[^a-z0-9-]/g, '').replace(/-+/g, '-').replace(/^-|-$/g, '');
            iaIdUp.dispatchEvent(new Event('input', { bubbles: true }));
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
  
  const stopHandler = () => { if (currentPid) window.api.stopScript(currentPid); };
  uploadStop.addEventListener('click', stopHandler);
  downloadStop.addEventListener('click', stopHandler);

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
    configBtn.innerText = 'Login to IA';

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

      window.api.removeAllListeners('ia-output');
      window.api.onIaOutput((data) => {
        if (data.type === 'pid') { currentPid = data.pid; return; }
        handleOutput(log, data, () => {
          runBtn.classList.remove('hidden');
          stopBtn.classList.add('hidden');
          decRunning('Internet Archive');
        });
      });

      apiCall(opts);
    });
  }

  // Upload Logic
  setupRun(
    document.getElementById('ia-upload-run'),
    uploadStop,
    'IA Upload',
    window.api.runIaUpload,
    async () => {
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

      const showError = (msg) => {
        appendLog(log, msg, 'error');
        log.parentElement.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        return null;
      };

      if (files.length === 0) return showError('⚠ Please select at least one file to upload.');
      if (!identifier) return showError('⚠ Please provide an identifier.');
      if (identifier.length < 5 || identifier.length > 100) return showError('⚠ Identifier must be between 5 and 100 characters.');
      if (!description) return showError('⚠ Please provide a description.');
      if (!subject) return showError('⚠ Please provide subject tags.');

      fetch(`https://archive.org/metadata/${identifier}`)
        .then(res => res.json())
        .then(data => {
          if (data && data.metadata) {
            appendLog(log, `⚠ Identifier '${identifier}' already exists. If you do not own it, the upload will fail with Access Denied.`, 'warning');
          }
        })
        .catch(err => {}); // Ignore if fetch fails

      const autoIa = getSetting('dep-auto-ia');
      return {
        files, identifier, title, description, subject, collection, creator, date, language, license, mediatype, noDerive, autoIa
      };
    }
  );

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
      keyInput.value = '';
      valInput.value = '';
      filesList.innerHTML = '<div class="sortable-empty-state">No files selected. Use the browse button to add files.</div>';
      queuedEdits = [];
      updateQueueUI();
    });
  }

  // Edit Logic
  const editStop = document.getElementById('ia-edit-stop');
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
      return { identifier, outputDir, autoIa };
    }
  );

})();
