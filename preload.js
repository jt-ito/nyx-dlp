const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  appVersion: require('./package.json').version,

  // Window controls
  minimize: () => ipcRenderer.send('window-minimize'),
  maximize: () => ipcRenderer.send('window-maximize'),
  close:    () => ipcRenderer.send('window-close'),
  setMinimizeToTray: (val) => ipcRenderer.send('set-minimize-to-tray', val),
  setRunOnStartup:   (val) => ipcRenderer.send('set-run-on-startup', val),
  setStartMinimized: (val) => ipcRenderer.send('set-start-minimized', val),
  setAutoUpdate:     (val) => ipcRenderer.send('set-auto-update', val),
  checkForUpdates:   () => ipcRenderer.invoke('check-for-updates'),
  openExternal:      (url) => ipcRenderer.send('open-external', url),
  onUpdateAvailable: (cb) => ipcRenderer.on('update-available', (_e, d) => cb(d)),

  // Folder picker
  pickFolder: () => ipcRenderer.invoke('pick-folder'),
  pickFile:   () => ipcRenderer.invoke('pick-file'),
  pickVideo:  () => ipcRenderer.invoke('pick-video'),
  pickFiles:  () => ipcRenderer.invoke('pick-files'),
  pickAnyFiles: () => ipcRenderer.invoke('pick-any-files'),
  pickFolders: () => ipcRenderer.invoke('pick-folders'),
  getDiskSpace: (drivePath) => ipcRenderer.invoke('get-disk-space', drivePath),
  saveTextFile: (opts) => ipcRenderer.invoke('save-text-file', opts),
  
  // Notifications & History
  showNotification: (opts) => ipcRenderer.send('show-notification', opts),
  getHistory: () => ipcRenderer.invoke('get-history'),
  addHistory: (entry) => ipcRenderer.invoke('add-history', entry),
  deleteHistoryItem: (idOrDate) => ipcRenderer.invoke('delete-history-item', idOrDate),
  clearHistory: () => ipcRenderer.invoke('clear-history'),

  // Script runners
  runLivestream: (opts) => ipcRenderer.send('run-livestream', opts),
  runYtdlp:      (opts) => ipcRenderer.send('run-ytdlp', opts),
  runBatch:      (opts) => ipcRenderer.send('run-batch', opts),
  setBatchRest:  (opts) => ipcRenderer.send('set-batch-rest', opts),
  skipBatchRest: (opts) => ipcRenderer.send('skip-batch-rest', opts),
  appendBatchQueue: (opts) => ipcRenderer.send('append-batch-queue', opts),
  runM3u8:       (opts) => ipcRenderer.send('run-m3u8', opts),
  runGalleryDl:  (opts) => ipcRenderer.send('run-gallery-dl', opts),
  runSplitter:   (opts) => ipcRenderer.send('run-splitter', opts),
  runConcatenator: (opts) => ipcRenderer.send('run-concatenator', opts),
  runEncoder:    (opts) => ipcRenderer.send('run-encoder', opts),
  runIaUpload:   (opts) => ipcRenderer.send('run-ia-upload', opts),
  runIaEdit:     (opts) => ipcRenderer.send('run-ia-edit', opts),
  runIaDownload: (opts) => ipcRenderer.send('run-ia-download', opts),
  checkIaAuth: (autoIa) => ipcRenderer.invoke('check-ia-auth', { autoIa }),
  runIaConfigure: (email, password, autoIa) => ipcRenderer.invoke('run-ia-configure', { email, password, autoIa }),
  runIaUnlink: () => ipcRenderer.invoke('run-ia-unlink'),

  // Output listeners
  onLivestreamOutput: (cb) => ipcRenderer.on('livestream-output', (_e, d) => cb(d)),
  onYtdlpOutput:      (cb) => ipcRenderer.on('ytdlp-output',      (_e, d) => cb(d)),
  onBatchOutput:      (cb) => ipcRenderer.on('batch-output',       (_e, d) => cb(d)),
  onM3u8Output:       (cb) => ipcRenderer.on('m3u8-output',        (_e, d) => cb(d)),
  onGalleryDlOutput:  (cb) => ipcRenderer.on('gallery-dl-output',  (_e, d) => cb(d)),
  onSplitterOutput:   (cb) => ipcRenderer.on('splitter-output',    (_e, d) => cb(d)),
  onConcatenatorOutput: (cb) => ipcRenderer.on('concatenator-output', (_e, d) => cb(d)),
  onEncoderOutput:    (cb) => ipcRenderer.on('encoder-output',    (_e, d) => cb(d)),
  onIaOutput:         (cb) => ipcRenderer.on('ia-output',         (_e, d) => cb(d)),

  // Process control
  stopScript:   (pid) => ipcRenderer.send('stop-script',   { pid }),
  pauseScript:  (pid) => ipcRenderer.send('pause-script',  { pid }),
  resumeScript: (pid) => ipcRenderer.send('resume-script', { pid }),

  // Remote server
  startRemoteServer: (port) => ipcRenderer.send('start-remote-server', { port }),
  stopRemoteServer:  () => ipcRenderer.send('stop-remote-server'),

  // Discord Bot
  startDiscordBot: (opts) => ipcRenderer.invoke('start-discord-bot', opts),
  stopDiscordBot:  () => ipcRenderer.invoke('stop-discord-bot'),
  getDiscordBotStatus: () => ipcRenderer.invoke('get-discord-bot-status'),
  syncDiscordCommands: () => ipcRenderer.invoke('sync-discord-commands'),
  onDiscordBotStatus: (cb) => ipcRenderer.on('discord-bot-status', (_e, d) => cb(d)),

  // State synchronization
  syncUiState: (data) => ipcRenderer.send('sync-ui-state', data),
  requestFullState: () => ipcRenderer.send('request-full-state'),
  onSyncUiState: (cb) => ipcRenderer.on('sync-ui-state', (_e, d) => cb(d)),
  onFullState: (cb) => ipcRenderer.on('full-state', (_e, d) => cb(d)),

  // Remove listeners
  removeAllListeners: (channel) => ipcRenderer.removeAllListeners(channel),
  invoke: (channel, data) => ipcRenderer.invoke(channel, data),
  _invokeRaw: (channel, data) => ipcRenderer.invoke(channel, data),
});
