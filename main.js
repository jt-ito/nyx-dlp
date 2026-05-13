const { app, BrowserWindow, ipcMain, dialog } = require('electron');
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

let mainWindow;
const activeProcs = new Map(); // pid → ChildProcess

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
}

app.whenReady().then(() => {
  createWindow();
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

// Script runner — passes argv args, optionally pipes stdin, sets cwd, streams output
function runScript(event, replyChannel, scriptPath, { cwd, args = [], stdinLines = [] }) {
  const pythonCmd = process.platform === 'win32' ? 'python' : 'python3';

  // Ensure output directory exists
  fs.mkdirSync(cwd, { recursive: true });

  const proc = spawn(pythonCmd, ['-u', scriptPath, ...args], {
    cwd,
    stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env, PYTHONUNBUFFERED: '1' }
  });

  event.sender.send(replyChannel, { type: 'pid', pid: proc.pid });

  activeProcs.set(proc.pid, proc);

  // Feed any required stdin lines, then close stdin
  for (const line of stdinLines) {
    proc.stdin.write(line + '\n');
  }
  proc.stdin.end();

  proc.stdout.on('data', (data) => {
    event.sender.send(replyChannel, { type: 'stdout', text: data.toString() });
  });
  proc.stderr.on('data', (data) => {
    event.sender.send(replyChannel, { type: 'stderr', text: data.toString() });
  });
  proc.on('close', (code) => {
    activeProcs.delete(proc.pid);
    event.sender.send(replyChannel, { type: 'exit', code });
  });
  proc.on('error', (err) => {
    event.sender.send(replyChannel, { type: 'error', text: err.message });
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
  const script = [
    'Add-Type -TypeDefinition @\'',
    'using System;',
    'using System.Runtime.InteropServices;',
    'public class PC {',
    '  [DllImport("ntdll.dll")] public static extern int NtSuspendProcess(IntPtr h);',
    '  [DllImport("ntdll.dll")] public static extern int NtResumeProcess(IntPtr h);',
    '}',
    '\'@',
    'function Get-Tree([int]$p) {',
    '  (Get-CimInstance Win32_Process -Filter "ParentProcessId=$p").ProcessId | ForEach-Object { Get-Tree $_ }',
    '  $p',
    '}',
    `Get-Tree ${rootPid} | ForEach-Object {`,
    '  try {',
    '    $pr = [System.Diagnostics.Process]::GetProcessById($_)',
    `    if ('${action}' -eq 'suspend') { [PC]::NtSuspendProcess($pr.Handle) | Out-Null }`,
    '    else { [PC]::NtResumeProcess($pr.Handle) | Out-Null }',
    '  } catch {}',
    '}'
  ].join('\n');
  const encoded = Buffer.from(script, 'utf16le').toString('base64');
  execFile('powershell', ['-NoProfile', '-NonInteractive', '-EncodedCommand', encoded]);
}

ipcMain.on('pause-script',  (event, { pid }) => suspendResumeTree(pid, 'suspend'));
ipcMain.on('resume-script', (event, { pid }) => suspendResumeTree(pid, 'resume'));

// ── Tool 1: YouTube Live Stream Archiver ──────────────────────────────────────
// yt-archiver.py: sys.argv[1]=url  sys.argv[2]=format  sys.argv[3]=cookiesPath  sys.argv[4]=container
ipcMain.on('run-livestream', (event, { url, outputDir, format, cookiesPath, container, bgutilUrl, useDeno }) => {
  const scriptPath = path.join(scriptsDir, 'yt-archiver.py');
  runScript(event, 'livestream-output', scriptPath, {
    cwd: outputDir,
    args: [url, format, cookiesPath || '', container || 'mp4', bgutilUrl || 'local', useDeno || 'n']
  });
});

// ── Tool 2: yt-dlp Single Download ───────────────────────────────────────────
// yt-dlp.py: sys.argv[1]=url  sys.argv[2]=format  sys.argv[3]=cookiesPath  sys.argv[4]=extraArgsJSON  sys.argv[5]=container  sys.argv[6]=startTime  sys.argv[7]=endTime
ipcMain.on('run-ytdlp', (event, { url, outputDir, format, cookiesPath, extraArgs, container, startTime, endTime, bgutilUrl, useDeno }) => {
  const scriptPath = path.join(scriptsDir, 'yt-dlp.py');
  runScript(event, 'ytdlp-output', scriptPath, {
    cwd: outputDir,
    args: [url, format, cookiesPath || '', JSON.stringify(extraArgs || []), container || 'mp4', startTime || '', endTime || '', bgutilUrl || 'local', useDeno || 'n']
  });
});

// ── Tool 3: Batch Downloader ──────────────────────────────────────────────────
// yt-dlp_multi.py: sys.argv[1]=format  sys.argv[2]=rest  sys.argv[3]=cookiesPath  sys.argv[4]=extraArgsJSON  sys.argv[5]=container  stdin=URLs
ipcMain.on('run-batch', (event, { urls, outputDir, format, rest, cookiesPath, extraArgs, container, bgutilUrl, useDeno }) => {
  const scriptPath = path.join(scriptsDir, 'yt-dlp_multi.py');
  runScript(event, 'batch-output', scriptPath, {
    cwd: outputDir,
    args: [format, rest ? 'y' : 'n', cookiesPath || '', JSON.stringify(extraArgs || []), container || 'mp4', bgutilUrl || 'local', useDeno || 'n'],
    stdinLines: [...urls, '']
  });
});

// ── Tool 4: M3U8 Downloader/Encoder ──────────────────────────────────────────
// Download_and_convert_a_m3u8_url.py:
//   sys.argv[1]=url  [2]=encode(y/n)  [3]=codec  [4]=bitrate  [5]=resolution  [6]=fps  [7]=audioBitrate  [8]=cookiesPath
ipcMain.on('run-m3u8', (event, { url, outputDir, encode, codec, bitrate, resolution, fps, audioBitrate, container, cookiesPath }) => {
  const scriptPath = path.join(scriptsDir, 'Download_and_convert_a_m3u8_url.py');
  runScript(event, 'm3u8-output', scriptPath, {
    cwd: outputDir,
    args: [url, encode ? 'y' : 'n', codec, bitrate, resolution, fps, audioBitrate, container || 'mp4', cookiesPath || '']
  });
});
// ── Tool 5: gallery-dl ────────────────────────────────────────────────────────────
// gallery-dl.py: sys.argv[1]=url  [2]=filetypes  [3]=metadata(y/n)  [4]=cookiesPath
ipcMain.on('run-gallery-dl', (event, { url, outputDir, filetypes, metadata, cookiesPath, installGdl }) => {
  const scriptPath = path.join(scriptsDir, 'gallery-dl.py');
  runScript(event, 'gallery-dl-output', scriptPath, {
    cwd: outputDir,
    args: [url, filetypes, metadata ? 'y' : 'n', cookiesPath || '', installGdl || 'y']
  });
});