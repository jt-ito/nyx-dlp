const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  appVersion: require('./package.json').version,

  // Window controls
  minimize: () => ipcRenderer.send('window-minimize'),
  maximize: () => ipcRenderer.send('window-maximize'),
  close:    () => ipcRenderer.send('window-close'),

  // Folder picker
  pickFolder: () => ipcRenderer.invoke('pick-folder'),
  pickFile:   () => ipcRenderer.invoke('pick-file'),
  pickFiles:  () => ipcRenderer.invoke('pick-files'),
  getDiskSpace: (drivePath) => ipcRenderer.invoke('get-disk-space', drivePath),

  // Script runners
  runLivestream: (opts) => ipcRenderer.send('run-livestream', opts),
  runYtdlp:      (opts) => ipcRenderer.send('run-ytdlp', opts),
  runBatch:      (opts) => ipcRenderer.send('run-batch', opts),
  runM3u8:       (opts) => ipcRenderer.send('run-m3u8', opts),
  runGalleryDl:  (opts) => ipcRenderer.send('run-gallery-dl', opts),
  runSplitter:   (opts) => ipcRenderer.send('run-splitter', opts),
  runConcatenator: (opts) => ipcRenderer.send('run-concatenator', opts),

  // Output listeners
  onLivestreamOutput: (cb) => ipcRenderer.on('livestream-output', (_e, d) => cb(d)),
  onYtdlpOutput:      (cb) => ipcRenderer.on('ytdlp-output',      (_e, d) => cb(d)),
  onBatchOutput:      (cb) => ipcRenderer.on('batch-output',       (_e, d) => cb(d)),
  onM3u8Output:       (cb) => ipcRenderer.on('m3u8-output',        (_e, d) => cb(d)),
  onGalleryDlOutput:  (cb) => ipcRenderer.on('gallery-dl-output',  (_e, d) => cb(d)),
  onSplitterOutput:   (cb) => ipcRenderer.on('splitter-output',    (_e, d) => cb(d)),
  onConcatenatorOutput: (cb) => ipcRenderer.on('concatenator-output', (_e, d) => cb(d)),

  // Process control
  stopScript:   (pid) => ipcRenderer.send('stop-script',   { pid }),
  pauseScript:  (pid) => ipcRenderer.send('pause-script',  { pid }),
  resumeScript: (pid) => ipcRenderer.send('resume-script', { pid }),

  // Remove listeners
  removeAllListeners: (channel) => ipcRenderer.removeAllListeners(channel),
});
