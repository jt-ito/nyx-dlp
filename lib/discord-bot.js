/**
 * nyx-dlp Discord Bot Integration
 *
 * Lightweight, zero-external-dependency Discord Gateway v10 & REST API client
 * powered by Node.js built-in `https` and `ws`.
 */

const https = require('https');
const fs = require('fs');
const path = require('path');
const os = require('os');
const WebSocket = require('ws');
const runners = require('./runners.js');

const DISCORD_API_BASE = 'https://discord.com/api/v10';
const DISCORD_GATEWAY = 'wss://gateway.discord.gg/?v=10&encoding=json';
// Required permissions: Send Messages (2048), Embed Links (16384), Attach Files (32768), Read Message History (65536), Use Slash Commands (2147483648)
const REQUIRED_PERMISSIONS = '274878024704';

function addHistoryEntry(entry) {
  try {
    let historyFile = '';
    try {
      const { app } = require('electron');
      if (app && app.getPath) {
        historyFile = path.join(app.getPath('userData'), 'history.json');
      }
    } catch (_) {}

    if (!historyFile) {
      const settingsStore = require('./settings-store.js');
      historyFile = path.join(settingsStore.getConfigDir(), 'history.json');
    }

    let history = [];
    if (fs.existsSync(historyFile)) {
      try {
        history = JSON.parse(fs.readFileSync(historyFile, 'utf8'));
      } catch (_) {}
    }

    history.unshift(entry);
    if (history.length > 1000) history = history.slice(0, 1000);
    fs.writeFileSync(historyFile, JSON.stringify(history, null, 2), 'utf8');
  } catch (err) {
    console.error('[History] Failed to add history entry from Discord bot:', err.message);
  }
}

// ── Slash Command Definitions ────────────────────────────────────────
const SLASH_COMMANDS = [
  {
    name: 'ytdlp',
    description: 'Download video or clip using yt-dlp with Smart-Cut precision',
    options: [
      { name: 'url', description: 'Video or media URL to download', type: 3, required: true },
      { name: 'format', description: 'Format selector (e.g. bestvideo+bestaudio/best, best)', type: 3, required: false },
      { name: 'start_time', description: 'Clip start timestamp (e.g. 00:01:30)', type: 3, required: false },
      { name: 'end_time', description: 'Clip end timestamp (e.g. 00:03:00)', type: 3, required: false },
      {
        name: 'container',
        description: 'Output container format',
        type: 3,
        required: false,
        choices: [
          { name: 'MP4', value: 'mp4' },
          { name: 'MKV', value: 'mkv' },
          { name: 'WebM', value: 'webm' },
          { name: 'TS', value: 'ts' }
        ]
      },
      {
        name: 'client',
        description: 'YouTube player client override',
        type: 3,
        required: false,
        choices: [
          { name: 'Default', value: 'default' },
          { name: 'Web', value: 'web' },
          { name: 'Safari (web_safari)', value: 'web_safari' },
          { name: 'iOS', value: 'ios' },
          { name: 'Android', value: 'android' },
          { name: 'TV', value: 'tv' }
        ]
      },
      { name: 'extra_args', description: 'Additional yt-dlp arguments (e.g. --no-playlist)', type: 3, required: false }
    ]
  },
  {
    name: 'batch',
    description: 'Batch download multiple URLs with rest intervals & live skipping',
    options: [
      { name: 'urls', description: 'Space or comma separated list of URLs', type: 3, required: true },
      { name: 'format', description: 'Format selector', type: 3, required: false },
      { name: 'rest', description: 'Rest interval in seconds between downloads', type: 4, required: false },
      { name: 'skip_live', description: 'Skip active live streams', type: 5, required: false },
      {
        name: 'container',
        description: 'Output container',
        type: 3,
        required: false,
        choices: [{ name: 'MP4', value: 'mp4' }, { name: 'MKV', value: 'mkv' }]
      }
    ]
  },
  {
    name: 'livestream',
    description: 'Archive YouTube live streams using Native HLS chunk slicing',
    options: [
      { name: 'url', description: 'YouTube live stream URL', type: 3, required: true },
      {
        name: 'quality',
        description: 'Stream recording quality',
        type: 3,
        required: false,
        choices: [
          { name: 'Best Available', value: 'best' },
          { name: '1080p 60fps', value: '1080p60' },
          { name: '1080p', value: '1080p' },
          { name: '720p 60fps', value: '720p60' },
          { name: '720p', value: '720p' },
          { name: '480p', value: '480p' },
          { name: 'Audio Only', value: 'audio_only' }
        ]
      },
      { name: 'from_start', description: 'Record from stream start (default: true)', type: 5, required: false },
      { name: 'concurrent', description: 'Concurrent download connections (default: 5)', type: 4, required: false },
      {
        name: 'client',
        description: 'Player client override',
        type: 3,
        required: false,
        choices: [
          { name: 'Default', value: 'default' },
          { name: 'Web', value: 'web' },
          { name: 'iOS', value: 'ios' },
          { name: 'Android', value: 'android' }
        ]
      }
    ]
  },
  {
    name: 'm3u8',
    description: 'Download and optionally re-encode M3U8 HLS streams',
    options: [
      { name: 'url', description: 'M3U8 Master Playlist URL', type: 3, required: true },
      { name: 'encode', description: 'Re-encode video stream with FFmpeg', type: 5, required: false },
      {
        name: 'codec',
        description: 'Video codec',
        type: 3,
        required: false,
        choices: [
          { name: 'H.264 (Default)', value: 'h264' },
          { name: 'HEVC / H.265', value: 'hevc' },
          { name: 'AV1', value: 'av1' },
          { name: 'Direct Copy', value: 'copy' }
        ]
      },
      { name: 'bitrate', description: 'Target video bitrate (e.g. 5M, 8000k)', type: 3, required: false },
      { name: 'resolution', description: 'Target resolution (e.g. 1920x1080)', type: 3, required: false }
    ]
  },
  {
    name: 'gallerydl',
    description: 'Download image sets, galleries, and posts with gallery-dl',
    options: [
      { name: 'url', description: 'Image post, album, or gallery URL', type: 3, required: true },
      { name: 'filetypes', description: 'Comma-separated filetypes (e.g. jpg,png,gif,mp4)', type: 3, required: false },
      { name: 'metadata', description: 'Save metadata JSON files alongside images', type: 5, required: false }
    ]
  },
  {
    name: 'splitter',
    description: 'Split local video into N equal-duration segments',
    options: [
      { name: 'file', description: 'Path to local video file on server', type: 3, required: true },
      { name: 'parts', description: 'Number of equal parts to divide into', type: 4, required: true },
      { name: 'parts_to_save', description: 'Specific parts to save (e.g. 1,3,5 or 1-3)', type: 3, required: false }
    ]
  },
  {
    name: 'concat',
    description: 'Concatenate multiple local video files',
    options: [
      { name: 'files', description: 'Comma-separated list of full file paths', type: 3, required: true },
      { name: 'output_name', description: 'Output filename (e.g. merged.mp4)', type: 3, required: true },
      {
        name: 'quality',
        description: 'Quality profile if re-encoding',
        type: 3,
        required: false,
        choices: [
          { name: 'High (Visually Lossless)', value: 'high' },
          { name: 'Medium (Balanced)', value: 'medium' },
          { name: 'Low (Smallest)', value: 'low' }
        ]
      },
      { name: 'force_encode', description: 'Force re-encoding instead of stream copy', type: 5, required: false }
    ]
  },
  {
    name: 'encoder',
    description: 'GPU-accelerated video converter and compressor',
    options: [
      { name: 'file', description: 'Path to input video file on server', type: 3, required: true },
      {
        name: 'quality',
        description: 'Encode quality profile',
        type: 3,
        required: false,
        choices: [
          { name: 'High (Visually Lossless)', value: 'high' },
          { name: 'Medium (Balanced)', value: 'medium' },
          { name: 'Low (Smallest Size)', value: 'low' }
        ]
      },
      { name: 'vcodec', description: 'Video codec (auto, h264_nvenc, hevc_nvenc, libx264, libx265)', type: 3, required: false },
      { name: 'acodec', description: 'Audio codec (aac, mp3, opus, copy)', type: 3, required: false },
      { name: 'container', description: 'Output container (mp4, mkv, mov)', type: 3, required: false }
    ]
  },
  {
    name: 'ia',
    description: 'Internet Archive suite (upload, download, metadata)',
    options: [
      {
        name: 'action',
        description: 'Action to perform',
        type: 3,
        required: true,
        choices: [
          { name: 'Upload Files', value: 'upload' },
          { name: 'Download Item', value: 'download' },
          { name: 'Check Auth Status', value: 'check' }
        ]
      },
      { name: 'identifier', description: 'Unique Internet Archive item identifier', type: 3, required: true },
      { name: 'files', description: 'File or folder paths to upload (for upload action)', type: 3, required: false },
      { name: 'title', description: 'Item title', type: 3, required: false }
    ]
  },
  {
    name: 'status',
    description: 'Check active nyx-dlp tasks, disk space, and system status'
  },
  {
    name: 'progress',
    description: 'Check live download & task progress for active tools',
    options: [
      {
        name: 'tool',
        description: 'Select tool to check (or view all active tasks)',
        type: 3,
        required: false,
        choices: [
          { name: 'All Tools', value: 'all' },
          { name: 'yt-dlp (Single & Clips)', value: 'ytdlp' },
          { name: 'Batch Downloader', value: 'batch' },
          { name: 'Live Stream Archiver', value: 'livestream' },
          { name: 'M3U8 Downloader', value: 'm3u8' },
          { name: 'gallery-dl (Image Sets)', value: 'gallerydl' },
          { name: 'Video Splitter', value: 'splitter' },
          { name: 'Video Concatenator', value: 'concat' },
          { name: 'Video Encoder', value: 'encoder' },
          { name: 'Internet Archive', value: 'ia' }
        ]
      }
    ]
  },
  {
    name: 'help',
    description: 'Show nyx-dlp slash command guide and tips'
  }
];

function extractProgress(text, job) {
  if (!text || !job) return;
  const fullMatch = text.match(/(\d+(?:\.\d+)?%)\s+of\s+~?[\d.]+[A-Za-z]+\s+at\s+([\d.]+[A-Za-z]+\/s)\s+ETA\s+([\d:]+)/i);
  if (fullMatch) {
    job.lastPercent = fullMatch[1];
    job.lastSpeed = fullMatch[2];
    job.lastEta = fullMatch[3];
  } else {
    const pctMatch = text.match(/(?:\[download\]|\b)(\d+(?:\.\d+)?%)/i);
    if (pctMatch) job.lastPercent = pctMatch[1];
    const speedMatch = text.match(/([\d.]+\s*(?:MiB|KiB|GiB|MB|KB|GB)\/s|speed=\s*[\d.]+x)/i);
    if (speedMatch) job.lastSpeed = speedMatch[1];
    const etaMatch = text.match(/ETA\s+([\d:]+)/i);
    if (etaMatch) job.lastEta = etaMatch[1];
  }
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  if (lines.length > 0) {
    job.lastLog = lines[lines.length - 1];
    job.logs.push(...lines);
    if (job.logs.length > 50) job.logs = job.logs.slice(-50);
  }
}

// ── Discord Bot Manager Class ─────────────────────────────────────────
class DiscordBotManager {
  constructor() {
    this.ws = null;
    this.token = '';
    this.clientId = '';
    this.botUser = null;
    this.downloadDir = '';
    this.heartbeatInterval = null;
    this.initialHeartbeatTimeout = null;
    this.pingInterval = null;
    this.reconnectTimeout = null;
    this.reconnectAttempts = 0;
    this.lastHeartbeatAck = true;
    this.isManualStop = false;
    this.sequence = null;
    this.sessionId = null;
    this.status = 'disconnected'; // 'disconnected' | 'connecting' | 'connected' | 'error'
    this.lastError = null;
    this.statusCallback = null;
    this.activeJobs = new Map(); // interactionToken -> job info
  }

  onStatusChange(cb) {
    this.statusCallback = cb;
  }

  notifyStatus(status, details = {}) {
    this.status = status;
    if (details.error) this.lastError = details.error;
    if (this.statusCallback) {
      this.statusCallback({
        status,
        botUser: this.botUser,
        clientId: this.clientId,
        inviteUrl: this.getInviteUrl(),
        error: this.lastError,
        ...details
      });
    }
  }

  getInviteUrl() {
    if (!this.clientId) return '';
    return `https://discord.com/oauth2/authorize?client_id=${this.clientId}&scope=bot%20applications.commands&permissions=${REQUIRED_PERMISSIONS}`;
  }

  getEffectiveDownloadDir() {
    let dir = this.downloadDir;
    if (!dir || dir === 'undefined' || dir === 'null') {
      try {
        const settingsStore = require('./settings-store.js');
        dir = settingsStore.getSettingValue('discordDownloadDir') || settingsStore.getSettingValue('discord-download-dir') || '';
      } catch (_) {}
    }
    if (!dir || dir === 'undefined' || dir === 'null') {
      dir = path.join(os.homedir(), 'Downloads', 'nyx-dlp');
    }
    return dir;
  }

  getStatus() {
    return {
      status: this.status,
      botUser: this.botUser,
      clientId: this.clientId,
      inviteUrl: this.getInviteUrl(),
      downloadDir: this.getEffectiveDownloadDir(),
      error: this.lastError,
      activeJobsCount: this.activeJobs.size
    };
  }

  // ── External / Unified Task Registration ───────────────────────────
  registerExternalJob(id, data = {}) {
    const job = {
      id,
      command: data.command || 'ytdlp',
      options: data.options || {},
      outputDir: data.outputDir || '',
      source: data.source || 'Desktop App',
      user: data.user || data.source || 'Desktop App',
      logs: [],
      lastPercent: '',
      lastSpeed: '',
      lastEta: '',
      lastLog: '',
      lastUpdated: 0,
      startTime: Date.now()
    };
    this.activeJobs.set(id, job);

    return {
      onData: (streamData) => {
        if (!streamData) return;
        if (streamData.type === 'stdout' || streamData.type === 'stderr') {
          extractProgress(streamData.text || '', job);
        } else if (streamData.type === 'exit') {
          this.activeJobs.delete(id);
        }
      },
      finish: () => {
        this.activeJobs.delete(id);
      }
    };
  }

  unregisterExternalJob(id) {
    this.activeJobs.delete(id);
  }

  // ── REST API Helper ────────────────────────────────────────────────
  discordRequest(endpoint, method = 'GET', data = null, headers = {}) {
    return new Promise((resolve, reject) => {
      const url = new URL(DISCORD_API_BASE + endpoint);
      const pkgVersion = require('../package.json').version || '4.0.1';
      const reqHeaders = {
        'Authorization': `Bot ${this.token}`,
        'User-Agent': `DiscordBot (nyx-dlp, ${pkgVersion})`,
        ...headers
      };

      let bodyData = null;
      if (data && !headers['Content-Type']) {
        reqHeaders['Content-Type'] = 'application/json';
        bodyData = JSON.stringify(data);
        reqHeaders['Content-Length'] = Buffer.byteLength(bodyData);
      } else if (Buffer.isBuffer(data)) {
        bodyData = data;
        reqHeaders['Content-Length'] = data.length;
      }

      const req = https.request({
        hostname: url.hostname,
        port: 443,
        path: url.pathname + url.search,
        method: method,
        headers: reqHeaders,
        timeout: 15000
      }, (res) => {
        let rawData = '';
        res.on('data', chunk => rawData += chunk);
        res.on('end', () => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            try {
              resolve(rawData ? JSON.parse(rawData) : null);
            } catch (_) {
              resolve(rawData);
            }
          } else {
            let parsedErr;
            try { parsedErr = JSON.parse(rawData); } catch (_) { parsedErr = { message: rawData || `Status ${res.statusCode}` }; }
            reject(new Error(parsedErr.message || `Discord API Error: ${res.statusCode}`));
          }
        });
      });

      req.on('timeout', () => { req.destroy(); reject(new Error('Discord request timed out')); });
      req.on('error', reject);

      if (bodyData) req.write(bodyData);
      req.end();
    });
  }

  // ── Fetch Bot Profile & Client ID ───────────────────────────────────
  async fetchBotInfo() {
    const user = await this.discordRequest('/users/@me');
    this.botUser = user;
    if (!this.clientId && user.id) {
      this.clientId = user.id;
    }
    try {
      const appInfo = await this.discordRequest('/oauth2/applications/@me');
      if (appInfo && appInfo.id) {
        this.clientId = appInfo.id;
      }
    } catch (_) {}
    return { user, clientId: this.clientId };
  }

  // ── Register Slash Commands with Discord ───────────────────────────
  async registerSlashCommands() {
    if (!this.clientId) {
      await this.fetchBotInfo();
    }
    console.log(`[Discord Bot] Registering ${SLASH_COMMANDS.length} global slash commands for app ID: ${this.clientId}...`);
    const result = await this.discordRequest(`/applications/${this.clientId}/commands`, 'PUT', SLASH_COMMANDS);
    console.log(`[Discord Bot] Successfully registered global slash commands!`);
    return result;
  }

  // ── Start Bot / Connect Gateway ────────────────────────────────────
  async start(opts = {}) {
    if (opts.token) this.token = opts.token.trim();
    if (opts.clientId) this.clientId = opts.clientId.trim();
    if (opts.downloadDir) this.downloadDir = opts.downloadDir;

    if (!this.token) {
      this.notifyStatus('error', { error: 'Bot token is required' });
      throw new Error('Bot token is required');
    }

    this.isManualStop = false;
    this.reconnectAttempts = 0;
    this.cleanupHeartbeat();
    if (this.ws) {
      try {
        this.ws.removeAllListeners();
        this.ws.close();
      } catch (_) {}
      this.ws = null;
    }

    this.notifyStatus('connecting');

    try {
      console.log('[Discord Bot] Validating token and fetching bot user info...');
      await this.fetchBotInfo();
      console.log(`[Discord Bot] Authenticated as ${this.botUser.username}#${this.botUser.discriminator || '0'} (ID: ${this.clientId})`);

      // Register or update slash commands
      try {
        await this.registerSlashCommands();
      } catch (err) {
        console.error('[Discord Bot] Warning: Failed to register slash commands:', err.message);
      }

      this.connectGateway();
    } catch (err) {
      console.error('[Discord Bot] Failed to initialize bot:', err.message);
      this.notifyStatus('error', { error: err.message });
      throw err;
    }
  }

  // ── Gateway Connection Handling ────────────────────────────────────
  connectGateway() {
    if (this.isManualStop) return;

    this.cleanupHeartbeat();
    if (this.ws) {
      try {
        this.ws.removeAllListeners();
        this.ws.close();
      } catch (_) {}
      this.ws = null;
    }

    try {
      this.ws = new WebSocket(DISCORD_GATEWAY);
    } catch (err) {
      this.notifyStatus('error', { error: err.message });
      this.scheduleReconnect();
      return;
    }

    this.ws.on('open', () => {
      console.log('[Discord Bot] Gateway WebSocket connection opened.');
    });

    this.ws.on('message', (raw) => {
      try {
        const payload = JSON.parse(raw);
        this.handleGatewayPayload(payload);
      } catch (e) {
        console.error('[Discord Bot] Error parsing gateway message:', e);
      }
    });

    this.ws.on('close', (code, reason) => {
      console.log(`[Discord Bot] Gateway closed (${code}): ${reason || 'No reason'}`);
      this.cleanupHeartbeat();
      if (!this.isManualStop) {
        this.scheduleReconnect();
      } else {
        this.notifyStatus('disconnected');
      }
    });

    this.ws.on('error', (err) => {
      console.error('[Discord Bot] Gateway WebSocket error:', err.message);
      // Let 'close' handler trigger reconnection
    });
  }

  scheduleReconnect() {
    if (this.isManualStop) return;
    if (this.reconnectTimeout) clearTimeout(this.reconnectTimeout);

    const delay = Math.min(1000 * Math.pow(1.5, this.reconnectAttempts), 30000);
    this.reconnectAttempts++;
    console.log(`[Discord Bot] Scheduling reconnect attempt #${this.reconnectAttempts} in ${(delay / 1000).toFixed(1)}s...`);
    this.notifyStatus('connecting', { error: `Reconnecting in ${(delay / 1000).toFixed(1)}s...` });

    this.reconnectTimeout = setTimeout(() => {
      this.reconnectTimeout = null;
      if (!this.isManualStop) {
        this.connectGateway();
      }
    }, delay);
  }

  cleanupHeartbeat() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
    if (this.initialHeartbeatTimeout) {
      clearTimeout(this.initialHeartbeatTimeout);
      this.initialHeartbeatTimeout = null;
    }
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
  }

  sendGateway(op, d) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ op, d }));
    }
  }

  handleGatewayPayload(payload) {
    const { op, d, s, t } = payload;
    if (s !== null && s !== undefined) this.sequence = s;

    switch (op) {
      case 10: { // Hello: Start Heartbeat & Identify/Resume
        const interval = d.heartbeat_interval;
        this.lastHeartbeatAck = true;
        this.cleanupHeartbeat();

        // 1. Regular Gateway Heartbeat Interval
        this.heartbeatInterval = setInterval(() => {
          if (!this.lastHeartbeatAck) {
            console.warn('[Discord Bot] Missed heartbeat ACK (zombie connection). Forcing reconnect...');
            try { this.ws.terminate(); } catch (_) {}
            return;
          }
          this.lastHeartbeatAck = false;
          this.sendGateway(1, this.sequence);
        }, interval);

        // 2. Low-level WebSocket keep-alive ping every 30s to keep NAT/firewalls open
        this.pingInterval = setInterval(() => {
          if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            try { this.ws.ping(); } catch (_) {}
          }
        }, 30000);

        // 3. Send initial jittered heartbeat
        const jitter = Math.floor(interval * Math.random());
        this.initialHeartbeatTimeout = setTimeout(() => {
          this.sendGateway(1, this.sequence);
        }, jitter);

        // 4. Resume if we have an active session, otherwise Identify
        if (this.sessionId && this.sequence !== null) {
          console.log(`[Discord Bot] Attempting to resume session ${this.sessionId}...`);
          this.sendGateway(6, { // Opcode 6: Resume
            token: this.token,
            session_id: this.sessionId,
            seq: this.sequence
          });
        } else {
          this.sendGateway(2, { // Opcode 2: Identify
            token: this.token,
            intents: 0,
            properties: {
              os: os.platform(),
              browser: 'nyx-dlp',
              device: 'nyx-dlp'
            }
          });
        }
        break;
      }

      case 11: { // Heartbeat ACK
        this.lastHeartbeatAck = true;
        break;
      }

      case 0: { // Dispatch Event
        if (t === 'READY') {
          this.sessionId = d.session_id;
          this.botUser = d.user;
          this.reconnectAttempts = 0;
          console.log(`[Discord Bot] Gateway Ready! Logged in as ${d.user.username}`);
          this.notifyStatus('connected');
        } else if (t === 'RESUMED') {
          this.reconnectAttempts = 0;
          console.log('[Discord Bot] Gateway session resumed successfully!');
          this.notifyStatus('connected');
        } else if (t === 'INTERACTION_CREATE') {
          this.handleInteraction(d);
        }
        break;
      }

      case 7: { // Reconnect requested by Discord
        console.log('[Discord Bot] Discord requested reconnect (Opcode 7). Reconnecting...');
        try { this.ws.terminate(); } catch (_) {}
        break;
      }

      case 9: { // Invalid Session
        const resumable = d;
        console.log(`[Discord Bot] Invalid session (Opcode 9, resumable: ${resumable}). Reconnecting...`);
        if (!resumable) {
          this.sessionId = null;
          this.sequence = null;
        }
        setTimeout(() => {
          try { this.ws.terminate(); } catch (_) {}
        }, 1000);
        break;
      }
    }
  }

  // ── Handle Slash Command Interactions ──────────────────────────────
  async handleInteraction(interaction) {
    if (interaction.type !== 2) return; // Type 2 = APPLICATION_COMMAND

    const interactionId = interaction.id;
    const interactionToken = interaction.token;
    const commandName = interaction.data.name;
    const optionsArray = interaction.data.options || [];

    // Map options into key-value pairs
    const options = {};
    for (const opt of optionsArray) {
      options[opt.name] = opt.value;
    }

    console.log(`[Discord Bot] Received /${commandName} from user ${interaction.member?.user?.username || interaction.user?.username}`);

    // 1. Immediately acknowledge with deferred thinking response (Type 5)
    try {
      await this.discordRequest(`/interactions/${interactionId}/${interactionToken}/callback`, 'POST', {
        type: 5, // DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE
        data: {}
      });
    } catch (err) {
      console.error('[Discord Bot] Failed to send interaction acknowledgment:', err.message);
      return;
    }

    // 2. Dispatch command execution
    this.executeCommand(commandName, options, interaction);
  }

  // ── Update Interaction Message Embed ───────────────────────────────
  async updateInteractionResponse(interactionToken, embedData, files = null) {
    try {
      if (files && files.length > 0) {
        // Upload with multipart/form-data
        await this.sendMultipartWebhook(interactionToken, embedData, files);
      } else {
        await this.discordRequest(`/webhooks/${this.clientId}/${interactionToken}/messages/@original`, 'PATCH', {
          embeds: [embedData]
        });
      }
    } catch (err) {
      // Ignore background rate limit / edit errors
    }
  }

  sendMultipartWebhook(interactionToken, embedData, files) {
    return new Promise((resolve, reject) => {
      const boundary = '----NyxDlpBoundary' + Math.random().toString(36).slice(2);
      const url = new URL(`${DISCORD_API_BASE}/webhooks/${this.clientId}/${interactionToken}/messages/@original`);

      const payloadJson = JSON.stringify({
        embeds: [embedData],
        attachments: files.map((f, idx) => ({ id: idx, filename: f.name }))
      });

      const bodyChunks = [];
      bodyChunks.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="payload_json"\r\nContent-Type: application/json\r\n\r\n${payloadJson}\r\n`));

      files.forEach((f, idx) => {
        bodyChunks.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="files[${idx}]"; filename="${f.name}"\r\nContent-Type: application/octet-stream\r\n\r\n`));
        bodyChunks.push(f.data);
        bodyChunks.push(Buffer.from('\r\n'));
      });
      bodyChunks.push(Buffer.from(`--${boundary}--\r\n`));

      const totalLength = bodyChunks.reduce((acc, cur) => acc + cur.length, 0);

      const req = https.request({
        hostname: url.hostname,
        port: 443,
        path: url.pathname + url.search,
        method: 'PATCH',
        headers: {
          'Content-Type': `multipart/form-data; boundary=${boundary}`,
          'Content-Length': totalLength,
          'User-Agent': `DiscordBot (nyx-dlp, ${require('../package.json').version || '4.0.1'})`
        },
        timeout: 60000
      }, (res) => {
        res.on('data', () => {});
        res.on('end', () => resolve(true));
      });

      req.on('error', reject);
      bodyChunks.forEach(chunk => req.write(chunk));
      req.end();
    });
  }

  // ── Command Execution Router ───────────────────────────────────────
  async executeCommand(commandName, options, interaction) {
    const token = interaction.token;
    const destDir = this.getEffectiveDownloadDir();
    try { fs.mkdirSync(destDir, { recursive: true }); } catch (_) {}

const TOOL_META = {
  ytdlp: { name: 'yt-dlp', emoji: '🎬', cmd: '/ytdlp url:<link>' },
  batch: { name: 'Batch Downloader', emoji: '📦', cmd: '/batch urls:<links>' },
  livestream: { name: 'Live Stream Archiver', emoji: '🔴', cmd: '/livestream url:<link>' },
  m3u8: { name: 'M3U8 Downloader', emoji: '🌐', cmd: '/m3u8 url:<link>' },
  gallerydl: { name: 'gallery-dl', emoji: '🖼️', cmd: '/gallerydl url:<link>' },
  splitter: { name: 'Video Splitter', emoji: '✂️', cmd: '/splitter file:<path> parts:<num>' },
  concat: { name: 'Video Concatenator', emoji: '🎞️', cmd: '/concat files:<paths> output_name:<name>' },
  encoder: { name: 'Video Encoder', emoji: '⚡', cmd: '/encoder file:<path>' },
  ia: { name: 'Internet Archive', emoji: '🏛️', cmd: '/ia action:download identifier:<id>' },
  all: { name: 'All Tools', emoji: '🚀', cmd: '/ytdlp, /batch, /livestream, etc.' }
};

function makeAsciiProgressBar(percentStr, barLength = 10) {
  if (!percentStr) return '`[░░░░░░░░░░]` `In progress`';
  const num = parseFloat(String(percentStr).replace('%', ''));
  if (isNaN(num)) return '`[░░░░░░░░░░]` `In progress`';
  const clamped = Math.max(0, Math.min(100, num));
  const filled = Math.round((clamped / 100) * barLength);
  const empty = barLength - filled;
  return '`[' + '█'.repeat(filled) + '░'.repeat(empty) + ']` ' + `**${num.toFixed(1)}%**`;
}

    // Tool: Status
    if (commandName === 'status') {
      let freeSpaceGB = 'N/A';
      try {
        const stats = await fs.promises.statfs(destDir);
        freeSpaceGB = (stats.bfree * stats.bsize / (1024 * 1024 * 1024)).toFixed(1) + ' GB';
      } catch (_) {}

      await this.updateInteractionResponse(token, {
        title: '⚡ nyx-dlp Server Status',
        color: 0x5865f2,
        fields: [
          { name: 'Bot Name', value: `@${this.botUser?.username || 'nyx-bot'}`, inline: true },
          { name: 'Active Tasks', value: `${this.activeJobs.size}`, inline: true },
          { name: 'Free Storage', value: freeSpaceGB, inline: true },
          { name: 'Default Output Directory', value: `\`${destDir}\``, inline: false },
          { name: 'Host Platform', value: `${os.platform()} (${os.arch()})`, inline: true },
          { name: 'Engine Version', value: `nyx-dlp v${require('../package.json').version || '4.0.1'}`, inline: true }
        ],
        timestamp: new Date().toISOString()
      });
      return;
    }

    // Tool: Progress
    if (commandName === 'progress') {
      const selectedTool = options.tool || 'all';
      const allJobs = Array.from(this.activeJobs.values());
      const matchingJobs = selectedTool === 'all'
        ? allJobs
        : allJobs.filter(j => j.command === selectedTool);

      let freeSpaceGB = 'N/A';
      try {
        const stats = await fs.promises.statfs(destDir);
        freeSpaceGB = (stats.bfree * stats.bsize / (1024 * 1024 * 1024)).toFixed(1) + ' GB';
      } catch (_) {}

      const toolMeta = TOOL_META[selectedTool] || { name: selectedTool, emoji: '⚡', cmd: '/ytdlp' };

      if (matchingJobs.length === 0) {
        await this.updateInteractionResponse(token, {
          title: `${toolMeta.emoji} Task Progress — ${toolMeta.name}`,
          color: 0x4b5563,
          description: selectedTool === 'all'
            ? 'ℹ️ **No active tasks are currently running across any tools.**'
            : `ℹ️ **No active ${toolMeta.name} tasks are currently running.**`,
          fields: [
            { name: 'Active Tasks', value: '`0 running`', inline: true },
            { name: 'Total Active in App', value: `\`${allJobs.length} running\``, inline: true },
            { name: 'Free Storage', value: `\`${freeSpaceGB}\``, inline: true },
            { name: '💡 Start a Task', value: `Try running \`${toolMeta.cmd}\` to begin a task.`, inline: false }
          ],
          footer: { text: `nyx-dlp • ${new Date().toLocaleTimeString()}` },
          timestamp: new Date().toISOString()
        });
        return;
      }

      const fields = [];
      const displayLimit = 20;
      const displayedJobs = matchingJobs.slice(0, displayLimit);

      displayedJobs.forEach((j, idx) => {
        const jMeta = TOOL_META[j.command] || { name: j.command, emoji: '⚙️' };
        const rawTarget = j.options.url || j.options.file || (j.options.urls ? `${j.options.urls.slice(0, 30)}...` : '') || j.options.identifier || `Task #${idx + 1}`;
        let cleanTarget = rawTarget;
        try {
          if (cleanTarget.startsWith('http')) {
            const u = new URL(cleanTarget);
            cleanTarget = u.hostname + u.pathname;
          } else {
            cleanTarget = path.basename(cleanTarget);
          }
        } catch (_) {}
        if (cleanTarget.length > 50) cleanTarget = cleanTarget.slice(0, 47) + '...';

        const elapsedSec = Math.round((Date.now() - j.startTime) / 1000);
        const progressBar = makeAsciiProgressBar(j.lastPercent);

        let statsLine = progressBar;
        if (j.lastSpeed) statsLine += ` • \`${j.lastSpeed}\``;
        if (j.lastEta) statsLine += ` • ETA \`${j.lastEta}\``;

        let sourceLabel = '';
        if (j.source === 'Desktop App') {
          sourceLabel = '🖥️ **Desktop App**';
        } else if (j.source === 'Web Remote') {
          sourceLabel = '🌐 **Web Cockpit**';
        } else if (j.user) {
          sourceLabel = `👤 **${j.user}** (Discord)`;
        }

        let infoLine = `⏱ \`${elapsedSec}s elapsed\``;
        if (sourceLabel) infoLine += ` • ${sourceLabel}`;
        if (j.options.format && j.options.format !== 'bestvideo+bestaudio/best') infoLine += ` • 🎛 \`${j.options.format}\``;

        let logSnippet = '';
        if (j.lastLog) {
          const cleanLog = j.lastLog.replace(/[`\r\n]/g, ' ').trim().slice(-100);
          if (cleanLog) logSnippet = `\n📝 \`${cleanLog}\``;
        }

        fields.push({
          name: `${jMeta.emoji} ${jMeta.name} — ${cleanTarget}`,
          value: `${statsLine}\n${infoLine}${logSnippet}`,
          inline: false
        });
      });

      if (matchingJobs.length > displayLimit) {
        fields.push({
          name: '➕ More Tasks',
          value: `*...and ${matchingJobs.length - displayLimit} more tasks active.*`,
          inline: false
        });
      }

      await this.updateInteractionResponse(token, {
        title: `📊 Active Progress — ${toolMeta.name} (${matchingJobs.length} Active)`,
        color: 0x3b82f6,
        description: `Live progress for **${matchingJobs.length}** running ${selectedTool === 'all' ? 'task' : toolMeta.name + ' task'}${matchingJobs.length === 1 ? '' : 's'}:`,
        fields: fields,
        footer: { text: `nyx-dlp • Free Storage: ${freeSpaceGB} • ${new Date().toLocaleTimeString()}` },
        timestamp: new Date().toISOString()
      });
      return;
    }

    // Tool: Help
    if (commandName === 'help') {
      await this.updateInteractionResponse(token, {
        title: '📖 nyx-dlp Slash Commands Guide',
        description: 'You can download, clip, archive, and encode media directly through this Discord bot!',
        color: 0x5865f2,
        fields: [
          { name: '`/ytdlp <url> [start_time] [end_time] [format] [client]`', value: 'Download single videos or clips with Smart-Cut.' },
          { name: '`/batch <urls> [rest] [skip_live]`', value: 'Download multiple URLs in a batch queue.' },
          { name: '`/livestream <url> [quality] [from_start]`', value: 'Archive YouTube live broadcasts via HLS chunks.' },
          { name: '`/m3u8 <url> [encode] [codec] [bitrate]`', value: 'Download and transcode M3U8 live/VOD streams.' },
          { name: '`/gallerydl <url> [filetypes]`', value: 'Download image galleries from 100+ sites.' },
          { name: '`/splitter <file> <parts>`', value: 'Split local video into N equal-duration parts.' },
          { name: '`/concat <files> <output_name>`', value: 'Merge multiple video files together.' },
          { name: '`/encoder <file> [quality] [vcodec]`', value: 'GPU hardware-accelerated transcoding.' },
          { name: '`/ia <action> <identifier>`', value: 'Upload or download from Internet Archive.' },
          { name: '`/progress [tool]`', value: 'Check live progress on active downloads across any or all tools.' },
          { name: '`/status`', value: 'Check server storage, active jobs, and host status.' }
        ],
        footer: { text: 'nyx-dlp • Automated Media Suite' }
      });
      return;
    }

    // Prepare active job tracker
    const job = {
      command: commandName,
      options: options,
      outputDir: destDir,
      source: 'Discord Bot',
      user: interaction.member?.user?.username || interaction.user?.username || 'User',
      userId: interaction.member?.user?.id || interaction.user?.id || '',
      logs: [],
      lastPercent: '',
      lastSpeed: '',
      lastEta: '',
      lastLog: '',
      lastUpdated: 0,
      startTime: Date.now()
    };
    this.activeJobs.set(token, job);

    const updateJobStatus = async (isFinished = false, exitCode = 0, finalFiles = []) => {
      const now = Date.now();
      if (!isFinished && (now - job.lastUpdated < 2500)) return; // Throttle to 2.5s
      job.lastUpdated = now;

      const recentLogs = job.logs.slice(-4).join('\n') || 'Initializing runner...';
      const durationSec = Math.round((now - job.startTime) / 1000);

      let title = `▶ Processing /${commandName}`;
      let color = 0x3b82f6; // Blue
      if (isFinished) {
        if (exitCode === 0) {
          title = `✔ Completed /${commandName}`;
          color = 0x10b981; // Green
        } else {
          title = `❌ Failed /${commandName}`;
          color = 0xef4444; // Red
        }
      }

      const fields = [];
      if (options.url) fields.push({ name: 'Target URL', value: `\`${options.url}\``, inline: false });
      if (options.file) fields.push({ name: 'Target File', value: `\`${options.file}\``, inline: false });
      if (job.lastPercent) fields.push({ name: 'Progress', value: `**${job.lastPercent}** (${job.lastSpeed || '0 KB/s'}, ETA: ${job.lastEta || 'N/A'})`, inline: true });
      fields.push({ name: 'Elapsed Time', value: `${durationSec}s`, inline: true });
      fields.push({ name: 'Output Folder', value: `\`${destDir}\``, inline: false });
      fields.push({ name: 'Live Logs', value: `\`\`\`text\n${recentLogs.slice(-800)}\n\`\`\``, inline: false });

      await this.updateInteractionResponse(token, {
        title,
        color,
        fields,
        footer: { text: `nyx-dlp • ${new Date().toLocaleTimeString()}` }
      }, finalFiles);
    };

    // Broadcast output listener
    const broadcast = async (data) => {
      if (data.type === 'stdout' || data.type === 'stderr') {
        extractProgress(data.text || '', job);
        updateJobStatus(false);
      }

      if (data.type === 'exit') {
        const exitCode = data.code || 0;
        this.activeJobs.delete(token);

        let recentFiles = [];
        const filesToAttach = [];
        try {
          if (fs.existsSync(destDir)) {
            const dirFiles = fs.readdirSync(destDir).map(f => path.join(destDir, f));
            // Find files modified in the last 3 minutes
            recentFiles = dirFiles.filter(f => {
              try {
                const stat = fs.statSync(f);
                return stat.isFile() && (Date.now() - stat.mtimeMs < 180000);
              } catch (_) { return false; }
            });

            // If a single file <= 24MB exists, attach it directly to Discord!
            if (exitCode === 0 && recentFiles.length === 1) {
              const fPath = recentFiles[0];
              const fStat = fs.statSync(fPath);
              if (fStat.size > 0 && fStat.size <= 24 * 1024 * 1024) {
                filesToAttach.push({
                  name: path.basename(fPath),
                  data: fs.readFileSync(fPath)
                });
              }
            }
          }
        } catch (_) {}

        // Record to History
        try {
          let toolName = 'Discord Download';
          if (commandName === 'ytdlp') {
            toolName = (options.start_time || options.end_time) ? 'Smart-Cut (Discord)' : 'yt-dlp (Discord)';
          } else if (commandName === 'batch') {
            toolName = 'Batch Downloader (Discord)';
          } else if (commandName === 'livestream') {
            toolName = 'Live Archiver (Discord)';
          } else if (commandName === 'm3u8') {
            toolName = 'M3U8 Downloader (Discord)';
          } else if (commandName === 'gallerydl') {
            toolName = 'gallery-dl (Discord)';
          } else if (commandName === 'splitter') {
            toolName = 'Video Splitter (Discord)';
          } else if (commandName === 'concat') {
            toolName = 'Video Concatenator (Discord)';
          } else if (commandName === 'encoder') {
            toolName = 'Video Encoder (Discord)';
          } else if (commandName === 'ia') {
            toolName = 'Internet Archive (Discord)';
          }

          let downloadName = '';
          if (recentFiles.length > 0) {
            downloadName = path.basename(recentFiles[0]);
          } else if (options.file) {
            downloadName = path.basename(options.file);
          } else if (options.url) {
            try {
              const urlObj = new URL(options.url);
              const pathPart = urlObj.pathname.split('/').filter(Boolean).pop();
              if (pathPart) downloadName = decodeURIComponent(pathPart);
            } catch (_) {
              downloadName = options.url.split(/[\\/]/).pop() || '';
            }
          } else if (options.output_name) {
            downloadName = options.output_name;
          } else if (options.identifier) {
            downloadName = options.identifier;
          }

          if (!downloadName) {
            downloadName = `Discord Job (/${commandName})`;
          }

          addHistoryEntry({
            id: Date.now() + '-' + Math.random().toString(36).slice(2, 7),
            date: new Date().toISOString(),
            tool: toolName,
            name: downloadName,
            source: options.url || options.file || options.urls || options.identifier || `/${commandName}`,
            output: destDir,
            status: exitCode === 0 ? 'success' : 'failed'
          });
        } catch (err) {
          console.error('[Discord Bot] Error saving history:', err.message);
        }

        await updateJobStatus(true, exitCode, filesToAttach);
      }
    };

    // 3. Dispatch to corresponding runners.js function
    try {
      switch (commandName) {
        case 'ytdlp': {
          let extraArgs = [];
          if (options.extra_args) {
            try { extraArgs = JSON.parse(options.extra_args); } catch (_) { extraArgs = options.extra_args.split(/\s+/); }
          }
          runners.runYtdlp({
            outputDir: destDir,
            url: options.url,
            format: options.format || 'bestvideo+bestaudio/best',
            startTime: options.start_time || '',
            endTime: options.end_time || '',
            container: options.container || 'mp4',
            client: options.client || 'default',
            extraArgs: extraArgs
          }, broadcast);
          break;
        }

        case 'batch': {
          const urlList = (options.urls || '').split(/[\s,]+/).filter(Boolean);
          runners.runBatch({
            outputDir: destDir,
            urls: urlList,
            format: options.format || 'bestvideo+bestaudio/best',
            rest: String(options.rest || 0),
            skipLive: !!options.skip_live,
            container: options.container || 'mp4'
          }, broadcast);
          break;
        }

        case 'livestream': {
          runners.runLivestream({
            outputDir: destDir,
            url: options.url,
            format: options.quality || 'best',
            fromStart: (options.from_start === false) ? 'n' : 'y',
            concurrent: String(options.concurrent || 5),
            client: options.client || 'default'
          }, broadcast);
          break;
        }

        case 'm3u8': {
          runners.runM3u8({
            outputDir: destDir,
            url: options.url,
            encode: !!options.encode,
            codec: options.codec || 'h264',
            bitrate: options.bitrate || '5M',
            resolution: options.resolution || '1920x1080'
          }, broadcast);
          break;
        }

        case 'gallerydl': {
          runners.runGalleryDl({
            outputDir: destDir,
            url: options.url,
            filetypes: options.filetypes || '',
            metadata: !!options.metadata
          }, broadcast);
          break;
        }

        case 'splitter': {
          runners.runSplitter({
            file: path.resolve(options.file),
            parts: String(options.parts),
            partsToSave: options.parts_to_save || '',
            outputDir: destDir
          }, broadcast);
          break;
        }

        case 'concat': {
          const files = (options.files || '').split(/[\s,]+/).map(f => path.resolve(f));
          runners.runConcatenator({
            files,
            output: options.output_name,
            quality: options.quality || 'high',
            forceEncode: !!options.force_encode,
            outputDir: destDir
          }, broadcast);
          break;
        }

        case 'encoder': {
          runners.runEncoder({
            files: [path.resolve(options.file)],
            quality: options.quality || 'high',
            vcodec: options.vcodec || '',
            acodec: options.acodec || 'aac',
            container: options.container || 'mp4',
            outputDir: destDir
          }, broadcast);
          break;
        }

        case 'ia': {
          if (options.action === 'upload') {
            const files = (options.files || '').split(/[\s,]+/).map(f => path.resolve(f));
            runners.runIaUpload({
              identifier: options.identifier,
              files,
              title: options.title || '',
              outputDir: destDir
            }, broadcast);
          } else if (options.action === 'download') {
            runners.runIaDownload({
              identifier: options.identifier,
              outputDir: destDir
            }, broadcast);
          } else {
            const isAuthed = await runners.checkIaAuth(true);
            broadcast({ type: 'stdout', text: isAuthed ? '✔ Internet Archive is authenticated.' : '⚠ Internet Archive is not logged in.' });
            broadcast({ type: 'exit', code: isAuthed ? 0 : 1 });
          }
          break;
        }

        default:
          broadcast({ type: 'error', text: `Unknown command /${commandName}` });
          broadcast({ type: 'exit', code: 1 });
      }
    } catch (err) {
      broadcast({ type: 'error', text: err.message });
      broadcast({ type: 'exit', code: 1 });
    }
  }

  // ── Stop / Disconnect Bot ──────────────────────────────────────────
  stop() {
    this.isManualStop = true;
    this.sessionId = null;
    this.sequence = null;
    this.reconnectAttempts = 0;
    const wasActive = this.ws !== null || this.status === 'connected' || this.status === 'connecting';
    this.cleanupHeartbeat();
    if (this.ws) {
      try {
        this.ws.removeAllListeners();
        this.ws.close();
      } catch (_) {}
      this.ws = null;
    }
    this.status = 'disconnected';
    this.notifyStatus('disconnected');
    if (wasActive) {
      console.log('[Discord Bot] Disconnected.');
    }
  }
}

// Singleton Instance
const discordBot = new DiscordBotManager();

module.exports = discordBot;
