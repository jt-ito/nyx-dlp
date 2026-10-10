/* ── Save Paused Download ────────────────────────────────────
 * While yt-dlp / Batch / gallery-dl is paused, a "Save Paused" button appears. It stores the
 * tool's form (plus, for Batch, the URLs still left) in History as a saved paused download — even
 * when normal history is off — and stops the job. Resuming from History restores the form and
 * starts the same download again; yt-dlp picks up its partial files and gallery-dl skips what it
 * already has.
 *
 * Not offered for the Live Archiver and the ffmpeg tools (M3U8, Splitter, Concatenator, Encoder):
 * those can't continue a half-finished run.
 */
(function () {
  const TOOLS = {
    ytdlp:   { tab: 'ytdlp',   panel: 'tab-ytdlp',   name: 'yt-dlp',           prefix: 'yd',    log: 'yd-log',    urlField: 'yd-url',      outField: 'yd-output' },
    batch:   { tab: 'batch',   panel: 'tab-batch',   name: 'Batch Downloader', prefix: 'batch', log: 'batch-log', urlField: 'batch-urls',  outField: 'batch-output' },
    gallery: { tab: 'gallery', panel: 'tab-gallery', name: 'Gallery-DL',       prefix: 'gdl',   log: 'gdl-log',   urlField: 'gdl-url',     outField: 'gdl-output' },
  };
  const $ = (id) => document.getElementById(id);

  // One-shot flag read by the tools' run handlers (see resumeSaved in their runX calls).
  window._takeResumeFlag = () => { const v = !!window._resumeNextRun; window._resumeNextRun = false; return v; };

  function snapshotForm(panelId) {
    const form = {};
    const panel = $(panelId);
    if (!panel) return form;
    panel.querySelectorAll('input, select, textarea').forEach((el) => {
      if (!el.id || el.type === 'file' || el.type === 'button' || el.type === 'submit') return;
      form[el.id] = (el.type === 'checkbox' || el.type === 'radio') ? el.checked : el.value;
    });
    return form;
  }

  function firstLine(text) {
    return String(text || '').split('\n').map(s => s.trim()).find(Boolean) || '';
  }

  async function savePaused(key) {
    const t = TOOLS[key];
    const log = $(t.log);
    const form = snapshotForm(t.panel);

    // A paused batch resumes with only the URLs it hadn't finished (the current one included).
    if (key === 'batch' && typeof window.getBatchRemainingUrls === 'function') {
      const remaining = window.getBatchRemainingUrls();
      if (remaining.length) form['batch-urls'] = remaining.join('\n');
    }
    if (key === 'gallery' && !form['gdl-url'] && form['gdl-urls']) form['gdl-url'] = firstLine(form['gdl-urls']);

    const urls = String(form[t.urlField] || form['gdl-urls'] || '').split('\n').map(s => s.trim()).filter(Boolean);
    const source = key === 'batch' ? `${urls.length} URL(s) remaining` : (urls[0] || '');
    const name = (log && log._lastCapturedName) || (key === 'batch' ? (urls[0] || 'Batch') : source);

    const entry = {
      id: 'paused-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7),
      date: new Date().toISOString(),
      tool: t.name,
      name,
      source,
      output: form[t.outField] || '',
      status: 'paused-saved',
      savedPaused: true,
      resumeData: { tool: key, form },
    };

    const ok = window.api && window.api.addHistory ? await window.api.addHistory(entry) : false;
    if (!ok) {
      if (log) appendLog(log, '⚠ Could not save the paused download.', 'error');
      return;
    }
    if (log) appendLog(log, '💾 Paused download saved to History — resume it from there any time, even after closing nyx-dlp.', 'success');
    if (window._refreshHistory) window._refreshHistory();
    $(t.prefix + '-stop')?.click(); // stops the suspended process; its partial files stay on disk
  }

  window.resumeSavedDownload = async function (item) {
    const data = item && item.resumeData;
    const t = data && TOOLS[data.tool];
    if (!t) return false;
    const runBtn = $(t.prefix + '-run');
    if (!runBtn || runBtn.classList.contains('hidden')) {
      alert(`${t.name} is already running. Stop it (or wait for it to finish) before resuming a saved download.`);
      return false;
    }

    document.querySelector(`.nav-item[data-tab="${t.tab}"]`)?.click();
    for (const [id, val] of Object.entries(data.form || {})) {
      const el = $(id);
      if (!el) continue;
      if (el.type === 'checkbox' || el.type === 'radio') el.checked = !!val; else el.value = val;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    }

    window._resumeNextRun = true;
    runBtn.click();
    setTimeout(() => { window._resumeNextRun = false; }, 10000); // never leak into a later manual run

    // Once it has actually started, the saved entry has done its job.
    if (runBtn.classList.contains('hidden') && window.api && window.api.deleteHistoryItem) {
      await window.api.deleteHistoryItem(item.id);
      if (window._refreshHistory) window._refreshHistory();
    }
    return true;
  };

  // Show the Save Paused button exactly while the tool's pause button is in its "paused" state.
  Object.entries(TOOLS).forEach(([key, t]) => {
    const pauseBtn = $(t.prefix + '-pause');
    const saveBtn = $(t.prefix + '-save-paused');
    if (!pauseBtn || !saveBtn) return;
    const sync = () => saveBtn.classList.toggle('hidden', !(pauseBtn.classList.contains('paused') && !pauseBtn.classList.contains('hidden')));
    new MutationObserver(sync).observe(pauseBtn, { attributes: true, attributeFilter: ['class'] });
    saveBtn.addEventListener('click', () => {
      saveBtn.classList.add('hidden');
      savePaused(key);
    });
    sync();
  });
})();
