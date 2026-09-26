const https = require('https');
const http = require('http');
const { URL } = require('url');

const SIGNED_PARAM_INDICATORS = ['token', 'hmac', 'hdnts', 'policy', 'signature', 'exp', 'st'];

function isSignedUrl(urlStr) {
  try {
    const u = new URL(urlStr);
    const searchKeys = Array.from(u.searchParams.keys()).map(k => k.toLowerCase());
    return searchKeys.some(k => SIGNED_PARAM_INDICATORS.some(ind => k.includes(ind)));
  } catch (_) {
    return false;
  }
}

/**
 * Perform a lightweight HTTP Range GET request with short timeout (2500ms).
 * Reads the first 2KB to check if the response is an M3U8 master playlist (#EXT-X-STREAM-INF).
 */
function probeUrl(targetUrl, timeoutMs = 2500) {
  return new Promise((resolve) => {
    let parsed;
    try {
      parsed = new URL(targetUrl);
    } catch (_) {
      return resolve({ success: false, status: 0 });
    }

    const client = parsed.protocol === 'http:' ? http : https;
    const req = client.request(parsed, {
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Range': 'bytes=0-2048'
      },
      timeout: timeoutMs
    }, (res) => {
      let body = '';
      res.on('data', chunk => {
        body += chunk.toString('utf8');
        if (body.length > 2048) req.destroy();
      });
      res.on('end', () => {
        const isOk = (res.statusCode >= 200 && res.statusCode < 300) || res.statusCode === 206;
        const isM3u8 = body.includes('#EXTM3U');
        const hasVariants = body.includes('#EXT-X-STREAM-INF');
        resolve({
          success: isOk && isM3u8,
          statusCode: res.statusCode,
          hasVariants,
          bodySnippet: body.slice(0, 500)
        });
      });
      res.on('error', () => resolve({ success: false, status: 0 }));
    });

    req.on('timeout', () => {
      req.destroy();
      resolve({ success: false, timeout: true });
    });
    req.on('error', () => resolve({ success: false }));
    req.end();
  });
}

/**
 * Opt-in Master Playlist Discovery
 * Checks for signed tokens first, then queries candidate sibling and parent paths.
 */
async function probeMasterPlaylist(rawUrl) {
  if (!rawUrl || typeof rawUrl !== 'string') {
    return { success: false, message: 'Please enter a valid URL first.' };
  }

  let u;
  try {
    u = new URL(rawUrl.trim());
  } catch (_) {
    return { success: false, message: 'Invalid URL format.' };
  }

  // 1. Diagnostic check for signed URL tokens
  if (isSignedUrl(rawUrl)) {
    return {
      success: false,
      isSigned: true,
      message: 'This looks like a signed URL with path-bound tokens; parent-path discovery is unlikely to work.'
    };
  }

  // 2. Identify pathname components
  const pathParts = u.pathname.split('/').filter(Boolean);
  if (pathParts.length < 2) {
    return { success: false, message: 'URL path is too short to have a parent master playlist.' };
  }

  const currentFilename = pathParts[pathParts.length - 1];

  const candidates = [];

  // Sibling master (e.g. if current is index.m3u8 or chunklist.m3u8)
  if (currentFilename !== 'master.m3u8') {
    const siblingMaster = new URL(u.toString());
    siblingMaster.pathname = '/' + pathParts.slice(0, -1).concat('master.m3u8').join('/');
    candidates.push(siblingMaster.toString());
  }

  // Parent level (1 level up)
  if (pathParts.length >= 2) {
    const parentPath = pathParts.slice(0, -2);
    ['master.m3u8', 'playlist.m3u8', 'index.m3u8'].forEach(name => {
      const parentUrl = new URL(u.toString());
      parentUrl.pathname = '/' + parentPath.concat(name).join('/');
      const str = parentUrl.toString();
      if (!candidates.includes(str) && str !== u.toString()) {
        candidates.push(str);
      }
    });
  }

  // Probe at most 3 curated candidates
  const toCheck = candidates.slice(0, 3);
  for (const candidate of toCheck) {
    const probeRes = await probeUrl(candidate, 2500);
    if (probeRes.success && probeRes.hasVariants) {
      return {
        success: true,
        masterUrl: candidate,
        hasVariants: true
      };
    }
  }

  return {
    success: false,
    message: 'No master manifest with multiple qualities was found at parent paths.'
  };
}

module.exports = {
  isSignedUrl,
  probeMasterPlaylist
};
