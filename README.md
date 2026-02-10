# MetaMosque

Run the project via a local HTTP server (required for modules and media to work; `file://` is blocked by CORS).

## Run locally

1. Install [Node.js](https://nodejs.org/) if needed.
2. Install dependencies:
   ```bash
   npm install
   ```
3. Start the dev server:
   ```bash
   npm run dev
   ```
4. Open the URL shown (e.g. `http://localhost:5173`) in your browser.

## Other scripts

- **Build for production:** `npm run build`
- **Preview production build:** `npm run preview`

## Config (in code)

- **Options logo:** In `main.js`, set `OPTIONS_LOGO_PATH` (e.g. `assets/ui/options_logo.webp` or `assets/ui/options_logo.png`). If the file is missing, a placeholder is shown and a console warning is logged.
- **Training background:** In `training.js`, `TRAINING_CONFIG.bgImage` (e.g. `assets/bg/training_room_bg.jpg`). If missing, a fallback color is used.
- **Training silhouette:** `TRAINING_CONFIG.silhouetteImage`; if missing, the silhouette area is omitted.

## Media structure

- `assets/media/shared/videos/` and `assets/media/shared/audio/` — shared step files (fallback).
- `assets/media/hajj/videos/`, `assets/media/hajj/audio/` — Hajj-specific.
- `assets/media/umrah/videos/`, `assets/media/umrah/audio/` — Umrah-specific.

Name files: `step_01.mp4`, `step_02.mp4`, … and `step_01.mp3`, `step_02.mp3`, … For each step the app tries the pilgrimage-type path first, then falls back to `shared`. Relative paths only (no absolute or drive paths).
