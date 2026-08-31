/* ── Settings ─────────────────────────────────────────────── */
const SETTINGS_MAP = {
  'show-tool-livestream': { navTab: 'livestream' },
  'show-tool-ytdlp': { navTab: 'ytdlp' },
  'show-tool-batch': { navTab: 'batch' },
  'show-tool-m3u8': { navTab: 'm3u8' },
  'show-tool-gallery': { navTab: 'gallery' },
  'show-tool-splitter': { navTab: 'splitter' },
  'show-tool-concatenator': { navTab: 'concatenator' },
  'show-tool-encoder': { navTab: 'encoder' },
  'show-tool-ia': { navTab: 'ia' },
  'show-ls-quality': { el: 'ls-quality-group' },
  'show-yd-format': { el: 'yd-format-group' },
  'show-yd-client': { el: 'yd-client-group' },
  'show-batch-format': { el: 'batch-format-group' },
  'show-batch-client': { el: 'batch-client-group' },
  'show-batch-rest': { el: 'batch-rest-group' },
  'show-batch-skip-live': { el: 'batch-skip-live-group' },
  'show-concat-format': { el: 'concat-format-group' },
  'show-m3-encode': { el: 'm3-encode-group' },
  'show-gdl-filetypes': { el: 'gdl-filetypes-group' },
  'show-gdl-meta': { el: 'gdl-meta-group' },
  'show-ls-client': { el: 'ls-client-group' },
  'dep-use-bgutil': { el: 'dep-bgutil-url-group' },
  'show-disk-space': { custom: 'disk-space' },
  'minimize-to-tray': { custom: 'tray' },
  'run-on-startup': { custom: 'startup' },
  'start-minimized': { custom: 'start-minimized' },
  'auto-update': { custom: 'auto-update' },
  'show-update-popup': { custom: 'show-update-popup' },
  'discord-bot-enable': { custom: 'discord-bot' },
  'remote-access': { custom: 'remote-access' },
  'ntf-storage': { el: 'ntf-storage-group' },
  'save-history': { custom: 'save-history' },
  'history-exclude-ytdlp': {},
  'history-exclude-batch': {},
  'history-exclude-livestream': {},
  'history-exclude-m3u8': {},
  'history-exclude-gallery': {},
  'history-exclude-splitter': {},
  'history-exclude-concatenator': {},
  'history-exclude-encoder': {},
  'history-exclude-ia': {},
};
const SETTINGS_DEFAULTS = {
  'show-tool-livestream': true,
  'show-tool-ytdlp': true,
  'show-tool-batch': true,
  'show-tool-m3u8': true,
  'show-tool-gallery': true,
  'show-tool-splitter': true,
  'show-tool-concatenator': true,
  'show-tool-encoder': true,
  'show-tool-ia': true,
  'show-ls-quality': true,
  'show-yd-format': true,
  'show-yd-client': true,
  'show-batch-format': true,
  'show-batch-client': true,
  'show-batch-rest': true,
  'show-batch-skip-live': true,
  'show-concat-format': true,
  'show-m3-encode': true,
  'show-gdl-filetypes': true,
  'show-gdl-meta': true,
  'show-ls-client': true,
  'dep-use-bgutil': true,
  'dep-use-deno': true,
  'dep-install-gdl': true,
  'show-disk-space': false,
  'minimize-to-tray': false,
  'run-on-startup': false,
  'start-minimized': false,
  'auto-update': false,
  'show-update-popup': true,
  'discord-bot-enable': false,
  'remote-access': false,
  'ntf-storage': true,
  'save-history': true,
  'history-exclude-ytdlp': false,
  'history-exclude-batch': false,
  'history-exclude-livestream': false,
  'history-exclude-m3u8': false,
  'history-exclude-gallery': false,
  'history-exclude-splitter': false,
  'history-exclude-concatenator': false,
  'history-exclude-encoder': false,
  'history-exclude-ia': false,
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
    const navBtn = document.querySelector(`.nav-item[data-tab="${cfg.navTab}"]`);
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
  } else if (cfg.custom === 'startup') {
    if (window.api && window.api.setRunOnStartup) {
      window.api.setRunOnStartup(value);
    }
    const isLinux = (navigator.platform && navigator.platform.toLowerCase().includes('linux')) ||
      (navigator.userAgent && navigator.userAgent.toLowerCase().includes('linux')) ||
      (typeof process !== 'undefined' && process.platform === 'linux');
    if (value && isLinux && typeof openLinuxServiceModal === 'function') {
      openLinuxServiceModal();
    }
  } else if (cfg.custom === 'start-minimized') {
    if (window.api && window.api.setStartMinimized) {
      window.api.setStartMinimized(value);
    }
  } else if (cfg.custom === 'auto-update') {
    if (window.api && window.api.setAutoUpdate) {
      window.api.setAutoUpdate(value);
    }
  } else if (cfg.custom === 'show-update-popup') {
    const banner = document.getElementById('update-notification-banner');
    if (!value && banner) banner.style.display = 'none';
  } else if (cfg.custom === 'discord-bot') {
    const configGroup = document.getElementById('discord-bot-config-group');
    if (configGroup) configGroup.style.display = value ? 'flex' : 'none';
    if (!value) {
      if (window.api && window.api.stopDiscordBot) window.api.stopDiscordBot();
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
  } else if (cfg.custom === 'save-history') {
    const historyOptsGroup = document.getElementById('history-options-group');
    if (historyOptsGroup) {
      if (value) {
        historyOptsGroup.style.opacity = '1';
        historyOptsGroup.style.pointerEvents = 'auto';
        historyOptsGroup.querySelectorAll('input, select, button').forEach(el => el.disabled = false);
      } else {
        historyOptsGroup.style.opacity = '0.45';
        historyOptsGroup.style.pointerEvents = 'none';
        historyOptsGroup.querySelectorAll('input, select, button').forEach(el => el.disabled = true);
      }
    }
  }
}

// Ensure remote access reacts to changes
// ── Remote Web Access Controller ─────────────────────────────
const remotePortInput = document.getElementById('remote-access-port');
const remoteUserInput = document.getElementById('remote-access-user');
const remotePassInput = document.getElementById('remote-access-pass');
const remotePinInput = document.getElementById('remote-access-pin');
const remotePassToggle = document.getElementById('remote-access-pass-toggle');
const remotePinToggle = document.getElementById('remote-access-pin-toggle');
const remoteSaveBtn = document.getElementById('remote-access-save-btn');
const remoteResetBtn = document.getElementById('remote-access-reset-btn');
const remoteStatusMsg = document.getElementById('remote-access-status-msg');

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

if (remotePassToggle && remotePassInput) {
  remotePassToggle.addEventListener('click', () => {
    remotePassInput.type = remotePassInput.type === 'password' ? 'text' : 'password';
  });
}

if (remotePinToggle && remotePinInput) {
  remotePinToggle.addEventListener('click', () => {
    remotePinInput.type = remotePinInput.type === 'password' ? 'text' : 'password';
  });
}

if (remoteSaveBtn) {
  remoteSaveBtn.addEventListener('click', () => {
    const port = parseInt(remotePortInput?.value) || (window.location && window.location.port ? parseInt(window.location.port) : 3000);
    const user = remoteUserInput?.value?.trim() || 'admin';
    const pass = remotePassInput?.value?.trim() || 'secret';
    const pin = remotePinInput?.value?.trim() || '';

    const prevPass = localStorage.getItem('remote-access-pass') || 'secret';
    const prevPin = localStorage.getItem('remote-access-pin') || '';

    if ((pass !== prevPass || pin !== prevPin) && !confirm('Save updated Remote Web Access credentials?\nYou will use these credentials on your next login.')) {
      return;
    }

    localStorage.setItem('remote-access-port', String(port));
    localStorage.setItem('remote-access-user', user);
    localStorage.setItem('remote-access-pass', pass);
    localStorage.setItem('remote-access-pin', pin);

    if (window.api && window.api.syncUiState) {
      window.api.syncUiState({ id: 'remote-access-port', type: 'text', value: String(port) });
      window.api.syncUiState({ id: 'remote-access-user', type: 'text', value: user });
      window.api.syncUiState({ id: 'remote-access-pass', type: 'text', value: pass });
      window.api.syncUiState({ id: 'remote-access-pin', type: 'text', value: pin });
    }

    if (remoteStatusMsg) {
      remoteStatusMsg.innerHTML = `<span style="color:#10b981; font-weight:500;">✔ Credentials saved successfully!</span>`;
      setTimeout(() => {
        if (remoteStatusMsg) remoteStatusMsg.innerHTML = `<span style="color:var(--text-muted);">Credentials saved</span>`;
      }, 3000);
    }

    restartRemoteServer();
  });
}

if (remoteResetBtn) {
  remoteResetBtn.addEventListener('click', () => {
    if (!confirm('Reset Remote Web Access credentials to default (admin / secret)?')) {
      return;
    }
    if (remoteUserInput) remoteUserInput.value = 'admin';
    if (remotePassInput) remotePassInput.value = 'secret';
    if (remotePinInput) remotePinInput.value = '';

    localStorage.setItem('remote-access-user', 'admin');
    localStorage.setItem('remote-access-pass', 'secret');
    localStorage.setItem('remote-access-pin', '');

    if (window.api && window.api.syncUiState) {
      window.api.syncUiState({ id: 'remote-access-user', type: 'text', value: 'admin' });
      window.api.syncUiState({ id: 'remote-access-pass', type: 'text', value: 'secret' });
      window.api.syncUiState({ id: 'remote-access-pin', type: 'text', value: '' });
    }

    if (remoteStatusMsg) {
      remoteStatusMsg.innerHTML = `<span style="color:#f59e0b; font-weight:500;">Reset to defaults (admin / secret)</span>`;
      setTimeout(() => {
        if (remoteStatusMsg) remoteStatusMsg.innerHTML = `<span style="color:var(--text-muted);">Credentials saved</span>`;
      }, 3000);
    }

    restartRemoteServer();
  });
}

// Initialize settings correctly on startup
document.addEventListener('DOMContentLoaded', () => {
  const isBrowserRemote = !window.api || !window.api.setMinimizeToTray;
  const activeLocationPort = window.location && window.location.port ? window.location.port : null;

  if (remotePortInput) {
    if (isBrowserRemote && activeLocationPort) {
      remotePortInput.value = activeLocationPort;
      localStorage.setItem('remote-access-port', activeLocationPort);
    } else {
      remotePortInput.value = localStorage.getItem('remote-access-port') || '3000';
    }
  }
  if (remoteUserInput) {
    remoteUserInput.value = localStorage.getItem('remote-access-user') || 'admin';
  }
  if (remotePassInput) {
    remotePassInput.value = localStorage.getItem('remote-access-pass') || 'secret';
  }
  if (remotePinInput) {
    remotePinInput.value = localStorage.getItem('remote-access-pin') || '';
  }

  if (getSetting('remote-access')) {
    const port = parseInt(remotePortInput?.value) || 3000;
    const user = remoteUserInput?.value || 'admin';
    const pass = remotePassInput?.value || 'secret';
    const pin = remotePinInput?.value || '';
    if (window.api && window.api.startRemoteServer) window.api.startRemoteServer({ port, user, pass, pin });
  }

  // ── Updates Controller ──────────────────────────────────────
  const checkUpdatesBtn = document.getElementById('check-updates-btn');
  const downloadUpdateBtn = document.getElementById('download-update-btn');
  const downloadUpdateBtnText = document.getElementById('download-update-btn-text');
  const viewReleaseBtn = document.getElementById('view-release-btn');
  const updateStatusText = document.getElementById('update-status-text');
  const updateDetailsText = document.getElementById('update-details-text');
  const settingsProgressWrap = document.getElementById('settings-update-progress-wrap');
  const settingsProgressBar = document.getElementById('settings-update-progress-bar');
  const appVersion = (window.api && window.api.appVersion) ? 'v' + window.api.appVersion : '';

  let latestReleaseUrl = 'https://github.com/jt-ito/nyx-dlp/releases';
  let activeUpdateInfo = null;

  if (updateStatusText && appVersion) {
    updateStatusText.textContent = `Current version: ${appVersion}`;
  }

  function handleUpdateResult(res) {
    if (!res) return;
    if (res.error) {
      if (updateStatusText) updateStatusText.innerHTML = `<span style="color: var(--accent-danger);">Check failed:</span> ${res.error}`;
      if (updateDetailsText) updateDetailsText.textContent = 'Please check your internet connection.';
      return;
    }

    activeUpdateInfo = res;

    if (res.hasUpdate) {
      latestReleaseUrl = res.releaseUrl || latestReleaseUrl;
      if (updateStatusText) {
        updateStatusText.innerHTML = `<span style="color: var(--success); font-weight: 600;">Update Available:</span> v${res.latestVersion}`;
      }
      if (updateDetailsText) {
        updateDetailsText.innerHTML = res.releaseName ? `<strong>${res.releaseName}</strong>` : `Latest version on GitHub is ready to install.`;
      }
      if (downloadUpdateBtn) {
        downloadUpdateBtn.style.display = 'inline-flex';
        if (downloadUpdateBtnText) {
          downloadUpdateBtnText.textContent = res.downloadedPath ? 'Restart & Install' : (res.downloadUrl ? 'Install Update' : 'View Release');
        }
      }
      if (viewReleaseBtn) {
        viewReleaseBtn.style.display = 'inline-flex';
      }

      // Show top-level update banner only if user has enabled the popup toggle
      if (getSetting('show-update-popup')) {
        showUpdateBanner(res);
      }
    } else {
      if (updateStatusText) {
        updateStatusText.innerHTML = `<span style="color: var(--success);">✔ nyx-dlp is up to date</span> (${appVersion || 'v' + res.currentVersion})`;
      }
      if (updateDetailsText) {
        updateDetailsText.textContent = 'You have the latest release installed.';
      }
      if (downloadUpdateBtn) {
        downloadUpdateBtn.style.display = 'none';
      }
      if (viewReleaseBtn) {
        viewReleaseBtn.style.display = 'none';
      }
      if (settingsProgressWrap) {
        settingsProgressWrap.style.display = 'none';
      }
    }
  }

  if (checkUpdatesBtn) {
    checkUpdatesBtn.addEventListener('click', async () => {
      checkUpdatesBtn.disabled = true;
      const originalHtml = checkUpdatesBtn.innerHTML;
      checkUpdatesBtn.innerHTML = `
        <svg class="spin" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="animation: spin 1s linear infinite;"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
        <span>Checking...</span>
      `;
      if (updateStatusText) updateStatusText.textContent = 'Connecting to GitHub...';
      if (updateDetailsText) updateDetailsText.textContent = '';

      try {
        if (window.api && window.api.checkForUpdates) {
          const result = await window.api.checkForUpdates();
          handleUpdateResult(result);
        }
      } catch (err) {
        handleUpdateResult({ error: err.message });
      } finally {
        checkUpdatesBtn.disabled = false;
        checkUpdatesBtn.innerHTML = originalHtml;
      }
    });
  }

  if (downloadUpdateBtn) {
    downloadUpdateBtn.addEventListener('click', async () => {
      if (activeUpdateInfo?.downloadedPath) {
        if (window.api && window.api.installAppUpdate) {
          window.api.installAppUpdate(activeUpdateInfo.downloadedPath);
        }
        return;
      }

      if (activeUpdateInfo?.downloadUrl && window.api && window.api.downloadAppUpdate) {
        downloadUpdateBtn.disabled = true;
        if (downloadUpdateBtnText) downloadUpdateBtnText.textContent = 'Downloading... (0%)';
        if (settingsProgressWrap) settingsProgressWrap.style.display = 'block';
        if (settingsProgressBar) settingsProgressBar.style.width = '0%';

        try {
          const dlRes = await window.api.downloadAppUpdate(activeUpdateInfo);
          activeUpdateInfo.downloadedPath = dlRes.filePath;
          downloadUpdateBtn.disabled = false;
          if (downloadUpdateBtnText) downloadUpdateBtnText.textContent = 'Restart & Install';
          if (updateDetailsText) updateDetailsText.textContent = 'Update downloaded! Click Restart & Install to apply.';
        } catch (err) {
          downloadUpdateBtn.disabled = false;
          if (downloadUpdateBtnText) downloadUpdateBtnText.textContent = 'Retry Install';
          if (updateDetailsText) updateDetailsText.textContent = 'Download failed: ' + err.message;
        }
        return;
      }

      if (window.api && window.api.openExternal) {
        window.api.openExternal(latestReleaseUrl);
      } else {
        window.open(latestReleaseUrl, '_blank');
      }
    });
  }

  if (viewReleaseBtn) {
    viewReleaseBtn.addEventListener('click', () => {
      if (window.api && window.api.openExternal) {
        window.api.openExternal(latestReleaseUrl);
      } else {
        window.open(latestReleaseUrl, '_blank');
      }
    });
  }

  // Handle background auto-update event on startup
  if (window.api && window.api.onUpdateAvailable) {
    window.api.onUpdateAvailable((info) => {
      handleUpdateResult(info);
    });
  }

  // Handle download progress & completion events from main process
  if (window.api && window.api.onAppUpdateProgress) {
    window.api.onAppUpdateProgress((prog) => {
      const p = prog.percent || 0;
      if (settingsProgressBar) settingsProgressBar.style.width = p + '%';
      if (downloadUpdateBtnText && downloadUpdateBtn?.disabled) {
        downloadUpdateBtnText.textContent = `Downloading... (${p}%)`;
      }
      const bannerBar = document.getElementById('update-banner-progress-bar');
      if (bannerBar) bannerBar.style.width = p + '%';
    });
  }

  if (window.api && window.api.onAppUpdateDownloaded) {
    window.api.onAppUpdateDownloaded((data) => {
      if (activeUpdateInfo) {
        activeUpdateInfo.downloadedPath = data.filePath;
      }
      if (downloadUpdateBtn) {
        downloadUpdateBtn.disabled = false;
        if (downloadUpdateBtnText) downloadUpdateBtnText.textContent = 'Restart & Install';
      }
      if (updateDetailsText) {
        updateDetailsText.textContent = 'Update downloaded and ready to install.';
      }
      // Update banner state if visible
      const bannerInstallBtn = document.getElementById('update-banner-install-btn');
      const bannerDesc = document.getElementById('update-banner-desc');
      if (bannerInstallBtn) {
        bannerInstallBtn.style.display = 'inline-flex';
        bannerInstallBtn.disabled = false;
        bannerInstallBtn.textContent = 'Restart & Install';
        bannerInstallBtn.onclick = () => {
          if (window.api && window.api.installAppUpdate) {
            window.api.installAppUpdate(data.filePath);
          }
        };
      }
      if (bannerDesc) {
        bannerDesc.textContent = 'Update is downloaded and ready to install.';
        bannerDesc.style.display = 'block';
      }
    });
  }

  // ── Discord Bot Controller ──────────────────────────────────
  const discordTokenInput = document.getElementById('discord-bot-token');
  const discordClientIdInput = document.getElementById('discord-bot-client-id');
  const discordDownloadDir = document.getElementById('discord-download-dir');
  const discordBrowseDirBtn = document.getElementById('discord-browse-dir');
  const discordInviteUrlInput = document.getElementById('discord-invite-url');
  const discordCopyInviteBtn = document.getElementById('discord-copy-invite');
  const discordOpenInviteBtn = document.getElementById('discord-open-invite');
  const discordConnectBtn = document.getElementById('discord-connect-btn');
  const discordSyncCmdsBtn = document.getElementById('discord-sync-commands-btn');
  const discordStatusBadge = document.getElementById('discord-status-badge');
  const discordLogStatus = document.getElementById('discord-log-status');
  const discordToggleTokenVis = document.getElementById('discord-toggle-token-vis');
  const discordDevPortalLink = document.getElementById('discord-dev-portal-link');

  function calculateInviteUrl(clientId) {
    if (!clientId) return '';
    return `https://discord.com/oauth2/authorize?client_id=${clientId}&scope=bot%20applications.commands&permissions=274878024704`;
  }

  function extractClientIdFromToken(token) {
    if (!token || typeof token !== 'string') return '';
    const trimmed = token.trim();
    const parts = trimmed.split('.');
    if (parts.length >= 2) {
      try {
        const decoded = atob(parts[0]);
        if (/^\d{17,21}$/.test(decoded)) {
          return decoded;
        }
      } catch (_) { }
    }
    return '';
  }

  function handleTokenOrClientChange() {
    const token = discordTokenInput?.value?.trim() || '';
    const extractedId = extractClientIdFromToken(token);

    if (extractedId && discordClientIdInput && !discordClientIdInput.value) {
      discordClientIdInput.value = extractedId;
    }

    const clientId = discordClientIdInput?.value?.trim() || extractedId;
    if (discordInviteUrlInput) {
      discordInviteUrlInput.value = calculateInviteUrl(clientId);
    }
  }

  if (discordTokenInput) {
    discordTokenInput.addEventListener('input', handleTokenOrClientChange);
    discordTokenInput.addEventListener('change', handleTokenOrClientChange);
    discordTokenInput.addEventListener('paste', () => setTimeout(handleTokenOrClientChange, 50));
  }

  if (discordClientIdInput) {
    discordClientIdInput.addEventListener('input', () => {
      const clientId = discordClientIdInput.value.trim();
      if (discordInviteUrlInput) {
        discordInviteUrlInput.value = calculateInviteUrl(clientId);
      }
    });
  }

  function updateDiscordStatusUI(data) {
    if (!data) return;
    const status = data.status || 'disconnected';
    const botUser = data.botUser;
    const token = discordTokenInput?.value?.trim() || '';
    const extractedId = extractClientIdFromToken(token);
    const clientId = data.clientId || data.savedClientId || extractedId || '';
    const inviteUrl = data.inviteUrl || calculateInviteUrl(clientId);

    if (discordInviteUrlInput && inviteUrl) {
      discordInviteUrlInput.value = inviteUrl;
    }
    if (discordClientIdInput && clientId && !discordClientIdInput.value) {
      discordClientIdInput.value = clientId;
    }

    if (discordStatusBadge) {
      if (status === 'connected') {
        const name = botUser?.username ? `@${botUser.username}` : 'Online';
        discordStatusBadge.style.background = 'rgba(16, 185, 129, 0.15)';
        discordStatusBadge.style.color = '#10b981';
        discordStatusBadge.textContent = `● Connected (${name})`;
      } else if (status === 'connecting') {
        discordStatusBadge.style.background = 'rgba(59, 130, 246, 0.15)';
        discordStatusBadge.style.color = '#3b82f6';
        discordStatusBadge.textContent = '● Connecting...';
      } else if (status === 'error') {
        discordStatusBadge.style.background = 'rgba(239, 68, 68, 0.15)';
        discordStatusBadge.style.color = '#ef4444';
        discordStatusBadge.textContent = '● Error';
      } else {
        discordStatusBadge.style.background = 'rgba(255, 255, 255, 0.06)';
        discordStatusBadge.style.color = 'var(--text-muted)';
        discordStatusBadge.textContent = 'Disconnected';
      }
    }

    if (discordConnectBtn) {
      if (status === 'connected') {
        discordConnectBtn.textContent = 'Disconnect';
        discordConnectBtn.className = 'btn btn-ghost';
      } else if (status === 'connecting') {
        discordConnectBtn.textContent = 'Connecting...';
        discordConnectBtn.className = 'btn btn-primary';
      } else {
        discordConnectBtn.textContent = 'Connect Bot';
        discordConnectBtn.className = 'btn btn-primary';
      }
    }

    if (discordLogStatus) {
      if (status === 'connected') {
        discordLogStatus.innerHTML = `<span style="color:#10b981;">✔ Online and listening for slash commands</span>`;
      } else if (status === 'error') {
        discordLogStatus.innerHTML = `<span style="color:#ef4444;">${data.error || 'Connection failed'}</span>`;
      } else if (status === 'connecting') {
        discordLogStatus.textContent = 'Connecting to Discord Gateway...';
      } else {
        discordLogStatus.textContent = 'Ready to connect';
      }
    }
  }

  // Load saved state on startup
  if (window.api && window.api.getDiscordBotStatus) {
    window.api.getDiscordBotStatus().then(statusObj => {
      if (discordTokenInput && statusObj.savedToken) discordTokenInput.value = statusObj.savedToken;
      if (discordClientIdInput && statusObj.savedClientId) discordClientIdInput.value = statusObj.savedClientId;
      let savedDir = statusObj.savedDownloadDir || statusObj.downloadDir;
      if (savedDir === 'undefined' || savedDir === 'null') savedDir = '';
      if (discordDownloadDir) {
        if (savedDir) {
          discordDownloadDir.value = savedDir;
        } else if (discordDownloadDir.value === 'undefined' || discordDownloadDir.value === 'null') {
          discordDownloadDir.value = '';
        }
      }
      handleTokenOrClientChange();
      updateDiscordStatusUI(statusObj);
    }).catch(() => { });
  }

  // Real-time Gateway status updates
  if (window.api && window.api.onDiscordBotStatus) {
    window.api.onDiscordBotStatus(updateDiscordStatusUI);
  }

  if (discordToggleTokenVis && discordTokenInput) {
    discordToggleTokenVis.addEventListener('click', () => {
      discordTokenInput.type = discordTokenInput.type === 'password' ? 'text' : 'password';
    });
  }

  if (discordDevPortalLink) {
    discordDevPortalLink.addEventListener('click', (e) => {
      e.preventDefault();
      const url = 'https://discord.com/developers/applications';
      if (window.api && window.api.openExternal) window.api.openExternal(url);
      else window.open(url, '_blank');
    });
  }

  if (discordBrowseDirBtn && discordDownloadDir) {
    discordBrowseDirBtn.addEventListener('click', async () => {
      let folder = null;
      if (window.api && window.api.pickFolder) {
        folder = await window.api.pickFolder();
      } else if (typeof window.pickRemoteDirectory === 'function') {
        folder = await window.pickRemoteDirectory(discordDownloadDir.value || '');
      }
      if (folder) {
        discordDownloadDir.value = folder;
        discordDownloadDir.dispatchEvent(new Event('input', { bubbles: true }));
        discordDownloadDir.dispatchEvent(new Event('change', { bubbles: true }));
        localStorage.setItem('field:discord-download-dir', folder);
        if (window.api && window.api.syncUiState) {
          window.api.syncUiState({ id: 'discord-download-dir', type: 'text', value: folder });
        }
      }
    });
  }

  if (discordDownloadDir) {
    discordDownloadDir.addEventListener('input', () => {
      localStorage.setItem('field:discord-download-dir', discordDownloadDir.value);
      if (window.api && window.api.syncUiState) {
        window.api.syncUiState({ id: 'discord-download-dir', type: 'text', value: discordDownloadDir.value });
      }
    });
    discordDownloadDir.addEventListener('change', () => {
      localStorage.setItem('field:discord-download-dir', discordDownloadDir.value);
      if (window.api && window.api.syncUiState) {
        window.api.syncUiState({ id: 'discord-download-dir', type: 'text', value: discordDownloadDir.value });
      }
    });
  }

  async function safeCopyToClipboard(text) {
    if (!text) return false;
    if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
      try {
        await navigator.clipboard.writeText(text);
        return true;
      } catch (_) { }
    }
    try {
      const textArea = document.createElement('textarea');
      textArea.value = text;
      textArea.style.position = 'fixed';
      textArea.style.left = '-9999px';
      textArea.style.top = '-9999px';
      textArea.setAttribute('readonly', '');
      document.body.appendChild(textArea);
      textArea.focus();
      textArea.select();
      const successful = document.execCommand('copy');
      document.body.removeChild(textArea);
      if (successful) return true;
    } catch (_) { }
    return false;
  }
  window.safeCopyToClipboard = safeCopyToClipboard;

  if (discordCopyInviteBtn && discordInviteUrlInput) {
    discordCopyInviteBtn.addEventListener('click', async () => {
      if (discordInviteUrlInput.value) {
        await safeCopyToClipboard(discordInviteUrlInput.value);
        const orig = discordCopyInviteBtn.textContent;
        discordCopyInviteBtn.textContent = 'Copied!';
        setTimeout(() => discordCopyInviteBtn.textContent = orig, 2000);
      }
    });
  }

  if (discordOpenInviteBtn && discordInviteUrlInput) {
    discordOpenInviteBtn.addEventListener('click', () => {
      if (discordInviteUrlInput.value) {
        if (window.api && window.api.openExternal) window.api.openExternal(discordInviteUrlInput.value);
        else window.open(discordInviteUrlInput.value, '_blank');
      }
    });
  }

  if (discordConnectBtn) {
    discordConnectBtn.addEventListener('click', async () => {
      if (discordConnectBtn.textContent === 'Disconnect') {
        if (window.api && window.api.stopDiscordBot) {
          const res = await window.api.stopDiscordBot();
          updateDiscordStatusUI(res);
        }
      } else {
        const token = discordTokenInput?.value || '';
        const clientId = discordClientIdInput?.value || '';
        const downloadDir = discordDownloadDir?.value || '';
        if (!token) {
          if (discordLogStatus) discordLogStatus.innerHTML = `<span style="color:#ef4444;">Please paste a Bot Token</span>`;
          return;
        }
        if (window.api && window.api.startDiscordBot) {
          discordConnectBtn.disabled = true;
          try {
            const res = await window.api.startDiscordBot({ token, clientId, downloadDir });
            updateDiscordStatusUI(res);
          } finally {
            discordConnectBtn.disabled = false;
          }
        }
      }
    });
  }

  if (discordSyncCmdsBtn) {
    discordSyncCmdsBtn.addEventListener('click', async () => {
      discordSyncCmdsBtn.disabled = true;
      const orig = discordSyncCmdsBtn.textContent;
      discordSyncCmdsBtn.textContent = 'Syncing...';
      try {
        if (window.api && window.api.syncDiscordCommands) {
          const res = await window.api.syncDiscordCommands();
          if (res && res.success) {
            if (discordLogStatus) discordLogStatus.innerHTML = `<span style="color:#10b981;">✔ All slash commands re-synced with Discord!</span>`;
          } else {
            if (discordLogStatus) discordLogStatus.innerHTML = `<span style="color:#ef4444;">Sync failed: ${res?.error || 'Unknown error'}</span>`;
          }
        }
      } finally {
        discordSyncCmdsBtn.disabled = false;
        discordSyncCmdsBtn.textContent = orig;
      }
    });
  }

  // ── Linux systemd Service Modal ──────────────────────────────
  const linuxSvcModal = document.getElementById('linux-service-modal');
  const closeLinuxSvcBtn = document.getElementById('close-linux-service-modal');
  const doneLinuxSvcBtn = document.getElementById('done-linux-service-modal');
  const viewLinuxSvcLink = document.getElementById('view-linux-svc-guide');
  const svcUserInput = document.getElementById('svc-user');
  const svcPortInput = document.getElementById('svc-port');
  const svcModeSelect = document.getElementById('svc-mode');
  const svcFilePreview = document.getElementById('svc-file-preview');
  const svcCmdPreview = document.getElementById('svc-cmd-preview');
  const copySvcFileBtn = document.getElementById('copy-svc-file-btn');
  const copySvcCmdBtn = document.getElementById('copy-svc-cmd-btn');

  function renderLinuxServiceTemplate() {
    const user = svcUserInput?.value?.trim() || 'jt';
    const port = svcPortInput?.value?.trim() || '3050';
    const mode = svcModeSelect?.value || 'server';
    const authUser = document.getElementById('remote-access-user')?.value?.trim() || 'admin';
    const authPass = document.getElementById('remote-access-pass')?.value?.trim() || 'secret';
    const authPin = document.getElementById('remote-access-pin')?.value?.trim() || '';

    let credArgs = `--user ${authUser} --pass ${authPass}`;
    if (authPin) {
      credArgs += ` --pin ${authPin}`;
    }

    let execCmd = `/usr/local/bin/nyx-dlp-cli server --port ${port} ${credArgs}`;
    let desc = 'nyx-dlp Remote Web Access Server';

    if (mode === 'discord') {
      execCmd = '/usr/local/bin/nyx-dlp-cli discord';
      desc = 'nyx-dlp Discord Bot Background Service';
    } else if (mode === 'gui') {
      execCmd = '/opt/nyx-dlp/nyx-dlp --minimized';
      desc = 'nyx-dlp Desktop Application';
    }

    const homeDir = user === 'root' ? '/root' : `/home/${user}`;

    const serviceContent = `[Unit]
Description=${desc}
After=network.target

[Service]
Type=simple
User=${user}
WorkingDirectory=${homeDir}
ExecStart=${execCmd}
Restart=always
RestartSec=5
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target`;

    if (svcFilePreview) svcFilePreview.value = serviceContent;

    const quickCmd = `sudo tee /etc/systemd/system/nyx-dlp.service > /dev/null << 'EOF'
${serviceContent}
EOF
sudo systemctl daemon-reload && sudo systemctl enable --now nyx-dlp`;

    if (svcCmdPreview) svcCmdPreview.value = quickCmd;
  }

  window.openLinuxServiceModal = function () {
    if (!linuxSvcModal) return;
    if (svcUserInput && !svcUserInput.value) {
      svcUserInput.value = (typeof os !== 'undefined' && os.userInfo ? os.userInfo().username : '') || 'jt';
    }
    if (svcPortInput && !svcPortInput.value) {
      const portVal = document.getElementById('remote-access-port')?.value || '3050';
      svcPortInput.value = portVal;
    }
    renderLinuxServiceTemplate();
    linuxSvcModal.style.display = 'flex';
  };

  if (viewLinuxSvcLink) {
    viewLinuxSvcLink.addEventListener('click', (e) => {
      e.preventDefault();
      window.openLinuxServiceModal();
    });
  }

  if (closeLinuxSvcBtn) closeLinuxSvcBtn.addEventListener('click', () => { linuxSvcModal.style.display = 'none'; });
  if (doneLinuxSvcBtn) doneLinuxSvcBtn.addEventListener('click', () => { linuxSvcModal.style.display = 'none'; });
  if (linuxSvcModal) {
    linuxSvcModal.addEventListener('click', (e) => {
      if (e.target === linuxSvcModal) linuxSvcModal.style.display = 'none';
    });
  }

  [svcUserInput, svcPortInput, svcModeSelect].forEach(el => {
    if (el) {
      el.addEventListener('input', renderLinuxServiceTemplate);
      el.addEventListener('change', renderLinuxServiceTemplate);
    }
  });

  if (copySvcFileBtn && svcFilePreview) {
    copySvcFileBtn.addEventListener('click', async () => {
      await safeCopyToClipboard(svcFilePreview.value);
      const orig = copySvcFileBtn.textContent;
      copySvcFileBtn.textContent = 'Copied!';
      setTimeout(() => copySvcFileBtn.textContent = orig, 1800);
    });
  }

  if (copySvcCmdBtn && svcCmdPreview) {
    copySvcCmdBtn.addEventListener('click', async () => {
      await safeCopyToClipboard(svcCmdPreview.value);
      const orig = copySvcCmdBtn.textContent;
      copySvcCmdBtn.textContent = 'Copied Commands!';
      setTimeout(() => copySvcCmdBtn.textContent = orig, 1800);
    });
  }

  // ── History Exclude Sites Tag Manager ──────────────────────
  const siteInput = document.getElementById('history-exclude-site-input');
  const addSiteBtn = document.getElementById('history-exclude-add-btn');
  const hiddenSitesInput = document.getElementById('history-exclude-sites');
  const tagsContainer = document.getElementById('history-exclude-tags');

  function getExcludedSitesList() {
    const raw = localStorage.getItem('field:history-exclude-sites') || hiddenSitesInput?.value || '';
    return raw.split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
  }

  function saveExcludedSitesList(list) {
    const unique = Array.from(new Set(list));
    const val = unique.join(', ');
    if (hiddenSitesInput) {
      hiddenSitesInput.value = val;
      hiddenSitesInput.dispatchEvent(new Event('input', { bubbles: true }));
      hiddenSitesInput.dispatchEvent(new Event('change', { bubbles: true }));
    }
    localStorage.setItem('field:history-exclude-sites', val);
    if (window.api && window.api.syncUiState) {
      window.api.syncUiState({ id: 'history-exclude-sites', type: 'text', value: val });
    }
    renderExcludedSitesTags();
  }

  function cleanDomain(input) {
    let s = input.trim().toLowerCase();
    s = s.replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/.*$/, '').trim();
    return s;
  }

  function addSitesFromInput() {
    if (!siteInput) return;
    const val = siteInput.value.trim();
    if (!val) return;

    const parts = val.split(/[\s,\n]+/).map(cleanDomain).filter(Boolean);
    if (parts.length === 0) return;

    const current = getExcludedSitesList();
    parts.forEach(p => {
      if (!current.includes(p)) current.push(p);
    });

    saveExcludedSitesList(current);
    siteInput.value = '';
    siteInput.classList.add('flash-highlight');
    setTimeout(() => siteInput.classList.remove('flash-highlight'), 600);
  }

  function renderExcludedSitesTags() {
    if (!tagsContainer) return;
    tagsContainer.innerHTML = '';
    const sites = getExcludedSitesList();
    if (sites.length === 0) {
      tagsContainer.innerHTML = '<span style="font-size: 11.5px; color: var(--text-muted); font-style: italic;">No sites excluded yet.</span>';
      return;
    }

    sites.forEach((site) => {
      const tag = document.createElement('div');
      tag.className = 'site-tag';
      tag.innerHTML = `
        <span>${site}</span>
        <button type="button" class="site-tag-remove" title="Remove ${site}">✕</button>
      `;
      tag.querySelector('.site-tag-remove').addEventListener('click', (e) => {
        e.stopPropagation();
        const updated = getExcludedSitesList().filter(s => s !== site);
        saveExcludedSitesList(updated);
      });
      tagsContainer.appendChild(tag);
    });
  }

  if (siteInput) {
    siteInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        addSitesFromInput();
      }
    });
  }

  if (addSiteBtn) {
    addSiteBtn.addEventListener('click', () => {
      addSitesFromInput();
    });
  }

  renderExcludedSitesTags();
});

function showUpdateBanner(info) {
  if (!info) info = { latestVersion: '4.1.0', releaseName: 'v4.1.0 Preview' };
  if (!info.force && !getSetting('show-update-popup')) return;
  const banner = document.getElementById('update-notification-banner');
  if (!banner) return;
  const verSpan = document.getElementById('update-banner-version');
  if (verSpan) verSpan.textContent = 'v' + (info.latestVersion || '4.1.0');
  banner.style.display = 'flex';

  const installBtn = document.getElementById('update-banner-install-btn');
  const viewBtn = document.getElementById('update-banner-view-btn');
  const dismissBtn = document.getElementById('update-banner-dismiss-btn');
  const bannerDesc = document.getElementById('update-banner-desc');
  const progressWrap = document.getElementById('update-banner-progress-wrap');

  if (info.downloadedPath) {
    if (installBtn) {
      installBtn.style.display = 'inline-flex';
      installBtn.disabled = false;
      installBtn.textContent = 'Restart & Install';
      installBtn.onclick = () => {
        if (window.api && window.api.installAppUpdate) window.api.installAppUpdate(info.downloadedPath);
      };
    }
    if (bannerDesc) {
      bannerDesc.textContent = 'Update is downloaded and ready to install.';
      bannerDesc.style.display = 'block';
    }
  } else if (info.downloadUrl && window.api && window.api.downloadAppUpdate) {
    if (installBtn) {
      installBtn.style.display = 'inline-flex';
      installBtn.disabled = false;
      installBtn.textContent = 'Update Now';
      installBtn.onclick = async () => {
        installBtn.disabled = true;
        installBtn.textContent = 'Downloading...';
        if (progressWrap) progressWrap.style.display = 'block';
        try {
          const dlRes = await window.api.downloadAppUpdate(info);
          installBtn.disabled = false;
          installBtn.textContent = 'Restart & Install';
          info.downloadedPath = dlRes.filePath;
          installBtn.onclick = () => {
            if (window.api && window.api.installAppUpdate) window.api.installAppUpdate(dlRes.filePath);
          };
          if (bannerDesc) {
            bannerDesc.textContent = 'Update downloaded! Click Restart & Install to apply.';
            bannerDesc.style.display = 'block';
          }
        } catch (err) {
          installBtn.disabled = false;
          installBtn.textContent = 'Retry Update';
          if (bannerDesc) {
            bannerDesc.textContent = 'Download failed: ' + err.message;
            bannerDesc.style.display = 'block';
          }
        }
      };
    }
  } else if (installBtn) {
    installBtn.style.display = 'none';
  }

  if (viewBtn) {
    viewBtn.onclick = () => {
      const url = info.releaseUrl || 'https://github.com/jt-ito/nyx-dlp/releases';
      if (window.api && window.api.openExternal) window.api.openExternal(url);
      else window.open(url, '_blank');
    };
  }

  if (dismissBtn) {
    dismissBtn.onclick = () => {
      banner.style.display = 'none';
    };
  }
}

window.showUpdateBanner = showUpdateBanner;
