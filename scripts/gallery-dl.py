try:
    import ensure_ffmpeg
    ensure_ffmpeg.run()
except Exception:
    pass

import os
import sys
import subprocess
import importlib

# Force both stdout and stderr to be unbuffered/line-buffered
sys.stdout.reconfigure(line_buffering=True)
sys.stderr.reconfigure(line_buffering=True)

def _ensure(pip_pkg, import_name=None):
    try:
        importlib.import_module(import_name or pip_pkg)
        print(f'[debug] {pip_pkg} already installed', flush=True)
    except ImportError:
        print(f'[setup] Installing {pip_pkg}...', flush=True)
        subprocess.check_call([sys.executable, '-m', 'pip', 'install', pip_pkg])
        print(f'[setup] {pip_pkg} installed', flush=True)

install_gdl  = sys.argv[5] if len(sys.argv) > 5 else 'y'
url          = sys.argv[1] if len(sys.argv) > 1 else input("Enter the URL and press enter: ")
filetypes    = sys.argv[2] if len(sys.argv) > 2 else 'all'
metadata     = sys.argv[3] if len(sys.argv) > 3 else 'n'
cookies_path = sys.argv[4] if len(sys.argv) > 4 else ''

if install_gdl != 'n':
    _ensure('gallery-dl', 'gallery_dl')
else:
    try:
        importlib.import_module('gallery_dl')
    except ImportError:
        print('[setup] gallery-dl is not installed and auto-install is disabled.', flush=True)
        print('[setup] Enable "Auto-install gallery-dl" in Settings \u2192 Dependencies to install it.', flush=True)
        sys.exit(1)

cmd = [sys.executable, '-u', '-m', 'gallery_dl', '--verbose', '-d', '.', url]

if filetypes and filetypes not in ('all', 'no-gif'):
    exts = [e.strip().lower() for e in filetypes.split(',') if e.strip()]
    if exts:
        fltr = ' or '.join(f'extension == "{e}"' for e in exts)
        cmd += ['--filter', fltr]
elif filetypes == 'no-gif':
    cmd += ['--filter', 'extension != "gif"']

if metadata.lower() == 'y':
    cmd += ['--write-metadata']

if cookies_path and os.path.isfile(cookies_path):
    cmd += ['--cookies', cookies_path]

print(f'Starting: {" ".join(cmd)}', flush=True)

# Pipe stdout+stderr together so both flow back through Node's stdout pipe
proc = subprocess.Popen(
    cmd,
    stdout=subprocess.PIPE,
    stderr=subprocess.STDOUT,
    text=True,
    bufsize=1,
    env={**os.environ, 'PYTHONUNBUFFERED': '1'}
)

for line in proc.stdout:
    print(line, end='', flush=True)

rc = proc.wait()
print(f'[gallery-dl] exited with code {rc}', flush=True)

sys.exit(rc)
