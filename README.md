<div align="center">

# ⚡ nyx-dlp

**One dark-mode cockpit for every download and encode job you've got.**

yt-dlp · streamlink · ffmpeg · gallery-dl · Internet Archive — nine tools, one native app, zero Python.

![Electron](https://img.shields.io/badge/Electron-28-47848F?logo=electron&logoColor=white)
![Platform](https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-blue)
![License](https://img.shields.io/badge/license-MIT-green)
![Version](https://img.shields.io/badge/version-3.0.11-orange)

</div>

---

## Why this exists

If you've ever managed a pile of media-download scripts, you know the drill: half-remembered CLI flags, a terminal window you're afraid to close, and no easy way to pause a 40GB download without killing it outright. **nyx-dlp** is the GUI layer for that — nine tools behind one consistent interface, with your settings remembered every time you open it.

It's built entirely in native Node.js — no Python involved anywhere. Every tool runs as a direct `child_process.spawn` call, and nyx-dlp manages its own vendored copies of `yt-dlp`, `ffmpeg`, `gallery-dl`, `streamlink`, and `ia` in a local `vendor/` folder, downloading and updating them on its own. Nothing to install except the app itself.

Because every job is a real OS process nyx-dlp owns directly, pause/resume/stop actually work — on Windows that's done via Sysinternals `PsSuspend`, not just severing the connection and hoping the CLI recovers gracefully.

---

## Features

- 🧰 **9 built-in tools** — one unified interface for the download, archival, and video workflows you actually use
- 🤖 **Discord Bot Integration** — run all 10 tools via Discord slash commands (`/ytdlp`, `/batch`, `/livestream`, `/m3u8`, `/gallerydl`, `/splitter`, `/concat`, `/encoder`, `/ia`, `/status`, `/help`) with live progress embeds and automatic file uploads (≤ 24MB)
- 🐍 **No Python, no manual dependencies** — pure Node.js execution; `yt-dlp`, `ffmpeg`, `gallery-dl`, `streamlink`, and `ia` are vendored and auto-updated for you
- ⏯️ **Real process tree pause/resume** — genuine OS-level suspension. Freezes the entire process tree (including background ffmpeg/python threads) simultaneously across Windows, macOS, and Linux, not just a UI lock
- 🎛️ **70+ yt-dlp flags** across 9 categories (Network, Subtitles, Post-Processing, SponsorBlock, and more) with live search
- 🔑 **Automated PO Tokens** — natively integrates `yt-dlp-get-pot` to bypass `web_creator` challenges without manual token passing
- 📡 **Live & VOD archiving for YouTube and Twitch** — DVR-style capture from the live edge, or from the start where the platform allows, with Twitch auth-token ad bypass
- 🗄️ **Internet Archive integration** — authenticate, upload with full metadata (title, collection, subject tags, license, mediatype), or bulk-download an identifier, with automatic retry on failed uploads
- 🎞️ **Encoder tool & Smart-Cut Clipping** — batch re-encode queues to chosen video/audio codecs with hardware GPU acceleration (NVENC, AMF, QSV) and exact start/end time trimming
- 💾 **Form persistence & Download History** — every field is remembered; history captures resolved download titles and provides a smooth hover-to-shrink delete action
- 🔄 **GitHub Auto-Updates** — checks for latest releases on startup or via one-click manual check in Settings
- 🚀 **Autostart & Startup Options** — configure launch on startup (Windows, macOS, Linux), start minimized, or minimize to system tray
- 🚨 **Low Storage Notifications** — warns you via native OS notifications when the active download drive drops below a customizable threshold
- 🩹 **Failed download recovery & Rate-limit protections** — interrupted downloads are logged, and Batch mode auto-injects required delays (e.g., 5s for YouTube) to prevent IP bans
- 🛠️ **Twitch VOD Auto-Repair** — seamlessly intercepts CloudFront/HLS timestamp desyncs and missing initialization fragments, automatically rebuilding corrupted Twitch VODs perfectly
- 🎨 **Color-coded output log** — warnings in yellow, errors in red, interactive prompts in white
- 🌗 **Dark & light theme**, toggled from the title bar
- 🖥️ **System tray support** — minimize to tray instead of quitting
- 🌐 **Remote web access & Headless Server** — host the web cockpit over HTTP/WebSocket (`nyx-dlp-cli server`) with PIN/password protection and LAN network discovery
- ⌨️ **Headless CLI mode** — drive every tool from a terminal or server script via `nyx-dlp-cli`, no window or GUI required
- 🖱️ **Drag-and-drop reordering** in the Video Concatenator

---

## The toolbox

### 📥 Media Downloading
- **yt-dlp Downloader** `yt-dlp`  
  Single-video and audio downloads from 1,000+ sites with the full advanced options panel — 70+ flags across Network, Subtitles, Post-Processing, SponsorBlock, and more.
- **Batch Downloader** `yt-dlp`  
  Process multi-URL queues with customizable rest intervals, automatic rate-limit cooldowns, and live mid-run queue appending.
- **gallery-dl** `gallery-dl`  
  Bulk-download high-resolution image galleries and albums from 300+ platforms in one click.

### 📡 Live Capture & Streams
- **Live Archiver** `yt-dlp` · `streamlink`  
  Record live YouTube and Twitch broadcasts from the live edge or DVR-style from the start, with native Twitch auth token ad-bypass.
- **M3U8 Downloader** `ffmpeg`  
  Pull direct HLS playlists and streaming manifests with optional GPU-accelerated remuxing or re-encoding.

### 🎬 Video Processing & Editing
- **Video Splitter** `ffmpeg`  
  Split media into equal chunk counts or extract exact timestamp intervals with zero-loss stream copy or GPU transcoding.
- **Video Concatenator** `ffmpeg`  
  Merge multiple video and audio clips into a single file with interactive drag-and-drop reordering.
- **Video Encoder** `ffmpeg`  
  Batch re-encode video queues with automatic hardware GPU acceleration (NVIDIA NVENC, AMD AMF, Intel QSV).

### 🗄️ Archival & Integrations
- **Internet Archive** `ia`  
  Authenticate against archive.org to bulk-download items or upload media with full metadata (title, collection, license, mediatype).
- **Discord Bot** `node`  
  Full remote control of all tools via interactive Discord slash commands with live progress embeds and direct file uploads.

<div align="center">

*Every tool above runs through the same execution core — `lib/runners.js` — so behavior is identical whether you're driving it from the GUI, Discord Bot, CLI, or a browser over remote access.*

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
# Downloads
nyx-dlp-cli ytdlp <url> -o <dir> [-f format] [-c cookies] [--container mp4] [--start-time 00:01:00] [--end-time 00:02:30]
nyx-dlp-cli batch  -o <dir> [-f format] [--rest seconds] < urls.txt
nyx-dlp-cli livestream <url> -o <dir> [-f format] [--container mp4]
nyx-dlp-cli m3u8   <url> -o <dir> [--encode] [--codec h264] [--bitrate 5M]
nyx-dlp-cli gallery-dl <url> -o <dir> [--filetypes "jpg,png,gif"]

# Video Processing & Diagnostics
nyx-dlp-cli splitter <file> -o <dir> --parts <n>
nyx-dlp-cli concat  -o <dir> --output <name> <file1> <file2> ...
nyx-dlp-cli encoder -o <dir> [--vcodec libx264] [--acodec aac] <file1> ...
nyx-dlp-cli encoders # Test and list available GPU hardware encoders

# Remote Web Cockpit
nyx-dlp-cli server --port 3000 --user admin --pass secret
```

---

## Building

```bash
# Windows
npm run build:portable     # portable ZIP
npm run build:installer    # NSIS installer

# Other platforms
npm run build:mac          # macOS .dmg (x64 + arm64)
npm run build:linux        # Linux AppImage
npm run build:linux-cli    # Headless Linux CLI tarball
```

Windows outputs land in `dist/portable/` and `dist/installer/`. Nothing beyond the app itself needs to be installed on the target machine — vendored dependencies download themselves on first launch.

> [!NOTE]
> **Antivirus & Microsoft Defender Notice**:
> Because nyx-dlp automatically downloads and updates standalone CLI tools (such as `yt-dlp`, `ffmpeg`, `gallery-dl`, `streamlink`, and `ia`) directly when enabled, Windows Defender or SmartScreen may occasionally trigger a false positive due to the nature of runtime binary fetching. All downloads are fetched directly and securely from official verified upstream releases.

---

## Under the hood

```
nyx-dlp/
├── main.js               # Electron main process — window, tray, auto-updates, IPC routing
├── preload.js             # Context bridge exposing window.api to renderer
├── server.js               # Remote HTTP/WebSocket server for browser-based control
├── cli.js                  # Headless CLI entry point — drives the exact same runners
├── index.html / styles.css # App shell, dark/light theme, and UI subsystems
├── lib/
│   ├── runners.js          # Centralized process spawning for every tool — execution core
│   ├── discord-bot.js      # Zero-dependency Discord Gateway & REST client with slash commands
│   ├── runner-utils.js     # OS-level pause/resume/kill across Win/macOS/Linux
│   ├── ensure-ytdlp.js      # Vendors & auto-updates standalone yt-dlp binary
│   ├── ensure-ffmpeg.js     # Vendors ffmpeg, selectable by version for GPU support
│   ├── ensure-ia.js         # Vendors the archive.org `ia` CLI
│   └── ensure-streamlink.js # Vendors streamlink for live capture
└── renderer/
    ├── tools/               # Per-tool UI logic (ytdlp.js, batch.js, ia.js, encoder.js, etc.)
    ├── settings.js, theme.js, sync.js, persistence.js  # Shared UI subsystems
    ├── history.js           # Download history manager with hover-to-shrink delete
    ├── terminal.js          # Custom log terminal with output coloring & stream parsing
    └── remote-api.js         # Client-side glue for remote web-access mode
```

---

<details>
<summary><b>🐧 Quick Install on Headless Linux Server (CLI)</b></summary>
<br>

Run the following commands on your headless Linux machine to download, extract, and link the CLI executable globally:

```bash
# 1. Download and extract the latest CLI release directly into /opt/nyx-dlp
sudo mkdir -p /opt/nyx-dlp
curl -fsSL $(curl -s https://api.github.com/repos/jt-ito/nyx-dlp/releases/latest | grep -o 'https://github.com/jt-ito/nyx-dlp/releases/download/[^"]*linux-cli.tar.gz' | head -n 1) | sudo tar -xz -C /opt/nyx-dlp --strip-components=1

# 2. Symlink the executable to /usr/local/bin so you can run it from anywhere
sudo ln -sf /opt/nyx-dlp/nyx-dlp-cli /usr/local/bin/nyx-dlp-cli
sudo chmod +x /opt/nyx-dlp/nyx-dlp-cli

# 3. Verify installation
nyx-dlp-cli --help
```

</details>

---

## Feedback & Issues

Have a question, encountered a bug, or have ideas for new features and improvements? Feel free to open an [Issue](https://github.com/jt-ito/nyx-dlp/issues) or start a discussion on GitHub!

---

## License

MIT — do what you like with it.


