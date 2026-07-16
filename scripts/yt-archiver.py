try:
    import ensure_ffmpeg
    ensure_ffmpeg.run()
except Exception:
    pass

import os
import sys
import time
import importlib
import subprocess
import atexit
import signal
from pathlib import Path
from typing import Dict, Any

_download_active = True

def _write_stopped(u: str) -> None:
    try:
        if os.path.exists('stopped_downloads.txt'):
            with open('stopped_downloads.txt', 'r', encoding='utf-8') as f:
                if u in [line.strip() for line in f]:
                    return
        with open('stopped_downloads.txt', 'a', encoding='utf-8') as f:
            f.write(u + '\n')
    except Exception:
        pass

def _on_exit() -> None:
    if _download_active and 'url' in globals():
        _write_stopped(url)

atexit.register(_on_exit)
signal.signal(signal.SIGTERM, lambda *_: sys.exit(1))

def _ensure(pip_pkg, import_name=None):
    try:
        importlib.import_module(import_name or pip_pkg)
    except ImportError:
        print(f'[setup] Installing {pip_pkg}...', flush=True)
        subprocess.check_call([sys.executable, '-m', 'pip', 'install', pip_pkg])

def _ensure_bgutil():
    """Install bgutil-ytdlp-pot-provider yt-dlp plugin if not already present."""
    try:
        result = subprocess.run(
            [sys.executable, '-m', 'pip', 'show', 'bgutil-ytdlp-pot-provider'],
            capture_output=True, text=True, timeout=15,
        )
        if result.returncode == 0:
            return
    except Exception:
        pass
    print('[setup] Installing bgutil-ytdlp-pot-provider...', flush=True)
    subprocess.check_call([sys.executable, '-m', 'pip', 'install', '-q', 'bgutil-ytdlp-pot-provider'])
    print('[setup] bgutil-ytdlp-pot-provider installed', flush=True)

def _ensure_deno():
    """Ensure deno is on PATH, installing it if not present."""
    import shutil as _shutil
    if _shutil.which('deno'):
        return
    deno_bin = Path.home() / '.deno' / 'bin' / ('deno.exe' if sys.platform == 'win32' else 'deno')
    if deno_bin.exists():
        os.environ['PATH'] = str(deno_bin.parent) + os.pathsep + os.environ['PATH']
        return
    print('[setup] deno not found — installing...', flush=True)
    try:
        if sys.platform == 'win32':
            result = subprocess.run(
                ['powershell', '-NoProfile', '-NonInteractive', '-Command',
                 'irm https://deno.land/install.ps1 | iex'],
                capture_output=True, text=True, timeout=120,
            )
        else:
            result = subprocess.run(
                ['sh', '-c', 'curl -fsSL https://deno.land/install.sh | sh'],
                capture_output=True, text=True, timeout=120,
            )
        if result.returncode == 0 and deno_bin.exists():
            os.environ['PATH'] = str(deno_bin.parent) + os.pathsep + os.environ['PATH']
            print('[setup] deno installed successfully', flush=True)
        else:
            print(f'[setup] deno install failed (exit {result.returncode})', flush=True)
    except Exception as e:
        print(f'[setup] deno install failed: {e}', flush=True)

_ensure('yt-dlp',        'yt_dlp')
_ensure('python-slugify', 'slugify')

from slugify import slugify
import yt_dlp

# Get the URL from the user
url = sys.argv[1] if len(sys.argv) > 1 else input("Enter the URL and press enter: ")
fmt = sys.argv[2] if len(sys.argv) > 2 else 'bestvideo*+bestaudio/best'
cookies_path = sys.argv[3] if len(sys.argv) > 3 else ''
container    = sys.argv[4] if len(sys.argv) > 4 else 'mp4'
bgutil_url   = sys.argv[5] if len(sys.argv) > 5 else ''
use_deno     = sys.argv[6].lower() == 'y' if len(sys.argv) > 6 else True
client       = sys.argv[7] if len(sys.argv) > 7 else 'default'
from_start   = sys.argv[8].lower() == 'y' if len(sys.argv) > 8 else True
concurrent   = int(sys.argv[9]) if len(sys.argv) > 9 else 5

# Bootstrap optional dependencies
if use_deno:
    _ensure_deno()
if bgutil_url:
    _ensure_bgutil()

# Extractor args for bgutil PO token provider (applied in run_ytdlp below)
# In local/deno mode we install the plugin + deno and let yt-dlp use whichever client works
# best — we do NOT force player_client=web because that hard-requires a PO token, and if
# deno is unavailable the download would stall or skip formats. Only force web when an
# Only force web when an explicit HTTP server URL is provided and known to be reachable.
_extractor_args: dict = {}
if client and client != 'default':
    _extractor_args.setdefault('youtube', {})['player_client'] = [client]

if bgutil_url and bgutil_url != 'local':
    # Do not force 'web' client here because it lacks live_from_start support and causes infinite wait_for_video loops
    _extractor_args['youtubepot-bgutilhttp'] = {'base_url': [bgutil_url]}
    print(f'[bgutil] Using HTTP server at {bgutil_url}', flush=True)
elif bgutil_url == 'local':
    print('[bgutil] Local deno mode — plugin will provide PO tokens via deno', flush=True)

# Split the URL to get the video ID
try:
    if "youtube.com/live/" in url:
        video_id = url.split("/")[4]
    elif "youtube.com/watch?v=" in url:
        video_id = url.split("=")[1]
    else:
        raise ValueError("Please Enter a Valid URL")
except IndexError:
    print("Error parsing URL. Please ensure it is a valid YouTube link.")
    exit(1)
except ValueError as e:
    print(e)
    exit(1)

# Sanitize the folder name
folder_name = slugify(video_id)

# Create a folder with the video title
try:
    os.makedirs(folder_name, exist_ok=True)
except OSError as e:
    print(f"Error creating directory '{folder_name}': {e}")
    exit(1)

# Change into the folder
try:
    os.chdir(folder_name)
except FileNotFoundError as e:
    print(f"Error changing directory to '{folder_name}': {e}")
    exit(1)


def run_ytdlp(url, fmt='bestvideo*+bestaudio/best'):
    """Download using yt-dlp with robust livestream configuration."""
    # Progress tracking
    last_progress_time = {}
    
    def progress_hook(d: Dict[str, Any]):
        """Hook for download progress updates."""
        status = d.get('status')
        info = d.get('info_dict', {})
        # Use format_id (e.g. video/audio format) to separate progress bars
        task_id = info.get('format_id') or 'summary'
        
        if status == 'downloading':
            now = time.time()
            # Update frequently enough for smooth UI, but not every millisecond
            if now - last_progress_time.get(task_id, 0) > 0.5:
                downloaded = d.get('downloaded_bytes', 0)
                total = d.get('total_bytes') or d.get('total_bytes_estimate', 0)
                speed = d.get('speed', 0)
                
                if speed:
                    speed_str = f"{speed / 1024 / 1024:.2f} MB/s"
                else:
                    speed_str = "N/A"
                
                # Output with [task_id] so renderer.js can track them independently
                frag_index = d.get('fragment_index')
                frag_count = d.get('fragment_count')
                frag_str = f" (frag {frag_index}/{frag_count or '~'})" if frag_index else ""
                
                if total:
                    percent = (downloaded / total) * 100
                    print(f"[download] [{task_id}] {percent:.1f}% of ~{total / 1024 / 1024:.1f}MiB at {speed_str}{frag_str}", flush=True)
                else:
                    print(f"[download] [{task_id}] {downloaded / 1024 / 1024:.1f}MiB at {speed_str}{frag_str} (livestream)", flush=True)
                
                last_progress_time[task_id] = now
    
    # Configure yt-dlp options (optimized for stability)
    ydl_opts = {
        'format': fmt,
        # Metadata
        'writethumbnail': True,
        'embedthumbnail': True,
        'embedmetadata': True,
        'embedchapters': True,
        'postprocessors': [
            {
                'key': 'FFmpegEmbedSubtitle',  # Keep this for embedding subtitles
            },
            {
                'key': 'FFmpegMetadata',
                'add_metadata': True,  # Ensure metadata is added
            },
        ],
        # Fragment error handling
        'fragment_retries': 50,
        'skip_unavailable_fragments': True,
        'ignoreerrors': 'only_download',
        'extractor_retries': 20,
        'file_access_retries': 10,
        # Connection settings (optimized for speed)
        'concurrent_fragment_downloads': concurrent,  # Configurable concurrency
        'retries': 30,
        # Livestream specific — retry every 30-60 s while waiting for stream to go live
        'wait_for_video': (30, 60),
        'noprogress': True,
        'no_color': True,
        'hls_prefer_native': True,
        'merge_output_format': container,
        # Hooks
        'progress_hooks': [progress_hook],
        # Logging
        'quiet': False,
        'no_warnings': False,
    }
    
    if from_start:
        ydl_opts['live_from_start'] = True
    
    if _extractor_args:
        ydl_opts['extractor_args'] = _extractor_args
    if cookies_path and os.path.isfile(cookies_path):
        ydl_opts['cookiefile'] = cookies_path
    
    global _download_active
    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            ydl.download([url])
        _download_active = False
    except Exception as e:
        _download_active = False
        print(f"yt-dlp failed: {e}")
        with open("failed_download.txt", 'w') as f:
            f.write(f"Failed to download video {url}")
        exit(1)


# Download the video using yt-dlp
run_ytdlp(url, fmt)

# Move the downloaded file back to the original directory
try:
    try:
        import check_res
        for file in os.listdir():
            if os.path.isfile(file) and file.lower().endswith(('.mp4', '.mkv', '.webm')):
                check_res.check_resolution(file)
    except Exception:
        pass

    for file in os.listdir():
        os.rename(file, os.path.join("..", file))
except OSError as e:
    print(f"Error moving files back to original directory: {e}")
    exit(1)

# Change back to the original directory
try:
    os.chdir("..")
except FileNotFoundError as e:
    print(f"Error changing back to original directory: {e}")
    exit(1)

# Remove the folder
try:
    os.rmdir(folder_name)
except OSError as e:
    print(f"Error removing directory '{folder_name}': {e}. It may not be empty.")
