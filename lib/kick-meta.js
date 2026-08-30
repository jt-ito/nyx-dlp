const https = require('https');

function isKickVodUrl(url) {
  if (!url || typeof url !== 'string') return false;
  return /kick\.com\/([a-zA-Z0-9_-]+)\/videos\/([0-9a-fA-F-]+)/i.test(url) || /kick\.com\/video\/([0-9a-fA-F-]+)/i.test(url);
}

function extractKickVodInfo(url) {
  if (!url || typeof url !== 'string') return {};
  const m = url.match(/kick\.com\/([a-zA-Z0-9_-]+)\/videos\/([0-9a-fA-F-]+)/i);
  if (m) {
    return { channel: m[1], videoId: m[2] };
  }
  const m2 = url.match(/kick\.com\/video\/([0-9a-fA-F-]+)/i);
  if (m2) {
    return { videoId: m2[1] };
  }
  return {};
}

async function verifyHttp200(url) {
  return new Promise((resolve) => {
    const req = https.get(url, (res) => {
      res.resume();
      resolve(res.statusCode === 200);
    });
    req.on('error', () => resolve(false));
    req.setTimeout(3000, () => {
      try { req.destroy(); } catch (_) {}
      resolve(false);
    });
  });
}

function decodeHtmlEntities(str) {
  if (!str) return '';
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

async function resolveKickVod(url, opts = {}) {
  const { channel, videoId } = extractKickVodInfo(url);
  if (!videoId) return { success: false, error: 'Could not extract Kick video ID' };

  let win = null;
  try {
    const electron = require('electron');
    const BrowserWindow = electron.BrowserWindow || electron.remote?.BrowserWindow;
    if (!BrowserWindow) return { success: false, error: 'BrowserWindow not available' };

    const pageData = await new Promise((resolve) => {
      win = new BrowserWindow({
        show: false,
        width: 1280,
        height: 800
      });
      if (win.webContents) win.webContents.setMaxListeners(50);

      const targetUrl = channel ? `https://kick.com/${channel}/videos/${videoId}` : `https://kick.com/video/${videoId}`;
      console.log('[KICK RESOLVER] Loading URL:', targetUrl);
      win.loadURL(targetUrl).catch((e) => console.log('[KICK RESOLVER] loadURL error:', e.message));

      let finished = false;
      let inProgress = false;
      const check = setInterval(async () => {
        if (finished || inProgress) return;
        inProgress = true;
        try {
          if (!win || win.isDestroyed()) {
            finished = true;
            clearInterval(check);
            return resolve(null);
          }
          const res = await win.webContents.executeJavaScript(`
            (() => {
              const html = document.documentElement.innerHTML;
              if (!html.includes('${videoId}')) return null;

              // Extract start times and end times
              const allDates = Array.from(html.matchAll(/([0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}Z)/g)).map(m => m[1]);
              const thumbMatch = html.match(/video_thumbnails\\/([^\\/]+)\\/([^\\/]+)\\//);
              const descMatch = html.match(/<meta name="description" content="([^"]+)"/) || html.match(/"session_title":"([^"]+)"/);
              const titleTagMatch = html.match(/<title>([^<]+)<\\/title>/);
              const catMatch = html.match(/category[\\\\"]*:[^}]*name[\\\\"]*:([\\\\"]*)([^\\\\"]+)\\1/);
              const avatarMatch = html.match(/"profile_pic[ture]*"\\s*:\\s*"([^"]+)"/) || html.match(/<meta property="og:image" content="([^"]+)"/);
              const avatarEl = document.querySelector('img[alt*="profile picture"], img[src*="profile_pictures"], img[src*="user_"]')?.src;

              return {
                dates: allDates,
                channelIvs: thumbMatch ? thumbMatch[1] : null,
                streamToken: thumbMatch ? thumbMatch[2] : null,
                title: descMatch ? descMatch[1] : (titleTagMatch ? titleTagMatch[1] : null),
                category: catMatch ? catMatch[2] : null,
                profileImage: avatarEl || (avatarMatch ? avatarMatch[1] : null)
              };
            })()
          `);

          if (res && res.channelIvs && res.streamToken && res.dates && res.dates.length > 0) {
            console.log('[KICK RESOLVER] Extracted pageData successfully:', res);
            finished = true;
            clearInterval(check);
            resolve(res);
          }
        } catch (e) {
          console.log('[KICK RESOLVER] JS check error:', e.message);
        } finally {
          inProgress = false;
        }
      }, 500);

      setTimeout(() => {
        if (!finished) {
          console.log('[KICK RESOLVER] Timeout waiting for pageData');
          finished = true;
          clearInterval(check);
          resolve(null);
        }
      }, 10000);
    });

    try { if (win && !win.isDestroyed()) win.destroy(); } catch (_) {}
    win = null;

    if (!pageData) {
      return { success: false, error: 'Failed to extract Kick stream metadata from page' };
    }

    const accountId = '196233775518';
    const candidateUrls = [];

    for (const dStr of pageData.dates) {
      const d = new Date(dStr);
      if (isNaN(d.getTime())) continue;

      const year = d.getUTCFullYear();
      const month = d.getUTCMonth() + 1;
      const day = d.getUTCDate();
      const hour = d.getUTCHours();
      const min = d.getUTCMinutes();

      for (const hOffset of [-2, -1, 0, 1, 2]) {
        const testHour = (hour + hOffset + 24) % 24;
        candidateUrls.push({
          url: `https://d26yk4zpyhjeeq.cloudfront.net/v1/master/a837d8e4b9178bea1b3911d9b2fe01ff7553ef20/production-kick-vod/3c81249a5ce0/ivs/v1/${accountId}/${pageData.channelIvs}/${year}/${month}/${day}/${testHour}/${min}/${pageData.streamToken}/media/hls/master.m3u8`,
          date: dStr
        });
        candidateUrls.push({
          url: `https://stream.kick.com/3c81249a5ce0/ivs/v1/${accountId}/${pageData.channelIvs}/${year}/${month}/${day}/${testHour}/${min}/${pageData.streamToken}/media/hls/master.m3u8`,
          date: dStr
        });
      }
    }

    const checkResults = await Promise.all(candidateUrls.map(async (item) => {
      const ok = await verifyHttp200(item.url);
      return ok ? item : null;
    }));

    const matched = checkResults.find(r => r !== null);
    if (!matched) {
      return { success: false, error: 'Could not find active master.m3u8 playlist on Kick AWS IVS storage' };
    }

    const cleanTitle = decodeHtmlEntities(pageData.title || `Kick VOD ${videoId}`);

    if (pageData.channelIvs && channel) {
      saveIvsMapping(pageData.channelIvs, channel);
    }

    return {
      success: true,
      m3u8Url: matched.url,
      title: cleanTitle,
      channel: channel || 'kick_streamer',
      displayName: channel || 'Kick Streamer',
      profileImage: pageData.profileImage || null,
      gameName: pageData.category,
      createdAt: matched.date || pageData.dates[0],
      vodId: videoId,
      source: 'kick'
    };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

function isKickM3u8Url(url) {
  if (!url || typeof url !== 'string') return false;
  return url.includes('production-kick-vod') ||
    url.includes('stream.kick.com') ||
    (url.includes('/ivs/v1/') && (url.includes('kick') || url.includes('196233775518')));
}

const kickTrackerMemoryCache = new Map();
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

async function scrapeKickTracker(channel, m3u8Url = '') {
  if (!channel) return null;
  const cleanChannel = channel.trim().toLowerCase();
  const cacheKey = `kt_${cleanChannel}`;
  const cached = kickTrackerMemoryCache.get(cacheKey);
  let streamList = null;

  if (cached && (Date.now() - cached.timestamp < CACHE_TTL_MS)) {
    streamList = cached.streams;
  } else {
    try {
      const electron = require('electron');
      const BrowserWindow = electron.BrowserWindow || electron.remote?.BrowserWindow;
      if (!BrowserWindow) return null;

      streamList = await new Promise((resolve) => {
        let win = new BrowserWindow({
          x: -9999,
          y: -9999,
          width: 1280,
          height: 800,
          show: true,
          focusable: false,
          skipTaskbar: true
        });
        if (win.webContents) win.webContents.setMaxListeners(50);

        const trackerUrl = `https://kicktracker.net/${cleanChannel}`;
        win.loadURL(trackerUrl).catch(() => {});

        let done = false;
        let inProgress = false;
        const check = setInterval(async () => {
          if (done || inProgress) return;
          inProgress = true;
          try {
            if (!win || win.isDestroyed()) {
              done = true;
              clearInterval(check);
              return resolve(null);
            }

            const res = await win.webContents.executeJavaScript(`
              (async () => {
                try {
                  if (document.title.includes('Just a moment')) return null;

                  const links = Array.from(document.querySelectorAll('a[href*="/streams/"]')).map(a => {
                    const href = a.href;
                    const match = href.match(/\\/([^\\/]+)\\/streams\\/([^\\/\\?]+)/);
                    if (!match) return null;
                    const ch = match[1];
                    const streamId = match[2];
                    
                    const dateMatch = a.textContent.match(/(\\d{1,2})\\s*([A-Za-z]{3})\\s*(\\d{4})/);
                    let day = null, month = null, year = null;
                    if (dateMatch) {
                      day = parseInt(dateMatch[1]);
                      const monthNames = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'];
                      month = monthNames.indexOf(dateMatch[2].toLowerCase()) + 1;
                      year = parseInt(dateMatch[3]);
                    }

                    let title = a.textContent;
                    if (dateMatch) {
                      const idx = a.textContent.indexOf(dateMatch[0]);
                      if (idx !== -1) title = a.textContent.substring(0, idx).trim();
                    }

                    return {
                      channel: ch,
                      streamId,
                      title,
                      day,
                      month,
                      year,
                      url: href
                    };
                  }).filter(Boolean);

                  const text = document.body ? document.body.innerText : '';
                  const hoursStreamedMatch = text.match(/Hours streamed\\s*\\n\\s*([\\d,.]+)/i) || text.match(/Hours streamed\\s*:\\s*([\\d,.]+)/i);
                  const avgViewersMatch = text.match(/Average viewers\\s*\\n\\s*([\\d,.]+[KkMm]?)/i) || text.match(/Average viewers\\s*:\\s*([\\d,.]+[KkMm]?)/i);
                  const peakViewersMatch = text.match(/Peak viewers\\s*\\n\\s*([\\d,.]+[KkMm]?)/i) || text.match(/Peak viewers\\s*:\\s*([\\d,.]+[KkMm]?)/i);
                  const hoursWatchedMatch = text.match(/Hours watched\\s*\\n\\s*([\\d,.]+)/i) || text.match(/Hours watched\\s*:\\s*([\\d,.]+)/i);

                  let profileImage = null;
                  const imgEl = document.querySelector('img[alt*="profile picture"], img[src*="profile_pictures"]');
                  if (imgEl && imgEl.src) {
                    try {
                      const imgRes = await fetch(imgEl.src);
                      const blob = await imgRes.blob();
                      profileImage = await new Promise((resolveData) => {
                        const reader = new FileReader();
                        reader.onloadend = () => resolveData(reader.result);
                        reader.readAsDataURL(blob);
                      });
                    } catch (_) {
                      profileImage = imgEl.src;
                    }
                  }

                  return {
                    displayName: document.querySelector('h1')?.textContent?.split(' ')?.[0] || null,
                    profileImage,
                    streams: links,
                    stats: {
                      hoursStreamed: hoursStreamedMatch ? hoursStreamedMatch[1] : null,
                      avgViewers: avgViewersMatch ? avgViewersMatch[1] : null,
                      peakViewers: peakViewersMatch ? peakViewersMatch[1] : null,
                      hoursWatched: hoursWatchedMatch ? hoursWatchedMatch[1] : null
                    }
                  };
                } catch (e) {
                  return null;
                }
              })()
            `);

            if (res && res.streams && res.streams.length > 0) {
              done = true;
              clearInterval(check);
              try { win.destroy(); } catch (_) {}
              resolve(res);
            }
          } catch (_) {}
          finally {
            inProgress = false;
          }
        }, 500);

        setTimeout(() => {
          if (!done) {
            done = true;
            clearInterval(check);
            try { if (win && !win.isDestroyed()) win.destroy(); } catch (_) {}
            resolve(null);
          }
        }, 15000);
      });

      if (streamList) {
        kickTrackerMemoryCache.set(cacheKey, { streams: streamList, timestamp: Date.now() });
      }
    } catch (_) {}
  }

  if (!streamList || !streamList.streams || streamList.streams.length === 0) return null;

  // Extract date from M3U8 URL if present: e.g. /2026/8/30/19/1/
  let targetYear = null, targetMonth = null, targetDay = null;
  if (m3u8Url) {
    const m3u8DateMatch = m3u8Url.match(/\/(\d{4})\/(\d{1,2})\/(\d{1,2})\/(\d{1,2})\/(\d{1,2})\//);
    if (m3u8DateMatch) {
      targetYear = parseInt(m3u8DateMatch[1]);
      targetMonth = parseInt(m3u8DateMatch[2]);
      targetDay = parseInt(m3u8DateMatch[3]);
    }
  }

  let matched = null;
  if (targetYear && targetMonth && targetDay) {
    matched = streamList.streams.find(s => s.year === targetYear && s.month === targetMonth && s.day === targetDay);
  }
  if (!matched) {
    matched = streamList.streams[0];
  }

  const cleanTitle = decodeHtmlEntities(matched.title || `Kick Stream ${matched.streamId}`);
  const dStr = (matched.year && matched.month && matched.day)
    ? `${matched.year}-${String(matched.month).padStart(2, '0')}-${String(matched.day).padStart(2, '0')}`
    : '';

  return {
    channel: matched.channel || channel,
    displayName: streamList.displayName || matched.channel || channel,
    profileImage: streamList.profileImage || null,
    streamId: matched.streamId,
    title: cleanTitle,
    stats: streamList.stats || null,
    createdAt: dStr ? `${dStr}T00:00:00Z` : new Date().toISOString(),
    kickTrackerUrl: matched.url || `https://kicktracker.net/${channel}`
  };
}

const fs = require('fs');
const path = require('path');

let kickIvsToChannelMap = new Map([
  ['F3GPywzcO80t', 'momocita']
]);

function getIvsMapFilePath() {
  try {
    const electron = require('electron');
    const app = electron.app || electron.remote?.app;
    if (app) {
      return path.join(app.getPath('userData'), 'kick-ivs-map.json');
    }
  } catch (_) {}
  return null;
}

function loadIvsMap() {
  const p = getIvsMapFilePath();
  if (p && fs.existsSync(p)) {
    try {
      const data = JSON.parse(fs.readFileSync(p, 'utf8'));
      for (const [k, v] of Object.entries(data)) {
        kickIvsToChannelMap.set(k, v);
      }
    } catch (_) {}
  }
}
loadIvsMap();

function saveIvsMapping(ivsId, channel) {
  if (!ivsId || !channel) return;
  kickIvsToChannelMap.set(ivsId, channel.trim().toLowerCase());
  const p = getIvsMapFilePath();
  if (p) {
    try {
      const obj = Object.fromEntries(kickIvsToChannelMap);
      fs.writeFileSync(p, JSON.stringify(obj, null, 2), 'utf8');
    } catch (_) {}
  }
}

async function resolveKickM3u8Metadata(opts = {}) {
  loadIvsMap();
  const url = opts.url || '';
  let channel = opts.channel || opts.twitchChannel || '';

  if (!channel && url) {
    const ivsMatch = url.match(/\/ivs\/v1\/\d+\/([^\/]+)\//);
    if (ivsMatch && kickIvsToChannelMap.has(ivsMatch[1])) {
      channel = kickIvsToChannelMap.get(ivsMatch[1]);
    }
  }

  if (isKickVodUrl(url)) {
    const kickRes = await resolveKickVod(url, opts);
    if (kickRes && kickRes.success) {
      if (kickRes.channelIvs && kickRes.channel) {
        saveIvsMapping(kickRes.channelIvs, kickRes.channel);
      }
      return {
        channel: kickRes.channel,
        displayName: kickRes.displayName,
        profileImage: kickRes.profileImage || null,
        title: kickRes.title,
        gameName: kickRes.gameName,
        createdAt: kickRes.createdAt,
        m3u8Url: kickRes.m3u8Url,
        source: 'kick',
        kickTrackerUrl: `https://kicktracker.net/${kickRes.channel}`,
        suggestedFilename: `${kickRes.title.replace(/[\/\\:*?"<>|]/g, '_')}.mp4`,
        ffmpegMetadataArgs: [
          '-metadata', `title=${kickRes.title}`,
          '-metadata', `artist=${kickRes.displayName || kickRes.channel}`,
          '-metadata', `comment=https://kicktracker.net/${kickRes.channel}`
        ]
      };
    }
  }

  if (channel) {
    const ktMeta = await scrapeKickTracker(channel, url);
    if (ktMeta && ktMeta.title) {
      return {
        channel: ktMeta.channel,
        displayName: ktMeta.displayName,
        profileImage: ktMeta.profileImage || null,
        title: ktMeta.title,
        streamId: ktMeta.streamId,
        stats: ktMeta.stats,
        createdAt: ktMeta.createdAt,
        source: 'kick',
        kickTrackerUrl: ktMeta.kickTrackerUrl,
        suggestedFilename: `${ktMeta.title.replace(/[\/\\:*?"<>|]/g, '_')}.mp4`,
        ffmpegMetadataArgs: [
          '-metadata', `title=${ktMeta.title}`,
          '-metadata', `artist=${ktMeta.displayName || ktMeta.channel}`,
          '-metadata', `comment=${ktMeta.kickTrackerUrl}`
        ]
      };
    }
  }

  // Fallback for generic/unmapped Kick master playlists: extract date from URL
  if (isKickM3u8Url(url)) {
    const dateMatch = url.match(/\/(\d{4})\/(\d{1,2})\/(\d{1,2})\//);
    const dateStr = dateMatch ? `${dateMatch[1]}-${String(dateMatch[2]).padStart(2, '0')}-${String(dateMatch[3]).padStart(2, '0')}` : '';
    const fallbackTitle = dateStr ? `Kick Stream ${dateStr}` : 'Kick Stream';

    return {
      channel: channel || 'Kick Stream',
      displayName: channel || 'Kick Stream',
      title: fallbackTitle,
      createdAt: dateStr ? `${dateStr}T00:00:00Z` : new Date().toISOString(),
      source: 'kick',
      suggestedFilename: `${fallbackTitle}.mp4`,
      ffmpegMetadataArgs: [
        '-metadata', `title=${fallbackTitle}`,
        '-metadata', `artist=${channel || 'Kick Stream'}`
      ]
    };
  }

  return null;
}

module.exports = {
  isKickVodUrl,
  isKickM3u8Url,
  extractKickVodInfo,
  resolveKickVod,
  scrapeKickTracker,
  resolveKickM3u8Metadata,
  saveIvsMapping
};
