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
from pathlib import Path
from typing import Dict, Any

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

# Bootstrap optional dependencies
if use_deno:
    _ensure_deno()
if bgutil_url:
    _ensure_bgutil()

# Extractor args for bgutil PO token provider (applied in run_ytdlp below)
# In local/deno mode we install the plugin + deno and let yt-dlp use whichever client works
# best — we do NOT force player_client=web because that hard-requires a PO token, and if
# deno is unavailable the download would stall or skip formats. Only force web when an
# explicit HTTP server URL is provided and known to be reachable.
_extractor_args: dict = {}
if bgutil_url and bgutil_url != 'local':
    _extractor_args = {
        'youtube': {'player_client': ['web']},
        'youtubepot-bgutilhttp': {'base_url': [bgutil_url]},
    }
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
    last_progress_time = [time.time()]
    
    def progress_hook(d: Dict[str, Any]):
        """Hook for download progress updates."""
        status = d.get('status')
        
        if status == 'downloading':
            # Log progress every 30 seconds
            if time.time() - last_progress_time[0] > 30:
                downloaded = d.get('downloaded_bytes', 0)
                total = d.get('total_bytes') or d.get('total_bytes_estimate', 0)
                speed = d.get('speed', 0)
                
                if speed:
                    speed_str = f"{speed / 1024 / 1024:.2f} MB/s"
                else:
                    speed_str = "N/A"
                
                if total:
                    percent = (downloaded / total) * 100
                    print(f"[download] {percent:.1f}% of ~{total / 1024 / 1024:.1f}MiB at {speed_str}")
                else:
                    print(f"[download] {downloaded / 1024 / 1024:.1f}MiB at {speed_str} (livestream)")
                
                last_progress_time[0] = time.time()
    
    # Configure yt-dlp options (optimized for stability)
    ydl_opts = {
        'format': fmt,
        'live_from_start': True,
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
        # Connection settings (optimized for slow/unstable connections)
        'http_chunk_size': 1048576,  # 1MB (smaller chunks for stability)
        'concurrent_fragment_downloads': 1,  # Single download to avoid overwhelming connection
        'retries': 30,
        'socket_timeout': 30,  # 30 second timeout
        'source_address': '0.0.0.0',  # Bind to default interface
        # Livestream specific — retry every 30-60 s while waiting for stream to go live
        'wait_for_video': (30, 60),
        'noprogress': False,
        'no_color': True,
        'hls_prefer_native': True,
        'merge_output_format': container,
        # Hooks
        'progress_hooks': [progress_hook],
        # Logging
        'quiet': False,
        'no_warnings': False,
    }
    
    if _extractor_args:
        ydl_opts['extractor_args'] = _extractor_args
    if cookies_path and os.path.isfile(cookies_path):
        ydl_opts['cookiefile'] = cookies_path
    
    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            ydl.download([url])
    except Exception as e:
        print(f"yt-dlp failed: {e}")
        with open("failed_download.txt", 'w') as f:
            f.write(f"Failed to download video {url}")
        exit(1)


# Download the video using yt-dlp
run_ytdlp(url, fmt)

# Move the downloaded file back to the original directory
try:
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
