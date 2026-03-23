# nyx-dlp

A modern Electron desktop app providing a clean dark/light-theme GUI for media download scripts. One interface for yt-dlp, gallery-dl, ffmpeg HLS downloads, and YouTube live stream archiving.

![Electron](https://img.shields.io/badge/Electron-28-47848F?logo=electron&logoColor=white)
![Platform](https://img.shields.io/badge/platform-Windows-blue)
![License](https://img.shields.io/badge/license-MIT-green)

---

## Features

- **5 built-in tools** — unified interface for the most common media download workflows
- **Advanced yt-dlp options** — 70+ flags across 9 categories (Network, Subtitles, Post-Processing, SponsorBlock, etc.) with live search
- **Independent advanced options** for yt-dlp Downloader and Batch Downloader
- **Form persistence** — all inputs and settings saved and restored between sessions
- **Failed download recovery** — incomplete/interrupted downloads logged to `failed_downloads.txt`
- **Output log colouring** — warnings in yellow, errors in red, interactive prompts in white
- **Dark & Light theme** — toggle from the title bar
- **Settings page** — show/hide any section per tool, cookies paths, advanced flags

## Tools

| Tab | Script | Description |
|-----|--------|-------------|
| **Live Archiver** | `ytarchive.py` | Record active YouTube live streams with ytarchive |
| **yt-dlp Downloader** | `yt-dlp.py` | Download from 1 000 + sites by URL with full yt-dlp option support |
| **Batch Downloader** | `yt-dlp_multi.py` | Paste in multiple URLs and queue them in one run |
| **M3U8 Downloader** | `Download_and_convert_a_m3u8_url.py` | Stream HLS playlists directly via ffmpeg; optional GPU/CPU re-encode; outputs to MP4, MKV, MOV, MPEG-TS or AVI |
| **gallery-dl** | `gallery-dl.py` | Bulk-download image galleries from 300+ sites |

## Requirements

The following tools must be available in your system `PATH` before running:

```bash
# yt-dlp (required for yt-dlp, Batch, and Live Archiver tabs)
winget install yt-dlp.yt-dlp
# or
pip install yt-dlp

# ffmpeg (required for M3U8 Downloader and yt-dlp post-processing)
winget install Gyan.FFmpeg

# gallery-dl (required for the gallery-dl tab)
pip install gallery-dl

# ytarchive (required for Live Archiver tab)
# Download from https://github.com/Kethsar/ytarchive/releases and add to PATH
```

> Python 3.9+ must be installed and in PATH. Pip dependencies (`yt-dlp`, `gallery-dl`, `python-slugify`) are auto-installed by each script on first run if missing.

## Installation

```bash
git clone https://github.com/jt-ito/nyx-dlp.git
cd nyx-dlp
npm install
npm start
```

## Building a distributable .exe

```bash
npm run build
```

Output is written to `dist/Script UI-win32-x64/`. The folder is self-contained — zip it and distribute. No installer is required; run `Script UI.exe` directly.

> **Note:** Python and the external tools listed above must still be installed on the target machine.

## Project Structure

```
nyx-dlp/
├── main.js          # Electron main process — IPC handlers, script spawning
├── preload.js       # Context bridge (contextIsolation: true)
├── renderer.js      # All UI logic, settings, advanced options, form persistence
├── index.html       # App shell and tab layout
├── styles.css       # Dark/light theme variables and component styles
└── scripts/
    ├── yt-dlp.py                        # Single-URL yt-dlp wrapper
    ├── yt-dlp_multi.py                  # Batch yt-dlp downloader
    ├── ytarchive.py                     # YouTube live stream recorder
    ├── Download_and_convert_a_m3u8_url.py  # HLS stream downloader/encoder
    └── gallery-dl.py                    # gallery-dl wrapper
```

## License

MIT


## Tools Included

| Tab | Description | Requires |
|-----|-------------|---------|
| **Live Archiver** | Download active YouTube live streams | yt-dlp |
| **yt-dlp** | Download from 1000+ sites (single URL) | yt-dlp |
| **Batch Download** | Download multiple URLs at once | yt-dlp |
| **M3U8 Downloader** | Download HLS streams, optionally re-encode | ffmpeg |

## Prerequisites

Install these before running:

```bash
# yt-dlp (Windows)
winget install yt-dlp.yt-dlp
# or
pip install yt-dlp

# ffmpeg (for M3U8 tool)
winget install Gyan.FFmpeg
```

## Setup & Run

```bash
# Install Node.js dependencies
npm install

# Start the app
npm start
```

## Features

- Dark / Light theme (toggle in title bar)
- Custom frameless window with native controls
- Live output terminal per tool
- Folder picker for output directories
- Batch progress bar
- M3U8 re-encoding options (codec + CRF quality slider)
