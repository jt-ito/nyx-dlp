import os
import sys
import importlib
import subprocess
import atexit
import signal
from pathlib import Path

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
import shutil
import yt_dlp
import time
import json as _json

url = sys.argv[1] if len(sys.argv) > 1 else input("Enter the URL and press enter: ")
fmt = sys.argv[2] if len(sys.argv) > 2 else 'bestvideo+bestaudio/best'
cookies_path = sys.argv[3] if len(sys.argv) > 3 else ''
extra_args   = _json.loads(sys.argv[4]) if len(sys.argv) > 4 and sys.argv[4] else []
container    = sys.argv[5] if len(sys.argv) > 5 else 'mp4'
start_time   = sys.argv[6] if len(sys.argv) > 6 else ''
end_time     = sys.argv[7] if len(sys.argv) > 7 else ''
bgutil_url   = sys.argv[8] if len(sys.argv) > 8 else ''
use_deno     = sys.argv[9].lower() == 'y' if len(sys.argv) > 9 else True

# Bootstrap optional dependencies
if use_deno:
    _ensure_deno()
if bgutil_url:
    _ensure_bgutil()

# Extractor args for bgutil PO token provider (applied in ydl_opts below)
# In local/deno mode we install the plugin + deno and let yt-dlp use whichever client works
# best — we do NOT force player_client=web because that hard-requires a PO token, and if
# deno is unavailable the download would stall or skip formats. Only force web when an
# explicit HTTP server URL is provided and known to be reachable.
_extractor_args: dict = {}
if bgutil_url and bgutil_url != 'local':
    # HTTP server mode: ensure we use the web client (full format list) and route PO tokens
    # through the user-configured server.
    _extractor_args = {
        'youtube': {'player_client': ['web']},
        'youtubepot-bgutilhttp': {'base_url': [bgutil_url]},
    }
    print(f'[bgutil] Using HTTP server at {bgutil_url}', flush=True)
elif bgutil_url == 'local':
    # Local deno mode: package + deno are installed; the plugin registers itself and
    # supplies PO tokens automatically when yt-dlp needs them. The HTTP provider will
    # emit a warning that 127.0.0.1:4416 is unreachable — that is expected and harmless.
    print('[bgutil] Local deno mode — plugin will provide PO tokens via deno', flush=True)

def _hms_to_secs(ts: str) -> float:
    """Convert HH:MM:SS (or MM:SS) timestamp string to total seconds."""
    parts = ts.strip().split(':')
    try:
        parts = [float(p) for p in parts]
    except ValueError:
        return 0.0
    if len(parts) == 3:
        return parts[0] * 3600 + parts[1] * 60 + parts[2]
    if len(parts) == 2:
        return parts[0] * 60 + parts[1]
    return parts[0]

# Initialize videos as an empty list
videos = []

playlist = False

# ── Interrupt / failure recovery ──────────────────────────────
_original_dir = os.getcwd()
_download_active = False

def _write_failed(u: str) -> None:
    path = os.path.join(_original_dir, 'failed_downloads.txt')
    try:
        with open(path, 'a', encoding='utf-8') as f:
            f.write(u + '\n')
        print(f"Saved to failed_downloads.txt: {u}")
    except Exception:
        pass

def _on_exit() -> None:
    if _download_active:
        _write_failed(url)

atexit.register(_on_exit)
signal.signal(signal.SIGTERM, lambda *_: sys.exit(1))

def _apply_extra_args(opts: dict, extra: list) -> dict:
    """Merge extra CLI-style flags from the UI into a ydl_opts dict."""
    pps = opts.setdefault('postprocessors', [])
    def _pp(key: str) -> dict:
        for pp in pps:
            if pp.get('key') == key:
                return pp
        pp = {'key': key}
        pps.append(pp)
        return pp
    i = 0
    while i < len(extra):
        f = extra[i]
        nv = extra[i + 1] if i + 1 < len(extra) else None
        if   f == '--restrict-filenames':       opts['restrictfilenames'] = True
        elif f == '--windows-filenames':        opts['windowsfilenames'] = True
        elif f == '--no-overwrites':            opts['nooverwrites'] = True
        elif f == '--force-overwrites':         opts['overwrites'] = True
        elif f == '--no-continue':              opts['continuedl'] = False
        elif f == '--mtime':                    opts['updatetime'] = True
        elif f == '--write-description':        opts['writedescription'] = True
        elif f == '--write-info-json':          opts['writeinfojson'] = True
        elif f == '--write-comments':           opts['getcomments'] = True
        elif f == '--no-cache-dir':             opts['cachedir'] = False
        elif f == '--write-subs':               opts['writesubtitles'] = True
        elif f == '--write-auto-subs':          opts['writeautomaticsub'] = True
        elif f == '--keep-video':               opts['keepvideo'] = True
        elif f == '--embed-thumbnail':          _pp('EmbedThumbnail')
        elif f == '--embed-chapters':           opts['addchapters'] = True
        elif f == '--split-chapters':           opts['split_chapters'] = True
        elif f == '--force-keyframes-at-cuts':  opts['force_keyframes_at_cuts'] = True
        elif f == '--xattrs':                   opts['xattrs'] = True
        elif f == '--auto-retry-errors':        opts['auto_retry_errors'] = True
        elif f == '--extract-audio':
            ep = _pp('FFmpegExtractAudio')
            ep.setdefault('preferredcodec', 'best')
            ep.setdefault('preferredquality', '5')
        elif nv is not None:
            if   f == '--output':               opts['outtmpl'] = nv;                                      i += 1
            elif f == '--trim-filenames':
                try: opts['trim_file_name'] = int(nv)
                except ValueError: pass
                i += 1
            elif f == '--cookies-from-browser': opts['cookiesfrombrowser'] = (nv, None, None, None);       i += 1
            elif f == '--sub-format':           opts['subtitlesformat'] = nv;                              i += 1
            elif f == '--sub-langs':            opts['subtitleslangs'] = [l.strip() for l in nv.split(',')]; i += 1
            elif f == '--audio-format':         _pp('FFmpegExtractAudio')['preferredcodec'] = nv;          i += 1
            elif f == '--audio-quality':        _pp('FFmpegExtractAudio')['preferredquality'] = nv;        i += 1
            elif f == '--remux-video':          opts['remuxvideo'] = nv;                                   i += 1
            elif f == '--recode-video':         opts['recodevideo'] = nv;                                  i += 1
            elif f == '--ffmpeg-location':      opts['ffmpeg_location'] = nv;                              i += 1
            elif f == '--exec':                 opts['exec_cmd'] = nv;                                     i += 1
            elif f == '--convert-subs':         _pp('FFmpegSubtitlesConvertor')['format'] = nv;            i += 1
            elif f == '--fixup':                opts['fixup'] = nv;                                        i += 1
            elif f == '--remove-chapters':      opts.setdefault('remove_chapters', []).append(nv);         i += 1
            elif f == '--username':             opts['username'] = nv;                                     i += 1
            elif f == '--password':             opts['password'] = nv;                                     i += 1
            elif f == '--twofactor':            opts['twofactor'] = nv;                                    i += 1
            elif f == '--netrc-location':       opts['netrc_location'] = nv;                               i += 1
            elif f == '--video-password':       opts['videopassword'] = nv;                                i += 1
            elif f == '--ap-mso':               opts['ap_mso'] = nv;                                       i += 1
            elif f == '--ap-username':          opts['ap_username'] = nv;                                  i += 1
            elif f == '--ap-password':          opts['ap_password'] = nv;                                  i += 1
            elif f == '--client-certificate':              opts['client_certificate'] = nv;                i += 1
            elif f == '--client-certificate-key':          opts['client_certificate_key'] = nv;            i += 1
            elif f == '--client-certificate-password':     opts['client_certificate_password'] = nv;       i += 1
            # Network & Proxy
            elif f == '--proxy':              opts['proxy'] = nv;                                          i += 1
            elif f == '--source-address':     opts['source_address'] = nv;                                 i += 1
            elif f == '--socket-timeout':
                try: opts['socket_timeout'] = float(nv)
                except ValueError: pass
                i += 1
            elif f == '--geo-bypass-country': opts['geo_bypass_country'] = nv;                             i += 1
            # Download Tuning
            elif f == '--retries':
                try: opts['retries'] = int(nv)
                except ValueError: opts['retries'] = nv  # allow "infinite"
                i += 1
            elif f == '--fragment-retries':
                try: opts['fragment_retries'] = int(nv)
                except ValueError: opts['fragment_retries'] = nv
                i += 1
            elif f == '--concurrent-fragments':
                try: opts['concurrent_fragment_downloads'] = int(nv)
                except ValueError: pass
                i += 1
            elif f == '--rate-limit':        opts['ratelimit'] = nv;                                       i += 1
            elif f == '--throttled-rate':    opts['throttledratelimit'] = nv;                              i += 1
            elif f == '--sleep-interval':
                try: opts['sleep_interval'] = float(nv)
                except ValueError: pass
                i += 1
            elif f == '--max-sleep-interval':
                try: opts['max_sleep_interval'] = float(nv)
                except ValueError: pass
                i += 1
            elif f == '--buffer-size':       opts['buffersize'] = nv;                                      i += 1
            # Playlist & Selection
            elif f == '--playlist-start':
                try: opts['playliststart'] = int(nv)
                except ValueError: pass
                i += 1
            elif f == '--playlist-end':
                try: opts['playlistend'] = int(nv)
                except ValueError: pass
                i += 1
            elif f == '--playlist-items':    opts['playlist_items'] = nv;                                  i += 1
            elif f == '--max-downloads':
                try: opts['max_downloads'] = int(nv)
                except ValueError: pass
                i += 1
            elif f == '--match-filter':      opts['match_filter'] = nv;                                    i += 1
            elif f == '--datebefore':        opts['datebefore'] = nv;                                      i += 1
            elif f == '--dateafter':         opts['dateafter'] = nv;                                       i += 1
            elif f == '--download-sections': opts['download_ranges'] = nv;                                 i += 1
            # Thumbnails
            elif f == '--convert-thumbnails': _pp('FFmpegThumbnailsConvertor')['format'] = nv;             i += 1
            # SponsorBlock
            elif f == '--sponsorblock-remove': opts['sponsorblock_remove'] = [c.strip() for c in nv.split(',')]; i += 1
            elif f == '--sponsorblock-mark':   opts['sponsorblock_mark']   = [c.strip() for c in nv.split(',')]; i += 1
            elif f == '--extractor-args':
                if nv and ':' in nv and '=' in nv:
                    ie, rest = nv.split(':', 1)
                    for pair in rest.split(';'):
                        if '=' in pair:
                            k, v = pair.split('=', 1)
                            opts.setdefault('extractor_args', {}).setdefault(ie, {})[k] = [x.strip() for x in v.split(',')]
                i += 1
        elif f == '--netrc':                    opts['usenetrc'] = True
        # Network & Proxy (no-value flags)
        elif f == '--force-ipv4':              opts['source_address'] = '0.0.0.0'
        elif f == '--force-ipv6':              opts['source_address'] = '::'
        elif f == '--geo-bypass':              opts['geo_bypass'] = True
        elif f == '--no-check-certificates':   opts['nocheckcertificate'] = True
        elif f == '--legacy-server-connect':   opts['legacyserverconnect'] = True
        elif f == '--prefer-insecure':         opts['preferinsecure'] = True
        # Playlist & Selection (no-value flags)
        elif f == '--no-playlist':             opts['noplaylist'] = True
        elif f == '--yes-playlist':            opts['noplaylist'] = False
        elif f == '--flat-playlist':           opts['extract_flat'] = True
        # Thumbnails (no-value flags)
        elif f == '--write-thumbnail':         opts['writethumbnail'] = True
        elif f == '--write-all-thumbnails':    opts['write_all_thumbnails'] = True
        # SponsorBlock (no-value flags)
        elif f == '--no-sponsorblock':         opts['no_sponsorblock'] = True
        i += 1
    return opts

def folder(title):
    # Slugify the folder name
    folder_name = slugify(title)
    os.makedirs(folder_name, exist_ok=True)

    # Change into the folder
    os.chdir(folder_name)
    return folder_name

def move(folder_name, success):
    global _download_active
    _download_active = False  # clear before handling to prevent atexit double-write
    # Move the downloaded files back to the original directory
    if success:
        try:
            import check_res
            for file in os.listdir():
                if os.path.isfile(file) and file.lower().endswith(('.mp4', '.mkv', '.webm')):
                    check_res.check_resolution(file)
        except Exception:
            pass

        for file in os.listdir():
            if os.path.isfile(file):  # Check if it's a file before renaming
                os.rename(file, os.path.join("..", file))

        # Change back to the original directory
        os.chdir("..")

        # Remove the folder
        os.rmdir(folder_name)
    else:
        print("Download failed or stopped. Files will not be moved.")
        _write_failed(url)
        print("Press enter to continue...")
        input()  # Wait for user input
        os.chdir("..")  # Change back to the original directory

def download_with_aria(url, folder_name, fmt='bestvideo+bestaudio/best', retries=3):
    # Download the videos using yt-dlp with aria2c.
    # If every retry fails with 'Initialization fragment found after media
    # fragments', automatically falls back to download_with_ffmpeg.
    ydl_opts = {
        'format': fmt,
        'subtitleslangs': ['en'],
        'writeautomaticsub': True,
        # Allow yt-dlp to fetch EJS scripts directly from GitHub
        'remote_components': 'ejs:github',
        'compat_options': ['no-file-locking'],  # Prevents file locking
        'merge_output_format': container,
        'external_downloader': 'aria2c',  # Use aria2 as the downloader
        'postprocessors': [
            {
                'key': 'FFmpegEmbedSubtitle',  # Keep this for embedding subtitles
            },
            {
                'key': 'FFmpegMetadata',
            },
        ],
    }
    if _extractor_args:
        ydl_opts['extractor_args'] = _extractor_args
    if cookies_path and os.path.isfile(cookies_path):
        ydl_opts['cookiefile'] = cookies_path
    if extra_args:
        _apply_extra_args(ydl_opts, extra_args)
    if start_time or end_time:
        from yt_dlp.utils import download_range_func
        s = _hms_to_secs(start_time) if start_time else 0.0
        e = _hms_to_secs(end_time)   if end_time   else float('inf')
        ydl_opts['download_ranges'] = download_range_func(None, [(s, e)])
        ydl_opts['force_keyframes_at_cuts'] = True

    _INIT_FRAG_ERR = "initialization fragment found after media fragments"
    init_frag_fail_count = 0
    success = False
    for attempt in range(retries):
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            try:
                retcode = ydl.download([url])
                if retcode != 0 or os.path.exists('video.mp4.part') or os.path.exists('video.mkv.part') or \
                    os.path.exists('.part') or os.path.exists('.ytdlp') or \
                    any(file.endswith('.vtt') for file in os.listdir()) or \
                    any('.f' in file and file.split('.f')[1].isdigit() for file in os.listdir()):
                    print("Download was not successful.")
                else:
                    success = True
                
                if success:
                    break
                elif not ydl_opts.get('auto_retry_errors'):
                    break
                else:
                    if attempt == retries - 1:
                        print("Max retries reached. Download failed.")
                    else:
                        print(f"Retrying (attempt {attempt + 2})...")
            except Exception as e:
                err_str = str(e)
                print(f"Attempt {attempt + 1} failed: {err_str}")
                if _INIT_FRAG_ERR in err_str.lower():
                    init_frag_fail_count += 1
                if not ydl_opts.get('auto_retry_errors') and not (_INIT_FRAG_ERR in err_str.lower()):
                    break
                if attempt == retries - 1:
                    print("Max retries reached. Download failed.")
                else:
                    print("Retrying...")

    # All retries failed exclusively due to the init-fragment limitation of
    # hlsnative. Fall back to ffmpeg which handles non-standard HLS manifests.
    if not success and init_frag_fail_count == retries:
        print("[ffmpeg fallback] All aria2c attempts hit 'Initialization fragment' error – retrying with ffmpeg downloader.")
        download_with_ffmpeg(url, folder_name, fmt=fmt, retries=1)
        return  # download_with_ffmpeg handles move()

    move(folder_name, success)


def download_with_ffmpeg(url, folder_name, fmt='bestvideo+bestaudio/best', retries=3):
    """Download using yt-dlp with ffmpeg as the external downloader.

    ffmpeg has a native HLS demuxer that handles non-standard EXT-X-MAP
    placement (e.g. Twitch DVR streams), unlike yt-dlp's hlsnative wrapper.
    """
    ydl_opts = {
        'format': fmt,
        'subtitleslangs': ['en'],
        'writeautomaticsub': True,
        'remote_components': 'ejs:github',
        'compat_options': ['no-file-locking'],
        'merge_output_format': container,
        'external_downloader': {'default': 'ffmpeg'},
        'postprocessors': [
            {'key': 'FFmpegEmbedSubtitle'},
            {'key': 'FFmpegMetadata'},
        ],
    }
    if _extractor_args:
        ydl_opts['extractor_args'] = _extractor_args
    if cookies_path and os.path.isfile(cookies_path):
        ydl_opts['cookiefile'] = cookies_path
    if extra_args:
        _apply_extra_args(ydl_opts, extra_args)
    if start_time or end_time:
        from yt_dlp.utils import download_range_func
        s = _hms_to_secs(start_time) if start_time else 0.0
        e = _hms_to_secs(end_time)   if end_time   else float('inf')
        ydl_opts['download_ranges'] = download_range_func(None, [(s, e)])
        ydl_opts['force_keyframes_at_cuts'] = True

    success = False
    for attempt in range(retries):
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            try:
                retcode = ydl.download([url])
                if retcode != 0 or os.path.exists('video.mp4.part') or os.path.exists('video.mkv.part') or \
                    os.path.exists('.part') or os.path.exists('.ytdlp') or \
                    any(file.endswith('.vtt') for file in os.listdir()) or \
                    any('.f' in file and file.split('.f')[1].isdigit() for file in os.listdir()):
                    print("Download was not successful.")
                else:
                    success = True
                
                if success:
                    break
                elif not ydl_opts.get('auto_retry_errors'):
                    break
                else:
                    if attempt == retries - 1:
                        print("[ffmpeg fallback] Max retries reached. Download failed.")
                    else:
                        print(f"[ffmpeg fallback] Retrying (attempt {attempt + 2})...")
            except Exception as e:
                print(f"[ffmpeg fallback] Attempt {attempt + 1} failed: {e}")
                if not ydl_opts.get('auto_retry_errors'):
                    break
                if attempt == retries - 1:
                    print("[ffmpeg fallback] Max retries reached. Download failed.")
                else:
                    print("[ffmpeg fallback] Retrying...")
    move(folder_name, success)

def download_without_aria(url, folder_name, fmt='bestvideo+bestaudio/best', retries=3):
    # Download the videos using yt-dlp with aria2c
    ytdl_opts = {
        'format': fmt,
        'subtitleslangs': ['en'],
        'writeautomaticsub': True,
        # Allow yt-dlp to fetch EJS scripts directly from GitHub
        'remote_components': 'ejs:github',
        'compat_options': ['no-file-locking'],  # Prevents file locking
        'merge_output_format': container,
        'ignoreerrors': True,
        'verbose': True,  # Enable verbose logging
        'user_agent': "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                    "(KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36",
        'postprocessors': [
            {
                'key': 'FFmpegEmbedSubtitle',  # Keep this for embedding subtitles
            },
            {
                'key': 'FFmpegMetadata',
                'add_metadata': True,  # Ensure metadata is added
            },
        ],
    }
    if _extractor_args:
        ytdl_opts['extractor_args'] = _extractor_args
    if cookies_path and os.path.isfile(cookies_path):
        ytdl_opts['cookiefile'] = cookies_path
    if extra_args:
        _apply_extra_args(ytdl_opts, extra_args)
    if start_time or end_time:
        from yt_dlp.utils import download_range_func
        s = _hms_to_secs(start_time) if start_time else 0.0
        e = _hms_to_secs(end_time)   if end_time   else float('inf')
        ytdl_opts['download_ranges'] = download_range_func(None, [(s, e)])
        ytdl_opts['force_keyframes_at_cuts'] = True

    success = False
    for attempt in range(retries):
        with yt_dlp.YoutubeDL(ytdl_opts) as ydl:
            try:
                retcode = ydl.download([url])
                if retcode != 0 or os.path.exists('video.mp4.part') or os.path.exists('video.mkv.part') or \
                    os.path.exists('.part') or os.path.exists('.ytdlp') or \
                    any(file.endswith('.vtt') for file in os.listdir()) or \
                    any('.f' in file and file.split('.f')[1].isdigit() for file in os.listdir()):
                    print("Download was not successful.")
                else:
                    success = True
                
                if success:
                    break
                elif not ytdl_opts.get('auto_retry_errors'):
                    break
                else:
                    if attempt == retries - 1:
                        print("Max retries reached. Download failed.")
                    else:
                        print(f"Retrying (attempt {attempt + 2})...")
            except Exception as e:
                print(f"Attempt {attempt + 1} failed: {e}")
                if not ytdl_opts.get('auto_retry_errors'):
                    break
                if attempt == retries - 1:
                    print("Max retries reached. Download failed.")
                else:
                    print("Retrying...")
    move(folder_name, success)

# Check if the link is a YouTube video, playlist, or live stream
_download_active = True
if "youtube.com" in url:
    if "live" in url:
        video_id = url.split("/")[-1]  # Extract video ID from live link
    else:
        video_id = url.split("=")[-1]  # Extract video ID from standard link
    title = video_id  # Use video ID as the folder name
    folder_name = folder(title)
    download_without_aria(url, folder_name, fmt=fmt, retries=3)
elif "youtu.be" in url:
    video_id = url.split("/")[-1]  # Extract video ID from shortened link
    title = video_id  # Use video ID as the folder name
    folder_name = folder(title)
    download_without_aria(url, folder_name, fmt=fmt, retries=3)
elif "." not in url:
    title = url
    folder_name = folder(title)
    download_without_aria(url, folder_name, fmt=fmt, retries=3)
else:
    # Handle non-YouTube URLs
    title = url.split("/")[-1]
    videos = [url]
    folder_name = folder(title)
    download_with_aria(url, folder_name, fmt=fmt, retries=3)
