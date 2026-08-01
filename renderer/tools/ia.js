/* ── 9. Internet Archive ───────────────────────────────────── */
(function () {
  const log = document.getElementById('ia-log');

  const modeBtns = document.querySelectorAll('#ia-mode-toggle .segment');
  const uploadForm = document.getElementById('ia-upload-form');
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
        downloadForm.style.display = 'none';
        downloadForm.classList.add('hidden');
      } else {
        uploadForm.style.display = 'none';
        uploadForm.classList.add('hidden');
        downloadForm.style.display = '';
        downloadForm.classList.remove('hidden');
      }
    });
  });

  document.getElementById('ia-upload-clear').addEventListener('click', () => clearLog(log));
  document.getElementById('ia-download-clear').addEventListener('click', () => clearLog(log));
  
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
      // If user clears it completely, allow auto-populating again
      idModifiedByUser = e.target.value.length > 0;
    });
    iaIdUp.addEventListener('blur', () => {
      if (iaIdUp.value) {
        iaIdUp.value = iaIdUp.value.toLowerCase().replace(/[\s_]+/g, '-').replace(/[^a-z0-9-]/g, '').replace(/-+/g, '-').replace(/^-|-$/g, '');
        iaIdUp.dispatchEvent(new Event('change', { bubbles: true }));
      }
    });
    iaTitle.addEventListener('input', () => {
      if (!idModifiedByUser) {
        iaIdUp.value = iaTitle.value.toLowerCase().replace(/[\s_]+/g, '-').replace(/[^a-z0-9-]/g, '').replace(/-+/g, '-').replace(/^-|-$/g, '');
        iaIdUp.dispatchEvent(new Event('input', { bubbles: true }));
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
    
    iaFiles.addEventListener('change', () => {
      const items = Array.from(iaFiles.querySelectorAll('.sortable-item'));
      if (items.length > 0) {
        const firstFile = items[0].dataset.path;
        if (firstFile) {
          const filenameWithExt = firstFile.split(/[/\\]/).pop();
          const lastDot = filenameWithExt.lastIndexOf('.');
          const filename = lastDot > 0 ? filenameWithExt.substring(0, lastDot) : filenameWithExt;
          const ext = lastDot > 0 ? filenameWithExt.substring(lastDot + 1).toLowerCase() : '';
          
          if (!titleModifiedByUser) {
            iaTitle.value = filename;
            // Dispatch synthetic event so identifier also updates!
            iaTitle.dispatchEvent(new Event('input', { bubbles: true }));
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
      } else {
        if (!titleModifiedByUser) {
          iaTitle.value = '';
          iaTitle.dispatchEvent(new Event('input', { bubbles: true }));
        }
      }
    });
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
