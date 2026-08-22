/* ── Remote API Mocking (for browsers) ───────────────────── */
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
    setRunOnStartup: () => {}, setStartMinimized: () => {}, setAutoUpdate: () => {},
    checkForUpdates: () => Promise.resolve({ hasUpdate: false, currentVersion: 'remote', latestVersion: 'remote' }),
    openExternal: (url) => window.open(url, '_blank'),
    onUpdateAvailable: () => {},
    startDiscordBot: () => Promise.resolve({ status: 'disconnected' }),
    stopDiscordBot: () => Promise.resolve(true),
    getDiscordBotStatus: () => Promise.resolve({ status: 'disconnected', botUser: null, clientId: '', inviteUrl: '' }),
    syncDiscordCommands: () => Promise.resolve(true),
    onDiscordBotStatus: () => {},
    pickFolder: () => new Promise(r => r(null)),
    pickFile: () => new Promise(r => r(null)),
    pickVideo: () => new Promise(r => r(null)),
    pickFiles: () => new Promise(r => r(null)),
    getDiskSpace: (path) => new Promise(resolve => {
      const id = nextReqId++;
      pendingRequests.set(id, resolve);
      ws.send(JSON.stringify({ type: 'ipc-invoke', channel: 'get-disk-space', id, data: path }));
    }),
    
    // Notifications & History
    showNotification: (opts) => ws.send(JSON.stringify({ type: 'ipc-send', channel: 'show-notification', data: opts })),
    getHistory: () => new Promise(resolve => {
      const id = nextReqId++;
      pendingRequests.set(id, resolve);
      ws.send(JSON.stringify({ type: 'ipc-invoke', channel: 'get-history', id }));
    }),
    addHistory: (entry) => new Promise(resolve => {
      const id = nextReqId++;
      pendingRequests.set(id, resolve);
      ws.send(JSON.stringify({ type: 'ipc-invoke', channel: 'add-history', id, data: entry }));
    }),
    deleteHistoryItem: (idOrDate) => new Promise(resolve => {
      const id = nextReqId++;
      pendingRequests.set(id, resolve);
      ws.send(JSON.stringify({ type: 'ipc-invoke', channel: 'delete-history-item', id, data: idOrDate }));
    }),
    clearHistory: () => new Promise(resolve => {
      const id = nextReqId++;
      pendingRequests.set(id, resolve);
      ws.send(JSON.stringify({ type: 'ipc-invoke', channel: 'clear-history', id }));
    }),
    
    // Script runners
    runLivestream: (opts) => ws.send(JSON.stringify({ type: 'ipc-send', channel: 'run-livestream', data: opts })),
    runYtdlp:      (opts) => ws.send(JSON.stringify({ type: 'ipc-send', channel: 'run-ytdlp', data: opts })),
    runBatch:      (opts) => ws.send(JSON.stringify({ type: 'ipc-send', channel: 'run-batch', data: opts })),
    setBatchRest:  (opts) => ws.send(JSON.stringify({ type: 'ipc-send', channel: 'set-batch-rest', data: opts })),
    skipBatchRest: (opts) => ws.send(JSON.stringify({ type: 'ipc-send', channel: 'skip-batch-rest', data: opts })),
    appendBatchQueue: (opts) => ws.send(JSON.stringify({ type: 'ipc-send', channel: 'append-batch-queue', data: opts })),
    runM3u8:       (opts) => ws.send(JSON.stringify({ type: 'ipc-send', channel: 'run-m3u8', data: opts })),
    runGalleryDl:  (opts) => ws.send(JSON.stringify({ type: 'ipc-send', channel: 'run-gallery-dl', data: opts })),
    runSplitter:   (opts) => ws.send(JSON.stringify({ type: 'ipc-send', channel: 'run-splitter', data: opts })),
    runConcatenator: (opts) => ws.send(JSON.stringify({ type: 'ipc-send', channel: 'run-concatenator', data: opts })),
    runEncoder:    (opts) => ws.send(JSON.stringify({ type: 'ipc-send', channel: 'run-encoder', data: opts })),
    runIaUpload:   (opts) => ws.send(JSON.stringify({ type: 'ipc-send', channel: 'run-ia-upload', data: opts })),
    runIaEdit:     (opts) => ws.send(JSON.stringify({ type: 'ipc-send', channel: 'run-ia-edit', data: opts })),
    runIaDownload: (opts) => ws.send(JSON.stringify({ type: 'ipc-send', channel: 'run-ia-download', data: opts })),

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
