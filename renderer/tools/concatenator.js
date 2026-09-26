/* ── 7. Video Concatenator ───────────────────────────────── */
(function () {
  const log      = document.getElementById('concat-log');
  const runBtn   = document.getElementById('concat-run');
  const pauseBtn = document.getElementById('concat-pause');
  const stopBtn  = document.getElementById('concat-stop');
  const checkBtn = document.getElementById('concat-check');
  const fileList = document.getElementById('concat-file-list');
  let currentPid = null;
  let isPaused   = false;

  const pauseIconHTML  = pauseBtn.innerHTML;
  const resumeIconHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none"><polygon points="5 3 19 12 5 21 5 3" fill="currentColor"/></svg> Resume`;

  document.getElementById('concat-clear').addEventListener('click', () => clearLog(log));
  stopBtn.addEventListener('click', () => {
    if (currentPid) window.api.stopScript(currentPid);
    isPaused = false;
    pauseBtn.innerHTML = pauseIconHTML;
    pauseBtn.classList.remove('paused');
    runBtn.classList.remove('hidden');
    checkBtn?.classList.remove('hidden');
    runBtn.removeAttribute('disabled');
    checkBtn?.removeAttribute('disabled');
    pauseBtn.classList.add('hidden');
    stopBtn.classList.add('hidden');
  });

  if (fileList) {
    window.updateSortableListState(fileList);
    fileList.addEventListener('change', () => window.updateSortableListState(fileList));
  }
  
  // Initialize right-click context menu text if saved
  const savedQuality = localStorage.getItem('field:concat-quality');
  if (savedQuality) {
    const toggle = document.getElementById('concat-force');
    const desc = document.querySelector('#concat-force-toggle .toggle-desc');
    if (toggle) toggle.dataset.quality = savedQuality;
    if (desc) {
      const capVal = savedQuality.charAt(0).toUpperCase() + savedQuality.slice(1);
      desc.textContent = `Force a full re-encode using ${capVal} quality settings.`;
    }
  }

  pauseBtn.addEventListener('click', () => {
    if (!currentPid) return;
    if (!isPaused) {
      isPaused = true;
      window.api.pauseScript(currentPid);
      pauseBtn.innerHTML = resumeIconHTML;
      pauseBtn.classList.add('paused');
      appendLog(log, '⏸ Paused.', 'info');
    } else {
      isPaused = false;
      window.api.resumeScript(currentPid);
      pauseBtn.innerHTML = pauseIconHTML;
      pauseBtn.classList.remove('paused');
      appendLog(log, '▶ Resumed.', 'info');
    }
  });

  const checkModal = document.getElementById('concat-check-modal');
  const checkModalClose = document.getElementById('concat-check-modal-close');
  const checkModalCancel = document.getElementById('concat-check-modal-cancel');
  const checkModalMerge = document.getElementById('concat-check-modal-merge');
  const checkModalBody = document.getElementById('concat-check-modal-body');
  const checkModalSummary = document.getElementById('concat-check-modal-summary');
  const checkModalOutputSection = document.getElementById('concat-check-output-section');
  const checkModalOutputName = document.getElementById('concat-check-output-name');
  const checkModalSuggestBtn = document.getElementById('concat-check-suggest-btn');
  const checkModalOutputError = document.getElementById('concat-check-output-error');
  const checkModalOutputDirHint = document.getElementById('concat-check-output-dir-hint');
  const mainOutputName = document.getElementById('concat-output-name');
  const mainOutputDir = document.getElementById('concat-output-dir');

  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function getSuggestedOutputName(files) {
    if (!files || files.length === 0) return 'merged_video.mp4';
    const first = files[0];
    const basename = first.split(/[\\/]/).pop() || '';
    const lastDot = basename.lastIndexOf('.');
    const ext = lastDot > 0 ? basename.slice(lastDot) : '.mp4';
    const nameWithoutExt = lastDot > 0 ? basename.slice(0, lastDot) : basename;
    const cleanName = nameWithoutExt.replace(/[-_ ]*(part|pt|disc|cd)?[-_ ]*\d+$/i, '').trim();
    const base = cleanName || nameWithoutExt || 'merged_video';
    return `${base}_merged${ext}`;
  }

  function closeCheckModal() {
    if (checkModal) checkModal.style.display = 'none';
  }

  checkModalClose?.addEventListener('click', closeCheckModal);
  checkModalCancel?.addEventListener('click', closeCheckModal);
  checkModal?.addEventListener('click', (e) => {
    if (e.target === checkModal) closeCheckModal();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && checkModal && checkModal.style.display === 'flex') {
      closeCheckModal();
    }
  });

  checkModalOutputName?.addEventListener('input', () => {
    if (checkModalOutputError) checkModalOutputError.style.display = 'none';
    if (mainOutputName) {
      mainOutputName.value = checkModalOutputName.value;
      mainOutputName.dispatchEvent(new Event('input', { bubbles: true }));
    }
  });

  checkModalSuggestBtn?.addEventListener('click', () => {
    const files = Array.from(fileList.querySelectorAll('.sortable-item')).map(el => el.dataset.path);
    const suggested = getSuggestedOutputName(files);
    if (checkModalOutputName) checkModalOutputName.value = suggested;
    if (mainOutputName) {
      mainOutputName.value = suggested;
      mainOutputName.dispatchEvent(new Event('input', { bubbles: true }));
    }
    if (checkModalOutputError) checkModalOutputError.style.display = 'none';
    checkModalOutputName?.focus();
  });

  checkModalMerge?.addEventListener('click', () => {
    let nameVal = (checkModalOutputName ? checkModalOutputName.value.trim() : '') || (mainOutputName ? mainOutputName.value.trim() : '');
    
    if (!nameVal) {
      if (checkModalOutputError && checkModalOutputName) {
        checkModalOutputError.textContent = '⚠ Please enter an output filename before proceeding to merge.';
        checkModalOutputError.style.display = 'block';
        checkModalOutputName.focus();
        checkModalOutputName.classList.add('flash-highlight');
        setTimeout(() => checkModalOutputName.classList.remove('flash-highlight'), 1200);
      }
      return;
    }

    // Ensure filename has a valid video extension
    if (!/\.[a-zA-Z0-9]{2,5}$/.test(nameVal)) {
      const files = Array.from(fileList.querySelectorAll('.sortable-item')).map(el => el.dataset.path);
      const firstExt = files[0] && files[0].includes('.') ? files[0].slice(files[0].lastIndexOf('.')) : '.mp4';
      nameVal += firstExt;
    }

    if (mainOutputName) {
      mainOutputName.value = nameVal;
      mainOutputName.dispatchEvent(new Event('input', { bubbles: true }));
    }
    if (checkModalOutputName) {
      checkModalOutputName.value = nameVal;
    }

    closeCheckModal();
    runBtn.click();
  });

  if (checkBtn) {
    checkBtn.addEventListener('click', async () => {
      const files = Array.from(fileList.querySelectorAll('.sortable-item')).map(el => el.dataset.path);

      if (files.length < 2) {
        if (checkModal && checkModalBody) {
          checkModalBody.innerHTML = `
            <div style="background: rgba(255, 85, 100, 0.1); border-left: 3px solid var(--danger, #ff5564); padding: 12px 16px; border-radius: 6px;">
              <div style="font-weight: 600; font-size: 13px; color: var(--danger, #ff5564); margin-bottom: 4px;">⚠ Insufficient Files</div>
              <div style="font-size: 12px; color: var(--text);">Please select at least 2 video files to check compatibility.</div>
            </div>
          `;
          if (checkModalSummary) checkModalSummary.textContent = '';
          if (checkModalMerge) checkModalMerge.style.display = 'none';
          checkModal.style.display = 'flex';
        }
        return;
      }

      if (checkModal && checkModalBody) {
        if (checkModalOutputSection) checkModalOutputSection.style.display = 'none';
        checkModalBody.innerHTML = `
          <div style="text-align: center; padding: 36px 16px; color: var(--text-muted);">
            <div style="width: 28px; height: 28px; border: 2.5px solid var(--border); border-top-color: var(--accent); border-radius: 50%; animation: spin 0.8s linear infinite; margin: 0 auto 12px;"></div>
            <div style="font-size: 14px; font-weight: 500; color: var(--text);">Checking video files for compatibility and stream health...</div>
            <div style="font-size: 12px; margin-top: 4px; color: var(--text-muted);">Probing ${files.length} files with ffprobe</div>
          </div>
        `;
        if (checkModalSummary) checkModalSummary.textContent = `Analyzing ${files.length} files...`;
        if (checkModalMerge) checkModalMerge.style.display = 'none';
        checkModal.style.display = 'flex';
      }

      checkBtn.setAttribute('disabled', 'true');

      try {
        const res = await window.api.checkConcatFiles({ files });
        checkBtn.removeAttribute('disabled');

        if (!res || !res.success) {
          if (checkModalOutputSection) checkModalOutputSection.style.display = 'none';
          checkModalBody.innerHTML = `
            <div style="background: rgba(255, 85, 100, 0.1); border-left: 3px solid var(--danger, #ff5564); padding: 12px 16px; border-radius: 6px;">
              <div style="font-weight: 600; font-size: 13px; color: var(--danger, #ff5564); margin-bottom: 4px;">Check Failed</div>
              <div style="font-size: 12px; color: var(--text); white-space: pre-wrap;">${escapeHtml(res ? res.error : 'An unknown error occurred while analyzing the files.')}</div>
            </div>
          `;
          if (checkModalSummary) checkModalSummary.textContent = 'Analysis incomplete';
          if (checkModalMerge) checkModalMerge.style.display = 'none';
          return;
        }

        // Status Banner
        let bannerHtml = '';
        if (res.isCompatible) {
          bannerHtml = `
            <div style="background: rgba(61, 220, 151, 0.1); border-left: 3px solid var(--success, #3ddc97); padding: 12px 16px; border-radius: 6px; display: flex; align-items: flex-start; gap: 10px;">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--success, #3ddc97)" stroke-width="2" style="flex-shrink: 0; margin-top: 1px;">
                <polyline points="20 6 9 17 4 12"></polyline>
              </svg>
              <div>
                <div style="font-weight: 600; font-size: 13px; color: var(--success, #3ddc97);">[Concatenator Checks Passed] All Compatible</div>
                <div style="font-size: 12px; color: var(--text); margin-top: 2px;">All video and audio streams match. Safe for direct lossless stream copy merging (-c copy).</div>
              </div>
            </div>
          `;
        } else {
          bannerHtml = `
            <div style="background: rgba(255, 179, 71, 0.1); border-left: 3px solid var(--warning, #ffb347); padding: 12px 16px; border-radius: 6px; display: flex; align-items: flex-start; gap: 10px;">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--warning, #ffb347)" stroke-width="2" style="flex-shrink: 0; margin-top: 1px;">
                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
                <line x1="12" y1="9" x2="12" y2="13"></line>
                <line x1="12" y1="17" x2="12.01" y2="17"></line>
              </svg>
              <div>
                <div style="font-weight: 600; font-size: 13px; color: var(--warning, #ffb347);">[Warning] Mismatched Stream Properties Detected</div>
                <div style="font-size: 12px; color: var(--text); margin-top: 4px; line-height: 1.5;">
                  ${res.warnings.map(w => `• ${escapeHtml(w)}`).join('<br>')}
                </div>
                <div style="font-size: 11.5px; color: var(--text-muted); margin-top: 6px;">
                  💡 Recommendation: Check "Force re-encode all videos" before merging to ensure uniform playback without freezes.
                </div>
              </div>
            </div>
          `;
        }

        // File Cards
        const fileCardsHtml = res.files.map(f => `
          <div style="background: var(--bg-elevated); border: 1px solid var(--border); border-radius: 6px; padding: 10px 14px; display: flex; flex-direction: column; gap: 6px;">
            <div style="display: flex; align-items: center; justify-content: space-between; gap: 8px;">
              <div style="display: flex; align-items: center; gap: 8px; min-width: 0;">
                <span class="sortable-item-index" style="width: 20px; height: 20px; font-size: 11px;">${f.index}</span>
                <span style="font-weight: 600; font-size: 13px; color: var(--text); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${escapeHtml(f.baseName)}">${escapeHtml(f.baseName)}</span>
              </div>
              <span class="sortable-item-size" style="flex-shrink: 0;">${escapeHtml(f.formattedSize)}</span>
            </div>
            <div style="display: flex; flex-wrap: wrap; gap: 14px; font-size: 12px; color: var(--text-muted); padding-left: 28px;">
              <div><span style="color: var(--text-subtle);">Duration:</span> <strong style="color: var(--text);">${escapeHtml(f.formattedDuration)}</strong></div>
              <div><span style="color: var(--text-subtle);">Video:</span> <strong style="color: var(--text);">${escapeHtml(f.videoSummary)}</strong></div>
              <div><span style="color: var(--text-subtle);">Audio:</span> <strong style="color: var(--text);">${escapeHtml(f.audioSummary)}</strong></div>
            </div>
            ${f.hasThumbnail ? `
              <div style="display: flex; align-items: center; gap: 6px; font-size: 11px; color: #ffb347; background: rgba(255, 179, 71, 0.1); border-radius: 4px; padding: 4px 8px; margin-left: 28px; margin-top: 2px;">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>
                <span>${escapeHtml(f.thumbnailNotice)}</span>
              </div>
            ` : ''}
          </div>
        `).join('');

        // Summary strip
        const summaryStripHtml = `
          <div style="background: rgba(255, 255, 255, 0.02); border: 1px dashed var(--border); border-radius: 6px; padding: 10px 14px; display: flex; align-items: center; justify-content: space-between; font-size: 12px; color: var(--text-muted);">
            <span>Total input: <strong style="color: var(--text);">${escapeHtml(res.formattedTotalSize)}</strong> across <strong style="color: var(--text);">${res.totalFiles}</strong> files</span>
            <span>Expected duration: <strong style="color: var(--text);">~${escapeHtml(res.formattedTotalDuration)}</strong></span>
          </div>
        `;

        checkModalBody.innerHTML = bannerHtml + fileCardsHtml + summaryStripHtml;
        if (checkModalSummary) {
          checkModalSummary.textContent = `${res.totalFiles} files analyzed • Total: ${res.formattedTotalSize}`;
        }
        if (checkModalMerge) {
          checkModalMerge.style.display = 'inline-flex';
        }

        // Output Filename Section Handling
        if (checkModalOutputSection) {
          const destDir = mainOutputDir?.value.trim() || (files[0] ? files[0].replace(/[\\/][^\\/]+$/, '') : '');
          if (checkModalOutputDirHint) {
            checkModalOutputDirHint.textContent = destDir ? `Save in: ${destDir}` : '';
            checkModalOutputDirHint.title = destDir || '';
          }
          let currentName = mainOutputName?.value.trim() || '';
          if (!currentName) {
            currentName = getSuggestedOutputName(files);
            if (mainOutputName) {
              mainOutputName.value = currentName;
              mainOutputName.dispatchEvent(new Event('input', { bubbles: true }));
            }
          }
          if (checkModalOutputName) {
            checkModalOutputName.value = currentName;
          }
          if (checkModalOutputError) {
            checkModalOutputError.style.display = 'none';
            checkModalOutputError.textContent = '';
          }
          checkModalOutputSection.style.display = 'block';
        }
      } catch (err) {
        checkBtn.removeAttribute('disabled');
        if (checkModalOutputSection) checkModalOutputSection.style.display = 'none';
        checkModalBody.innerHTML = `
          <div style="background: rgba(255, 85, 100, 0.1); border-left: 3px solid var(--danger, #ff5564); padding: 12px 16px; border-radius: 6px;">
            <div style="font-weight: 600; font-size: 13px; color: var(--danger, #ff5564); margin-bottom: 4px;">Error</div>
            <div style="font-size: 12px; color: var(--text);">${escapeHtml(err.message)}</div>
          </div>
        `;
        if (checkModalSummary) checkModalSummary.textContent = 'Check encountered an error';
        if (checkModalMerge) checkModalMerge.style.display = 'none';
      }
    });
  }

  runBtn.addEventListener('click', () => {
    const files      = Array.from(fileList.querySelectorAll('.sortable-item')).map(el => el.dataset.path);
    const outputInput = document.getElementById('concat-output-name');
    const output     = outputInput ? outputInput.value.trim() : '';
    const outputDir  = document.getElementById('concat-output-dir').value.trim();
    const forceToggle = document.getElementById('concat-force');
    const forceEncode = forceToggle?.checked;
    const useMkvFix = document.getElementById('concat-mkv')?.checked;
    const quality = forceToggle?.dataset?.quality || localStorage.getItem('field:concat-quality') || 'medium';

    if (files.length < 2) { appendLog(log, '⚠ Please select at least 2 video files.', 'error'); return; }
    if (!output) {
      appendLog(log, '⚠ Please enter an output filename.', 'error');
      if (outputInput) {
        outputInput.focus();
        outputInput.classList.add('flash-highlight');
        setTimeout(() => outputInput.classList.remove('flash-highlight'), 1200);
      }
      return;
    }

    clearLog(log);
    appendLog(log, `▶ Starting concatenation...`, 'info');
    appendLog(log, `  Files: ${files.length}`, 'cmd');
    appendLog(log, `  Output: ${output}`, 'cmd');
    if (forceEncode) appendLog(log, `  Force re-encode: Yes (Quality: ${quality})`, 'cmd');
    if (useMkvFix) appendLog(log, '  Use MKV Sync: Yes', 'cmd');
    appendLog(log, '', 'stdout');
    markBodyStart(log);

    currentPid = null;
    isPaused   = false;
    pauseBtn.innerHTML = pauseIconHTML;
    pauseBtn.classList.remove('paused');
    runBtn.classList.add('hidden');
    checkBtn?.classList.add('hidden');
    pauseBtn.classList.remove('hidden');
    stopBtn.classList.remove('hidden');

    window.api.runConcatenator({ files, output, forceEncode: !!forceEncode, useMkvFix: !!useMkvFix, quality, outputDir: outputDir || '' });
  });

  if (window.api && window.api.onConcatenatorOutput) {
    window.api.onConcatenatorOutput((data) => {
      if (data.type === 'pid') {
        if (!currentPid) incRunning('Concatenator');
        currentPid = data.pid;
        runBtn.classList.add('hidden');
        checkBtn?.classList.add('hidden');
        pauseBtn.classList.remove('hidden');
        stopBtn.classList.remove('hidden');
        if (isPaused) {
          pauseBtn.innerHTML = resumeIconHTML;
          pauseBtn.classList.add('paused');
        }
        return;
      }
      handleOutput(log, data, () => {
        runBtn.classList.remove('hidden');
        checkBtn?.classList.remove('hidden');
        runBtn.removeAttribute('disabled');
        checkBtn?.removeAttribute('disabled');
        pauseBtn.classList.add('hidden');
        stopBtn.classList.add('hidden');
        pauseBtn.innerHTML = pauseIconHTML;
        pauseBtn.classList.remove('paused');
        isPaused = false;
        currentPid = null;
        decRunning('Concatenator');
      });
    });
  }
})();
