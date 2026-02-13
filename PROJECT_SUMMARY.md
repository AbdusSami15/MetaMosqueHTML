# MetaMosque — Project Summary & Progress

Generated: 2026-02-13

## Project Snapshot
- Name: MetaMosque
- Repo dir: `MetaMosqueHTML` (project root)
- Purpose: Educational virtual walkthrough that provides training and first-person 3D scenes (Hajj / Umrah guidance + mosque sightseeing).
- Entry: `index.html`
- Main code entry points: `main.js`, `sceneRouter.js`, `training.js`, `trainingCharacter3d.js`

## Status / Progress
- Analysis: Completed — configs, scripts, and asset layout reviewed.
- Summary file: `PROJECT_SUMMARY.md` created (this file).
- `project-plan.json` was generated previously (can be removed if not needed).
- Next suggested actions (pick any): commit the summary, run `npm install && npm run build`, or scaffold CI deploy workflows.

## Top-level files (important)
- `index.html` — app shell; sets `window.__BASE_PATH__` and an importmap for `three`.
- `main.js` — menu, flow orchestration (MetaImam → training → scenes).
- `sceneRouter.js` — dynamic scene loader (imports `assets/scenes/<id>/scripts/index.js`).
- `training.js` — training scene (video playlist controls, NEXT scene behavior).
- `trainingCharacter3d.js` — canvas-based character drawing for training.
- `styles.css` — global + menu + training + scene styles.
- `vite.config.js` — Vite config; sets base behavior (auto-detect for Vercel/root or ` /MetaMosqueHTML/` for production non-Vercel), dev server port `5173`, `outDir: dist`.
- `package.json` — scripts and dependencies.
- `netlify.toml`, `vercel.json` — deployment helper configs.

## `package.json` (key scripts & deps)
- Scripts:
  - `dev` — `vite` (dev server, HMR)
  - `dev:static` — `serve . -p 5500` (static server)
  - `build` — `vite build`
  - `preview` — `vite preview`
  - `deploy` — `npx gh-pages -d dist`
- Dependencies:
  - `three` ^0.160.0
- Dev dependencies:
  - `vite`, `serve`

## Directory layout (important directories)
- `assets/`
  - `bg/` — training background images (e.g. `training_room_bg.jpg`).
  - `media/`
    - `shared/` — fallback `videos/`, `audio/` used by training.
    - `hajj/`, `umrah/` — pilgrimage-specific media.
  - `ui/` — menu tiles, icons, logos (static images).
  - `scenes/` — per-scene directories (see Scenes section).
- `src/` — contains `basePath.js` (utility to resolve base path / join / resolveUrl).

## Scenes (contract & discovered scenes)
Contract/expectation:
- Each scene is under `assets/scenes/<sceneId>/` with:
  - `config/` — JSON data (e.g. `tawaf.json`, `triggers.json`, `scene.config.json`, `points.json`)
  - `media/` — scene-specific `audio/`, `videos/`, models
  - `scripts/` — JS modules controlling the scene
- Each scene's `scripts/index.js` should export `enter(ctx)` and `exit()`.

Discovered scenes:
- `safa_marwah`
  - Path: `assets/scenes/safa_marwah/`
  - Subdirs: `config/`, `media/`, `scripts/`
  - Expected files: `config/points.json`, `config/scene.config.json`, `scripts/index.js`, `scripts/media.js`, `scripts/points.js`
- `umrah_haram`
  - Path: `assets/scenes/umrah_haram/`
  - Subdirs: `config/`, `media/`, `scripts/`
  - Expected files: `config/haram_dua.json`, `config/scene.config.json`, `config/tawaf.json`, `config/triggers.json`, `scripts/index.js`, `scripts/media.js`, `scripts/tawaf.js`, `scripts/triggers.js`

## Base path handling
- `index.html` sets `window.__BASE_PATH__` automatically from `document.location.pathname`. You can override by injecting a script before other scripts:

```html
<script>window.__BASE_PATH__ = "/YourRepoName/";</script>
```

- `src/basePath.js` provides `getBasePath()`, `join()`, `resolveUrl()` helpers; use these for constructing asset URLs so the app works from root or subpath.

## Media & naming conventions
- Training and step media naming convention: `step_01.mp4`, `step_01.mp3`, `step_02.mp4`, etc.
- Lookup order for a step media: pilgrimage-specific folder (`assets/media/umrah/` or `assets/media/hajj/`) then fallback to `assets/media/shared/`.
- Large binary assets (`.mp4`, `.glb`, `.gltf`, `.bin`) over ~50MB should use Git LFS. Example tracking:

```bash
git lfs install
git lfs track "*.mp4" "*.glb" "*.gltf" "*.bin"
git add .gitattributes
git commit -m "Track large assets with LFS"
```

## Deployment notes
- GitHub Pages: build `dist/`, deploy via GitHub Actions or `npm run deploy` (gh-pages). Ensure `package-lock.json` is committed for reproducible installs.
- Vercel: Build command `npm run build`, output `dist`.
- Netlify: Build `npm run build`, publish `dist`. Optionally serve root without build by setting publish directory to `.` and leaving build command empty; ensure `netlify.toml` rewrites to `index.html` for SPA fallback.
- Verify deploys by checking browser DevTools Network tab: all `assets/`, `.json`, `.glb`, `.mp4` should return 200.

## How to run locally
1. Install Node.js (LTS recommended).
2. From project root run:

```bash
npm install
npm run dev
```

3. Or use the static server for quick checks:

```bash
npm run dev:static
# then open http://127.0.0.1:5500
```

4. Build for production:

```bash
npm run build
npm run preview
```

## CI / Automation suggestions
- Add a GitHub Actions workflow to `build` and `deploy` to GitHub Pages or push to a deploy target.
- Ensure `package-lock.json` is present in the repo for deterministic installs.
- For very large assets, include `git lfs` setup in onboarding docs.

## Known assumptions and decisions made during analysis
- The app uses static files only — no server logic beyond hosting static assets.
- `three` is provided both via `package.json` and an importmap in `index.html` from `unpkg`. Either approach works; align to one strategy per deployment for consistent caching.
- Scenes follow a strict export contract (`enter`, `exit`) and are dynamically imported by `sceneRouter.js`.

## Next recommended tasks (pick any)
- Commit `PROJECT_SUMMARY.md` and optionally remove or keep `project-plan.json`.
- Run `npm install && npm run build` to validate production build locally.
- Add a CI workflow for automated builds + deploy (GitHub Actions / Vercel / Netlify config).
- Review scene configs and test each scene in dev to confirm `enter`/`exit` behavior.

## Contact / Notes
- If you want, I can: create a CI workflow, run a local build and report errors, or convert this summary into `README.md` (replace or augment existing `README.md`).
