/* ── yt-dlp Advanced Options definition ──────────────────── */
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
  { cat:'Post-Processing', key:'audio-quality',         flag:'--audio-quality',          hasVal:true,  label:'Audio quality',                desc:'0 (best) - 10 (worst) for VBR, or bitrate e.g. 128K',      type:'text',   placeholder:'5' },
  { cat:'Post-Processing', key:'remux-video',           flag:'--remux-video',            hasVal:true,  label:'Remux to container',           desc:'Remux without re-encoding (e.g. mp4, mkv, webm)',           type:'select', opts:[{value:'',label:'Disabled'},{value:'mp4',label:'MP4'},{value:'mkv',label:'MKV'},{value:'webm',label:'WebM'},{value:'mov',label:'MOV'},{value:'avi',label:'AVI'},{value:'flv',label:'FLV'}] },
  { cat:'Post-Processing', key:'recode-video',          flag:'--recode-video',           hasVal:true,  label:'Re-encode video',              desc:'Re-encode into another format, e.g. mp4 or mkv',            type:'text',   placeholder:'mp4' },
  { cat:'Post-Processing', key:'keep-video',            flag:'--keep-video',             hasVal:false, label:'Keep intermediate video',      desc:'Keep original video file after post-processing',            type:'toggle' },
  { cat:'Post-Processing', key:'embed-thumbnail',       flag:'--embed-thumbnail',        hasVal:false, label:'Embed thumbnail',              desc:'Embed video thumbnail as cover art',                        type:'toggle' },
  { cat:'Post-Processing', key:'embed-chapters',        flag:'--embed-chapters',         hasVal:false, label:'Embed chapters',               desc:'Add chapter markers to the video file',                     type:'toggle' },
  { cat:'Post-Processing', key:'split-chapters',        flag:'--split-chapters',         hasVal:false, label:'Split by chapters',            desc:'Split video into separate files per chapter',               type:'toggle' },
  { cat:'Post-Processing', key:'remove-chapters',       flag:'--remove-chapters',        hasVal:true,  label:'Remove chapters (regex)',      desc:'Remove chapters whose title matches a regex pattern',        type:'text',   placeholder:'sponsor.*' },
  { cat:'Post-Processing', key:'ffmpeg-location',       flag:'--ffmpeg-location',        hasVal:true,  label:'FFmpeg location',              desc:'Path to ffmpeg binary or its containing directory',          type:'text',   placeholder:'C:\\\\ffmpeg\\\\bin' },
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
  { cat:'Authentication', key:'client-certificate',     flag:'--client-certificate',     hasVal:true,  label:'Client certificate (PEM)',     desc:'Path to client certificate file in PEM format',                        type:'text',   placeholder:'C:\\certs\\client.pem' },
  { cat:'Authentication', key:'client-certificate-key', flag:'--client-certificate-key', hasVal:true, label:'Certificate private key',      desc:'Path to private key file for client certificate',                      type:'text',   placeholder:'C:\\certs\\client.key' },
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
  { cat:'Download Tuning', key:'site-concurrent-fragments', flag:'--site-concurrent-fragments', hasVal:true, label:'Site-specific concurrent fragments', desc:'Override concurrent fragments by domain (e.g. youtube.com=5, twitch.tv=10)', type:'text', placeholder:'youtube.com=5, twitch.tv=10' },
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
  { cat:'Playlist & Selection', key:'flat-playlist',    flag:'--flat-playlist',         hasVal:false, label:'Flat playlist (list only)',    desc:'List playlist entries without downloading each video - useful for inspection', type:'toggle' },
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
function getExtraYtdlpArgs() {
    let extraArgs = getExtraArgs('ytdlp-opt:');
    if (getSetting('yd-retry-ssl')) { extraArgs.push('--legacy-server-connect'); extraArgs.push('--retries', '10'); }
    const client = document.getElementById('yd-client').value;
    if (client && client !== 'default') extraArgs.push('--extractor-args', 'youtube:player_client=' + client);
    return extraArgs;
}
function getBatchExtraArgs() {
    let extraArgs = getExtraArgs('batch-opt:');
    if (getSetting('yd-retry-ssl')) { extraArgs.push('--legacy-server-connect'); extraArgs.push('--retries', '10'); }
    const client = document.getElementById('batch-client').value;
    if (client && client !== 'default') extraArgs.push('--extractor-args', 'youtube:player_client=' + client);
    return extraArgs;
}


// ── Advanced-opts dirty flags ──────────────────────────────
// Opts are rebuilt from scratch on first render and whenever a value or pin
// actually changes. On subsequent tab switches with no changes, the rebuild
// is skipped entirely, eliminating the layout cost.
const _optsDirty = { ytdlp: true, batch: true };

function markOptsDirty(prefix) {
  if (prefix === 'ytdlp-opt:') _optsDirty.ytdlp = true;
  if (prefix === 'batch-opt:') _optsDirty.batch = true;
}

  function updateAllOpts() {
    renderYtdlpOpts();
    renderBatchOpts();
    renderModifiedOpts('yd-modified-opts', 'ytdlp-opt:');
    renderModifiedOpts('batch-modified-opts', 'batch-opt:');
    _optsDirty.ytdlp = false;
    _optsDirty.batch = false;
  }

// Targeted opt render — only rebuilds containers for the tab being shown.
// Tabs without dynamic opts (livestream, m3u8, gallery, splitter,
// concatenator, encoder) cost nothing.
function updateOptsForTab(tabName) {
  if (tabName === 'ytdlp' && _optsDirty.ytdlp) {
    renderYtdlpOpts();
    renderModifiedOpts('yd-modified-opts', 'ytdlp-opt:');
    _optsDirty.ytdlp = false;
  } else if (tabName === 'batch' && _optsDirty.batch) {
    renderBatchOpts();
    renderModifiedOpts('batch-modified-opts', 'batch-opt:');
    _optsDirty.batch = false;
  }
}

  function createOptRow(opt, prefix, isModifiedView) {
    if (isModifiedView === undefined) isModifiedView = false;
    const row = document.createElement('div');
    row.className = 'form-group';
    if (isModifiedView) {
      row.style.borderLeft = '3px solid var(--accent-color)';
      row.style.paddingLeft = '8px';
      row.style.marginLeft = '-11px';
    }

    const labelRow = document.createElement('div');
    labelRow.className = 'form-label-row';
    labelRow.style.justifyContent = 'space-between';
    labelRow.style.alignItems = 'flex-start';

    const labelWrap = document.createElement('div');
    
    const labelEl = document.createElement('label');
    labelEl.className = 'form-label';
    labelEl.style.marginBottom = '2px';
    labelEl.innerHTML = `${opt.label} <span class="ytdlp-opt-flag" style="margin-left: 6px;">${opt.flag}</span>`;
    labelWrap.appendChild(labelEl);

    if (opt.desc) {
      const descEl = document.createElement('div');
      descEl.className = 'toggle-desc';
      descEl.style.marginTop = '2px';
      descEl.style.marginBottom = '6px';
      descEl.textContent = opt.desc;
      labelWrap.appendChild(descEl);
    }
    labelRow.appendChild(labelWrap);

    if (!isModifiedView) {
      const pinBtn = document.createElement('button');
      pinBtn.className = 'btn-icon ytdlp-opt-pin';
      pinBtn.style.marginTop = '-4px';
      const isPinned = localStorage.getItem('pin:' + prefix + opt.key) === 'true';
      const pinIcon = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="17" x2="12" y2="22"></line><path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 11.24V6a3 3 0 0 0-6 0v5.24a2 2 0 0 1-1.11 1.31l-1.78.9A2 2 0 0 0 5 15.24Z"></path></svg>';
      const pinOffIcon = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="2" y1="2" x2="22" y2="22"></line><line x1="12" y1="17" x2="12" y2="22"></line><path d="M9 9v1.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V17h11"></path><path d="M15 9.34V6a3 3 0 0 0-5.68-1.33"></path></svg>';
      
      pinBtn.innerHTML = isPinned ? pinOffIcon : pinIcon;
      pinBtn.title = isPinned ? 'Unpin from More Options' : 'Pin to More Options';
      if (isPinned) pinBtn.classList.add('pinned');
      
      pinBtn.onclick = () => {
        const currentlyPinned = localStorage.getItem('pin:' + prefix + opt.key) === 'true';
        if (currentlyPinned) {
          localStorage.removeItem('pin:' + prefix + opt.key);
          pinBtn.classList.remove('pinned');
          pinBtn.innerHTML = pinIcon;
          pinBtn.title = 'Pin to More Options';
        } else {
          localStorage.setItem('pin:' + prefix + opt.key, 'true');
          pinBtn.classList.add('pinned');
          pinBtn.innerHTML = pinOffIcon;
          pinBtn.title = 'Unpin from More Options';
        }
        // Mark dirty so the next tab switch re-renders the modified opts panel.
        markOptsDirty(prefix);
        renderModifiedOpts('yd-modified-opts', 'ytdlp-opt:');
        renderModifiedOpts('batch-modified-opts', 'batch-opt:');
      };
      labelRow.appendChild(pinBtn);
    }
    
    row.appendChild(labelRow);

    const ctrlEl = document.createElement('div');
    const stored = localStorage.getItem(prefix + opt.key);

    const onChange = (val) => {
      if (val === null) localStorage.removeItem(prefix + opt.key);
      else localStorage.setItem(prefix + opt.key, val);
      markOptsDirty(prefix);
      if (isModifiedView) updateAllOpts();
    };

    if (opt.type === 'toggle') {
      const lbl = document.createElement('label');
      lbl.className = 'toggle-switch';
      const chk = document.createElement('input');
      chk.type = 'checkbox';
      chk.checked = stored === 'true';
      chk.addEventListener('change', () => onChange(chk.checked));
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
      sel.addEventListener('change', () => onChange(sel.value || null));
      ctrlEl.appendChild(sel);
    } else {
      const inp = document.createElement('input');
      inp.type = opt.type === 'number' ? 'number' : opt.type === 'password' ? 'password' : 'text';
      inp.className = 'form-input';
      inp.placeholder = opt.placeholder || '';
      inp.value = stored || '';
      inp.addEventListener('input', () => onChange(inp.value.trim() || null));
      ctrlEl.appendChild(inp);
    }

    row.appendChild(ctrlEl);
    return row;
  }

  function renderOpts(containerId, prefix, filter) {
    const container = document.getElementById(containerId);
    if (!container) return;
    const q = (filter || '').toLowerCase().trim();

    // Group options by category
    const cats = {};
    YTDLP_OPTS.forEach(opt => { (cats[opt.cat] = cats[opt.cat] || []).push(opt); });

    // Save scroll position
    const scrollPos = container.scrollTop;
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

        const row = createOptRow(opt, prefix, false);
        if (!match) row.classList.add('opt-hidden');
        group.appendChild(row);
      });

      if (!catVisible) group.classList.add('opt-hidden');
      container.appendChild(group);
    });

    if (!anyVisible && q) {
      container.innerHTML = '<div class="ytdlp-opts-empty">No advanced options match your search.</div>';
    }
    
    // Restore scroll
    container.scrollTop = scrollPos;
  }

  function renderModifiedOpts(containerId, prefix) {
    const container = document.getElementById(containerId);
    if (!container) return;
    container.innerHTML = '';
      let hasModified = false;
    
    YTDLP_OPTS.forEach(opt => {
      const isPinned = localStorage.getItem('pin:' + prefix + opt.key) === 'true';
      if (isPinned) {
          hasModified = true;
        const stored = localStorage.getItem(prefix + opt.key);
        const group = document.createElement('div');
        group.className = 'form-group';
        group.style.borderLeft = '3px solid var(--accent-color)';
        group.style.paddingLeft = '8px';
        group.style.marginLeft = '-11px';
        
        const label = document.createElement('label');
        label.className = 'form-label';
        label.innerHTML = opt.label;
        group.appendChild(label);
        
        const onChange = (val) => {
          if (val === null || val === false || val === '') {
            localStorage.removeItem(prefix + opt.key);
          } else {
            localStorage.setItem(prefix + opt.key, val);
          }
          
          // Re-render settings page only so we don't lose focus in current view
          if (prefix === 'ytdlp-opt:') renderYtdlpOpts('');
          if (prefix === 'batch-opt:') renderBatchOpts('');
        };

        if (opt.type === 'toggle') {
          const lbl = document.createElement('label');
          lbl.className = 'toggle-switch';
          lbl.style.marginTop = '8px';
          const chk = document.createElement('input');
          chk.type = 'checkbox';
          chk.checked = stored === 'true';
          chk.addEventListener('change', () => onChange(chk.checked));
          const track = document.createElement('span');
          track.className = 'toggle-track';
          const thumb = document.createElement('span');
          thumb.className = 'toggle-thumb';
          track.appendChild(thumb);
          lbl.appendChild(chk);
          lbl.appendChild(track);
          group.appendChild(lbl);
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
          sel.addEventListener('change', () => onChange(sel.value || null));
          group.appendChild(sel);
        } else {
          const inp = document.createElement('input');
          inp.type = opt.type === 'number' ? 'number' : opt.type === 'password' ? 'password' : 'text';
          inp.className = 'form-input';
          inp.placeholder = opt.placeholder || '';
          inp.value = stored || '';
          inp.addEventListener('input', () => onChange(inp.value.trim() || null));
          group.appendChild(inp);
        }
        
        container.appendChild(group);
      }
    });
  }
  function renderYtdlpOpts(filter) { renderOpts('ytdlp-opts-container', 'ytdlp-opt:', filter); }
function renderBatchOpts(filter) { renderOpts('batch-opts-container', 'batch-opt:', filter); }

document.addEventListener('DOMContentLoaded', () => {
  const activeTab = document.querySelector('.nav-item.active');
  if (activeTab && activeTab.dataset.tab) {
    updateOptsForTab(activeTab.dataset.tab);
  }
});
