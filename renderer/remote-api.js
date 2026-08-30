/* ── Remote API Mocking (for browsers) ───────────────────── */
if (typeof window.api === 'undefined') {
  console.log("No window.api found. Initializing remote WebSocket connection...");
  
  // Hide window controls for remote clients
  const controls = document.querySelector('.titlebar-controls');
  if (controls) controls.style.display = 'none';

  const ws = new WebSocket(`ws://${window.location.host}`);
  const pendingRequests = new Map();
  let nextReqId = 1;
  const msgQueue = [];

  function sendWs(obj) {
    const json = JSON.stringify(obj);
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(json);
    } else {
      msgQueue.push(json);
    }
  }

  ws.onopen = () => {
    while (msgQueue.length > 0) {
      ws.send(msgQueue.shift());
    }
  };

  let remoteVersion = '4.0.5';
  fetch('/package.json').then(r => r.json()).then(pkg => {
    if (pkg && pkg.version) {
      remoteVersion = pkg.version;
      window.api.appVersion = pkg.version;
      const statusEl = document.getElementById('update-status-text');
      if (statusEl && statusEl.textContent.includes('Current version:')) {
        statusEl.textContent = `Current version: v${pkg.version}`;
      }
    }
  }).catch(() => {});

  // Reflect active server status in the Settings page for browser clients
  document.addEventListener('DOMContentLoaded', () => {
    const remoteToggle = document.querySelector('input[data-setting="remote-access"]');
    if (remoteToggle) {
      remoteToggle.checked = true;
      remoteToggle.disabled = true;
      const card = remoteToggle.closest('.toggle-card');
      if (card) {
        const desc = card.querySelector('.toggle-desc');
        if (desc) desc.innerHTML = `<span style="color:#10b981; font-weight:600;">● Active</span> &mdash; Serving this session on port ${window.location.port || '80'}`;
      }
    }
    const portGroup = document.getElementById('remote-access-port-group');
    if (portGroup) portGroup.style.display = 'flex';
    const portInput = document.getElementById('remote-access-port');
    if (portInput && window.location.port) portInput.value = window.location.port;

    // Grey out Start Minimized & Minimize to Tray on CLI / Web Remote sessions
    const startMinToggle = document.querySelector('input[data-setting="start-minimized"]');
    if (startMinToggle) {
      startMinToggle.disabled = true;
      const card = startMinToggle.closest('.toggle-card');
      if (card) {
        card.style.opacity = '0.45';
        card.style.pointerEvents = 'none';
        const desc = card.querySelector('.toggle-desc');
        if (desc) desc.innerHTML = `<span style="color:var(--text-muted); font-style:italic;">Not applicable in headless CLI / remote web mode</span>`;
      }
    }

    const minTrayToggle = document.querySelector('input[data-setting="minimize-to-tray"]');
    if (minTrayToggle) {
      minTrayToggle.disabled = true;
      const card = minTrayToggle.closest('.toggle-card');
      if (card) {
        card.style.opacity = '0.45';
        card.style.pointerEvents = 'none';
        const desc = card.querySelector('.toggle-desc');
        if (desc) desc.innerHTML = `<span style="color:var(--text-muted); font-style:italic;">Not applicable in headless CLI / remote web mode</span>`;
      }
    }
  });

  window.api = {
    appVersion: remoteVersion,
    minimize: () => {}, maximize: () => {}, close: () => {}, setMinimizeToTray: () => {},
    setRunOnStartup: () => {}, setStartMinimized: () => {}, setAutoUpdate: () => {},
    checkForUpdates: async () => {
      try {
        const curVer = window.api.appVersion || remoteVersion;
        const res = await fetch('https://api.github.com/repos/jt-ito/nyx-dlp/releases/latest');
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const data = await res.json();
        const latestTag = data.tag_name || '';
        const latestVersion = latestTag.replace(/^v/, '');
        
        const v1Parts = latestVersion.split('.').map(n => parseInt(n) || 0);
        const v2Parts = curVer.split('.').map(n => parseInt(n) || 0);
        let isNewer = false;
        for (let i = 0; i < Math.max(v1Parts.length, v2Parts.length); i++) {
          const p1 = v1Parts[i] || 0;
          const p2 = v2Parts[i] || 0;
          if (p1 > p2) { isNewer = true; break; }
          if (p1 < p2) { isNewer = false; break; }
        }

        return {
          hasUpdate: isNewer,
          currentVersion: curVer,
          latestVersion: latestVersion,
          releaseUrl: data.html_url || 'https://github.com/jt-ito/nyx-dlp/releases',
          releaseName: data.name || latestTag,
          releaseNotes: data.body || ''
        };
      } catch (e) {
        return { hasUpdate: false, currentVersion: window.api.appVersion || remoteVersion, error: e.message };
      }
    },
    openExternal: (url) => window.open(url, '_blank'),
    onUpdateAvailable: () => {},
    downloadAppUpdate: async (opts) => { window.open(opts?.downloadUrl || opts?.releaseUrl, '_blank'); return { filePath: '' }; },
    installAppUpdate: () => {},
    onAppUpdateProgress: () => {},
    onAppUpdateDownloaded: () => {},
    startDiscordBot: () => Promise.resolve({ status: 'disconnected' }),
    stopDiscordBot: () => Promise.resolve(true),
    getDiscordBotStatus: () => Promise.resolve({ status: 'disconnected', botUser: null, clientId: '', inviteUrl: '' }),
    syncDiscordCommands: () => Promise.resolve(true),
    _invokeRaw: (channel, data) => new Promise(resolve => {
      const id = nextReqId++;
      pendingRequests.set(id, resolve);
      sendWs({ type: 'ipc-invoke', channel, id, data });
    }),
    invoke: (channel, data) => window.api._invokeRaw(channel, data),

    pickFolder: (initial) => window.remoteFileBrowser ? window.remoteFileBrowser.show({ type: 'folder', multiple: false, initialPath: initial }) : Promise.resolve(null),
    pickFile: (initial) => window.remoteFileBrowser ? window.remoteFileBrowser.show({ type: 'file', multiple: false, initialPath: initial }) : Promise.resolve(null),
    pickVideo: (initial) => window.remoteFileBrowser ? window.remoteFileBrowser.show({ type: 'video', multiple: false, initialPath: initial }) : Promise.resolve(null),
    pickFiles: (initial) => window.remoteFileBrowser ? window.remoteFileBrowser.show({ type: 'video', multiple: true, initialPath: initial }) : Promise.resolve([]),
    pickAnyFiles: (initial) => window.remoteFileBrowser ? window.remoteFileBrowser.show({ type: 'any', multiple: true, initialPath: initial }) : Promise.resolve([]),
    pickFolders: (initial) => window.remoteFileBrowser ? window.remoteFileBrowser.show({ type: 'folder', multiple: true, initialPath: initial }) : Promise.resolve([]),
    getDiskSpace: (path) => new Promise(resolve => {
      const id = nextReqId++;
      pendingRequests.set(id, resolve);
      sendWs({ type: 'ipc-invoke', channel: 'get-disk-space', id, data: path });
    }),
    
    // Notifications & History
    showNotification: (opts) => sendWs({ type: 'ipc-send', channel: 'show-notification', data: opts }),
    getHistory: () => new Promise(resolve => {
      const id = nextReqId++;
      pendingRequests.set(id, resolve);
      sendWs({ type: 'ipc-invoke', channel: 'get-history', id });
    }),
    addHistory: (entry) => new Promise(resolve => {
      const id = nextReqId++;
      pendingRequests.set(id, resolve);
      sendWs({ type: 'ipc-invoke', channel: 'add-history', id, data: entry });
    }),
    deleteHistoryItem: (idOrDate) => new Promise(resolve => {
      const id = nextReqId++;
      pendingRequests.set(id, resolve);
      sendWs({ type: 'ipc-invoke', channel: 'delete-history-item', id, data: idOrDate });
    }),
    clearHistory: () => new Promise(resolve => {
      const id = nextReqId++;
      pendingRequests.set(id, resolve);
      sendWs({ type: 'ipc-invoke', channel: 'clear-history', id });
    }),
    
    // Script runners
    runLivestream: (opts) => sendWs({ type: 'ipc-send', channel: 'run-livestream', data: opts }),
    runYtdlp:      (opts) => sendWs({ type: 'ipc-send', channel: 'run-ytdlp', data: opts }),
    runBatch:      (opts) => sendWs({ type: 'ipc-send', channel: 'run-batch', data: opts }),
    setBatchRest:  (opts) => sendWs({ type: 'ipc-send', channel: 'set-batch-rest', data: opts }),
    skipBatchRest: (opts) => sendWs({ type: 'ipc-send', channel: 'skip-batch-rest', data: opts }),
    appendBatchQueue: (opts) => sendWs({ type: 'ipc-send', channel: 'append-batch-queue', data: opts }),
    updateBatchQueue: (opts) => sendWs({ type: 'ipc-send', channel: 'update-batch-queue', data: opts }),
    runM3u8:       (opts) => sendWs({ type: 'ipc-send', channel: 'run-m3u8', data: opts }),
    fetchM3u8TwitchMeta: (opts) => window.api.invoke ? window.api.invoke('fetch-m3u8-twitch-meta', opts) : Promise.resolve({}),
    runGalleryDl:  (opts) => sendWs({ type: 'ipc-send', channel: 'run-gallery-dl', data: opts }),
    runSplitter:   (opts) => sendWs({ type: 'ipc-send', channel: 'run-splitter', data: opts }),
    runConcatenator: (opts) => sendWs({ type: 'ipc-send', channel: 'run-concatenator', data: opts }),
    runEncoder:    (opts) => sendWs({ type: 'ipc-send', channel: 'run-encoder', data: opts }),
    runIaUpload:   (opts) => sendWs({ type: 'ipc-send', channel: 'run-ia-upload', data: opts }),
    runIaEdit:     (opts) => sendWs({ type: 'ipc-send', channel: 'run-ia-edit', data: opts }),
    runIaDownload: (opts) => sendWs({ type: 'ipc-send', channel: 'run-ia-download', data: opts }),
    checkIaAuth:   (autoIa) => window.api.invoke('check-ia-auth', { autoIa }),
    configIa:      (opts) => window.api.invoke('config-ia', opts),
    unlinkIa:      (opts) => window.api.invoke('unlink-ia', opts),
    getIaConfig:   () => window.api.invoke('get-ia-config'),
    listIaItem:    (identifier) => window.api.invoke('list-ia-item', { identifier }),
    getIaMetadata: (identifier) => window.api.invoke('get-ia-metadata', { identifier }),

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
    onEncoderOutput:    function(cb) { this._addListener('encoder-output', cb) },
    onIaOutput:         function(cb) { this._addListener('ia-output', cb) },
    onSyncUiState:      function(cb) { this._addListener('sync-ui-state', cb) },
    onFullState:        function(cb) { this._addListener('full-state', cb) },

    stopScript:   (pid) => sendWs({ type: 'ipc-send', channel: 'stop-script', data: { pid } }),
    pauseScript:  (pid) => sendWs({ type: 'ipc-send', channel: 'pause-script', data: { pid } }),
    resumeScript: (pid) => sendWs({ type: 'ipc-send', channel: 'resume-script', data: { pid } }),
    syncUiState:  (data) => sendWs({ type: 'ipc-send', channel: 'sync-ui-state', data }),
    requestFullState: () => sendWs({ type: 'ipc-send', channel: 'request-full-state' }),

    removeAllListeners: function(channel) {
       this._listeners[channel] = [];
    },
    
    // Discord Bot
    startDiscordBot: (opts) => window.api.invoke('start-discord-bot', opts),
    stopDiscordBot: () => window.api.invoke('stop-discord-bot'),
    getDiscordBotStatus: () => window.api.invoke('get-discord-bot-status'),
    syncDiscordCommands: () => window.api.invoke('sync-discord-commands'),
    onDiscordBotStatus: function(cb) { this._addListener('discord-bot-status', cb); },

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
