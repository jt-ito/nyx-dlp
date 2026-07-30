/* ── Settings ─────────────────────────────────────────────── */
const SETTINGS_MAP = {
  'show-tool-livestream': { navTab: 'livestream' },
  'show-tool-ytdlp':      { navTab: 'ytdlp' },
  'show-tool-batch':      { navTab: 'batch' },
  'show-tool-m3u8':       { navTab: 'm3u8' },
  'show-tool-gallery':    { navTab: 'gallery' },
  'show-tool-splitter':   { navTab: 'splitter' },
  'show-tool-concatenator': { navTab: 'concatenator' },
  'show-tool-encoder':    { navTab: 'encoder' },
  'show-tool-ia':         { navTab: 'ia' },
  'show-ls-quality':      { el: 'ls-quality-group' },
  'show-yd-format':       { el: 'yd-format-group' },
  'show-yd-client':       { el: 'yd-client-group' },
  'show-batch-format':    { el: 'batch-format-group' },
  'show-batch-client':    { el: 'batch-client-group' },
  'show-batch-rest':      { el: 'batch-rest-group' },
  'show-batch-skip-live': { el: 'batch-skip-live-group' },
  'show-concat-format':   { el: 'concat-format-group' },
  'show-m3-encode':       { el: 'm3-encode-group' },
  'show-gdl-filetypes':   { el: 'gdl-filetypes-group' },
  'show-gdl-meta':        { el: 'gdl-meta-group' },
  'show-ls-client':       { el: 'ls-client-group' },
  'dep-use-bgutil':       { el: 'dep-bgutil-url-group' },
  'show-disk-space':      { custom: 'disk-space' },
  'minimize-to-tray':     { custom: 'tray' },
  'remote-access':        { custom: 'remote-access' },
};
const SETTINGS_DEFAULTS = {
  'show-tool-livestream': true,
  'show-tool-ytdlp':      true,
  'show-tool-batch':      true,
  'show-tool-m3u8':       true,
  'show-tool-gallery':    true,
  'show-tool-splitter':   true,
  'show-tool-concatenator': true,
  'show-tool-encoder':    true,
  'show-tool-ia':         true,
  'show-ls-quality':      true,
  'show-yd-format':       true,
  'show-yd-client':       true,
  'show-batch-format':    true,
  'show-batch-client':    true,
  'show-batch-rest':      true,
  'show-batch-skip-live': true,
  'show-concat-format':   true,
  'show-m3-encode':       true,
  'show-gdl-filetypes':   true,
  'show-gdl-meta':        true,
  'show-ls-client':       true,
  'dep-use-bgutil':       true,
  'dep-use-deno':         true,
  'dep-install-gdl':      true,
  'show-disk-space':      false,
  'minimize-to-tray':     false,
  'remote-access':        false,
};

function getSetting(key) {
  const stored = localStorage.getItem('setting:' + key);
  if (stored === null) return SETTINGS_DEFAULTS[key] !== false;
  return stored === 'true';
}

function applySetting(key, value) {
  const cfg = SETTINGS_MAP[key];
  if (!cfg) return;
  if (cfg.navTab) {
    const navBtn   = document.querySelector(`.nav-item[data-tab="${cfg.navTab}"]`);
    const tabPanel = document.getElementById('tab-' + cfg.navTab);
    if (navBtn) navBtn.style.display = value ? '' : 'none';
    if (tabPanel && !value && tabPanel.classList.contains('active')) {
      const first = document.querySelector('.nav-item[data-tab]:not([style*="none"])');
      if (first) first.click();
    }
  } else if (cfg.el) {
    const el = document.getElementById(cfg.el);
    if (el) el.style.display = value ? '' : 'none';
  } else if (cfg.custom === 'disk-space') {
    // diskSpace is defined later in disk-space.js — called lazily, safe
    if (typeof diskSpace !== 'undefined') diskSpace.setEnabled(value);
  } else if (cfg.custom === 'tray') {
    if (window.api && window.api.setMinimizeToTray) {
      window.api.setMinimizeToTray(value);
    }
  } else if (cfg.custom === 'remote-access') {
    const portGroup = document.getElementById('remote-access-port-group');
    if (portGroup) portGroup.style.display = value ? 'flex' : 'none';
    
    if (value) {
      const portInput = document.getElementById('remote-access-port');
      const userInput = document.getElementById('remote-access-user');
      const passInput = document.getElementById('remote-access-pass');
      const pinInput = document.getElementById('remote-access-pin');
      
      const port = parseInt(portInput?.value) || 3000;
      const user = userInput?.value || 'admin';
      const pass = passInput?.value || 'secret';
      const pin = pinInput?.value || '';
      
      if (window.api && window.api.startRemoteServer) {
        window.api.startRemoteServer({ port, user, pass, pin });
      }
    } else {
      if (window.api && window.api.stopRemoteServer) window.api.stopRemoteServer();
    }
  }
}

// Ensure remote access reacts to changes
const remotePortInput = document.getElementById('remote-access-port');
const remoteUserInput = document.getElementById('remote-access-user');
const remotePassInput = document.getElementById('remote-access-pass');
const remotePinInput = document.getElementById('remote-access-pin');

function restartRemoteServer() {
  if (getSetting('remote-access')) {
    if (window.api && window.api.stopRemoteServer) window.api.stopRemoteServer();
    const port = parseInt(remotePortInput?.value) || 3000;
    const user = remoteUserInput?.value || 'admin';
    const pass = remotePassInput?.value || 'secret';
    const pin = remotePinInput?.value || '';
    setTimeout(() => {
      if (window.api && window.api.startRemoteServer) window.api.startRemoteServer({ port, user, pass, pin });
    }, 200);
  }
}

if (remotePortInput) remotePortInput.addEventListener('change', restartRemoteServer);
if (remoteUserInput) remoteUserInput.addEventListener('change', restartRemoteServer);
if (remotePassInput) remotePassInput.addEventListener('change', restartRemoteServer);
if (remotePinInput) remotePinInput.addEventListener('change', restartRemoteServer);

// Initialize settings correctly on startup
document.addEventListener('DOMContentLoaded', () => {
  if (remotePortInput) {
    remotePortInput.value = localStorage.getItem('remote-access-port') || '3000';
    remotePortInput.addEventListener('input', e => localStorage.setItem('remote-access-port', e.target.value));
  }
  if (remoteUserInput) {
    remoteUserInput.value = localStorage.getItem('remote-access-user') || 'admin';
    remoteUserInput.addEventListener('input', e => localStorage.setItem('remote-access-user', e.target.value));
  }
  if (remotePassInput) {
    remotePassInput.value = localStorage.getItem('remote-access-pass') || 'secret';
    remotePassInput.addEventListener('input', e => localStorage.setItem('remote-access-pass', e.target.value));
  }

  if (getSetting('remote-access')) {
    const port = parseInt(remotePortInput?.value) || 3000;
    const user = remoteUserInput?.value || 'admin';
    const pass = remotePassInput?.value || 'secret';
    if (window.api && window.api.startRemoteServer) window.api.startRemoteServer({ port, user, pass });
  }
});
