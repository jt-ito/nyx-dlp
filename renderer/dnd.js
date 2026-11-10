/* ── Drag & drop onto tools ──────────────────────────────────
 * Drop files or links anywhere on a tool's panel:
 *   yt-dlp ........ a link  -> URL field
 *   Batch ......... links   -> appended to the URL list
 *   Splitter ...... a file  -> input file
 *   Concatenator .. files   -> merge list
 *   Encoder ....... files   -> input list
 *   Internet Archive: files -> upload list (Upload) / a link -> identifier or link field (Download)
 * Anything dropped elsewhere is ignored — it must never make the window navigate to the file.
 */
(function () {
  const $ = (id) => document.getElementById(id);
  const typesOf = (dt) => Array.from((dt && dt.types) || []);
  const hasFiles = (dt) => typesOf(dt).includes('Files');
  const hasText = (dt) => typesOf(dt).some(t => t === 'text/uri-list' || t === 'text/plain');
  const isShown = (id) => { const el = $(id); return !!el && el.offsetParent !== null; };

  function pathOf(file) {
    if (file && file.path) return file.path; // Electron <= 31
    try { return (window.api && window.api.getPathForFile && window.api.getPathForFile(file)) || ''; } catch (_) { return ''; }
  }
  function filePaths(dt) {
    return Array.from((dt && dt.files) || []).map(pathOf).filter(Boolean);
  }
  // Links from a dragged address-bar/anchor (text/uri-list) or from dropped text.
  function urlsFrom(dt) {
    const raw = (dt.getData('text/uri-list') || dt.getData('text/plain') || '');
    return raw.split(/\s+/).map(s => s.trim()).filter(s => /^https?:\/\//i.test(s));
  }
  function setValue(id, value) {
    const el = $(id);
    if (!el) return;
    el.value = value;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }
  function appendLines(id, lines) {
    const el = $(id);
    if (!el) return;
    const have = el.value.split('\n').map(s => s.trim()).filter(Boolean);
    const add = lines.filter(l => !have.includes(l));
    if (!add.length) return;
    el.value = (el.value.trim() ? el.value.replace(/\s+$/, '') + '\n' : '') + add.join('\n');
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }
  const addToList = (listId) => (paths) => { const list = $(listId); if (list) paths.forEach(p => window.addSortableItem(list, p)); };

  // accepts() says what the panel wants right now; apply() gets the matching payload.
  const ZONES = [
    { panel: 'tab-ytdlp',        accepts: () => 'url',   label: 'Drop a link to download', apply: (kind, items) => setValue('yd-url', items[0]) },
    { panel: 'tab-batch',        accepts: () => 'url',   label: 'Drop links to add to the batch', apply: (kind, items) => appendLines('batch-urls', items) },
    { panel: 'tab-splitter',     accepts: () => 'files', label: 'Drop a video to split', apply: (kind, items) => setValue('sp-file', items[0]) },
    { panel: 'tab-concatenator', accepts: () => 'files', label: 'Drop files to merge', apply: (kind, items) => addToList('concat-file-list')(items) },
    { panel: 'tab-merger',       accepts: () => 'files', label: 'Drop the parts to merge', apply: (kind, items) => addToList('mg-file-list')(items) },
    { panel: 'tab-encoder',      accepts: () => 'files', label: 'Drop videos to encode', apply: (kind, items) => addToList('enc-file-list')(items) },
    {
      panel: 'tab-ia',
      accepts: () => isShown('ia-upload-form') ? 'files' : (isShown('ia-download-form') ? 'url' : null),
      label: () => isShown('ia-upload-form') ? 'Drop files or folders to upload' : 'Drop an archive.org link',
      apply: (kind, items) => {
        if (kind === 'files') { if (window.nyxIaDropFiles) window.nyxIaDropFiles(items); }
        else setValue('ia-identifier-down', items[0]);
      },
    },
  ];

  function zoneFor(e) {
    const panel = e.target && e.target.closest ? e.target.closest('.tab-panel') : null;
    return panel ? { panel, zone: ZONES.find(z => z.panel === panel.id) } : { panel: null, zone: null };
  }
  function payloadKind(zone, dt) {
    const want = zone.accepts();
    if (want === 'files' && hasFiles(dt)) return 'files';
    if (want === 'url' && hasText(dt)) return 'url';
    return null;
  }
  const clearHighlight = () => document.querySelectorAll('.nyx-drop-active').forEach(el => el.classList.remove('nyx-drop-active'));

  document.addEventListener('dragover', (e) => {
    if (e.defaultPrevented) return; // a list that handles its own file drops already took it
    const dt = e.dataTransfer;
    if (!hasFiles(dt) && !hasText(dt)) return;
    e.preventDefault(); // otherwise the window would navigate to a dropped file
    const { panel, zone } = zoneFor(e);
    const kind = zone && payloadKind(zone, dt);
    clearHighlight();
    if (kind) {
      dt.dropEffect = 'copy';
      panel.setAttribute('data-drop-label', typeof zone.label === 'function' ? zone.label() : zone.label);
      panel.classList.add('nyx-drop-active');
    } else {
      dt.dropEffect = 'none';
    }
  });

  document.addEventListener('dragleave', (e) => {
    if (!e.relatedTarget) clearHighlight(); // left the window
  });

  document.addEventListener('drop', (e) => {
    const dt = e.dataTransfer;
    const handledElsewhere = e.defaultPrevented;
    if (hasFiles(dt) || hasText(dt)) e.preventDefault();
    clearHighlight();
    if (handledElsewhere) return;
    const { zone } = zoneFor(e);
    const kind = zone && payloadKind(zone, dt);
    if (!kind) return;
    const items = kind === 'files' ? filePaths(dt) : urlsFrom(dt);
    if (items.length) zone.apply(kind, items);
  });

  document.addEventListener('dragend', clearHighlight);
})();
