const http = require('http');
const WebSocket = require('ws');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const runners = require('./lib/runners.js');

let ipcMain = null;
try {
  const electron = require('electron');
  if (electron && typeof electron === 'object' && electron.ipcMain) {
    ipcMain = electron.ipcMain;
  }
} catch (_) {}

let server = null;
let wss = null;
let SESSION_TOKEN = crypto.randomBytes(32).toString('hex');

function getCookie(req, name) {
  const value = `; ${req.headers.cookie || ''}`;
  const parts = value.split(`; ${name}=`);
  if (parts.length === 2) return parts.pop().split(';').shift();
  return null;
}

const MIME_TYPES = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'text/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.svg': 'image/svg+xml'
};

function startServer(options, appPath) {
  if (server) return;
  const port = options.port || 3000;
  const authUser = options.user || 'admin';
  const authPass = options.pass || 'secret';
  const authPin = options.pin || null;

  function resolveStaticFilePath(relPath) {
    const safePath = path.normalize(relPath).replace(/^(\.\.(\/|\\|$))+/, '');
    const candidates = [
      path.join(appPath, safePath),
      path.join(__dirname, safePath),
      path.join(appPath, 'resources', 'app', safePath),
      path.join(__dirname, 'resources', 'app', safePath)
    ];
    for (const c of candidates) {
      if (fs.existsSync(c)) return c;
    }
    return path.join(appPath, safePath);
  }

  server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
      
      // API Login
      if (req.method === 'POST' && url.pathname === '/api/login') {
        let body = '';
        req.on('data', chunk => { body += chunk.toString(); });
        req.on('end', () => {
          try {
            const { username, password, pin } = JSON.parse(body);
            const isValidAccount = username === authUser && password === authPass;
            const isValidPin = authPin && pin === authPin;
            if (isValidAccount || isValidPin) {
              res.writeHead(200, {
                'Content-Type': 'application/json',
                'Set-Cookie': `auth_token=${SESSION_TOKEN}; HttpOnly; SameSite=Strict; Path=/`
              });
              return res.end(JSON.stringify({ success: true }));
            }
            res.writeHead(401, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, error: 'Invalid credentials' }));
          } catch (e) {
            res.writeHead(400).end('Bad Request');
          }
        });
        return;
      }

      // Serve favicon.ico without auth
      if (url.pathname === '/favicon.ico') {
        res.writeHead(204);
        return res.end();
      }

      // Serve login.html without auth
      if (req.method === 'GET' && url.pathname === '/login.html') {
        const filePath = resolveStaticFilePath('login.html');
        return serveFile(res, filePath, MIME_TYPES['.html']);
      }

      // Authentication Middleware for all other routes
      const token = getCookie(req, 'auth_token');
      if (token !== SESSION_TOKEN) {
        if (url.pathname === '/' || url.pathname === '/index.html') {
          res.writeHead(302, { 'Location': '/login.html' });
          return res.end();
        }
        res.writeHead(401, { 'Content-Type': 'text/plain' });
        return res.end('Authentication required.');
      }

      // Serve Static Files
      if (req.method === 'GET') {
        let pathname = url.pathname;
        if (pathname === '/') pathname = '/index.html';
        const ext = path.extname(pathname).toLowerCase();
        const contentType = MIME_TYPES[ext] || 'application/octet-stream';
        
        const filePath = resolveStaticFilePath(pathname);
        serveFile(res, filePath, contentType);
      }
    } catch (e) {
      res.writeHead(500).end('Server Error');
    }
  });

  function serveFile(res, filePath, contentType) {
    fs.readFile(filePath, (err, content) => {
      if (err) {
        if (err.code === 'ENOENT') {
          res.writeHead(404).end('Not Found');
        } else {
          res.writeHead(500).end('Server Error');
        }
      } else {
        res.writeHead(200, { 'Content-Type': contentType });
        res.end(content, 'utf-8');
      }
    });
  }

  const settingsStore = require('./lib/settings-store.js');
  const activeLogBuffers = new Map(); // channel -> Array of recent data packets

  // WebSockets setup
  wss = new WebSocket.Server({ noServer: true });

  server.on('upgrade', (request, socket, head) => {
    const token = getCookie(request, 'auth_token');
    if (token === SESSION_TOKEN) {
      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit('connection', ws, request);
      });
    } else {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      socket.destroy();
    }
  });

  wss.on('connection', (ws) => {
    // Send full persistent state immediately on connection
    try {
      const fullState = settingsStore.loadAllSettings();
      ws.send(JSON.stringify({ type: 'ipc-reply', channel: 'full-state', data: fullState }));
    } catch (_) {}

    // Replay any currently active tool logs to this newly connected client
    activeLogBuffers.forEach((buffer, channel) => {
      if (buffer && buffer.length > 0) {
        buffer.forEach(pkt => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'ipc-reply', channel, data: pkt }));
          }
        });
      }
    });

    // Fake event object to pass to ipcMain handlers
    const fakeEvent = {
      sender: {
        send: (channel, data) => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'ipc-reply', channel, data }));
          }
        }
      }
    };

    ws.on('message', async (message) => {
      try {
        const msg = JSON.parse(message);
        if (msg.type === 'ipc-send') {
          if (ipcMain) {
            ipcMain.emit(msg.channel, fakeEvent, msg.data);
          } else {
            // Direct standalone fallback for Node CLI
            const opts = msg.data || {};
            const outputChan = (channelName) => (data) => {
              recordAndBroadcast(channelName, data);
            };

            switch (msg.channel) {
              case 'sync-ui-state':
                if (opts && opts.id) {
                  settingsStore.updateSetting(opts.id, opts);
                  broadcast('sync-ui-state', opts);
                }
                break;
              case 'request-full-state':
                ws.send(JSON.stringify({ type: 'ipc-reply', channel: 'full-state', data: settingsStore.loadAllSettings() }));
                break;
              case 'run-ytdlp':
                activeLogBuffers.set('ytdlp-output', []);
                runners.runYtdlp(opts, outputChan('ytdlp-output'));
                break;
              case 'run-livestream':
                activeLogBuffers.set('livestream-output', []);
                runners.runLivestream(opts, outputChan('livestream-output'));
                break;
              case 'run-batch':
                activeLogBuffers.set('batch-output', []);
                runners.runBatch(opts, outputChan('batch-output'));
                break;
              case 'run-m3u8':
                activeLogBuffers.set('m3u8-output', []);
                runners.runM3u8(opts, outputChan('m3u8-output'));
                break;
              case 'run-gallery-dl':
                activeLogBuffers.set('gallery-dl-output', []);
                runners.runGalleryDl(opts, outputChan('gallery-dl-output'));
                break;
              case 'run-splitter':
                activeLogBuffers.set('splitter-output', []);
                runners.runSplitter(opts, outputChan('splitter-output'));
                break;
              case 'run-concatenator':
                activeLogBuffers.set('concatenator-output', []);
                runners.runConcatenator(opts, outputChan('concatenator-output'));
                break;
              case 'run-encoder':
                activeLogBuffers.set('encoder-output', []);
                runners.runEncoder(opts, outputChan('encoder-output'));
                break;
              case 'stop-script':
                if (opts.pid) runners.stopScript(opts.pid);
                break;
              case 'pause-script':
                if (opts.pid) runners.pauseScript(opts.pid);
                break;
              case 'resume-script':
                if (opts.pid) runners.resumeScript(opts.pid);
                break;
            }
          }
        } else if (msg.type === 'ipc-invoke') {
          // Handlers for ipcMain.handle
          let result = null;
          if (msg.channel === 'get-disk-space') {
             try {
                const stats = await fs.promises.statfs(msg.data);
                result = { free: stats.bfree * stats.bsize, total: stats.blocks * stats.bsize };
             } catch {
                result = null;
             }
          } else if (msg.channel === 'fs-browse') {
             result = await handleFsBrowse(msg.data);
          } else if (msg.channel === 'fs-create-folder') {
             result = await handleFsCreateFolder(msg.data);
          } else if (msg.channel.startsWith('pick-')) {
             result = null;
          }
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'ipc-invoke-reply', id: msg.id, result }));
          }
        }
      } catch (e) {
        console.error('WS Error:', e);
      }
    });
  });

  function recordAndBroadcast(channel, data) {
    if (!activeLogBuffers.has(channel)) activeLogBuffers.set(channel, []);
    const buf = activeLogBuffers.get(channel);
    buf.push(data);
    if (buf.length > 200) buf.shift(); // keep recent 200 packets
    if (data && data.type === 'exit') {
      setTimeout(() => { activeLogBuffers.delete(channel); }, 60000); // clear after 1 min
    }
    broadcast(channel, data);
  }

  server.listen(port, '0.0.0.0', () => {
    console.log(`Remote server listening on port ${port}`);
  });
}

async function handleFsBrowse(opts = {}) {
  const os = require('os');
  let targetPath = opts.path || '';
  const filterType = opts.type || 'folder'; // 'folder' | 'file' | 'video' | 'any'

  if (!targetPath || typeof targetPath !== 'string') {
    targetPath = os.homedir() || process.cwd();
  }

  if (targetPath.startsWith('~')) {
    targetPath = path.join(os.homedir(), targetPath.slice(1));
  }

  targetPath = path.resolve(targetPath);

  if (!fs.existsSync(targetPath)) {
    let fallback = path.dirname(targetPath);
    while (fallback && !fs.existsSync(fallback) && fallback !== path.dirname(fallback)) {
      fallback = path.dirname(fallback);
    }
    targetPath = (fallback && fs.existsSync(fallback)) ? fallback : (os.homedir() || process.cwd());
  }

  try {
    const stat = await fs.promises.stat(targetPath);
    if (!stat.isDirectory()) {
      targetPath = path.dirname(targetPath);
    }
  } catch (_) {
    targetPath = os.homedir() || process.cwd();
  }

  const parsed = path.parse(targetPath);
  const isRoot = parsed.root === targetPath;
  const parentPath = isRoot ? null : path.dirname(targetPath);

  let roots = [];
  if (process.platform === 'win32') {
    for (let i = 65; i <= 90; i++) {
      const drive = String.fromCharCode(i) + ':\\';
      try {
        if (fs.existsSync(drive)) roots.push(drive);
      } catch (_) {}
    }
  } else {
    roots = ['/', os.homedir()];
  }

  let items = [];
  try {
    const entries = await fs.promises.readdir(targetPath, { withFileTypes: true });
    const videoExts = new Set(['.mp4', '.mkv', '.avi', '.mov', '.webm', '.flv', '.m4v', '.ts', '.m3u8', '.wmv']);
    const audioExts = new Set(['.mp3', '.m4a', '.aac', '.flac', '.wav', '.opus', '.ogg']);

    for (const ent of entries) {
      if (ent.name.startsWith('.') && ent.name !== '.config') continue;

      const fullPath = path.join(targetPath, ent.name);
      let isDir = false;
      let size = 0;
      let mtime = null;

      try {
        isDir = ent.isDirectory();
        if (!isDir && ent.isSymbolicLink()) {
          const s = await fs.promises.stat(fullPath);
          isDir = s.isDirectory();
        }
      } catch (_) {
        continue;
      }

      const ext = path.extname(ent.name).toLowerCase();
      const isVideo = videoExts.has(ext);
      const isAudio = audioExts.has(ext);

      try {
        if (!isDir) {
          const st = await fs.promises.stat(fullPath);
          size = st.size;
          mtime = st.mtime.toISOString();
        }
      } catch (_) {}

      items.push({
        name: ent.name,
        path: fullPath,
        isDirectory: isDir,
        isVideo,
        isAudio,
        size,
        ext,
        mtime
      });
    }

    items.sort((a, b) => {
      if (a.isDirectory && !b.isDirectory) return -1;
      if (!a.isDirectory && b.isDirectory) return 1;
      return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });
    });
  } catch (err) {
    return { error: err.message, currentPath: targetPath, parentPath, roots, homePath: os.homedir(), items: [] };
  }

  return {
    currentPath: targetPath,
    parentPath,
    homePath: os.homedir(),
    roots,
    items
  };
}

async function handleFsCreateFolder(opts = {}) {
  try {
    const { dirPath, folderName } = opts;
    if (!dirPath || !folderName) return { success: false, error: 'Invalid parameters' };
    const cleanName = folderName.replace(/[\\/:*?"<>|]/g, '').trim();
    if (!cleanName) return { success: false, error: 'Invalid folder name' };
    const newDir = path.join(dirPath, cleanName);
    await fs.promises.mkdir(newDir, { recursive: true });
    return { success: true, newPath: newDir };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

function stopServer() {
  if (server) {
    server.close();
    server = null;
    wss = null;
  }
}

function broadcast(channel, data) {
  if (!wss) return;
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify({ type: 'ipc-reply', channel, data }));
    }
  });
}

module.exports = { startServer, stopServer, broadcast, handleFsBrowse, handleFsCreateFolder };
