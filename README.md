# MetaMosque

Run the project via a local HTTP server (required for modules and media to work; `file://` is blocked by CORS).

## Project structure

```
MetaMosqueHTML/
├── index.html          # Entry HTML
├── main.js             # Menu, options, EXIT, flow (MetaImam → training → scene)
├── sceneRouter.js      # Scene loader (dynamic import from assets/scenes/<id>/scripts/index.js)
├── training.js         # Training scene (video playlist, NEXT SCENE)
├── styles.css          # Global + menu + training + scene styles
├── package.json
├── vite.config.js
├── README.md
│
└── assets/
    ├── bg/             # Training background image
    │   └── training_room_bg.jpg
    ├── media/          # Shared training media (by pilgrimage type)
    │   ├── shared/     # videos/, audio/
    │   ├── hajj/       # videos/, audio/
    │   └── umrah/      # videos/, audio/
    ├── ui/             # Menu tiles, options logo, social icons (no .meta files)
    │
    └── scenes/         # First-person 3D scenes (one folder per scene)
        └── umrah_haram/
            ├── config/
            │   ├── triggers.json   # Free-roam triggers (used if tawaf.json missing/empty)
            │   └── tawaf.json      # Tawaf route (ordered points; used if present)
            ├── media/              # Scene-specific video/audio
            │   ├── videos/
            │   └── audio/
            └── scripts/
                ├── index.js        # Scene entry (Three.js, controls, trigger/tawaf logic)
                ├── triggers.js     # Load triggers, bounds check
                ├── tawaf.js        # Load tawaf, bounds check
                └── media.js        # Play/stop overlay media
```

- **Scenes:** Only `assets/scenes/<sceneId>/` is used. Each scene has `scripts/index.js` with `enter(ctx)` and `exit()`.
- **Training** uses `assets/media/` and `assets/bg/`. **Scene** uses `assets/scenes/umrah_haram/media/` and config in `assets/scenes/umrah_haram/config/`.

## Run locally

1. Install [Node.js](https://nodejs.org/) if needed.
2. Install dependencies (run once; this creates `package-lock.json`):
   ```bash
   npm install
   ```
   **Important for deploy:** Commit `package-lock.json` to the repo so Vercel and GitHub Actions use the same dependency versions. Do not commit `node_modules/` (it is in `.gitignore`).
3. Start the dev server:
   ```bash
   npm run dev
   ```
4. Open the URL shown (e.g. `http://localhost:5173`) in your browser.

## Deploy (Vercel / GitHub Pages)

- **Vercel:** Connect the repo; Vercel will run `npm run build` and serve `dist/`. Base URL is `/` (set automatically). Ensure `package-lock.json` is committed so installs are reproducible.
- **GitHub Pages:** Use the GitHub Actions workflow (`.github/workflows/deploy-pages.yml`). In repo **Settings → Pages**, set **Source** to **GitHub Actions**. The site is built and deployed from `dist/` with base `/MetaMosqueHTML/`.

## Other scripts

- **Build for production:** `npm run build`
- **Preview production build:** `npm run preview`

## Config (in code)

- **Options logo:** In `main.js`, set `OPTIONS_LOGO_PATH` (e.g. `assets/ui/options_logo.webp` or `assets/ui/options_logo.png`). If the file is missing, a placeholder is shown and a console warning is logged.
- **Training background:** In `training.js`, `TRAINING_CONFIG.backgroundImage` (e.g. `assets/bg/training_room_bg.jpg`). If missing, a fallback color is used.
- **Training silhouette:** `TRAINING_CONFIG.silhouetteImage`; if missing, the silhouette area is omitted.

## Media structure

- `assets/media/shared/videos/` and `assets/media/shared/audio/` — shared step files (fallback).
- `assets/media/hajj/videos/`, `assets/media/hajj/audio/` — Hajj-specific.
- `assets/media/umrah/videos/`, `assets/media/umrah/audio/` — Umrah-specific.

Name files: `step_01.mp4`, `step_02.mp4`, … and `step_01.mp3`, `step_02.mp3`, … For each step the app tries the pilgrimage-type path first, then falls back to `shared`. Relative paths only (no absolute or drive paths).
