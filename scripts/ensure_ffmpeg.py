"""
FFmpeg Vendoring and Resolution Module

Why does this exist?
Some users are on frozen/legacy GPU drivers (like older Kepler/Maxwell/Pascal cards) 
that can no longer receive updates and only support older NVENC API versions. 
Standard auto-updaters or package managers will upgrade FFmpeg to newer builds 
that require newer NVIDIA drivers (e.g., FFmpeg 6.1+ requires nv-codec-headers 12.1+).
This module dynamically detects the user's NVIDIA driver version via `nvidia-smi` 
and fetches an older, compatible static FFmpeg build specifically for their environment 
if they are on an old driver. 

This behavior is completely gated behind the 'AUTO_INSTALL_FFMPEG' setting.
If disabled, the app falls back to the system FFmpeg on PATH.
"""
import os
import sys
import shutil
import subprocess
import urllib.request
import zipfile
import tarfile
from pathlib import Path

# Mapping of NVIDIA driver versions to compatible FFmpeg static builds.
# If no NVIDIA GPU, we default to 'latest'.
# Driver requirements for NVENC SDK (approximate):
# - 12.x (FFmpeg 6.1+): Win 522.25+, Linux 520.56+
# - 11.1 (FFmpeg 5.1): Win 471.41+, Linux 470.57+
# - 11.0 (FFmpeg 4.4): Win 456.71+, Linux 455.28+

URLS = {
    "win32": {
        "latest": "https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-win64-gpl.zip",
        "5.1": "https://github.com/GyanD/codexffmpeg/releases/download/5.1.2/ffmpeg-5.1.2-full_build.zip",
        "4.4": "https://github.com/GyanD/codexffmpeg/releases/download/4.4.1/ffmpeg-4.4.1-full_build.zip"
    },
    "linux": {
        "latest": "https://johnvansickle.com/ffmpeg/releases/ffmpeg-release-amd64-static.tar.xz",
        "5.1": "https://johnvansickle.com/ffmpeg/old-releases/ffmpeg-5.1.1-amd64-static.tar.xz",
        "4.4": "https://johnvansickle.com/ffmpeg/old-releases/ffmpeg-4.4.1-amd64-static.tar.xz"
    }
}

def get_vendor_dir() -> Path:
    # Resolve vendor/ffmpeg relative to the root of the app
    # __file__ is in <app>/scripts/ensure_ffmpeg.py
    return Path(__file__).resolve().parent.parent / 'vendor' / 'ffmpeg'

def get_ffmpeg_path() -> str:
    if os.environ.get('AUTO_INSTALL_FFMPEG') == '1':
        vendor_dir = get_vendor_dir()
        exe = 'ffmpeg.exe' if sys.platform == 'win32' else 'ffmpeg'
        vendor_bin = vendor_dir / exe
        if vendor_bin.exists():
            return str(vendor_bin)
    
    # Fallback to system ffmpeg
    system_path = shutil.which('ffmpeg')
    return system_path if system_path else 'ffmpeg'

def get_ffprobe_path() -> str:
    if os.environ.get('AUTO_INSTALL_FFMPEG') == '1':
        vendor_dir = get_vendor_dir()
        exe = 'ffprobe.exe' if sys.platform == 'win32' else 'ffprobe'
        vendor_bin = vendor_dir / exe
        if vendor_bin.exists():
            return str(vendor_bin)
            
    system_path = shutil.which('ffprobe')
    return system_path if system_path else 'ffprobe'

def get_nvidia_driver_version():
    try:
        # Run nvidia-smi to get the driver version
        smi = shutil.which('nvidia-smi')
        if not smi:
            return None
        out = subprocess.check_output(
            [smi, "--query-gpu=driver_version", "--format=csv,noheader,nounits"],
            stderr=subprocess.DEVNULL, text=True
        )
        # Parse the first returned version
        lines = out.strip().split('\n')
        if lines:
            return float(lines[0].split()[0])
    except Exception:
        pass
    return None

def determine_ffmpeg_version(driver_ver: float, is_win: bool) -> str:
    if driver_ver is None:
        return "latest"
    if is_win:
        if driver_ver >= 522.25: return "latest"
        if driver_ver >= 471.41: return "5.1"
        return "4.4"
    else:
        if driver_ver >= 520.56: return "latest"
        if driver_ver >= 470.57: return "5.1"
        return "4.4"

def download_and_extract(url: str, dest_dir: Path):
    dest_dir.mkdir(parents=True, exist_ok=True)
    is_zip = url.endswith('.zip')
    archive_path = dest_dir / ("ffmpeg_archive" + (".zip" if is_zip else ".tar.xz"))
    
    print(f"[setup] Downloading FFmpeg from {url}...", flush=True)
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'})
    with urllib.request.urlopen(req) as response, open(archive_path, 'wb') as out_file:
        shutil.copyfileobj(response, out_file)
        
    print(f"[setup] Extracting FFmpeg...", flush=True)
    if is_zip:
        with zipfile.ZipFile(archive_path, 'r') as zf:
            for member in zf.namelist():
                filename = Path(member).name
                if filename in ['ffmpeg.exe', 'ffprobe.exe']:
                    source = zf.open(member)
                    target_path = dest_dir / filename
                    with open(target_path, "wb") as target:
                        shutil.copyfileobj(source, target)
    else:
        with tarfile.open(archive_path, 'r:xz') as tf:
            for member in tf.getmembers():
                filename = Path(member.name).name
                if filename in ['ffmpeg', 'ffprobe']:
                    # extract
                    f = tf.extractfile(member)
                    if f:
                        target_path = dest_dir / filename
                        with open(target_path, "wb") as target:
                            shutil.copyfileobj(f, target)
                        # make executable
                        target_path.chmod(0o755)
                        
    # Clean up archive
    archive_path.unlink(missing_ok=True)
    print(f"[setup] FFmpeg vendored successfully at {dest_dir}", flush=True)

def run():
    if os.environ.get('AUTO_INSTALL_FFMPEG') != '1':
        # Silently fall back to system logic
        if not shutil.which('ffmpeg'):
            print("warning: Auto-install ffmpeg is disabled and ffmpeg was not found on PATH. Video operations may fail.", flush=True)
        return

    vendor_dir = get_vendor_dir()
    exe = 'ffmpeg.exe' if sys.platform == 'win32' else 'ffmpeg'
    if (vendor_dir / exe).exists():
        # Already vendored
        return
        
    print("[setup] Auto-install FFmpeg is enabled. Detecting environment...", flush=True)
    
    # 1. Detect OS
    os_key = "win32" if sys.platform == "win32" else "linux"
    
    # 2. Detect NVIDIA driver
    driver_ver = get_nvidia_driver_version()
    if driver_ver:
        print(f"[setup] Detected NVIDIA driver version: {driver_ver}", flush=True)
    else:
        print("[setup] No NVIDIA GPU or driver detected. Using latest build.", flush=True)
        
    # 3. Determine compatible FFmpeg build
    ver_key = determine_ffmpeg_version(driver_ver, os_key == "win32")
    url = URLS.get(os_key, {}).get(ver_key)
    
    if not url:
        print(f"[setup] Platform {sys.platform} not supported for automatic static builds.", flush=True)
        return
        
    # 4. Download and vendor
    try:
        download_and_extract(url, vendor_dir)
    except Exception as e:
        print(f"[setup] Failed to download/vendor FFmpeg: {e}", flush=True)

if __name__ == '__main__':
    run()
