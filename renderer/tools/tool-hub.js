/**
 * Downloader Tools & Engines Hub
 * Manages standalone binaries (yt-dlp, FFmpeg, gallery-dl, Streamlink, IA CLI, Deno)
 * Checking for updates, upgrading, and downgrading/switching versions.
 */

(function() {
  const container = document.getElementById('tool-hub-cards-container');
  const refreshAllBtn = document.getElementById('tool-hub-refresh-all-btn');
  const checkAllBtn = document.getElementById('tool-hub-check-all-btn');
  const updateAllBtn = document.getElementById('tool-hub-update-all-btn');
  const openVendorBtn = document.getElementById('tool-hub-open-vendor-btn');
  const backBtn = document.getElementById('tool-hub-back-btn');
  const settingsHubBtn = document.getElementById('open-tool-hub-btn');

  const CACHE_TOOLS_KEY = 'nyx-tool-hub-cache';
  const CACHE_UPDATES_KEY = 'nyx-tool-hub-updates-cache';

  const TOOL_ICONS = {
    ytdlp: `<img src="assets/yt-dlp.png" alt="yt-dlp" class="tool-icon-img" width="28" height="28" draggable="false" />`,
    ffmpeg: `<img src="assets/ffmpeg.svg" alt="FFmpeg" class="tool-icon-img" width="28" height="28" draggable="false" />`,
    gallerydl: `<svg width="22" height="22" viewBox="0 0 24 24" fill="none"><rect x="3" y="3" width="7" height="7" rx="1.5" stroke="currentColor" stroke-width="2"/><rect x="14" y="3" width="7" height="7" rx="1.5" stroke="currentColor" stroke-width="2"/><rect x="3" y="14" width="7" height="7" rx="1.5" stroke="currentColor" stroke-width="2"/><rect x="14" y="14" width="7" height="7" rx="1.5" stroke="currentColor" stroke-width="2"/></svg>`,
    streamlink: `<img src="assets/streamlink.svg" alt="Streamlink" class="tool-icon-img" width="28" height="28" draggable="false" />`,
    ia: `<svg width="22" height="22" viewBox="0 0 76 86" xmlns="http://www.w3.org/2000/svg" style="margin-left: -1px; margin-right: 1px;"><path d="m76 82v4h-76l.00080851-4zm-3-6v5h-70v-5zm-62.6696277-54 .8344146.4217275.4176066 6.7436084.4176065 10.9576581v10.5383496l-.4176065 13.1364492-.0694681 8.8498268-1.1825531.3523804h-4.17367003l-1.25202116-.3523804-.48627608-8.8498268-.41840503-13.0662957v-10.5375432l.41840503-11.028618.38167482-6.7798947.87034634-.3854412zm60.0004653 0 .8353798.4217275.4168913 6.7436084.4168913 10.9576581v10.5383496l-.4168913 13.1364492-.0686832 8.8498268-1.1835879.3523804h-4.1737047l-1.2522712-.3523804-.4879704-8.8498268-.4168913-13.0662957v-10.5375432l.4168913-11.028618.3833483-6.7798947.8697215-.3854412zm-42.000632 0 .8344979.4217275.4176483 6.7436084.4176482 10.9576581v10.5383496l-.4176482 13.1364492-.0686764 8.8498268-1.1834698.3523804h-4.1740866l-1.2529447-.3523804-.4863246-8.8498268-.41840503-13.0662957v-10.5375432l.41840503-11.028618.38331-6.7798947.8688361-.3854412zm23 0 .8344979.4217275.4176483 6.7436084.4176482 10.9576581v10.5383496l-.4176482 13.1364492-.0686764 8.8498268-1.1834698.3523804h-4.1740866l-1.2521462-.3523804-.4871231-8.8498268-.4168497-13.0662957v-10.5375432l.4168497-11.028618.38331-6.7798947.8696347-.3854412zm21.6697944-9v7h-70v-7zm-35.7200748-13 36.7200748 8.4088317-1.4720205 2.5911683h-70.32799254l-2.19998696-2.10140371z" fill="currentColor" fill-rule="evenodd"/></svg>`,
    deno: `<img src="assets/deno.svg" alt="Deno" class="tool-icon-img" width="28" height="28" draggable="false" />`
  };

  // Cached state restored from localStorage for instant, zero-delay rendering
  let toolsData = {};
  let updateData = {};

  try {
    const rawTools = localStorage.getItem(CACHE_TOOLS_KEY);
    if (rawTools) {
      const parsed = JSON.parse(rawTools);
      if (parsed && typeof parsed === 'object' && Object.keys(parsed).length > 0) {
        toolsData = parsed;
      }
    }
    const rawUpdates = localStorage.getItem(CACHE_UPDATES_KEY);
    if (rawUpdates) {
      const parsed = JSON.parse(rawUpdates);
      if (parsed && typeof parsed === 'object') {
        updateData = parsed;
      }
    }
  } catch (_) {}


  function showToast(msg, type = 'info', title = null) {
    if (typeof window.showNotificationToast === 'function') {
      window.showNotificationToast(msg, type, title);
    } else {
      console.log(`[Toast ${type}] ${msg}`);
    }
  }

  // ── Navigation wiring ────────────────────────────────────────────────
  if (settingsHubBtn) {
    settingsHubBtn.addEventListener('click', () => {
      if (typeof window.switchTab === 'function') {
        window.switchTab('tool-hub');
      } else {
        document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
        const panel = document.getElementById('tab-tool-hub');
        if (panel) panel.classList.add('active');
      }
      const contentEl = document.querySelector('.content');
      if (contentEl) contentEl.scrollTop = 0;
      const hubPanel = document.getElementById('tab-tool-hub');
      if (hubPanel) {
        hubPanel._savedScroll = 0;
        hubPanel.scrollTop = 0;
      }
      loadAllTools();
    });
  }

  if (backBtn) {
    backBtn.addEventListener('click', () => {
      if (typeof window.switchTab === 'function') {
        window.switchTab('settings');
      } else {
        document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
        const panel = document.getElementById('tab-settings');
        if (panel) panel.classList.add('active');
      }
    });
  }

  if (openVendorBtn) {
    openVendorBtn.addEventListener('click', () => {
      window.api.openVendorFolder();
    });
  }

  if (refreshAllBtn) {
    refreshAllBtn.addEventListener('click', async () => {
      if (refreshAllBtn.disabled) return;
      refreshAllBtn.disabled = true;
      const refreshSvg = refreshAllBtn.querySelector('svg');
      if (refreshSvg) refreshSvg.classList.add('spinning');

      // Snapshot previous tool state to detect differences
      const prevSnapshot = {};
      const keys = ['ytdlp', 'ffmpeg', 'gallerydl', 'streamlink', 'ia', 'deno'];
      for (const k of keys) {
        if (toolsData[k]) {
          prevSnapshot[k] = {
            version: toolsData[k].version,
            installed: toolsData[k].installed,
            path: toolsData[k].path
          };
        }
      }

      try {
        await loadAllTools(false);

        const changedTools = [];
        for (const k of keys) {
          const prev = prevSnapshot[k];
          const curr = toolsData[k];
          if (curr) {
            if (prev) {
              if (prev.version !== curr.version || prev.installed !== curr.installed || prev.path !== curr.path) {
                changedTools.push(curr.name || k);
              }
            } else if (curr.installed) {
              changedTools.push(curr.name || k);
            }
          }
        }

        if (changedTools.length === 0) {
          showToast('Nothing new — all engines are up to date', 'info', 'Status Refresh');
        } else if (changedTools.length === 1) {
          showToast(`1 item refreshed: ${changedTools[0]}`, 'success', 'Status Refresh');
        } else {
          showToast(`${changedTools.length} items refreshed: ${changedTools.join(', ')}`, 'success', 'Status Refresh');
        }
      } catch (err) {
        showToast(`Failed to refresh tools: ${err.message}`, 'error', 'Status Refresh');
      } finally {
        refreshAllBtn.disabled = false;
        if (refreshSvg) refreshSvg.classList.remove('spinning');
      }
    });
  }

  if (checkAllBtn) {
    checkAllBtn.addEventListener('click', async () => {
      if (checkAllBtn.disabled) return;
      checkAllBtn.disabled = true;
      const originalText = checkAllBtn.innerHTML;
      checkAllBtn.innerHTML = `<span>Checking...</span>`;

      const availableUpdates = [];
      const keys = ['ytdlp', 'ffmpeg', 'gallerydl', 'streamlink', 'ia', 'deno'];

      try {
        for (let i = 0; i < keys.length; i++) {
          const k = keys[i];
          const name = toolsData[k]?.name || k;
          checkAllBtn.innerHTML = `<span>Checking [${i + 1}/${keys.length}] ${name}...</span>`;
          try {
            const res = await checkTool(k, false);
            if (res && res.updateAvailable) {
              availableUpdates.push({
                key: k,
                name: toolsData[k]?.name || k,
                version: res.latestVersion
              });
            }
          } catch (toolErr) {
            console.error(`Error checking update for ${k}:`, toolErr);
          }
        }

        if (availableUpdates.length === 0) {
          showToast('Nothing new — all engines are up to date', 'info', 'Check All Updates');
        } else if (availableUpdates.length === 1) {
          showToast(`1 update found for ${availableUpdates[0].name} (v${availableUpdates[0].version})`, 'success', 'Update Found');
        } else {
          const names = availableUpdates.map(u => `${u.name} (v${u.version})`).join(', ');
          showToast(`${availableUpdates.length} updates found for ${names}`, 'success', 'Updates Found');
        }
      } catch (err) {
        showToast(`Update check failed: ${err.message}`, 'error', 'Check All Updates');
      } finally {
        checkAllBtn.disabled = false;
        checkAllBtn.innerHTML = originalText;
      }
    });
  }

  if (updateAllBtn) {
    updateAllBtn.addEventListener('click', async () => {
      await updateAllTools();
    });
  }

  async function updateAllTools() {
    if (!updateAllBtn) return;
    updateAllBtn.disabled = true;
    const originalText = updateAllBtn.innerHTML;
    updateAllBtn.innerHTML = `<span>Updating All...</span>`;

    try {
      if (Object.keys(toolsData).length === 0) {
        toolsData = await window.api.getAllToolsInfo();
      }

      const keys = ['ytdlp', 'ffmpeg', 'gallerydl', 'streamlink', 'ia', 'deno'];
      let count = 0;

      for (let i = 0; i < keys.length; i++) {
        const k = keys[i];
        const toolName = toolsData[k]?.name || k;
        updateAllBtn.innerHTML = `<span>Updating [${i + 1}/${keys.length}] ${toolName}...</span>`;

        try {
          const target = (k === 'ffmpeg' && toolsData[k]?.recommendedPreset) ? toolsData[k].recommendedPreset : 'latest';
          await installTool(k, target);
          count++;
        } catch (toolErr) {
          console.error(`Error updating ${k}:`, toolErr);
        }
      }

      showToast(`✔ Completed update check and upgrade for all tools!`, 'success');
      await loadAllTools();
    } catch (err) {
      showToast(`Update all failed: ${err.message}`, 'error');
    } finally {
      if (updateAllBtn) {
        updateAllBtn.disabled = false;
        updateAllBtn.innerHTML = originalText;
      }
    }
  }

  // Progress listener
  if (window.api && window.api.onToolHubProgress) {
    window.api.onToolHubProgress((data) => {
      if (!data || !data.tool) return;
      updateToolProgress(data.tool, data);
    });
  }

  // ── Load & Render Tools ──────────────────────────────────────────────
  let activeAuditPromise = null;

  async function loadAllTools(forceSpinner = false) {
    if (!container) return toolsData;

    const hasCachedCards = Object.keys(toolsData).length > 0;

    // Only show full-screen spinner if we have NO cached data at all (first load ever)
    if (!hasCachedCards || (forceSpinner && container.children.length === 0)) {
      container.innerHTML = `
        <div style="grid-column: 1 / -1; padding: 40px; text-align: center; color: var(--text-muted);">
          <div class="tool-hub-spinner" style="margin: 0 auto 12px;"></div>
          <div>Auditing local binaries and detecting installed engines...</div>
        </div>
      `;
    } else if (hasCachedCards && container.children.length === 0) {
      renderAllCards();
    }

    if (activeAuditPromise) {
      return await activeAuditPromise;
    }

    const refreshSvg = refreshAllBtn ? refreshAllBtn.querySelector('svg') : null;
    if (refreshSvg) refreshSvg.classList.add('spinning');

    activeAuditPromise = (async () => {
      try {
        const freshData = await window.api.getAllToolsInfo();
        if (freshData && typeof freshData === 'object' && Object.keys(freshData).length > 0) {
          toolsData = freshData;
          try {
            localStorage.setItem(CACHE_TOOLS_KEY, JSON.stringify(freshData));
          } catch (_) {}
        }

        // Check if user is actively interacting with an open custom input or select
        const activeEl = document.activeElement;
        const isInteracting = activeEl && (
          activeEl.classList.contains('tool-custom-version-input') || 
          activeEl.classList.contains('tool-version-select')
        );

        if (!isInteracting) {
          renderAllCards();
        }
        return toolsData;
      } catch (e) {
        if (!hasCachedCards) {
          container.innerHTML = `
            <div style="grid-column: 1 / -1; padding: 30px; text-align: center; color: var(--danger);">
              Failed to load downloader tools: ${e.message}
            </div>
          `;
        }
        throw e;
      } finally {
        activeAuditPromise = null;
        if (refreshSvg) refreshSvg.classList.remove('spinning');
      }
    })();

    return await activeAuditPromise;
  }

  function renderAllCards() {
    if (!container) return;
    container.innerHTML = '';

    const keys = ['ytdlp', 'ffmpeg', 'gallerydl', 'streamlink', 'ia', 'deno'];
    keys.forEach(k => {
      const data = toolsData[k] || { key: k, name: k, installed: false };
      const card = createToolCard(data);
      container.appendChild(card);
    });
  }

  // ── Status Badge Management ──────────────────────────────────────────
  function getBadgeConfig(toolKey, state, customText) {
    const t = toolsData[toolKey] || {};
    const u = updateData[toolKey] || {};

    switch (state) {
      case 'checking':
        return {
          cls: 'tool-badge-checking',
          text: customText || 'Checking...',
          title: 'Checking for updates upstream...'
        };
      case 'up-to-date': {
        const ver = customText || (t.version && t.version !== 'Not Detected' ? `v${t.version}` : 'latest');
        return {
          cls: 'tool-badge-up-to-date',
          text: `Up to date (${ver})`,
          title: `Installed version (${ver}) is up to date`
        };
      }
      case 'update-available': {
        const targetVer = customText || (u.latestVersion ? `v${u.latestVersion}` : 'new version');
        return {
          cls: 'tool-badge-update-avail pulse-accent',
          text: `Update Available (${targetVer})`,
          title: `Newer version available: ${targetVer}`
        };
      }
      case 'updating':
        return {
          cls: 'tool-badge-updating',
          text: customText || 'Updating... (downloading)',
          title: 'Download and installation in progress'
        };
      case 'failed':
        return {
          cls: 'tool-badge-failed',
          text: customText || 'Failed (retry)',
          title: 'Click to retry operation'
        };
      case 'missing':
      default:
        return {
          cls: 'tool-badge-missing',
          text: customText || 'Not Installed',
          title: 'Engine is not installed'
        };
    }
  }

  function setToolStatusBadge(toolKey, state, customText, onClick) {
    const container = document.getElementById(`tool-status-container-${toolKey}`);
    if (!container) return;

    const conf = getBadgeConfig(toolKey, state, customText);
    container.innerHTML = `<span class="tool-badge ${conf.cls}" id="tool-status-badge-${toolKey}" title="${conf.title}">${conf.text}</span>`;

    if (onClick) {
      const badge = document.getElementById(`tool-status-badge-${toolKey}`);
      if (badge) {
        badge.style.cursor = 'pointer';
        badge.addEventListener('click', onClick);
      }
    }
  }

  function createToolCard(t) {
    const card = document.createElement('div');
    card.className = 'tool-hub-card';
    card.id = `tool-card-${t.key}`;

    const iconHtml = TOOL_ICONS[t.key] || '';
    const isVendoredBadge = t.isVendored
      ? `<span class="tool-badge tool-badge-vendored" title="Bundled in nyx-dlp vendor folder">Vendored</span>`
      : `<span class="tool-badge tool-badge-system" title="Installed on system PATH">System PATH</span>`;

    const uData = updateData[t.key];
    let initialBadgeState = 'missing';
    let initialBadgeText = null;
    let initialClickHandler = null;

    if (t.installed) {
      if (uData && uData.updateAvailable) {
        initialBadgeState = 'update-available';
      } else if (uData && uData.latestVersion) {
        initialBadgeState = 'up-to-date';
      } else if (uData && uData.error) {
        initialBadgeState = 'failed';
        initialClickHandler = () => checkTool(t.key, true);
      } else {
        initialBadgeState = 'up-to-date';
      }
    } else {
      initialBadgeState = 'missing';
    }

    const conf = getBadgeConfig(t.key, initialBadgeState, initialBadgeText);

    let gpuBanner = '';
    if (t.key === 'ffmpeg' && t.driverNote) {
      gpuBanner = `
        <div class="tool-hub-note-banner">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>
          <span>${t.driverNote}</span>
        </div>
      `;
    }

    // Determine which preset/version option should be selected
    let selectedValue = 'latest';
    if (t.key === 'ffmpeg') {
      const v = (t.version || '').toLowerCase();
      if (v.startsWith('5.1')) {
        selectedValue = '5.1';
      } else if (v.startsWith('4.4')) {
        selectedValue = '4.4';
      } else if (v.includes('master') || v.includes('latest') || v.startsWith('7.') || v.startsWith('6.')) {
        selectedValue = 'latest';
      } else if (t.recommendedPreset) {
        selectedValue = t.recommendedPreset;
      }
    } else {
      // All other tools default to 'latest'
      selectedValue = 'latest';
    }

    // Build version dropdown options
    let versionOptions = '';
    if (t.presets && t.presets.length > 0) {
      t.presets.forEach(p => {
        const isRec = (t.key === 'ffmpeg' && t.recommendedPreset === p.value) ? ' (Recommended)' : '';
        const isSel = (selectedValue === p.value) ? ' selected' : '';
        versionOptions += `<option value="${p.value}"${isSel}>${p.label}${isRec}</option>`;
      });
    }

    // If updateData has cached releases for this tool, populate them
    if (uData && uData.releases && uData.releases.length > 0) {
      versionOptions += `<optgroup label="Recent Releases">`;
      uData.releases.forEach(r => {
        const isSel = (selectedValue === r.tag) ? ' selected' : '';
        versionOptions += `<option value="${r.tag}"${isSel}>Release ${r.tag} (${r.publishedAt || ''})</option>`;
      });
      versionOptions += `</optgroup>`;
    }

    // Custom version option
    versionOptions += `<option value="__custom__">Custom version...</option>`;

    let updateBtnText = t.installed ? 'Update to Latest' : 'Install Latest';
    if (t.key === 'ffmpeg' && t.recommendedPreset === '5.1') {
      const is51 = (t.version || '').toLowerCase().startsWith('5.1');
      updateBtnText = is51 ? 'Reinstall 5.1.2' : 'Install 5.1.2';
    }

    card.innerHTML = `
      <div class="tool-card-header">
        <div class="tool-card-icon-wrap">${iconHtml}</div>
        <div class="tool-card-title-group">
          <div class="tool-card-title-row">
            <h3 class="tool-card-title">${t.name}</h3>
            <div class="tool-card-badges">
              ${isVendoredBadge}
              <span id="tool-status-container-${t.key}">
                <span class="tool-badge ${conf.cls}" id="tool-status-badge-${t.key}" title="${conf.title}">${conf.text}</span>
              </span>
            </div>
          </div>
          <p class="tool-card-desc">${t.description}</p>
        </div>
      </div>

      ${gpuBanner}

      <div class="tool-card-meta-table">
        <div class="tool-meta-row">
          <span class="tool-meta-label">Location</span>
          <div class="tool-meta-val-path" data-path="${t.path || ''}" title="Click to copy path" style="cursor: pointer;">
            <span class="tool-path-text">${t.path || 'Not installed'}</span>
            ${t.path && t.path !== 'Not installed' ? `
              <button type="button" class="btn-copy-path" data-path="${t.path}" title="Copy path">
                <svg class="copy-icon-clipboard" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                </svg>
                <svg class="copy-icon-check" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                  <polyline points="20 6 9 17 4 12"></polyline>
                </svg>
              </button>
            ` : ''}
          </div>
        </div>
        <div class="tool-meta-row">
          <span class="tool-meta-label">File Size / Date</span>
          <span class="tool-meta-val">${t.size} &bull; ${t.mtime}</span>
        </div>
      </div>

      <div class="tool-card-actions">
        <div class="tool-action-row">
          <button type="button" class="btn btn-ghost btn-tool-check" data-tool="${t.key}" id="btn-check-${t.key}">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 14 14"></polyline></svg>
            <span>Check Updates</span>
          </button>
          <button type="button" class="btn btn-primary btn-tool-update" data-tool="${t.key}" id="btn-update-${t.key}">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
            <span id="btn-update-text-${t.key}">${updateBtnText}</span>
          </button>
        </div>

        <div class="tool-version-switch-row">
          <label class="tool-switch-label" for="select-version-${t.key}">Version / Preset:</label>
          <div style="display: flex; gap: 6px; flex: 1;">
            <select class="form-select tool-version-select" id="select-version-${t.key}" data-tool="${t.key}">
              ${versionOptions}
            </select>
            <button type="button" class="btn btn-ghost btn-tool-switch" data-tool="${t.key}" id="btn-switch-${t.key}" title="Install selected version / build">
              <span>Switch</span>
            </button>
          </div>
        </div>

        <div class="tool-custom-version-row" id="custom-row-${t.key}" style="display: none;">
          <input type="text" class="form-input tool-custom-version-input" id="input-custom-version-${t.key}" placeholder="Enter specific version (e.g. 2024.08.06, 7.1, v1.40.0)..." autocomplete="off" spellcheck="false" />
        </div>
      </div>

      <div class="tool-hub-progress-wrap" id="progress-wrap-${t.key}" style="display: none;">
        <div class="tool-hub-progress-bar-bg">
          <div class="tool-hub-progress-bar" id="progress-bar-${t.key}" style="width: 0%;"></div>
        </div>
        <div class="tool-hub-progress-msg" id="progress-msg-${t.key}">Preparing...</div>
      </div>
    `;

    // Event listeners
    if (initialClickHandler) {
      const b = card.querySelector(`#tool-status-badge-${t.key}`);
      if (b) {
        b.style.cursor = 'pointer';
        b.addEventListener('click', initialClickHandler);
      }
    }

    const checkBtn = card.querySelector(`#btn-check-${t.key}`);
    if (checkBtn) {
      checkBtn.addEventListener('click', () => checkTool(t.key, true));
    }

    const updateBtn = card.querySelector(`#btn-update-${t.key}`);
    if (updateBtn) {
      updateBtn.addEventListener('click', () => {
        const target = (t.key === 'ffmpeg' && t.recommendedPreset) ? t.recommendedPreset : 'latest';
        installTool(t.key, target);
      });
    }

    const switchBtn = card.querySelector(`#btn-switch-${t.key}`);
    const selectVer = card.querySelector(`#select-version-${t.key}`);
    const customRow = card.querySelector(`#custom-row-${t.key}`);
    const customInput = card.querySelector(`#input-custom-version-${t.key}`);

    if (selectVer && customRow) {
      selectVer.addEventListener('change', () => {
        if (selectVer.value === '__custom__') {
          customRow.style.display = 'block';
          if (customInput) customInput.focus();
        } else {
          customRow.style.display = 'none';
        }
      });
    }

    if (switchBtn && selectVer) {
      const handleSwitch = () => {
        let chosen = selectVer.value;
        if (chosen === '__custom__') {
          const val = customInput ? customInput.value.trim() : '';
          if (!val) {
            showToast('Please enter a specific version number or release tag.', 'warning');
            if (customInput) {
              customInput.focus();
              customInput.classList.add('input-shake');
              setTimeout(() => customInput.classList.remove('input-shake'), 400);
            }
            return;
          }
          chosen = val;
        }
        if (!chosen) return;
        installTool(t.key, chosen);
      };

      switchBtn.addEventListener('click', handleSwitch);

      if (customInput) {
        customInput.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            handleSwitch();
          }
        });
      }
    }

    const animateCopyBtn = (btn) => {
      if (!btn) return;
      btn.classList.add('copied');
      clearTimeout(btn._resetTimer);
      btn._resetTimer = setTimeout(() => {
        btn.classList.remove('copied');
      }, 1800);
    };

    const copyPathHandler = (pathVal) => {
      if (!pathVal || pathVal === 'Not installed') return;
      navigator.clipboard.writeText(pathVal);
      if (typeof window.showPathCopiedToast === 'function') {
        window.showPathCopiedToast(pathVal);
      } else {
        showToast('Copied path to clipboard', 'info');
      }
      const copyBtn = card.querySelector('.btn-copy-path');
      animateCopyBtn(copyBtn);
    };

    const copyBtn = card.querySelector('.btn-copy-path');
    if (copyBtn) {
      copyBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        copyPathHandler(copyBtn.dataset.path);
      });
    }

    const valPath = card.querySelector('.tool-meta-val-path');
    if (valPath) {
      valPath.addEventListener('click', () => {
        copyPathHandler(valPath.getAttribute('data-path'));
      });
    }

    return card;
  }

  // ── Check Tool Updates ───────────────────────────────────────────────
  async function checkTool(toolKey, showUserToast = true) {
    const checkBtn = document.getElementById(`btn-check-${toolKey}`);
    if (checkBtn) {
      checkBtn.disabled = true;
      checkBtn.innerHTML = `<span>Checking...</span>`;
    }

    setToolStatusBadge(toolKey, 'checking', 'Checking...');

    try {
      const res = await window.api.checkToolUpdates(toolKey);
      updateData[toolKey] = res;
      try {
        localStorage.setItem(CACHE_UPDATES_KEY, JSON.stringify(updateData));
      } catch (_) {}

      const updateBtn = document.getElementById(`btn-update-${toolKey}`);

      if (res.updateAvailable) {
        setToolStatusBadge(toolKey, 'update-available', `Update Available (v${res.latestVersion})`);
        if (updateBtn) updateBtn.classList.add('pulse-accent');
      } else if (res.latestVersion) {
        const curVer = res.currentVersion || toolsData[toolKey]?.version || '';
        setToolStatusBadge(toolKey, 'up-to-date', curVer ? `Up to date (v${curVer})` : 'Up to date');
        if (updateBtn) updateBtn.classList.remove('pulse-accent');
      }

      // Populate recent versions into select if available
      const select = document.getElementById(`select-version-${toolKey}`);
      if (select && res.releases && res.releases.length > 0) {
        const curVal = select.value;
        const optGroups = select.querySelectorAll('optgroup');
        optGroups.forEach(g => g.remove());

        const customOpt = select.querySelector('option[value="__custom__"]');
        if (customOpt) customOpt.remove();

        const group = document.createElement('optgroup');
        group.label = 'Available Upstream Releases';
        res.releases.forEach(r => {
          const opt = document.createElement('option');
          opt.value = r.tag;
          opt.textContent = `Release ${r.tag} (${r.publishedAt || ''})`;
          group.appendChild(opt);
        });
        select.appendChild(group);

        const newCustom = document.createElement('option');
        newCustom.value = '__custom__';
        newCustom.textContent = 'Custom version...';
        select.appendChild(newCustom);

        if (curVal && select.querySelector(`option[value="${curVal}"]`)) {
          select.value = curVal;
        }
      }

      if (showUserToast) {
        if (res.updateAvailable) {
          showToast(`1 update found for ${toolsData[toolKey]?.name || toolKey} (v${res.latestVersion})`, 'success', 'Update Found');
        } else {
          showToast(`${toolsData[toolKey]?.name || toolKey} is up to date (v${res.currentVersion || res.latestVersion}).`, 'info', 'Check Updates');
        }
      }
      return res;
    } catch (err) {
      setToolStatusBadge(toolKey, 'failed', 'Failed (retry)', () => checkTool(toolKey, true));
      if (showUserToast) {
        showToast(`Failed checking ${toolKey}: ${err.message}`, 'error', 'Check Updates');
      }
      return { key: toolKey, error: err.message, updateAvailable: false };
    } finally {
      if (checkBtn) {
        checkBtn.disabled = false;
        checkBtn.innerHTML = `
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 14 14"></polyline></svg>
          <span>Check Updates</span>
        `;
      }
    }
  }

  // ── Install / Switch Tool Version ─────────────────────────────────────
  async function installTool(toolKey, targetVersion) {
    const card = document.getElementById(`tool-card-${toolKey}`);
    const progressWrap = document.getElementById(`progress-wrap-${toolKey}`);
    const progressBar = document.getElementById(`progress-bar-${toolKey}`);
    const progressMsg = document.getElementById(`progress-msg-${toolKey}`);
    const updateBtn = document.getElementById(`btn-update-${toolKey}`);
    const switchBtn = document.getElementById(`btn-switch-${toolKey}`);

    if (progressWrap) progressWrap.style.display = 'block';
    if (progressBar) progressBar.style.width = '10%';
    if (progressMsg) progressMsg.textContent = `Starting install of ${targetVersion}...`;
    if (updateBtn) updateBtn.disabled = true;
    if (switchBtn) switchBtn.disabled = true;

    setToolStatusBadge(toolKey, 'updating', 'Updating... (downloading)');

    try {
      const updatedInfo = await window.api.installToolVersion(toolKey, targetVersion);
      toolsData[toolKey] = updatedInfo;
      try {
        localStorage.setItem(CACHE_TOOLS_KEY, JSON.stringify(toolsData));
      } catch (_) {}

      if (progressBar) progressBar.style.width = '100%';
      if (progressMsg) progressMsg.textContent = `✔ Successfully installed ${targetVersion}!`;

      setToolStatusBadge(toolKey, 'up-to-date', `Up to date (v${updatedInfo.version})`);
      showToast(`${updatedInfo.name} was successfully updated to ${updatedInfo.version}!`, 'success');

      setTimeout(() => {
        if (progressWrap) progressWrap.style.display = 'none';
        renderAllCards();
      }, 1500);

    } catch (err) {
      if (progressMsg) progressMsg.textContent = `✖ Error: ${err.message}`;
      setToolStatusBadge(toolKey, 'failed', 'Failed (retry)', () => installTool(toolKey, targetVersion));
      showToast(`Failed to install ${toolKey}: ${err.message}`, 'error');
      if (updateBtn) updateBtn.disabled = false;
      if (switchBtn) switchBtn.disabled = false;
    }
  }

  function updateToolProgress(toolKey, data) {
    const progressWrap = document.getElementById(`progress-wrap-${toolKey}`);
    const progressBar = document.getElementById(`progress-bar-${toolKey}`);
    const progressMsg = document.getElementById(`progress-msg-${toolKey}`);

    if (!progressWrap) return;
    progressWrap.style.display = 'block';

    if (data.percent !== undefined && progressBar) {
      progressBar.style.width = `${Math.min(100, Math.max(0, data.percent))}%`;
    }
    if (data.message && progressMsg) {
      progressMsg.textContent = data.message;
      const lower = data.message.toLowerCase();
      if (lower.includes('extract')) {
        setToolStatusBadge(toolKey, 'updating', 'Updating... (extracting)');
      } else {
        setToolStatusBadge(toolKey, 'updating', 'Updating... (downloading)');
      }
    }
  }

  // Instant pre-render from cache if available
  if (container && Object.keys(toolsData).length > 0) {
    try {
      renderAllCards();
    } catch (e) {
      console.error('Error pre-rendering tool hub cards:', e);
    }
  }

})();

