<div align="center">

# ⚡ nyx-dlp

**One dark-mode cockpit for every download and encode job you've got.**

yt-dlp · streamlink · ffmpeg · gallery-dl · Internet Archive — nine tools, one native app, zero Python.

![Electron](https://img.shields.io/badge/Electron-28-47848F?logo=electron&logoColor=white)
![Platform](https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-blue)
![License](https://img.shields.io/badge/license-MIT-green)
![Version](https://img.shields.io/badge/version-3.0.1-orange)

</div>

---

## Why this exists

If you've ever managed a pile of media-download scripts, you know the drill: half-remembered CLI flags, a terminal window you're afraid to close, and no easy way to pause a 40GB download without killing it outright. **nyx-dlp** is the GUI layer for that — nine tools behind one consistent interface, with your settings remembered every time you open it.

It's built entirely in native Node.js — no Python involved anywhere. Every tool runs as a direct `child_process.spawn` call, and nyx-dlp manages its own vendored copies of `yt-dlp`, `ffmpeg`, `gallery-dl`, `streamlink`, and `ia` in a local `vendor/` folder, downloading and updating them on its own. Nothing to install except the app itself.

Because every job is a real OS process nyx-dlp owns directly, pause/resume/stop actually work — on Windows that's done via Sysinternals `PsSuspend`, not just severing the connection and hoping the CLI recovers gracefully.

---

## Features

- 🧰 **9 built-in tools** — one unified interface for the download, archival, and video workflows you actually use
- 🐍 **No Python, no manual dependencies** — pure Node.js execution; `yt-dlp`, `ffmpeg`, `gallery-dl`, `streamlink`, and `ia` are vendored and auto-updated for you
- ⏯️ **Real process tree pause/resume** — genuine OS-level suspension. Freezes the entire process tree (including background ffmpeg/python threads) simultaneously across Windows, macOS, and Linux, not just a UI lock
- 🎛️ **70+ yt-dlp flags** across 9 categories (Network, Subtitles, Post-Processing, SponsorBlock, and more) with live search
- 🔑 **Automated PO Tokens** — natively integrates `yt-dlp-get-pot` to bypass `web_creator` challenges without manual token passing
- 📡 **Live & VOD archiving for YouTube and Twitch** — DVR-style capture from the live edge, or from the start where the platform allows, with Twitch auth-token ad bypass
- 🗄️ **Internet Archive integration** — authenticate, upload with full metadata (title, collection, subject tags, license, mediatype), or bulk-download an identifier, with automatic retry on failed uploads
- 🎞️ **Encoder tool** — batch re-encode a queue of files to a chosen video/audio codec, independent of the concatenator/splitter
- 💾 **Form persistence** — every field and setting is saved and restored between sessions
- 🚨 **Low Storage Notifications** — warns you via native OS notifications when the active download drive drops below a customizable threshold
- 🩹 **Failed download recovery & Rate-limit protections** — interrupted downloads are logged, and Batch mode auto-injects required delays (e.g., 5s for YouTube) to prevent IP bans
- 🛠️ **Twitch VOD Auto-Repair** — seamlessly intercepts CloudFront/HLS timestamp desyncs and missing initialization fragments, automatically rebuilding corrupted Twitch VODs perfectly using native Node.js concurrency without hanging or losing audio sync
- 🎨 **Color-coded output log** — warnings in yellow, errors in red, interactive prompts in white
- 🌗 **Dark & light theme**, toggled from the title bar
- 🖥️ **System tray support** — minimize to tray instead of quitting
- 🌐 **Remote web access** — optionally host the app over HTTP/WebSocket so you can queue and monitor downloads from another device's browser, protected by username/password or PIN login
- ⌨️ **Headless CLI mode** — drive every tool from a terminal or script via `nyx-dlp-cli`, no window required
- 🖱️ **Drag-and-drop reordering** in the Video Concatenator

---

## The toolbox

**📥 Downloading**

| Tool | Engine | What it does |
|---|---|---|
| **yt-dlp Downloader** | ![yt-dlp](https://img.shields.io/badge/-yt--dlp-red?style=flat-square) | Downloads from 1,000+ sites by URL, with the full advanced-options panel — 70+ flags across Network, Subtitles, Post-Processing, SponsorBlock, and more, all live-searchable |
| **Batch Downloader** | ![yt-dlp](https://img.shields.io/badge/-yt--dlp-red?style=flat-square) | Paste in a list of URLs and work through the queue one at a time, with configurable rest intervals and the ability to append new URLs mid-run |
| **gallery-dl** | ![gallery-dl](https://img.shields.io/badge/-gallery--dl-orange?style=flat-square) | Bulk-downloads image galleries from 300+ sites in a single run |

**📡 Live capture**

| Tool | Engine | What it does |
|---|---|---|
| **Live Archiver** | ![yt-dlp](https://img.shields.io/badge/-yt--dlp%20%2F%20streamlink-red?style=flat-square) | Records active YouTube and Twitch streams. Capture from the live edge, or DVR-style from the start where the platform allows, with Twitch auth-token support to bypass ads natively |

**🎬 Video processing**

| Tool | Engine | What it does |
|---|---|---|
| **M3U8 Downloader** | ![ffmpeg](https://img.shields.io/badge/-ffmpeg-blue?style=flat-square) | Pulls HLS playlists directly, with optional GPU/CPU re-encoding to MP4, MKV, MOV, MPEG-TS, or AVI |
| **Video Concatenator** | ![ffmpeg](https://img.shields.io/badge/-ffmpeg-blue?style=flat-square) | Merges multiple clips into a single MP4, with drag-and-drop reordering |
| **Video Splitter** | ![ffmpeg](https://img.shields.io/badge/-ffmpeg-blue?style=flat-square) | Splits a video into even chunks, or extracts specific time segments |
| **Encoder** | ![ffmpeg](https://img.shields.io/badge/-ffmpeg-blue?style=flat-square) | Batch re-encodes a queue of files to a chosen video/audio codec, independent of the concatenator and splitter |

**🗄️ Archiving**

| Tool | Engine | What it does |
|---|---|---|
| **Internet Archive** | ![ia](https://img.shields.io/badge/-ia-6a5acd?style=flat-square) | Authenticates against archive.org, then uploads with full metadata (title, description, collection, subject tags, license, mediatype) with automatic retry on failure, or bulk-downloads an entire identifier |

<div align="center">

*Every tool above runs through the same execution core — `lib/runners.js` — so behavior is identical whether you're driving it from the GUI, the CLI, or a browser over remote access.*

</div>

---

## Getting started

```bash
git clone https://github.com/jt-ito/nyx-dlp.git
cd nyx-dlp
npm install
npm start
```

> First run will take a little longer — nyx-dlp fetches its vendored copies of `yt-dlp`, `ffmpeg`, and friends before the first job kicks off. After that, everything runs from the local `vendor/` folder.

### Prefer the command line?

Every tool is also reachable headlessly through the bundled CLI, useful for scripting or running on a machine with no display:

```bash
nyx-dlp-cli ytdlp <url> -o <dir> [-f format] [-c cookies] [--container mp4]
nyx-dlp-cli batch  -o <dir> [-f format] [--rest seconds] < urls.txt
nyx-dlp-cli livestream <url> -o <dir> [-f format] [--container mp4]
nyx-dlp-cli m3u8   <url> -o <dir> [--encode] [--codec h264] [--bitrate 5M]
nyx-dlp-cli gallery-dl <url> -o <dir> [--filetypes "jpg,png,gif"]
nyx-dlp-cli splitter <file> -o <dir> --parts <n>
nyx-dlp-cli concat  -o <dir> --output <name> <file1> <file2> ...
nyx-dlp-cli encoder -o <dir> [--vcodec libx264] [--acodec aac] <file1> ...
```

It runs through the exact same execution engine as the GUI (`lib/runners.js`), so behavior is identical either way.

---

## Building

```bash
# Windows
npm run build:portable     # portable ZIP
npm run build:installer    # NSIS installer

# Other platforms
npm run build:mac          # macOS .dmg (x64 + arm64)
npm run build:linux        # Linux AppImage
npm run build:linux-cli    # Headless Linux CLI build
```

Windows outputs land in `dist/portable/` and `dist/installer/`. Nothing beyond the app itself needs to be installed on the target machine — vendored dependencies download themselves on first launch.

---

## Under the hood

```
nyx-dlp/
├── main.js               # Electron main process — window, tray, IPC routing, path guards
├── preload.js             # Context bridge exposing window.api to the renderer (contextIsolation: true)
├── server.js               # Optional remote HTTP/WebSocket server for browser-based control
├── cli.js                  # Headless CLI entry point — drives the same runners as the GUI
├── index.html / styles.css # App shell and dark/light theme
├── lib/
│   ├── runners.js          # Centralized process spawning for every tool — the execution core
│   ├── runner-utils.js     # Pause/resume/kill, including native Windows process suspension via pssuspend
│   ├── ensure-ytdlp.js      # Vendors & auto-updates the standalone yt-dlp binary
│   ├── ensure-ffmpeg.js     # Vendors ffmpeg, selectable by version for older GPU/NVENC support
│   ├── ensure-ia.js         # Vendors the archive.org `ia` CLI
│   └── ensure-streamlink.js # Vendors streamlink for Twitch capture
└── renderer/
    ├── tools/               # Per-tool UI logic (ytdlp.js, batch.js, ia.js, encoder.js, etc.)
    ├── settings.js, theme.js, sync.js, persistence.js  # Shared UI subsystems
    ├── terminal.js          # Custom log terminal with output coloring
    └── remote-api.js         # Client-side glue for the remote web-access mode
```

**Design notes worth knowing if you're digging into the code:**

- The renderer never touches Node or the filesystem directly — everything goes through `window.api.*` in `preload.js`, keeping `contextIsolation` intact.
- UI state (checkboxes, inputs, settings) is mirrored into the main process via `sync-ui-state` events, so the backend always has a current snapshot without needing to ask the frontend for it.
- Remote web access reuses the exact same `ipcMain` handlers as the desktop UI — the WebSocket layer in `server.js` just fakes an IPC event object, so there's only one code path to maintain for "the app doing a thing," whether it's triggered locally or from a browser tab.

---

## License

MIT — do what you like with it.
