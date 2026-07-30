# nyx-dlp

A modern Electron desktop app providing a clean dark/light-theme GUI for media download CLIs and video utilities. One interface for yt-dlp, gallery-dl, ffmpeg HLS downloads, live stream archiving (YouTube & Twitch), Internet Archive uploads/downloads, and basic video editing (concatenating and splitting).

![Electron](https://img.shields.io/badge/Electron-28-47848F?logo=electron&logoColor=white)
![Platform](https://img.shields.io/badge/platform-Windows-blue)
![License](https://img.shields.io/badge/license-MIT-green)
![Version](https://img.shields.io/badge/version-3.0.1-orange)

---

## What's new in v3.0?
**The Python dependency is gone!** nyx-dlp has been completely rewritten from the ground up in native JavaScript. 
- **Zero-Setup Dependencies:** You no longer need to manually install Python, pip, or winget packages. The app automatically downloads and manages its own internal copies of `ffmpeg`, `yt-dlp`, `gallery-dl`, `streamlink`, and `ia` on-the-fly.
- **New Tools:** Added native integration for the Internet Archive CLI (upload/download) and Twitch live stream archiving (via Streamlink/yt-dlp) with Twitch Auth support.
- **Blazing Fast:** Replaced slow python wrapper scripts with direct `child_process` execution for much faster startup and realtime logging.

## Features

- **8 built-in tools** — unified interface for the most common media download and video manipulation workflows
- **Auto-Managed Binaries** — Automatically downloads and updates dependencies (`ffmpeg`, `yt-dlp`, `gallery-dl`, `streamlink`, `ia`) into a local `vendor/` folder
- **Advanced yt-dlp options** — 70+ flags across 9 categories (Network, Subtitles, Post-Processing, SponsorBlock, etc.) with live search
- **Twitch & YouTube DVR** — Archive live streams from the live edge or download from the beginning (VOD permitting) using Twitch Auth tokens to bypass ads
- **Form persistence** — all inputs and settings saved and restored between sessions
- **Failed download recovery** — incomplete/interrupted downloads logged to `failed_downloads.txt`
- **Output log colouring** — warnings in yellow, errors in red, interactive prompts in white
- **Dark & Light theme** — toggle from the title bar
- **Settings page** — show/hide any section per tool, cookies paths, advanced flags

## Tools

| Tab | Backend | Description |
|-----|--------|-------------|
| **Live Archiver** | `yt-dlp` / `streamlink` | Record active YouTube & Twitch live streams natively. DVR and auth-token ad bypass supported. |
| **yt-dlp Downloader** | `yt-dlp` | Download from 1 000+ sites by URL with full yt-dlp option support |
| **Batch Downloader** | `yt-dlp` | Paste in multiple URLs and queue them in one run |
| **M3U8 Downloader** | `ffmpeg` | Stream HLS playlists directly via ffmpeg; optional GPU/CPU re-encode; outputs to MP4, MKV, MOV, MPEG-TS or AVI |
| **gallery-dl** | `gallery-dl` | Bulk-download image galleries from 300+ sites |
| **Video Concatenator** | `ffmpeg` | Merge multiple videos into a single MP4 with intuitive drag-and-drop reordering |
| **Video Splitter** | `ffmpeg` | Split a video into chunks or extract specific time segments |
| **Internet Archive** | `ia` | Official archive.org CLI integration for bulk downloading or authenticating and uploading to collections |

## Installation

```bash
git clone https://github.com/jt-ito/nyx-dlp.git
cd nyx-dlp
npm install
npm start
```
*Note: Because nyx-dlp v3 auto-downloads its own CLI dependencies at runtime, your first execution of a tool might take slightly longer while it fetches the latest binary.*

## Building

```bash
# Build portable ZIP
npm run build:portable

# Build NSIS installer
npm run build:installer
```

Output is written to `dist/portable/` and `dist/installer/`.

## Architecture Overview

```
nyx-dlp/
├── main.js                  # Electron main process — IPC handlers
├── preload.js               # Context bridge (contextIsolation: true)
├── index.html               # App shell and tab layout
├── styles.css               # Dark/light theme variables and component styles
├── lib/
│   ├── runners.js           # Core execution logic for all 8 tools
│   ├── runner-utils.js      # Child process spawning and output parsing
│   └── ensure-*.js          # Auto-downloaders for vendor dependencies
└── renderer/
    ├── tools/               # UI logic separated by tool (ia.js, ytdlp.js, etc.)
    ├── settings.js          # Global settings state manager
    └── terminal.js          # Custom xterm-like log terminal implementation
```

## License

MIT
