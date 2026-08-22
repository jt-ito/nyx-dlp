const { app, BrowserWindow, ipcMain, dialog, Tray, Menu, shell } = require('electron');
const path = require('path');
const { spawn, execFile } = require('child_process');
const fs = require('fs');
const os = require('os');
const https = require('https');

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

// ── App Settings (Cold-start settings persistence) ───────────
const appSettingsFile = path.join(app.getPath('userData'), 'app-settings.json');

function loadAppSettings() {
  try {
    if (fs.existsSync(appSettingsFile)) {
      return JSON.parse(fs.readFileSync(appSettingsFile, 'utf8'));
    }
  } catch (e) {
    console.error('Failed to load app-settings.json:', e);
  }
  return {
    runOnStartup: false,
    startMinimized: false,
    minimizeToTray: false,
    autoUpdate: false,
    discordEnabled: false,
    discordToken: '',
    discordClientId: '',
    discordDownloadDir: '',
  };
}

function saveAppSettings(newSettings) {
  try {
    const current = loadAppSettings();
    const updated = Object.assign(current, newSettings);
    fs.writeFileSync(appSettingsFile, JSON.stringify(updated, null, 2), 'utf8');
    return updated;
  } catch (e) {
    console.error('Failed to save app-settings.json:', e);
  }
}

// ── GitHub Releases / Auto-Update Checker ────────────────────
function isNewerVersion(latest, current) {
  const clean = (v) => (v || '').replace(/^v/i, '').trim();
  const lParts = clean(latest).split('.').map(n => parseInt(n) || 0);
  const cParts = clean(current).split('.').map(n => parseInt(n) || 0);
  for (let i = 0; i < Math.max(lParts.length, cParts.length); i++) {
    const l = lParts[i] || 0;
    const c = cParts[i] || 0;
    if (l > c) return true;
    if (l < c) return false;
  }
  return false;
}

function checkGitHubRelease() {
  return new Promise((resolve, reject) => {
    const currentVersion = app.getVersion() || require('./package.json').version;
    const options = {
      hostname: 'api.github.com',
      path: '/repos/jt-ito/nyx-dlp/releases/latest',
      headers: {
        'User-Agent': 'nyx-dlp-app/' + currentVersion,
        'Accept': 'application/vnd.github.v3+json'
      },
      timeout: 10000
    };

    const handleResponse = (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        return https.get(res.headers.location, { headers: options.headers }, handleResponse).on('error', reject);
      }
      if (res.statusCode !== 200) {
        return reject(new Error(`GitHub API returned status ${res.statusCode}`));
      }
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const release = JSON.parse(data);
          const latestTag = release.tag_name || release.name || '';
          const hasUpdate = isNewerVersion(latestTag, currentVersion);
          
          const assets = release.assets || [];
          let matchedAsset = null;
          if (process.platform === 'win32') {
            const isPortable = fs.existsSync(path.join(path.dirname(app.getPath('exe')), '.portable'));
            if (isPortable) {
              matchedAsset = assets.find(a => a.name.endsWith('-portable.zip')) || assets.find(a => a.name.endsWith('.zip'));
            } else {
              matchedAsset = assets.find(a => a.name.endsWith('-setup.exe')) || assets.find(a => a.name.endsWith('.exe'));
            }
          } else if (process.platform === 'darwin') {
            matchedAsset = assets.find(a => a.name.endsWith('-macos.dmg')) || assets.find(a => a.name.endsWith('.dmg'));
          } else if (process.platform === 'linux') {
            matchedAsset = assets.find(a => a.name.endsWith('-linux.AppImage')) || assets.find(a => a.name.endsWith('.AppImage'));
          }

          resolve({
            hasUpdate,
            currentVersion,
            latestVersion: latestTag.replace(/^v/i, ''),
            releaseTag: latestTag,
            releaseName: release.name || latestTag,
            releaseUrl: release.html_url || 'https://github.com/jt-ito/nyx-dlp/releases',
            releaseNotes: release.body || '',
            publishedAt: release.published_at,
            assetName: matchedAsset ? matchedAsset.name : null,
            downloadUrl: matchedAsset ? matchedAsset.browser_download_url : null,
            assetSize: matchedAsset ? matchedAsset.size : null
          });
        } catch (e) {
          reject(e);
        }
      });
    };

    const req = https.get(options, handleResponse);
    req.on('timeout', () => { req.destroy(); reject(new Error('Update check request timed out')); });
    req.on('error', reject);
  });
}

// ── Cross-Platform Autostart (Linux, Windows, macOS) ─────────
function configureAutostart(enable, startMinimized) {
  const isPackaged = app.isPackaged;
  const isMac = process.platform === 'darwin';
  const isWin = process.platform === 'win32';
  const isLinux = process.platform === 'linux';

  // 1. Electron login item settings (Windows & macOS)
  try {
    if (isWin || isMac) {
      if (isPackaged) {
        app.setLoginItemSettings({
          openAtLogin: !!enable,
          openAsHidden: !!startMinimized,
          args: startMinimized ? ['--minimized'] : []
        });
      } else {
        app.setLoginItemSettings({
          openAtLogin: !!enable,
          openAsHidden: !!startMinimized,
          path: process.execPath,
          args: [path.resolve(__dirname), ...(startMinimized ? ['--minimized'] : [])]
        });
      }
    }
  } catch (err) {
    console.error('Failed to configure login item settings:', err);
  }

  // 2. Linux XDG Autostart Desktop entry (.desktop file)
  if (isLinux) {
    try {
      const autostartDir = process.env.XDG_CONFIG_HOME
        ? path.join(process.env.XDG_CONFIG_HOME, 'autostart')
        : path.join(os.homedir(), '.config', 'autostart');
      const desktopFilePath = path.join(autostartDir, 'nyx-dlp.desktop');

      if (enable) {
        if (!fs.existsSync(autostartDir)) {
          fs.mkdirSync(autostartDir, { recursive: true });
        }
        const execTarget = process.env.APPIMAGE || (isPackaged ? process.execPath : `"${process.execPath}" "${path.resolve(__dirname)}"`);
        const argsStr = startMinimized ? ' --minimized' : '';
        const iconPath = path.join(__dirname, 'assets', 'icon.png');

        const desktopContent = [
          '[Desktop Entry]',
          'Type=Application',
          'Version=1.0',
          'Name=nyx-dlp',
          'Comment=Modern Electron GUI for yt-dlp, gallery-dl, and media tools',
          `Exec=${execTarget}${argsStr}`,
          `Icon=${fs.existsSync(iconPath) ? iconPath : 'nyx-dlp'}`,
          'Terminal=false',
          'StartupNotify=false',
          'Categories=AudioVideo;Utility;',
          'X-GNOME-Autostart-enabled=true'
        ].join('\n') + '\n';

        fs.writeFileSync(desktopFilePath, desktopContent, 'utf8');
      } else {
        if (fs.existsSync(desktopFilePath)) {
          fs.unlinkSync(desktopFilePath);
        }
      }
      try {
        app.setLoginItemSettings({
          openAtLogin: !!enable,
          openAsHidden: !!startMinimized,
          args: startMinimized ? ['--minimized'] : []
        });
      } catch (_) {}
    } catch (err) {
      console.error('Failed to configure Linux autostart desktop entry:', err);
    }
  }
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
  minimizeToTray = !!val;
  saveAppSettings({ minimizeToTray: !!val });
});

ipcMain.on('set-run-on-startup', (e, val) => {
  const settings = saveAppSettings({ runOnStartup: !!val });
  configureAutostart(!!val, !!settings?.startMinimized);
});

ipcMain.on('set-start-minimized', (e, val) => {
  const settings = saveAppSettings({ startMinimized: !!val });
  configureAutostart(!!settings?.runOnStartup, !!val);
});

ipcMain.on('set-auto-update', (e, val) => {
  saveAppSettings({ autoUpdate: !!val });
});

function downloadAppUpdateFile(url, assetName, onProgress) {
  const updatesDir = path.join(app.getPath('userData'), 'updates');
  if (!fs.existsSync(updatesDir)) fs.mkdirSync(updatesDir, { recursive: true });
  const targetPath = path.join(updatesDir, assetName || 'nyx-dlp-update');

  return new Promise((resolve, reject) => {
    const download = (targetUrl, redirects = 5) => {
      if (redirects < 0) return reject(new Error('Too many redirects while downloading update'));
      const req = https.get(targetUrl, {
        headers: { 'User-Agent': 'nyx-dlp-app/' + (app.getVersion() || '4.0.1') }
      }, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          return download(res.headers.location, redirects - 1);
        }
        if (res.statusCode !== 200) {
          return reject(new Error(`Update download failed with status ${res.statusCode}`));
        }

        const totalBytes = parseInt(res.headers['content-length'] || '0', 10);
        let downloadedBytes = 0;
        const fileStream = fs.createWriteStream(targetPath);

        res.on('data', (chunk) => {
          downloadedBytes += chunk.length;
          const percent = totalBytes > 0 ? Math.round((downloadedBytes / totalBytes) * 100) : 0;
          if (onProgress) onProgress({ percent, downloadedBytes, totalBytes, status: 'downloading' });
        });

        fileStream.on('finish', () => {
          fileStream.close(() => {
            if (onProgress) onProgress({ percent: 100, downloadedBytes: totalBytes, totalBytes, status: 'complete' });
            resolve({ filePath: targetPath, assetName });
          });
        });

        fileStream.on('error', (err) => {
          try { fs.unlinkSync(targetPath); } catch (_) {}
          reject(err);
        });

        res.pipe(fileStream);
      });

      req.on('error', (err) => {
        try { fs.unlinkSync(targetPath); } catch (_) {}
        reject(err);
      });
      req.on('timeout', () => {
        req.destroy();
        reject(new Error('Update download request timed out'));
      });
    };

    download(url);
  });
}

ipcMain.handle('download-app-update', async (e, opts) => {
  const downloadUrl = opts?.downloadUrl;
  const assetName = opts?.assetName || 'nyx-dlp-update';
  if (!downloadUrl) throw new Error('No update download URL found');

  const result = await downloadAppUpdateFile(downloadUrl, assetName, (progress) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('app-update-progress', progress);
    }
  });

  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('app-update-downloaded', {
      filePath: result.filePath,
      assetName: result.assetName
    });
  }
  return result;
});

ipcMain.on('install-app-update', (e, filePath) => {
  if (!filePath || !fs.existsSync(filePath)) {
    console.error('[Auto-Update] Installer file not found:', filePath);
    return;
  }
  const isWin = process.platform === 'win32';
  const isMac = process.platform === 'darwin';
  const isLinux = process.platform === 'linux';

  try {
    if (isWin) {
      if (filePath.endsWith('.exe')) {
        const child = spawn(filePath, [], { detached: true, stdio: 'ignore' });
        child.unref();
        isQuitting = true;
        app.quit();
        return;
      } else {
        shell.showItemInFolder(filePath);
      }
    } else if (isMac) {
      shell.openPath(filePath);
    } else if (isLinux) {
      if (filePath.endsWith('.AppImage')) {
        try { fs.chmodSync(filePath, 0o755); } catch (_) {}
        const child = spawn(filePath, [], { detached: true, stdio: 'ignore' });
        child.unref();
        isQuitting = true;
        app.quit();
        return;
      } else {
        shell.showItemInFolder(filePath);
      }
    }
  } catch (err) {
    console.error('[Auto-Update] Failed to install update:', err);
    shell.openPath(path.dirname(filePath));
  }
});

ipcMain.handle('check-for-updates', async () => {
  try {
    return await checkGitHubRelease();
  } catch (err) {
    return {
      hasUpdate: false,
      currentVersion: app.getVersion() || require('./package.json').version,
      error: err.message
    };
  }
});

ipcMain.on('open-external', (e, url) => {
  if (url && (typeof url === 'string') && (url.startsWith('https://') || url.startsWith('http://'))) {
    shell.openExternal(url);
  }
});

function createTray() {
  if (tray) return;
  const trayIcon = process.platform === 'win32' ? 'icon.ico' : 'icon.png';
  tray = new Tray(path.join(__dirname, 'assets', trayIcon));
  const contextMenu = Menu.buildFromTemplate([
    { 
      label: 'Open nyx-dlp', 
      click: () => { 
        if (mainWindow) {
          if (mainWindow.isMinimized()) mainWindow.restore();
          mainWindow.show(); 
          mainWindow.focus(); 
        }
      } 
    },
    { type: 'separator' },
    { 
      label: 'Quit', 
      click: () => { 
        isQuitting = true; 
        app.quit(); 
      } 
    }
  ]);
  tray.setToolTip('nyx-dlp');
  tray.setContextMenu(contextMenu);
  tray.on('click', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      if (!mainWindow.isVisible()) mainWindow.show();
      mainWindow.focus();
    }
  });
  tray.on('double-click', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      if (!mainWindow.isVisible()) mainWindow.show();
      mainWindow.focus();
    }
  });
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
  const appSettings = loadAppSettings();
  minimizeToTray = !!appSettings.minimizeToTray;

  const isArgvMinimized = process.argv.includes('--minimized') || process.argv.includes('--hidden');
  let wasOpenedAsHidden = false;
  try {
    if (process.platform === 'darwin') {
      wasOpenedAsHidden = app.getLoginItemSettings().wasOpenedAsHidden;
    }
  } catch (e) {}

  const launchMinimized = isArgvMinimized || wasOpenedAsHidden || !!appSettings.startMinimized;

  mainWindow = new BrowserWindow({
    width: state.width || 1100,
    height: state.height || 750,
    x: state.x,
    y: state.y,
    minWidth: 800,
    minHeight: 600,
    show: false,
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

  mainWindow.once('ready-to-show', () => {
    if (launchMinimized) {
      mainWindow.hide();
      createTray();
    } else {
      mainWindow.show();
    }
  });

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
  const appSettings = loadAppSettings();
  if (appSettings.runOnStartup) {
    configureAutostart(true, appSettings.startMinimized);
  }
  createWindow();

  // Background auto-update check / auto-download on startup (delayed 3s)
  setTimeout(async () => {
    try {
      const updateInfo = await checkGitHubRelease();
      if (updateInfo && updateInfo.hasUpdate) {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('update-available', updateInfo);
        }
        if (appSettings.autoUpdate && updateInfo.downloadUrl) {
          console.log('[Auto-Update] Auto-downloading update in background:', updateInfo.assetName);
          const dlRes = await downloadAppUpdateFile(updateInfo.downloadUrl, updateInfo.assetName, (progress) => {
            if (mainWindow && !mainWindow.isDestroyed()) {
              mainWindow.webContents.send('app-update-progress', progress);
            }
          });
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('app-update-downloaded', {
              filePath: dlRes.filePath,
              assetName: dlRes.assetName,
              version: updateInfo.latestVersion
            });
          }
        }
      }
    } catch (err) {
      console.log('[Auto-Update] Startup check skipped or offline:', err.message);
    }
  }, 3000);

  // Auto-connect Discord bot on startup if configured (delayed 4s)
  if (appSettings.discordEnabled && appSettings.discordToken) {
    setTimeout(async () => {
      try {
        await discordBot.start({
          token: appSettings.discordToken,
          clientId: appSettings.discordClientId,
          downloadDir: appSettings.discordDownloadDir
        });
      } catch (err) {
        console.error('[Discord Bot] Startup auto-connect failed:', err.message);
      }
    }, 4000);
  }

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

app.on('will-quit', () => {
  try {
    discordBot.stop();
  } catch (e) {}
  try {
    if (runners && typeof runners.stopAll === 'function') {
      runners.stopAll();
    }
  } catch (e) {}
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

// Save text file
ipcMain.handle('save-text-file', async (_e, { defaultName, content }) => {
  mainWindow.focus();
  const result = await dialog.showSaveDialog(mainWindow, {
    defaultPath: path.join(lastUsedPath || app.getPath('downloads'), defaultName || 'durations.txt'),
    filters: [{ name: 'Text Files', extensions: ['txt'] }, { name: 'All Files', extensions: ['*'] }]
  });
  if (!result.canceled && result.filePath) {
    saveLastPath(path.dirname(result.filePath));
    await fs.promises.writeFile(result.filePath, content, 'utf-8');
    return result.filePath;
  }
  return null;
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

ipcMain.handle('delete-history-item', async (e, idOrDate) => {
  try {
    if (fs.existsSync(historyFile)) {
      let history = JSON.parse(await fs.promises.readFile(historyFile, 'utf8'));
      if (typeof idOrDate === 'string') {
        history = history.filter(item => item.id !== idOrDate && item.date !== idOrDate);
      } else if (typeof idOrDate === 'number') {
        history.splice(idOrDate, 1);
      }
      await fs.promises.writeFile(historyFile, JSON.stringify(history, null, 2));
      return true;
    }
  } catch (e) {}
  return false;
});

const remoteServerModule = require('./server.js');
ipcMain.handle('fs-browse', async (_e, opts) => {
  return remoteServerModule.handleFsBrowse(opts);
});
ipcMain.handle('fs-create-folder', async (_e, opts) => {
  return remoteServerModule.handleFsCreateFolder(opts);
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

// ── Discord Bot Integration ───────────────────────────────────────────────
const discordBot = require('./lib/discord-bot.js');
discordBot.onStatusChange((statusObj) => {
  broadcastIPC('discord-bot-status', statusObj);
});

ipcMain.handle('start-discord-bot', async (event, opts) => {
  try {
    saveAppSettings({
      discordEnabled: true,
      discordToken: opts.token || '',
      discordClientId: opts.clientId || '',
      discordDownloadDir: opts.downloadDir || ''
    });
    settingsStore.updateSetting('discord-download-dir', opts.downloadDir || '');
    await discordBot.start(opts);
    return discordBot.getStatus();
  } catch (err) {
    return { status: 'error', error: err.message };
  }
});

ipcMain.handle('stop-discord-bot', async () => {
  saveAppSettings({ discordEnabled: false });
  discordBot.stop();
  return discordBot.getStatus();
});

ipcMain.handle('get-discord-bot-status', async () => {
  const current = loadAppSettings();
  const status = discordBot.getStatus();
  return {
    ...status,
    savedToken: current.discordToken || '',
    savedClientId: current.discordClientId || '',
    savedDownloadDir: current.discordDownloadDir || '',
    savedEnabled: !!current.discordEnabled
  };
});

ipcMain.handle('sync-discord-commands', async () => {
  try {
    await discordBot.registerSlashCommands();
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// ── State Synchronization ──────────────────────────────────────────────────
const settingsStore = require('./lib/settings-store.js');
let fullUiState = settingsStore.loadAllSettings();

ipcMain.on('sync-ui-state', (event, data) => {
  if (data && data.id) {
    if (data.type === 'checkbox') fullUiState[data.id] = { type: data.type, checked: data.checked };
    else fullUiState[data.id] = { type: data.type, value: data.value };
    settingsStore.updateSetting(data.id, fullUiState[data.id]);
  }
  broadcastIPC('sync-ui-state', data);
});

ipcMain.on('request-full-state', (event) => {
  event.sender.send('full-state', settingsStore.loadAllSettings());
});