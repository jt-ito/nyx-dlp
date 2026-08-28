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

  if (resetSubmit) {
    resetSubmit.addEventListener('click', () => {
      if (iaIdUp) iaIdUp.value = '';
      updateCharCount(iaIdUp, iaIdUpCount);
      if (iaTitle) iaTitle.value = '';
      const iaDesc = document.getElementById('ia-description');
      if (iaDesc) iaDesc.value = '';
      const iaCreator = document.getElementById('ia-creator');
      if (iaCreator) iaCreator.value = '';
      const dY = document.getElementById('ia-date-y');
      const dM = document.getElementById('ia-date-m');
      const dD = document.getElementById('ia-date-d');
      if (dY) dY.value = '';
      if (dM) dM.value = '';
      if (dD) dD.value = '';
      const iaSubj = document.getElementById('ia-subject');
      if (iaSubj) iaSubj.value = '';
      const iaLic = document.getElementById('ia-license');
      if (iaLic) iaLic.value = '';
      const iaCol = document.getElementById('ia-collection');
      if (iaCol) iaCol.value = 'opensource_movies';
      const iaMed = document.getElementById('ia-mediatype');
      if (iaMed) iaMed.value = '';
      const iaLang = document.getElementById('ia-language');
      if (iaLang) iaLang.value = '';
      const fileList = document.getElementById('ia-files');
      if (fileList) fileList.innerHTML = '<div class="sortable-empty-state">No files selected. Use the browse button to add files.</div>';

      idModifiedByUser = false;
      titleModifiedByUser = false;
      collectionModifiedByUser = false;

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
      if (data.type === 'pid') {
        currentPid = data.pid;
        return;
      }
      handleOutput(log, data, () => {
        document.querySelectorAll('#ia-upload-run, #ia-edit-run, #ia-download-run').forEach(b => b.classList.remove('hidden'));
        document.querySelectorAll('#ia-upload-stop, #ia-edit-stop, #ia-download-stop').forEach(b => b.classList.add('hidden'));
        currentPid = null;
        decRunning('Internet Archive');
      });
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
      if (identifier.length < 5) return showError('⚠ Identifier must be at least 5 characters.');
      if (identifier.length > 100) return showError(`⚠ Identifier exceeds the 100-character maximum limit (${identifier.length}/100). Please shorten it before uploading.`);
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

      // Record to history right as the upload starts
      const historyId = 'ia-up-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7);
      const downloadName = title || (files.length > 0 ? files[0].split(/[\\/]/).pop() : identifier);
      const historyEntry = {
        id: historyId,
        date: new Date().toISOString(),
        tool: 'Internet Archive',
        subTool: 'upload',
        name: downloadName,
        source: identifier ? `archive.org/details/${identifier}` : `${files.length} File(s)`,
        output: `https://archive.org/details/${identifier}`,
        status: 'running',
        uploadData: {
          files: [...files],
          identifier,
          title,
          description,
          subject,
          collection,
          creator,
          date,
          dateY: y,
          dateM: m,
          dateD: d,
          language,
          license,
          mediatype,
          noDerive
        }
      };
      log._currentIaJob = historyEntry;
      if (window.api && window.api.addHistory && (!window.shouldRecordHistory || window.shouldRecordHistory(historyEntry))) {
        window.api.addHistory(historyEntry).then(() => {
          if (window._refreshHistory) window._refreshHistory();
        });
      }

      return {
        files, identifier, title, description, subject, collection, creator, date, language, license, mediatype, noDerive, autoIa
      };
    }
  );

  window.fillIaUploadForm = function (data) {
    if (!data) return;

    // Switch tab to IA
    const iaNavBtn = document.querySelector('.nav-item[data-tab="ia"]');
    if (iaNavBtn) iaNavBtn.click();

    // Switch mode to Upload
    const uploadModeBtn = document.querySelector('#ia-mode-toggle .segment[data-mode="upload"]');
    if (uploadModeBtn) uploadModeBtn.click();

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
