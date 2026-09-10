/**
 * nyx-dlp Site Presets & Discord Defaults Engine
 *
 * Provides site-specific download profiles (concurrent fragments, format, cookies,
 * subtitles, thumbnails, player client, auto-repair) and domain matching.
 */

const DEFAULT_SITE_PRESETS = [
  {
    id: 'youtube',
    name: 'YouTube',
    domains: ['youtube.com', 'youtu.be'],
    enabled: true,
    concurrent: 5,
    useCookies: true,
    client: 'default',
    format: 'bestvideo+bestaudio/best',
    container: 'mp4',
    dlSubs: true,
    embedSubs: true,
    dlThumb: true,
    embedThumb: true,
    dlDesc: false,
    dlComments: false,
    dlChat: false,
    autoRepair: false,
    extraArgs: ''
  },
  {
    id: 'twitch',
    name: 'Twitch',
    domains: ['twitch.tv'],
    enabled: true,
    concurrent: 10,
    useCookies: false,
    client: 'default',
    format: 'bestvideo+bestaudio/best',
    container: 'mp4',
    dlSubs: false,
    embedSubs: false,
    dlThumb: true,
    embedThumb: true,
    dlDesc: false,
    dlComments: false,
    dlChat: false,
    autoRepair: true,
    extraArgs: ''
  },
  {
    id: 'tiktok',
    name: 'TikTok',
    domains: ['tiktok.com'],
    enabled: true,
    concurrent: 4,
    useCookies: false,
    client: 'default',
    format: 'bestvideo+bestaudio/best',
    container: 'mp4',
    dlSubs: false,
    embedSubs: false,
    dlThumb: true,
    embedThumb: true,
    dlDesc: false,
    dlComments: false,
    dlChat: false,
    autoRepair: false,
    extraArgs: ''
  },
  {
    id: 'twitter',
    name: 'Twitter / X',
    domains: ['twitter.com', 'x.com'],
    enabled: true,
    concurrent: 4,
    useCookies: false,
    client: 'default',
    format: 'bestvideo+bestaudio/best',
    container: 'mp4',
    dlSubs: false,
    embedSubs: false,
    dlThumb: true,
    embedThumb: true,
    dlDesc: false,
    dlComments: false,
    dlChat: false,
    autoRepair: false,
    extraArgs: ''
  },
  {
    id: 'kick',
    name: 'Kick',
    domains: ['kick.com'],
    enabled: true,
    concurrent: 8,
    useCookies: false,
    client: 'default',
    format: 'bestvideo+bestaudio/best',
    container: 'mp4',
    dlSubs: false,
    embedSubs: false,
    dlThumb: true,
    embedThumb: true,
    dlDesc: false,
    dlComments: false,
    dlChat: false,
    autoRepair: true,
    extraArgs: ''
  }
];

const DEFAULT_DISCORD_DOWNLOAD_OPTIONS = {
  format: 'bestvideo+bestaudio/best',
  container: 'mp4',
  client: 'default',
  concurrent: 5,
  useCookies: false,
  dlSubs: true,
  embedSubs: true,
  dlThumb: true,
  embedThumb: true,
  dlDesc: false,
  dlComments: false,
  dlChat: false,
  autoRepair: true
};

/**
 * Extracts normalized hostname/domain from a URL string
 */
function extractHostname(url) {
  if (!url || typeof url !== 'string') return '';
  const trimmed = url.trim();
  try {
    const parsed = new URL(trimmed.includes('://') ? trimmed : `https://${trimmed}`);
    return parsed.hostname.toLowerCase().replace(/^www\./, '');
  } catch (_) {
    const match = trimmed.match(/(?:https?:\/\/)?(?:www\.)?([a-zA-Z0-9.-]+)/i);
    return match ? match[1].toLowerCase() : '';
  }
}

/**
 * Matches a URL against a list of site presets
 */
function matchSitePreset(url, presetsList) {
  if (!url || typeof url !== 'string') return null;
  const host = extractHostname(url);
  if (!host) return null;

  const presets = Array.isArray(presetsList) && presetsList.length > 0
    ? presetsList
    : DEFAULT_SITE_PRESETS;

  for (const preset of presets) {
    if (!preset || preset.enabled === false) continue;
    const domains = Array.isArray(preset.domains) ? preset.domains : [];
    for (const d of domains) {
      if (!d) continue;
      const cleanDomain = d.trim().toLowerCase().replace(/^www\./, '').replace(/^\*\./, '');
      if (host === cleanDomain || host.endsWith('.' + cleanDomain)) {
        return preset;
      }
    }
  }
  return null;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    DEFAULT_SITE_PRESETS,
    DEFAULT_DISCORD_DOWNLOAD_OPTIONS,
    extractHostname,
    matchSitePreset
  };
}

if (typeof window !== 'undefined') {
  window.NyxSitePresets = {
    DEFAULT_SITE_PRESETS,
    DEFAULT_DISCORD_DOWNLOAD_OPTIONS,
    extractHostname,
    matchSitePreset
  };
}
