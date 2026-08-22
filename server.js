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
            const broadcastChannel = (c, d) => {
              if (ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({ type: 'ipc-reply', channel: c, data: d }));
              }
            };
            const outputChan = (name) => (data) => broadcastChannel(name, data);

            switch (msg.channel) {
              case 'run-ytdlp':
                runners.runYtdlp(opts, outputChan('ytdlp-output'));
                break;
              case 'run-livestream':
                runners.runLivestream(opts, outputChan('livestream-output'));
                break;
              case 'run-batch':
                runners.runBatch(opts, outputChan('batch-output'));
                break;
              case 'run-m3u8':
                runners.runM3u8(opts, outputChan('m3u8-output'));
                break;
              case 'run-gallery-dl':
                runners.runGalleryDl(opts, outputChan('gallery-dl-output'));
                break;
              case 'run-splitter':
                runners.runSplitter(opts, outputChan('splitter-output'));
                break;
              case 'run-concatenator':
                runners.runConcatenator(opts, outputChan('concatenator-output'));
                break;
              case 'run-encoder':
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
          } else if (msg.channel.startsWith('pick-')) {
             // Remote pickers are not natively supported
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

  server.listen(port, '0.0.0.0', () => {
    console.log(`Remote server listening on port ${port}`);
  });
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

module.exports = { startServer, stopServer, broadcast };
