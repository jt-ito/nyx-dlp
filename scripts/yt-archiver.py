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

_ensure('yt-dlp',        'yt_dlp')
_ensure('python-slugify', 'slugify')

from slugify import slugify
import yt_dlp

# Get the URL from the user
url = sys.argv[1] if len(sys.argv) > 1 else input("Enter the URL and press enter: ")
fmt = sys.argv[2] if len(sys.argv) > 2 else 'bestvideo*+bestaudio/best'
cookies_path = sys.argv[3] if len(sys.argv) > 3 else ''

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
        # Livestream specific
        'wait_for_video': (300, 300),  # Poll every 5 minutes until stream goes live
        'noprogress': False,
        'no_color': True,
        'hls_prefer_native': True,
        # Hooks
        'progress_hooks': [progress_hook],
        # Logging
        'quiet': False,
        'no_warnings': False,
    }
    
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
