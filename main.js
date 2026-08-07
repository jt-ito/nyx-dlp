// Note: Rebuilding to bypass antivirus false positive on executable
const { app, BrowserWindow, ipcMain, dialog, Tray, Menu } = require('electron');
const path = require('path');
const { spawn, execFile } = require('child_process');
const fs = require('fs');

app.commandLine.appendSwitch('disable-gpu-shader-disk-cache');
app.commandLine.appendSwitch('disable-gpu-cache');

app.setAppUserModelId('nyx-dlp');

// Portable mode: if a .portable file sits next to the exe, store all user data
// in a "data" folder alongside the exe instead of %AppData%.
if (app.isPackaged) {
  const portableMarker = path.join(path.dirname(app.getPath('exe')), '.portable');
  if (fs.existsSync(portableMarker)) {
    const dataDir = path.join(path.dirname(app.getPath('exe')), 'data');
    app.setPath('userData', dataDir);
  }
}

const lastPathFile = path.join(app.getPath('userData'), 'last-used-path.txt');
let lastUsedPath = '';
try {
  if (fs.existsSync(lastPathFile)) {
    lastUsedPath = fs.readFileSync(lastPathFile, 'utf8').trim();
  }
} catch (e) {}

function saveLastPath(p) {
  lastUsedPath = p;
  try { fs.writeFileSync(lastPathFile, p, 'utf8'); } catch (e) {}
}

// In production the Python scripts are placed in resources/scripts/ (extraResources).
// In dev they sit alongside main.js in scripts/.
const scriptsDir = app.isPackaged
  ? path.join(process.resourcesPath, 'scripts')
  : path.join(__dirname, 'scripts');

// Single-instance lock — if another instance tries to open, focus this one instead
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
}

let mainWindow;
const activeProcs = new Map(); // pid → ChildProcess

let tray = null;
let isQuitting = false;
let minimizeToTray = false;

ipcMain.on('set-minimize-to-tray', (e, val) => {
  minimizeToTray = val;
});

function createTray() {
  if (tray) return;
  const trayIcon = process.platform === 'win32' ? 'icon.ico' : 'icon.png';
  tray = new Tray(path.join(__dirname, 'assets', trayIcon));
  const contextMenu = Menu.buildFromTemplate([
    { label: 'Show', click: () => { mainWindow.show(); mainWindow.focus(); } },
    { label: 'Quit', click: () => { isQuitting = true; app.quit(); } }
  ]);
  tray.setToolTip('nyx-dlp');
  tray.setContextMenu(contextMenu);
  tray.on('click', () => { mainWindow.show(); mainWindow.focus(); });
}

function loadWindowState() {
  try {
    const stateFile = path.join(app.getPath('userData'), 'window-state.json');
    if (fs.existsSync(stateFile)) {
      return JSON.parse(fs.readFileSync(stateFile, 'utf-8'));
    }
  } catch (e) {}
  return { width: 1100, height: 750 };
}

function saveWindowState(win) {
  if (!win || win.isDestroyed()) return;
  // Do not save state if maximized or minimized to avoid getting stuck
  if (win.isMaximized() || win.isMinimized()) return;
  
  try {
    const stateFile = path.join(app.getPath('userData'), 'window-state.json');
    fs.writeFileSync(stateFile, JSON.stringify(win.getBounds()), 'utf-8');
  } catch (e) {}
}

function createWindow() {
  const state = loadWindowState();
  
  mainWindow = new BrowserWindow({
    width: state.width || 1100,
    height: state.height || 750,
    x: state.x,
    y: state.y,
    minWidth: 800,
    minHeight: 600,
    frame: false,
    titleBarStyle: 'hidden',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
      preload: path.join(__dirname, 'preload.js')
    },
    icon: path.join(__dirname, 'assets', process.platform === 'win32' ? 'icon.ico' : 'icon.png'),
    backgroundColor: '#0f0f13'
  });

  mainWindow.loadFile('index.html');

  mainWindow.on('close', (e) => {
    saveWindowState(mainWindow);
    if (minimizeToTray && !isQuitting) {
      e.preventDefault();
      mainWindow.hide();
      createTray();
    }
  });
}

app.whenReady().then(() => {
  createWindow();
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      if (!mainWindow.isVisible()) mainWindow.show();
      mainWindow.focus();
    }
  });
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// Window controls
ipcMain.on('window-minimize', () => mainWindow.minimize());
ipcMain.on('window-maximize', () => {
  if (mainWindow.isMaximized()) mainWindow.unmaximize();
  else mainWindow.maximize();
});
ipcMain.on('window-close', () => mainWindow.close());

// Folder picker
ipcMain.handle('pick-folder', async () => {
  mainWindow.focus();
  const result = await dialog.showOpenDialog(mainWindow, {
    defaultPath: lastUsedPath || app.getPath('downloads'),
    properties: ['openDirectory']
  });
  if (!result.canceled && result.filePaths.length > 0) {
    saveLastPath(result.filePaths[0]);
  }
  return result.canceled ? null : result.filePaths[0];
});

// File picker (for cookies.txt)
ipcMain.handle('pick-file', async () => {
  mainWindow.focus();
  const result = await dialog.showOpenDialog(mainWindow, {
    defaultPath: lastUsedPath || app.getPath('downloads'),
    properties: ['openFile'],
    filters: [{ name: 'Cookies / Text', extensions: ['txt', 'cookies'] }, { name: 'All Files', extensions: ['*'] }]
  });
  if (!result.canceled && result.filePaths.length > 0) {
    saveLastPath(path.dirname(result.filePaths[0]));
  }
  return result.canceled ? null : result.filePaths[0];
});

// Video picker (for Splitter)
ipcMain.handle('pick-video', async () => {
  mainWindow.focus();
  const result = await dialog.showOpenDialog(mainWindow, {
    defaultPath: lastUsedPath || app.getPath('downloads'),
    properties: ['openFile'],
    filters: [{ name: 'Video Files', extensions: ['mp4', 'mkv', 'mov', 'avi', 'webm', 'ts', 'flv'] }, { name: 'All Files', extensions: ['*'] }]
  });
  if (!result.canceled && result.filePaths.length > 0) {
    saveLastPath(path.dirname(result.filePaths[0]));
  }
  return result.canceled ? null : result.filePaths[0];
});

// Multi-file picker
ipcMain.handle('pick-files', async () => {
  mainWindow.focus();
  const result = await dialog.showOpenDialog(mainWindow, {
    defaultPath: lastUsedPath || app.getPath('downloads'),
    properties: ['openFile', 'multiSelections'],
    filters: [{ name: 'Video Files', extensions: ['mp4', 'mkv', 'mov', 'avi', 'webm', 'ts', 'flv'] }, { name: 'All Files', extensions: ['*'] }]
  });
  if (!result.canceled && result.filePaths.length > 0) {
    saveLastPath(path.dirname(result.filePaths[0]));
  }
  return result.canceled ? null : result.filePaths;
});

// Multi-file picker (All Files default)
ipcMain.handle('pick-any-files', async () => {
  mainWindow.focus();
  const result = await dialog.showOpenDialog(mainWindow, {
    defaultPath: lastUsedPath || app.getPath('downloads'),
    properties: ['openFile', 'multiSelections'],
    filters: [{ name: 'All Files', extensions: ['*'] }]
  });
  if (!result.canceled && result.filePaths.length > 0) {
    saveLastPath(path.dirname(result.filePaths[0]));
  }
  return result.canceled ? null : result.filePaths;
});

// Multi-folder picker
ipcMain.handle('pick-folders', async () => {
  mainWindow.focus();
  const result = await dialog.showOpenDialog(mainWindow, {
    defaultPath: lastUsedPath || app.getPath('downloads'),
    properties: ['openDirectory', 'multiSelections']
  });
  if (!result.canceled && result.filePaths.length > 0) {
    saveLastPath(path.dirname(result.filePaths[0]));
  }
  return result.canceled ? null : result.filePaths;
});

// Disk space — returns { free, total } in bytes for the drive containing `drivePath`
ipcMain.handle('get-disk-space', async (_e, drivePath) => {
  try {
    const stats = await fs.promises.statfs(drivePath);
    return { free: stats.bfree * stats.bsize, total: stats.blocks * stats.bsize };
  } catch {
    return null;
  }
});

// Notifications
const { Notification } = require('electron');
ipcMain.on('show-notification', (e, { title, body }) => {
  if (Notification.isSupported()) {
    new Notification({ title, body, icon: path.join(__dirname, 'assets', process.platform === 'win32' ? 'icon.ico' : 'icon.png') }).show();
  }
});

// Download History
const historyFile = path.join(app.getPath('userData'), 'history.json');
ipcMain.handle('get-history', async () => {
  try {
    if (fs.existsSync(historyFile)) {
      return JSON.parse(await fs.promises.readFile(historyFile, 'utf8'));
    }
  } catch (e) {}
  return [];
});

ipcMain.handle('add-history', async (e, entry) => {
  try {
    let history = [];
    if (fs.existsSync(historyFile)) {
      try { history = JSON.parse(await fs.promises.readFile(historyFile, 'utf8')); } catch(e){}
    }
    history.unshift(entry);
    if (history.length > 1000) history = history.slice(0, 1000); // keep last 1000
    await fs.promises.writeFile(historyFile, JSON.stringify(history, null, 2));
    return true;
  } catch (e) {
    return false;
  }
});

ipcMain.handle('clear-history', async () => {
  try {
    await fs.promises.writeFile(historyFile, JSON.stringify([]));
    return true;
  } catch (e) {
    return false;
  }
});


// ── Protected-path guard (main process) ──────────────────────────────
function isProtectedPath(p) {
  if (!p) return null;
  const norm = p.replace(/\\/g, '/');

  // Windows: block drive roots and network share roots
  if (/^[A-Za-z]:\/?$/.test(p)) return `Drive root is not allowed: "${p}"`;
  if (/^\/\/[^/]+\/?$/.test(norm) || /^\\\\[^\\]+\\?$/.test(p)) return `Network share root is not allowed: "${p}"`;

  // Linux/macOS: block filesystem root
  if (process.platform !== 'win32' && /^\/?$/.test(norm)) return `Filesystem root is not allowed: "${p}"`;

  const winRoots = [
    /^[A-Za-z]:\/Windows(\/|$)/i,
    /^[A-Za-z]:\/Program Files( \(x86\))?(\/|$)/i,
    /^[A-Za-z]:\/ProgramData(\/|$)/i,
    /^[A-Za-z]:\/System Volume Information(\/|$)/i,
    /^[A-Za-z]:\/Recovery(\/|$)/i,
    /^[A-Za-z]:\/\$Recycle\.Bin(\/|$)/i,
  ];
  const unixRoots = [
    /^\/(bin|sbin|usr|lib|lib64|etc|boot|dev|proc|sys|run)(\/|$)/i,
    /^\/System(\/|$)/i,             // macOS
    /^\/Library(\/|$)/i,            // macOS
    /^\/Applications(\/|$)/i,       // macOS
    /^\/private\/(etc|var)(\/|$)/i,  // macOS
  ];

  const sysRoots = process.platform === 'win32' ? winRoots : unixRoots;
  for (const re of sysRoots) if (re.test(norm)) return `System directory is not allowed: "${p}"`;
  return null;
}

function broadcastIPC(channel, data) {
  BrowserWindow.getAllWindows().forEach(w => {
    if (w && !w.isDestroyed()) w.webContents.send(channel, data);
  });
  const remoteServer = require('./server.js');
  if (remoteServer.broadcast) {
    remoteServer.broadcast(channel, data);
  }
}

const runners = require('./lib/runners.js');

const activeDownloads = new Set();
const notifiedDrives = new Set();
let diskCheckInterval = null;

function startDiskCheck() {
  if (diskCheckInterval) return;
  diskCheckInterval = setInterval(async () => {
    if (activeDownloads.size === 0) {
      clearInterval(diskCheckInterval);
      diskCheckInterval = null;
      return;
    }
    const ntfStorageEnabled = fullUiState['ntf-storage'] ? fullUiState['ntf-storage'].checked : true;
    if (!ntfStorageEnabled) return;
    const thresholdGB = fullUiState['ntf-storage-threshold'] ? parseFloat(fullUiState['ntf-storage-threshold'].value) : 20;
    if (isNaN(thresholdGB)) return;
    const thresholdBytes = thresholdGB * 1024 * 1024 * 1024;

    for (const dir of activeDownloads) {
      try {
        const stats = await fs.promises.statfs(dir);
        const free = stats.bfree * stats.bsize;
        if (free < thresholdBytes) {
          if (!notifiedDrives.has(dir)) {
            notifiedDrives.add(dir);
            if (Notification.isSupported()) {
              new Notification({
                title: 'Low Storage Space',
                body: `The drive containing "${path.basename(dir)}" has less than ${thresholdGB}GB free space remaining.`,
                icon: path.join(__dirname, 'assets', process.platform === 'win32' ? 'icon.ico' : 'icon.png')
              }).show();
            }
          }
        } else {
          notifiedDrives.delete(dir);
        }
      } catch (e) {}
    }
  }, 15000); // check every 15 seconds
}

function getFfmpegSettings() {
  const installFfmpeg = fullUiState['dep-install-ffmpeg'] ? fullUiState['dep-install-ffmpeg'].checked : true;
  const ffmpegVersion = fullUiState['dep-ffmpeg-version'] ? fullUiState['dep-ffmpeg-version'].value : 'auto';
  return { installFfmpeg, ffmpegVersion };
}

function prepareRunner(opts, channel, runnerFn) {
  console.log(`[DEBUG prepareRunner] called for channel=${channel}, outputDir=${opts.outputDir}`);
  const originalBroadcast = (data) => broadcastIPC(channel, data);
  const broadcast = (data) => {
    originalBroadcast(data);
    if (data && data.type === 'exit' && opts.outputDir) {
      activeDownloads.delete(opts.outputDir);
    }
  };

  try {
    if (opts.outputDir) {
      activeDownloads.add(opts.outputDir);
      startDiskCheck();
      
      const pathErr = isProtectedPath(opts.outputDir);
      console.log(`[DEBUG prepareRunner] isProtectedPath result:`, pathErr);
      if (pathErr) {
        broadcast({ type: 'error', text: pathErr });
        broadcast({ type: 'exit', code: 1 });
        return;
      }
      try {
        fs.mkdirSync(opts.outputDir, { recursive: true });
      } catch (err) {
        broadcast({ type: 'error', text: `Cannot create output directory: ${err.message}` });
        broadcast({ type: 'exit', code: 1 });
        return;
      }
    }
    console.log(`[DEBUG prepareRunner] calling getFfmpegSettings`);
    Object.assign(opts, getFfmpegSettings());
    console.log(`[DEBUG prepareRunner] calling runnerFn, installFfmpeg=${opts.installFfmpeg}`);
    runnerFn(opts, broadcast).catch(e => {
      console.error(`[DEBUG prepareRunner] runnerFn rejected:`, e);
      broadcast({ type: 'error', text: e.message });
      broadcast({ type: 'exit', code: 1 });
    });
    console.log(`[DEBUG prepareRunner] runnerFn started (async)`);
  } catch (e) {
    console.error(`[DEBUG prepareRunner] SYNC ERROR:`, e);
    broadcast({ type: 'error', text: e.message });
    broadcast({ type: 'exit', code: 1 });
  }
}

// ── Stop / Pause / Resume ────────────────────────────────────────────────────
ipcMain.on('stop-script', (event, { pid }) => runners.stopProc(pid));
ipcMain.on('pause-script',  (event, { pid }) => runners.pauseProc(pid));
ipcMain.on('resume-script', (event, { pid }) => runners.resumeProc(pid));

// ── Tool 1: YouTube Live Stream Archiver ──────────────────────────────────────
ipcMain.on('run-livestream', (event, opts) => prepareRunner(opts, 'livestream-output', runners.runLivestream));

// ── Tool 2: yt-dlp Single Download ───────────────────────────────────────────
ipcMain.on('run-ytdlp', (event, opts) => prepareRunner(opts, 'ytdlp-output', runners.runYtdlp));

// ── Tool: Internet Archive ────────────────────────────────────────────────────
ipcMain.on('run-ia-upload', (event, opts) => prepareRunner(opts, 'ia-output', runners.runIaUpload));
ipcMain.on('run-ia-edit', (event, opts) => prepareRunner(opts, 'ia-output', runners.runIaEdit));
ipcMain.on('run-ia-download', (event, opts) => prepareRunner(opts, 'ia-output', runners.runIaDownload));
ipcMain.handle('check-ia-auth', async (event, { autoIa } = {}) => await runners.checkIaAuth(autoIa));
ipcMain.handle('run-ia-configure', async (event, { email, password, autoIa }) => await runners.runIaConfigure(email, password, autoIa));

ipcMain.handle('run-ia-unlink', async () => {
  runners.unlinkIa();
  return true;
});

// ── Tool 3: Batch Downloader ──────────────────────────────────────────────────
ipcMain.on('run-batch', (event, opts) => prepareRunner(opts, 'batch-output', runners.runBatch));
ipcMain.on('append-batch-queue', (event, { outputDir, newUrls }) => {
  try {
    fs.appendFileSync(path.join(outputDir, 'queue_additions.txt'), newUrls.join('\n') + '\n', 'utf-8');
  } catch (err) {}
});
ipcMain.on('set-batch-rest', (event, { outputDir, val }) => {
  try {
    fs.writeFileSync(path.join(outputDir, 'rest_state.txt'), String(val), 'utf-8');
  } catch (err) {}
});
ipcMain.on('skip-batch-rest', (event, { outputDir }) => {
  try {
    fs.writeFileSync(path.join(outputDir, 'skip_rest.txt'), '1', 'utf-8');
  } catch (err) {}
});

// ── Tool 4: M3U8 Downloader/Encoder ──────────────────────────────────────────
ipcMain.on('run-m3u8', (event, opts) => prepareRunner(opts, 'm3u8-output', runners.runM3u8));

// ── Tool 5: gallery-dl ────────────────────────────────────────────────────────────
ipcMain.on('run-gallery-dl', (event, opts) => prepareRunner(opts, 'gallery-dl-output', runners.runGalleryDl));

// ── Tool 6: Video Splitter ──────────────────────────────────────────────────────────
ipcMain.on('run-splitter', (event, opts) => prepareRunner(opts, 'splitter-output', runners.runSplitter));

// ── Tool 7: Video Concatenator ──────────────────────────────────────────────────────
ipcMain.on('run-concatenator', (event, opts) => prepareRunner(opts, 'concatenator-output', runners.runConcatenator));

// ── Tool 8: Video Encoder ───────────────────────────────────────────────────────────
ipcMain.on('run-encoder', (event, opts) => prepareRunner(opts, 'encoder-output', runners.runEncoder));


// ── Remote Server ────────────────────────────────────────────────────────────
const remoteServer = require('./server.js');

ipcMain.on('start-remote-server', (event, options) => {
  try {
    remoteServer.startServer(options, __dirname);
  } catch (e) {
    console.error('Failed to start remote server:', e);
  }
});

ipcMain.on('stop-remote-server', () => {
  remoteServer.stopServer();
});

// ── State Synchronization ──────────────────────────────────────────────────
let fullUiState = {};

ipcMain.on('sync-ui-state', (event, data) => {
  if (data && data.id) {
    if (data.type === 'checkbox') fullUiState[data.id] = { type: data.type, checked: data.checked };
    else fullUiState[data.id] = { type: data.type, value: data.value };
  }
  broadcastIPC('sync-ui-state', data);
});

ipcMain.on('request-full-state', (event) => {
  event.sender.send('full-state', fullUiState);
});