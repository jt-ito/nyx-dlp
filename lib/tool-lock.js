// Tracks which vendored tools are mid-update so runs can refuse politely instead of
// hitting a half-written binary (or a locked .exe on Windows).
const updating = new Map(); // toolKey -> label

const NAMES = { ytdlp: 'yt-dlp', ffmpeg: 'FFmpeg', gallerydl: 'gallery-dl', streamlink: 'Streamlink', ia: 'Internet Archive CLI', aria2c: 'aria2c', deno: 'Deno', bgutil: 'bgutil server' };

function begin(tool) {
  if (updating.has(tool)) return false;
  updating.set(tool, NAMES[tool] || tool);
  return true;
}
function end(tool) { updating.delete(tool); }
function isUpdating(tool) { return updating.has(tool); }
// First tool in `tools` that is updating, as a display name (or null).
function firstUpdating(tools) {
  for (const t of tools) if (updating.has(t)) return updating.get(t);
  return null;
}
function list() { return [...updating.keys()]; }

module.exports = { begin, end, isUpdating, firstUpdating, list };
