import re

with open('c:/Users/ito/Desktop/Script_UI/renderer.js', 'r', encoding='utf-8') as f:
    text = f.read()

# Replace single _liveProgress with _liveProgressMap in appendLog

text = text.replace('''  // 1. Check for Destination line (Start of a new file)
  const destMatch = text.match(/^\s*\[(?:download|ExtractAudio)\]\s+Destination:\s+(.+)/i);
  if (destMatch) {
      // If we already have a live progress slot that wasn't finalized, force finalize it now
      if (logEl._liveProgress) {
          logEl._pendingLines.push({ text: '✔ Downloaded ' + logEl._liveProgress.dest + ' — (force finalized)', cls: 'success', count: 1 });
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
  const isDlProgress = /^\s*\[download\]\s+(?:\d+(?:\.\d+)?%|\d+(?:\.\d+)?(?:KiB|MiB|GiB|TiB|B))/i.test(text);
  const isFfmpegProgress = /^\s*frame=\s*\d+/i.test(text) || /^\s*size=\s*\d+/i.test(text);
  
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
          logEl._pendingLines.push({ text: '✔ Completed ' + logEl._liveProgress.dest + ' — 100%', cls: 'success', count: 1 });
          logEl._liveProgress = null;
      }
      
      if (!logEl._rafPending) triggerRaf(logEl);
      return;
  }''', '''  if (!logEl._liveProgressMap) logEl._liveProgressMap = new Map();

  // 1. Check for Destination line (Start of a new file)
  const destMatch = text.match(/^\s*\[(?:download|ExtractAudio)\]\s+Destination:\s+(.+)/i);
  if (destMatch) {
      const defaultTask = logEl._liveProgressMap.get('default');
      if (defaultTask && !defaultTask.completed) {
          logEl._pendingLines.push({ text: '✔ Downloaded ' + defaultTask.dest + ' — (force finalized)', cls: 'success', count: 1 });
      }
      logEl._liveProgressMap.set('default', { dest: destMatch[1], text: text, cls: cls + ' line-progress' });
      logEl._pendingLines.push({ text, cls, count: 1 });
      if (!logEl._rafPending) triggerRaf(logEl);
      return;
  }

  // 2. Check for Progress line (yt-dlp or ffmpeg)
  const progressMatch = text.match(/^\s*\[(?:download|ExtractAudio)\]\s+(?:\[(.*?)\]\s+)?(?:\d+(?:\.\d+)?%|\d+(?:\.\d+)?(?:KiB|MiB|GiB|TiB|B))/i);
  const isDlProgress = !!progressMatch;
  const isFfmpegProgress = /^\s*frame=\s*\d+/i.test(text) || /^\s*size=\s*\d+/i.test(text);
  
  if (isDlProgress || isFfmpegProgress) {
      let taskId = 'default';
      if (isDlProgress && progressMatch[1]) {
          taskId = progressMatch[1];
      } else if (isFfmpegProgress) {
          taskId = 'ffmpeg';
      }
      
      let current = logEl._liveProgressMap.get(taskId);
      if (!current) {
          current = { dest: taskId === 'default' ? 'Unknown Task' : taskId, text: text, cls: cls + ' line-progress' };
          logEl._liveProgressMap.set(taskId, current);
      } else {
          current.text = text;
          current.cls = cls + ' line-progress';
      }
      
      // 3. Completion Detection
      if (text.includes('100%') || text.includes('100.0%')) {
          if (!current.completed) {
              logEl._pendingLines.push({ text: '✔ Completed ' + current.dest + ' — 100%', cls: 'success', count: 1 });
              current.completed = true;
              logEl._liveProgressMap.delete(taskId);
          }
      }
      
      if (!logEl._rafPending) triggerRaf(logEl);
      return;
  }''')

text = text.replace('''    // Render the single live progress slot
    if (logEl._liveProgress) {
        if (!logEl._liveProgressEl) {
            logEl._liveProgressEl = document.createElement('div');
            logEl._progressContainer.appendChild(logEl._liveProgressEl);
        }
        logEl._liveProgressEl.className = logEl._liveProgress.cls;
        logEl._liveProgressEl.textContent = logEl._liveProgress.text;
    } else {
        if (logEl._liveProgressEl) {
            logEl._progressContainer.innerHTML = '';
            logEl._liveProgressEl = null;
        }
    }''', '''    // Render the live progress slots
    if (logEl._liveProgressMap && logEl._liveProgressMap.size > 0) {
        if (!logEl._liveProgressEls) logEl._liveProgressEls = new Map();
        
        // Remove elements for tasks that no longer exist
        for (const [taskId, el] of logEl._liveProgressEls.entries()) {
            if (!logEl._liveProgressMap.has(taskId)) {
                el.remove();
                logEl._liveProgressEls.delete(taskId);
            }
        }
        
        // Add/Update elements
        for (const [taskId, data] of logEl._liveProgressMap.entries()) {
            let el = logEl._liveProgressEls.get(taskId);
            if (!el) {
                el = document.createElement('div');
                logEl._progressContainer.appendChild(el);
                logEl._liveProgressEls.set(taskId, el);
            }
            el.className = data.cls;
            el.textContent = data.text;
        }
    } else {
        if (logEl._liveProgressEls) {
            logEl._progressContainer.innerHTML = '';
            logEl._liveProgressEls.clear();
        }
    }''')

with open('c:/Users/ito/Desktop/Script_UI/renderer.js', 'w', encoding='utf-8') as f:
    f.write(text)