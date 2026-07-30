/* ── Protected-path guard ──────────────────────────────── */
/**
 * Returns a user-friendly error string if the path is a protected location
 * (drive root, Windows system directories, etc.), or null if safe.
 */
function isProtectedPath(p) {
  if (!p || !p.trim()) return null;
  const norm = p.trim().replace(/\\/g, '/');

  // Drive root: "C:", "C:\" or "C:/" with nothing after it
  if (/^[A-Za-z]:\/?$/.test(p.trim())) {
    return `Cannot download to the root of a drive ("${p.trim()}"). Please choose a subfolder.`;
  }

  // Network/UNC root: "\\server" or "//server" with no share path
  if (/^\/\/[^/]+\/?$/.test(norm) || /^\\\\[^\\]+\\?$/.test(p.trim())) {
    return `Cannot download to the root of a network share ("${p.trim()}"). Please choose a subfolder.`;
  }

  // Windows protected system directories (case-insensitive)
  const sysRoots = [
    /^[A-Za-z]:\/Windows(\/?.+)?$/i,
    /^[A-Za-z]:\/Program Files( \(x86\))?(\/?.+)?$/i,
    /^[A-Za-z]:\/ProgramData(\/?.+)?$/i,
    /^[A-Za-z]:\/System Volume Information(\/?.+)?$/i,
    /^[A-Za-z]:\/Recovery(\/?.+)?$/i,
    /^[A-Za-z]:\/\$Recycle\.Bin(\/?.+)?$/i,
  ];
  for (const re of sysRoots) {
    if (re.test(norm)) {
      return `Cannot download to a protected system directory ("${p.trim()}"). Please choose a different folder.`;
    }
  }

  return null; // safe
}
