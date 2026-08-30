const https = require('https');
const http = require('http');

/**
 * Perform a GET request returning string body
 */
function fetchUrl(url, headers = {}, timeoutMs = 4000) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http;
    const req = client.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Accept': '*/*',
        ...headers
      },
      timeout: timeoutMs
    }, (res) => {
      // Handle redirects
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        let redirectUrl = res.headers.location;
        if (!redirectUrl.startsWith('http')) {
          const origin = new URL(url).origin;
          redirectUrl = origin + redirectUrl;
        }
        return fetchUrl(redirectUrl, headers, timeoutMs).then(resolve).catch(reject);
      }
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ status: res.statusCode, data }));
    });
    req.on('timeout', () => { req.destroy(); reject(new Error('Request timed out')); });
    req.on('error', reject);
  });
}

/**
 * Perform a POST request with JSON
 */
function postJson(url, data, headers = {}, timeoutMs = 3000) {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify(data);
    const u = new URL(url);
    const client = url.startsWith('https') ? https : http;
    const req = client.request({
      hostname: u.hostname,
      port: u.port || (url.startsWith('https') ? 443 : 80),
      path: u.pathname + u.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData),
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
        ...headers
      },
      timeout: timeoutMs
    }, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, data: JSON.parse(body) }); }
        catch (e) { resolve({ status: res.statusCode, raw: body }); }
      });
    });
    req.on('timeout', () => { req.destroy(); reject(new Error('Request timed out')); });
    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

/**
 * Extract Twitch stream parameters from URL or chunk text
 */
function extractTwitchInfoFromText(text) {
  if (!text || typeof text !== 'string') return {};
  const result = {};

  // 1. TwitchTracker URL: https://twitchtracker.com/[channel]/streams/[streamId]
  const ttMatch = text.match(/twitchtracker\.com\/([a-zA-Z0-9_]+)\/streams\/([0-9]+)/i);
  if (ttMatch) {
    result.channel = ttMatch[1];
    result.streamId = ttMatch[2];
  }

  // 2. Vodvod URL: https://api.vodvod.top/m3u8/[streamId]/[timestamp]/index.m3u8
  const vodvodMatch = text.match(/vodvod\.top\/m3u8\/([0-9]+)\/([0-9]+)/i);
  if (vodvodMatch) {
    result.streamId = vodvodMatch[1];
    result.timestamp = parseInt(vodvodMatch[2], 10);
  }

  // 3. CloudFront chunk pattern: [hash]_[channel]_[streamId]_[timestamp]
  const cfMatch = text.match(/[a-f0-9]+_([a-zA-Z0-9_]+)_([0-9]+)_([0-9]+)/i);
  if (cfMatch) {
    result.channel = cfMatch[1];
    result.streamId = cfMatch[2];
    result.timestamp = parseInt(cfMatch[3], 10);
  }

  // 4. Twitch video URL: https://www.twitch.tv/videos/[videoId]
  const twitchVideoMatch = text.match(/twitch\.tv\/videos\/([0-9]+)/i);
  if (twitchVideoMatch) {
    result.videoId = twitchVideoMatch[1];
  }

  return result;
}

/**
 * Fetch first lines of M3U8 manifest and parse Twitch info
 */
async function fetchM3u8TwitchInfo(m3u8Url) {
  if (!m3u8Url || !m3u8Url.startsWith('http')) return {};
  try {
    const res = await fetchUrl(m3u8Url);
    if (res.status === 200 && res.data) {
      return extractTwitchInfoFromText(res.data);
    }
  } catch (err) {
    // Non-fatal if manifest fetch fails
  }
  return {};
}

/**
 * Fetch VOD / stream metadata from Twitch GQL
 */
async function fetchTwitchGqlInfo({ channel, timestamp, streamId, videoId }) {
  // If we have videoId, query video directly
  if (videoId) {
    try {
      const vRes = await postJson('https://gql.twitch.tv/gql', {
        query: `
          query GetVideo($id: ID!) {
            video(id: $id) {
              id
              title
              description
              createdAt
              lengthSeconds
              game {
                id
                name
              }
            }
          }
        `,
        variables: { id: String(videoId) }
      }, { 'Client-ID': 'kimne78kx3ncx6brgo4mv6wki5h1ko' }, 1500);

      const video = vRes.data?.data?.video;
      if (video) {
        return {
          title: video.title,
          channel: channel || null,
          displayName: channel || null,
          gameId: video.game?.id,
          gameName: video.game?.name,
          createdAt: video.createdAt,
          lengthSeconds: video.lengthSeconds,
          videoId: video.id
        };
      }
    } catch (e) { }
  }

  // If we have channel, query channel's recent videos
  if (channel) {
    try {
      const cRes = await postJson('https://gql.twitch.tv/gql', {
        query: `
          query GetChannelMeta($login: String!) {
            user(login: $login) {
              id
              login
              displayName
              profileImageURL(width: 150)
              broadcastSettings {
                title
                game {
                  id
                  name
                }
              }
              stream {
                id
                title
                createdAt
                game {
                  id
                  name
                }
              }
              videos(first: 30, type: ARCHIVE) {
                edges {
                  node {
                    id
                    title
                    createdAt
                    lengthSeconds
                    game {
                      id
                      name
                    }
                  }
                }
              }
            }
          }
        `,
        variables: { login: channel }
      }, { 'Client-ID': 'kimne78kx3ncx6brgo4mv6wki5h1ko' }, 3500);

      const user = cRes.data?.data?.user;
      if (user) {
        const videos = user.videos?.edges?.map(e => e.node) || [];
        const profileImage = user.profileImageURL;
        const displayName = user.displayName || channel;
        const currentLiveOrUpdatedTitle = user.stream?.title || user.broadcastSettings?.title || null;
        const currentLiveOrUpdatedGame = user.stream?.game || user.broadcastSettings?.game || null;

        let matchedVideo = null;
        let isLatestStream = false;
        if (timestamp && videos.length > 0) {
          let minDiff = Infinity;
          for (const v of videos) {
            const vTime = Math.floor(new Date(v.createdAt).getTime() / 1000);
            const diff = Math.abs(vTime - timestamp);
            // Match closest stream broadcast start within 48 hours
            if (diff < minDiff && diff < 172800) {
              minDiff = diff;
              matchedVideo = v;
            }
          }
          if (matchedVideo === videos[0]) {
            isLatestStream = true;
          }
        }
        
        // If not matched by timestamp or timestamp is newer than latest video, it's the latest stream
        if (!matchedVideo && videos.length > 0) {
          matchedVideo = videos[0];
          isLatestStream = true;
        }

        if (matchedVideo) {
          // For the latest stream, prioritize the updated title if the streamer changed it during/after stream start
          const finalTitle = (isLatestStream && currentLiveOrUpdatedTitle) ? currentLiveOrUpdatedTitle : matchedVideo.title;
          const finalGame = (isLatestStream && currentLiveOrUpdatedGame) ? currentLiveOrUpdatedGame : matchedVideo.game;

          return {
            title: finalTitle,
            channel: user.login,
            displayName,
            profileImage,
            gameId: finalGame?.id || matchedVideo.game?.id,
            gameName: finalGame?.name || matchedVideo.game?.name,
            createdAt: matchedVideo.createdAt,
            lengthSeconds: matchedVideo.lengthSeconds,
            videoId: matchedVideo.id
          };
        }

        return {
          channel: user.login,
          displayName,
          profileImage
        };
      }
    } catch (e) { }
  }

  return {};
}

/**
 * Fetch fallback channel information from DecAPI (avatar, recent videos, current title & game)
 */
async function fetchDecapiInfo(channel) {
  if (!channel) return null;
  try {
    const [avatarRes, videosRes, titleRes, gameRes] = await Promise.all([
      fetchUrl(`https://decapi.me/twitch/avatar/${encodeURIComponent(channel)}`),
      fetchUrl(`https://decapi.me/twitch/videos/${encodeURIComponent(channel)}?limit=30`),
      fetchUrl(`https://decapi.me/twitch/title/${encodeURIComponent(channel)}`),
      fetchUrl(`https://decapi.me/twitch/game/${encodeURIComponent(channel)}`)
    ]);

    const profileImage = (avatarRes.status === 200 && avatarRes.data && !avatarRes.data.includes('404')) ? avatarRes.data.trim() : null;
    const currentTitle = (titleRes.status === 200 && titleRes.data && !titleRes.data.includes('404')) ? titleRes.data.trim() : null;
    const currentGame = (gameRes.status === 200 && gameRes.data && !gameRes.data.includes('404')) ? gameRes.data.trim() : null;

    const videos = [];
    if (videosRes.status === 200 && videosRes.data && !videosRes.data.includes('404') && !videosRes.data.includes('No videos found')) {
      const re = /(?:^|\s*\|\s*)(.+?)\s*-\s*https:\/\/www\.twitch\.tv\/videos\/(\d+)/g;
      let m;
      while ((m = re.exec(videosRes.data)) !== null) {
        videos.push({
          title: m[1].trim(),
          videoId: m[2],
          url: `https://www.twitch.tv/videos/${m[2]}`
        });
      }
    }

    return {
      profileImage,
      currentTitle,
      currentGame,
      videos
    };
  } catch (e) {
    return null;
  }
}

/**
 * Fetch 30-day channel summary from TwitchTracker API
 */
async function fetchTwitchTrackerChannelSummary(channel) {
  if (!channel) return null;
  try {
    const res = await fetchUrl(`https://twitchtracker.com/api/channels/summary/${encodeURIComponent(channel)}`, {
      'Accept': 'application/json, text/plain, */*',
      'Referer': 'https://twitchtracker.com/'
    });
    if (res.status === 200 && res.data) {
      const json = JSON.parse(res.data);
      if (json && Object.keys(json).length > 0) {
        return {
          rank: json.rank,
          minutesStreamed: json.minutes_streamed,
          avgViewers: json.avg_viewers,
          maxViewers: json.max_viewers,
          hoursWatched: json.hours_watched,
          followersGained: json.followers,
          followersTotal: json.followers_total
        };
      }
    }
  } catch (err) { }
  return null;
}

/**
 * Fetch 30-day category / game summary from TwitchTracker API
 */
async function fetchTwitchTrackerGameSummary(gameIdOrName) {
  if (!gameIdOrName) return null;
  try {
    const res = await fetchUrl(`https://twitchtracker.com/api/games/summary/${encodeURIComponent(gameIdOrName)}`, {
      'Accept': 'application/json, text/plain, */*',
      'Referer': 'https://twitchtracker.com/'
    });
    if (res.status === 200 && res.data) {
      const json = JSON.parse(res.data);
      if (json && Object.keys(json).length > 0) {
        return {
          rank: json.rank,
          avgViewers: json.avg_viewers,
          avgChannels: json.avg_channels,
          hoursWatched: json.hours_watched
        };
      }
    }
  } catch (err) { }
  return null;
}

/**
 * Sanitize a string for use as a valid filename on Windows/macOS/Linux
 */
function sanitizeFilename(name) {
  if (!name) return '';
  return name
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, '_')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Format a clean VOD file name from metadata: [Stream Title] [Stream ID].[ext]
 */
function formatVodFilename(meta, ext = 'mp4') {
  let titlePart = '';
  if (meta.title) {
    titlePart = sanitizeFilename(meta.title);
  } else if (meta.streamId) {
    titlePart = `Stream ${meta.streamId}`;
  } else if (meta.videoId || meta.vodId) {
    titlePart = `Twitch_${meta.videoId || meta.vodId}`;
  } else {
    titlePart = `VOD_${Date.now()}`;
  }

  let tag = '';
  if (meta.streamId) {
    tag = `[${meta.streamId}]`;
  } else if (meta.videoId || meta.vodId) {
    tag = `[${meta.videoId || meta.vodId}]`;
  } else if (meta.createdAt) {
    const d = new Date(meta.createdAt);
    const dateStr = !isNaN(d.getTime()) ? d.toISOString().split('T')[0] : '';
    if (dateStr) tag = `- ${dateStr}`;
  } else if (meta.timestamp) {
    const d = new Date(meta.timestamp * 1000);
    const dateStr = !isNaN(d.getTime()) ? d.toISOString().split('T')[0] : '';
    if (dateStr) tag = `- ${dateStr}`;
  }

  let clean = '';
  if (tag) {
    const rawTag = tag.replace(/[[\]-]/g, '').trim();
    if (rawTag && titlePart.includes(rawTag)) {
      clean = sanitizeFilename(titlePart);
    } else {
      clean = sanitizeFilename(`${titlePart} ${tag}`);
    }
  } else {
    clean = sanitizeFilename(titlePart);
  }

  if (!clean) clean = `vod_${Date.now()}`;
  return `${clean}.${ext.replace(/^\./, '')}`;
}

/**
 * Get TwitchTracker stream URL from metadata
 */
function getTwitchTrackerUrl(meta = {}) {
  if (!meta.channel) return '';
  if (meta.streamId) return `https://twitchtracker.com/${meta.channel}/streams/${meta.streamId}`;
  return `https://twitchtracker.com/${meta.channel}`;
}

/**
 * Generate FFmpeg -metadata arguments for embedding in downloaded video
 */
function getFfmpegMetadataArgs(meta = {}) {
  const args = [];
  if (!meta) return args;

  // Title metadata: exact stream title
  if (meta.title) {
    args.push('-metadata', `title=${meta.title}`);
  }

  // Artist / Author metadata: streamer name
  const artistName = meta.displayName || meta.channel;
  if (artistName) {
    args.push('-metadata', `artist=${artistName}`);
    args.push('-metadata', `author=${artistName}`);
    args.push('-metadata', `album_artist=${artistName}`);
  }

  // Comment metadata: If downloaded via VOD ID, use Twitch VOD URL; if downloaded as an M3U8 stream, use TwitchTracker URL
  let commentUrl = '';
  if (meta.vodId) {
    commentUrl = `https://www.twitch.tv/videos/${meta.vodId}`;
  } else if (meta.twitchTrackerUrl) {
    commentUrl = meta.twitchTrackerUrl;
  } else if (meta.channel) {
    commentUrl = getTwitchTrackerUrl(meta);
  }

  if (commentUrl) {
    args.push('-metadata', `comment=${commentUrl}`);
    args.push('-metadata', `description=${commentUrl}`);
    args.push('-metadata', `synopsis=${commentUrl}`);
  }

  // Date metadata
  if (meta.createdAt) {
    const d = new Date(meta.createdAt);
    if (!isNaN(d.getTime())) {
      args.push('-metadata', `date=${d.toISOString().split('T')[0]}`);
      args.push('-metadata', `year=${d.getFullYear()}`);
    }
  } else if (meta.timestamp) {
    const d = new Date(meta.timestamp * 1000);
    if (!isNaN(d.getTime())) {
      args.push('-metadata', `date=${d.toISOString().split('T')[0]}`);
      args.push('-metadata', `year=${d.getFullYear()}`);
    }
  }

  // Genre metadata
  if (meta.gameName) {
    args.push('-metadata', `genre=${meta.gameName}`);
  }

  return args;
}

/**
 * Comprehensive resolver for Twitch M3U8 metadata
 */
async function resolveTwitchVodMetadata(opts = {}) {
  let { url, channel, streamId, timestamp, videoId } = opts;

  // 1. Extract from URL string first
  if (url) {
    const urlInfo = extractTwitchInfoFromText(url);
    if (!channel && urlInfo.channel) channel = urlInfo.channel;
    if (!streamId && urlInfo.streamId) streamId = urlInfo.streamId;
    if (!timestamp && urlInfo.timestamp) timestamp = urlInfo.timestamp;
    if (!videoId && urlInfo.videoId) videoId = urlInfo.videoId;

    // 2. If channel or streamId is still missing, fetch the M3U8 playlist header
    if ((!channel || !timestamp) && url.includes('.m3u8')) {
      const manifestInfo = await fetchM3u8TwitchInfo(url);
      if (!channel && manifestInfo.channel) channel = manifestInfo.channel;
      if (!streamId && manifestInfo.streamId) streamId = manifestInfo.streamId;
      if (!timestamp && manifestInfo.timestamp) timestamp = manifestInfo.timestamp;
    }
  }

  // 3. Concurrently fetch metadata from Twitch GQL, DecAPI, and TwitchTracker
  const [gqlMeta, decapiMeta, channelSummary] = await Promise.all([
    channel ? fetchTwitchGqlInfo({ channel, timestamp, streamId, videoId }) : Promise.resolve({}),
    channel ? fetchDecapiInfo(channel) : Promise.resolve(null),
    channel ? fetchTwitchTrackerChannelSummary(channel) : Promise.resolve(null)
  ]);

  const resolvedChannel = channel || gqlMeta?.channel;
  const profileImage = gqlMeta?.profileImage || decapiMeta?.profileImage;
  const displayName = gqlMeta?.displayName || resolvedChannel;

  // Video title matching logic
  let title = gqlMeta?.title || null;
  let matchedVideoId = gqlMeta?.videoId || videoId || null;
  let gameName = gqlMeta?.gameName || decapiMeta?.currentGame || null;
  let gameId = gqlMeta?.gameId || null;
  let createdAt = gqlMeta?.createdAt || null;
  let lengthSeconds = gqlMeta?.lengthSeconds || null;

  if (!title && videoId && decapiMeta?.videos?.length > 0) {
    const matched = decapiMeta.videos.find(v => String(v.videoId) === String(videoId));
    if (matched) {
      title = matched.title;
      matchedVideoId = matched.videoId;
    }
  }

  // If title not yet resolved, use the latest stream video title from DecAPI
  if (!title && decapiMeta?.videos?.length > 0) {
    title = decapiMeta.videos[0].title;
    matchedVideoId = decapiMeta.videos[0].videoId;
  }

  // Fallback to channel's latest / current live stream title
  if (!title && decapiMeta?.currentTitle) {
    title = decapiMeta.currentTitle;
  }

  if (!createdAt && timestamp) {
    const d = new Date(timestamp * 1000);
    if (!isNaN(d.getTime())) {
      createdAt = d.toISOString();
    }
  }

  // Concurrently fetch game summary if gameName or gameId is known
  let gameSummary = null;
  if (gameId || gameName) {
    gameSummary = await fetchTwitchTrackerGameSummary(gameId || gameName);
  }

  const result = {
    channel: resolvedChannel,
    displayName,
    profileImage,
    streamId,
    timestamp,
    videoId: matchedVideoId,
    title,
    gameId,
    gameName,
    createdAt,
    lengthSeconds,
    twitchTrackerUrl: '',
    twitchTracker: {
      channel: channelSummary,
      game: gameSummary
    },
    suggestedFilename: '',
    ffmpegMetadataArgs: []
  };

  result.twitchTrackerUrl = getTwitchTrackerUrl(result);
  result.suggestedFilename = formatVodFilename(result, opts.container || 'mp4');
  result.ffmpegMetadataArgs = getFfmpegMetadataArgs(result);

  return result;
}

/**
 * Resolutions map used by Twitch HLS CDN
 */
const TWITCH_RESOLUTIONS = {
  'chunked': { name: 'Source', resolution: '1920x1080', frameRate: 60, bandwidth: 8534030 },
  '1440p60': { name: '1440p60', resolution: '2560x1440', frameRate: 60, bandwidth: 7000000 },
  '1080p60': { name: '1080p60', resolution: '1920x1080', frameRate: 60, bandwidth: 6000000 },
  '1080p30': { name: '1080p30', resolution: '1920x1080', frameRate: 30, bandwidth: 4500000 },
  '720p60':  { name: '720p60',  resolution: '1280x720',  frameRate: 60, bandwidth: 3500000 },
  '720p30':  { name: '720p30',  resolution: '1280x720',  frameRate: 30, bandwidth: 2500000 },
  '480p30':  { name: '480p30',  resolution: '854x480',   frameRate: 30, bandwidth: 1500000 },
  '360p30':  { name: '360p30',  resolution: '640x360',   frameRate: 30, bandwidth: 800000 },
  '160p30':  { name: '160p30',  resolution: '284x160',   frameRate: 30, bandwidth: 350000 }
};

/**
 * Check if a quality playlist URL is reachable and determine codec
 */
async function probeTwitchQuality(url) {
  try {
    const res = await fetchUrl(url, {}, 3500);
    if (res.status === 200 && res.data && res.data.includes('#EXTM3U')) {
      let codec = 'avc1.4D001E';
      if (res.data.includes('.mp4')) {
        try {
          const initUrl = url.replace('index-dvr.m3u8', 'init-0.mp4');
          const initRes = await fetchUrl(initUrl, {}, 2500);
          if (initRes.status === 200 && initRes.data && initRes.data.includes('hev1')) {
            codec = 'hev1.1.6.L93.B0';
          }
        } catch (e) {}
      }
      return { ok: true, codec, body: res.data };
    }
  } catch (e) {}
  return { ok: false };
}

/**
 * Check if text or URL represents a Twitch VOD
 */
function isTwitchVodUrl(text) {
  if (!text || typeof text !== 'string') return false;
  return /twitch\.tv\/(?:videos|.+?\/v(?:ideo)?)\/(\d+)/i.test(text) || /twitch\.tv\/videos\/(\d+)/i.test(text);
}

/**
 * Extract Twitch VOD ID from URL or string
 */
function extractTwitchVodId(text) {
  if (!text) return null;
  if (typeof text === 'number' || /^\d+$/.test(String(text).trim())) {
    return String(text).trim();
  }
  const m = String(text).match(/twitch\.tv\/(?:videos|.+?\/v(?:ideo)?)\/(\d+)/i) || String(text).match(/videos\/(\d+)/i);
  return m ? m[1] : null;
}

/**
 * Resolve subscriber-only Twitch VOD stream URLs using storyboard bypass logic (TwitchNoSub)
 */
async function resolveTwitchSubOnlyVod(vodIdOrUrl, opts = {}) {
  const vodId = extractTwitchVodId(vodIdOrUrl);
  if (!vodId) {
    return { success: false, error: 'Could not extract valid Twitch VOD ID' };
  }

  // 1. Query Twitch GQL for video metadata and seekPreviewsURL
  let gData = null;
  try {
    const gqlResp = await postJson('https://gql.twitch.tv/gql', {
      query: `query {
        video(id: "${vodId}") {
          id
          title
          description
          createdAt
          lengthSeconds
          broadcastType
          seekPreviewsURL
          owner {
            id
            login
            displayName
          }
          game {
            id
            name
          }
        }
      }`
    }, { 'Client-ID': 'kimne78kx3ncx6brgo4mv6wki5h1ko' }, 4000);

    gData = gqlResp.data?.data?.video;
  } catch (e) {
    return { success: false, error: `Failed to query Twitch GQL: ${e.message}` };
  }

  if (!gData) {
    return { success: false, error: `Video ${vodId} not found on Twitch GQL` };
  }

  if (!gData.seekPreviewsURL) {
    return { success: false, error: `No seekPreviewsURL found for VOD ${vodId} (storyboards disabled or VOD expired)` };
  }

  // 2. Parse domain and vodSpecialID from seekPreviewsURL
  let domain = '';
  let vodSpecialID = '';
  try {
    const previewUrl = new URL(gData.seekPreviewsURL);
    domain = previewUrl.host;
    const paths = previewUrl.pathname.split('/');
    const sbIdx = paths.findIndex(p => p.includes('storyboards'));
    if (sbIdx > 0) {
      vodSpecialID = paths[sbIdx - 1];
    }
  } catch (e) {
    return { success: false, error: `Failed to parse storyboard URL: ${e.message}` };
  }

  if (!domain || !vodSpecialID) {
    return { success: false, error: 'Could not derive CloudFront domain and storyboard token' };
  }

  const broadcastType = (gData.broadcastType || '').toLowerCase();
  const ownerLogin = gData.owner?.login || '';
  const now = new Date();
  const created = new Date(gData.createdAt || now);
  const daysDifference = (now.getTime() - created.getTime()) / (1000 * 3600 * 24);

  function buildQualityUrl(resKey) {
    if (broadcastType === 'highlight') {
      return `https://${domain}/${vodSpecialID}/${resKey}/highlight-${vodId}.m3u8`;
    } else if (broadcastType === 'upload' && daysDifference > 7 && ownerLogin) {
      return `https://${domain}/${ownerLogin}/${vodId}/${vodSpecialID}/${resKey}/index-dvr.m3u8`;
    } else {
      return `https://${domain}/${vodSpecialID}/${resKey}/index-dvr.m3u8`;
    }
  }

  // 3. Concurrently probe candidate resolutions
  const probeEntries = Object.entries(TWITCH_RESOLUTIONS);
  const probeResults = await Promise.all(
    probeEntries.map(async ([key, info]) => {
      const qUrl = buildQualityUrl(key);
      const res = await probeTwitchQuality(qUrl);
      return { key, info, url: qUrl, ...res };
    })
  );

  const validQualities = probeResults.filter(p => p.ok);
  if (validQualities.length === 0) {
    return {
      success: false,
      error: `No valid stream qualities found on CloudFront CDN (${domain}/${vodSpecialID})`
    };
  }

  // 4. Construct Master HLS Playlist
  let masterPlaylist = '#EXTM3U\n#EXT-X-VERSION:3\n';
  validQualities.forEach((q) => {
    masterPlaylist += `#EXT-X-STREAM-INF:BANDWIDTH=${q.info.bandwidth},RESOLUTION=${q.info.resolution},FRAME-RATE=${q.info.frameRate},CODECS="${q.codec},mp4a.40.2",NAME="${q.info.name}"\n${q.url}\n`;
  });

  const bestQuality = validQualities[0];
  const metadata = {
    vodId,
    title: gData.title || `Twitch VOD ${vodId}`,
    channel: ownerLogin,
    displayName: gData.owner?.displayName || ownerLogin,
    createdAt: gData.createdAt,
    lengthSeconds: gData.lengthSeconds,
    gameName: gData.game?.name || null,
    broadcastType: gData.broadcastType,
    domain,
    vodSpecialID
  };

  metadata.twitchTrackerUrl = getTwitchTrackerUrl(metadata);
  metadata.suggestedFilename = formatVodFilename(metadata, opts.container || 'mp4');
  metadata.ffmpegMetadataArgs = getFfmpegMetadataArgs(metadata);

  return {
    success: true,
    vodId,
    bestUrl: bestQuality.url,
    bestQuality: bestQuality.key,
    masterPlaylist,
    validQualities: validQualities.map(q => ({ key: q.key, name: q.info.name, resolution: q.info.resolution, url: q.url })),
    metadata
  };
}

module.exports = {
  extractTwitchInfoFromText,
  fetchM3u8TwitchInfo,
  fetchTwitchGqlInfo,
  fetchDecapiInfo,
  fetchTwitchTrackerChannelSummary,
  fetchTwitchTrackerGameSummary,
  sanitizeFilename,
  formatVodFilename,
  getTwitchTrackerUrl,
  getFfmpegMetadataArgs,
  resolveTwitchVodMetadata,
  isTwitchVodUrl,
  extractTwitchVodId,
  resolveTwitchSubOnlyVod
};

