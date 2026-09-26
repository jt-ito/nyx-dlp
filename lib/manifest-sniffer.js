const { BrowserWindow, session } = require('electron');
const { loadCookiesIntoSession } = require('./cookie-utils');

/**
 * Loads pageUrl in a hidden, isolated BrowserWindow/session and watches outgoing
 * requests for HLS/DASH manifest signatures. Resolves with an array of candidate
 * manifests (deduped), each with the request URL, headers, and type hints.
 */
async function sniffManifestFromPage(pageUrl, opts = {}) {
  const timeoutMs = opts.timeoutMs || 12000;
  const settleMs  = opts.settleMs || 1500;

  // Fresh, non-persistent isolated session per sniff
  const partitionName = `sniff-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const ses = session.fromPartition(partitionName, { cache: false });

  const found = new Map();
  const urlLooksLikeManifest = /\.(m3u8|mpd)(\?.*)?$/i;
  const contentTypeLooksLikeManifest = /application\/(vnd\.apple\.mpegurl|x-mpegurl|dash\+xml)/i;

  let settleTimer = null;
  let hardTimer = null;
  let resolveDone = null;

  const donePromise = new Promise((resolve) => {
    resolveDone = resolve;
  });

  const notifyCandidateFound = () => {
    // If we found a candidate, wait for network activity to settle (~1.5s) before resolving early
    if (settleTimer) clearTimeout(settleTimer);
    settleTimer = setTimeout(() => {
      resolveDone();
    }, settleMs);
  };

  ses.webRequest.onBeforeSendHeaders((details, callback) => {
    if (urlLooksLikeManifest.test(details.url)) {
      if (!found.has(details.url)) {
        found.set(details.url, {
          url: details.url,
          method: details.method,
          requestHeaders: details.requestHeaders,
          detectedBy: 'url'
        });
        notifyCandidateFound();
      }
    }
    callback({ requestHeaders: details.requestHeaders });
  });

  ses.webRequest.onHeadersReceived((details, callback) => {
    const headers = details.responseHeaders || {};
    const ctHeader = headers['content-type'] || headers['Content-Type'] || [];
    const ct = ctHeader[0] || '';
    if (ct && contentTypeLooksLikeManifest.test(ct) && !urlLooksLikeManifest.test(details.url)) {
      if (!found.has(details.url)) {
        found.set(details.url, {
          url: details.url,
          method: details.method,
          contentTypeHint: ct,
          detectedBy: 'content-type'
        });
        notifyCandidateFound();
      }
    }
    callback({ responseHeaders: details.responseHeaders });
  });

  const win = new BrowserWindow({
    show: false,
    width: 1280,
    height: 720,
    webPreferences: {
      session: ses,
      offscreen: true,
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  hardTimer = setTimeout(() => {
    resolveDone();
  }, timeoutMs);

  try {
    if (opts.cookiesPath) {
      try {
        await loadCookiesIntoSession(ses, opts.cookiesPath, pageUrl);
      } catch (_) {}
    }

    // Attempt to load the target page (ignore navigation error so we can wait out timeout/settle)
    win.loadURL(pageUrl).catch(() => {});

    await donePromise;
  } catch (_) {
    // Non-fatal — return whatever was found
  } finally {
    if (settleTimer) clearTimeout(settleTimer);
    if (hardTimer) clearTimeout(hardTimer);
    if (!win.isDestroyed()) {
      try { win.destroy(); } catch (_) {}
    }
    try { await ses.clearStorageData(); } catch (_) {}
  }

  const candidates = Array.from(found.values());
  const masterVariantMap = new Map();

  // Probe and classify manifests (Master Multi-Quality vs Single-Quality Sub-stream)
  for (const cand of candidates) {
    if (cand.url.includes('.m3u8')) {
      try {
        const info = await probeM3u8Info(cand.url, 2500);
        if (info) {
          cand.isMaster = info.isMaster;
          cand.qualities = info.qualities;
          cand.maxResolution = info.maxResolution;
          cand.resolutionLabel = info.resolutionLabel;
          cand.isConfident = info.isConfident;
          if (info.isMaster) {
            cand.resolutionBadgeText = info.maxResolution ? `⭐ ${info.maxResolution} Max` : '⭐ Multi-Res';
            if (info.variantMap) {
              for (const [vUrl, vRes] of info.variantMap.entries()) {
                masterVariantMap.set(vUrl, vRes);
              }
            }
          }
        }
      } catch (_) {}
    } else if (cand.url.includes('.mpd')) {
      cand.isMaster = true;
      cand.isConfident = true;
      cand.resolutionLabel = 'DASH Multi-Quality Manifest';
      cand.resolutionBadgeText = '⭐ DASH Multi-Res';
    }
  }

  // Cross-reference sub-streams with master playlist variants & URL patterns for confident resolution
  for (const cand of candidates) {
    if (!cand.isMaster) {
      let detectedRes = masterVariantMap.get(cand.url);
      if (!detectedRes) {
        try {
          const u = new URL(cand.url);
          detectedRes = masterVariantMap.get(u.origin + u.pathname);
          if (!detectedRes) {
            const tokenMatch = u.pathname.match(/\/playlist\/([A-Za-z0-9_-]{16,})/);
            if (tokenMatch) {
              detectedRes = masterVariantMap.get(tokenMatch[1].slice(0, 32));
            }
          }
        } catch (_) {}
      }

      if (detectedRes) {
        cand.resolution = detectedRes;
        cand.isConfident = true;
        cand.resolutionBadgeText = detectedRes;
        cand.resolutionLabel = `${detectedRes} Sub-Stream`;
      } else {
        const urlMatch = cand.url.match(/(4k\d*|2160p\d*|1440p\d*|1080p\d*|720p\d*|480p\d*|360p\d*|160p\d*|audio_only)/i);
        if (urlMatch) {
          cand.resolution = urlMatch[1];
          cand.isConfident = true;
          cand.resolutionBadgeText = urlMatch[1];
          cand.resolutionLabel = `${urlMatch[1]} Sub-Stream`;
        } else if (cand.url.includes('/chunked/') || cand.url.includes('chunked.m3u8')) {
          cand.resolution = '1080p60';
          cand.isConfident = true;
          cand.resolutionBadgeText = '1080p60 (Source)';
          cand.resolutionLabel = '1080p60 Source Sub-Stream';
        } else {
          cand.isConfident = false;
          cand.resolutionBadgeText = 'Single Rendition';
        }
      }
    }
  }

  // Sort so that isMaster (all qualities) ALWAYS appears first, then confident resolutions
  candidates.sort((a, b) => {
    if (a.isMaster !== b.isMaster) return b.isMaster ? 1 : -1;
    if (a.isConfident !== b.isConfident) return b.isConfident ? 1 : -1;
    return 0;
  });

  return candidates;
}

const https = require('https');
const http = require('http');
const { URL } = require('url');

function getResolutionScore(resStr) {
  if (!resStr) return 0;
  if (/4k|2160p/i.test(resStr)) {
    const fpsMatch = resStr.match(/(?:4k|2160p)(\d+)/i);
    const fps = fpsMatch ? parseInt(fpsMatch[1], 10) : 0;
    return 216000 + fps;
  }
  if (/1440p/i.test(resStr)) {
    const fpsMatch = resStr.match(/1440p(\d+)/i);
    const fps = fpsMatch ? parseInt(fpsMatch[1], 10) : 0;
    return 144000 + fps;
  }
  if (/source/i.test(resStr)) return 108060;
  if (/chunked/i.test(resStr)) return 108060;
  const match = resStr.match(/(\d+)p?(\d*)/i);
  if (match) {
    const height = parseInt(match[1], 10);
    const fps = match[2] ? parseInt(match[2], 10) : 0;
    return height * 100 + fps;
  }
  if (/audio/i.test(resStr)) return 1;
  return 0;
}

function probeM3u8Info(rawUrl, timeoutMs = 2500) {
  return new Promise((resolve) => {
    let parsed;
    try {
      parsed = new URL(rawUrl);
    } catch (_) {
      return resolve(null);
    }

    const client = parsed.protocol === 'http:' ? http : https;
    const req = client.request(parsed, {
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      },
      timeout: timeoutMs
    }, (res) => {
      let body = '';
      res.on('data', chunk => {
        body += chunk.toString('utf8');
        if (body.length > 131072) req.destroy();
      });
      res.on('end', () => {
        const isMaster = body.includes('#EXT-X-STREAM-INF');
        const qualities = [];
        const variantMap = new Map();

        if (isMaster) {
          const lines = body.split(/\r?\n/);
          let currentRes = '';
          for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            if (line.startsWith('#EXT-X-STREAM-INF:')) {
              let res = '';
              const resMatch = line.match(/RESOLUTION=(\d+x\d+)/i);
              const nameMatch = line.match(/NAME="([^"]+)"/i);
              const videoMatch = line.match(/VIDEO="([^"]+)"/i);
              if (resMatch) {
                const parts = resMatch[1].split('x');
                const h = parseInt(parts[1], 10);
                const fpsMatch = line.match(/FRAME-RATE=([\d.]+)/i);
                const fps = fpsMatch && Math.round(parseFloat(fpsMatch[1])) >= 50 ? '60' : '';
                if (h >= 2160) {
                  res = fps ? `4K${fps}` : '4K';
                } else if (h >= 1440) {
                  res = fps ? `1440p${fps}` : '1440p';
                } else {
                  res = fps && !String(h).endsWith('60') ? `${h}p${fps}` : `${h}p`;
                }
              } else if (nameMatch) {
                res = nameMatch[1];
              } else if (videoMatch && videoMatch[1] === 'chunked') {
                res = '1080p60';
              } else if (videoMatch) {
                res = videoMatch[1];
              }

              if (res && !qualities.includes(res)) {
                qualities.push(res);
              }
              currentRes = res;
            } else if (line && !line.startsWith('#') && currentRes) {
              let fullUri = line;
              try {
                fullUri = new URL(line, rawUrl).toString();
              } catch (_) {}
              variantMap.set(fullUri, currentRes);
              try {
                const u = new URL(fullUri);
                variantMap.set(u.origin + u.pathname, currentRes);
                const tokenMatch = u.pathname.match(/\/playlist\/([A-Za-z0-9_-]{16,})/);
                if (tokenMatch) {
                  variantMap.set(tokenMatch[1].slice(0, 32), currentRes);
                }
              } catch (_) {}
              currentRes = '';
            }
          }
          qualities.sort((a, b) => getResolutionScore(b) - getResolutionScore(a));
        }

        const maxResolution = qualities.length > 0 ? qualities[0] : '';
        let resolutionLabel = '';
        if (isMaster) {
          resolutionLabel = qualities.length > 0
            ? `All Qualities (${qualities.join(', ')})`
            : 'Master Playlist (All Qualities)';
        } else {
          const urlMatch = rawUrl.match(/(4k\d*|2160p\d*|1440p\d*|1080p\d*|720p\d*|480p\d*|360p\d*|160p\d*|audio_only)/i);
          resolutionLabel = urlMatch ? `${urlMatch[1]} Sub-Stream` : 'Single-Quality Sub-Stream';
        }

        resolve({
          isMaster,
          qualities,
          maxResolution,
          variantMap,
          resolutionLabel,
          isConfident: isMaster && qualities.length > 0
        });
      });
      res.on('error', () => resolve(null));
    });

    req.on('timeout', () => { req.destroy(); resolve(null); });
    req.on('error', () => resolve(null));
    req.end();
  });
}

module.exports = {
  sniffManifestFromPage
};
