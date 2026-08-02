# nyx-dlp Architecture & Context

## Tech Stack
- **Framework**: Electron (Node.js backend, Chromium frontend)
- **Frontend**: Vanilla HTML/CSS/JS (no framework). Modular ES-style scripts located in `renderer/`.
- **Backend**: Node.js (`main.js` and `lib/`).
- **Core Electron**: `electron`, `electron-builder`
- **Vendored Dependencies**: Uses standalone binaries managed by ensure-*.js scripts.
- `main.js`: Electron main process entry point. Handles window creation and IPC routing.
- `preload.js`: Context bridge exposing `window.api` to the renderer.
- `lib/`: Node.js backend modules.
  - `runners.js`: Centralized process spawning for yt-dlp, ffmpeg, and gallery-dl.
  - `ensure-ffmpeg.js`: Logic to auto-download and vendor FFmpeg based on NVIDIA driver version for legacy GPU support.
  - `ensure-ytdlp.js`: Logic to auto-download and update the standalone yt-dlp binary.
  - `runner-utils.js`: Shared utilities for process control (pause/resume/kill).
- `renderer/`: Frontend modular scripts.
  - `tools/`: Individual UI logic for each tool (ytdlp, batch, livestream, m3u8, etc.)
  - `settings.js`, `theme.js`, `sync.js`, etc.: UI subsystems.
- `vendor/`: Directory where downloaded standalone binaries (yt-dlp, ffmpeg, gallery-dl) are stored.

## Key Design Patterns
1. **No Python**: All script execution is done directly via Node.js `child_process.spawn`. We manage `yt-dlp` and `ffmpeg` standalone binaries natively.
2. **Process Management**: Windows process suspension is handled cleanly via Sysinternals `PsSuspend`, while macOS/Linux rely on standard `SIGSTOP`/`SIGCONT`.
3. **Vendoring**: FFmpeg version is selectable by the user to support older GPUs (like Kepler) that cannot use the latest NVENC SDK.
4. **IPC**: The renderer communicates with the main process exclusively via `window.api.*` defined in `preload.js`.
5. **State Sync**: UI Settings (checkboxes, inputs) are mirrored to the main process via `sync-ui-state` events so the backend can read settings directly without querying the frontend.

## Common Tasks
- **Adding a new Setting**:
  1. Add the UI element in `index.html`.
  2. Map it in `renderer/settings.js` if it affects visibility.
  3. Let `persistence.js` handle saving/loading, which automatically broadcasts to `main.js` via `sync.js`.
- **Modifying Runner Logic**: Edit `lib/runners.js`.
