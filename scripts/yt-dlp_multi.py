"""
Multi-URL yt-dlp Batch Downloader Script

This script allows the user to batch download videos from YouTube, Twitch, and other supported sites using yt-dlp.

Features:

- Supports both yt-dlp's default downloader and aria2c for external downloads.
- Organizes downloads into folders named after video metadata.
- Moves completed videos to a base directory, handling duplicates gracefully.
- Handles unrecoverable errors and logs failed downloads.
- Optionally rests between downloads and after every 30 downloads in large batches.
- Robust error handling and logging for reliability.

Usage:

- Run the script and enter video URLs one per line (blank line to finish).
- Optionally choose to rest 5 minutes between downloads.
- The script will process each URL, download the video, and move it to the base directory.
- Failed downloads are logged in 'failed_downloads.txt'.

Requirements:

- Python 3.7+
- yt-dlp
- aria2c (optional, for external downloads)
- python-slugify

Author: ito (with improvements by AI)
"""

import os
import importlib
import subprocess as _sp
import sys
from pathlib import Path

def _ensure(pip_pkg, import_name=None):
    try:
        importlib.import_module(import_name or pip_pkg)
    except ImportError:
        print(f'[setup] Installing {pip_pkg}...', flush=True)
        _sp.check_call([sys.executable, '-m', 'pip', 'install', pip_pkg])

def _ensure_bgutil():
    """Install bgutil-ytdlp-pot-provider yt-dlp plugin if not already present."""
    try:
        result = _sp.run(
            [sys.executable, '-m', 'pip', 'show', 'bgutil-ytdlp-pot-provider'],
            capture_output=True, text=True, timeout=15,
        )
        if result.returncode == 0:
            return
    except Exception:
        pass
    print('[setup] Installing bgutil-ytdlp-pot-provider...', flush=True)
    _sp.check_call([sys.executable, '-m', 'pip', 'install', '-q', 'bgutil-ytdlp-pot-provider'])
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
            result = _sp.run(
                ['powershell', '-NoProfile', '-NonInteractive', '-Command',
                 'irm https://deno.land/install.ps1 | iex'],
                capture_output=True, text=True, timeout=120,
            )
        else:
            result = _sp.run(
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

import subprocess
import shutil
import time
import logging
import json
from slugify import slugify
from subprocess import Popen, PIPE
from typing import List
from contextlib import contextmanager
import atexit
import signal

# ——— Logging Setup ——————————————————————————————————————
logging.basicConfig(
    level=logging.INFO,
    format='[%(asctime)s] %(levelname)s: %(message)s',
    datefmt='%H:%M:%S'
)
logger = logging.getLogger(__name__)


def safe_text(obj) -> str:
    """Return a str representation of obj that's safe for console logging.

    - If obj is bytes, decode with utf-8 and backslashreplace on errors.
    - If conversion to str raises, fall back to repr(), or a placeholder.
    """
    # Handle bytes directly
    if isinstance(obj, bytes):
        return obj.decode('utf-8', errors='backslashreplace')

    # Special-case exceptions to avoid their __str__ attempting to decode
    # internal bytes with the system encoding which can raise 'charmap' errors.
    if isinstance(obj, BaseException):
        parts = []
        for a in getattr(obj, 'args', ()):
            try:
                if isinstance(a, bytes):
                    parts.append(a.decode('utf-8', errors='backslashreplace'))
                else:
                    parts.append(str(a))
            except Exception:
                try:
                    parts.append(repr(a))
                except Exception:
                    parts.append('<unrepresentable>')
        if parts:
            return f"{obj.__class__.__name__}: {' '.join(parts)}"
        return obj.__class__.__name__

    try:
        return str(obj)
    except Exception:
        try:
            return repr(obj)
        except Exception:
            return '<unrepresentable>'

# ——— Interrupt / failure recovery ———————————————————————————
_pending_urls: List[str] = []
_base_dir_recovery: str = ''
_current_url: str = ''

def _save_incomplete_on_exit() -> None:
    """On exit, append any in-progress + not-yet-started URLs to failed_downloads.txt."""
    urls_to_save = []
    if _current_url:
        urls_to_save.append(_current_url)
    urls_to_save.extend(_pending_urls)
    if not urls_to_save or not _base_dir_recovery:
        return
    path = os.path.join(_base_dir_recovery, 'failed_downloads.txt')
    try:
        with open(path, 'a', encoding='utf-8') as f:
            for u in urls_to_save:
                f.write(u + '\n')
        logger.info(f"Saved {len(urls_to_save)} incomplete/pending URL(s) to failed_downloads.txt")
    except Exception as e:
        logger.error(f"Failed to save incomplete URLs: {safe_text(e)}")

atexit.register(_save_incomplete_on_exit)
signal.signal(signal.SIGTERM, lambda *_: sys.exit(1))

# ——— Configuration ——————————————————————————————————————
COOKIE_FILE = sys.argv[3] if len(sys.argv) > 3 else ''
EXTRA_ARGS  = json.loads(sys.argv[4]) if len(sys.argv) > 4 and sys.argv[4] else []
CONTAINER   = sys.argv[5] if len(sys.argv) > 5 else 'mp4'
BGUTIL_URL  = sys.argv[6] if len(sys.argv) > 6 else ''
USE_DENO    = sys.argv[7].lower() == 'y' if len(sys.argv) > 7 else True
USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/136.0.0.0 Safari/537.36"
)

# Bootstrap optional dependencies
if USE_DENO:
    _ensure_deno()
if BGUTIL_URL:
    _ensure_bgutil()

# ——— Context Manager for Directory Changes ——————————————
@contextmanager
def change_dir(destination: str):
    """Context manager to change working directory and return to previous on exit."""
    prev_dir = os.getcwd()
    try:
        os.chdir(destination)
        yield
    except Exception as e:
        # Use logging placeholders to avoid constructing a string that may
        # attempt to decode non-decodable bytes. repr(destination) is passed
        # as an argument so the logging module can handle it safely.
        logger.error("Failed to change directory to %r: %s", repr(destination), safe_text(e))
        raise
    finally:
        try:
            os.chdir(prev_dir)
        except Exception as e:
            logger.error("Failed to return to previous directory %r: %s", repr(prev_dir), safe_text(e))

# ——— Helpers ——————————————————————————————————————————
def is_unrecoverable_error(output: str) -> bool:
    """Check if the output contains unrecoverable error patterns."""
    low = output.lower()
    patterns = [
        "video unavailable",
        "this video is private",
        "copyright claim",
        "member-only content",
        "not available"
    ]
    return any(p in low for p in patterns)

def update_failed_downloads(url: str, dest: str) -> None:
    """Append a failed URL to the failed_downloads.txt file."""
    path = os.path.join(dest, "failed_downloads.txt")
    try:
        with open(path, "a", encoding="utf-8") as f:
            f.write(url + "\n")
    except Exception as e:
        logger.error(f"Failed to update failed_downloads.txt: {safe_text(e)}")

def create_folder(name: str) -> str:
    """Create a folder if it doesn't exist."""
    try:
        os.makedirs(name, exist_ok=True)
        logger.info(f"Created folder: {name}")
    except Exception as e:
        logger.error(f"Failed to create folder {name}: {safe_text(e)}")
        raise
    return name

def remove_empty_folder(path: str, retries: int = 3, delay: float = 1.0) -> None:
    """Remove a folder if it is empty, with retries."""
    for _ in range(retries):
        time.sleep(delay)
        try:
            if os.path.isdir(path) and not os.listdir(path):
                os.rmdir(path)
                logger.info(f"Removed empty folder: {path}")
                return
        except Exception as e:
            logger.warning(f"Failed to remove folder {path}: {safe_text(e)}")
            return

def is_download_successful() -> bool:
    """Check if the download completed successfully (no partials)."""
    try:
        files = os.listdir('.')
        partials = [f for f in files if f.endswith(('.part', '.vtt'))]
        f_digits = [f for f in files if '.f' in f and f.split('.f')[1].isdigit()]
        if partials or f_digits:
            logger.warning(f"Download incomplete – detected: {partials + f_digits}")
            return False
        return True
    except Exception as e:
        logger.error(f"Error checking download success: {safe_text(e)}")
        return False

def ask_for_rest() -> bool:
    """Ask the user if they want to rest between downloads."""
    try:
        resp = input("Rest 5 minutes between downloads? (Y/n): ").strip()
        # Default to Yes when the user just presses Enter
        if resp == "":
            return True
        return resp.lower().startswith('y')
    except Exception as e:
        logger.error(f"Error reading user input: {safe_text(e)}")
        return False

def get_urls() -> List[str]:
    """Prompt the user to enter URLs, one per line."""
    print("Enter URLs (one per line). Blank to finish:")
    urls = []
    while True:
        try:
            line = input().strip()
        except Exception as e:
            logger.error(f"Error reading URL input: {safe_text(e)}")
            break
        if not line:
            break
        urls.append(line)
    return urls

# ——— Downloaders (live progress + stderr capture) ———————————
def download_without_aria(url: str, fmt: str = 'bv+ba/bestvideo+bestaudio/best', retries: int = 3) -> bool:
    """Download using yt-dlp's default downloader."""
    cmd = [
        sys.executable, "-m", "yt_dlp", "-v",
        "-f", fmt,
        "--abort-on-unavailable-fragment",
        "--merge-output-format", CONTAINER,
        "--write-auto-sub", "--sub-langs", "en",
        "--embed-subs", "--add-metadata",
        "--ignore-errors",
        # Enable automatic EJS script downloads from GitHub
        "--remote-components", "ejs:github",
        "--user-agent", USER_AGENT,
    ]
    if COOKIE_FILE and os.path.isfile(COOKIE_FILE):
        cmd += ["--cookies", COOKIE_FILE]
    if EXTRA_ARGS:
        cmd.extend(EXTRA_ARGS)
    if BGUTIL_URL and BGUTIL_URL != 'local':
        cmd += ['--extractor-args', 'youtube:player_client=web',
                '--extractor-args', f'youtubepot-bgutilhttp:base_url={BGUTIL_URL}']
    cmd.append(url)
    for attempt in range(1, retries + 1):
        logger.info(f" [default downloader] attempt {attempt}/{retries}")
        try:
            # Run in binary mode; decode stderr manually to avoid locale
            # decoding issues on Windows.
            proc = Popen(cmd, stdout=None, stderr=PIPE)
        except Exception as e:
            logger.error(f"Failed to start yt-dlp: {safe_text(e)}")
            return False
        err_accum = ""
        if proc.stderr is not None:
            for raw in proc.stderr:
                try:
                    line = raw.decode('utf-8', errors='backslashreplace')
                except Exception:
                    line = repr(raw)
                err_accum += line
                print(line, end='') # live error/debug echo
        proc.wait()
        if proc.returncode == 0 and is_download_successful():
            return True
        if is_unrecoverable_error(err_accum):
            logger.warning(" Unrecoverable error detected – skipping retries.")
            return False
        logger.warning(f" attempt {attempt} failed (exit code {proc.returncode})")
        time.sleep(1 + attempt * 0.5)
    return False

def download_with_aria(url: str, fmt: str = 'bv+ba/bestvideo+bestaudio/best', retries: int = 3) -> bool:
    """Download using yt-dlp with aria2c as external downloader."""
    aria_args = f"--retry-wait=5 --max-tries={retries} --file-allocation=none"
    cmd = [
        sys.executable, "-m", "yt_dlp", "-v",
        "-f", fmt,
        "--abort-on-unavailable-fragment",
        "--merge-output-format", CONTAINER,
        "--write-auto-sub", "--sub-langs", "en",
        "--embed-subs", "--add-metadata",
        "--external-downloader", "aria2c",
        "--external-downloader-args", aria_args,
        # Enable automatic EJS script downloads from GitHub
        "--remote-components", "ejs:github",
        "--user-agent", USER_AGENT,
    ]
    if COOKIE_FILE and os.path.isfile(COOKIE_FILE):
        cmd += ["--cookies", COOKIE_FILE]
    if EXTRA_ARGS:
        cmd.extend(EXTRA_ARGS)
    # Add output template for Twitch links to keep naming format but limit length
    if "twitch.tv" in url:
        cmd += ["-o", "%(title).100s [%(id)s].%(ext)s"]
    if BGUTIL_URL and BGUTIL_URL != 'local':
        cmd += ['--extractor-args', 'youtube:player_client=web',
                '--extractor-args', f'youtubepot-bgutilhttp:base_url={BGUTIL_URL}']
    cmd.append(url)
    for attempt in range(1, retries + 1):
        logger.info(f" [aria2c downloader] attempt {attempt}/{retries}")
        try:
            proc = Popen(cmd, stdout=None, stderr=PIPE)
        except Exception as e:
            logger.error(f"Failed to start yt-dlp with aria2c: {safe_text(e)}")
            return False
        err_accum = ""
        if proc.stderr is not None:
            for raw in proc.stderr:
                try:
                    line = raw.decode('utf-8', errors='backslashreplace')
                except Exception:
                    line = repr(raw)
                err_accum += line
                print(line, end='')
        proc.wait()
        if proc.returncode == 0 and is_download_successful():
            return True
        if is_unrecoverable_error(err_accum):
            logger.warning(" Unrecoverable error detected – skipping retries.")
            return False
        logger.warning(f" attempt {attempt} failed (exit code {proc.returncode})")
        time.sleep(1 + attempt * 0.5)
    return False

# ——— Folder naming via metadata dump (silent) —————————————
def create_folder_for_url(url: str) -> str:
    """Create a folder for the URL using yt-dlp metadata."""
    def sanitize_name(name: str, max_len: int = 50) -> str:
        """Return a filesystem-safe ASCII-only folder name.

        - Use slugify with allow_unicode=False to strip non-ASCII characters.
        - Replace spaces and problematic chars with hyphens.
        - Trim length to max_len.
        - Fall back to a hex of the name on failure.
        """
        try:
            # prefer ASCII-only slugs to avoid encoding surprises on Windows
            s = slugify(name, allow_unicode=False)
            if not s:
                raise ValueError("empty slug")
            # Ensure we don't have path separators
            s = s.replace(os.sep, "-")
            # Trim and return
            return s[:max_len]
        except Exception:
            # Last-resort: hex digest of the original name
            try:
                import hashlib
                h = hashlib.sha1(name.encode('utf-8', errors='ignore')).hexdigest()
                return f"untitled-{h[:10]}"
            except Exception:
                return "untitled"

    try:
        # Capture bytes and decode with utf-8 and errors='replace' to avoid
        # UnicodeDecodeError when yt-dlp outputs characters not compatible with
        # the system locale.
        info = subprocess.run(
            [sys.executable, "-m", "yt_dlp", "--quiet", "--dump-single-json", url],
            capture_output=True, encoding='utf-8', errors='replace'
        )
        import json
        data = json.loads(info.stdout or '{}')
        title = data.get("title", url)
        # For Twitch links, use only the video id as the folder name
        if "twitch.tv" in url:
            raw = str(data.get("id", url.split("/")[-1].split("?")[0]))
        else:
            raw = title
    except Exception as e:
        logger.warning(f"Failed to get metadata for folder naming: {safe_text(e)}")
        raw = url.split("/")[-1].split("?")[0]

    slug = sanitize_name(raw)
    return create_folder(slug)

# ——— Main Flow ——————————————————————————————————————————
def main() -> None:
    """Main entry point for the script."""
    global _pending_urls, _base_dir_recovery, _current_url
    fmt = sys.argv[1] if len(sys.argv) > 1 else 'bv+ba/bestvideo+bestaudio/best'
    rest_arg = sys.argv[2] if len(sys.argv) > 2 else None
    rest = (rest_arg.lower().startswith('y')) if rest_arg is not None else ask_for_rest()
    urls = get_urls()
    if not urls:
        logger.info("No URLs provided. Exiting.")
        return
    base_dir = os.getcwd()
    _pending_urls = list(urls)
    _base_dir_recovery = base_dir
    failed = []
    total = len(urls)
    for idx, url in enumerate(urls, 1):
        _pending_urls.remove(url)
        _current_url = url
        logger.info(f"\n[{idx}/{total}] Processing: {url}")
        try:
            folder = create_folder_for_url(url)
        except Exception as e:
            logger.error(f"Failed to create folder for URL {url}: {safe_text(e)}")
            failed.append(url)
            update_failed_downloads(url, base_dir)
            _current_url = ''
            continue
        try:
            with change_dir(folder):
                if "youtube.com" in url or "youtu.be" in url or "." not in url:
                    success = download_without_aria(url, fmt=fmt)
                else:
                    success = download_with_aria(url, fmt=fmt)
        except Exception as e:
            logger.error(f"Error during download for {url}: {safe_text(e)}")
            failed.append(url)
            update_failed_downloads(url, base_dir)
            _current_url = ''
            continue
        try:
            if success:
                try:
                    files = os.listdir(folder)
                except Exception as e:
                    logger.error(f"Failed to list files in {folder}: {safe_text(e)}")
                    files = []
                for f in files:
                    if f.lower().endswith(('.mp4', '.mkv', '.webm')):
                        src = os.path.join(folder, f)
                        dst = os.path.join(base_dir, f)
                        try:
                            shutil.move(src, dst)
                            logger.info(f" Moved '{f}' from '{folder}'")
                        except shutil.Error as e:
                            if "already exists" in str(e).lower():
                                logger.info(f" File '{f}' already exists in '{base_dir}', skipping move.")
                            else:
                                logger.error(f" Error moving '{f}': {safe_text(e)}")
                logger.info(f" Finished processing media from '{folder}'")
            else:
                logger.warning(f" Download failed: {url}")
                failed.append(url)
                update_failed_downloads(url, base_dir)
        except Exception as e:
            logger.error(f"Error handling downloaded files for {url}: {safe_text(e)}")
            failed.append(url)
            update_failed_downloads(url, base_dir)
        _current_url = ''
        remove_empty_folder(folder)
        # Existing rest logic
        if rest and idx < total:
            logger.info(" Pausing 5 minutes before next download…")
            time.sleep(5 * 60)
        # New: Pause for 30 minutes after every 30 downloads if more than 30
        if total > 30 and idx % 30 == 0 and idx < total:
            logger.info(f" Batch limit reached ({idx} downloads). Pausing 30 minutes before continuing…")
            time.sleep(30 * 60)
    if failed:
        logger.warning(f"\n{len(failed)} downloads failed. See failed_downloads.txt")
    else:
        logger.info("\nAll downloads completed successfully!")

if __name__ == "__main__":
    main()
