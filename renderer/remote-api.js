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
    runEncoder:    (opts) => ws.send(JSON.stringify({ type: 'ipc-send', channel: 'run-encoder', data: opts })),

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
