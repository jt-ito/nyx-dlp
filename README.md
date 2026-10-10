<div align="center">

# ⚡ nyx-dlp

**One cockpit for every download, archive and encode job you've got.**

yt-dlp · streamlink · ffmpeg · gallery-dl · Internet Archive · aria2c · Deno — nine tools, one native app, zero Python.

![Electron](https://img.shields.io/badge/Electron-28-47848F?logo=electron&logoColor=white)
![Platform](https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-blue)
![License](https://img.shields.io/badge/license-MIT-green)
![Version](https://img.shields.io/badge/version-5.0.1-orange)

<img src="docs/screenshots/01b-yt-dlp-dark.png" alt="nyx-dlp yt-dlp downloader in the OLED Obsidian theme" width="100%" />

</div>

---

## Why this exists

Juggling a pile of download scripts gets old fast. You forget the flags, you leave a terminal window open because closing it might kill something, and pausing a 40 GB download isn't really an option. **nyx-dlp** puts all of it in one app: nine tools, one interface, and your settings are still there the next time you open it.

It's built entirely in Node.js — no Python anywhere. Every tool runs as a direct `child_process.spawn` call, and nyx-dlp manages its own copies of `yt-dlp`, `ffmpeg`, `gallery-dl`, `streamlink`, `ia`, `aria2c`, `deno` and a bundled PO-token server in a local `vendor/` folder, downloading and updating them for you. Nothing to install except the app itself.

Because every job is a real OS process nyx-dlp owns, pause / resume / stop actually work. On Windows that's done with native NT process-tree suspension (`treespend`), not by severing the connection and hoping the CLI recovers.

---

## Screenshots

Light and dark themes are both built in — there are 20+ presets in **Appearance**, from OLED pitch black to soft paper tones.

<table>
  <tr>
    <td width="50%"><img src="docs/screenshots/01-yt-dlp-light.png" alt="yt-dlp downloader, light theme" /></td>
    <td width="50%"><img src="docs/screenshots/03-batch-downloader.png" alt="Batch downloader with rest intervals and queue status" /></td>
  </tr>
  <tr>
    <td align="center"><sub><b>yt-dlp</b> — Nyx Light</sub></td>
    <td align="center"><sub><b>Batch Downloader</b> — OLED Obsidian</sub></td>
  </tr>
  <tr>
    <td width="50%"><img src="docs/screenshots/02-live-archiver.png" alt="Live stream archiver capturing a broadcast" /></td>
    <td width="50%"><img src="docs/screenshots/04-m3u8-downloader.png" alt="M3U8 downloader pulling an HLS playlist" /></td>
  </tr>
  <tr>
    <td align="center"><sub><b>Live Archiver</b></sub></td>
    <td align="center"><sub><b>M3U8 Downloader</b></sub></td>
  </tr>
  <tr>
    <td width="50%"><img src="docs/screenshots/10b-internet-archive-upload.png" alt="Internet Archive uploader with concurrent and queued tabs" /></td>
    <td width="50%"><img src="docs/screenshots/10-internet-archive-queue-menu.png" alt="Internet Archive queue and concurrent upload manager" /></td>
  </tr>
  <tr>
    <td align="center"><sub><b>Internet Archive</b> — concurrent (C) and queued (Q) upload tabs</sub></td>
    <td align="center"><sub><b>Queue manager</b> — reorder, remove and stop</sub></td>
  </tr>
  <tr>
    <td width="50%"><img src="docs/screenshots/11-internet-archive-download.png" alt="Internet Archive download with aria2c progress" /></td>
    <td width="50%"><img src="docs/screenshots/13-tools-and-engines-hub-light.png" alt="Downloader Tools and Engines Hub" /></td>
  </tr>
  <tr>
    <td align="center"><sub><b>Internet Archive download</b> via aria2c</sub></td>
    <td align="center"><sub><b>Tools &amp; Engines Hub</b> — Nyx Light</sub></td>
  </tr>
</table>

<details>
<summary><b>More screenshots</b> — splitter, concatenator, encoder, gallery-dl, history</summary>
<br>

<table>
  <tr>
    <td width="50%"><img src="docs/screenshots/05-gallery-dl.png" alt="gallery-dl image downloader" /></td>
    <td width="50%"><img src="docs/screenshots/06-video-splitter.png" alt="Video splitter" /></td>
  </tr>
  <tr>
    <td align="center"><sub><b>gallery-dl</b></sub></td>
    <td align="center"><sub><b>Video Splitter</b></sub></td>
  </tr>
  <tr>
    <td width="50%"><img src="docs/screenshots/07-video-concatenator.png" alt="Video concatenator" /></td>
    <td width="50%"><img src="docs/screenshots/08-video-encoder.png" alt="GPU-accelerated video encoder" /></td>
  </tr>
  <tr>
    <td align="center"><sub><b>Video Concatenator</b></sub></td>
    <td align="center"><sub><b>Video Encoder</b></sub></td>
  </tr>
  <tr>
    <td width="50%"><img src="docs/screenshots/09-internet-archive-upload-light.png" alt="Internet Archive upload, light theme" /></td>
    <td width="50%"><img src="docs/screenshots/12-history.png" alt="Download history" /></td>
  </tr>
  <tr>
    <td align="center"><sub><b>Internet Archive upload</b> — Nyx Light</sub></td>
    <td align="center"><sub><b>History</b></sub></td>
  </tr>
</table>

</details>

---

## Features

### The tools

- 🧰 **9 built-in tools** behind one interface: yt-dlp, Batch Downloader, Live Archiver, M3U8 Downloader, gallery-dl, Video Splitter, Video Concatenator, Video Encoder and Internet Archive.
- ⏯️ **Real pause / resume / stop** on every job — OS-level process-tree suspension on Windows, `SIGSTOP`/`SIGCONT` on macOS and Linux, with instant, non-blocking tree termination.
- 🎛️ **70+ yt-dlp flags** across 9 categories (Network, Subtitles, Post-Processing, SponsorBlock and more) with live search.
- 🎯 **Per-site presets** — domain-specific rules (concurrent fragments, cookies, quality ceiling, subtitles) that apply automatically when you paste a URL, and sync with the Discord bot.

### Downloading

- 🔑 **Full-quality YouTube with cookies** — nyx-dlp bundles and manages its own bgutil PO-token server (run via Deno) so signed-in downloads aren't capped at 360p. Prefer your own server? There's a separate toggle for that. Neither needs Docker, Node or npm on your machine.
- 📚 **Batch mode** with configurable rest intervals, automatic rate-limit cooldowns, live mid-run queue editing and a status view.
- 🖼️ **gallery-dl** for image galleries and albums from 300+ sites, with multi-URL auto-expansion.
- 💾 **Save paused downloads** — pause a yt-dlp, Batch or gallery-dl job and hit **Save Paused** to park it in History (even with history switched off), then close nyx-dlp. Press **Resume** on the card later and it picks up where it stopped. A **Saved Paused** filter in History shows just those.
- 🛠️ **Twitch VOD auto-repair** — rebuilds VODs hit by CloudFront / HLS timestamp desyncs and missing init fragments.

### Live capture & streams

- 📡 **Live Archiver** — record YouTube and Twitch broadcasts from the live edge or DVR-style from the start, with drift-free A/V sync, engine selection (Auto / Streamlink / yt-dlp), Twitch low-latency, modern Twitch codecs (`h264`, `hevc`, `av1`), duration limits and SSL bypass.
- 🕵️ **Manifest sniffer & fragment rescue** — spots raw `.ts` / `.m4s` fragments and, if you opt in, uses a headless sniffer (with Netscape cookie support) to recover the master `.m3u8` and its renditions.
- 📺 **Twitch & TwitchTracker metadata** — stream title resolution, avatar previews, title-first file naming and rich FFmpeg metadata tags.
- 🔗 **M3U8 Downloader** — single or multi-URL mode, master-playlist discovery, per-stream auto-naming, GPU-accelerated remux / re-encode.

### Internet Archive

- 📑 **Browser-style upload tabs** — open several uploads at once. **Concurrent** tabs (`+`, marked **C**) start immediately and run in parallel; **queued** tabs (**New Queue Item**, marked **Q**) run one at a time in the order you pressed *Upload to IA*, each starting 30 seconds after the previous one finishes.
- 🗂️ **Queue & concurrent manager** — the ☰ menu beside the tabs lists everything: reorder waiting items, remove them, stop running uploads, and watch the countdown to the next one.
- ⚠️ **Edit-after-upload warning** — change a form after its upload started or was queued and you'll be told the change won't apply.
- 🔗 **Paste any archive.org link** into the downloader — an identifier, a `/details/…` page, a `/download/…` item, a single file, or a folder URL all work.
- 🚀 **Fast downloads with aria2c** — 16 connections per file, 4 files at once, resumable. aria2c is fetched automatically on Windows (or uses your own); switch it off in Settings to fall back to the standard `ia download`.
- 🔐 Authenticate once, upload with full metadata (title, collection, subjects, license, mediatype, "no derive"), automatic retries on failed uploads.

### Video processing

- ✂️ **Splitter** — equal parts or exact timestamp intervals, with lossless stream copy or GPU transcoding.
- 🔍 **Concatenator** — drag-and-drop ordering with sequence badges, plus a pre-flight **Check Files** analysis (codecs, resolutions, timebases, audio channels) and automatic cover-art exclusion so merges don't break.
- 🎞️ **Encoder** — batch re-encode with hardware acceleration: NVIDIA NVENC, AMD AMF, Intel QSV, Apple VideoToolbox and Linux VA-API, falling back to software only when no GPU encoder exists.

### Engines & dependencies

- ⚙️ **Downloader Tools & Engines Hub** — one dashboard for `yt-dlp`, `ffmpeg`/`ffprobe`, `gallery-dl`, `streamlink`, `ia`, `aria2c`, `deno` and the bundled bgutil server. See install status, versions and paths, check upstream releases, update everything in one click, or switch / downgrade to a specific version. FFmpeg presets cover older NVIDIA GPUs that can't use the newest NVENC SDK.
- 🧩 **Control over auto-install** — every managed tool has an auto-download toggle in **Settings → Dependencies**, so you can use your own copies instead.

### Automation & remote control

- 🤖 **Discord bot** — run the tools with slash commands (`/ytdlp`, `/batch`, `/livestream`, `/m3u8`, `/gallerydl`, `/splitter`, `/concat`, `/encoder`, `/ia`, `/progress`, `/status`, `/help`) with live progress embeds, automatic uploads (≤ 24 MB), history, heartbeat monitoring and automatic reconnection.
- 🌐 **Remote web cockpit** — host the full UI over HTTP/WebSocket with PIN / password protection, real-time cross-client sync and a themed remote file browser.
- ⌨️ **Headless CLI** — every tool is available through `nyx-dlp-cli` for scripts and servers with no display.

### Everyday polish

- 💾 **Everything is remembered** — form persistence and a unified history covering desktop, web-remote and Discord jobs.
- 🛑 **Exit confirmation** — closing the app while jobs (or queued IA uploads) are running asks first, in a themed popup.
- 🎨 **Themes** — 20+ dark and light presets (including OLED Obsidian), custom accent colors and color-coded logs.
- 📑 **Settings with instant search**, categorized into General, Tools, Presets, Integrations and Dependencies.
- 🔄 **GitHub auto-updates**, autostart, start-minimized and minimize-to-tray.
- 🚨 **Low-storage warnings** when the active drive drops below your threshold.
- 📦 **Portable mode (Windows)** — drop a `.portable`, `portable.txt` or `portable.ini` marker next to the executable and all binaries, settings and history live in a self-contained folder. macOS and Linux use the standard OS paths.

---

## The toolbox

| Tool | Powered by | What it does |
|---|---|---|
| **yt-dlp Downloader** | `yt-dlp` | Single videos and audio from 1,000+ sites with the full advanced options panel and site presets. |
| **Batch Downloader** | `yt-dlp` | Multi-URL queues with rest intervals, rate-limit cooldowns and live queue editing. |
| **Live Archiver** | `yt-dlp` · `streamlink` | Record live YouTube / Twitch streams from the live edge or from the start. |
| **M3U8 Downloader** | `yt-dlp` · `ffmpeg` | Direct HLS playlists and manifests, multi-URL mode, optional manifest rescue and GPU re-encode. |
| **gallery-dl** | `gallery-dl` | Image galleries and albums from 300+ platforms. |
| **Video Splitter** | `ffmpeg` | Equal parts or exact intervals, stream copy or GPU transcode. |
| **Video Concatenator** | `ffmpeg` | Merge clips with drag-and-drop ordering and pre-flight compatibility checks. |
| **Video Encoder** | `ffmpeg` | Batch re-encode with automatic GPU acceleration. |
| **Internet Archive** | `ia` · `aria2c` | Upload (concurrent + queued), edit metadata and download from archive.org. |

<div align="center">

*Every tool runs through the same execution core — `lib/runners.js` — so behavior is identical whether you drive it from the GUI, the Discord bot, the CLI, or a browser over remote access.*

</div>

---

## Getting started

### Download a build

Grab the installer or portable ZIP for your platform from the [Releases](https://github.com/jt-ito/nyx-dlp/releases) page. On first launch nyx-dlp fetches the tools it needs; after that everything runs from its local `vendor/` folder.

### Run from source

```bash
git clone https://github.com/jt-ito/nyx-dlp.git
cd nyx-dlp
npm install
npm start
```

### Running the tests

```bash
npm test
```

The suite covers more than syntax. In order, it runs:

| Check | What it verifies |
|---|---|
| UI integrity | HTML tag balance, required panels/buttons, and every `getElementById` reference. |
| Static analysis | ESLint bug rules (undefined variables, const reassignment…) plus `window.api` ↔ `preload.js` ↔ `main.js` IPC wiring. |
| Portable hardening | Portable-mode marker detection and vendor path rules. |
| Batch runtime | Drives the real batch loop with `spawn` stubbed (cookies path, aria2c input and log formatting). |
| Manifest rescue | Fragment detection and cookie-authenticated manifest recovery. |
| IA tabs | Headless-renderer run of the upload tabs, queue order, queue menu, link parsing and exit-confirm popup. |
| Save paused | Pause → Save Paused → History filter → Resume, end to end in the headless renderer, plus the real app's history rules (saved even with history off, kept through retention and Clear History). |
| Exit confirmation | Launches the real app, fakes a running job and exercises the close flow end to end. |

---

## Prefer the command line?

Every tool is also reachable headlessly through the bundled CLI — useful for scripting or machines with no display:

```bash
# Downloads
nyx-dlp-cli ytdlp <url> -o <dir> [-f format] [-c cookies] [--container mp4] [--start-time 00:01:00] [--end-time 00:02:30]
nyx-dlp-cli batch  -o <dir> [-f format] [--rest seconds] < urls.txt
nyx-dlp-cli livestream <url> -o <dir> [-f format] [--container mp4]
nyx-dlp-cli m3u8   <url> -o <dir> [--encode] [--codec h264] [--bitrate 5M]
nyx-dlp-cli gallery-dl <url> -o <dir> [--filetypes "jpg,png,gif"]

# Video processing & diagnostics
nyx-dlp-cli splitter <file> -o <dir> --parts <n>
nyx-dlp-cli concat  -o <dir> --output <name> [--check] <file1> <file2> ...
nyx-dlp-cli encoder -o <dir> [--vcodec libx264] [--acodec aac] <file1> ...
nyx-dlp-cli encoders   # list available GPU hardware encoders

# Internet Archive
nyx-dlp-cli ia upload --id <id> [options] <files/folders...>
nyx-dlp-cli ia download <id> -o <dir>
nyx-dlp-cli ia edit --id <id> [options]
nyx-dlp-cli ia config [--check | --login | --unlink]

# Remote web cockpit & configuration
nyx-dlp-cli server --port 3050 --user admin --pass secret
nyx-dlp-cli config     # view or edit persistent CLI configuration
```

Run `nyx-dlp-cli <tool> --help` for every option.

---

## Building

```bash
# Windows
npm run build:portable     # portable ZIP
npm run build:installer    # NSIS installer

# Other platforms
npm run build:mac          # macOS .dmg (x64 + arm64)
npm run build:linux        # Linux AppImage
npm run build:linux-cli    # headless Linux CLI tarball
```

Windows outputs land in `dist/portable/` and `dist/installer/`. Nothing beyond the app itself needs to be installed on the target machine — managed tools download themselves on first launch.

> [!NOTE]
> **Antivirus & Microsoft Defender notice**
> Because nyx-dlp downloads and updates standalone CLI tools (`yt-dlp`, `ffmpeg`, `gallery-dl`, `streamlink`, `ia`, `aria2c`, `deno`) at runtime when auto-install is enabled, Windows Defender or SmartScreen may occasionally raise a false positive. Downloads come straight from the official upstream releases, and every auto-install can be turned off in **Settings → Dependencies**.

---

## Under the hood

```
nyx-dlp/
├── main.js                 # Electron main process — window, tray, auto-updates, exit guard, IPC routing
├── preload.js              # Context bridge exposing window.api to the renderer
├── server.js               # Remote HTTP/WebSocket server for browser-based control
├── cli.js                  # Headless CLI entry point — drives the same runners
├── index.html / styles.css # App shell, theme gallery and UI subsystems
├── docs/screenshots/       # Images used in this README
├── test/                   # UI integrity, static analysis, portable hardening, runtime and end-to-end tests
├── lib/
│   ├── runners.js          # Centralized process spawning for every tool — the execution core
│   ├── runner-utils.js     # OS-level pause / resume / kill across Windows, macOS and Linux
│   ├── treespend.cs        # Native NT process-tree suspension (NtSuspendProcess)
│   ├── tool-hub.js         # Engines Hub: versions, upstream checks, install / switch
│   ├── ensure-*.js         # Managed tools: yt-dlp, ffmpeg, gallery-dl, streamlink, ia, aria2c, deno,
│   │                       #   treespend, and the bgutil plugin + PO-token server
│   ├── vendor-dir.js       # Permission-safe vendor path resolver (installed vs portable)
│   ├── download-helper.js  # Resilient download helper with curl fallback
│   ├── manifest-sniffer.js # Headless network sniffing & fragment rescue
│   ├── m3u8-resolver.js    # Master playlist discovery & variant probing
│   ├── cookie-utils.js     # Netscape-to-Electron session cookie translator
│   ├── site-presets.js     # Per-site download presets & Discord defaults
│   ├── twitch-meta.js / kick-meta.js  # Twitch & Kick metadata resolution and FFmpeg tag builders
│   ├── discord-bot.js      # Zero-dependency Discord gateway & REST client with slash commands
│   └── settings-store.js   # Centralized JSON configuration store
└── renderer/
    ├── tools/              # Per-tool UI logic (ytdlp, batch, livestream, m3u8, ia, tool-hub, …)
    ├── settings.js, theme.js, sync.js, persistence.js  # Settings and UI state subsystems
    ├── history.js          # Download history with dirty-state caching
    ├── terminal.js         # Log terminal with output coloring, in-place progress and stream parsing
    ├── status.js           # Status bar and the exit-confirmation popup
    ├── fragment-rescue.js  # Manifest rescue modal & resolution badges
    ├── file-browser.js     # Themed remote host file browser
    └── remote-api.js       # Client glue for remote web-access mode
```

---

<details>
<summary><b>🐧 Headless Linux server: install &amp; systemd setup</b></summary>
<br>

### 1. Global installation

Download, extract and link the CLI globally on your headless machine:

```bash
# Download and extract the latest CLI release into /opt/nyx-dlp
sudo mkdir -p /opt/nyx-dlp
curl -fsSL $(curl -s https://api.github.com/repos/jt-ito/nyx-dlp/releases/latest | grep -o 'https://github.com/jt-ito/nyx-dlp/releases/download/[^"]*linux-cli.tar.gz' | head -n 1) | sudo tar -xz -C /opt/nyx-dlp --strip-components=1

# Symlink the executable to /usr/local/bin
sudo ln -sf /opt/nyx-dlp/nyx-dlp-cli /usr/local/bin/nyx-dlp-cli
sudo chmod +x /opt/nyx-dlp/nyx-dlp-cli

# Verify installation
nyx-dlp-cli --help
```

### 2. Run as a 24/7 background service (`systemd`)

To keep the web cockpit and Discord bot running across reboots (replace `youruser` with the account that should own it):

```bash
# Create the systemd service file
sudo tee /etc/systemd/system/nyx-dlp.service > /dev/null << 'EOF'
[Unit]
Description=nyx-dlp Headless Web & Media Server
After=network.target

[Service]
Type=simple
User=youruser
WorkingDirectory=/opt/nyx-dlp
ExecStart=/usr/local/bin/nyx-dlp-cli server --port 3050
Restart=always
RestartSec=5
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
EOF

# Reload systemd and enable the service
sudo systemctl daemon-reload
sudo systemctl enable --now nyx-dlp

# Check service status
sudo systemctl status nyx-dlp
```

</details>

---

## Feedback & issues

Have a question, hit a bug, or want to suggest an improvement? Open an [Issue](https://github.com/jt-ito/nyx-dlp/issues) or start a discussion on GitHub.

---

## License

MIT — do what you like with it.
