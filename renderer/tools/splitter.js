/* ── 6. Video Splitter ───────────────────────────────────── */
(function () {
  const log      = document.getElementById('sp-log');
  const runBtn   = document.getElementById('sp-run');
  const pauseBtn = document.getElementById('sp-pause');
  const stopBtn  = document.getElementById('sp-stop');
  let currentPid = null;
  let isPaused   = false;

  const pauseIconHTML  = pauseBtn.innerHTML;
  const resumeIconHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none"><polygon points="5 3 19 12 5 21 5 3" fill="currentColor"/></svg> Resume`;

  document.getElementById('sp-clear').addEventListener('click', () => clearLog(log));
  stopBtn.addEventListener('click', () => { if (currentPid) window.api.stopScript(currentPid); });

  const partsSelect = document.getElementById('sp-parts-select');
  const partsCustom = document.getElementById('sp-parts-custom');
  const partsSave = document.getElementById('sp-parts-save');

  function updatePartsSave() {
    const val = partsSelect.value;
    if (val === 'custom') {
      partsCustom.classList.remove('hidden');
    } else {
      partsCustom.classList.add('hidden');
    }
  }

  partsSelect.addEventListener('change', () => {
    updatePartsSave();
    if (partsSelect.value === 'custom') {
      partsCustom.focus();
    }
  });

  partsCustom.addEventListener('input', updatePartsSave);

  // Initialize
  updatePartsSave();

  // Mode Toggle
  const spModeToggle = document.getElementById('sp-mode-toggle');
  const spSplitView = document.getElementById('sp-split-view');
  const spCalcView = document.getElementById('sp-calc-view');
  
  if (spModeToggle) {
    const segments = spModeToggle.querySelectorAll('.segment');
    segments.forEach(seg => {
      seg.addEventListener('click', () => {
        segments.forEach(s => s.classList.remove('active'));
        seg.classList.add('active');
        if (seg.dataset.mode === 'calc') {
          spSplitView.style.display = 'none';
          spCalcView.style.display = 'flex';
        } else {
          spSplitView.style.display = 'flex';
          spCalcView.style.display = 'none';
        }
      });
    });
  }

  // Split Calculator Logic
  const calcDurationInput = document.getElementById('sp-calc-duration');
  const calcPartsInput = document.getElementById('sp-calc-parts');
  const calcDesc = document.getElementById('sp-calc-desc');
  const calcTime = document.getElementById('sp-calc-time');
  const calcResultRow = document.getElementById('sp-calc-result-row');
  const calcCopyBtn = document.getElementById('sp-calc-copy');
  const calcCopyText = document.getElementById('sp-calc-copy-text');
  const calcDownloadTxtBtn = document.getElementById('sp-calc-download-txt');
  const calcDownloadText = document.getElementById('sp-calc-download-text');
  const calcPartsBtn = document.getElementById('sp-calc-parts-btn');
  const calcPartsBtnText = document.getElementById('sp-calc-parts-btn-text');
  const calcBreakdownWrap = document.getElementById('sp-calc-breakdown-wrap');

  let isBreakdownOpen = false;

  const formatTime = (secs) => {
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    let s = (secs % 60);
    
    let sStr = s < 10 ? '0' + s.toFixed(3) : s.toFixed(3);
    sStr = sStr.replace(/\.?0+$/, '');
    if (sStr === '') sStr = '00';
    if (sStr.length === 1) sStr = '0' + sStr;
    
    if (h > 0) return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${sStr}`;
    return `${m.toString().padStart(2, '0')}:${sStr}`;
  };

  const formatTimestamp = (secs) => {
    const h = Math.floor(secs / 3600).toString().padStart(2, '0');
    const m = Math.floor((secs % 3600) / 60).toString().padStart(2, '0');
    let s = secs % 60;
    if (s % 1 !== 0) {
      let sStr = s < 10 ? '0' + s.toFixed(3) : s.toFixed(3);
      sStr = sStr.replace(/\.?0+$/, '');
      return `${h}:${m}:${sStr.padStart(2, '0')}`;
    }
    return `${h}:${m}:${Math.floor(s).toString().padStart(2, '0')}`;
  };

  function getCalculatorData() {
    if (!calcDurationInput || !calcPartsInput) return null;
    const durationStr = calcDurationInput.value.trim();
    const parts = parseInt(calcPartsInput.value, 10);
    
    if (!durationStr || isNaN(parts) || parts < 2) return null;
    
    const timeParts = durationStr.split(':').map(Number);
    if (timeParts.some(isNaN)) return null;
    
    let totalSeconds = 0;
    if (timeParts.length === 3) {
      totalSeconds = timeParts[0] * 3600 + timeParts[1] * 60 + timeParts[2];
    } else if (timeParts.length === 2) {
      totalSeconds = timeParts[0] * 60 + timeParts[1];
    } else if (timeParts.length === 1) {
      totalSeconds = timeParts[0];
    }
    
    if (totalSeconds <= 0) return null;
    
    const partSeconds = totalSeconds / parts;
    const items = [];
    for (let i = 0; i < parts; i++) {
      const start = i * partSeconds;
      const end = (i === parts - 1) ? totalSeconds : (start + partSeconds);
      const duration = end - start;
      items.push({
        partNum: i + 1,
        start,
        end,
        duration,
        startStr: formatTimestamp(start),
        endStr: formatTimestamp(end),
        durationStr: formatTime(duration)
      });
    }

    return { totalSeconds, parts, partSeconds, items };
  }

  let activeSendMenu = null;

  function closeSendMenu() {
    if (activeSendMenu) {
      activeSendMenu.remove();
      activeSendMenu = null;
    }
  }

  document.addEventListener('click', (e) => {
    if (activeSendMenu && !activeSendMenu.contains(e.target) && !e.target.closest('.sp-row-send-btn')) {
      closeSendMenu();
    }
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeSendMenu();
  });

  function pasteTimeToTool(tool, startStr, endStr) {
    if (tool === 'ytdlp') {
      const startInput = document.getElementById('yd-start');
      const endInput = document.getElementById('yd-end');
      if (startInput) {
        startInput.value = startStr;
        startInput.dispatchEvent(new Event('input', { bubbles: true }));
      }
      if (endInput) {
        endInput.value = endStr;
        endInput.dispatchEvent(new Event('input', { bubbles: true }));
      }
      // Expand advanced options if collapsed
      const advBody = document.getElementById('yd-adv');
      const advToggle = document.querySelector('.form-adv-toggle[data-adv="yd-adv"]');
      if (advBody && !advBody.classList.contains('open')) {
        advBody.classList.add('open');
        if (advToggle) advToggle.setAttribute('aria-expanded', 'true');
      }
      // Switch tab
      const navBtn = document.querySelector('.nav-item[data-tab="ytdlp"]');
      if (navBtn) navBtn.click();

      // Highlight inputs for visual feedback
      if (startInput) {
        startInput.classList.add('flash-highlight');
        setTimeout(() => startInput.classList.remove('flash-highlight'), 1200);
      }
      if (endInput) {
        endInput.classList.add('flash-highlight');
        setTimeout(() => endInput.classList.remove('flash-highlight'), 1200);
      }
    } else if (tool === 'm3u8') {
      const startInput = document.getElementById('m3-start');
      const endInput = document.getElementById('m3-end');
      if (startInput) {
        startInput.value = startStr;
        startInput.dispatchEvent(new Event('input', { bubbles: true }));
      }
      if (endInput) {
        endInput.value = endStr;
        endInput.dispatchEvent(new Event('input', { bubbles: true }));
      }
      // Expand advanced options if collapsed
      const advBody = document.getElementById('m3-adv');
      const advToggle = document.querySelector('.form-adv-toggle[data-adv="m3-adv"]');
      if (advBody && !advBody.classList.contains('open')) {
        advBody.classList.add('open');
        if (advToggle) advToggle.setAttribute('aria-expanded', 'true');
      }
      // Switch tab
      const navBtn = document.querySelector('.nav-item[data-tab="m3u8"]');
      if (navBtn) navBtn.click();

      // Highlight inputs for visual feedback
      if (startInput) {
        startInput.classList.add('flash-highlight');
        setTimeout(() => startInput.classList.remove('flash-highlight'), 1200);
      }
      if (endInput) {
        endInput.classList.add('flash-highlight');
        setTimeout(() => endInput.classList.remove('flash-highlight'), 1200);
      }
    }
  }

  function openSendMenu(btn, startStr, endStr, partNum) {
    closeSendMenu();

    const menu = document.createElement('div');
    menu.className = 'sp-send-menu';
    menu.innerHTML = `
      <div class="sp-send-menu-header">Paste Part ${partNum} to Tool</div>
      <button class="sp-send-menu-item" data-tool="ytdlp">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
          <polyline points="7 10 12 15 17 10" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
          <line x1="12" y1="15" x2="12" y2="3" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
        </svg>
        <div class="sp-send-menu-item-info">
          <div class="sp-send-menu-item-title">yt-dlp Downloader</div>
          <div class="sp-send-menu-item-desc">${startStr} ➔ ${endStr}</div>
        </div>
      </button>
      <button class="sp-send-menu-item" data-tool="m3u8">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
          <polygon points="23 7 16 12 23 17 23 7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
          <rect x="1" y="5" width="15" height="14" rx="2" ry="2" stroke="currentColor" stroke-width="2"/>
        </svg>
        <div class="sp-send-menu-item-info">
          <div class="sp-send-menu-item-title">M3U8 Downloader</div>
          <div class="sp-send-menu-item-desc">${startStr} ➔ ${endStr}</div>
        </div>
      </button>
    `;

    document.body.appendChild(menu);
    activeSendMenu = menu;

    const rect = btn.getBoundingClientRect();
    const menuWidth = 230;
    let left = rect.right - menuWidth;
    if (left < 10) left = rect.left;
    let top = rect.bottom + 4;
    if (top + 130 > window.innerHeight) {
      top = rect.top - 130;
    }
    menu.style.left = `${Math.max(10, left)}px`;
    menu.style.top = `${Math.max(10, top)}px`;

    menu.querySelectorAll('.sp-send-menu-item').forEach(item => {
      item.addEventListener('click', (e) => {
        e.stopPropagation();
        const tool = item.dataset.tool;
        pasteTimeToTool(tool, startStr, endStr);
        closeSendMenu();
      });
    });
  }

  function renderBreakdown() {
    if (!calcBreakdownWrap) return;
    const data = getCalculatorData();
    if (!data) {
      calcBreakdownWrap.innerHTML = '';
      calcBreakdownWrap.style.display = 'none';
      return;
    }

    let rowsHtml = '';
    data.items.forEach(item => {
      rowsHtml += `
        <div class="sp-breakdown-row">
          <span class="sp-part-badge">Part ${item.partNum}</span>
          <div class="sp-time-range">
            <span class="sp-copy-badge" data-copy="${item.startStr}" title="Click to copy start: ${item.startStr}">${item.startStr}</span>
            <span class="arrow">➔</span>
            <span class="sp-copy-badge" data-copy="${item.endStr}" title="Click to copy end: ${item.endStr}">${item.endStr}</span>
          </div>
          <div class="sp-part-duration">
            <span class="sp-copy-badge" data-copy="${item.durationStr}" title="Click to copy duration: ${item.durationStr}">
              <span class="duration-label">len:</span>${item.durationStr}
            </span>
          </div>
          <div class="sp-row-actions">
            <button class="sp-row-send-btn" data-start="${item.startStr}" data-end="${item.endStr}" data-part="${item.partNum}" title="Send start & end time to a downloader tool">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
                <polyline points="15 3 21 3 21 9"></polyline>
                <line x1="10" y1="14" x2="21" y2="3"></line>
              </svg>
            </button>
            <button class="sp-row-copy-btn" data-copy="${item.startStr} - ${item.endStr} Part ${item.partNum} (${item.durationStr})" title="Copy full part range">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
              </svg>
            </button>
          </div>
        </div>
      `;
    });

    calcBreakdownWrap.innerHTML = `
      <div class="sp-breakdown-card">
        <div class="sp-breakdown-header">
          <span>Part Schedule & Durations (${data.parts} parts) <span style="font-size: 11px; opacity: 0.65; font-weight: normal; margin-left: 4px;">— click timestamp to copy, or export to tool</span></span>
          <button class="btn btn-ghost" id="sp-calc-copy-all-parts" style="padding: 3px 8px; font-size: 11px; gap: 4px; display: inline-flex; align-items: center;" title="Copy all parts to clipboard">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
            </svg>
            <span id="sp-calc-copy-all-text">Copy All</span>
          </button>
        </div>
        <div class="sp-breakdown-list">
          ${rowsHtml}
        </div>
      </div>
    `;

    // Attach badge copy listeners (for specific start, end, or duration)
    calcBreakdownWrap.querySelectorAll('.sp-copy-badge').forEach(badge => {
      badge.addEventListener('click', async (e) => {
        e.stopPropagation();
        const textToCopy = badge.getAttribute('data-copy');
        if (!textToCopy) return;
        try {
          await navigator.clipboard.writeText(textToCopy);
          const origHtml = badge.innerHTML;
          badge.classList.add('copied');
          badge.innerHTML = `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg> Copied!`;
          setTimeout(() => {
            badge.classList.remove('copied');
            badge.innerHTML = origHtml;
          }, 1200);
        } catch (err) {
          console.error('Failed to copy specific value:', err);
        }
      });
    });

    // Attach send-to-tool listeners
    calcBreakdownWrap.querySelectorAll('.sp-row-send-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const startStr = btn.getAttribute('data-start');
        const endStr = btn.getAttribute('data-end');
        const partNum = btn.getAttribute('data-part');
        openSendMenu(btn, startStr, endStr, partNum);
      });
    });

    // Attach row copy listeners (for full line)
    calcBreakdownWrap.querySelectorAll('.sp-row-copy-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const textToCopy = btn.getAttribute('data-copy');
        if (!textToCopy) return;
        try {
          await navigator.clipboard.writeText(textToCopy);
          const origHtml = btn.innerHTML;
          btn.innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--success)" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>`;
          setTimeout(() => { btn.innerHTML = origHtml; }, 1200);
        } catch (err) {
          console.error('Failed to copy part:', err);
        }
      });
    });

    // Attach Copy All listener
    const copyAllBtn = document.getElementById('sp-calc-copy-all-parts');
    const copyAllText = document.getElementById('sp-calc-copy-all-text');
    if (copyAllBtn) {
      copyAllBtn.addEventListener('click', async () => {
        const textLines = data.items.map(it => `${it.startStr} - ${it.endStr} Part ${it.partNum} (Duration: ${it.durationStr})`).join('\n');
        try {
          await navigator.clipboard.writeText(textLines);
          if (copyAllText) copyAllText.textContent = 'Copied!';
          setTimeout(() => { if (copyAllText) copyAllText.textContent = 'Copy All'; }, 1500);
        } catch (err) {
          console.error('Failed to copy all:', err);
        }
      });
    }

    calcBreakdownWrap.style.display = 'block';
  }

  function updateCalculator() {
    if (!calcDurationInput || !calcPartsInput || !calcDesc || !calcTime || !calcResultRow) return;
    const durationStr = calcDurationInput.value.trim();
    const parts = parseInt(calcPartsInput.value, 10);
    
    if (!durationStr || isNaN(parts) || parts < 2) {
      calcDesc.textContent = 'Enter duration and parts to calculate time per part...';
      calcResultRow.style.display = 'none';
      calcTime.textContent = '';
      if (calcBreakdownWrap) calcBreakdownWrap.style.display = 'none';
      return;
    }
    
    const data = getCalculatorData();
    if (!data) {
      calcDesc.textContent = 'Invalid duration format. Use HH:MM:SS(.ms) or MM:SS(.ms)';
      calcResultRow.style.display = 'none';
      calcTime.textContent = '';
      if (calcBreakdownWrap) calcBreakdownWrap.style.display = 'none';
      return;
    }
    
    calcDesc.textContent = 'Each part will be approximately:';
    calcTime.textContent = formatTime(data.partSeconds);
    calcResultRow.style.display = 'flex';

    if (isBreakdownOpen) {
      renderBreakdown();
    }
  }

  if (calcPartsBtn) {
    calcPartsBtn.addEventListener('click', () => {
      isBreakdownOpen = !isBreakdownOpen;
      if (isBreakdownOpen) {
        renderBreakdown();
        if (calcPartsBtnText) calcPartsBtnText.textContent = 'Hide Breakdown';
        calcPartsBtn.classList.add('active');
      } else {
        if (calcBreakdownWrap) calcBreakdownWrap.style.display = 'none';
        if (calcPartsBtnText) calcPartsBtnText.textContent = 'Show Parts Breakdown';
        calcPartsBtn.classList.remove('active');
      }
    });
  }

  if (calcCopyBtn) {
    calcCopyBtn.addEventListener('click', async () => {
      if (!calcTime || !calcTime.textContent) return;
      try {
        await navigator.clipboard.writeText(calcTime.textContent);
        if (calcCopyText) calcCopyText.textContent = 'Copied!';
        setTimeout(() => {
          if (calcCopyText) calcCopyText.textContent = 'Copy';
        }, 1500);
      } catch (err) {
        console.error('Failed to copy: ', err);
      }
    });
  }

  if (calcDownloadTxtBtn) {
    calcDownloadTxtBtn.addEventListener('click', async () => {
      const data = getCalculatorData();
      if (!data) return;

      const lines = data.items.map(it => `${it.startStr} - ${it.endStr} Part ${it.partNum}`);
      const content = lines.join('\n');

      try {
        if (window.api && window.api.saveTextFile) {
          const savedPath = await window.api.saveTextFile({ defaultName: 'durations.txt', content });
          if (!savedPath) return;
        } else {
          const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = 'durations.txt';
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
        }

        if (calcDownloadText) calcDownloadText.textContent = 'Saved!';
        setTimeout(() => {
          if (calcDownloadText) calcDownloadText.textContent = 'Download .txt';
        }, 1500);
      } catch (err) {
        console.error('Failed to save durations.txt:', err);
      }
    });
  }

  if (calcDurationInput) calcDurationInput.addEventListener('input', updateCalculator);
  if (calcPartsInput) calcPartsInput.addEventListener('input', updateCalculator);

  // Calculator Sub-Mode Toggle (Split Parts vs Time Offset)
  const calcModeToggle = document.getElementById('sp-calc-mode-toggle');
  const calcPartsPanel = document.getElementById('sp-calc-parts-panel');
  const calcOffsetPanel = document.getElementById('sp-calc-offset-panel');

  if (calcModeToggle) {
    const calcSegs = calcModeToggle.querySelectorAll('.segment');
    calcSegs.forEach(seg => {
      seg.addEventListener('click', () => {
        calcSegs.forEach(s => s.classList.remove('active'));
        seg.classList.add('active');
        if (seg.dataset.calcMode === 'offset') {
          if (calcPartsPanel) calcPartsPanel.style.display = 'none';
          if (calcOffsetPanel) calcOffsetPanel.style.display = 'flex';
        } else {
          if (calcPartsPanel) calcPartsPanel.style.display = 'flex';
          if (calcOffsetPanel) calcOffsetPanel.style.display = 'none';
        }
      });
    });
  }

  // Time Offset / Math Calculator Logic
  const calcOffsetBaseInput = document.getElementById('sp-calc-offset-base');
  const calcOffsetValInput = document.getElementById('sp-calc-offset-val');
  const calcOffsetOpToggle = document.getElementById('sp-calc-offset-op-toggle');
  const calcOffsetDesc = document.getElementById('sp-calc-offset-desc');
  const calcOffsetResultRow = document.getElementById('sp-calc-offset-result-row');
  const calcOffsetTime = document.getElementById('sp-calc-offset-time');
  const calcOffsetCopyBtn = document.getElementById('sp-calc-offset-copy');
  const calcOffsetCopyText = document.getElementById('sp-calc-offset-copy-text');
  const calcOffsetUseBaseBtn = document.getElementById('sp-calc-offset-use-base');

  let currentOffsetOp = 'add';

  if (calcOffsetOpToggle) {
    const opSegs = calcOffsetOpToggle.querySelectorAll('.segment');
    opSegs.forEach(seg => {
      seg.addEventListener('click', () => {
        opSegs.forEach(s => s.classList.remove('active'));
        seg.classList.add('active');
        currentOffsetOp = seg.dataset.op || 'add';
        updateOffsetCalculator();
      });
    });
  }

  function parseTimestampToSecs(str) {
    if (!str) return null;
    const cleaned = str.trim();
    if (!cleaned) return null;
    const parts = cleaned.split(':').map(Number);
    if (parts.some(isNaN)) return null;
    if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
    if (parts.length === 2) return parts[0] * 60 + parts[1];
    if (parts.length === 1) return parts[0];
    return null;
  }

  function formatSecsToTimestamp(secs) {
    if (secs < 0) secs = 0;
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const s = secs % 60;
    const hStr = h.toString().padStart(2, '0');
    const mStr = m.toString().padStart(2, '0');
    let sStr = s.toFixed(3).replace(/\.?0+$/, '');
    if (sStr === '' || sStr === '0') sStr = '00';
    if (!sStr.includes('.') && sStr.length === 1) sStr = '0' + sStr;
    else if (sStr.includes('.')) {
      const [secPart, msPart] = sStr.split('.');
      sStr = secPart.padStart(2, '0') + '.' + msPart;
    }
    return `${hStr}:${mStr}:${sStr}`;
  }

  function updateOffsetCalculator() {
    if (!calcOffsetBaseInput || !calcOffsetValInput || !calcOffsetDesc || !calcOffsetResultRow || !calcOffsetTime) return;
    const baseStr = calcOffsetBaseInput.value.trim();
    const offsetStr = calcOffsetValInput.value.trim();

    if (!baseStr || !offsetStr) {
      calcOffsetDesc.textContent = 'Enter a base timestamp and offset duration to calculate...';
      calcOffsetResultRow.style.display = 'none';
      calcOffsetTime.textContent = '';
      return;
    }

    const baseSec = parseTimestampToSecs(baseStr);
    const offsetSec = parseTimestampToSecs(offsetStr);

    if (baseSec === null || offsetSec === null) {
      calcOffsetDesc.textContent = 'Invalid timestamp format. Use HH:MM:SS(.ms) or MM:SS(.ms)';
      calcOffsetResultRow.style.display = 'none';
      calcOffsetTime.textContent = '';
      return;
    }

    let resultSec = 0;
    if (currentOffsetOp === 'add') {
      resultSec = baseSec + offsetSec;
      const formatted = formatSecsToTimestamp(resultSec);
      calcOffsetDesc.textContent = `Adding ${offsetStr} to ${baseStr} gives:`;
      calcOffsetTime.textContent = formatted;
    } else {
      resultSec = Math.max(0, baseSec - offsetSec);
      const formatted = formatSecsToTimestamp(resultSec);
      calcOffsetDesc.textContent = `Subtracting ${offsetStr} from ${baseStr} gives:`;
      calcOffsetTime.textContent = formatted;
    }
    calcOffsetResultRow.style.display = 'flex';
  }

  if (calcOffsetBaseInput) calcOffsetBaseInput.addEventListener('input', updateOffsetCalculator);
  if (calcOffsetValInput) calcOffsetValInput.addEventListener('input', updateOffsetCalculator);

  if (calcOffsetCopyBtn) {
    calcOffsetCopyBtn.addEventListener('click', async () => {
      if (!calcOffsetTime || !calcOffsetTime.textContent) return;
      try {
        await navigator.clipboard.writeText(calcOffsetTime.textContent);
        if (calcOffsetCopyText) calcOffsetCopyText.textContent = 'Copied!';
        setTimeout(() => {
          if (calcOffsetCopyText) calcOffsetCopyText.textContent = 'Copy';
        }, 1500);
      } catch (err) {
        console.error('Failed to copy offset result:', err);
      }
    });
  }

  if (calcOffsetUseBaseBtn) {
    calcOffsetUseBaseBtn.addEventListener('click', () => {
      if (!calcOffsetTime || !calcOffsetTime.textContent) return;
      calcOffsetBaseInput.value = calcOffsetTime.textContent;
      calcOffsetValInput.value = '';
      calcOffsetValInput.focus();
      updateOffsetCalculator();
    });
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

  runBtn.addEventListener('click', () => {
    const file       = document.getElementById('sp-file').value.trim();
    const parts      = document.getElementById('sp-parts-select').value;
    const partsToSave = document.getElementById('sp-parts-save').value;
    const outputDir  = document.getElementById('sp-output').value.trim();
    const container  = document.getElementById('sp-container')?.value;

    const actualParts = parts === 'custom' ? parseInt(partsCustom.value) || 2 : parseInt(parts);
    const actualPartsToSaveStr = partsToSave.trim();

    if (!file)  { appendLog(log, '⚠ Please select a video file.', 'error'); return; }

    clearLog(log);
    appendLog(log, `▶ Starting splitter...`, 'info');
    appendLog(log, `  File:  ${file}`, 'cmd');
    appendLog(log, `  Parts: ${actualParts} (Saving: ${actualPartsToSaveStr || 'all'})`, 'cmd');
    if (outputDir) appendLog(log, `  Output: ${outputDir}`, 'cmd');
    appendLog(log, '', 'stdout');
    markBodyStart(log);

    currentPid = null;
    isPaused   = false;
    pauseBtn.innerHTML = pauseIconHTML;
    pauseBtn.classList.remove('paused');
    runBtn.classList.add('hidden');
    pauseBtn.classList.remove('hidden');
    stopBtn.classList.remove('hidden');
    incRunning('Splitter');

    window.api.removeAllListeners('splitter-output');
    window.api.onSplitterOutput((data) => {
      if (data.type === 'pid') { currentPid = data.pid; return; }
      handleOutput(log, data, () => {
        runBtn.classList.remove('hidden');
        pauseBtn.classList.add('hidden');
        stopBtn.classList.add('hidden');
        pauseBtn.innerHTML = pauseIconHTML;
        pauseBtn.classList.remove('paused');
        isPaused = false;
        decRunning('Splitter');
      });
    });

    window.api.runSplitter({ file, parts: actualParts, partsToSave: actualPartsToSaveStr, outputDir: outputDir || '', containerFormat: container || '' });
  });
})();
