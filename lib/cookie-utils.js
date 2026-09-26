const fs = require('fs');
const { URL } = require('url');

/**
 * Parses a Netscape cookie file content into an array of cookie objects.
 * Netscape format:
 * domain \t flag \t path \t secure \t expiration \t name \t value
 * Leading #HttpOnly_ on domain indicates httpOnly.
 */
function parseNetscapeCookies(content) {
  if (!content || typeof content !== 'string') return [];
  const lines = content.split(/\r?\n/);
  const cookies = [];

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    let isHttpOnly = false;
    let effectiveLine = line;

    if (line.startsWith('#HttpOnly_')) {
      isHttpOnly = true;
      effectiveLine = line.substring(10);
    } else if (line.startsWith('#')) {
      // Comment line
      continue;
    }

    const parts = effectiveLine.split('\t');
    if (parts.length < 7) {
      // Sometimes spaces instead of tabs are used
      const spaceParts = effectiveLine.split(/\s+/);
      if (spaceParts.length >= 7) {
        parts.length = 0;
        parts.push(...spaceParts.slice(0, 6));
        parts.push(spaceParts.slice(6).join(' '));
      } else {
        continue;
      }
    }

    const rawDomain = parts[0].trim();
    const includeSubdomains = parts[1].trim().toUpperCase() === 'TRUE';
    const path = parts[2].trim() || '/';
    const isSecure = parts[3].trim().toUpperCase() === 'TRUE' || parts[3].trim() === '1';
    const expNum = parseInt(parts[4].trim(), 10);
    const name = parts[5].trim();
    const value = parts.slice(6).join('\t');

    if (!name) continue;

    cookies.push({
      domain: rawDomain,
      includeSubdomains,
      path,
      secure: isSecure,
      httpOnly: isHttpOnly,
      expirationDate: !isNaN(expNum) && expNum > 0 ? expNum : undefined,
      name,
      value
    });
  }

  return cookies;
}

/**
 * Converts a parsed Netscape cookie into the shape required by Electron's session.cookies.set().
 *
 * Requirements for session.cookies.set():
 * - `url`: MUST be a valid absolute URL matching scheme and host.
 * - `domain`: If includeSubdomains is true (or domain starts with a dot), can be `.example.com` or `example.com`.
 * - `path`: string.
 * - `secure`: boolean.
 * - `httpOnly`: boolean.
 * - `expirationDate`: double (seconds since epoch).
 */
function convertNetscapeCookieToElectron(cookie, targetPageUrl) {
  let cleanHost = cookie.domain.replace(/^\./, '');
  let scheme = cookie.secure ? 'https:' : 'http:';

  // If targetPageUrl is provided, check if it matches the cookie domain
  if (targetPageUrl) {
    try {
      const parsedTarget = new URL(targetPageUrl);
      const targetHost = parsedTarget.hostname.toLowerCase();
      const domainLower = cleanHost.toLowerCase();

      if (targetHost === domainLower || targetHost.endsWith('.' + domainLower)) {
        cleanHost = targetHost;
        if (parsedTarget.protocol === 'https:') {
          scheme = 'https:';
        } else if (!cookie.secure) {
          scheme = parsedTarget.protocol;
        }
      }
    } catch (_) {}
  }

  const cookiePath = cookie.path && cookie.path.startsWith('/') ? cookie.path : '/' + (cookie.path || '');
  const url = `${scheme}//${cleanHost}${cookiePath}`;

  const electronCookie = {
    url,
    name: cookie.name,
    value: cookie.value || '',
    path: cookiePath,
    secure: !!cookie.secure,
    httpOnly: !!cookie.httpOnly,
  };

  if (cookie.includeSubdomains || cookie.domain.startsWith('.')) {
    electronCookie.domain = cookie.domain.startsWith('.') ? cookie.domain : '.' + cookie.domain;
  }

  if (cookie.expirationDate && cookie.expirationDate > 0) {
    electronCookie.expirationDate = cookie.expirationDate;
  }

  return electronCookie;
}

/**
 * Loads a Netscape cookies.txt file into an Electron session.
 */
async function loadCookiesIntoSession(ses, cookiesPath, targetPageUrl) {
  if (!cookiesPath || !fs.existsSync(cookiesPath)) return { loaded: 0, failed: 0 };
  let content = '';
  try {
    content = fs.readFileSync(cookiesPath, 'utf8');
  } catch (err) {
    return { loaded: 0, failed: 0, error: err.message };
  }

  const parsed = parseNetscapeCookies(content);
  let loaded = 0;
  let failed = 0;

  for (const c of parsed) {
    try {
      const details = convertNetscapeCookieToElectron(c, targetPageUrl);
      await ses.cookies.set(details);
      loaded++;
    } catch (e) {
      try {
        const fallback = convertNetscapeCookieToElectron({ ...c, domain: c.domain.replace(/^\./, ''), includeSubdomains: false }, targetPageUrl);
        await ses.cookies.set(fallback);
        loaded++;
      } catch (err2) {
        failed++;
      }
    }
  }

  return { loaded, failed, total: parsed.length };
}

module.exports = {
  parseNetscapeCookies,
  convertNetscapeCookieToElectron,
  loadCookiesIntoSession
};
