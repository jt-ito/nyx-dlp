import re

with open('c:/Users/ito/Desktop/Script_UI/renderer.js', 'r', encoding='utf-8') as f:
    text = f.read()

# We need to replace appendLog and flushPendingLogsSync
# Find the start of appendLog
start_idx = text.find('function appendLog(logEl, text, cls) {')
# Find the end of flushPendingLogsSync
end_idx = text.find('return lines.length;\n}', start_idx) + len('return lines.length;\n}')

old_code = text[start_idx:end_idx]

new_code = '''function appendLog(logEl, text, cls) {
  let t = text.trimStart();
  if (/^Traceback \\(most recent call last\\)/i.test(t) || /^\\s+File ".*\\.py"/.test(text)) {
    if (!logEl._hasLiveEventIgnore) logEl._hasError = true;
  }
  
  if (getSetting('console-timestamps') && !/^\\s*\\[download\\]\\s+(?:\\d+(?:\\.\\d+)?%|Destination:)/i.test(text) && !/frame=\\s*\\d+/i.test(text)) {
    const now = new Date();
    const timeStr = [ + String(now.getHours()).padStart(2, '0') + : + String(now.getMinutes()).padStart(2, '0') + : + String(now.getSeconds()).padStart(2, '0') + ] ;
    text = timeStr + text;
  }
  
  const lastCrIdx = text.lastIndexOf('\\r');
  if (lastCrIdx !== -1) {
      text = text.substring(lastCrIdx + 1);
  }

  // --- STATE MACHINE LOGIC ---
  if (!logEl._pendingLines) logEl._pendingLines = [];
  logEl._lastRenderedLine = null;

  const isStatus = text.includes('⏸ Paused') || text.includes('▶ Resumed') || text.includes('✔ Process finished') || text.includes('✖ Process exited');

  // 1. Check for Destination line (Start of a new file)
  const destMatch = text.match(/^\\s*\\[(?:download|ExtractAudio)\\]\\s+Destination:\\s+(.+)/i);
  if (destMatch) {
      // If we already have a live progress slot that wasn't finalized, force finalize it now
      if (logEl._liveProgress) {
          logEl._pendingLines.push({ text: ✔ Downloaded  + logEl._liveProgress.dest +  — (force finalized), cls: 'success', count: 1 });
          logEl._liveProgress = null;
      }
      // Open new live slot
      logEl._liveProgress = { dest: destMatch[1], text: text, cls: cls + ' line-progress' };
      // Push the destination line to permanent history as an event
      logEl._pendingLines.push({ text, cls, count: 1 });
      if (!logEl._rafPending) triggerRaf(logEl);
      return;
  }

  // 2. Check for Progress line (yt-dlp or ffmpeg)
  const isDlProgress = /^\\s*\\[download\\]\\s+(?:\\d+(?:\\.\\d+)?%|\\d+(?:\\.\\d+)?(?:KiB|MiB|GiB|TiB|B))/i.test(text);
  const isFfmpegProgress = /^\\s*frame=\\s*\\d+/i.test(text) || /^\\s*size=\\s*\\d+/i.test(text);
  
  if (isDlProgress || isFfmpegProgress) {
      if (!logEl._liveProgress) {
          // If a progress line comes but we don't have a live slot, create a generic one
          logEl._liveProgress = { dest: 'Unknown Task', text: text, cls: cls + ' line-progress' };
      } else {
          // Update the live slot in place
          logEl._liveProgress.text = text;
          logEl._liveProgress.cls = cls + ' line-progress';
      }
      
      // 3. Completion Detection
      if (text.includes('100%') || text.includes('100.0%')) {
          // Convert live slot into a permanent summary event line
          logEl._pendingLines.push({ text: ✔ Completed  + logEl._liveProgress.dest +  — 100%, cls: 'success', count: 1 });
          logEl._liveProgress = null;
      }
      
      if (!logEl._rafPending) triggerRaf(logEl);
      return;
  }

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
              last.badge.textContent =  ( + last.count + );
          } else {
              const badge = document.createElement('span');
              badge.className = 'log-badge';
              badge.style.color = '#888';
              badge.style.marginLeft = '8px';
              badge.textContent =  ( + last.count + );
              last.el.appendChild(badge);
              last.badge = badge;
          }
          if (!logEl._rafPending) triggerRaf(logEl);
          return;
      }
  }

  // Normal event line
  logEl._pendingLines.push({ text, cls, count: 1, isStatus });
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
              badge.textContent =  ( + item.count + );
              div.appendChild(badge);
              item.badge = badge;
          }
          item.el = div;
          
          if (item.isStatus) {
              statusFrag.appendChild(div);
              logEl._currentAutoCollapse = null;
          } else {
              const isAutoCollapse = (item.cls === 'debug' || item.cls === 'info') && !item.text.includes('▶ Starting') && !item.text.includes('? Starting');
              if (isAutoCollapse) {
                  if (!logEl._currentAutoCollapse) {
                      logEl._currentAutoCollapse = document.createElement('details');
                      logEl._currentAutoCollapse.className = 'auto-collapse-details';
                      const summary = document.createElement('summary');
                      summary.textContent = '... (info/debug logs)';
                      logEl._currentAutoCollapse.appendChild(summary);
                      const content = document.createElement('div');
                      content.className = 'details-content';
                      logEl._currentAutoCollapse.appendChild(content);
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
    
    // Render the single live progress slot
    logEl._progressContainer.innerHTML = '';
    if (logEl._liveProgress) {
        const div = document.createElement('div');
        div.className = logEl._liveProgress.cls;
        div.textContent = logEl._liveProgress.text;
        logEl._progressContainer.appendChild(div);
    }

    if (logEl._lineCount > 5000) {
      let removed = 0;
      while (removed < 1000 && logEl.firstChild) {
        const first = logEl.firstChild;
        if (first.classList.contains('log-body-start') ||
            first.classList.contains('log-detail') ||
            first.classList.contains('log-expand-arrow')) break;
        if (first === logEl._lastRenderedLine?.el) logEl._lastRenderedLine = null;
        logEl.removeChild(first);
        removed++;
      }
      logEl._lineCount -= removed;
      logEl._lastScrollTop = (logEl._scrollEl || logEl).scrollTop;
    }
    return lines.length;
}'''

text = text[:start_idx] + new_code + text[end_idx:]

with open('c:/Users/ito/Desktop/Script_UI/renderer.js', 'w', encoding='utf-8') as f:
    f.write(text)
print("Done")