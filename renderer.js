/* ── renderer.js ─ UI logic ─────────────────────────────────── */

const html = document.documentElement;

// ── Theme ──────────────────────────────────────────────────────
const themeToggle = document.getElementById('themeToggle');
const iconMoon = themeToggle.querySelector('.icon-moon');
const iconSun  = themeToggle.querySelector('.icon-sun');

function setTheme(theme) {
  html.setAttribute('data-theme', theme);
  localStorage.setItem('theme', theme);
  if (theme === 'dark') {
    iconMoon.style.display = '';
    iconSun.style.display  = 'none';
  } else {
    iconMoon.style.display = 'none';
    iconSun.style.display  = '';
  }
}
setTheme(localStorage.getItem('theme') || 'dark');
themeToggle.addEventListener('click', () =>
  setTheme(html.getAttribute('data-theme') === 'dark' ? 'light' : 'dark')
);

// ── Window Controls ────────────────────────────────────────────
document.getElementById('btnMin').addEventListener('click',   () => window.api.minimize());
document.getElementById('btnMax').addEventListener('click',   () => window.api.maximize());
document.getElementById('btnClose').addEventListener('click', () => window.api.close());

// ── Tab Navigation ─────────────────────────────────────────────
document.querySelectorAll('.nav-item').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    const panel = document.getElementById('tab-' + btn.dataset.tab);
    panel.classList.add('active');
  });
});

// ── Form-level advanced section toggles ─────────────────────────
document.addEventListener('click', e => {
  const btn = e.target.closest('.form-adv-toggle');
  if (!btn) return;
  const body = document.getElementById(btn.dataset.adv);
  if (!body) return;
  const open = body.classList.toggle('open');
  btn.setAttribute('aria-expanded', String(open));
});

// ── Folder Picker ──────────────────────────────────────────────
document.querySelectorAll('.btn-folder').forEach(btn => {
  btn.addEventListener('click', async () => {
    let result;
    if (btn.dataset.pickType === 'file') {
      result = await window.api.pickFile();
    } else {
      result = await window.api.pickFolder();
    }
    if (result) {
      const target = document.getElementById(btn.dataset.target);
      target.value = result;
      target.dispatchEvent(new Event('input'));
    }
  });
});

// ── Status Bar ─────────────────────────────────────────────────
const statusDot  = document.getElementById('statusDot');
const statusText = document.getElementById('statusText');
let runningCount = 0;

function setStatus(state, text) {
  statusDot.className = 'status-dot ' + (state || '');
  statusText.textContent = text || 'Idle';
}
function incRunning() { runningCount++; setStatus('running', 'Running...'); }
function decRunning() {
  runningCount = Math.max(0, runningCount - 1);
  if (runningCount === 0) setStatus('done', 'Done');
}

// ── Settings ───────────────────────────────────────────────────
const SETTINGS_MAP = {
  'show-tool-livestream': { navTab: 'livestream' },
  'show-tool-ytdlp':      { navTab: 'ytdlp' },
  'show-tool-batch':      { navTab: 'batch' },
  'show-tool-m3u8':       { navTab: 'm3u8' },
  'show-tool-gallery':    { navTab: 'gallery' },
  'show-ls-quality':      { el: 'ls-quality-group' },
  'show-ls-cookies':      { el: 'ls-cookies-group' },
  'show-yd-format':       { el: 'yd-format-group' },
  'show-yd-cookies':      { el: 'yd-cookies-group' },
  'show-batch-format':    { el: 'batch-format-group' },
  'show-batch-rest':      { el: 'batch-rest-group' },
  'show-batch-cookies':   { el: 'batch-cookies-group' },
  'show-m3-encode':       { el: 'm3-encode-group' },
  'show-m3-cookies':      { el: 'm3-cookies-group' },
  'show-gdl-filetypes':   { el: 'gdl-filetypes-group' },
  'show-gdl-meta':        { el: 'gdl-meta-group' },
  'show-gdl-cookies':     { el: 'gdl-cookies-group' },
};
const SETTINGS_DEFAULTS = {
  'show-tool-livestream': true,
  'show-tool-ytdlp':      true,
  'show-tool-batch':      true,
  'show-tool-m3u8':       true,
  'show-tool-gallery':    true,
  'show-ls-quality':      true,
  'show-ls-cookies':      false,
  'show-yd-format':       true,
  'show-yd-cookies':      false,
  'show-batch-format':    true,
  'show-batch-rest':      true,
  'show-batch-cookies':   false,
  'show-m3-encode':       true,
  'show-m3-cookies':      false,
  'show-gdl-filetypes':   true,
  'show-gdl-meta':        true,
  'show-gdl-cookies':     false,
};

// ── yt-dlp Advanced Options definition ────────────────────────
const YTDLP_OPTS = [
  // File & Naming
  { cat:'File & Naming', key:'output',              flag:'--output',               hasVal:true,  label:'Output template',          desc:'Filename template, e.g. %(title)s.%(ext)s',               type:'text',   placeholder:'%(title)s.%(ext)s' },
  { cat:'File & Naming', key:'restrict-filenames',  flag:'--restrict-filenames',   hasVal:false, label:'Restrict filenames',       desc:'ASCII-only filenames, no & or spaces',                    type:'toggle' },
  { cat:'File & Naming', key:'windows-filenames',   flag:'--windows-filenames',    hasVal:false, label:'Force Windows filenames',  desc:'Always produce Windows-compatible filenames',             type:'toggle' },
  { cat:'File & Naming', key:'trim-filenames',      flag:'--trim-filenames',       hasVal:true,  label:'Trim filename length',     desc:'Max chars in filename (excl. extension)',                  type:'number', placeholder:'200' },
  { cat:'File & Naming', key:'no-overwrites',       flag:'--no-overwrites',        hasVal:false, label:'No overwrites',            desc:'Skip download if the file already exists',                type:'toggle' },
  { cat:'File & Naming', key:'force-overwrites',    flag:'--force-overwrites',     hasVal:false, label:'Force overwrites',         desc:'Overwrite all video and metadata files',                  type:'toggle' },
  { cat:'File & Naming', key:'no-continue',         flag:'--no-continue',          hasVal:false, label:'Disable resume',           desc:'Restart download instead of resuming partial files',      type:'toggle' },
  { cat:'File & Naming', key:'mtime',               flag:'--mtime',                hasVal:false, label:'Set modification time',    desc:'Use Last-modified header to set file mtime',              type:'toggle' },
  { cat:'File & Naming', key:'write-description',   flag:'--write-description',    hasVal:false, label:'Write description file',   desc:'Save video description to a .description file',           type:'toggle' },
  { cat:'File & Naming', key:'write-info-json',     flag:'--write-info-json',      hasVal:false, label:'Write info JSON',          desc:'Save video metadata to a .info.json file',                type:'toggle' },
  { cat:'File & Naming', key:'write-comments',      flag:'--write-comments',       hasVal:false, label:'Write comments',           desc:'Retrieve and embed video comments into infojson',         type:'toggle' },
  { cat:'File & Naming', key:'cookies-from-browser',flag:'--cookies-from-browser', hasVal:true,  label:'Cookies from browser',    desc:'Load cookies directly from an installed browser',         type:'select', opts:[{value:'',label:'Disabled'},{value:'chrome',label:'Chrome'},{value:'firefox',label:'Firefox'},{value:'edge',label:'Edge'},{value:'brave',label:'Brave'},{value:'opera',label:'Opera'},{value:'safari',label:'Safari'},{value:'vivaldi',label:'Vivaldi'}] },
  { cat:'File & Naming', key:'no-cache-dir',        flag:'--no-cache-dir',         hasVal:false, label:'Disable cache',            desc:'Disable yt-dlp filesystem caching',                       type:'toggle' },
  // Subtitles
  { cat:'Subtitles', key:'write-subs',       flag:'--write-subs',       hasVal:false, label:'Write subtitle files',     desc:'Download and save subtitle files alongside the video',  type:'toggle' },
  { cat:'Subtitles', key:'write-auto-subs',  flag:'--write-auto-subs',  hasVal:false, label:'Write auto-generated subs',desc:'Download auto-generated subtitles when available',       type:'toggle' },
  { cat:'Subtitles', key:'sub-format',       flag:'--sub-format',       hasVal:true,  label:'Subtitle format',          desc:'e.g. srt  or  ass/srt/best',                             type:'text',   placeholder:'srt' },
  { cat:'Subtitles', key:'sub-langs',        flag:'--sub-langs',        hasVal:true,  label:'Subtitle languages',       desc:'Comma-separated codes, e.g. en,ja',                      type:'text',   placeholder:'en' },
  // Post-Processing
  { cat:'Post-Processing', key:'extract-audio',         flag:'--extract-audio',          hasVal:false, label:'Extract audio only',           desc:'Convert video to audio-only output (requires ffmpeg)',      type:'toggle' },
  { cat:'Post-Processing', key:'audio-format',          flag:'--audio-format',           hasVal:true,  label:'Audio format',                 desc:'Format for extracted audio',                               type:'select', opts:[{value:'',label:'Default'},{value:'best',label:'Best'},{value:'aac',label:'AAC'},{value:'alac',label:'ALAC'},{value:'flac',label:'FLAC'},{value:'m4a',label:'M4A'},{value:'mp3',label:'MP3'},{value:'opus',label:'Opus'},{value:'wav',label:'WAV'}] },
  { cat:'Post-Processing', key:'audio-quality',         flag:'--audio-quality',          hasVal:true,  label:'Audio quality',                desc:'0 (best) – 10 (worst) for VBR, or bitrate e.g. 128K',      type:'text',   placeholder:'5' },
  { cat:'Post-Processing', key:'remux-video',           flag:'--remux-video',            hasVal:true,  label:'Remux to container',           desc:'Remux without re-encoding (e.g. mp4, mkv, webm)',           type:'select', opts:[{value:'',label:'Disabled'},{value:'mp4',label:'MP4'},{value:'mkv',label:'MKV'},{value:'webm',label:'WebM'},{value:'mov',label:'MOV'},{value:'avi',label:'AVI'},{value:'flv',label:'FLV'}] },
  { cat:'Post-Processing', key:'recode-video',          flag:'--recode-video',           hasVal:true,  label:'Re-encode video',              desc:'Re-encode into another format, e.g. mp4 or mkv',            type:'text',   placeholder:'mp4' },
  { cat:'Post-Processing', key:'keep-video',            flag:'--keep-video',             hasVal:false, label:'Keep intermediate video',      desc:'Keep original video file after post-processing',            type:'toggle' },
  { cat:'Post-Processing', key:'embed-thumbnail',       flag:'--embed-thumbnail',        hasVal:false, label:'Embed thumbnail',              desc:'Embed video thumbnail as cover art',                        type:'toggle' },
  { cat:'Post-Processing', key:'embed-chapters',        flag:'--embed-chapters',         hasVal:false, label:'Embed chapters',               desc:'Add chapter markers to the video file',                     type:'toggle' },
  { cat:'Post-Processing', key:'split-chapters',        flag:'--split-chapters',         hasVal:false, label:'Split by chapters',            desc:'Split video into separate files per chapter',               type:'toggle' },
  { cat:'Post-Processing', key:'remove-chapters',       flag:'--remove-chapters',        hasVal:true,  label:'Remove chapters (regex)',      desc:'Remove chapters whose title matches a regex pattern',        type:'text',   placeholder:'sponsor.*' },
  { cat:'Post-Processing', key:'ffmpeg-location',       flag:'--ffmpeg-location',        hasVal:true,  label:'FFmpeg location',              desc:'Path to ffmpeg binary or its containing directory',          type:'text',   placeholder:'C:\\ffmpeg\\bin' },
  { cat:'Post-Processing', key:'exec',                  flag:'--exec',                   hasVal:true,  label:'Execute command',              desc:'Run a command after download  (%(filepath)q for the path)', type:'text',   placeholder:'echo %(filepath)q' },
  { cat:'Post-Processing', key:'convert-subs',          flag:'--convert-subs',           hasVal:true,  label:'Convert subtitles',            desc:'Convert subtitle files to another format',                   type:'select', opts:[{value:'',label:'Disabled'},{value:'srt',label:'SRT'},{value:'vtt',label:'VTT'},{value:'ass',label:'ASS'},{value:'lrc',label:'LRC'}] },
  { cat:'Post-Processing', key:'fixup',                 flag:'--fixup',                  hasVal:true,  label:'Fixup policy',                 desc:'How to handle correctable file faults',                      type:'select', opts:[{value:'',label:'Default'},{value:'never',label:'Never fix'},{value:'warn',label:'Warn only'},{value:'detect_or_warn',label:'Detect or warn'},{value:'force',label:'Force fix'}] },
  { cat:'Post-Processing', key:'force-keyframes-at-cuts',flag:'--force-keyframes-at-cuts',hasVal:false,label:'Force keyframes at cuts',      desc:'Force keyframes at split/remove points (slow, re-encodes)', type:'toggle' },
  { cat:'Post-Processing', key:'xattrs',                flag:'--xattrs',                 hasVal:false, label:'Write xattrs',                 desc:'Write metadata to file extended attributes (Dublin Core)',   type:'toggle' },
  // Authentication
  { cat:'Authentication', key:'username',               flag:'--username',               hasVal:true,  label:'Username',                     desc:'Login with this account username/ID',                                  type:'text',   placeholder:'myusername' },
  { cat:'Authentication', key:'password',               flag:'--password',               hasVal:true,  label:'Password',                     desc:'Account password',                                                     type:'password', placeholder:'••••••••' },
  { cat:'Authentication', key:'twofactor',              flag:'--twofactor',              hasVal:true,  label:'Two-factor code',               desc:'Two-factor authentication code',                                       type:'text',   placeholder:'123456' },
  { cat:'Authentication', key:'netrc',                  flag:'--netrc',                  hasVal:false, label:'Use .netrc',                   desc:'Use .netrc authentication data',                                       type:'toggle' },
  { cat:'Authentication', key:'netrc-location',         flag:'--netrc-location',         hasVal:true,  label:'.netrc location',               desc:'Path to .netrc file or its containing directory',                      type:'text',   placeholder:'~/.netrc' },
  { cat:'Authentication', key:'video-password',         flag:'--video-password',         hasVal:true,  label:'Video password',               desc:'Video-specific password for password-protected content',                type:'password', placeholder:'••••••••' },
  { cat:'Authentication', key:'ap-mso',                 flag:'--ap-mso',                 hasVal:true,  label:'Adobe Pass MSO',               desc:'Adobe Pass TV provider identifier (use --ap-list-mso for list)',        type:'text',   placeholder:'comcast' },
  { cat:'Authentication', key:'ap-username',            flag:'--ap-username',            hasVal:true,  label:'Adobe Pass username',          desc:'Multiple-system operator account login',                               type:'text',   placeholder:'myusername' },
  { cat:'Authentication', key:'ap-password',            flag:'--ap-password',            hasVal:true,  label:'Adobe Pass password',          desc:'Multiple-system operator account password',                            type:'password', placeholder:'••••••••' },
  { cat:'Authentication', key:'client-certificate',     flag:'--client-certificate',     hasVal:true,  label:'Client certificate (PEM)',     desc:'Path to client certificate file in PEM format',                        type:'text',   placeholder:'C:\certs\client.pem' },
  { cat:'Authentication', key:'client-certificate-key', flag:'--client-certificate-key', hasVal:true, label:'Certificate private key',      desc:'Path to private key file for client certificate',                      type:'text',   placeholder:'C:\certs\client.key' },
  { cat:'Authentication', key:'client-certificate-password', flag:'--client-certificate-password', hasVal:true, label:'Certificate key password', desc:'Password for client certificate private key if encrypted',            type:'password', placeholder:'••••••••' },
  // Network & Proxy
  { cat:'Network & Proxy', key:'proxy',                 flag:'--proxy',                 hasVal:true,  label:'Proxy URL',                   desc:'HTTP/HTTPS/SOCKS4/SOCKS5 proxy URL, e.g. socks5://127.0.0.1:1080',   type:'text',   placeholder:'socks5://127.0.0.1:1080' },
  { cat:'Network & Proxy', key:'source-address',        flag:'--source-address',        hasVal:true,  label:'Source IP address',           desc:'Bind outgoing connections to this local IP address',                   type:'text',   placeholder:'0.0.0.0' },
  { cat:'Network & Proxy', key:'force-ipv4',            flag:'--force-ipv4',            hasVal:false, label:'Force IPv4',                  desc:'Make all connections via IPv4',                                        type:'toggle' },
  { cat:'Network & Proxy', key:'force-ipv6',            flag:'--force-ipv6',            hasVal:false, label:'Force IPv6',                  desc:'Make all connections via IPv6',                                        type:'toggle' },
  { cat:'Network & Proxy', key:'socket-timeout',        flag:'--socket-timeout',        hasVal:true,  label:'Socket timeout (s)',          desc:'Abort networking operations that take longer than this',               type:'number', placeholder:'30' },
  { cat:'Network & Proxy', key:'geo-bypass',            flag:'--geo-bypass',            hasVal:false, label:'Geo-restriction bypass',      desc:'Bypass geographic restrictions via faking X-Forwarded-For header',    type:'toggle' },
  { cat:'Network & Proxy', key:'geo-bypass-country',    flag:'--geo-bypass-country',    hasVal:true,  label:'Geo-bypass country code',     desc:'Force this ISO 3166-2 country code for geo-bypass (e.g. US)',         type:'text',   placeholder:'US' },
  { cat:'Network & Proxy', key:'no-check-certificates', flag:'--no-check-certificates', hasVal:false, label:'Skip certificate check',      desc:'Suppress HTTPS certificate validation errors',                        type:'toggle' },
  { cat:'Network & Proxy', key:'legacy-server-connect', flag:'--legacy-server-connect', hasVal:false, label:'Legacy server connect',       desc:'Allow legacy insecure TLS connections (workaround for old servers)',  type:'toggle' },
  { cat:'Network & Proxy', key:'prefer-insecure',       flag:'--prefer-insecure',       hasVal:false, label:'Prefer HTTP over HTTPS',      desc:'Use unencrypted connection when server supports both',                type:'toggle' },
  // Download Tuning
  { cat:'Download Tuning', key:'retries',               flag:'--retries',               hasVal:true,  label:'Retries',                     desc:'Number of retries before giving up (default 10; "infinite" accepted)', type:'number', placeholder:'10' },
  { cat:'Download Tuning', key:'fragment-retries',      flag:'--fragment-retries',      hasVal:true,  label:'Fragment retries',            desc:'Retries per HLS/DASH fragment (default 10; "infinite" accepted)',     type:'number', placeholder:'10' },
  { cat:'Download Tuning', key:'concurrent-fragments',  flag:'--concurrent-fragments',  hasVal:true,  label:'Concurrent fragments',        desc:'Number of HLS/DASH fragments to download simultaneously (default 1)', type:'number', placeholder:'1' },
  { cat:'Download Tuning', key:'rate-limit',            flag:'--rate-limit',            hasVal:true,  label:'Max download rate',           desc:'Maximum download speed, e.g. 500K or 2.5M',                           type:'text',   placeholder:'2M' },
  { cat:'Download Tuning', key:'throttled-rate',        flag:'--throttled-rate',        hasVal:true,  label:'Throttle detection rate',     desc:'Re-extract video URL if download speed drops below this (e.g. 100K)', type:'text',   placeholder:'100K' },
  { cat:'Download Tuning', key:'sleep-interval',        flag:'--sleep-interval',        hasVal:true,  label:'Sleep between downloads (s)', desc:'Wait at least this many seconds before each download',                type:'number', placeholder:'3' },
  { cat:'Download Tuning', key:'max-sleep-interval',    flag:'--max-sleep-interval',    hasVal:true,  label:'Max sleep interval (s)',      desc:'Upper bound of random sleep interval (used with Sleep between downloads)', type:'number', placeholder:'10' },
  { cat:'Download Tuning', key:'buffer-size',           flag:'--buffer-size',           hasVal:true,  label:'Download buffer size',        desc:'Size of the download buffer (e.g. 16K, 1M)',                          type:'text',   placeholder:'16K' },
  // Playlist & Selection
  { cat:'Playlist & Selection', key:'no-playlist',      flag:'--no-playlist',           hasVal:false, label:'No playlist',                 desc:'If URL has both a video and playlist, download only the video',       type:'toggle' },
  { cat:'Playlist & Selection', key:'yes-playlist',     flag:'--yes-playlist',          hasVal:false, label:'Force playlist',              desc:'If URL has both a video and playlist, download the full playlist',    type:'toggle' },
  { cat:'Playlist & Selection', key:'playlist-start',   flag:'--playlist-start',        hasVal:true,  label:'Playlist start index',        desc:'Start at this playlist position (1-based, default 1)',                type:'number', placeholder:'1' },
  { cat:'Playlist & Selection', key:'playlist-end',     flag:'--playlist-end',          hasVal:true,  label:'Playlist end index',          desc:'Stop at this playlist position (default: last)',                       type:'number', placeholder:'20' },
  { cat:'Playlist & Selection', key:'playlist-items',   flag:'--playlist-items',        hasVal:true,  label:'Playlist item selector',      desc:'Items to download, e.g. 1,3,5-8 or ::-1 to reverse',                 type:'text',   placeholder:'1,3,5-8' },
  { cat:'Playlist & Selection', key:'max-downloads',    flag:'--max-downloads',         hasVal:true,  label:'Max downloads',               desc:'Abort the run after this many files have been downloaded',             type:'number', placeholder:'50' },
  { cat:'Playlist & Selection', key:'match-filter',     flag:'--match-filter',          hasVal:true,  label:'Match filter',                desc:'Only download videos matching this metadata expression, e.g. duration<3600', type:'text', placeholder:'duration < 3600' },
  { cat:'Playlist & Selection', key:'dateafter',        flag:'--dateafter',             hasVal:true,  label:'Date after (YYYYMMDD)',        desc:'Only download videos uploaded on or after this date',                 type:'text',   placeholder:'20240101' },
  { cat:'Playlist & Selection', key:'datebefore',       flag:'--datebefore',            hasVal:true,  label:'Date before (YYYYMMDD)',       desc:'Only download videos uploaded on or before this date',                type:'text',   placeholder:'20241231' },
  { cat:'Playlist & Selection', key:'download-sections', flag:'--download-sections',   hasVal:true,  label:'Download sections',           desc:'Download only specific time range or chapter, e.g. *10:15-20:30',     type:'text',   placeholder:'*10:15-20:30' },
  { cat:'Playlist & Selection', key:'flat-playlist',    flag:'--flat-playlist',         hasVal:false, label:'Flat playlist (list only)',    desc:'List playlist entries without downloading each video — useful for inspection', type:'toggle' },
  // Thumbnails
  { cat:'Thumbnails', key:'write-thumbnail',        flag:'--write-thumbnail',           hasVal:false, label:'Write thumbnail',             desc:'Save the best available thumbnail image to disk',                     type:'toggle' },
  { cat:'Thumbnails', key:'write-all-thumbnails',   flag:'--write-all-thumbnails',      hasVal:false, label:'Write all thumbnails',        desc:'Save every available thumbnail resolution/format to disk',            type:'toggle' },
  { cat:'Thumbnails', key:'convert-thumbnails',     flag:'--convert-thumbnails',        hasVal:true,  label:'Convert thumbnails to',       desc:'Convert saved thumbnails to this format (requires FFmpeg)',            type:'select', opts:[{value:'',label:'Disabled'},{value:'jpg',label:'JPG'},{value:'png',label:'PNG'},{value:'webp',label:'WebP'}] },
  // SponsorBlock
  { cat:'SponsorBlock', key:'sponsorblock-remove',  flag:'--sponsorblock-remove',       hasVal:true,  label:'SponsorBlock: remove',        desc:'Cut out these segment categories (comma-separated): sponsor, intro, outro, selfpromo, preview, filler, interaction, music_offtopic, poi_highlight, chapter, all', type:'text', placeholder:'sponsor,intro,outro' },
  { cat:'SponsorBlock', key:'sponsorblock-mark',    flag:'--sponsorblock-mark',         hasVal:true,  label:'SponsorBlock: mark as chapter', desc:'Add chapter markers for these categories instead of removing them',  type:'text',   placeholder:'sponsor' },
  { cat:'SponsorBlock', key:'no-sponsorblock',      flag:'--no-sponsorblock',           hasVal:false, label:'Disable SponsorBlock',        desc:'Disable all SponsorBlock features',                                   type:'toggle' },
];

function getExtraArgs(prefix) {
  const args = [];
  YTDLP_OPTS.forEach(opt => {
    const stored = localStorage.getItem(prefix + opt.key);
    if (opt.type === 'toggle') {
      if (stored === 'true') args.push(opt.flag);
    } else if (stored) {
      args.push(opt.flag, stored);
    }
  });
  return args;
}
function getExtraYtdlpArgs() { return getExtraArgs('ytdlp-opt:'); }
function getBatchExtraArgs()  { return getExtraArgs('batch-opt:'); }

function renderOpts(containerId, prefix, filter) {
  const container = document.getElementById(containerId);
  if (!container) return;
  const q = (filter || '').toLowerCase().trim();

  // Group options by category
  const cats = {};
  YTDLP_OPTS.forEach(opt => { (cats[opt.cat] = cats[opt.cat] || []).push(opt); });

  container.innerHTML = '';
  let anyVisible = false;

  Object.entries(cats).forEach(([catName, opts]) => {
    let catVisible = false;
    const group = document.createElement('div');
    group.className = 'ytdlp-opts-group';

    const title = document.createElement('div');
    title.className = 'ytdlp-opts-group-title';
    title.textContent = catName;
    group.appendChild(title);

    opts.forEach(opt => {
      const match = !q || opt.flag.includes(q) || opt.label.toLowerCase().includes(q) || opt.desc.toLowerCase().includes(q);
      if (match) { catVisible = anyVisible = true; }

      const row = document.createElement('div');
      row.className = 'ytdlp-opt-row' + (match ? '' : ' opt-hidden');

      const flagEl = document.createElement('span');
      flagEl.className = 'ytdlp-opt-flag';
      flagEl.title = opt.flag;
      flagEl.textContent = opt.flag;

      const textEl = document.createElement('div');
      textEl.className = 'ytdlp-opt-text';
      const labelEl = document.createElement('div');
      labelEl.className = 'ytdlp-opt-label';
      labelEl.textContent = opt.label;
      const descEl = document.createElement('div');
      descEl.className = 'ytdlp-opt-desc';
      descEl.textContent = opt.desc;
      textEl.appendChild(labelEl);
      textEl.appendChild(descEl);

      const ctrlEl = document.createElement('div');
      ctrlEl.className = 'ytdlp-opt-ctrl';
      const stored = localStorage.getItem(prefix + opt.key);

      if (opt.type === 'toggle') {
        const lbl = document.createElement('label');
        lbl.className = 'toggle-switch';
        const chk = document.createElement('input');
        chk.type = 'checkbox';
        chk.checked = stored === 'true';
        chk.addEventListener('change', () => localStorage.setItem(prefix + opt.key, chk.checked));
        const track = document.createElement('span');
        track.className = 'toggle-track';
        const thumb = document.createElement('span');
        thumb.className = 'toggle-thumb';
        track.appendChild(thumb);
        lbl.appendChild(chk);
        lbl.appendChild(track);
        ctrlEl.appendChild(lbl);
      } else if (opt.type === 'select') {
        const sel = document.createElement('select');
        sel.className = 'form-select';
        opt.opts.forEach(o => {
          const option = document.createElement('option');
          option.value = o.value;
          option.textContent = o.label;
          if (stored === o.value) option.selected = true;
          sel.appendChild(option);
        });
        sel.addEventListener('change', () => {
          if (sel.value) localStorage.setItem(prefix + opt.key, sel.value);
          else           localStorage.removeItem(prefix + opt.key);
        });
        ctrlEl.appendChild(sel);
      } else {
        const inp = document.createElement('input');
        inp.type = opt.type === 'number' ? 'number' : opt.type === 'password' ? 'password' : 'text';
        inp.className = 'form-input';
        inp.placeholder = opt.placeholder || '';
        inp.value = stored || '';
        inp.addEventListener('input', () => {
          if (inp.value.trim()) localStorage.setItem(prefix + opt.key, inp.value.trim());
          else                  localStorage.removeItem(prefix + opt.key);
        });
        ctrlEl.appendChild(inp);
      }

      row.appendChild(flagEl);
      row.appendChild(textEl);
      row.appendChild(ctrlEl);
      group.appendChild(row);
    });

    if (!catVisible) group.classList.add('opt-hidden');
    container.appendChild(group);
  });

  if (!anyVisible) {
    const msg = document.createElement('div');
    msg.className = 'ytdlp-no-results';
    msg.textContent = 'No options match "' + filter + '"';
    container.appendChild(msg);
  }
}
function renderYtdlpOpts(filter) { renderOpts('ytdlp-opts-container', 'ytdlp-opt:', filter); }
function renderBatchOpts(filter) { renderOpts('batch-opts-container', 'batch-opt:', filter); }

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
  }
}

// ── Terminal helpers ───────────────────────────────────────────
function classifyLine(text, streamType) {
  const t = text.trimStart();
  if (/^\[debug\]/i.test(t))                    return 'debug';
  if (/^warning:/i.test(t))                      return 'warning';
  if (/^error:/i.test(t))                        return 'error';
  if (/\berror\b.*:/i.test(t) && streamType === 'stderr') return 'error';
  if (streamType === 'stdout' && /:\s*$/.test(t)) return 'input';
  return streamType; // 'stdout' or 'stderr'
}

function appendLog(logEl, text, cls) {
  const line = document.createElement('div');
  line.className = 'line-' + cls;
  line.textContent = text;
  logEl.appendChild(line);
  // Only flag critical failure on Python tracebacks — these mean an unhandled
  // exception killed the process. A plain ERROR: line (e.g. one video in a
  // playlist failed) does NOT mean the whole run failed.
  const t = text.trimStart();
  if (/^Traceback \(most recent call last\)/i.test(t) || /^\s+File ".*\.py"/.test(text)) {
    logEl._hasError = true;
  }
  const scroller = logEl.closest('.content') ?? logEl;

  // Cap log DOM at 2000 lines; trim oldest 100 at a time to keep layout cheap
  logEl._lineCount = (logEl._lineCount || 0) + 1;
  if (logEl._lineCount > 2000) {
    let removed = 0;
    while (removed < 100 && logEl.firstChild) {
      const first = logEl.firstChild;
      if (first.classList.contains('log-body-start') ||
          first.classList.contains('log-detail') ||
          first.classList.contains('log-expand-arrow')) break;
      logEl.removeChild(first);
      removed++;
    }
    logEl._lineCount -= removed;
  }

  if (!scroller._rafPending) {
    scroller._rafPending = true;
    requestAnimationFrame(() => {
      scroller._rafPending = false;
      if (scroller._autoFollow !== false && logEl.closest('.tab-panel')?.classList.contains('active')) {
        scroller.scrollTop = scroller.scrollHeight;
      }
    });
  }
}
function clearLog(logEl) {
  const scroller = logEl.closest('.content');
  if (scroller && logEl._scrollBtnHandler) {
    scroller.removeEventListener('scroll', logEl._scrollBtnHandler);
    logEl._scrollBtnHandler = null;
  }
  logEl.innerHTML = '';
  logEl._lineCount = 0;
  logEl._hasError = false;
  if (scroller) scroller._autoFollow = true;
  logEl.closest('.terminal-wrap')?.classList.remove('collapsed');
  logEl.closest('.terminal-wrap')?.querySelector('.log-scroll-btn')?.remove();
}

function markBodyStart(logEl) {
  const m = document.createElement('div');
  m.className = 'log-body-start';
  logEl.appendChild(m);

  const wrap = logEl.closest('.terminal-wrap');
  const scroller = logEl.closest('.content');
  if (!wrap || !scroller) return;

  const svgUp   = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none"><polyline points="18 15 12 9 6 15" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  const svgDown = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none"><polyline points="6 9 12 15 18 9" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';

  const btn = document.createElement('div');
  btn.className = 'log-scroll-btn';
  btn.style.display = 'none';
  wrap.appendChild(btn);

  scroller._autoFollow = true;

  const updateBtn = () => {
    const hasScroll = scroller.scrollHeight > scroller.clientHeight + 20;
    btn.style.display = hasScroll ? 'flex' : 'none';
    if (scroller._autoFollow) {
      btn.innerHTML = svgUp;
      btn.title = 'Scroll to top';
    } else {
      btn.innerHTML = svgDown;
      btn.title = 'Resume auto-scroll';
    }
  };

  btn.addEventListener('click', () => {
    if (scroller._autoFollow) {
      // Pause auto-scroll and jump to top
      scroller._autoFollow = false;
      updateBtn();
      wrap.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } else {
      // Resume auto-scroll and jump to bottom
      scroller._autoFollow = true;
      updateBtn();
      scroller.scrollTop = scroller.scrollHeight;
    }
  });

  // Only re-enables auto-follow (never disables it — only the ↑ button does that)
  logEl._scrollBtnHandler = () => {
    const atBottom = scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 30;
    if (atBottom && !scroller._autoFollow) {
      scroller._autoFollow = true;
    }
    updateBtn();
  };

  scroller.addEventListener('scroll', logEl._scrollBtnHandler);
}

function collapseLogBody(logEl, failed) {
  const sentinel = logEl.querySelector('.log-body-start');
  if (!sentinel) return;
  const all = Array.from(logEl.children);
  const start = all.indexOf(sentinel);
  const bodyLines = all.slice(start + 1, all.length - 1);
  if (bodyLines.length === 0) { sentinel.remove(); return; }

  // On failure: keep error/warning/stderr lines visible, hide the rest
  // On success: keep nothing visible (standard collapse — show summary only)
  const isVisible = failed
    ? el => el.classList.contains('line-error') || el.classList.contains('line-warning') || el.classList.contains('line-stderr')
    : () => false;

  const visible = bodyLines.filter(isVisible);
  const hidden  = bodyLines.filter(el => !isVisible(el));

  const detail = document.createElement('div');
  detail.className = 'log-detail';
  hidden.forEach(el => detail.appendChild(el));
  sentinel.replaceWith(detail);

  // Re-insert visible lines (errors/warnings) after the detail block
  visible.forEach(el => logEl.appendChild(el));

  const arrow = document.createElement('div');
  arrow.className = 'log-expand-arrow';
  arrow.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none"><polyline points="6 9 12 15 18 9" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  arrow.addEventListener('click', () => {
    const open = detail.classList.toggle('open');
    arrow.classList.toggle('open', open);
    if (open) {
      const scroller = logEl.closest('.content') ?? logEl;
      scroller.scrollTop = scroller.scrollHeight;
    }
  });
  logEl.appendChild(arrow);

  // Shrink the terminal wrap to fit collapsed content
  logEl.closest('.terminal-wrap')?.classList.add('collapsed');

  // Trigger button visibility update now that content has collapsed
  logEl._scrollBtnHandler?.();
}

function handleOutput(logEl, data, onExit) {
  switch (data.type) {
    case 'stdout':
    case 'stderr': {
      const stream = data.type;
      data.text.trimEnd().split('\n').forEach(line => {
        if (line === '') return;
        appendLog(logEl, line, classifyLine(line, stream));
      });
      break;
    }
    case 'error':   appendLog(logEl, '⚠ ' + data.text, 'error'); break;
    case 'exit': {
      const failed = data.code !== 0 || !!logEl._hasError;
      logEl._hasError = false;
      if (!failed) appendLog(logEl, '✔ Process finished successfully.', 'success');
      else if (data.code !== 0) appendLog(logEl, `✖ Process exited with code ${data.code}`, 'error');
      else appendLog(logEl, '✖ Process reported errors (exit code 0).', 'error');
      collapseLogBody(logEl, failed);
      if (onExit) onExit(data.code);
      break;
    }
  }
}

// ══════════════════════════════════════════════════════════════
// ── 1. Live Stream Archiver ────────────────────────────────────
// ══════════════════════════════════════════════════════════════
(function () {
  const log      = document.getElementById('ls-log');
  const runBtn   = document.getElementById('ls-run');
  const pauseBtn = document.getElementById('ls-pause');
  const stopBtn  = document.getElementById('ls-stop');
  let currentPid = null;
  let isPaused   = false;

  const pauseIconHTML = pauseBtn.innerHTML;
  const resumeIconHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none"><polygon points="5 3 19 12 5 21 5 3" fill="currentColor"/></svg> Resume`;

  document.getElementById('ls-clear').addEventListener('click', () => clearLog(log));

  stopBtn.addEventListener('click', () => {
    if (currentPid) window.api.stopScript(currentPid);
  });

  pauseBtn.addEventListener('click', () => {
    if (!currentPid) return;
    if (!isPaused) {
      isPaused = true;
      window.api.pauseScript(currentPid);
      pauseBtn.innerHTML = resumeIconHTML;
      pauseBtn.classList.add('paused');
      appendLog(log, '⏸ Paused.', 'info');
    } else {
      isPaused = false;
      window.api.resumeScript(currentPid);
      pauseBtn.innerHTML = pauseIconHTML;
      pauseBtn.classList.remove('paused');
      appendLog(log, '▶ Resumed.', 'info');
    }
  });

  runBtn.addEventListener('click', () => {
    const url         = document.getElementById('ls-url').value.trim();
    const outputDir   = document.getElementById('ls-output').value.trim();
    const format      = document.getElementById('ls-quality').value;
    const cookiesPath = document.getElementById('ls-cookies').value.trim();
    const container   = document.getElementById('ls-container').value;

    if (!url)       { appendLog(log, '⚠ Please enter a stream URL.', 'error'); return; }
    if (!outputDir) { appendLog(log, '⚠ Please choose an output directory.', 'error'); return; }

    clearLog(log);
    appendLog(log, `▶ Starting live archiver...`, 'info');
    appendLog(log, `  URL:    ${url}`, 'cmd');
    appendLog(log, `  Format: ${format}`, 'cmd');
    appendLog(log, `  Container: ${container}`, 'cmd');
    appendLog(log, `  Output: ${outputDir}`, 'cmd');
    if (cookiesPath) appendLog(log, `  Cookies: ${cookiesPath}`, 'cmd');
    appendLog(log, '', 'stdout');
    markBodyStart(log);

    currentPid = null;
    isPaused   = false;
    pauseBtn.innerHTML = pauseIconHTML;
    pauseBtn.classList.remove('paused');

    runBtn.classList.add('hidden');
    pauseBtn.classList.remove('hidden');
    stopBtn.classList.remove('hidden');
    incRunning();

    window.api.removeAllListeners('livestream-output');
    window.api.onLivestreamOutput((data) => {
      if (data.type === 'pid') { currentPid = data.pid; return; }
      handleOutput(log, data, () => {
        runBtn.classList.remove('hidden');
        pauseBtn.classList.add('hidden');
        stopBtn.classList.add('hidden');
        pauseBtn.innerHTML = pauseIconHTML;
        pauseBtn.classList.remove('paused');
        isPaused = false;
        decRunning();
      });
    });

    window.api.runLivestream({ url, outputDir, format, cookiesPath, container });
  });
})();

// ══════════════════════════════════════════════════════════════
// ── 2. yt-dlp Single ──────────────────────────────────────────
// ══════════════════════════════════════════════════════════════
(function () {
  const log      = document.getElementById('yd-log');
  const runBtn   = document.getElementById('yd-run');
  const pauseBtn = document.getElementById('yd-pause');
  const stopBtn  = document.getElementById('yd-stop');
  let currentPid = null;
  let isPaused   = false;

  const pauseIconHTML = pauseBtn.innerHTML;
  const resumeIconHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none"><polygon points="5 3 19 12 5 21 5 3" fill="currentColor"/></svg> Resume`;

  document.getElementById('yd-clear').addEventListener('click', () => clearLog(log));

  stopBtn.addEventListener('click', () => {
    if (currentPid) window.api.stopScript(currentPid);
  });

  pauseBtn.addEventListener('click', () => {
    if (!currentPid) return;
    if (!isPaused) {
      isPaused = true;
      window.api.pauseScript(currentPid);
      pauseBtn.innerHTML = resumeIconHTML;
      pauseBtn.classList.add('paused');
      appendLog(log, '⏸ Paused.', 'info');
    } else {
      isPaused = false;
      window.api.resumeScript(currentPid);
      pauseBtn.innerHTML = pauseIconHTML;
      pauseBtn.classList.remove('paused');
      appendLog(log, '▶ Resumed.', 'info');
    }
  });

  runBtn.addEventListener('click', () => {
    const url         = document.getElementById('yd-url').value.trim();
    const outputDir   = document.getElementById('yd-output').value.trim();
    const format      = document.getElementById('yd-format').value;
    const cookiesPath = document.getElementById('yd-cookies').value.trim();
    const container   = document.getElementById('yd-container').value;
    const startTime   = document.getElementById('yd-start').value.trim();
    const endTime     = document.getElementById('yd-end').value.trim();

    if (!url)       { appendLog(log, '⚠ Please enter a URL.', 'error'); return; }
    if (!outputDir) { appendLog(log, '⚠ Please choose an output directory.', 'error'); return; }

    clearLog(log);
    appendLog(log, `▶ Starting yt-dlp download...`, 'info');
    appendLog(log, `  URL:    ${url}`, 'cmd');
    appendLog(log, `  Format: ${format}`, 'cmd');
    appendLog(log, `  Container: ${container}`, 'cmd');
    if (startTime || endTime) appendLog(log, `  Clip: ${startTime || '0:00:00'} → ${endTime || 'end'}`, 'cmd');
    appendLog(log, `  Output: ${outputDir}`, 'cmd');
    if (cookiesPath) appendLog(log, `  Cookies: ${cookiesPath}`, 'cmd');
    appendLog(log, '', 'stdout');
    markBodyStart(log);

    currentPid = null;
    isPaused   = false;
    pauseBtn.innerHTML = pauseIconHTML;
    pauseBtn.classList.remove('paused');

    runBtn.classList.add('hidden');
    pauseBtn.classList.remove('hidden');
    stopBtn.classList.remove('hidden');
    incRunning();

    window.api.removeAllListeners('ytdlp-output');
    window.api.onYtdlpOutput((data) => {
      if (data.type === 'pid') { currentPid = data.pid; return; }
      handleOutput(log, data, () => {
        runBtn.classList.remove('hidden');
        pauseBtn.classList.add('hidden');
        stopBtn.classList.add('hidden');
        pauseBtn.innerHTML = pauseIconHTML;
        pauseBtn.classList.remove('paused');
        isPaused = false;
        document.getElementById('yd-start').value = '';
        document.getElementById('yd-end').value   = '';
        decRunning();
      });
    });

    window.api.runYtdlp({ url, outputDir, format, cookiesPath, extraArgs: getExtraYtdlpArgs(), container, startTime, endTime });
  });
})();

// ══════════════════════════════════════════════════════════════
// ── 3. Batch Downloader ───────────────────────────────────────
// ══════════════════════════════════════════════════════════════
(function () {
  const log        = document.getElementById('batch-log');
  const runBtn     = document.getElementById('batch-run');
  const pauseBtn   = document.getElementById('batch-pause');
  const stopBtn    = document.getElementById('batch-stop');
  const textarea   = document.getElementById('batch-urls');
  const counter    = document.getElementById('batch-counter');
  const progressWrap = document.getElementById('batch-progress-wrap');
  const progressBar  = document.getElementById('batch-progress-bar');
  const progressLbl  = document.getElementById('batch-progress-label');
  let currentPid = null;
  let isPaused   = false;

  const pauseIconHTML = pauseBtn.innerHTML;
  const resumeIconHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none"><polygon points="5 3 19 12 5 21 5 3" fill="currentColor"/></svg> Resume`;

  // Live URL counter
  textarea.addEventListener('input', () => {
    const urls = getUrls();
    counter.textContent = urls.length + (urls.length === 1 ? ' URL' : ' URLs');
  });

  function getUrls() {
    return textarea.value.split('\n').map(l => l.trim()).filter(l => l.length > 0 && l.startsWith('http'));
  }

  document.getElementById('batch-clear').addEventListener('click', () => clearLog(log));

  stopBtn.addEventListener('click', () => {
    if (currentPid) window.api.stopScript(currentPid);
  });

  pauseBtn.addEventListener('click', () => {
    if (!currentPid) return;
    if (!isPaused) {
      isPaused = true;
      window.api.pauseScript(currentPid);
      pauseBtn.innerHTML = resumeIconHTML;
      pauseBtn.classList.add('paused');
      appendLog(log, '⏸ Paused.', 'info');
    } else {
      isPaused = false;
      window.api.resumeScript(currentPid);
      pauseBtn.innerHTML = pauseIconHTML;
      pauseBtn.classList.remove('paused');
      appendLog(log, '▶ Resumed.', 'info');
    }
  });

  runBtn.addEventListener('click', () => {
    const urls        = getUrls();
    const outputDir   = document.getElementById('batch-output').value.trim();
    const format      = document.getElementById('batch-format').value;
    const rest        = document.getElementById('batch-rest').checked;
    const cookiesPath = document.getElementById('batch-cookies').value.trim();
    const container   = document.getElementById('batch-container').value;

    if (urls.length === 0) { appendLog(log, '⚠ Please enter at least one valid URL.', 'error'); return; }
    if (!outputDir)        { appendLog(log, '⚠ Please choose an output directory.', 'error'); return; }

    clearLog(log);
    appendLog(log, `▶ Starting batch download of ${urls.length} URL(s)...`, 'info');
    appendLog(log, `  Format: ${format}`, 'cmd');
    appendLog(log, `  Container: ${container}`, 'cmd');
    appendLog(log, `  Rest between downloads: ${rest ? 'Yes (~5 min)' : 'No'}`, 'cmd');
    appendLog(log, `  Output: ${outputDir}`, 'cmd');
    if (cookiesPath) appendLog(log, `  Cookies: ${cookiesPath}`, 'cmd');
    appendLog(log, '', 'stdout');
    markBodyStart(log);

    progressWrap.classList.remove('hidden');
    progressBar.style.width = '0%';
    progressLbl.textContent = `0 / ${urls.length}`;

    currentPid = null;
    isPaused   = false;
    pauseBtn.innerHTML = pauseIconHTML;
    pauseBtn.classList.remove('paused');

    runBtn.classList.add('hidden');
    pauseBtn.classList.remove('hidden');
    stopBtn.classList.remove('hidden');
    incRunning();

    window.api.removeAllListeners('batch-output');
    window.api.onBatchOutput((data) => {
      if (data.type === 'pid') { currentPid = data.pid; return; }
      handleOutput(log, data, () => {
        runBtn.classList.remove('hidden');
        pauseBtn.classList.add('hidden');
        stopBtn.classList.add('hidden');
        pauseBtn.innerHTML = pauseIconHTML;
        pauseBtn.classList.remove('paused');
        isPaused = false;
        decRunning();
      });
    });

    window.api.runBatch({ urls, outputDir, format, rest, cookiesPath, extraArgs: getBatchExtraArgs(), container });
  });
})();

// ══════════════════════════════════════════════════════════════
// ── 4. M3U8 Downloader ────────────────────────────────────────
// ══════════════════════════════════════════════════════════════
(function () {
  const log        = document.getElementById('m3-log');
  const runBtn     = document.getElementById('m3-run');
  const pauseBtn   = document.getElementById('m3-pause');
  const stopBtn    = document.getElementById('m3-stop');
  const encodeChk  = document.getElementById('m3-encode');
  const encodeOpts = document.querySelectorAll('.encode-options');
  let currentPid = null;
  let isPaused   = false;

  const pauseIconHTML = pauseBtn.innerHTML;
  const resumeIconHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none"><polygon points="5 3 19 12 5 21 5 3" fill="currentColor"/></svg> Resume`;

  // Toggle encode options
  encodeChk.addEventListener('change', () => {
    encodeOpts.forEach(el => el.classList.toggle('hidden', !encodeChk.checked));
    if (encodeChk.checked) {
      const advBody = document.getElementById('m3-adv');
      const advBtn  = document.querySelector('[data-adv="m3-adv"]');
      if (advBody && !advBody.classList.contains('open')) {
        advBody.classList.add('open');
        advBtn?.setAttribute('aria-expanded', 'true');
      }
    }
  });
  document.getElementById('m3-encode-toggle').addEventListener('click', (e) => {
    if (e.target.closest('label')) return;
    encodeChk.checked = !encodeChk.checked;
    encodeChk.dispatchEvent(new Event('change'));
  });

  document.getElementById('m3-clear').addEventListener('click', () => clearLog(log));

  stopBtn.addEventListener('click', () => {
    if (currentPid) window.api.stopScript(currentPid);
  });

  pauseBtn.addEventListener('click', () => {
    if (!currentPid) return;
    if (!isPaused) {
      isPaused = true;
      window.api.pauseScript(currentPid);
      pauseBtn.innerHTML = resumeIconHTML;
      pauseBtn.classList.add('paused');
      appendLog(log, '⏸ Paused.', 'info');
    } else {
      isPaused = false;
      window.api.resumeScript(currentPid);
      pauseBtn.innerHTML = pauseIconHTML;
      pauseBtn.classList.remove('paused');
      appendLog(log, '▶ Resumed.', 'info');
    }
  });

  runBtn.addEventListener('click', () => {
    const url          = document.getElementById('m3-url').value.trim();
    const outputDir    = document.getElementById('m3-output').value.trim();
    const encode       = encodeChk.checked;
    const container    = document.getElementById('m3-container').value;
    const codec        = document.getElementById('m3-codec').value;
    const bitrate      = document.getElementById('m3-bitrate').value;
    const resolution   = document.getElementById('m3-resolution').value;
    const fps          = document.getElementById('m3-fps').value;
    const audioBitrate = document.getElementById('m3-audio-bitrate').value;
    const cookiesPath  = document.getElementById('m3-cookies').value.trim();

    if (!url)       { appendLog(log, '⚠ Please enter an M3U8 URL.', 'error'); return; }
    if (!outputDir) { appendLog(log, '⚠ Please choose an output directory.', 'error'); return; }

    clearLog(log);
    appendLog(log, `▶ Starting M3U8 download...`, 'info');
    appendLog(log, `  URL:    ${url}`, 'cmd');
    appendLog(log, `  Output: ${outputDir}`, 'cmd');
    if (encode) {
      appendLog(log, `  Codec:  ${codec}`, 'cmd');
      appendLog(log, `  Video:  ${bitrate}  ${resolution !== 'source' ? resolution : 'source res'}  ${fps !== 'source' ? fps + 'fps' : 'source fps'}`, 'cmd');
      appendLog(log, `  Audio:  ${audioBitrate} AAC`, 'cmd');
    } else {
      appendLog(log, `  Re-encode: No (direct ${container.toUpperCase()} download)`, 'cmd');
    }
    if (cookiesPath) appendLog(log, `  Cookies: ${cookiesPath}`, 'cmd');
    appendLog(log, '', 'stdout');
    markBodyStart(log);

    currentPid = null;
    isPaused   = false;
    pauseBtn.innerHTML = pauseIconHTML;
    pauseBtn.classList.remove('paused');

    runBtn.classList.add('hidden');
    pauseBtn.classList.remove('hidden');
    stopBtn.classList.remove('hidden');
    incRunning();

    window.api.removeAllListeners('m3u8-output');
    window.api.onM3u8Output((data) => {
      if (data.type === 'pid') { currentPid = data.pid; return; }
      handleOutput(log, data, () => {
        runBtn.classList.remove('hidden');
        pauseBtn.classList.add('hidden');
        stopBtn.classList.add('hidden');
        pauseBtn.innerHTML = pauseIconHTML;
        pauseBtn.classList.remove('paused');
        isPaused = false;
        decRunning();
      });
    });

    window.api.runM3u8({ url, outputDir, encode, codec, bitrate, resolution, fps, audioBitrate, container, cookiesPath });
  });
})()

// ══════════════════════════════════════════════════════════════
// ── 5. gallery-dl ─────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════
try {
(function () {
  const log      = document.getElementById('gdl-log');
  const runBtn   = document.getElementById('gdl-run');
  const pauseBtn = document.getElementById('gdl-pause');
  const stopBtn  = document.getElementById('gdl-stop');

  // Verify elements exist before touching them
  if (!log || !runBtn || !pauseBtn || !stopBtn) {
    console.error('[gallery-dl IIFE] Missing element:', { log, runBtn, pauseBtn, stopBtn });
    throw new Error('Missing DOM element — see console');
  }
  let currentPid = null;
  let isPaused   = false;

  const pauseIconHTML  = pauseBtn.innerHTML;
  const resumeIconHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none"><polygon points="5 3 19 12 5 21 5 3" fill="currentColor"/></svg> Resume`;

  document.getElementById('gdl-clear').addEventListener('click', () => clearLog(log));

  stopBtn.addEventListener('click', () => {
    if (currentPid) window.api.stopScript(currentPid);
  });

  pauseBtn.addEventListener('click', () => {
    if (!currentPid) return;
    if (!isPaused) {
      isPaused = true;
      window.api.pauseScript(currentPid);
      pauseBtn.innerHTML = resumeIconHTML;
      pauseBtn.classList.add('paused');
      appendLog(log, '⏸ Paused.', 'info');
    } else {
      isPaused = false;
      window.api.resumeScript(currentPid);
      pauseBtn.innerHTML = pauseIconHTML;
      pauseBtn.classList.remove('paused');
      appendLog(log, '▶ Resumed.', 'info');
    }
  });

  runBtn.addEventListener('click', () => {
    const url         = document.getElementById('gdl-url').value.trim();
    const outputDir   = document.getElementById('gdl-output').value.trim();
    const filetypes   = document.getElementById('gdl-filetypes').value;
    const metadata    = document.getElementById('gdl-meta').checked;
    const cookiesPath = document.getElementById('gdl-cookies').value.trim();

    if (!url)       { appendLog(log, '⚠ Please enter a URL.', 'error'); return; }
    if (!outputDir) { appendLog(log, '⚠ Please choose an output directory.', 'error'); return; }

    clearLog(log);
    appendLog(log, `▶ Starting gallery-dl...`, 'info');
    appendLog(log, `  URL:       ${url}`, 'cmd');
    appendLog(log, `  Files:     ${filetypes === 'all' ? 'All files' : filetypes}`, 'cmd');
    appendLog(log, `  Metadata:  ${metadata ? 'Yes' : 'No'}`, 'cmd');
    appendLog(log, `  Output:    ${outputDir}`, 'cmd');
    if (cookiesPath) appendLog(log, `  Cookies:   ${cookiesPath}`, 'cmd');
    appendLog(log, '', 'stdout');
    markBodyStart(log);

    currentPid = null;
    isPaused   = false;
    pauseBtn.innerHTML = pauseIconHTML;
    pauseBtn.classList.remove('paused');

    runBtn.classList.add('hidden');
    pauseBtn.classList.remove('hidden');
    stopBtn.classList.remove('hidden');
    incRunning();

    window.api.removeAllListeners('gallery-dl-output');
    window.api.onGalleryDlOutput((data) => {
      if (data.type === 'pid') { currentPid = data.pid; return; }
      handleOutput(log, data, () => {
        runBtn.classList.remove('hidden');
        pauseBtn.classList.add('hidden');
        stopBtn.classList.add('hidden');
        pauseBtn.innerHTML = pauseIconHTML;
        pauseBtn.classList.remove('paused');
        isPaused = false;
        decRunning();
      });
    });

    window.api.runGalleryDl({ url, outputDir, filetypes, metadata, cookiesPath });
  });
})()
} catch (e) {
  // Show any IIFE init error in the log box if available, else alert
  const errBox = document.getElementById('gdl-log');
  if (errBox) {
    const d = document.createElement('div');
    d.className = 'line-error';
    d.textContent = '⚠ gallery-dl init error: ' + e.message;
    errBox.appendChild(d);
  } else {
    alert('gallery-dl init error: ' + e.message);
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// ── 6. Settings ──────────────────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════
(function () {
  // Apply all settings on init
  Object.keys(SETTINGS_MAP).forEach(key => applySetting(key, getSetting(key)));

  // Sync checkbox states and listen for changes
  document.querySelectorAll('[data-setting]').forEach(chk => {
    chk.checked = getSetting(chk.dataset.setting);
    chk.addEventListener('change', () => {
      localStorage.setItem('setting:' + chk.dataset.setting, chk.checked);
      applySetting(chk.dataset.setting, chk.checked);
    });
  });

  // Accordion: yt-dlp Advanced Options
  const advToggle = document.getElementById('ytdlp-advanced-toggle');
  const advBody   = document.getElementById('ytdlp-advanced-body');
  if (advToggle && advBody) {
    advToggle.addEventListener('click', () => {
      const open = advBody.classList.toggle('open');
      advToggle.setAttribute('aria-expanded', open);
      if (open && !advBody.dataset.rendered) {
        advBody.dataset.rendered = '1';
        renderYtdlpOpts('');
        const ytdlpSearch = document.getElementById('ytdlp-opts-search');
        if (ytdlpSearch) {
          ytdlpSearch.addEventListener('input', () => renderYtdlpOpts(ytdlpSearch.value));
        }
      }
    });
  }

  // Accordion: Batch Advanced Options
  const batchAdvToggle = document.getElementById('batch-advanced-toggle');
  const batchAdvBody   = document.getElementById('batch-advanced-body');
  if (batchAdvToggle && batchAdvBody) {
    batchAdvToggle.addEventListener('click', () => {
      const open = batchAdvBody.classList.toggle('open');
      batchAdvToggle.setAttribute('aria-expanded', open);
      if (open && !batchAdvBody.dataset.rendered) {
        batchAdvBody.dataset.rendered = '1';
        renderBatchOpts('');
        const batchSearch = document.getElementById('batch-opts-search');
        if (batchSearch) {
          batchSearch.addEventListener('input', () => renderBatchOpts(batchSearch.value));
        }
      }
    });
  }
})();

// ══════════════════════════════════════════════════════════════════════════════
// ── 7. Form field persistence ─────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════
(function () {
  function fkey(id) { return 'field:' + id; }

  // Text inputs — save on every keystroke
  const TEXT_IDS = [
    'ls-output',    'ls-cookies',
    'yd-output',    'yd-cookies',
    'batch-output', 'batch-cookies',
    'm3-output',    'm3-cookies',
    'gdl-output',   'gdl-cookies',
  ];

  // Select dropdowns — save on change
  const SELECT_IDS = [
    'ls-quality',
    'yd-format',
    'batch-format',
    'm3-codec', 'm3-bitrate', 'm3-resolution', 'm3-fps', 'm3-audio-bitrate', 'm3-container',
    'gdl-filetypes',
  ];

  // Checkboxes on the tool tabs (not settings-page toggles) — save on change
  const CHECK_IDS = ['batch-rest', 'm3-encode', 'gdl-meta'];

  TEXT_IDS.forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    const v = localStorage.getItem(fkey(id));
    if (v !== null) el.value = v;
    el.addEventListener('input', () => localStorage.setItem(fkey(id), el.value));
  });

  SELECT_IDS.forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    const v = localStorage.getItem(fkey(id));
    if (v !== null && [...el.options].some(o => o.value === v)) el.value = v;
    el.addEventListener('change', () => localStorage.setItem(fkey(id), el.value));
  });

  CHECK_IDS.forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    const v = localStorage.getItem(fkey(id));
    if (v !== null) {
      el.checked = v === 'true';
      // Fire change so any dependent UI (e.g. encode-options visibility) updates
      el.dispatchEvent(new Event('change'));
    }
    el.addEventListener('change', () => localStorage.setItem(fkey(id), el.checked));
  });
})();
