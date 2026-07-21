/* â”€â”€ renderer.js â”€ UI logic â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */

// â”€â”€ Remote API Mocking (for browsers) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
if (typeof window.api === 'undefined') {
  console.log("No window.api found. Initializing remote WebSocket connection...");
  
  // Hide window controls for remote clients
  const controls = document.querySelector('.titlebar-controls');
  if (controls) controls.style.display = 'none';

  const ws = new WebSocket(`ws://${window.location.host}`);
  const pendingRequests = new Map();
  let nextReqId = 1;

  window.api = {
    appVersion: 'remote',
    minimize: () => {}, maximize: () => {}, close: () => {}, setMinimizeToTray: () => {},
    pickFolder: () => new Promise(r => r(null)),
    pickFile: () => new Promise(r => r(null)),
    pickVideo: () => new Promise(r => r(null)),
    pickFiles: () => new Promise(r => r(null)),
    getDiskSpace: (path) => new Promise(resolve => {
      const id = nextReqId++;
      pendingRequests.set(id, resolve);
      ws.send(JSON.stringify({ type: 'ipc-invoke', channel: 'get-disk-space', id, data: path }));
    }),
    
    // Script runners
    runLivestream: (opts) => ws.send(JSON.stringify({ type: 'ipc-send', channel: 'run-livestream', data: opts })),
    runYtdlp:      (opts) => ws.send(JSON.stringify({ type: 'ipc-send', channel: 'run-ytdlp', data: opts })),
    runBatch:      (opts) => ws.send(JSON.stringify({ type: 'ipc-send', channel: 'run-batch', data: opts })),
    runM3u8:       (opts) => ws.send(JSON.stringify({ type: 'ipc-send', channel: 'run-m3u8', data: opts })),
    runGalleryDl:  (opts) => ws.send(JSON.stringify({ type: 'ipc-send', channel: 'run-gallery-dl', data: opts })),
    runSplitter:   (opts) => ws.send(JSON.stringify({ type: 'ipc-send', channel: 'run-splitter', data: opts })),
    runConcatenator: (opts) => ws.send(JSON.stringify({ type: 'ipc-send', channel: 'run-concatenator', data: opts })),

    // Output listeners
    _listeners: {},
    _addListener(channel, cb) {
      if (!this._listeners[channel]) this._listeners[channel] = [];
      this._listeners[channel].push(cb);
    },
    onLivestreamOutput: function(cb) { this._addListener('livestream-output', cb) },
    onYtdlpOutput:      function(cb) { this._addListener('ytdlp-output', cb) },
    onBatchOutput:      function(cb) { this._addListener('batch-output', cb) },
    onM3u8Output:       function(cb) { this._addListener('m3u8-output', cb) },
    onGalleryDlOutput:  function(cb) { this._addListener('gallery-dl-output', cb) },
    onSplitterOutput:   function(cb) { this._addListener('splitter-output', cb) },
    onConcatenatorOutput: function(cb) { this._addListener('concatenator-output', cb) },
    onSyncUiState:      function(cb) { this._addListener('sync-ui-state', cb) },
    onFullState:        function(cb) { this._addListener('full-state', cb) },

    stopScript:   (pid) => ws.send(JSON.stringify({ type: 'ipc-send', channel: 'stop-script', data: { pid } })),
    pauseScript:  (pid) => ws.send(JSON.stringify({ type: 'ipc-send', channel: 'pause-script', data: { pid } })),
    resumeScript: (pid) => ws.send(JSON.stringify({ type: 'ipc-send', channel: 'resume-script', data: { pid } })),
    syncUiState:  (data) => ws.send(JSON.stringify({ type: 'ipc-send', channel: 'sync-ui-state', data })),
    requestFullState: () => ws.send(JSON.stringify({ type: 'ipc-send', channel: 'request-full-state' })),

    removeAllListeners: function(channel) {
       this._listeners[channel] = [];
    },
    
    startRemoteServer: () => {},
    stopRemoteServer: () => {}
  };

  ws.onmessage = (event) => {
    const msg = JSON.parse(event.data);
    if (msg.type === 'ipc-reply' && window.api._listeners[msg.channel]) {
      window.api._listeners[msg.channel].forEach(cb => cb(msg.data));
    } else if (msg.type === 'ipc-invoke-reply') {
      const resolve = pendingRequests.get(msg.id);
      if (resolve) {
        resolve(msg.result);
        pendingRequests.delete(msg.id);
      }
    }
  };
}

const html = document.documentElement;

// â”€â”€ Theme â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const themeToggle = document.getElementById('themeToggle');
const iconMoon = themeToggle.querySelector('.icon-moon');
const iconSun  = themeToggle.querySelector('.icon-sun');

function setTheme(theme) {
  html.setAttribute('data-theme', theme);
  localStorage.setItem('theme', theme);
  if (theme === 'dark') {
    iconMoon.style.display = '';
    iconSun.style.display  = 'none';
  } else {
    iconMoon.style.display = 'none';
    iconSun.style.display  = '';
  }
}
setTheme(localStorage.getItem('theme') || 'dark');
themeToggle.addEventListener('click', () =>
  setTheme(html.getAttribute('data-theme') === 'dark' ? 'light' : 'dark')
);

// â”€â”€ Window Controls â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
document.getElementById('btnMin').addEventListener('click',   () => window.api.minimize());
document.getElementById('btnMax').addEventListener('click',   () => window.api.maximize());
document.getElementById('btnClose').addEventListener('click', () => window.api.close());

// â”€â”€ Tab Navigation â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
document.querySelectorAll('.nav-item').forEach(btn => {
  btn.addEventListener('click', () => {
    // Only process nav items that actually have data-tab to avoid issues with other nav buttons
    if (!btn.dataset.tab) return;
    
    const activePanel = document.querySelector('.tab-panel.active');
    if (activePanel) {
      const contentEl = document.querySelector('.content');
      if (contentEl) activePanel._savedScroll = contentEl.scrollTop;
    }
    document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
    // Deactivate all panels â€” skip _updateScrollBtn on hidden panels to avoid
    // forced layout reads (scrollHeight/clientHeight) on terminals that aren't visible.
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    const panel = document.getElementById('tab-' + btn.dataset.tab);
    if (panel) {
      panel.classList.add('active');
      // Only render opts for the tab that's becoming visible (lazy, targeted).
      updateOptsForTab(btn.dataset.tab);
      if (panel._savedScroll !== undefined) {
        const contentEl = document.querySelector('.content');
        if (contentEl) contentEl.scrollTop = panel._savedScroll;
      }
      // Only update scroll buttons on the newly-active panel's terminals.
      panel.querySelectorAll('[data-terminal]').forEach(t => t._updateScrollBtn?.());
      // Flush any log lines that accumulated while this tab was in the background.
      // Lines were held in _pendingLines (not written to DOM) to avoid hidden layout work.
      panel.querySelectorAll('[data-log-el]').forEach(logEl => {
        if (logEl._hasUnflushed || (logEl._pendingLines?.length ?? 0) > 0) {
          logEl._hasUnflushed = false;
          flushPendingLogsSync(logEl);
          if (logEl._autoFollow !== false) {
            const scrollEl = logEl._scrollEl || logEl;
            scrollEl.scrollTop = scrollEl.scrollHeight;
            logEl._lastScrollTop = scrollEl.scrollTop;  // Bug 2: keep direction-detection in sync
          }
          logEl._updateScrollBtn?.();
        }
      });
    }
  });
});

// â”€â”€ Form-level advanced section toggles â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
document.addEventListener('click', e => {
  const btn = e.target.closest('.form-adv-toggle');
  if (!btn) return;
  const body = document.getElementById(btn.dataset.adv);
  if (!body) return;
  const open = body.classList.toggle('open');
  btn.setAttribute('aria-expanded', String(open));
});

// â”€â”€ Folder Picker â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
document.querySelectorAll('.btn-folder').forEach(btn => {
  btn.addEventListener('click', async () => {
    const type = btn.dataset.pickType;
    let res;
    if (type === 'file') {
        res = await window.api.pickFile();
      } else if (type === 'video') {
        res = await window.api.pickVideo();
      } else if (type === 'multi-file') {
      res = await window.api.pickFiles();
    } else {
      res = await window.api.pickFolder();
    }
    if (res) {
      const target = document.getElementById(btn.dataset.target);
      if (target) {
        if (target.classList.contains('sortable-list')) {
          if (type === 'multi-file') {
            res.forEach(filepath => window.addSortableItem(target, filepath));
          }
        } else if (type === 'multi-file') {
          const current = target.value.trim();
          target.value = current ? current + '\n' + res.join('\n') : res.join('\n');
          target.dispatchEvent(new Event('input', { bubbles: true }));
        } else {
          target.value = res;
          target.dispatchEvent(new Event('input', { bubbles: true }));
        }
      }
    }
  });
});

// â”€â”€ Sortable List Logic â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
window.addSortableItem = function(container, filepath) {
  const emptyState = container.querySelector('.sortable-empty-state');
  if (emptyState) emptyState.remove();

  const item = document.createElement('div');
  item.className = 'sortable-item';
  item.draggable = true;
  item.dataset.path = filepath;

  const dragHandle = document.createElement('div');
  dragHandle.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M8 6h8M8 12h8M8 18h8" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
  dragHandle.style.cursor = 'grab';
  dragHandle.style.color = 'var(--text-subtle)';

  const content = document.createElement('div');
  content.className = 'sortable-item-content';
  content.title = filepath;
  const filename = filepath.split('\\').pop().split('/').pop();
  content.textContent = filename;

  const removeBtn = document.createElement('div');
  removeBtn.className = 'sortable-item-remove';
  removeBtn.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none"><line x1="18" y1="6" x2="6" y2="18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><line x1="6" y1="6" x2="18" y2="18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
  removeBtn.onclick = () => {
    item.remove();
    if (container.children.length === 0) {
      container.innerHTML = '<div class="sortable-empty-state">No files selected. Use the browse button to add videos.</div>';
    }
  };

  item.appendChild(dragHandle);
  item.appendChild(content);
  item.appendChild(removeBtn);

  item.addEventListener('dragstart', (e) => {
    item.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
    window._draggingItem = item;
  });
  item.addEventListener('dragend', () => {
    item.classList.remove('dragging');
    window._draggingItem = null;
    container.querySelectorAll('.sortable-item').forEach(el => {
      el.classList.remove('drag-over-top', 'drag-over-bottom');
    });
  });
  item.addEventListener('dragover', (e) => {
    e.preventDefault();
    if (!window._draggingItem || window._draggingItem === item) return;
    const rect = item.getBoundingClientRect();
    const mid = rect.top + rect.height / 2;
    if (e.clientY < mid) {
      item.classList.add('drag-over-top');
      item.classList.remove('drag-over-bottom');
    } else {
      item.classList.add('drag-over-bottom');
      item.classList.remove('drag-over-top');
    }
  });
  item.addEventListener('dragleave', () => {
    item.classList.remove('drag-over-top', 'drag-over-bottom');
  });
  item.addEventListener('drop', (e) => {
    e.preventDefault();
    item.classList.remove('drag-over-top', 'drag-over-bottom');
    if (!window._draggingItem || window._draggingItem === item) return;
    const rect = item.getBoundingClientRect();
    const mid = rect.top + rect.height / 2;
    if (e.clientY < mid) {
      container.insertBefore(window._draggingItem, item);
    } else {
      container.insertBefore(window._draggingItem, item.nextSibling);
    }
  });

  container.appendChild(item);
};

// â”€â”€ Status Bar â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const statusDot  = document.getElementById('statusDot');
const statusText = document.getElementById('statusText');
const statusWrap = document.getElementById('statusWrap');
let runningCount = 0;
const runningTools = new Set();

function setStatus(state, text) {
  statusDot.className = 'status-dot ' + (state || '');
  statusText.textContent = text || 'Idle';
}
function updateRunningTooltip() {
  statusWrap.title = runningTools.size > 0 ? [...runningTools].join('\n') : '';
}
function incRunning(tool) {
  runningCount++;
  if (tool) runningTools.add(tool);
  updateRunningTooltip();
  setStatus('running', 'Running...');
}
function decRunning(tool) {
  runningCount = Math.max(0, runningCount - 1);
  if (tool) runningTools.delete(tool);
  updateRunningTooltip();
  if (runningCount === 0) setStatus('done', 'Done');
}

// â”€â”€ Settings â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const SETTINGS_MAP = {
  'show-tool-livestream': { navTab: 'livestream' },
  'show-tool-ytdlp':      { navTab: 'ytdlp' },
  'show-tool-batch':      { navTab: 'batch' },
  'show-tool-m3u8':       { navTab: 'm3u8' },
  'show-tool-gallery':    { navTab: 'gallery' },
  'show-tool-splitter':   { navTab: 'splitter' },
  'show-tool-concatenator': { navTab: 'concatenator' },
  'show-tool-encoder':    { navTab: 'encoder' },
  'show-ls-quality':      { el: 'ls-quality-group' },
  'show-yd-format':       { el: 'yd-format-group' },
  'show-yd-client':       { el: 'yd-client-group' },
  'show-batch-format':    { el: 'batch-format-group' },
  'show-batch-client':    { el: 'batch-client-group' },
  'show-batch-rest':      { el: 'batch-rest-group' },
  'show-m3-encode':       { el: 'm3-encode-group' },
  'show-gdl-filetypes':   { el: 'gdl-filetypes-group' },
  'show-gdl-meta':        { el: 'gdl-meta-group' },
  'show-ls-client':       { el: 'ls-client-group' },
  'dep-use-bgutil':       { el: 'dep-bgutil-url-group' },
  'show-disk-space':      { custom: 'disk-space' },
  'minimize-to-tray':     { custom: 'tray' },
  'remote-access':        { custom: 'remote-access' },
};
const SETTINGS_DEFAULTS = {
  'show-tool-livestream': true,
  'show-tool-ytdlp':      true,
  'show-tool-batch':      true,
  'show-tool-m3u8':       true,
  'show-tool-gallery':    true,
  'show-tool-splitter':   true,
  'show-tool-concatenator': true,
  'show-tool-encoder':    true,
  'show-ls-quality':      true,
  'show-yd-format':       true,
  'show-yd-client':       true,
  'show-batch-format':    true,
  'show-batch-client':    true,
  'show-batch-rest':      true,
  'show-m3-encode':       true,
  'show-gdl-filetypes':   true,
  'show-gdl-meta':        true,
  'show-ls-client':       true,
  'dep-use-bgutil':       true,
  'dep-use-deno':         true,
  'dep-install-gdl':      true,
  'show-disk-space':      false,
  'minimize-to-tray':     false,
  'remote-access':        false,
};

// â”€â”€ yt-dlp Advanced Options definition â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const YTDLP_OPTS = [
  // File & Naming
  { cat:'File & Naming', key:'output',              flag:'--output',               hasVal:true,  label:'Output template',          desc:'Filename template, e.g. %(title)s.%(ext)s',               type:'text',   placeholder:'%(title)s.%(ext)s' },
  { cat:'File & Naming', key:'restrict-filenames',  flag:'--restrict-filenames',   hasVal:false, label:'Restrict filenames',       desc:'ASCII-only filenames, no & or spaces',                    type:'toggle' },
  { cat:'File & Naming', key:'windows-filenames',   flag:'--windows-filenames',    hasVal:false, label:'Force Windows filenames',  desc:'Always produce Windows-compatible filenames',             type:'toggle' },
  { cat:'File & Naming', key:'trim-filenames',      flag:'--trim-filenames',       hasVal:true,  label:'Trim filename length',     desc:'Max chars in filename (excl. extension)',                  type:'number', placeholder:'200' },
  { cat:'File & Naming', key:'no-overwrites',       flag:'--no-overwrites',        hasVal:false, label:'No overwrites',            desc:'Skip download if the file already exists',                type:'toggle' },
  { cat:'File & Naming', key:'force-overwrites',    flag:'--force-overwrites',     hasVal:false, label:'Force overwrites',         desc:'Overwrite all video and metadata files',                  type:'toggle' },
  { cat:'File & Naming', key:'no-continue',         flag:'--no-continue',          hasVal:false, label:'Disable resume',           desc:'Restart download instead of resuming partial files',      type:'toggle' },
  { cat:'File & Naming', key:'mtime',               flag:'--mtime',                hasVal:false, label:'Set modification time',    desc:'Use Last-modified header to set file mtime',              type:'toggle' },
  { cat:'File & Naming', key:'write-description',   flag:'--write-description',    hasVal:false, label:'Write description file',   desc:'Save video description to a .description file',           type:'toggle' },
  { cat:'File & Naming', key:'write-info-json',     flag:'--write-info-json',      hasVal:false, label:'Write info JSON',          desc:'Save video metadata to a .info.json file',                type:'toggle' },
  { cat:'File & Naming', key:'write-comments',      flag:'--write-comments',       hasVal:false, label:'Write comments',           desc:'Retrieve and embed video comments into infojson',         type:'toggle' },
  { cat:'File & Naming', key:'cookies-from-browser',flag:'--cookies-from-browser', hasVal:true,  label:'Cookies from browser',    desc:'Load cookies directly from an installed browser',         type:'select', opts:[{value:'',label:'Disabled'},{value:'chrome',label:'Chrome'},{value:'firefox',label:'Firefox'},{value:'edge',label:'Edge'},{value:'brave',label:'Brave'},{value:'opera',label:'Opera'},{value:'safari',label:'Safari'},{value:'vivaldi',label:'Vivaldi'}] },
  { cat:'File & Naming', key:'no-cache-dir',        flag:'--no-cache-dir',         hasVal:false, label:'Disable cache',            desc:'Disable yt-dlp filesystem caching',                       type:'toggle' },
  // Subtitles
  { cat:'Subtitles', key:'write-subs',       flag:'--write-subs',       hasVal:false, label:'Write subtitle files',     desc:'Download and save subtitle files alongside the video',  type:'toggle' },
  { cat:'Subtitles', key:'write-auto-subs',  flag:'--write-auto-subs',  hasVal:false, label:'Write auto-generated subs',desc:'Download auto-generated subtitles when available',       type:'toggle' },
  { cat:'Subtitles', key:'sub-format',       flag:'--sub-format',       hasVal:true,  label:'Subtitle format',          desc:'e.g. srt  or  ass/srt/best',                             type:'text',   placeholder:'srt' },
  { cat:'Subtitles', key:'sub-langs',        flag:'--sub-langs',        hasVal:true,  label:'Subtitle languages',       desc:'Comma-separated codes, e.g. en,ja',                      type:'text',   placeholder:'en' },
  // Post-Processing
  { cat:'Post-Processing', key:'extract-audio',         flag:'--extract-audio',          hasVal:false, label:'Extract audio only',           desc:'Convert video to audio-only output (requires ffmpeg)',      type:'toggle' },
  { cat:'Post-Processing', key:'audio-format',          flag:'--audio-format',           hasVal:true,  label:'Audio format',                 desc:'Format for extracted audio',                               type:'select', opts:[{value:'',label:'Default'},{value:'best',label:'Best'},{value:'aac',label:'AAC'},{value:'alac',label:'ALAC'},{value:'flac',label:'FLAC'},{value:'m4a',label:'M4A'},{value:'mp3',label:'MP3'},{value:'opus',label:'Opus'},{value:'wav',label:'WAV'}] },
  { cat:'Post-Processing', key:'audio-quality',         flag:'--audio-quality',          hasVal:true,  label:'Audio quality',                desc:'0 (best) â€“ 10 (worst) for VBR, or bitrate e.g. 128K',      type:'text',   placeholder:'5' },
  { cat:'Post-Processing', key:'remux-video',           flag:'--remux-video',            hasVal:true,  label:'Remux to container',           desc:'Remux without re-encoding (e.g. mp4, mkv, webm)',           type:'select', opts:[{value:'',label:'Disabled'},{value:'mp4',label:'MP4'},{value:'mkv',label:'MKV'},{value:'webm',label:'WebM'},{value:'mov',label:'MOV'},{value:'avi',label:'AVI'},{value:'flv',label:'FLV'}] },
  { cat:'Post-Processing', key:'recode-video',          flag:'--recode-video',           hasVal:true,  label:'Re-encode video',              desc:'Re-encode into another format, e.g. mp4 or mkv',            type:'text',   placeholder:'mp4' },
  { cat:'Post-Processing', key:'keep-video',            flag:'--keep-video',             hasVal:false, label:'Keep intermediate video',      desc:'Keep original video file after post-processing',            type:'toggle' },
  { cat:'Post-Processing', key:'embed-thumbnail',       flag:'--embed-thumbnail',        hasVal:false, label:'Embed thumbnail',              desc:'Embed video thumbnail as cover art',                        type:'toggle' },
  { cat:'Post-Processing', key:'embed-chapters',        flag:'--embed-chapters',         hasVal:false, label:'Embed chapters',               desc:'Add chapter markers to the video file',                     type:'toggle' },
  { cat:'Post-Processing', key:'split-chapters',        flag:'--split-chapters',         hasVal:false, label:'Split by chapters',            desc:'Split video into separate files per chapter',               type:'toggle' },
  { cat:'Post-Processing', key:'remove-chapters',       flag:'--remove-chapters',        hasVal:true,  label:'Remove chapters (regex)',      desc:'Remove chapters whose title matches a regex pattern',        type:'text',   placeholder:'sponsor.*' },
  { cat:'Post-Processing', key:'ffmpeg-location',       flag:'--ffmpeg-location',        hasVal:true,  label:'FFmpeg location',              desc:'Path to ffmpeg binary or its containing directory',          type:'text',   placeholder:'C:\\ffmpeg\\bin' },
  { cat:'Post-Processing', key:'exec',                  flag:'--exec',                   hasVal:true,  label:'Execute command',              desc:'Run a command after download  (%(filepath)q for the path)', type:'text',   placeholder:'echo %(filepath)q' },
  { cat:'Post-Processing', key:'convert-subs',          flag:'--convert-subs',           hasVal:true,  label:'Convert subtitles',            desc:'Convert subtitle files to another format',                   type:'select', opts:[{value:'',label:'Disabled'},{value:'srt',label:'SRT'},{value:'vtt',label:'VTT'},{value:'ass',label:'ASS'},{value:'lrc',label:'LRC'}] },
  { cat:'Post-Processing', key:'fixup',                 flag:'--fixup',                  hasVal:true,  label:'Fixup policy',                 desc:'How to handle correctable file faults',                      type:'select', opts:[{value:'',label:'Default'},{value:'never',label:'Never fix'},{value:'warn',label:'Warn only'},{value:'detect_or_warn',label:'Detect or warn'},{value:'force',label:'Force fix'}] },
  { cat:'Post-Processing', key:'force-keyframes-at-cuts',flag:'--force-keyframes-at-cuts',hasVal:false,label:'Force keyframes at cuts',      desc:'Force keyframes at split/remove points (slow, re-encodes)', type:'toggle' },
  { cat:'Post-Processing', key:'xattrs',                flag:'--xattrs',                 hasVal:false, label:'Write xattrs',                 desc:'Write metadata to file extended attributes (Dublin Core)',   type:'toggle' },
  // Authentication
  { cat:'Authentication', key:'username',               flag:'--username',               hasVal:true,  label:'Username',                     desc:'Login with this account username/ID',                                  type:'text',   placeholder:'myusername' },
  { cat:'Authentication', key:'password',               flag:'--password',               hasVal:true,  label:'Password',                     desc:'Account password',                                                     type:'password', placeholder:'â€¢â€¢â€¢â€¢â€¢â€¢â€¢â€¢' },
  { cat:'Authentication', key:'twofactor',              flag:'--twofactor',              hasVal:true,  label:'Two-factor code',               desc:'Two-factor authentication code',                                       type:'text',   placeholder:'123456' },
  { cat:'Authentication', key:'netrc',                  flag:'--netrc',                  hasVal:false, label:'Use .netrc',                   desc:'Use .netrc authentication data',                                       type:'toggle' },
  { cat:'Authentication', key:'netrc-location',         flag:'--netrc-location',         hasVal:true,  label:'.netrc location',               desc:'Path to .netrc file or its containing directory',                      type:'text',   placeholder:'~/.netrc' },
  { cat:'Authentication', key:'video-password',         flag:'--video-password',         hasVal:true,  label:'Video password',               desc:'Video-specific password for password-protected content',                type:'password', placeholder:'â€¢â€¢â€¢â€¢â€¢â€¢â€¢â€¢' },
  { cat:'Authentication', key:'ap-mso',                 flag:'--ap-mso',                 hasVal:true,  label:'Adobe Pass MSO',               desc:'Adobe Pass TV provider identifier (use --ap-list-mso for list)',        type:'text',   placeholder:'comcast' },
  { cat:'Authentication', key:'ap-username',            flag:'--ap-username',            hasVal:true,  label:'Adobe Pass username',          desc:'Multiple-system operator account login',                               type:'text',   placeholder:'myusername' },
  { cat:'Authentication', key:'ap-password',            flag:'--ap-password',            hasVal:true,  label:'Adobe Pass password',          desc:'Multiple-system operator account password',                            type:'password', placeholder:'â€¢â€¢â€¢â€¢â€¢â€¢â€¢â€¢' },
  { cat:'Authentication', key:'client-certificate',     flag:'--client-certificate',     hasVal:true,  label:'Client certificate (PEM)',     desc:'Path to client certificate file in PEM format',                        type:'text',   placeholder:'C:\certs\client.pem' },
  { cat:'Authentication', key:'client-certificate-key', flag:'--client-certificate-key', hasVal:true, label:'Certificate private key',      desc:'Path to private key file for client certificate',                      type:'text',   placeholder:'C:\certs\client.key' },
  { cat:'Authentication', key:'client-certificate-password', flag:'--client-certificate-password', hasVal:true, label:'Certificate key password', desc:'Password for client certificate private key if encrypted',            type:'password', placeholder:'â€¢â€¢â€¢â€¢â€¢â€¢â€¢â€¢' },
  // Network & Proxy
  { cat:'Network & Proxy', key:'proxy',                 flag:'--proxy',                 hasVal:true,  label:'Proxy URL',                   desc:'HTTP/HTTPS/SOCKS4/SOCKS5 proxy URL, e.g. socks5://127.0.0.1:1080',   type:'text',   placeholder:'socks5://127.0.0.1:1080' },
  { cat:'Network & Proxy', key:'source-address',        flag:'--source-address',        hasVal:true,  label:'Source IP address',           desc:'Bind outgoing connections to this local IP address',                   type:'text',   placeholder:'0.0.0.0' },
  { cat:'Network & Proxy', key:'force-ipv4',            flag:'--force-ipv4',            hasVal:false, label:'Force IPv4',                  desc:'Make all connections via IPv4',                                        type:'toggle' },
  { cat:'Network & Proxy', key:'force-ipv6',            flag:'--force-ipv6',            hasVal:false, label:'Force IPv6',                  desc:'Make all connections via IPv6',                                        type:'toggle' },
  { cat:'Network & Proxy', key:'socket-timeout',        flag:'--socket-timeout',        hasVal:true,  label:'Socket timeout (s)',          desc:'Abort networking operations that take longer than this',               type:'number', placeholder:'30' },
  { cat:'Network & Proxy', key:'geo-bypass',            flag:'--geo-bypass',            hasVal:false, label:'Geo-restriction bypass',      desc:'Bypass geographic restrictions via faking X-Forwarded-For header',    type:'toggle' },
  { cat:'Network & Proxy', key:'geo-bypass-country',    flag:'--geo-bypass-country',    hasVal:true,  label:'Geo-bypass country code',     desc:'Force this ISO 3166-2 country code for geo-bypass (e.g. US)',         type:'text',   placeholder:'US' },
  { cat:'Network & Proxy', key:'no-check-certificates', flag:'--no-check-certificates', hasVal:false, label:'Skip certificate check',      desc:'Suppress HTTPS certificate validation errors',                        type:'toggle' },
  { cat:'Network & Proxy', key:'legacy-server-connect', flag:'--legacy-server-connect', hasVal:false, label:'Legacy server connect',       desc:'Allow legacy insecure TLS connections (workaround for old servers)',  type:'toggle' },
  { cat:'Network & Proxy', key:'prefer-insecure',       flag:'--prefer-insecure',       hasVal:false, label:'Prefer HTTP over HTTPS',      desc:'Use unencrypted connection when server supports both',                type:'toggle' },
  // Download Tuning
  { cat:'Download Tuning', key:'retries',               flag:'--retries',               hasVal:true,  label:'Retries',                     desc:'Number of retries before giving up (default 10; "infinite" accepted)', type:'number', placeholder:'10' },
  { cat:'Download Tuning', key:'fragment-retries',      flag:'--fragment-retries',      hasVal:true,  label:'Fragment retries',            desc:'Retries per HLS/DASH fragment (default 10; "infinite" accepted)',     type:'number', placeholder:'10' },
  { cat:'Download Tuning', key:'concurrent-fragments',  flag:'--concurrent-fragments',  hasVal:true,  label:'Concurrent fragments',        desc:'Number of HLS/DASH fragments to download simultaneously (default 1)', type:'number', placeholder:'1' },
  { cat:'Download Tuning', key:'site-concurrent-fragments', flag:'--site-concurrent-fragments', hasVal:true, label:'Site-specific concurrent fragments', desc:'Override concurrent fragments by domain (e.g. youtube.com=5, twitch.tv=10)', type:'text', placeholder:'youtube.com=5, twitch.tv=10' },
  { cat:'Download Tuning', key:'rate-limit',            flag:'--rate-limit',            hasVal:true,  label:'Max download rate',           desc:'Maximum download speed, e.g. 500K or 2.5M',                           type:'text',   placeholder:'2M' },
  { cat:'Download Tuning', key:'throttled-rate',        flag:'--throttled-rate',        hasVal:true,  label:'Throttle detection rate',     desc:'Re-extract video URL if download speed drops below this (e.g. 100K)', type:'text',   placeholder:'100K' },
  { cat:'Download Tuning', key:'sleep-interval',        flag:'--sleep-interval',        hasVal:true,  label:'Sleep between downloads (s)', desc:'Wait at least this many seconds before each download',                type:'number', placeholder:'3' },
  { cat:'Download Tuning', key:'max-sleep-interval',    flag:'--max-sleep-interval',    hasVal:true,  label:'Max sleep interval (s)',      desc:'Upper bound of random sleep interval (used with Sleep between downloads)', type:'number', placeholder:'10' },
  { cat:'Download Tuning', key:'buffer-size',           flag:'--buffer-size',           hasVal:true,  label:'Download buffer size',        desc:'Size of the download buffer (e.g. 16K, 1M)',                          type:'text',   placeholder:'16K' },
  // Playlist & Selection
  { cat:'Playlist & Selection', key:'no-playlist',      flag:'--no-playlist',           hasVal:false, label:'No playlist',                 desc:'If URL has both a video and playlist, download only the video',       type:'toggle' },
  { cat:'Playlist & Selection', key:'yes-playlist',     flag:'--yes-playlist',          hasVal:false, label:'Force playlist',              desc:'If URL has both a video and playlist, download the full playlist',    type:'toggle' },
  { cat:'Playlist & Selection', key:'playlist-start',   flag:'--playlist-start',        hasVal:true,  label:'Playlist start index',        desc:'Start at this playlist position (1-based, default 1)',                type:'number', placeholder:'1' },
  { cat:'Playlist & Selection', key:'playlist-end',     flag:'--playlist-end',          hasVal:true,  label:'Playlist end index',          desc:'Stop at this playlist position (default: last)',                       type:'number', placeholder:'20' },
  { cat:'Playlist & Selection', key:'playlist-items',   flag:'--playlist-items',        hasVal:true,  label:'Playlist item selector',      desc:'Items to download, e.g. 1,3,5-8 or ::-1 to reverse',                 type:'text',   placeholder:'1,3,5-8' },
  { cat:'Playlist & Selection', key:'max-downloads',    flag:'--max-downloads',         hasVal:true,  label:'Max downloads',               desc:'Abort the run after this many files have been downloaded',             type:'number', placeholder:'50' },
  { cat:'Playlist & Selection', key:'match-filter',     flag:'--match-filter',          hasVal:true,  label:'Match filter',                desc:'Only download videos matching this metadata expression, e.g. duration<3600', type:'text', placeholder:'duration < 3600' },
  { cat:'Playlist & Selection', key:'dateafter',        flag:'--dateafter',             hasVal:true,  label:'Date after (YYYYMMDD)',        desc:'Only download videos uploaded on or after this date',                 type:'text',   placeholder:'20240101' },
  { cat:'Playlist & Selection', key:'datebefore',       flag:'--datebefore',            hasVal:true,  label:'Date before (YYYYMMDD)',       desc:'Only download videos uploaded on or before this date',                type:'text',   placeholder:'20241231' },
  { cat:'Playlist & Selection', key:'download-sections', flag:'--download-sections',   hasVal:true,  label:'Download sections',           desc:'Download only specific time range or chapter, e.g. *10:15-20:30',     type:'text',   placeholder:'*10:15-20:30' },
  { cat:'Playlist & Selection', key:'flat-playlist',    flag:'--flat-playlist',         hasVal:false, label:'Flat playlist (list only)',    desc:'List playlist entries without downloading each video â€” useful for inspection', type:'toggle' },
  // Thumbnails
  { cat:'Thumbnails', key:'write-thumbnail',        flag:'--write-thumbnail',           hasVal:false, label:'Write thumbnail',             desc:'Save the best available thumbnail image to disk',                     type:'toggle' },
  { cat:'Thumbnails', key:'write-all-thumbnails',   flag:'--write-all-thumbnails',      hasVal:false, label:'Write all thumbnails',        desc:'Save every available thumbnail resolution/format to disk',            type:'toggle' },
  { cat:'Thumbnails', key:'convert-thumbnails',     flag:'--convert-thumbnails',        hasVal:true,  label:'Convert thumbnails to',       desc:'Convert saved thumbnails to this format (requires FFmpeg)',            type:'select', opts:[{value:'',label:'Disabled'},{value:'jpg',label:'JPG'},{value:'png',label:'PNG'},{value:'webp',label:'WebP'}] },
  // SponsorBlock
  { cat:'SponsorBlock', key:'sponsorblock-remove',  flag:'--sponsorblock-remove',       hasVal:true,  label:'SponsorBlock: remove',        desc:'Cut out these segment categories (comma-separated): sponsor, intro, outro, selfpromo, preview, filler, interaction, music_offtopic, poi_highlight, chapter, all', type:'text', placeholder:'sponsor,intro,outro' },
  { cat:'SponsorBlock', key:'sponsorblock-mark',    flag:'--sponsorblock-mark',         hasVal:true,  label:'SponsorBlock: mark as chapter', desc:'Add chapter markers for these categories instead of removing them',  type:'text',   placeholder:'sponsor' },
  { cat:'SponsorBlock', key:'no-sponsorblock',      flag:'--no-sponsorblock',           hasVal:false, label:'Disable SponsorBlock',        desc:'Disable all SponsorBlock features',                                   type:'toggle' },
];

function getExtraArgs(prefix) {
  const args = [];
  YTDLP_OPTS.forEach(opt => {
    const stored = localStorage.getItem(prefix + opt.key);
    if (opt.type === 'toggle') {
      if (stored === 'true') args.push(opt.flag);
    } else if (stored) {
      args.push(opt.flag, stored);
    }
  });
  return args;
}
function getExtraYtdlpArgs() {
    let extraArgs = getExtraArgs('ytdlp-opt:');
    if (getSetting('yd-retry-ssl')) extraArgs.push('--auto-retry-errors');
    const client = document.getElementById('yd-client').value;
    if (client && client !== 'default') extraArgs.push('--extractor-args', 'youtube:player_client=' + client);
    return extraArgs;
}
function getBatchExtraArgs() {
    let extraArgs = getExtraArgs('batch-opt:');
    if (getSetting('yd-retry-ssl')) extraArgs.push('--auto-retry-errors');
    const client = document.getElementById('batch-client').value;
    if (client && client !== 'default') extraArgs.push('--extractor-args', 'youtube:player_client=' + client);
    return extraArgs;
}


// â”€â”€ Advanced-opts dirty flags â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Opts are rebuilt from scratch on first render and whenever a value or pin
// actually changes. On subsequent tab switches with no changes, the rebuild
// is skipped entirely, eliminating the layout cost.
const _optsDirty = { ytdlp: true, batch: true };

function markOptsDirty(prefix) {
  if (prefix === 'ytdlp-opt:') _optsDirty.ytdlp = true;
  if (prefix === 'batch-opt:') _optsDirty.batch = true;
}

  function updateAllOpts() {
    renderYtdlpOpts();
    renderBatchOpts();
    renderModifiedOpts('yd-modified-opts', 'ytdlp-opt:');
    renderModifiedOpts('batch-modified-opts', 'batch-opt:');
    _optsDirty.ytdlp = false;
    _optsDirty.batch = false;
  }

// Targeted opt render â€” only rebuilds containers for the tab being shown.
// Tabs without dynamic opts (livestream, m3u8, gallery, splitter,
// concatenator, encoder) cost nothing.
function updateOptsForTab(tabName) {
  if (tabName === 'ytdlp' && _optsDirty.ytdlp) {
    renderYtdlpOpts();
    renderModifiedOpts('yd-modified-opts', 'ytdlp-opt:');
    _optsDirty.ytdlp = false;
  } else if (tabName === 'batch' && _optsDirty.batch) {
    renderBatchOpts();
    renderModifiedOpts('batch-modified-opts', 'batch-opt:');
    _optsDirty.batch = false;
  }
}

  function createOptRow(opt, prefix, isModifiedView = false) {
    const row = document.createElement('div');
    row.className = 'form-group';
    if (isModifiedView) {
      row.style.borderLeft = '3px solid var(--accent-color)';
      row.style.paddingLeft = '8px';
      row.style.marginLeft = '-11px';
    }

    const labelRow = document.createElement('div');
    labelRow.className = 'form-label-row';
    labelRow.style.justifyContent = 'space-between';
    labelRow.style.alignItems = 'flex-start';

    const labelWrap = document.createElement('div');
    
    const labelEl = document.createElement('label');
    labelEl.className = 'form-label';
    labelEl.style.marginBottom = '2px';
    labelEl.innerHTML = `${opt.label} <span class="ytdlp-opt-flag" style="margin-left: 6px;">${opt.flag}</span>`;
    labelWrap.appendChild(labelEl);

    if (opt.desc) {
      const descEl = document.createElement('div');
      descEl.className = 'toggle-desc';
      descEl.style.marginTop = '2px';
      descEl.style.marginBottom = '6px';
      descEl.textContent = opt.desc;
      labelWrap.appendChild(descEl);
    }
    labelRow.appendChild(labelWrap);

    if (!isModifiedView) {
      const pinBtn = document.createElement('button');
      pinBtn.className = 'btn-icon ytdlp-opt-pin';
      pinBtn.style.marginTop = '-4px';
      const isPinned = localStorage.getItem('pin:' + prefix + opt.key) === 'true';
      const pinIcon = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="17" x2="12" y2="22"></line><path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 11.24V6a3 3 0 0 0-6 0v5.24a2 2 0 0 1-1.11 1.31l-1.78.9A2 2 0 0 0 5 15.24Z"></path></svg>';
      const pinOffIcon = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="2" y1="2" x2="22" y2="22"></line><line x1="12" y1="17" x2="12" y2="22"></line><path d="M9 9v1.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V17h11"></path><path d="M15 9.34V6a3 3 0 0 0-5.68-1.33"></path></svg>';
      
      pinBtn.innerHTML = isPinned ? pinOffIcon : pinIcon;
      pinBtn.title = isPinned ? 'Unpin from More Options' : 'Pin to More Options';
      if (isPinned) pinBtn.classList.add('pinned');
      
      pinBtn.onclick = () => {
        const currentlyPinned = localStorage.getItem('pin:' + prefix + opt.key) === 'true';
        if (currentlyPinned) {
          localStorage.removeItem('pin:' + prefix + opt.key);
          pinBtn.classList.remove('pinned');
          pinBtn.innerHTML = pinIcon;
          pinBtn.title = 'Pin to More Options';
        } else {
          localStorage.setItem('pin:' + prefix + opt.key, 'true');
          pinBtn.classList.add('pinned');
          pinBtn.innerHTML = pinOffIcon;
          pinBtn.title = 'Unpin from More Options';
        }
        // Mark dirty so the next tab switch re-renders the modified opts panel.
        markOptsDirty(prefix);
        renderModifiedOpts('yd-modified-opts', 'ytdlp-opt:');
        renderModifiedOpts('batch-modified-opts', 'batch-opt:');
      };
      labelRow.appendChild(pinBtn);
    }
    
    row.appendChild(labelRow);

    const ctrlEl = document.createElement('div');
    const stored = localStorage.getItem(prefix + opt.key);

    const onChange = (val) => {
      if (val === null) localStorage.removeItem(prefix + opt.key);
      else localStorage.setItem(prefix + opt.key, val);
      markOptsDirty(prefix);
      if (isModifiedView) updateAllOpts();
    };

    if (opt.type === 'toggle') {
      const lbl = document.createElement('label');
      lbl.className = 'toggle-switch';
      const chk = document.createElement('input');
      chk.type = 'checkbox';
      chk.checked = stored === 'true';
      chk.addEventListener('change', () => onChange(chk.checked));
      const track = document.createElement('span');
      track.className = 'toggle-track';
      const thumb = document.createElement('span');
      thumb.className = 'toggle-thumb';
      track.appendChild(thumb);
      lbl.appendChild(chk);
      lbl.appendChild(track);
      ctrlEl.appendChild(lbl);
    } else if (opt.type === 'select') {
      const sel = document.createElement('select');
      sel.className = 'form-select';
      opt.opts.forEach(o => {
        const option = document.createElement('option');
        option.value = o.value;
        option.textContent = o.label;
        if (stored === o.value) option.selected = true;
        sel.appendChild(option);
      });
      sel.addEventListener('change', () => onChange(sel.value || null));
      ctrlEl.appendChild(sel);
    } else {
      const inp = document.createElement('input');
      inp.type = opt.type === 'number' ? 'number' : opt.type === 'password' ? 'password' : 'text';
      inp.className = 'form-input';
      inp.placeholder = opt.placeholder || '';
      inp.value = stored || '';
      inp.addEventListener('input', () => onChange(inp.value.trim() || null));
      ctrlEl.appendChild(inp);
    }

    row.appendChild(ctrlEl);
    return row;
  }

  function renderOpts(containerId, prefix, filter) {
    const container = document.getElementById(containerId);
    if (!container) return;
    const q = (filter || '').toLowerCase().trim();

    // Group options by category
    const cats = {};
    YTDLP_OPTS.forEach(opt => { (cats[opt.cat] = cats[opt.cat] || []).push(opt); });

    // Save scroll position
    const scrollPos = container.scrollTop;
    container.innerHTML = '';
    let anyVisible = false;

    Object.entries(cats).forEach(([catName, opts]) => {
      let catVisible = false;
      const group = document.createElement('div');
      group.className = 'ytdlp-opts-group adv-grid';
      group.style.paddingTop = '0';
      group.style.rowGap = '24px';

      const title = document.createElement('div');
      title.className = 'ytdlp-opts-group-title';
      title.style.gridColumn = '1 / -1';
      title.style.margin = '0 -12px 0';
      title.textContent = catName;
      group.appendChild(title);

      opts.forEach(opt => {
        const match = !q || opt.flag.includes(q) || opt.label.toLowerCase().includes(q) || opt.desc.toLowerCase().includes(q);
        if (match) { catVisible = anyVisible = true; }

        const row = createOptRow(opt, prefix, false);
        if (!match) row.classList.add('opt-hidden');
        group.appendChild(row);
      });

      if (!catVisible) group.classList.add('opt-hidden');
      container.appendChild(group);
    });

    if (!anyVisible && q) {
      container.innerHTML = '<div class="ytdlp-opts-empty">No advanced options match your search.</div>';
    }
    
    // Restore scroll
    container.scrollTop = scrollPos;
  }

  function renderModifiedOpts(containerId, prefix) {
    const container = document.getElementById(containerId);
    if (!container) return;
    container.innerHTML = '';
      let hasModified = false;
    
    YTDLP_OPTS.forEach(opt => {
      const isPinned = localStorage.getItem('pin:' + prefix + opt.key) === 'true';
      if (isPinned) {
          hasModified = true;
        const stored = localStorage.getItem(prefix + opt.key);
        const group = document.createElement('div');
        group.className = 'form-group';
        group.style.borderLeft = '3px solid var(--accent-color)';
        group.style.paddingLeft = '8px';
        group.style.marginLeft = '-11px';
        
        const label = document.createElement('label');
        label.className = 'form-label';
        label.innerHTML = opt.label;
        group.appendChild(label);
        
        const onChange = (val) => {
          if (val === null || val === false || val === '') {
            localStorage.removeItem(prefix + opt.key);
          } else {
            localStorage.setItem(prefix + opt.key, val);
          }
          
          // Re-render settings page only so we don't lose focus in current view
          if (prefix === 'ytdlp-opt:') renderYtdlpOpts('');
          if (prefix === 'batch-opt:') renderBatchOpts('');
        };

        if (opt.type === 'toggle') {
          const lbl = document.createElement('label');
          lbl.className = 'toggle-switch';
          lbl.style.marginTop = '8px';
          const chk = document.createElement('input');
          chk.type = 'checkbox';
          chk.checked = stored === 'true';
          chk.addEventListener('change', () => onChange(chk.checked));
          const track = document.createElement('span');
          track.className = 'toggle-track';
          const thumb = document.createElement('span');
          thumb.className = 'toggle-thumb';
          track.appendChild(thumb);
          lbl.appendChild(chk);
          lbl.appendChild(track);
          group.appendChild(lbl);
        } else if (opt.type === 'select') {
          const sel = document.createElement('select');
          sel.className = 'form-select';
          opt.opts.forEach(o => {
            const option = document.createElement('option');
            option.value = o.value;
            option.textContent = o.label;
            if (stored === o.value) option.selected = true;
            sel.appendChild(option);
          });
          sel.addEventListener('change', () => onChange(sel.value || null));
          group.appendChild(sel);
        } else {
          const inp = document.createElement('input');
          inp.type = opt.type === 'number' ? 'number' : opt.type === 'password' ? 'password' : 'text';
          inp.className = 'form-input';
          inp.placeholder = opt.placeholder || '';
          inp.value = stored || '';
          inp.addEventListener('input', () => onChange(inp.value.trim() || null));
          group.appendChild(inp);
        }
        
        container.appendChild(group);
      }
    });
  }
  function renderYtdlpOpts(filter) { renderOpts('ytdlp-opts-container', 'ytdlp-opt:', filter); }
function renderBatchOpts(filter) { renderOpts('batch-opts-container', 'batch-opt:', filter); }

function getSetting(key) {
  const stored = localStorage.getItem('setting:' + key);
  if (stored === null) return SETTINGS_DEFAULTS[key] !== false;
  return stored === 'true';
}

function applySetting(key, value) {
  const cfg = SETTINGS_MAP[key];
  if (!cfg) return;
  if (cfg.navTab) {
    const navBtn   = document.querySelector(`.nav-item[data-tab="${cfg.navTab}"]`);
    const tabPanel = document.getElementById('tab-' + cfg.navTab);
    if (navBtn) navBtn.style.display = value ? '' : 'none';
    if (tabPanel && !value && tabPanel.classList.contains('active')) {
      const first = document.querySelector('.nav-item[data-tab]:not([style*="none"])');
      if (first) first.click();
    }
  } else if (cfg.el) {
    const el = document.getElementById(cfg.el);
    if (el) el.style.display = value ? '' : 'none';
  } else if (cfg.custom === 'disk-space') {
    diskSpace.setEnabled(value);
  } else if (cfg.custom === 'tray') {
    if (window.api && window.api.setMinimizeToTray) {
      window.api.setMinimizeToTray(value);
    }
  } else if (cfg.custom === 'remote-access') {
    const portGroup = document.getElementById('remote-access-port-group');
    if (portGroup) portGroup.style.display = value ? 'flex' : 'none';
    
    if (value) {
      const portInput = document.getElementById('remote-access-port');
      const userInput = document.getElementById('remote-access-user');
      const passInput = document.getElementById('remote-access-pass');
      const pinInput = document.getElementById('remote-access-pin');
      
      const port = parseInt(portInput?.value) || 3000;
      const user = userInput?.value || 'admin';
      const pass = passInput?.value || 'secret';
      const pin = pinInput?.value || '';
      
      if (window.api && window.api.startRemoteServer) {
        window.api.startRemoteServer({ port, user, pass, pin });
      }
    } else {
      if (window.api && window.api.stopRemoteServer) window.api.stopRemoteServer();
    }
  }
}

// Ensure remote access reacts to changes
const remotePortInput = document.getElementById('remote-access-port');
const remoteUserInput = document.getElementById('remote-access-user');
const remotePassInput = document.getElementById('remote-access-pass');
const remotePinInput = document.getElementById('remote-access-pin');

function restartRemoteServer() {
  if (getSetting('remote-access')) {
    if (window.api && window.api.stopRemoteServer) window.api.stopRemoteServer();
    const port = parseInt(remotePortInput?.value) || 3000;
    const user = remoteUserInput?.value || 'admin';
    const pass = remotePassInput?.value || 'secret';
    const pin = remotePinInput?.value || '';
    setTimeout(() => {
      if (window.api && window.api.startRemoteServer) window.api.startRemoteServer({ port, user, pass, pin });
    }, 200);
  }
}

if (remotePortInput) remotePortInput.addEventListener('change', restartRemoteServer);
if (remoteUserInput) remoteUserInput.addEventListener('change', restartRemoteServer);
if (remotePassInput) remotePassInput.addEventListener('change', restartRemoteServer);
if (remotePinInput) remotePinInput.addEventListener('change', restartRemoteServer);

// Initialize settings correctly on startup
document.addEventListener('DOMContentLoaded', () => {
  if (remotePortInput) {
    remotePortInput.value = localStorage.getItem('remote-access-port') || '3000';
    remotePortInput.addEventListener('input', e => localStorage.setItem('remote-access-port', e.target.value));
  }
  if (remoteUserInput) {
    remoteUserInput.value = localStorage.getItem('remote-access-user') || 'admin';
    remoteUserInput.addEventListener('input', e => localStorage.setItem('remote-access-user', e.target.value));
  }
  if (remotePassInput) {
    remotePassInput.value = localStorage.getItem('remote-access-pass') || 'secret';
    remotePassInput.addEventListener('input', e => localStorage.setItem('remote-access-pass', e.target.value));
  }

  if (getSetting('remote-access')) {
    const port = parseInt(remotePortInput?.value) || 3000;
    const user = remoteUserInput?.value || 'admin';
    const pass = remotePassInput?.value || 'secret';
    if (window.api && window.api.startRemoteServer) window.api.startRemoteServer({ port, user, pass });
  }
});

// â”€â”€ Protected-path guard â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
/**
 * Returns a user-friendly error string if the path is a protected location
 * (drive root, Windows system directories, etc.), or null if safe.
 */
function isProtectedPath(p) {
  if (!p || !p.trim()) return null;
  const norm = p.trim().replace(/\\/g, '/');

  // Drive root: "C:", "C:\" or "C:/" with nothing after it
  if (/^[A-Za-z]:\/?$/.test(p.trim())) {
    return `Cannot download to the root of a drive ("${p.trim()}"). Please choose a subfolder.`;
  }

  // Network/UNC root: "\\server" or "//server" with no share path
  if (/^\/\/[^/]+\/?$/.test(norm) || /^\\\\[^\\]+\\?$/.test(p.trim())) {
    return `Cannot download to the root of a network share ("${p.trim()}"). Please choose a subfolder.`;
  }

  // Windows protected system directories (case-insensitive)
  const sysRoots = [
    /^[A-Za-z]:\/Windows(\/?|\/.+)$/i,
    /^[A-Za-z]:\/Program Files( \(x86\))?(\/?|\/.+)$/i,
    /^[A-Za-z]:\/ProgramData(\/?|\/.+)$/i,
    /^[A-Za-z]:\/System Volume Information(\/?|\/.+)$/i,
    /^[A-Za-z]:\/Recovery(\/?|\/.+)$/i,
    /^[A-Za-z]:\/\$Recycle\.Bin(\/?|\/.+)$/i,
  ];
  for (const re of sysRoots) {
    if (re.test(norm)) {
      return `Cannot download to a protected system directory ("${p.trim()}"). Please choose a different folder.`;
    }
  }

  return null; // safe
}

// Î“Ã¶Ã‡Î“Ã¶Ã‡ Terminal helpers Î“Ã¶Ã‡Î“Ã¶Ã‡Î“Ã¶Ã‡Î“Ã¶Ã‡Î“Ã¶Ã‡Î“Ã¶Ã‡Î“Ã¶Ã‡Î“Ã¶Ã‡Î“Ã¶Ã‡Î“Ã¶Ã‡Î“Ã¶Ã‡Î“Ã¶Ã‡Î“Ã¶Ã‡Î“Ã¶Ã‡Î“Ã¶Ã‡Î“Ã¶Ã‡Î“Ã¶Ã‡Î“Ã¶Ã‡Î“Ã¶Ã‡Î“Ã¶Ã‡Î“Ã¶Ã‡Î“Ã¶Ã‡Î“Ã¶Ã‡Î“Ã¶Ã‡Î“Ã¶Ã‡Î“Ã¶Ã‡Î“Ã¶Ã‡Î“Ã¶Ã‡Î“Ã¶Ã‡Î“Ã¶Ã‡Î“Ã¶Ã‡Î“Ã¶Ã‡Î“Ã¶Ã‡Î“Ã¶Ã‡Î“Ã¶Ã‡Î“Ã¶Ã‡Î“Ã¶Ã‡Î“Ã¶Ã‡Î“Ã¶Ã‡Î“Ã¶Ã‡Î“Ã¶Ã‡Î“Ã¶Ã‡Î“Ã¶Ã‡
function classifyLine(text, streamType, logEl) {
  const t = text.trimStart();
  if (t.includes('This live event will begin in')) {
    if (logEl) logEl._hasLiveEventIgnore = true;
    return 'info';
  }
  if (/^\[debug\]/i.test(t))                    return 'debug';
  if (/^warning:/i.test(t))                      return 'warning';
  if (/^error:/i.test(t))                        return 'error';
  if (/\berror\b.*:/i.test(t) && streamType === 'stderr') return 'error';
  
  if (logEl && logEl._hasLiveEventIgnore) return streamType; // Suppress tracebacks if ignored

  // Python traceback lines: '  File "...", line N, in ...' and '~~~~^^^' indicator lines
  if (/^\s+File ".*", line \d+/.test(text))      return 'error';
  if (/^\s*[~^]+\s*$/.test(text))                return 'error';
  if (streamType === 'stdout' && /:\s*$/.test(t)) return 'input';
  return streamType; // 'stdout' or 'stderr'
}

// â”€â”€ Line buffer for batched DOM appends â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Instead of one appendChild per line, we collect lines into a buffer and
// flush them all at once via a DocumentFragment on the next RAF tick.
// This dramatically reduces layout thrashing when hundreds of lines arrive
// per second (e.g. during a large batch download).
function appendLog(logEl, text, cls) {
  let t = text.trimStart();
  if (/^Traceback \(most recent call last\)/i.test(t) || /^\s+File ".*\.py"/.test(text)) {
    if (!logEl._hasLiveEventIgnore) logEl._hasError = true;
  }
  
  const destMatch = text.match(/^\s*\[(?:download|ExtractAudio)\]\s+Destination:\s+(.+)/i);
  const progressMatch = text.match(/^\s*\[(?:download|ExtractAudio)\]\s+(?:\[(.*?)\]\s+)?(?:\d+(?:\.\d+)?%|\d+(?:\.\d+)?(?:KiB|MiB|GiB|TiB|B))/i);
  const isDlProgress = !!progressMatch;
  const isFfmpegProgress = /^\s*frame=\s*\d+/i.test(text) || /^\s*size=\s*\d+/i.test(text);

  if (getSetting('console-timestamps') && !isDlProgress && !isFfmpegProgress && !destMatch) {
    const now = new Date();
    const timeStr = '[' + String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0') + ':' + String(now.getSeconds()).padStart(2, '0') + '] ';
    text = timeStr + text;
  }
  
  const lastCrIdx = text.lastIndexOf('\r');
  if (lastCrIdx !== -1) {
      text = text.substring(lastCrIdx + 1);
  }

  // --- STATE MACHINE LOGIC ---
  if (!logEl._pendingLines) logEl._pendingLines = [];
  logEl._lastRenderedLine = null;

  const isStatus = text.includes('⏸ Paused') || text.includes('▶ Resumed') || text.includes('✔ Process finished') || text.includes('✖ Process exited');

  if (!logEl._liveProgressMap) logEl._liveProgressMap = new Map();

  // 1. Check for Destination line (Start of a new file)
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
  if (isDlProgress || isFfmpegProgress) {
      let taskId = 'default';
      if (isDlProgress) {
          if (progressMatch[1]) {
              taskId = progressMatch[1];
          } else if (text.includes('(frag ')) {
              taskId = 'fragments';
          } else if (text.includes('(livestream)') || text.includes('of ~')) {
              taskId = 'summary';
          }
      } else if (isFfmpegProgress) {
          taskId = 'ffmpeg';
      }
      
      let current = logEl._liveProgressMap.get(taskId);
      if (!current) {
          if (text.includes('100%') || text.includes('100.0%')) return;
          current = { dest: taskId === 'default' ? 'Unknown Task' : taskId, text: text, cls: cls + ' line-progress' };
          logEl._liveProgressMap.set(taskId, current);
      } else {
          current.text = text;
          current.cls = cls + ' line-progress';
      }
      
      // 3. Completion Detection
      if (text.includes('100%') || text.includes('100.0%')) {
          if (!current.completed) {
              let cleanText = text.replace(/^\s*\[(?:download|ExtractAudio)\]\s+(?:\[(.*?)\]\s+)?/, '').trim();
              if (cleanText.startsWith('100%')) cleanText = cleanText.substring(4).trim();
              if (cleanText.startsWith('100.0%')) cleanText = cleanText.substring(6).trim();
              if (cleanText.startsWith('-')) cleanText = cleanText.substring(1).trim();
              logEl._pendingLines.push({ text: '✔ Completed ' + current.dest + ' — 100% ' + cleanText, cls: 'success', count: 1 });
              current.completed = true;
              logEl._liveProgressMap.delete(taskId);
          }
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
              last.badge.textContent = ' (' + last.count + ')';
          } else {
              const badge = document.createElement('span');
              badge.className = 'log-badge';
              badge.style.color = '#888';
              badge.style.marginLeft = '8px';
              badge.textContent = ' (' + last.count + ')';
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
              badge.textContent = ' (' + item.count + ')';
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
    
    // Render the live progress slots
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
        if (count === 0) {
          if (logEl._autoFollow !== false && logEl.closest('.tab-panel')?.classList.contains('active')) {
            const scrollEl = logEl._scrollEl || logEl;
            const target = scrollEl.scrollHeight - scrollEl.clientHeight;
            if (Math.abs(scrollEl.scrollTop - target) > 1) {
              scrollEl.scrollTo({ top: target, behavior: 'auto' });
              logEl._lastScrollTop = target;  // Bug 2: keep direction-detection in sync
            }
          }
          logEl._updateScrollBtn?.();  // Bug 4: button must update even when no new lines
          return;
        }

        if (logEl._autoFollow !== false && logEl.closest('.tab-panel')?.classList.contains('active')) {
          const scrollEl = logEl._scrollEl || logEl;
          scrollEl.scrollTop = scrollEl.scrollHeight;
          logEl._lastScrollTop = scrollEl.scrollTop;  // Bug 2: keep direction-detection in sync
        }
        logEl._updateScrollBtn?.();
      });
    }, 0);
}
function clearLog(logEl) {
  if (logEl._scrollListener) {
    // Bug 3: remove the actual wrapper reference, not _scrollBtnHandler
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
  logEl._lastScrollTop = 0;  // Bug 2: reset so direction detection starts clean
  logEl._pendingLines = []; logEl._lastRenderedLine = null;  // discard any buffered lines not yet flushed
  logEl._rafPending = false;
  logEl._hasUnflushed = false;
  
  // Bug 5: Reset dynamic containers and state maps that were detached by innerHTML = ''
  logEl._progressContainer = null;
  logEl._statusContainer = null;
  logEl._liveProgressMap = null;
  logEl._liveProgressEls = null;
  logEl._currentAutoCollapse = null;

  logEl.closest('.terminal-wrap')?.classList.remove('collapsed');
}


function markBodyStart(logEl) {
  const m = document.createElement('div');
  m.className = 'log-body-start';
  logEl.appendChild(m);
  // Mark this element so the tab-switch handler can find and flush it.
  logEl.setAttribute('data-log-el', '1');

  // .content is the actual scrollable container; terminal-body just grows to fit
  const scrollEl = logEl.closest('.content');
  logEl._scrollEl = scrollEl;

  const svgUp   = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none"><polyline points="18 15 12 9 6 15" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  const svgDown = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none"><polyline points="6 9 12 15 18 9" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';

  // Clean up any previous button for this logEl
  logEl._scrollBtn?.remove();

  // Single toggle button: Î“Ã¥Ã¦ scroll-to-top (pauses auto-scroll) / Î“Ã¥Ã´ scroll-to-bottom (resumes)
  const btn = document.createElement('div');
  btn.className = 'log-scroll-btn';
  btn.style.display = 'none';
  logEl.closest('.terminal-wrap').appendChild(btn);
  logEl._scrollBtn = btn;

  logEl._autoFollow = true;

  const updateBtn = () => {
    // Only show when the owning tab panel is active
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

  // Button click: â†‘ = go to top + pause; â†“ = go to bottom + resume
  // Bug 1: act on _autoFollow (matches what the icon shows), not raw scroll position.
  // Raw scroll position can lag behind auto-scroll, causing the wrong action to fire.
  btn.addEventListener('click', () => {
    if (logEl._autoFollow) {
      // Button shows â†‘ â†’ go to top, pause auto-follow
      logEl._autoFollow = false;
      scrollEl.scrollTo({ top: 0, behavior: 'auto' });
      logEl._lastScrollTop = 0;  // Bug 2: keep direction-detection in sync
    } else {
      // Button shows â†“ â†’ go to bottom, resume auto-follow
      logEl._autoFollow = true;
      const target = scrollEl.scrollHeight - scrollEl.clientHeight;
      scrollEl.scrollTo({ top: target, behavior: 'auto' });
      logEl._lastScrollTop = target;  // Bug 2: keep direction-detection in sync
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

  // Bug 3: store the wrapper reference so clearLog can actually remove it.
  // Previously an anonymous function was passed, making removeEventListener a no-op.
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
    // Batch-errors mode: collapse everything; show a "View errors" button for
    // error/warning lines only. Non-error lines are hidden with no toggle.
    const isErr = el => el.classList.contains('line-error') ||
                        el.classList.contains('line-warning') ||
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
    // Standard mode: on failure keep error/warning lines visible; on success hide all.
    const isVisible = failed
      ? el => el.classList.contains('line-error') || el.classList.contains('line-warning') || el.classList.contains('line-stderr')
      : () => false;

    const visible = bodyLines.filter(isVisible);
    const hidden  = bodyLines.filter(el => !isVisible(el));

    const detail = document.createElement('div');
    detail.className = 'log-detail';
    hidden.forEach(el => detail.appendChild(el));
    sentinel.replaceWith(detail);

    visible.forEach(el => logEl.appendChild(el));

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

  // Shrink the terminal wrap to fit collapsed content
  logEl.closest('.terminal-wrap')?.classList.add('collapsed');
    setTimeout(() => {
        const scrollEl = logEl.closest('.content');
        if (scrollEl) scrollEl.scrollTo({ top: scrollEl.scrollHeight, behavior: 'smooth' });
    }, 260);

  // Trigger button visibility update now that content has collapsed
  logEl._scrollBtnHandler?.();
}

function handleOutput(logEl, data, onExit) {
  switch (data.type) {
    case 'stdout':
    case 'stderr': {
      const stream = data.type;
      const cleanText = data.text.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '').replace(/\[A\[K/g, '');
      cleanText.trimEnd().split('\n').forEach(line => {
        if (line === '') return;
        appendLog(logEl, line, classifyLine(line, stream));
      });
      break;
    }
    case 'error':   appendLog(logEl, 'âš  ' + data.text, 'error'); break;
    case 'exit': {
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
          appendLog(logEl, `âš  ${ok} download${ok !== 1 ? 's' : ''} finished successfully, ${bs.failed} failed. See failed_downloads.txt`, 'warning');
        } else {
          appendLog(logEl, '✔ Process finished successfully.', 'success');
        }
        collapseLogBody(logEl, false);
      } else if (bs && bs.failed > 0) {
        // Batch partial failure: clean summary + "View errors" button
        if (data.code !== 0) appendLog(logEl, `✖ Process exited: ${getExitMsg(data.code)}`, 'error');
        else appendLog(logEl, '✖ Process reported errors (exit code 0).', 'error');
        const ok = bs.total - bs.failed;
        appendLog(logEl, `âš  ${ok} download${ok !== 1 ? 's' : ''} finished successfully, ${bs.failed} failed. See failed_downloads.txt`, 'warning');
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

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// â”€â”€ 1. Live Stream Archiver â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
(function () {
  const log      = document.getElementById('ls-log');
  const runBtn   = document.getElementById('ls-run');
  const pauseBtn = document.getElementById('ls-pause');
  const stopBtn  = document.getElementById('ls-stop');
  let currentPid = null;
  let isPaused   = false;

  const pauseIconHTML = pauseBtn.innerHTML;
  const resumeIconHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none"><polygon points="5 3 19 12 5 21 5 3" fill="currentColor"/></svg> Resume`;

  document.getElementById('ls-clear').addEventListener('click', () => clearLog(log));

  stopBtn.addEventListener('click', () => {
    if (currentPid) window.api.stopScript(currentPid);
  });

  pauseBtn.addEventListener('click', () => {
    if (!currentPid) return;
    if (pauseBtn.classList.contains('btn-add-queue')) {
      const newUrls = pauseBtn._newUrls;
      if (newUrls && newUrls.length > 0) {
        activeUrls.push(...newUrls);
        pauseBtn._newUrls = null;
        pauseBtn.innerHTML = isPaused ? resumeIconHTML : pauseIconHTML;
        pauseBtn.classList.remove('btn-add-queue');
        pauseBtn.classList.toggle('paused', isPaused);
        appendLog(log, '✔ Added ' + newUrls.length + ' new URL(s) to the queue.', 'success');
      }
      return;
    }
    if (!isPaused) {
      isPaused = true;
      window.api.pauseScript(currentPid);
      pauseBtn.innerHTML = resumeIconHTML;
      pauseBtn.classList.add('paused');
      appendLog(log, 'â¸ Paused.', 'info');
    } else {
      isPaused = false;
      window.api.resumeScript(currentPid);
      pauseBtn.innerHTML = pauseIconHTML;
      pauseBtn.classList.remove('paused');
      appendLog(log, '▶ Resumed.', 'info');
    }
  });

  runBtn.addEventListener('click', () => {
    const url         = document.getElementById('ls-url').value.trim();
    const outputDir   = document.getElementById('ls-output').value.trim();
    const format      = document.getElementById('ls-quality').value;
    const cookiesPath = (document.getElementById('ls-use-cookies').checked ? document.getElementById('ls-cookies').value.trim() : '');
    const container   = document.getElementById('ls-container').value;

    if (!url)       { appendLog(log, 'âš  Please enter a stream URL.', 'error'); return; }
    if (!outputDir) { appendLog(log, 'âš  Please choose an output directory.', 'error'); return; }
    const lsPathErr = isProtectedPath(outputDir);
    if (lsPathErr)  { appendLog(log, 'âš  ' + lsPathErr, 'error'); return; }

    clearLog(log);
    appendLog(log, `▶ Starting live archiver...`, 'info');
    appendLog(log, `  URL:    ${url}`, 'cmd');
    appendLog(log, `  Format: ${format}`, 'cmd');
    appendLog(log, `  Container: ${container}`, 'cmd');
    appendLog(log, `  Output: ${outputDir}`, 'cmd');
    if (cookiesPath) appendLog(log, `  Cookies: ${cookiesPath}`, 'cmd');
    appendLog(log, '', 'stdout');
    markBodyStart(log);

    currentPid = null;
    isPaused   = false;
    pauseBtn.innerHTML = pauseIconHTML;
    pauseBtn.classList.remove('paused');

    runBtn.classList.add('hidden');
    pauseBtn.classList.remove('hidden');
    stopBtn.classList.remove('hidden');
    incRunning('Live Stream Archiver');

    window.api.removeAllListeners('livestream-output');
    window.api.onLivestreamOutput((data) => {
      if (data.type === 'pid') { currentPid = data.pid; return; }
      handleOutput(log, data, () => {
        runBtn.classList.remove('hidden');
        pauseBtn.classList.add('hidden');
        stopBtn.classList.add('hidden');
        pauseBtn.innerHTML = pauseIconHTML;
        pauseBtn.classList.remove('paused');
        isPaused = false;
        decRunning('Live Stream Archiver');
      });
    });

    const bgutilUrl = getSetting('dep-use-bgutil') ? (localStorage.getItem('field:dep-bgutil-url') || '') : '';
    const useDeno   = getSetting('dep-use-deno') ? 'y' : 'n';
    const client = document.getElementById('ls-client')?.value || 'default';
    const fromStart = document.getElementById('ls-from-start')?.checked ? 'y' : 'n';
    const concurrent = document.getElementById('ls-concurrent')?.value || '5';
    window.api.runLivestream({ url, outputDir, format, cookiesPath, container, client, fromStart, concurrent, bgutilUrl, useDeno });
  });
})();

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// â”€â”€ 2. yt-dlp Single â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
(function () {
  const log      = document.getElementById('yd-log');
  const runBtn   = document.getElementById('yd-run');
  const pauseBtn = document.getElementById('yd-pause');
  const stopBtn  = document.getElementById('yd-stop');
  let currentPid = null;
  let isPaused   = false;

  const pauseIconHTML = pauseBtn.innerHTML;
  const resumeIconHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none"><polygon points="5 3 19 12 5 21 5 3" fill="currentColor"/></svg> Resume`;

  document.getElementById('yd-clear').addEventListener('click', () => clearLog(log));

  stopBtn.addEventListener('click', () => {
    if (currentPid) window.api.stopScript(currentPid);
  });

  pauseBtn.addEventListener('click', () => {
    if (!currentPid) return;
    if (pauseBtn.classList.contains('btn-add-queue')) {
      const newUrls = pauseBtn._newUrls;
      if (newUrls && newUrls.length > 0) {
        activeUrls.push(...newUrls);
        pauseBtn._newUrls = null;
        pauseBtn.innerHTML = isPaused ? resumeIconHTML : pauseIconHTML;
        pauseBtn.classList.remove('btn-add-queue');
        pauseBtn.classList.toggle('paused', isPaused);
        appendLog(log, '✔ Added ' + newUrls.length + ' new URL(s) to the queue.', 'success');
      }
      return;
    }
    if (!isPaused) {
      isPaused = true;
      window.api.pauseScript(currentPid);
      pauseBtn.innerHTML = resumeIconHTML;
      pauseBtn.classList.add('paused');
      appendLog(log, 'â¸ Paused.', 'info');
    } else {
      isPaused = false;
      window.api.resumeScript(currentPid);
      pauseBtn.innerHTML = pauseIconHTML;
      pauseBtn.classList.remove('paused');
      appendLog(log, '▶ Resumed.', 'info');
    }
  });

  runBtn.addEventListener('click', () => {
    const url         = document.getElementById('yd-url').value.trim();
    const outputDir   = document.getElementById('yd-output').value.trim();
    const format      = document.getElementById('yd-format').value;
    const cookiesPath = (document.getElementById('yd-use-cookies').checked ? document.getElementById('yd-cookies').value.trim() : '');
    const container   = document.getElementById('yd-container').value;
    const startTime   = document.getElementById('yd-start').value.trim();
    const endTime     = document.getElementById('yd-end').value.trim();

    if (!url)       { appendLog(log, 'âš  Please enter a URL.', 'error'); return; }
    if (!outputDir) { appendLog(log, 'âš  Please choose an output directory.', 'error'); return; }
    const ydPathErr = isProtectedPath(outputDir);
    if (ydPathErr)  { appendLog(log, 'âš  ' + ydPathErr, 'error'); return; }

    clearLog(log);
    appendLog(log, `▶ Starting yt-dlp download...`, 'info');
    appendLog(log, `  URL:    ${url}`, 'cmd');
    appendLog(log, `  Format: ${format}`, 'cmd');
    appendLog(log, `  Container: ${container}`, 'cmd');
    if (startTime || endTime) appendLog(log, `  Clip: ${startTime || '0:00:00'} â†’ ${endTime || 'end'}`, 'cmd');
    appendLog(log, `  Output: ${outputDir}`, 'cmd');
    if (cookiesPath) appendLog(log, `  Cookies: ${cookiesPath}`, 'cmd');
    appendLog(log, '', 'stdout');
    markBodyStart(log);

    currentPid = null;
    isPaused   = false;
    pauseBtn.innerHTML = pauseIconHTML;
    pauseBtn.classList.remove('paused');

    runBtn.classList.add('hidden');
    pauseBtn.classList.remove('hidden');
    stopBtn.classList.remove('hidden');
    incRunning('yt-dlp');

    window.api.removeAllListeners('ytdlp-output');
    window.api.onYtdlpOutput((data) => {
      if (data.type === 'pid') { currentPid = data.pid; return; }
      handleOutput(log, data, () => {
        runBtn.classList.remove('hidden');
        pauseBtn.classList.add('hidden');
        stopBtn.classList.add('hidden');
        pauseBtn.innerHTML = pauseIconHTML;
        pauseBtn.classList.remove('paused');
        isPaused = false;
        document.getElementById('yd-start').value = '';
        document.getElementById('yd-end').value   = '';
        decRunning('yt-dlp');
      });
    });

    const bgutilUrl = getSetting('dep-use-bgutil') ? (localStorage.getItem('field:dep-bgutil-url') || '') : '';
    const useDeno   = getSetting('dep-use-deno') ? 'y' : 'n';
    window.api.runYtdlp({ url, outputDir, format, cookiesPath, extraArgs: getExtraYtdlpArgs(), container, startTime, endTime, bgutilUrl, useDeno });
  });
})();

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// â”€â”€ 3. Batch Downloader â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
(function () {
  const log        = document.getElementById('batch-log');
  const runBtn     = document.getElementById('batch-run');
  const pauseBtn   = document.getElementById('batch-pause');
  const stopBtn    = document.getElementById('batch-stop');
  const textarea   = document.getElementById('batch-urls');
  const counter    = document.getElementById('batch-counter');
  const progressWrap = document.getElementById('batch-progress-wrap');
  const progressBar  = document.getElementById('batch-progress-bar');
  const progressLbl  = document.getElementById('batch-progress-label');
  let currentPid = null;
  let isPaused   = false;
  let countdownTimer = null;
  let lastProgressText = '0 / 0';
  let activeUrls = [];

  function startRestCountdown(seconds) {
    clearInterval(countdownTimer);
    let rem = seconds;
    const tick = () => {
      const m = Math.floor(rem / 60);
      const s = rem % 60;
      progressLbl.textContent = `Restingâ€¦ ${m}:${s.toString().padStart(2, '0')} (${lastProgressText})`;
      if (rem <= 0) clearInterval(countdownTimer);
      rem--;
    };
    tick();
    countdownTimer = setInterval(tick, 1000);
  }
  function stopRestCountdown() {
    clearInterval(countdownTimer);
    countdownTimer = null;
    progressLbl.textContent = lastProgressText;
  }

  const pauseIconHTML = pauseBtn.innerHTML;
  const resumeIconHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none"><polygon points="5 3 19 12 5 21 5 3" fill="currentColor"/></svg> Resume`;

  // Live URL counter
  textarea.addEventListener('input', () => {
    const urls = getUrls();
    counter.textContent = urls.length + (urls.length === 1 ? ' URL' : ' URLs');
  });

  // Auto-newline on paste so each pasted URL lands on its own line
  textarea.addEventListener('paste', (e) => {
    e.preventDefault();
    const pasted = (e.clipboardData || window.clipboardData).getData('text');
    const start  = textarea.selectionStart;
    const end    = textarea.selectionEnd;
    const before = textarea.value.substring(0, start);
    const after  = textarea.value.substring(end);
    // Ensure the pasted block is followed by a newline
    const insert = pasted.endsWith('\n') ? pasted : pasted + '\n';
    textarea.value = before + insert + after;
    const newPos = start + insert.length;
    textarea.selectionStart = newPos;
    textarea.selectionEnd   = newPos;
    textarea.dispatchEvent(new Event('input'));
  });

  function getUrls() {
    return textarea.value.split('\n').map(l => l.trim()).filter(l => l.length > 0 && l.startsWith('http'));
  }

  document.getElementById('batch-clear').addEventListener('click', () => clearLog(log));

  stopBtn.addEventListener('click', () => {
    if (currentPid) window.api.stopScript(currentPid);
  });

  pauseBtn.addEventListener('click', () => {
    if (!currentPid) return;
    if (pauseBtn.classList.contains('btn-add-queue')) {
      const newUrls = pauseBtn._newUrls;
      if (newUrls && newUrls.length > 0) {
        activeUrls.push(...newUrls);
        pauseBtn._newUrls = null;
        pauseBtn.innerHTML = isPaused ? resumeIconHTML : pauseIconHTML;
        pauseBtn.classList.remove('btn-add-queue');
        pauseBtn.classList.toggle('paused', isPaused);
        appendLog(log, '✔ Added ' + newUrls.length + ' new URL(s) to the queue.', 'success');
      }
      return;
    }
    if (!isPaused) {
      isPaused = true;
      window.api.pauseScript(currentPid);
      pauseBtn.innerHTML = resumeIconHTML;
      pauseBtn.classList.add('paused');
      appendLog(log, 'â¸ Paused.', 'info');
    } else {
      isPaused = false;
      window.api.resumeScript(currentPid);
      pauseBtn.innerHTML = pauseIconHTML;
      pauseBtn.classList.remove('paused');
      appendLog(log, '▶ Resumed.', 'info');
    }
  });

  runBtn.addEventListener('click', () => {
    const urls        = getUrls();
    const outputDir   = document.getElementById('batch-output').value.trim();
    const format      = document.getElementById('batch-format').value;
    const rest        = document.getElementById('batch-rest').checked;
    const cookiesPath = (document.getElementById('batch-use-cookies').checked ? document.getElementById('batch-cookies').value.trim() : '');
    const container   = document.getElementById('batch-container').value;

    if (urls.length === 0) { appendLog(log, 'âš  Please enter at least one valid URL.', 'error'); return; }
    if (!outputDir)        { appendLog(log, 'âš  Please choose an output directory.', 'error'); return; }
    const batchPathErr = isProtectedPath(outputDir);
    if (batchPathErr)      { appendLog(log, 'âš  ' + batchPathErr, 'error'); return; }

    clearLog(log);
    appendLog(log, `▶ Starting batch download of ${urls.length} URL(s)...`, 'info');
    appendLog(log, `  Format: ${format}`, 'cmd');
    appendLog(log, `  Container: ${container}`, 'cmd');
    appendLog(log, `  Rest between downloads: ${rest ? 'Yes (~5 min)' : 'No'}`, 'cmd');
    appendLog(log, `  Output: ${outputDir}`, 'cmd');
    if (cookiesPath) appendLog(log, `  Cookies: ${cookiesPath}`, 'cmd');
    appendLog(log, '', 'stdout');
    markBodyStart(log);

    progressWrap.classList.remove('hidden');
    progressBar.style.width = '0%';
    progressLbl.textContent = `0 / ${urls.length}`;

    currentPid = null;
    isPaused   = false;
    pauseBtn.innerHTML = pauseIconHTML;
    pauseBtn.classList.remove('paused');

    runBtn.classList.add('hidden');
    pauseBtn.classList.remove('hidden');
    stopBtn.classList.remove('hidden');
    incRunning('Batch Downloader');

    let completedCount = 0;
    let batchTotal = urls.length;
    let _progressPending = false; // RAF guard for progress bar writes
    log._batchStats = null;
    window.api.removeAllListeners('batch-output');
    window.api.onBatchOutput((data) => {
      if (data.type === 'pid') { currentPid = data.pid; return; }
      // Update progress bar and track partial failures
      if (data.type === 'stderr' || data.type === 'stdout') {
        data.text.split('\n').forEach(line => {
          // [X/Y] Processing: â€” fires at the START of each URL; captures total and
          // resets completedCount to X-1 (how many were done before this one started).
          const m = line.match(/^\[(\d+)\/(\d+)\]\s+Processing:/);
          if (m) {
            stopRestCountdown();
            completedCount = parseInt(m[1], 10) - 1;
            batchTotal     = parseInt(m[2], 10);
            lastProgressText = `${completedCount} / ${batchTotal}`;
          }
          // Increment on successful finish OR per-URL failure â€” fires at the END of
          // each URL so the counter updates without waiting for the next one to start.
          if (/Finished processing media from|Download failed:/i.test(line)) {
            completedCount = Math.min(completedCount + 1, batchTotal);
            lastProgressText = `${completedCount} / ${batchTotal}`;
          }
          // Detect rest periods and start countdown
          const rest5  = line.match(/Pausing 5 minutes/i);
          const rest30 = line.match(/Pausing 30 minutes/i);
          if (rest5)  startRestCountdown(5 * 60);
          if (rest30) startRestCountdown(30 * 60);
          // Partial-failure summary line: "N downloads failed. See failed_downloads.txt"
          const fm = line.match(/(\d+)\s+downloads?\s+failed/i);
          if (fm) log._batchStats = { failed: parseInt(fm[1], 10), total: urls.length };
        });
        // Flush progress bar updates once per RAF to avoid layout thrashing
        if (!_progressPending) {
          _progressPending = true;
          requestAnimationFrame(() => {
            _progressPending = false;
            progressBar.style.width = (completedCount / batchTotal * 100) + '%';
            progressLbl.textContent = lastProgressText;
          });
        }
      }
      handleOutput(log, data, (code) => {
        // On clean exit, mark all URLs as done
        stopRestCountdown();
        if (code === 0) {
          progressBar.style.width = '100%';
          lastProgressText = `${urls.length} / ${urls.length}`;
          progressLbl.textContent = lastProgressText;
        }
        runBtn.classList.remove('hidden');
        pauseBtn.classList.add('hidden');
        stopBtn.classList.add('hidden');
        pauseBtn.innerHTML = pauseIconHTML;
        pauseBtn.classList.remove('paused');
        isPaused = false;
        decRunning('Batch Downloader');
      });
    });

    const bgutilUrl = getSetting('dep-use-bgutil') ? (localStorage.getItem('field:dep-bgutil-url') || '') : '';
    const useDeno   = getSetting('dep-use-deno') ? 'y' : 'n';
    window.api.runBatch({ urls, outputDir, format, rest, cookiesPath, extraArgs: getBatchExtraArgs(), container, bgutilUrl, useDeno });
  });
})();

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// â”€â”€ 4. M3U8 Downloader â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
(function () {
  const log        = document.getElementById('m3-log');
  const runBtn     = document.getElementById('m3-run');
  const pauseBtn   = document.getElementById('m3-pause');
  const stopBtn    = document.getElementById('m3-stop');
  const encodeChk  = document.getElementById('m3-encode');
  const encodeOpts = document.querySelectorAll('.encode-options');
  const modeBtnM3  = document.getElementById('m3-url-mode-btn');
  const singleDiv  = document.getElementById('m3-url-single');
  const multiDiv   = document.getElementById('m3-url-multi');
  const countBadge = document.getElementById('m3-url-counter');
  let currentPid  = null;
  let isPaused    = false;
  let m3MultiMode = false;
  let activeUrls  = [];

  const pauseIconHTML  = pauseBtn.innerHTML;
  const resumeIconHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none"><polygon points="5 3 19 12 5 21 5 3" fill="currentColor"/></svg> Resume`;

  // Toggle encode options
  encodeChk.addEventListener('change', () => {
    encodeOpts.forEach(el => el.classList.toggle('hidden', !encodeChk.checked));
  });
  document.getElementById('m3-encode-toggle').addEventListener('click', (e) => {
    if (e.target.closest('label')) return;
    encodeChk.checked = !encodeChk.checked;
    encodeChk.dispatchEvent(new Event('change'));
  });

  // â”€â”€ URL mode toggle â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const m3Textarea = document.getElementById('m3-urls');
  function updateM3Count() {
    const n = getM3Urls().length;
    countBadge.textContent = n + (n === 1 ? ' URL' : ' URLs');
  }
  m3Textarea.addEventListener('input', updateM3Count);
  m3Textarea.addEventListener('paste', (e) => {
    e.preventDefault();
    const pasted = (e.clipboardData || window.clipboardData).getData('text');
    const start  = m3Textarea.selectionStart;
    const end    = m3Textarea.selectionEnd;
    const insert = pasted.endsWith('\n') ? pasted : pasted + '\n';
    m3Textarea.value = m3Textarea.value.substring(0, start) + insert + m3Textarea.value.substring(end);
    m3Textarea.selectionStart = m3Textarea.selectionEnd = start + insert.length;
    updateM3Count();
  });
  modeBtnM3.addEventListener('click', () => {
    m3MultiMode = !m3MultiMode;
    singleDiv.classList.toggle('hidden', m3MultiMode);
    multiDiv.classList.toggle('hidden', !m3MultiMode);
    countBadge.classList.toggle('hidden', !m3MultiMode);
    modeBtnM3.classList.toggle('active', m3MultiMode);
    modeBtnM3.title = m3MultiMode ? 'Switch to single URL' : 'Switch to multi-URL mode';
    if (m3MultiMode) {
      const single = document.getElementById('m3-url').value.trim();
      if (single && !m3Textarea.value.trim()) m3Textarea.value = single + '\n';
      updateM3Count();
    }
  });
  function getM3Urls() {
    if (!m3MultiMode) {
      const u = document.getElementById('m3-url').value.trim();
      return u ? [u] : [];
    }
    return m3Textarea.value.split('\n').map(l => l.trim()).filter(l => l.startsWith('http'));
  }

  document.getElementById('m3-clear').addEventListener('click', () => clearLog(log));
  stopBtn.addEventListener('click', () => { if (currentPid) window.api.stopScript(currentPid); });

  pauseBtn.addEventListener('click', () => {
    if (!currentPid) return;
    if (pauseBtn.classList.contains('btn-add-queue')) {
      const newUrls = pauseBtn._newUrls;
      if (newUrls && newUrls.length > 0) {
        activeUrls.push(...newUrls);
        pauseBtn._newUrls = null;
        pauseBtn.innerHTML = isPaused ? resumeIconHTML : pauseIconHTML;
        pauseBtn.classList.remove('btn-add-queue');
        pauseBtn.classList.toggle('paused', isPaused);
        appendLog(log, '✔ Added ' + newUrls.length + ' new URL(s) to the queue.', 'success');
      }
      return;
    }
    if (!isPaused) {
      isPaused = true;
      window.api.pauseScript(currentPid);
      pauseBtn.innerHTML = resumeIconHTML;
      pauseBtn.classList.add('paused');
      appendLog(log, 'â¸ Paused.', 'info');
    } else {
      isPaused = false;
      window.api.resumeScript(currentPid);
      pauseBtn.innerHTML = pauseIconHTML;
      pauseBtn.classList.remove('paused');
      appendLog(log, '▶ Resumed.', 'info');
    }
  });

  runBtn.addEventListener('click', () => {
    activeUrls         = getM3Urls();
    const urls         = activeUrls;
    const outputDir    = document.getElementById('m3-output').value.trim();
    const encode       = encodeChk.checked;
    const container    = document.getElementById('m3-container').value;
    const codec        = document.getElementById('m3-codec').value;
    const bitrate      = document.getElementById('m3-bitrate').value;
    const resolution   = document.getElementById('m3-resolution').value;
    const fps          = document.getElementById('m3-fps').value;
    const audioBitrate = document.getElementById('m3-audio-bitrate').value;
    const cookiesPath  = (document.getElementById('m3-use-cookies').checked ? document.getElementById('m3-cookies').value.trim() : '');

    if (urls.length === 0) { appendLog(log, 'âš  Please enter an M3U8 URL.', 'error'); return; }
    if (!outputDir)        { appendLog(log, 'âš  Please choose an output directory.', 'error'); return; }
    const m3PathErr = isProtectedPath(outputDir);
    if (m3PathErr)         { appendLog(log, 'âš  ' + m3PathErr, 'error'); return; }

    clearLog(log);
    if (urls.length > 1) {
      appendLog(log, `▶ Starting M3U8 batch (${urls.length} URLs)...`, 'info');
    } else {
      appendLog(log, `▶ Starting M3U8 download...`, 'info');
      appendLog(log, `  URL:    ${urls[0]}`, 'cmd');
    }
    appendLog(log, `  Output: ${outputDir}`, 'cmd');
    if (encode) {
      appendLog(log, `  Codec:  ${codec}`, 'cmd');
      appendLog(log, `  Video:  ${bitrate}  ${resolution !== 'source' ? resolution : 'source res'}  ${fps !== 'source' ? fps + 'fps' : 'source fps'}`, 'cmd');
      appendLog(log, `  Audio:  ${audioBitrate} AAC`, 'cmd');
    } else {
      appendLog(log, `  Re-encode: No (direct ${container.toUpperCase()} download)`, 'cmd');
    }
    if (cookiesPath) appendLog(log, `  Cookies: ${cookiesPath}`, 'cmd');
    appendLog(log, '', 'stdout');
    markBodyStart(log);

    currentPid = null;
    isPaused   = false;
    pauseBtn.innerHTML = pauseIconHTML;
    pauseBtn.classList.remove('paused');
    runBtn.classList.add('hidden');
    pauseBtn.classList.remove('hidden');
    stopBtn.classList.remove('hidden');
    incRunning('M3U8 Downloader');

    let urlIdx = 0;
    if (urls.length > 1) appendLog(log, `▶ [1/${urls.length}] ${urls[0]}`, 'info');

    window.api.removeAllListeners('m3u8-output');
    window.api.onM3u8Output((data) => {
      if (data.type === 'pid') { currentPid = data.pid; return; }
      // Intermediate exit: log status and start next URL without collapsing
      if (data.type === 'exit' && urlIdx < urls.length - 1) {
        const failed = data.code !== 0 || !!log._hasError;
        log._hasError = false;
        if (failed) appendLog(log, `✖ URL ${urlIdx + 1}/${urls.length} failed (code ${data.code})`, 'error');
        else        appendLog(log, `✔ URL ${urlIdx + 1}/${urls.length} complete.`, 'success');
        urlIdx++;
        currentPid = null;
        appendLog(log, `▶ [${urlIdx + 1}/${urls.length}] ${urls[urlIdx]}`, 'info');
        window.api.runM3u8({ url: urls[urlIdx], outputDir, encode, codec, bitrate, resolution, fps, audioBitrate, container, cookiesPath });
      } else {
        // Last URL (or single): normal handler which collapses on finish
        handleOutput(log, data, () => {
          runBtn.classList.remove('hidden');
          pauseBtn.classList.add('hidden');
          stopBtn.classList.add('hidden');
          pauseBtn.innerHTML = pauseIconHTML;
          pauseBtn.classList.remove('paused');
          isPaused = false;
          decRunning('M3U8 Downloader');
        });
      }
    });

    window.api.runM3u8({ url: urls[0], outputDir, encode, codec, bitrate, resolution, fps, audioBitrate, container, cookiesPath });
  });
})()

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// â”€â”€ 5. gallery-dl â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
try {
(function () {
  const log        = document.getElementById('gdl-log');
  const runBtn     = document.getElementById('gdl-run');
  const pauseBtn   = document.getElementById('gdl-pause');
  const stopBtn    = document.getElementById('gdl-stop');
  const modeBtnGdl = document.getElementById('gdl-url-mode-btn');
  const singleDiv  = document.getElementById('gdl-url-single');
  const multiDiv   = document.getElementById('gdl-url-multi');
  const countBadge = document.getElementById('gdl-url-counter');

  // Verify elements exist before touching them
  if (!log || !runBtn || !pauseBtn || !stopBtn) {
    console.error('[gallery-dl IIFE] Missing element:', { log, runBtn, pauseBtn, stopBtn });
    throw new Error('Missing DOM element â€” see console');
  }
  let currentPid   = null;
  let isPaused     = false;
  let gdlMultiMode = false;
  let activeUrls   = [];

  const pauseIconHTML  = pauseBtn.innerHTML;
  const resumeIconHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none"><polygon points="5 3 19 12 5 21 5 3" fill="currentColor"/></svg> Resume`;

  // â”€â”€ URL mode toggle â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const gdlTextarea = document.getElementById('gdl-urls');
  function checkAddQueue() {
    if (!currentPid || !gdlMultiMode) return;
    const currentInputUrls = getGdlUrls();
    const newUrls = currentInputUrls.filter(u => !activeUrls.includes(u));
    if (newUrls.length > 0) {
      pauseBtn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none"><line x1="12" y1="5" x2="12" y2="19" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/><line x1="5" y1="12" x2="19" y2="12" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/></svg> Add to Queue`;
      pauseBtn.classList.add('btn-add-queue');
      pauseBtn.classList.remove('paused');
      pauseBtn._newUrls = newUrls;
    } else {
      pauseBtn.innerHTML = isPaused ? resumeIconHTML : pauseIconHTML;
      pauseBtn.classList.remove('btn-add-queue');
      pauseBtn.classList.toggle('paused', isPaused);
      pauseBtn._newUrls = null;
    }
  }

  function updateGdlCount() {
    const n = getGdlUrls().length;
    countBadge.textContent = n + (n === 1 ? ' URL' : ' URLs');
    checkAddQueue();
  }
  gdlTextarea.addEventListener('input', updateGdlCount);
  gdlTextarea.addEventListener('paste', (e) => {
    e.preventDefault();
    const pasted = (e.clipboardData || window.clipboardData).getData('text');
    const start  = gdlTextarea.selectionStart;
    const end    = gdlTextarea.selectionEnd;
    const insert = pasted.endsWith('\n') ? pasted : pasted + '\n';
    gdlTextarea.value = gdlTextarea.value.substring(0, start) + insert + gdlTextarea.value.substring(end);
    gdlTextarea.selectionStart = gdlTextarea.selectionEnd = start + insert.length;
    updateGdlCount();
  });
  modeBtnGdl.addEventListener('click', () => {
    gdlMultiMode = !gdlMultiMode;
    singleDiv.classList.toggle('hidden', gdlMultiMode);
    multiDiv.classList.toggle('hidden', !gdlMultiMode);
    countBadge.classList.toggle('hidden', !gdlMultiMode);
    modeBtnGdl.classList.toggle('active', gdlMultiMode);
    modeBtnGdl.title = gdlMultiMode ? 'Switch to single URL' : 'Switch to multi-URL mode';
    if (gdlMultiMode) {
      const single = document.getElementById('gdl-url').value.trim();
      if (single && !gdlTextarea.value.trim()) gdlTextarea.value = single + '\n';
      updateGdlCount();
    }
  });
  function getGdlUrls() {
    if (!gdlMultiMode) {
      const u = document.getElementById('gdl-url').value.trim();
      return u ? [u] : [];
    }
    return gdlTextarea.value.split('\n').map(l => l.trim()).filter(l => l.startsWith('http'));
  }

  document.getElementById('gdl-clear').addEventListener('click', () => clearLog(log));
  stopBtn.addEventListener('click', () => { if (currentPid) window.api.stopScript(currentPid); });

  pauseBtn.addEventListener('click', () => {
    if (!currentPid) return;
    if (pauseBtn.classList.contains('btn-add-queue')) {
      const newUrls = pauseBtn._newUrls;
      if (newUrls && newUrls.length > 0) {
        activeUrls.push(...newUrls);
        pauseBtn._newUrls = null;
        pauseBtn.innerHTML = isPaused ? resumeIconHTML : pauseIconHTML;
        pauseBtn.classList.remove('btn-add-queue');
        pauseBtn.classList.toggle('paused', isPaused);
        appendLog(log, '✔ Added ' + newUrls.length + ' new URL(s) to the queue.', 'success');
      }
      return;
    }
    if (!isPaused) {
      isPaused = true;
      window.api.pauseScript(currentPid);
      pauseBtn.innerHTML = resumeIconHTML;
      pauseBtn.classList.add('paused');
      appendLog(log, 'â¸ Paused.', 'info');
    } else {
      isPaused = false;
      window.api.resumeScript(currentPid);
      pauseBtn.innerHTML = pauseIconHTML;
      pauseBtn.classList.remove('paused');
      appendLog(log, '▶ Resumed.', 'info');
    }
  });

  runBtn.addEventListener('click', () => {
    activeUrls        = getGdlUrls();
    const urls        = activeUrls;
    const outputDir   = document.getElementById('gdl-output').value.trim();
    const filetypes   = document.getElementById('gdl-filetypes').value;
    const metadata    = document.getElementById('gdl-meta').checked;
    const cookiesPath = (document.getElementById('gdl-use-cookies').checked ? document.getElementById('gdl-cookies').value.trim() : '');
    const installGdl  = getSetting('dep-install-gdl') ? 'y' : 'n';

    if (urls.length === 0) { appendLog(log, 'âš  Please enter a URL.', 'error'); return; }
    if (!outputDir)        { appendLog(log, 'âš  Please choose an output directory.', 'error'); return; }
    const gdlPathErr = isProtectedPath(outputDir);
    if (gdlPathErr)        { appendLog(log, 'âš  ' + gdlPathErr, 'error'); return; }

    clearLog(log);
    if (urls.length > 1) {
      appendLog(log, `▶ Starting gallery-dl batch (${urls.length} URLs)...`, 'info');
    } else {
      appendLog(log, `▶ Starting gallery-dl...`, 'info');
      appendLog(log, `  URL:       ${urls[0]}`, 'cmd');
    }
    appendLog(log, `  Files:     ${filetypes === 'all' ? 'All files' : filetypes}`, 'cmd');
    appendLog(log, `  Metadata:  ${metadata ? 'Yes' : 'No'}`, 'cmd');
    appendLog(log, `  Output:    ${outputDir}`, 'cmd');
    if (cookiesPath) appendLog(log, `  Cookies:   ${cookiesPath}`, 'cmd');
    appendLog(log, '', 'stdout');
    markBodyStart(log);

    currentPid = null;
    isPaused   = false;
    pauseBtn.innerHTML = pauseIconHTML;
    pauseBtn.classList.remove('paused');
    runBtn.classList.add('hidden');
    pauseBtn.classList.remove('hidden');
    stopBtn.classList.remove('hidden');
    incRunning('gallery-dl');

    let urlIdx = 0;
    if (urls.length > 1) appendLog(log, `▶ [1/${urls.length}] ${urls[0]}`, 'info');

    window.api.removeAllListeners('gallery-dl-output');
    window.api.onGalleryDlOutput((data) => {
      if (data.type === 'pid') { currentPid = data.pid; return; }
      // Intermediate exit: log status and start next URL without collapsing
      if (data.type === 'exit' && urlIdx < urls.length - 1) {
        const failed = data.code !== 0 || !!log._hasError;
        log._hasError = false;
        if (failed) appendLog(log, `✖ URL ${urlIdx + 1}/${urls.length} failed (code ${data.code})`, 'error');
        else        appendLog(log, `✔ URL ${urlIdx + 1}/${urls.length} complete.`, 'success');
        urlIdx++;
        currentPid = null;
        appendLog(log, `▶ [${urlIdx + 1}/${urls.length}] ${urls[urlIdx]}`, 'info');
        window.api.runGalleryDl({ url: urls[urlIdx], outputDir, filetypes, metadata, cookiesPath, installGdl });
      } else {
        // Last URL (or single): normal handler which collapses on finish
        handleOutput(log, data, () => {
          runBtn.classList.remove('hidden');
          pauseBtn.classList.add('hidden');
          stopBtn.classList.add('hidden');
          pauseBtn.innerHTML = pauseIconHTML;
          pauseBtn.classList.remove('paused');
          isPaused = false;
          decRunning('gallery-dl');
        });
      }
    });

    window.api.runGalleryDl({ url: urls[0], outputDir, filetypes, metadata, cookiesPath, installGdl });
  });
})()
} catch (e) {
  // Show any IIFE init error in the log box if available, else alert
  const errBox = document.getElementById('gdl-log');
  if (errBox) {
    const d = document.createElement('div');
    d.className = 'line-error';
    d.textContent = 'âš  gallery-dl init error: ' + e.message;
    errBox.appendChild(d);
  } else {
    alert('gallery-dl init error: ' + e.message);
  }
}

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// â”€â”€ 6. Settings â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
(function () {
  // Apply all settings on init (skip disk-space â€” its module isn't ready yet)
  Object.keys(SETTINGS_MAP).forEach(key => {
    if (key === 'show-disk-space') return;
    applySetting(key, getSetting(key));
  });

  // Set version number dynamically
  const verEl = document.getElementById('settings-version');
  if (verEl && window.api.appVersion) verEl.textContent = 'nyx-dlp v' + window.api.appVersion;

  // Sync checkbox states and listen for changes
  document.querySelectorAll('[data-setting]').forEach(chk => {
    chk.checked = getSetting(chk.dataset.setting);
    chk.addEventListener('change', () => {
      localStorage.setItem('setting:' + chk.dataset.setting, chk.checked);
      applySetting(chk.dataset.setting, chk.checked);
      // Auto-fill bgutil default URL when toggled on and field is empty
      if (chk.dataset.setting === 'dep-use-bgutil' && chk.checked) {
        const urlField = document.getElementById('dep-bgutil-url');
        if (urlField && !urlField.value.trim()) {
          urlField.value = 'http://127.0.0.1:4416';
          localStorage.setItem('field:dep-bgutil-url', urlField.value);
        }
      }
    });
  });

  // Accordion: yt-dlp Advanced Options
  const advToggle = document.getElementById('ytdlp-advanced-toggle');
  const advBody   = document.getElementById('ytdlp-advanced-body');
  if (advToggle && advBody) {
    advToggle.addEventListener('click', () => {
      const open = advBody.classList.toggle('open');
      advToggle.setAttribute('aria-expanded', open);
      if (open && !advBody.dataset.rendered) {
        advBody.dataset.rendered = '1';
        renderYtdlpOpts('');
        const ytdlpSearch = document.getElementById('ytdlp-opts-search');
        if (ytdlpSearch) {
          ytdlpSearch.addEventListener('input', () => renderYtdlpOpts(ytdlpSearch.value));
        }
      }
    });
  }

  // Accordion: Batch Advanced Options
  const batchAdvToggle = document.getElementById('batch-advanced-toggle');
  const batchAdvBody   = document.getElementById('batch-advanced-body');
  if (batchAdvToggle && batchAdvBody) {
    batchAdvToggle.addEventListener('click', () => {
      const open = batchAdvBody.classList.toggle('open');
      batchAdvToggle.setAttribute('aria-expanded', open);
      if (open && !batchAdvBody.dataset.rendered) {
        batchAdvBody.dataset.rendered = '1';
        renderBatchOpts('');
        const batchSearch = document.getElementById('batch-opts-search');
        if (batchSearch) {
          batchSearch.addEventListener('input', () => renderBatchOpts(batchSearch.value));
        }
      }
    });
  }
})();

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// â”€â”€ 7. Form field persistence â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
(function () {
  function fkey(id) { return 'field:' + id; }

  // Text inputs â€” save on every keystroke
  const TEXT_IDS = [
    'ls-output',    'ls-cookies', 'ls-concurrent',
    'yd-output',    'yd-cookies',
    'batch-output', 'batch-cookies',
    'm3-output',    'm3-cookies',
    'gdl-output',   'gdl-cookies',
    'dep-bgutil-url',
  ];

  // Select dropdowns — save on change
  const SELECT_IDS = [
    'ls-quality', 'ls-client', 'ls-container',
    'yd-format',
    'batch-format', 'yd-client', 'batch-client',
    'm3-codec', 'm3-bitrate', 'm3-resolution', 'm3-fps', 'm3-audio-bitrate', 'm3-container',
    'gdl-filetypes',
  ];

  // Checkboxes on the tool tabs (not settings-page toggles) — save on change
  const CHECK_IDS = [
    'batch-rest', 'm3-encode', 'gdl-meta',
    'ls-use-cookies', 'ls-from-start', 'yd-use-cookies', 'batch-use-cookies', 'm3-use-cookies', 'gdl-use-cookies'
  ];

  TEXT_IDS.forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    const v = localStorage.getItem(fkey(id));
    if (v !== null) el.value = v;
    el.addEventListener('input', () => localStorage.setItem(fkey(id), el.value));
  });

  SELECT_IDS.forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    const v = localStorage.getItem(fkey(id));
    if (v !== null && [...el.options].some(o => o.value === v)) el.value = v;
    el.addEventListener('change', () => localStorage.setItem(fkey(id), el.value));
  });

  CHECK_IDS.forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    const v = localStorage.getItem(fkey(id));
    // Default overrides for checkboxes that should be ON out of the box
    const defaults = {
      'batch-rest': true,
      'ls-use-cookies': true,
      'yd-use-cookies': true,
      'batch-use-cookies': true,
      'm3-use-cookies': true,
      'gdl-use-cookies': true
    };
    el.checked = v !== null ? v === 'true' : (defaults[id] ?? false);
    el.dispatchEvent(new Event('change'));
    el.addEventListener('change', () => localStorage.setItem(fkey(id), el.checked));
  });

  // Auto-fill bgutil default URL on load if enabled and no value has been saved
  const bgutilField = document.getElementById('dep-bgutil-url');
  if (bgutilField && getSetting('dep-use-bgutil') && !bgutilField.value.trim()) {
    bgutilField.value = 'http://127.0.0.1:4416';
    localStorage.setItem('field:dep-bgutil-url', bgutilField.value);
  }
})();

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// â”€â”€ 8. Disk Space â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
const diskSpace = (() => {
  // Map tab name â†’ output directory input id
  const TAB_OUTPUT_IDS = {
    ytdlp:      'yd-output',
    livestream: 'ls-output',
    batch:      'batch-output',
    m3u8:       'm3-output',
    gallery:    'gdl-output',
    splitter:   'sp-output',
    concatenator: 'concat-output-dir',
  };

  const pill      = document.getElementById('diskSpacePill');
  const modeGrp   = document.getElementById('disk-space-mode-group');
  const staticGrp = document.getElementById('disk-static-drive-group');
  const radioAuto   = document.getElementById('disk-mode-auto');
  const radioStatic = document.getElementById('disk-mode-static');
  const staticInput = document.getElementById('disk-static-drive');

  let enabled   = false;
  let pollTimer = null;
  let activeTab = document.querySelector('.nav-item.active')?.dataset.tab || 'ytdlp';

  // â”€â”€ Helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  function getDrivePath() {
    const mode = localStorage.getItem('disk-space-mode') || 'auto';
    if (mode === 'static') {
      const drive = (localStorage.getItem('disk-static-drive') || '').trim();
      return drive || null;
    }
    // auto: pull from current tab's output field
    const outputId = TAB_OUTPUT_IDS[activeTab];
    const val = outputId ? (document.getElementById(outputId)?.value.trim() || '') : '';
    if (!val) return null;
    // Extract root drive (e.g. C:\ from C:\Users\...)
    const m = val.match(/^([A-Za-z]:[/\\])/);
    return m ? m[1] : (val.includes('/') ? '/' : null);
  }

  function fmtGB(bytes) {
    const gb = bytes / (1024 ** 3);
    return gb >= 10 ? gb.toFixed(1) + ' GB' : gb.toFixed(2) + ' GB';
  }

  async function refresh() {
    if (!enabled) return;
    const drivePath = getDrivePath();
    if (!drivePath) { pill.textContent = 'â€” free'; pill.className = 'disk-space-pill'; return; }
    const result = await window.api.getDiskSpace(drivePath);
    if (!result) { pill.textContent = '? free'; pill.className = 'disk-space-pill'; return; }
    const freeGB = result.free / (1024 ** 3);
    pill.textContent = fmtGB(result.free) + ' free';
    pill.className = 'disk-space-pill' + (freeGB < 5 ? ' critical' : freeGB < 20 ? ' low' : '');
  }

  function startPolling() { refresh(); pollTimer = setInterval(refresh, 10000); }
  function stopPolling()  { clearInterval(pollTimer); pollTimer = null; }

  // â”€â”€ Public: enable / disable â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  function setEnabled(val) {
    enabled = val;
    pill.style.display    = val ? '' : 'none';
    modeGrp.style.display = val ? '' : 'none';
    if (val) startPolling();
    else     stopPolling();
  }

  // â”€â”€ Settings UI wiring â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  function syncStaticGroup() {
    const isStatic = radioStatic.checked;
    staticGrp.style.display = isStatic ? '' : 'none';
    localStorage.setItem('disk-space-mode', isStatic ? 'static' : 'auto');
    refresh();
  }
  radioAuto.addEventListener('change',   syncStaticGroup);
  radioStatic.addEventListener('change', syncStaticGroup);

  staticInput.addEventListener('input', () => {
    localStorage.setItem('disk-static-drive', staticInput.value);
    refresh();
  });

  // Restore persisted mode + drive
  const savedMode = localStorage.getItem('disk-space-mode') || 'auto';
  if (savedMode === 'static') { radioStatic.checked = true; staticGrp.style.display = ''; }
  const savedDrive = localStorage.getItem('disk-static-drive') || '';
  if (savedDrive) staticInput.value = savedDrive;

  // Refresh when any output directory field changes
  Object.values(TAB_OUTPUT_IDS).forEach(id => {
    document.getElementById(id)?.addEventListener('input', () => { if (enabled) refresh(); });
  });

  // Refresh when tab changes
  document.querySelectorAll('.nav-item[data-tab]').forEach(btn => {
    btn.addEventListener('click', () => { activeTab = btn.dataset.tab; if (enabled) refresh(); });
  });

  return { setEnabled, refresh };
})();

// Apply disk-space setting now that the module is initialized
applySetting('show-disk-space', getSetting('show-disk-space'));
applySetting('minimize-to-tray', getSetting('minimize-to-tray'));

// â”€â”€ Video Splitter Logic â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const spSelect = document.getElementById('sp-parts-select');
const spCustomGrp = document.getElementById('sp-parts-custom-group');
if (spSelect && spCustomGrp) {
  spSelect.addEventListener('change', () => {
    if (spSelect.value === 'custom') spCustomGrp.classList.remove('hidden');
    else spCustomGrp.classList.add('hidden');
  });
}

let spPid = null;
const spRunBtn   = document.getElementById('sp-run');
const spStopBtn  = document.getElementById('sp-stop');
const spPauseBtn = document.getElementById('sp-pause');
const spClearBtn = document.getElementById('sp-clear');
const spLog      = document.getElementById('sp-log');

if (spClearBtn) spClearBtn.addEventListener('click', () => clearLog(spLog));

if (spRunBtn) {
  spRunBtn.addEventListener('click', async () => {
    const file = document.getElementById('sp-file').value.trim();
    const outputDir = document.getElementById('sp-output').value.trim();
    let partsStr = spSelect.value;
    if (partsStr === 'custom') {
      partsStr = document.getElementById('sp-parts-custom').value.trim();
    }
    const parts = parseInt(partsStr, 10);

    if (!file) {
      alert('Please select an input video file.');
      return;
    }
    if (isNaN(parts) || parts < 2) {
      alert('Please specify a valid number of parts (at least 2).');
      return;
    }

    clearLog(spLog);
    markBodyStart(spLog);
    appendLog(spLog, `> Splitting ${file} into ${parts} parts...`, 'input');

    spRunBtn.disabled = true;
    spStopBtn.classList.remove('hidden');
    spPauseBtn.classList.remove('hidden');
    spPauseBtn.classList.remove('paused');
    spPauseBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none"><rect x="6" y="4" width="4" height="16" fill="currentColor"/><rect x="14" y="4" width="4" height="16" fill="currentColor"/></svg> Pause';
    incRunning('Video Splitter');

    window.api.runSplitter({ file, parts, outputDir });
  });
}

window.api.onSplitterOutput((data) => {
  if (data.type === 'pid') { spPid = data.pid; return; }
  handleOutput(spLog, data, () => {
    spPid = null;
    spRunBtn.disabled = false;
    spStopBtn.classList.add('hidden');
    spPauseBtn.classList.add('hidden');
    decRunning('Video Splitter');
  });
});

if (spStopBtn) {
  spStopBtn.addEventListener('click', () => {
    if (spPid) {
      window.api.stopScript(spPid);
      appendLog(spLog, 'âš  Stopping script...', 'warning');
    }
  });
}

if (spPauseBtn) {
  spPauseBtn.addEventListener('click', () => {
    if (!spPid) return;
    const isPaused = spPauseBtn.classList.toggle('paused');
    if (isPaused) {
      window.api.pauseScript(spPid);
      spPauseBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none"><polygon points="5 3 19 12 5 21 5 3" fill="currentColor"/></svg> Resume';
      appendLog(spLog, 'â¸ Process paused.', 'warning');
    } else {
      window.api.resumeScript(spPid);
      spPauseBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none"><rect x="6" y="4" width="4" height="16" fill="currentColor"/><rect x="14" y="4" width="4" height="16" fill="currentColor"/></svg> Pause';
      appendLog(spLog, '▶ Process resumed.', 'warning');
    }
  });
}

// â”€â”€ Video Concatenator Logic â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
let concatPid = null;
const concatRunBtn   = document.getElementById('concat-run');
const concatStopBtn  = document.getElementById('concat-stop');
const concatPauseBtn = document.getElementById('concat-pause');
const concatClearBtn = document.getElementById('concat-clear');
const concatLog      = document.getElementById('concat-log');

if (concatClearBtn) concatClearBtn.addEventListener('click', () => clearLog(concatLog));

if (concatRunBtn) {
  concatRunBtn.addEventListener('click', async () => {
    const list = document.getElementById('concat-file-list');
    const items = list.querySelectorAll('.sortable-item');
    const files = Array.from(items).map(item => item.dataset.path);
    const outputName = document.getElementById('concat-output-name').value.trim() || 'merged_video.mp4';
    const outputDir = document.getElementById('concat-output-dir').value.trim();
    const forceEncode = document.getElementById('concat-force').checked;

    if (files.length < 2) {
      alert('Please select at least two video files to concatenate.');
      return;
    }

    clearLog(concatLog);
    markBodyStart(concatLog);
    appendLog(concatLog, `> Merging ${files.length} videos into ${outputName}...`, 'input');

    concatRunBtn.disabled = true;
    concatStopBtn.classList.remove('hidden');
    concatPauseBtn.classList.remove('hidden');
    concatPauseBtn.classList.remove('paused');
    concatPauseBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none"><rect x="6" y="4" width="4" height="16" fill="currentColor"/><rect x="14" y="4" width="4" height="16" fill="currentColor"/></svg> Pause';
    incRunning('Video Concatenator');

    window.api.runConcatenator({ files, output: outputName, forceEncode, outputDir });
  });
}

window.api.onConcatenatorOutput((data) => {
  if (data.type === 'pid') { concatPid = data.pid; return; }
  handleOutput(concatLog, data, () => {
    concatPid = null;
    concatRunBtn.disabled = false;
    concatStopBtn.classList.add('hidden');
    concatPauseBtn.classList.add('hidden');
    decRunning('Video Concatenator');
  });
});

if (concatStopBtn) {
  concatStopBtn.addEventListener('click', () => {
    if (concatPid) {
      window.api.stopScript(concatPid);
      appendLog(concatLog, 'âš  Stopping script...', 'warning');
    }
  });
}

if (concatPauseBtn) {
  concatPauseBtn.addEventListener('click', () => {
    if (!concatPid) return;
    const isPaused = concatPauseBtn.classList.toggle('paused');
    if (isPaused) {
      window.api.pauseScript(concatPid);
      concatPauseBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none"><polygon points="5 3 19 12 5 21 5 3" fill="currentColor"/></svg> Resume';
      appendLog(concatLog, 'â¸ Process paused.', 'warning');
    } else {
      window.api.resumeScript(concatPid);
      concatPauseBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none"><rect x="6" y="4" width="4" height="16" fill="currentColor"/><rect x="14" y="4" width="4" height="16" fill="currentColor"/></svg> Pause';
      appendLog(concatLog, '▶ Process resumed.', 'warning');
    }
  });
}

// â”€â”€ Video Encoder Logic â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
let encPid = null;
const encRunBtn   = document.getElementById('enc-run');
const encStopBtn  = document.getElementById('enc-stop');
const encPauseBtn = document.getElementById('enc-pause');
const encClearBtn = document.getElementById('enc-clear');
const encLog      = document.getElementById('enc-log');
const encProgressWrap  = document.getElementById('enc-progress-wrap');
const encProgressBar   = document.getElementById('enc-progress-bar');
const encProgressLabel = document.getElementById('enc-progress-label');

if (encClearBtn) encClearBtn.addEventListener('click', () => {
  clearLog(encLog);
  encProgressWrap.classList.add('hidden');
});

if (encRunBtn) {
  encRunBtn.addEventListener('click', async () => {
    const list = document.getElementById('enc-file-list');
    const items = list.querySelectorAll('.sortable-item');
    const files = Array.from(items).map(item => item.dataset.path);
    const outputDir = document.getElementById('enc-output-dir').value.trim();
    const mode = document.getElementById('enc-mode').value;
    const vcodec = document.getElementById('enc-vcodec').value;
    const acodec = document.getElementById('enc-acodec').value;

    if (files.length === 0) {
      alert('Please select at least one video file to encode.');
      return;
    }

    clearLog(encLog);
    markBodyStart(encLog);
    encProgressWrap.classList.remove('hidden');
    encProgressBar.style.width = '0%';
    encProgressLabel.textContent = '0%';
    appendLog(encLog, `> Encoding ${files.length} videos...`, 'input');

    encRunBtn.disabled = true;
    encStopBtn.classList.remove('hidden');
    encPauseBtn.classList.remove('hidden');
    encPauseBtn.classList.remove('paused');
    encPauseBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none"><rect x="6" y="4" width="4" height="16" fill="currentColor"/><rect x="14" y="4" width="4" height="16" fill="currentColor"/></svg> Pause';
    incRunning('Video Encoder');

    window.api.runEncoder({ files, outputDir, mode, vcodec, acodec });
  });
}

window.api.onEncoderOutput((data) => {
  if (data.type === 'pid') { encPid = data.pid; return; }
  handleOutput(encLog, data, () => {
    encPid = null;
    encRunBtn.disabled = false;
    encStopBtn.classList.add('hidden');
    encPauseBtn.classList.add('hidden');
    decRunning('Video Encoder');
  });

  // Extract progress from ffmpeg stdout (if formatted correctly by the python script)
  if (data.type === 'stdout' && data.text) {
    const lines = data.text.split('\\n');
    for (const line of lines) {
      const match = line.match(/\\[download\\]\\s+(\\d+(?:\\.\\d+)?)%/);
      if (match) {
        const pct = match[1];
        encProgressBar.style.width = `${pct}%`;
        encProgressLabel.textContent = `${pct}%`;
      }
    }
  }
});

if (encStopBtn) {
  encStopBtn.addEventListener('click', () => {
    if (encPid) {
      window.api.stopScript(encPid);
      appendLog(encLog, 'âš  Stopping script...', 'warning');
    }
  });
}

if (encPauseBtn) {
  encPauseBtn.addEventListener('click', () => {
    if (!encPid) return;
    const isPaused = encPauseBtn.classList.toggle('paused');
    if (isPaused) {
      window.api.pauseScript(encPid);
      encPauseBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none"><polygon points="5 3 19 12 5 21 5 3" fill="currentColor"/></svg> Resume';
      appendLog(encLog, 'â¸ Process paused.', 'warning');
    } else {
      window.api.resumeScript(encPid);
      encPauseBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none"><rect x="6" y="4" width="4" height="16" fill="currentColor"/><rect x="14" y="4" width="4" height="16" fill="currentColor"/></svg> Pause';
      appendLog(encLog, '▶ Process resumed.', 'warning');
    }
  });
}

// Initialize options on startup
updateAllOpts();

// â”€â”€ UI State Synchronization â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
let isSyncingState = false;

function broadcastState(el) {
  if (isSyncingState || !window.api || !window.api.syncUiState) return;
  const id = el.id || el.dataset?.setting;
  if (!id) return;
  window.api.syncUiState({
    id,
    type: el.type,
    value: el.value,
    checked: el.checked
  });
}

document.addEventListener('input', (e) => {
  if (e.target && e.target.matches && e.target.matches('.form-input, .form-textarea, .form-select')) {
    broadcastState(e.target);
  }
});

document.addEventListener('change', (e) => {
  if (e.target && e.target.matches && e.target.matches('.toggle-switch input, input[type="radio"], input[type="checkbox"], .form-select')) {
    broadcastState(e.target);
  }
});

if (window.api) {
  if (window.api.onSyncUiState) {
    window.api.onSyncUiState((data) => {
      isSyncingState = true;
      const el = document.getElementById(data.id) || document.querySelector(`[data-setting="${data.id}"]`);
      if (el) {
        if (data.type === 'checkbox' || data.type === 'radio') {
          if (el.checked !== data.checked) {
             el.checked = data.checked;
             el.dispatchEvent(new Event('change', { bubbles: true }));
          }
        } else {
          if (el.value !== data.value) {
             el.value = data.value;
             el.dispatchEvent(new Event('input', { bubbles: true }));
             el.dispatchEvent(new Event('change', { bubbles: true }));
          }
        }
      }
      isSyncingState = false;
    });
  }

  if (window.api.onFullState) {
    window.api.onFullState((state) => {
      isSyncingState = true;
      Object.keys(state).forEach(id => {
        const data = state[id];
        const el = document.getElementById(id) || document.querySelector(`[data-setting="${id}"]`);
        if (el) {
          if (data.type === 'checkbox' || data.type === 'radio') {
            if (el.checked !== data.checked) {
               el.checked = data.checked;
               el.dispatchEvent(new Event('change', { bubbles: true }));
            }
          } else {
            if (el.value !== data.value) {
               el.value = data.value;
               el.dispatchEvent(new Event('input', { bubbles: true }));
               el.dispatchEvent(new Event('change', { bubbles: true }));
            }
          }
        }
      });
      isSyncingState = false;
    });
  }
}

document.addEventListener('DOMContentLoaded', () => {
  if (window.api) {
    if (window.api.appVersion !== 'remote') {
      setTimeout(() => {
        const inputs = document.querySelectorAll('.form-input, .form-select, .form-textarea, .toggle-switch input, input[type="radio"]');
        inputs.forEach(el => broadcastState(el));
      }, 500);
    } else {
      setTimeout(() => {
        if (window.api.requestFullState) window.api.requestFullState();
      }, 500);
    }
  }
});
// -- Batch Rest Context Menu ------------------------------
document.addEventListener('contextmenu', e => {
  const target = e.target;
  if (target.classList.contains('line-info') && target.textContent.includes('Resting between downloads')) {
    e.preventDefault();
    const menu = document.getElementById('batch-rest-context-menu');
    if (!menu) return;
    menu.style.display = 'block';
    menu.style.left = e.pageX + 'px';
    menu.style.top = e.pageY + 'px';
  } else {
    const menu = document.getElementById('batch-rest-context-menu');
    if (menu) menu.style.display = 'none';
  }
});

document.addEventListener('click', e => {
  const menu = document.getElementById('batch-rest-context-menu');
  if (menu && menu.style.display === 'block') {
    if (e.target.classList.contains('context-menu-item')) {
      let val = e.target.getAttribute('data-val');
      if (val === 'custom') {
        const input = prompt('Enter rest time in seconds:');
        if (input && !isNaN(input)) {
          val = parseInt(input);
        } else {
          return;
        }
      } else {
        val = parseInt(val) * 60; // minutes to seconds
      }
      if (window.api && window.api.setBatchRest) {
        window.api.setBatchRest(val);
      }
    }
    menu.style.display = 'none';
  }
});
