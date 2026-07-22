#!/bin/bash
# nyx-dlp CLI launcher — run from the extracted tarball directory
DIR="$(cd "$(dirname "$0")" && pwd)"

# Use bundled node if available (from Electron), otherwise system node
if [ -x "$DIR/nyx-dlp" ]; then
  # Electron binary can run JS directly
  exec "$DIR/nyx-dlp" --no-sandbox "$DIR/cli.js" "$@"
elif command -v node &> /dev/null; then
  exec node "$DIR/cli.js" "$@"
else
  echo "Error: Node.js is required but not found in PATH." >&2
  echo "Install it from https://nodejs.org/ or use your package manager." >&2
  exit 1
fi
