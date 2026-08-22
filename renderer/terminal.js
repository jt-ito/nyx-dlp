/* ── Terminal helpers ─────────────────────────────────────── */
function classifyLine(text, streamType, logEl) {
  const t = text.trimStart();
  if (t.includes('This live event will begin in')) {
    if (logEl) logEl._hasLiveEventIgnore = true;
    return 'info';
  }
  if (/^\[debug\]/i.test(t))                    return 'debug';
  if (/^warning:/i.test(t) || /keepalive request failed/i.test(t) || /retrying with new connection/i.test(t) || /will reconnect/i.test(t)) return 'warning';
  if (/^error:/i.test(t))                        return 'error';
  if (/has already been downloaded/i.test(t))    return 'info';
  if (/\berror\b.*:/i.test(t) && streamType === 'stderr') return 'error';
  
  if (logEl && logEl._hasLiveEventIgnore) return streamType; // Suppress tracebacks if ignored

  // Python traceback lines: '  File "...", line N, in ...' and '~~~~^^^' indicator lines
  if (/^\s+File ".*", line \d+/.test(text))      return 'error';
  if (/^\s*[~^]+\s*$/.test(text))                return 'error';
  if (streamType === 'stdout' && /:\s*$/.test(t)) return 'input';
  return streamType; // 'stdout' or 'stderr'
}

// ── Line buffer for batched DOM appends ────────────────────
// Instead of one appendChild per line, we collect lines into a buffer and
// flush them all at once via a DocumentFragment on the next RAF tick.
// This dramatically reduces layout thrashing when hundreds of lines arrive
// per second (e.g. during a large batch download).
function appendLog(logEl, text, cls) {
  let t = text.trimStart();
  if (/^Traceback \(most recent call last\)/i.test(t) || /^\s+File ".*\.py"/.test(text)) {
    if (!logEl._hasLiveEventIgnore) logEl._hasError = true;
  }
  
  if (getSetting('console-timestamps') && !/^\s*(?:\d+:\s*)?\[download\]\s+(?:\d+(?:\.\d+)?%|\d+(?:\.\d+)?(?:KiB|MiB|GiB|TiB|B)|Destination:)/i.test(text) && !/frame=\s*\d+/i.test(text)) {
    const now = new Date();
    const timeStr = `[${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}] `;
    text = timeStr + text;
  }
  
  const lastCrIdx = text.lastIndexOf('\r');
  if (lastCrIdx !== -1) {
      text = text.substring(lastCrIdx + 1);
  }

  // --- STATE MACHINE LOGIC ---
  if (!logEl._pendingLines) logEl._pendingLines = [];
  logEl._lastRenderedLine = null;

  const unpinProgress = (threadId) => {
    if (logEl._liveProgresses && logEl._liveProgresses.has(threadId)) {
      const prog = logEl._liveProgresses.get(threadId);
      logEl._liveProgresses.delete(threadId);
      if (prog && prog.text) {
        logEl._pendingLines.push({ text: prog.text, cls: 'stdout', count: 1 });
      }
    }
  };

  const unpinAllProgress = () => {
    if (logEl._liveProgresses && logEl._liveProgresses.size > 0) {
      for (const [id, prog] of logEl._liveProgresses.entries()) {
        if (prog && prog.text) {
          logEl._pendingLines.push({ text: prog.text, cls: 'stdout', count: 1 });
        }
      }
      logEl._liveProgresses.clear();
    }
  };

  const isStatus = text.includes('⏸ Paused') || text.includes('▶ Resumed') || text.includes('✔ Process finished') || text.includes('✖ Process exited');

  // Unpin progress when transitioning to post-processing, embedding metadata/thumbnails/subtitles, smart-cut, or completion
  const isPostDownload = text.includes('▶ [Post-Process]') ||
    text.includes('✔ [Post-Process]') ||
    text.includes('▶ [Smart-Cut]') ||
    text.includes('✔ Completed') ||
    text.includes('[Metadata]') ||
    text.includes('[EmbedSubtitle]') ||
    text.includes('[EmbedThumbnail]') ||
    text.includes('[Merger]') ||
    text.includes('[Fixup') ||
    isStatus;

  if (isPostDownload) {
    unpinAllProgress();
  }

  // 1. Check for Destination line (Start of a new file)
  const destMatch = text.match(/^\s*(?:\[\d+:\d+:\d+\]\s*)?(?:(\d+):\s*)?\[(?:download|ExtractAudio)\]\s+Destination:\s+(.+)/i);
  if (destMatch) {
      if (!logEl._liveProgresses) logEl._liveProgresses = new Map();
      if (!logEl._threadDestinations) logEl._threadDestinations = new Map();
      const tId = destMatch[1] || 'main';
      let fileName = destMatch[2].trim().replace(/\\/g, '/').split('/').pop();
      logEl._threadDestinations.set(tId, fileName);
      logEl._pendingLines.push({ text, cls, count: 1 });
      if (!logEl._rafPending) triggerRaf(logEl);
      return;
  }
  
  // 1b. Check for already downloaded line
  const alreadyMatch = text.match(/^\s*(?:\[\d+:\d+:\d+\]\s*)?(?:(\d+):\s*)?\[download\]\s+(.+?)\s+has already been downloaded/i);
  if (alreadyMatch) {
      if (!logEl._threadDestinations) logEl._threadDestinations = new Map();
      const tId = alreadyMatch[1] || 'main';
      let fileName = alreadyMatch[2].trim().replace(/\\/g, '/').split('/').pop();
      logEl._threadDestinations.set(tId, fileName);
  }

  // 2. Check for Progress line (yt-dlp, ffmpeg, or Internet Archive)
  const dlMatch = text.match(/^\s*(?:\[\d+:\d+:\d+\]\s*)?(?:(\d+):\s*)?\[download\]\s+(?:\d+(?:\.\d+)?%|\d+(?:\.\d+)?(?:KiB|MiB|GiB|TiB|B))/i);
  const isFfmpegProgress = /^\s*frame=\s*\d+/i.test(text) || /^\s*size=\s*\d+/i.test(text);
  const isIaProgress = /^\s*(?:uploading|downloading) (.*?):\s*\d+%\|.*\|\s*\d+\/\d+/i.exec(text);
  
  if (dlMatch || isFfmpegProgress || isIaProgress) {
      const iaFileName = isIaProgress ? isIaProgress[1].trim().replace(/\\/g, '/').split('/').pop() : null;
      if (logEl._downloadCompleted && (dlMatch || isIaProgress)) {
          if (isIaProgress && logEl._threadDestinations && logEl._threadDestinations.get('ia') !== iaFileName) {
              logEl._downloadCompleted = false;
          } else {
              return; // Ignore stray progress lines after 100%
          }
      }
      if (!logEl._liveProgresses) logEl._liveProgresses = new Map();
      if (!logEl._threadDestinations) logEl._threadDestinations = new Map();
      
      let threadId = 'ffmpeg';
      if (dlMatch) threadId = (dlMatch[1] || 'main');
      else if (isIaProgress) {
          threadId = 'ia';
          logEl._threadDestinations.set('ia', isIaProgress[1].trim().replace(/\\/g, '/').split('/').pop());
      }
      
      let isComplete = text.includes('100%') || text.includes('100.0%');
      if (isComplete && text.includes('ETA')) isComplete = false;
      const fragMatch = text.match(/frag\s+(\d+)\/(\d+)/i);
      if (isComplete && fragMatch && fragMatch[1] !== fragMatch[2]) isComplete = false;
      const iaMatch = text.match(/(\d+)\/(\d+)\s*\[/);
      if (isComplete && iaMatch && iaMatch[1] !== iaMatch[2]) isComplete = false;

      if (isComplete) {
          let cleanText = text.replace(/^\s*(?:\[\d+:\d+:\d+\]\s*)?(?:\d+:\s*)?\[(?:download|ExtractAudio)\]\s+(?:\[(.*?)\]\s+)?/, '').trim();
          if (isIaProgress) {
              cleanText = text.replace(/^\s*(?:uploading|downloading) .*:\s*/i, '').trim();
          }
          if (cleanText.startsWith('100%')) cleanText = cleanText.substring(4).trim();
          if (cleanText.startsWith('100.0%')) cleanText = cleanText.substring(6).trim();
          if (cleanText.startsWith('-')) cleanText = cleanText.substring(1).trim();
          
          let dispName = logEl._threadDestinations.get(threadId) || (threadId !== 'ffmpeg' && threadId !== 'ia' ? `thread ${threadId}` : '');
          let prefix = dispName ? `✔ Completed ${dispName} — 100% ` : `✔ Completed — 100% `;
          
          logEl._pendingLines.push({ text: prefix + cleanText, cls: 'success', count: 1 });
          logEl._liveProgresses.delete(threadId);
          logEl._downloadCompleted = true;
      } else {
          logEl._liveProgresses.set(threadId, { text, cls: cls + ' line-progress' });
      }
      
      if (!logEl._rafPending) triggerRaf(logEl);
      return;
  }

  // Any non-progress line resets the completion flag
  logEl._downloadCompleted = false;

  // Deduplication for normal lines
  const pLen = logEl._pendingLines.length;
  if (pLen > 0) {
      const last = logEl._pendingLines[pLen - 1];
      if (last.text === text && last.cls === cls && text.trim() !== '') {
          last.count = (last.count || 1) + 1;
          if (!logEl._rafPending) triggerRaf(logEl);
          return;
      }
  } else if (logEl._lastRenderedLine) {
      const last = logEl._lastRenderedLine;
      if (last.text === text && last.cls === cls && text.trim() !== '') {
          last.count = (last.count || 1) + 1;
          if (last.badge) {
              last.badge.textContent = ` (${last.count})`;
          } else {
              const badge = document.createElement('span');
              badge.className = 'log-badge';
              badge.style.color = '#888';
              badge.style.marginLeft = '8px';
              badge.textContent = ` (${last.count})`;
              last.el.appendChild(badge);
              last.badge = badge;
          }
          if (!logEl._rafPending) triggerRaf(logEl);
          return;
      }
  }

  // Normal event line
  logEl._pendingLines.push({ text, cls, count: 1, isStatus });
  if (isStatus) {
      logEl._liveProgresses = new Map();
  }
  if (logEl._pendingLines.length > 15000) {
    logEl._pendingLines = logEl._pendingLines.slice(-10000);
  }
  if (!logEl._rafPending) triggerRaf(logEl);
}

function flushPendingLogsSync(logEl) {
    const lines = logEl._pendingLines || [];
    const frag = document.createDocumentFragment();
    const statusFrag = document.createDocumentFragment();
    
    if (lines.length > 0) {
        logEl._pendingLines = []; logEl._lastRenderedLine = null;
        logEl._lineCount = (logEl._lineCount || 0) + lines.length;

        for (const item of lines) {
          const div = document.createElement('div');
          div.className = 'line-' + item.cls;
          div.textContent = item.text;
          if (item.count > 1) {
              const badge = document.createElement('span');
              badge.className = 'log-badge';
              badge.style.color = '#888';
              badge.style.marginLeft = '8px';
              badge.textContent = ` (${item.count})`;
              div.appendChild(badge);
              item.badge = badge;
          }
          item.el = div;
          
          if (item.isStatus) {
              frag.appendChild(div);
              logEl._currentAutoCollapse = null;
          } else {
              const isAutoCollapse = (item.cls === 'debug' || item.cls === 'info') && !item.text.includes('▶ Starting') && !item.text.includes('? Starting');
              if (isAutoCollapse) {
                  if (!logEl._currentAutoCollapse) {
                      logEl._currentAutoCollapse = document.createElement('details');
                      logEl._currentAutoCollapse.className = 'auto-collapse-details';
                      const summary = document.createElement('summary');
                      summary.textContent = 'Info / Debug Logs';
                      logEl._currentAutoCollapse.appendChild(summary);
                      const content = document.createElement('div');
                      content.className = 'details-content';
                      logEl._currentAutoCollapse.appendChild(content);
                      
                      const footerBtn = document.createElement('div');
                      footerBtn.className = 'collapse-footer-btn';
                      footerBtn.textContent = '⮝ Collapse logs ⮝';
                      footerBtn.addEventListener('click', (e) => {
                          const details = e.target.closest('details');
                          if (details) {
                              details.open = false;
                              details.scrollIntoView({ behavior: 'smooth', block: 'center' });
                          }
                      });
                      logEl._currentAutoCollapse.appendChild(footerBtn);
                      
                      frag.appendChild(logEl._currentAutoCollapse);
                  }
                  logEl._currentAutoCollapse.querySelector('.details-content').appendChild(div);
              } else {
                  logEl._currentAutoCollapse = null;
                  frag.appendChild(div);
              }
              logEl._lastRenderedLine = item;
          }
        }
    }
    
    if (!logEl._progressContainer) {
        logEl._progressContainer = document.createElement('div');
        logEl._progressContainer.className = 'progress-container';
        logEl.appendChild(logEl._progressContainer);
    }
    if (!logEl._statusContainer) {
        logEl._statusContainer = document.createElement('div');
        logEl._statusContainer.className = 'status-container';
        logEl.appendChild(logEl._statusContainer);
    }

    if (frag.childNodes.length > 0) {
        logEl.insertBefore(frag, logEl._progressContainer);
    }
    if (statusFrag.childNodes.length > 0) {
        logEl._statusContainer.appendChild(statusFrag);
    }
    
    // Render the live progress slots
    if (logEl._liveProgresses && logEl._liveProgresses.size > 0) {
        // Remove any divs that are no longer active
        Array.from(logEl._progressContainer.children).forEach(child => {
            const id = child.getAttribute('data-thread-id');
            if (!logEl._liveProgresses.has(id)) logEl._progressContainer.removeChild(child);
        });
        
        for (const [id, prog] of logEl._liveProgresses.entries()) {
            let div = logEl._progressContainer.querySelector(`[data-thread-id="${id}"]`);
            if (!div) {
                div = document.createElement('div');
                div.setAttribute('data-thread-id', id);
                logEl._progressContainer.appendChild(div);
            }
            if (div.className !== prog.cls) div.className = prog.cls;
            if (div.textContent !== prog.text) div.textContent = prog.text;
        }
    } else {
        logEl._progressContainer.innerHTML = '';
    }

    if (logEl._lineCount > 5000) {
      let removed = 0;
      let curr = logEl.firstChild;
      while (curr && removed < 1000) {
        const next = curr.nextSibling;
        if (curr.nodeType !== 1 || (curr.classList && (
            curr.classList.contains('log-body-start') ||
            curr.classList.contains('log-detail') ||
            curr.classList.contains('log-expand-arrow') ||
            curr.classList.contains('progress-container') ||
            curr.classList.contains('status-container')
        ))) {
          curr = next;
          continue;
        }
        if (curr === logEl._lastRenderedLine?.el) logEl._lastRenderedLine = null;
        logEl.removeChild(curr);
        removed++;
        curr = next;
      }
      logEl._lineCount -= removed;
      logEl._lastScrollTop = (logEl._scrollEl || logEl).scrollTop;
    }
    return lines.length;
}

function triggerRaf(logEl) {
    // Don't schedule any DOM work for hidden tabs. Lines stay in _pendingLines
    // and are flushed in a single pass when the user switches to this tab.
    if (!logEl.closest('.tab-panel')?.classList.contains('active')) {
        logEl._hasUnflushed = true;
        return;
    }
    logEl._rafPending = true;
    setTimeout(() => {
      requestAnimationFrame(() => {
        logEl._rafPending = false;
        const count = flushPendingLogsSync(logEl);
        if (logEl._autoFollow !== false && logEl.closest('.tab-panel')?.classList.contains('active')) {
          const scrollEl = logEl._scrollEl || logEl;
          scrollEl.scrollTop = scrollEl.scrollHeight;
          logEl._lastScrollTop = scrollEl.scrollTop;
        }
        logEl._updateScrollBtn?.();
      });
    }, 0);
}
function clearLog(logEl) {
  if (logEl._scrollListener) {
    (logEl._scrollEl || logEl).removeEventListener('scroll', logEl._scrollListener);
    logEl._scrollListener = null;
    logEl._hasScrollListener = false;
    logEl._scrollBtnHandler = null;
    logEl._scrollEl = null;
  }
  logEl._scrollBtn?.remove();
  logEl._scrollBtn = null;
  logEl.innerHTML = '';
  logEl._lineCount = 0;
  logEl._hasError = false;
  logEl._autoFollow = true;
  logEl._lastScrollTop = 0;
  logEl._pendingLines = []; logEl._lastRenderedLine = null;
  logEl._rafPending = false;
  logEl._hasUnflushed = false;
  
  logEl._progressContainer = null;
  logEl._statusContainer = null;
  logEl._liveProgressMap = null;
  logEl._liveProgressEls = null;
  logEl._currentAutoCollapse = null;
  logEl._lastCapturedName = null;

  logEl.closest('.terminal-wrap')?.classList.remove('collapsed');
}


function markBodyStart(logEl) {
  const m = document.createElement('div');
  m.className = 'log-body-start';
  logEl.appendChild(m);
  logEl.setAttribute('data-log-el', '1');

  const scrollEl = logEl.closest('.content');
  logEl._scrollEl = scrollEl;

  const svgUp   = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none"><polyline points="18 15 12 9 6 15" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  const svgDown = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none"><polyline points="6 9 12 15 18 9" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';

  logEl._scrollBtn?.remove();

  const btn = document.createElement('div');
  btn.className = 'log-scroll-btn';
  btn.style.display = 'none';
  logEl.closest('.terminal-wrap').appendChild(btn);
  logEl._scrollBtn = btn;

  logEl._autoFollow = true;

  const updateBtn = () => {
    if (!logEl.closest('.tab-panel')?.classList.contains('active')) {
      btn.style.display = 'none';
      return;
    }
    const hasScroll = scrollEl.scrollHeight > scrollEl.clientHeight + 20;
    if (!hasScroll) { btn.style.display = 'none'; return; }
    btn.style.display = 'flex';
    if (logEl._autoFollow) {
      btn.innerHTML = svgUp;
      btn.title = 'Scroll to top - pauses auto-scroll';
    } else {
      btn.innerHTML = svgDown;
      btn.title = 'Scroll to bottom - resumes auto-scroll';
    }
  };
  logEl._updateScrollBtn = updateBtn;

  btn.addEventListener('click', () => {
    if (logEl._autoFollow) {
      logEl._autoFollow = false;
      scrollEl.scrollTo({ top: 0, behavior: 'auto' });
      logEl._lastScrollTop = 0;
    } else {
      logEl._autoFollow = true;
      const target = scrollEl.scrollHeight - scrollEl.clientHeight;
      scrollEl.scrollTo({ top: target, behavior: 'auto' });
      logEl._lastScrollTop = target;
    }
    updateBtn();
  });

  logEl._scrollBtnHandler = () => {
    const currentScrollTop = scrollEl.scrollTop;
    const isScrollingUp = currentScrollTop < (logEl._lastScrollTop || 0);
    logEl._lastScrollTop = currentScrollTop;

    const atBottom = scrollEl.scrollTop + scrollEl.clientHeight >= scrollEl.scrollHeight - 60;
    
    if (isScrollingUp) {
      logEl._autoFollow = false;
    } else if (atBottom) {
      logEl._autoFollow = true;
    }
    updateBtn();
  };

  logEl._scrollListener = () => {
    if (!logEl.closest('.tab-panel')?.classList.contains('active')) return;
    logEl._scrollBtnHandler?.();
  };
  scrollEl.addEventListener('scroll', logEl._scrollListener);
}

function collapseLogBody(logEl, failed, trailingCount, withViewErrors) {
  flushPendingLogsSync(logEl);
  trailingCount = trailingCount || 1;
  const sentinel = logEl.querySelector('.log-body-start');
  if (!sentinel) return;
  const all = Array.from(logEl.children);
  const start = all.indexOf(sentinel);
  const bodyLines = all.slice(start + 1, all.length - trailingCount);
  if (bodyLines.length === 0) { sentinel.remove(); return; }

  if (withViewErrors) {
    const isErr = el => el.classList.contains('line-error') ||
                        el.classList.contains('line-warning') ||
                        el.classList.contains('line-blocked') ||
                        el.classList.contains('line-stderr');
    const errLines   = bodyLines.filter(isErr);
    const otherLines = bodyLines.filter(el => !isErr(el));

    const detail = document.createElement('div');
    detail.className = 'log-detail';
    otherLines.forEach(el => detail.appendChild(el));
    sentinel.replaceWith(detail);

    const errDetail = document.createElement('div');
    errDetail.className = 'log-detail';
    errLines.forEach(el => errDetail.appendChild(el));

    if (errLines.length > 0) {
      const btn = document.createElement('button');
      btn.className = 'log-view-errors-btn';
      btn.textContent = `View errors (${errLines.length} lines)`;
      btn.addEventListener('click', () => {
        const open = errDetail.classList.toggle('open');
        logEl.closest('.terminal-wrap')?.classList.toggle('collapsed', !open);
        btn.textContent = open ? 'Hide errors' : `View errors (${errLines.length} lines)`;
        if (open) { const se = logEl._scrollEl || logEl; se.scrollTop = se.scrollHeight; }
      });
      logEl.appendChild(btn);
      logEl.appendChild(errDetail);
    }
  } else {
    const isVisible = failed
      ? el => el.classList.contains('line-error') || el.classList.contains('line-warning') || el.classList.contains('line-stderr') || el.classList.contains('line-blocked') || el.classList.contains('line-success')
      : el => el.classList.contains('line-success') || el.classList.contains('line-error') || el.classList.contains('line-warning');

    const detail = document.createElement('div');
    detail.className = 'log-collapse-container';
    bodyLines.forEach(el => {
      if (isVisible(el)) el.classList.add('keep-visible');
      detail.appendChild(el);
    });
    sentinel.replaceWith(detail);

    const arrow = document.createElement('div');
    arrow.className = 'log-expand-arrow';
    arrow.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none"><polyline points="6 9 12 15 18 9" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    arrow.addEventListener('click', () => {
      const open = detail.classList.toggle('open');
      arrow.classList.toggle('open', open);
      logEl.closest('.terminal-wrap')?.classList.toggle('collapsed', !open);
      if (open) { const se = logEl._scrollEl || logEl; se.scrollTop = se.scrollHeight; }
    });
    logEl.appendChild(arrow);
  }

  logEl.closest('.terminal-wrap')?.classList.add('collapsed');
    setTimeout(() => {
        const scrollEl = logEl.closest('.content');
        if (scrollEl) scrollEl.scrollTo({ top: scrollEl.scrollHeight, behavior: 'smooth' });
    }, 260);

  logEl._scrollBtnHandler?.();
}

function handleOutput(logEl, data, onExit) {
  switch (data.type) {
    case 'stdout':
    case 'stderr': {
      const stream = data.type;
      const cleanText = data.text.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '').replace(/\[A\[K/g, '');
      
      if (logEl._streamBuffer === undefined) logEl._streamBuffer = '';
      logEl._streamBuffer += cleanText;
      
      let lines = logEl._streamBuffer.split(/[\r\n]/);
      logEl._streamBuffer = lines.pop() || '';
      
      lines.forEach(line => {
        if (line === '') return;
        
        // Capture download filename / destination from stdout
        const nameMatch = line.match(/\[download\]\s+Destination:\s*(.+)/i)
          || line.match(/\[Merger\]\s+Merging formats into "([^"]+)"/i)
          || line.match(/\[ExtractAudio\]\s+Destination:\s*(.+)/i)
          || line.match(/\[Fixup.+\]\s+Fixing.+into "([^"]+)"/i)
          || line.match(/Output #0,\s*[^,]+,\s*to '([^']+)'/i)
          || line.match(/\[download\]\s+([^\n\r]+?)\s+has already been downloaded/i);

        if (nameMatch && nameMatch[1]) {
          const rawName = nameMatch[1].trim();
          const baseName = rawName.split(/[\\/]/).pop();
          if (baseName) logEl._lastCapturedName = baseName;
        }

        let cls = classifyLine(line, stream, logEl);
        
        // Intercept access restrictions (members-only, private, age-gated)
        if (/(Join this channel to get access|members-only content|Sign in to confirm your age|Private video|Video unavailable|Sign in to verify|confirm you are on the right network)/i.test(line)) {
            cls = 'blocked';
            line = line.replace(/ERROR:\s*/i, 'RESTRICTED: ');
            // Prevent this from flagging the entire batch run as an error
            if (logEl) logEl._hasError = false; 
        }
        
        appendLog(logEl, line, cls);
      });
      break;
    }
    case 'error':   appendLog(logEl, '⚠ ' + data.text, 'error'); break;
    case 'exit': {
      if (logEl._streamBuffer) {
        let cls = classifyLine(logEl._streamBuffer, 'stdout', logEl);
        appendLog(logEl, logEl._streamBuffer, cls);
        logEl._streamBuffer = '';
      }
      if (logEl._liveProgresses && logEl._liveProgresses.size > 0) {
        logEl._liveProgresses.clear();
        triggerRaf(logEl);
      }
      const failed = data.code !== 0 || !!logEl._hasError;
      logEl._hasError = false;
      const bs = logEl._batchStats;
      logEl._batchStats = null;
      
      const getExitMsg = (c) => {
        if (c === null) return 'Process was manually stopped or interrupted';
        if (c === 1) return 'General error (e.g., video unavailable, network issue, or partial failure)';
        if (c === 2) return 'Invalid arguments or configuration error';
        if (c === 130 || c === 3221225786) return 'Process was terminated or interrupted';
        if (c === 137) return 'Process killed (e.g., out of memory)';
        return `Unknown error (code ${c})`;
      };

      if (!failed) {
        if (bs && bs.failed > 0) {
          const ok = bs.total - bs.failed;
          appendLog(logEl, `⚠ ${ok} download${ok !== 1 ? 's' : ''} finished successfully, ${bs.failed} failed. See failed_downloads.txt`, 'warning');
        } else {
          appendLog(logEl, '✔ Process finished successfully.', 'success');
        }
        collapseLogBody(logEl, false);
        
        if (getSetting('show-notifications') && window.api.showNotification) {
          window.api.showNotification({ 
            title: 'nyx-dlp', 
            body: bs && bs.failed > 0 ? 'Batch completed with some errors.' : 'Job completed successfully!'
          });
        }
        
        // Save to History
        if (window.api.addHistory) {
          let toolName = 'Unknown Tool';
          let source = '';
          let output = '';
          let downloadName = logEl._lastCapturedName || '';
          const ts = new Date().toISOString();
          const id = Date.now() + '-' + Math.random().toString(36).slice(2, 7);
          
          if (logEl.id === 'yd-log') {
            toolName = 'yt-dlp';
            source = document.getElementById('yd-url')?.value.trim();
            output = document.getElementById('yd-output')?.value.trim();
          } else if (logEl.id === 'batch-log') {
            toolName = 'Batch Downloader';
            const urls = (document.getElementById('batch-urls')?.value.trim() || '').split('\n').filter(l => l.trim() && !l.startsWith('#'));
            source = `${urls.length} URL(s)`;
            output = document.getElementById('batch-output')?.value.trim();
          } else if (logEl.id === 'ls-log') {
            toolName = 'Live Archiver';
            source = document.getElementById('ls-url')?.value.trim();
            output = document.getElementById('ls-output')?.value.trim();
          } else if (logEl.id === 'm3-log') {
            toolName = 'M3U8 Downloader';
            source = document.getElementById('m3-url')?.value.trim();
            output = document.getElementById('m3-output')?.value.trim();
          } else if (logEl.id === 'gdl-log') {
            toolName = 'gallery-dl';
            source = document.getElementById('gdl-url')?.value.trim();
            output = document.getElementById('gdl-output')?.value.trim();
          } else if (logEl.id === 'sp-log') {
            toolName = 'Video Splitter';
            source = document.getElementById('sp-file')?.value.trim();
            output = document.getElementById('sp-output')?.value.trim() || source;
            if (!downloadName && source) downloadName = source.split(/[\\/]/).pop();
          } else if (logEl.id === 'concat-log') {
            toolName = 'Video Concatenator';
            const list = document.getElementById('concat-list');
            const items = list ? Array.from(list.querySelectorAll('.sortable-item')).length : 0;
            source = `${items} File(s)`;
            output = document.getElementById('concat-output-dir')?.value.trim();
            const customOut = document.getElementById('concat-output')?.value.trim();
            if (customOut) downloadName = customOut;
          } else if (logEl.id === 'enc-log') {
            toolName = 'Video Encoder';
            source = document.getElementById('enc-file')?.value.trim();
            output = source; // Encoder usually outputs next to source
            if (!downloadName && source) downloadName = source.split(/[\\/]/).pop();
          }
          
          if (!downloadName && source) {
            try {
              const urlObj = new URL(source);
              const pathPart = urlObj.pathname.split('/').filter(Boolean).pop();
              if (pathPart) downloadName = decodeURIComponent(pathPart);
            } catch (_) {
              downloadName = source.split(/[\\/]/).pop() || '';
            }
          }

          if (source || output) {
            window.api.addHistory({
              id,
              date: ts,
              tool: toolName,
              name: downloadName,
              source,
              output,
              status: (bs && bs.failed > 0) ? 'partial' : 'success'
            }).then(() => {
              if (window._refreshHistory) window._refreshHistory();
            });
          }
        }
      } else if (bs && bs.failed > 0) {
        if (data.code !== 0) appendLog(logEl, `✖ Process exited: ${getExitMsg(data.code)}`, 'error');
        else appendLog(logEl, '✖ Process reported errors (exit code 0).', 'error');
        const ok = bs.total - bs.failed;
        appendLog(logEl, `⚠ ${ok} download${ok !== 1 ? 's' : ''} finished successfully, ${bs.failed} failed. See failed_downloads.txt`, 'warning');
        collapseLogBody(logEl, false, 2, true);
      } else {
        if (data.code !== 0) appendLog(logEl, `✖ Process exited: ${getExitMsg(data.code)}`, 'error');
        else appendLog(logEl, '✖ Process reported errors (exit code 0).', 'error');
        collapseLogBody(logEl, true);
      }
      if (onExit) onExit(data.code);
      break;
    }
  }
}

// ── Global Terminal Button Handlers ────────────────────────
document.addEventListener('click', (e) => {
  const scrollBtn = e.target.closest('.btn-term-scroll');
  if (scrollBtn) {
    const targetId = scrollBtn.dataset.terminal;
    const logEl = document.getElementById(targetId);
    if (logEl) {
      logEl.scrollTop = logEl.scrollHeight;
    }
  }

  const copyBtn = e.target.closest('.btn-term-copy');
  if (copyBtn) {
    const targetId = copyBtn.dataset.terminal;
    const logEl = document.getElementById(targetId);
    if (logEl) {
      navigator.clipboard.writeText(logEl.innerText).then(() => {
        const originalHtml = copyBtn.innerHTML;
        copyBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"></polyline></svg>';
        setTimeout(() => copyBtn.innerHTML = originalHtml, 2000);
      });
    }
  }
});
