#!/bin/bash
# nyx-dlp CLI launcher — run directly or via symlink

# Resolve symlinks to find the real installation directory
SOURCE="${BASH_SOURCE[0]}"
while [ -h "$SOURCE" ]; do
  DIR="$(cd -P "$(dirname "$SOURCE")" >/dev/null 2>&1 && pwd)"
  SOURCE="$(readlink "$SOURCE")"
  [[ $SOURCE != /* ]] && SOURCE="$DIR/$SOURCE"
done
DIR="$(cd -P "$(dirname "$SOURCE")" >/dev/null 2>&1 && pwd)"

# Check for cli.js in base dir or resources/app
if [ -f "$DIR/cli.js" ]; then
  CLI_JS="$DIR/cli.js"
elif [ -f "$DIR/resources/app/cli.js" ]; then
  CLI_JS="$DIR/resources/app/cli.js"
else
  CLI_JS="$DIR/cli.js"
fi

# Prefer system node if available, else electron binary
if command -v node &> /dev/null; then
  exec node "$CLI_JS" "$@"
elif [ -x "$DIR/nyx-dlp" ]; then
  exec "$DIR/nyx-dlp" --no-sandbox "$CLI_JS" "$@"
else
  echo "Error: Node.js is required but not found in PATH." >&2
  echo "Install it from https://nodejs.org/ or use your package manager." >&2
  exit 1
fi

