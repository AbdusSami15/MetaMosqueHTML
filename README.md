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

## Base path (static hosts)

All asset paths use a single source of truth in `src/basePath.js` (`getBasePath()`, `join()`, `resolveUrl()`). The app works at:

- **Root:** `http://127.0.0.1:5500/`, Vercel/Netlify root domain.
- **Subfolder (e.g. GitHub Pages):** `https://user.github.io/MetaMosqueHTML/`.

**GitHub Pages base:** The app auto-detects base from `document.location.pathname`. To force a subpath (e.g. if your repo name differs), set `window.__BASE_PATH__` before any script runs. In `index.html` you can add before the first script:

```html
<script>window.__BASE_PATH__ = "/YourRepoName/";</script>
```

Or serve a small loader that sets it from a query/param. Without this, the inline script in `<head>` sets base from the current pathname (works when the site is opened at `.../MetaMosqueHTML/` or `.../MetaMosqueHTML/index.html`).

## Deploy checklist

### GitHub Pages (built site)

1. In repo **Settings → Pages**, set **Source** to **GitHub Actions**.
2. Push to `main`; the workflow (`.github/workflows/deploy-pages.yml`) runs `npm install`, `npm run build`, and deploys **`dist/`**.
3. Site URL: `https://<user>.github.io/MetaMosqueHTML/` (or your repo name).
4. **Verify:** Open DevTools → Network; reload; confirm `assets/...` and scene JSON/GLB return 200.

### Vercel

1. Import the repo; leave **Build Command** = `npm run build`, **Output Directory** = `dist`.
2. Deploy. Site is at root (e.g. `https://project.vercel.app`).
3. **Verify:** Network tab — all `assets/`, `.json`, `.glb`, `.mp4` load with 200.

### Netlify

1. **With build:** Build command = `npm run build`, Publish directory = `dist`.
2. **Static (no build):** Build command empty, Publish directory = `.` (root). Ensure `netlify.toml` redirects are applied (SPA fallback to `index.html`).
3. **Verify:** Same as above; deep links or refresh on a path should show the app (rewrite to `index.html`).

### Large binaries (Git LFS)

If any `.mp4`, `.glb`, `.gltf`, or `.bin` is >50MB, use Git LFS:

```bash
git lfs install
git lfs track "*.mp4" "*.glb" "*.gltf" "*.bin"
git add .gitattributes
git add --renormalize .
git commit -m "Track large assets with LFS"
```

Then push. On CI (e.g. GitHub Actions), LFS is pulled automatically.

## Other scripts

- **Dev (Vite):** `npm run dev` — hot reload at `http://localhost:5173`.
- **Dev (static):** `npm run dev:static` — serves repo root at `http://127.0.0.1:5500` (no build).
- **Build for production:** `npm run build` → outputs to `dist/`.
- **Preview production build:** `npm run preview`.
- **Deploy to GitHub Pages (manual):** `npm run deploy` — pushes `dist/` to `gh-pages` branch (optional; CI can do this instead).

## Config (in code)

- **Options logo:** In `main.js`, set `OPTIONS_LOGO_PATH` (e.g. `assets/ui/options_logo.webp` or `assets/ui/options_logo.png`). If the file is missing, a placeholder is shown and a console warning is logged.
- **Training background:** In `training.js`, `TRAINING_CONFIG.backgroundImage` (e.g. `assets/bg/training_room_bg.jpg`). If missing, a fallback color is used.
- **Training silhouette:** `TRAINING_CONFIG.silhouetteImage`; if missing, the silhouette area is omitted.

## Media structure

- `assets/media/shared/videos/` and `assets/media/shared/audio/` — shared step files (fallback).
- `assets/media/hajj/videos/`, `assets/media/hajj/audio/` — Hajj-specific.
- `assets/media/umrah/videos/`, `assets/media/umrah/audio/` — Umrah-specific.

Name files: `step_01.mp4`, `step_02.mp4`, … and `step_01.mp3`, `step_02.mp3`, … For each step the app tries the pilgrimage-type path first, then falls back to `shared`. Relative paths only (no absolute or drive paths).

## MIME / static files

All assets are static; no server code. `.glb`, `.mp4`, `.json`, and images are referenced with correct extensions. Static hosts (Vercel, Netlify, GitHub Pages) serve them with standard MIME types. The app uses `src/basePath.js` so paths work from any base URL.
