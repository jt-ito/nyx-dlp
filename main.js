const { app, BrowserWindow, ipcMain, dialog, Tray, Menu } = require('electron');
const path = require('path');
const { spawn, execFile } = require('child_process');
const fs = require('fs');

app.commandLine.appendSwitch('disable-gpu-shader-disk-cache');
app.commandLine.appendSwitch('disable-gpu-cache');

// Portable mode: if a .portable file sits next to the exe, store all user data
// in a "data" folder alongside the exe instead of %AppData%.
if (app.isPackaged) {
  const portableMarker = path.join(path.dirname(app.getPath('exe')), '.portable');
  if (fs.existsSync(portableMarker)) {
    const dataDir = path.join(path.dirname(app.getPath('exe')), 'data');
    app.setPath('userData', dataDir);
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
  minimizeToTray = val;
});

function createTray() {
  if (tray) return;
  tray = new Tray(path.join(__dirname, 'assets', 'icon.ico'));
  const contextMenu = Menu.buildFromTemplate([
    { label: 'Show', click: () => { mainWindow.show(); mainWindow.focus(); } },
    { label: 'Quit', click: () => { isQuitting = true; app.quit(); } }
  ]);
  tray.setToolTip('nyx-dlp');
  tray.setContextMenu(contextMenu);
  tray.on('click', () => { mainWindow.show(); mainWindow.focus(); });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1100,
    height: 750,
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
    icon: path.join(__dirname, 'assets', 'icon.ico'),
    backgroundColor: '#0f0f13'
  });

  mainWindow.loadFile('index.html');

  mainWindow.on('close', (e) => {
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
    properties: ['openDirectory']
  });
  return result.canceled ? null : result.filePaths[0];
});

// File picker (for cookies.txt)
ipcMain.handle('pick-file', async () => {
  mainWindow.focus();
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    filters: [{ name: 'Cookies / Text', extensions: ['txt', 'cookies'] }, { name: 'All Files', extensions: ['*'] }]
  });
  return result.canceled ? null : result.filePaths[0];
});

// Video picker (for Splitter)
ipcMain.handle('pick-video', async () => {
  mainWindow.focus();
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    filters: [{ name: 'Video Files', extensions: ['mp4', 'mkv', 'mov', 'avi', 'webm', 'ts', 'flv'] }, { name: 'All Files', extensions: ['*'] }]
  });
  return result.canceled ? null : result.filePaths[0];
});

// Multi-file picker
ipcMain.handle('pick-files', async () => {
  mainWindow.focus();
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile', 'multiSelections'],
    filters: [{ name: 'Video Files', extensions: ['mp4', 'mkv', 'mov', 'avi', 'webm', 'ts', 'flv'] }, { name: 'All Files', extensions: ['*'] }]
  });
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

// ── Protected-path guard (main process) ──────────────────────────────
function isProtectedPath(p) {
  if (!p) return null;
  const norm = p.replace(/\\/g, '/');
  if (/^[A-Za-z]:\/?$/.test(p)) return `Drive root is not allowed: "${p}"`;
  if (/^\/\/[^/]+\/?$/.test(norm) || /^\\\\[^\\]+\\?$/.test(p)) return `Network share root is not allowed: "${p}"`;
  const sysRoots = [
    /^[A-Za-z]:\/Windows(\/|$)/i,
    /^[A-Za-z]:\/Program Files( \(x86\))?(\/|$)/i,
    /^[A-Za-z]:\/ProgramData(\/|$)/i,
    /^[A-Za-z]:\/System Volume Information(\/|$)/i,
    /^[A-Za-z]:\/Recovery(\/|$)/i,
    /^[A-Za-z]:\/\$Recycle\.Bin(\/|$)/i,
  ];
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

// Script runner — passes argv args, optionally pipes stdin, sets cwd, streams output
function runScript(event, replyChannel, scriptPath, { cwd, args = [], stdinLines = [], env = {} }) {
  const pythonCmd = process.platform === 'win32' ? 'python' : 'python3';

  // Reject protected output directories before touching the filesystem
  const pathErr = isProtectedPath(cwd);
  if (pathErr) {
    broadcastIPC(replyChannel, { type: 'error', text: pathErr });
    broadcastIPC(replyChannel, { type: 'exit', code: 1 });
    return null;
  }

  // Ensure output directory exists
  try {
    fs.mkdirSync(cwd, { recursive: true });
  } catch (err) {
    broadcastIPC(replyChannel, { type: 'error', text: `Cannot create output directory: ${err.message}` });
    broadcastIPC(replyChannel, { type: 'exit', code: 1 });
    return null;
  }

  const proc = spawn(pythonCmd, ['-u', scriptPath, ...args], {
    cwd,
    stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env, PYTHONUNBUFFERED: '1', PYTHONIOENCODING: 'utf-8', ...env }
  });

  broadcastIPC(replyChannel, { type: 'pid', pid: proc.pid });

  activeProcs.set(proc.pid, proc);

  // Feed any required stdin lines, then close stdin
  for (const line of stdinLines) {
    proc.stdin.write(line + '\n');
  }
  proc.stdin.end();

  proc.stdout.on('data', (data) => {
    broadcastIPC(replyChannel, { type: 'stdout', text: data.toString() });
  });
  proc.stderr.on('data', (data) => {
    broadcastIPC(replyChannel, { type: 'stderr', text: data.toString() });
  });
  proc.on('close', (code) => {
    activeProcs.delete(proc.pid);
    broadcastIPC(replyChannel, { type: 'exit', code });
  });
  proc.on('error', (err) => {
    broadcastIPC(replyChannel, { type: 'error', text: err.message });
  });

  return proc.pid;
}

// ── Stop / Pause / Resume ────────────────────────────────────────────────────
ipcMain.on('stop-script', (event, { pid }) => {
  if (process.platform === 'win32') {
    execFile('taskkill', ['/pid', String(pid), '/T', '/F']);
  } else {
    const proc = activeProcs.get(pid);
    if (proc) proc.kill('SIGTERM');
  }
});

function suspendResumeTree(rootPid, action) {
  if (process.platform !== 'win32') {
    try { process.kill(rootPid, action === 'suspend' ? 'SIGSTOP' : 'SIGCONT'); } catch (_) {}
    return;
  }
  const pythonScript = `
import ctypes

def get_children(pid):
    kernel32 = ctypes.windll.kernel32
    TH32CS_SNAPPROCESS = 2
    class PROCESSENTRY32(ctypes.Structure):
        _fields_ = [("dwSize", ctypes.c_uint32), ("cntUsage", ctypes.c_uint32), ("th32ProcessID", ctypes.c_uint32),
                    ("th32DefaultHeapID", ctypes.c_size_t), ("th32ModuleID", ctypes.c_uint32), ("cntThreads", ctypes.c_uint32),
                    ("th32ParentProcessID", ctypes.c_uint32), ("pcPriClassBase", ctypes.c_long), ("dwFlags", ctypes.c_uint32),
                    ("szExeFile", ctypes.c_char * 260)]
    hProcessSnap = kernel32.CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0)
    pe32 = PROCESSENTRY32()
    pe32.dwSize = ctypes.sizeof(PROCESSENTRY32)
    children = []
    if kernel32.Process32First(hProcessSnap, ctypes.byref(pe32)):
        while True:
            if pe32.th32ParentProcessID == pid:
                children.append(pe32.th32ProcessID)
            if not kernel32.Process32Next(hProcessSnap, ctypes.byref(pe32)):
                break
    kernel32.CloseHandle(hProcessSnap)
    return children

def get_tree(pid):
    tree = [pid]
    for c in get_children(pid):
        tree.extend(get_tree(c))
    return tree

action = "${action}"
pid = ${rootPid}
ntdll = ctypes.windll.ntdll
kernel32 = ctypes.windll.kernel32
PROCESS_SUSPEND_RESUME = 0x0800

for p in get_tree(pid):
    h = kernel32.OpenProcess(PROCESS_SUSPEND_RESUME, False, p)
    if h:
        if action == "suspend":
            ntdll.NtSuspendProcess(h)
        else:
            ntdll.NtResumeProcess(h)
        kernel32.CloseHandle(h)
  `;
  execFile('python', ['-c', pythonScript], (err) => {
    if (err) console.error('Suspend/resume failed:', err);
  });
}

ipcMain.on('pause-script',  (event, { pid }) => suspendResumeTree(pid, 'suspend'));
ipcMain.on('resume-script', (event, { pid }) => suspendResumeTree(pid, 'resume'));

// ── Tool 1: YouTube Live Stream Archiver ──────────────────────────────────────
// yt-archiver.py: sys.argv[1]=url  sys.argv[2]=format  sys.argv[3]=cookiesPath  sys.argv[4]=container  sys.argv[5]=bgutilUrl  sys.argv[6]=useDeno  sys.argv[7]=client  sys.argv[8]=fromStart  sys.argv[9]=concurrent
ipcMain.on('run-livestream', (event, { url, outputDir, format, cookiesPath, container, client, fromStart, concurrent, bgutilUrl, useDeno, installFfmpeg }) => {
  const scriptPath = path.join(scriptsDir, 'yt-archiver.py');
  runScript(event, 'livestream-output', scriptPath, {
    cwd: outputDir,
    args: [url, format, cookiesPath || '', container || 'mp4', bgutilUrl || 'local', useDeno || 'n', client || 'default', fromStart || 'y', concurrent || '5'],
    env: { AUTO_INSTALL_FFMPEG: installFfmpeg ? '1' : '0' }
  });
});

// ── Tool 2: yt-dlp Single Download ───────────────────────────────────────────
// yt-dlp.py: sys.argv[1]=url  sys.argv[2]=format  sys.argv[3]=cookiesPath  sys.argv[4]=extraArgsJSON  sys.argv[5]=container  sys.argv[6]=startTime  sys.argv[7]=endTime
ipcMain.on('run-ytdlp', (event, { url, outputDir, format, cookiesPath, extraArgs, container, startTime, endTime, bgutilUrl, useDeno, installFfmpeg }) => {
  const scriptPath = path.join(scriptsDir, 'yt-dlp.py');
  runScript(event, 'ytdlp-output', scriptPath, {
    cwd: outputDir,
    args: [url, format, cookiesPath || '', JSON.stringify(extraArgs || []), container || 'mp4', startTime || '', endTime || '', bgutilUrl || 'local', useDeno || 'n'],
    env: { AUTO_INSTALL_FFMPEG: installFfmpeg ? '1' : '0' }
  });
});

// ── Tool 3: Batch Downloader ──────────────────────────────────────────────────
// yt-dlp_multi.py: sys.argv[1]=format  sys.argv[2]=rest  sys.argv[3]=cookiesPath  sys.argv[4]=extraArgsJSON  sys.argv[5]=container  stdin=URLs
ipcMain.on('run-batch', (event, { urls, outputDir, format, rest, cookiesPath, extraArgs, container, bgutilUrl, useDeno, installFfmpeg }) => {
  const scriptPath = path.join(scriptsDir, 'yt-dlp_multi.py');
  runScript(event, 'batch-output', scriptPath, {
    cwd: outputDir,
    args: [format, rest ? 'y' : 'n', cookiesPath || '', JSON.stringify(extraArgs || []), container || 'mp4', bgutilUrl || 'local', useDeno || 'n'],
    stdinLines: [...urls, ''],
    env: { AUTO_INSTALL_FFMPEG: installFfmpeg ? '1' : '0' }
  });
});

ipcMain.on('append-batch-queue', (event, { outputDir, newUrls }) => {
  try {
    const queueFile = path.join(outputDir, 'queue_additions.txt');
    fs.appendFileSync(queueFile, newUrls.join('\n') + '\n', 'utf-8');
  } catch (err) {
    console.error('Failed to append to batch queue:', err);
  }
});

// ── Tool 4: M3U8 Downloader/Encoder ──────────────────────────────────────────
// Download_and_convert_a_m3u8_url.py:
//   sys.argv[1]=url  [2]=encode(y/n)  [3]=codec  [4]=bitrate  [5]=resolution  [6]=fps  [7]=audioBitrate  [8]=cookiesPath
ipcMain.on('run-m3u8', (event, { url, outputDir, encode, codec, bitrate, resolution, fps, audioBitrate, container, cookiesPath, installFfmpeg }) => {
  const scriptPath = path.join(scriptsDir, 'Download_and_convert_a_m3u8_url.py');
  runScript(event, 'm3u8-output', scriptPath, {
    cwd: outputDir,
    args: [url, encode ? 'y' : 'n', codec, bitrate, resolution, fps, audioBitrate, container || 'mp4', cookiesPath || ''],
    env: { AUTO_INSTALL_FFMPEG: installFfmpeg ? '1' : '0' }
  });
});
// ── Tool 5: gallery-dl ────────────────────────────────────────────────────────────
// gallery-dl.py: sys.argv[1]=url  [2]=filetypes  [3]=metadata(y/n)  [4]=cookiesPath
ipcMain.on('run-gallery-dl', (event, { url, outputDir, filetypes, metadata, cookiesPath, installGdl, installFfmpeg }) => {
  const scriptPath = path.join(scriptsDir, 'gallery-dl.py');
  runScript(event, 'gallery-dl-output', scriptPath, {
    cwd: outputDir,
    args: [url, filetypes, metadata ? 'y' : 'n', cookiesPath || '', installGdl || 'y'],
    env: { AUTO_INSTALL_FFMPEG: installFfmpeg ? '1' : '0' }
  });
});

// ── Tool 6: Video Splitter ──────────────────────────────────────────────────────────
// video-splitter.py: sys.argv[1]=file  sys.argv[2]=parts  sys.argv[3]=outputDir
ipcMain.on('run-splitter', (event, { file, parts, outputDir, containerFormat, installFfmpeg }) => {
  const scriptPath = path.join(scriptsDir, 'video-splitter.py');
  const targetDir = outputDir || path.dirname(file);
  const args = [file, String(parts), targetDir];
  if (containerFormat) {
    args.push('--format', containerFormat);
  }
  runScript(event, 'splitter-output', scriptPath, {
    cwd: targetDir,
    args: args,
    env: { AUTO_INSTALL_FFMPEG: installFfmpeg ? '1' : '0' }
  });
});

// ── Tool 7: Video Concatenator ──────────────────────────────────────────────────────
// video-concatenator.py: --output output.mp4 [--force-encode] file1 file2 ...
ipcMain.on('run-concatenator', (event, { files, output, forceEncode, outputDir, installFfmpeg }) => {
  const scriptPath = path.join(scriptsDir, 'video-concatenator.py');
  const targetDir = outputDir || path.dirname(files[0]);
  
  const args = ['--output', output];
  if (forceEncode) args.push('--force-encode');
  args.push(...files);
  
  runScript(event, 'concatenator-output', scriptPath, {
    cwd: targetDir,
    args: args,
    env: { AUTO_INSTALL_FFMPEG: installFfmpeg ? '1' : '0' }
  });
});

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