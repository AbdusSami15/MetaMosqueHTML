Testing & Deploying MetaMosque locally and on common hosts

This document explains how to run the project locally and deploy/test on GitHub Pages, Vercel, and Netlify without changing existing logic.

Local (dev)
- Install dependencies:

```bash
npm install
```

- Run Vite dev server (HMR):

```bash
npm run dev
# open the URL printed by Vite (e.g. http://localhost:5173)
```

- Run static server (serve root):

```bash
npm run dev:static
# open http://127.0.0.1:5500
```

Production build (locally):

```bash
npm run build
npm run preview
# preview runs a local server to serve /dist
```

Platform-specific notes

- GitHub Pages
  - Workflow added at `.github/workflows/deploy-pages.yml` — pushes `dist/` to `gh-pages` on `main`.
  - Ensure `package-lock.json` is committed for reproducible builds.
  - If your repo will be hosted under a subpath (e.g. `https://user.github.io/RepoName/`), set `window.__BASE_PATH__` before other scripts in `index.html`:

```html
<script>window.__BASE_PATH__ = "/RepoName/";</script>
```

- Vercel
  - `vercel.json` is present. Import the repo in Vercel and use build command `npm run build` and output directory `dist`.

- Netlify
  - `netlify.toml` is present. Use build command `npm run build`, publish `dist`.
  - Alternatively, to serve the repo root without a build (static mode), set Publish directory = `.` in Netlify site settings; `netlify.toml` includes SPA fallback.

Base path behavior
- The app reads `window.__BASE_PATH__` (set in `index.html`) and `src/basePath.js` helpers are used to build asset URLs. For subpath deployments you may need to explicitly set `window.__BASE_PATH__`.

Testing after deployment
- Open DevTools → Network and verify `assets/`, `.json`, `.glb`, `.mp4` return 200.

Notes
- CI workflow at `.github/workflows/ci.yml` runs `npm ci` and `npm run build` on push and PR to `main` to validate builds.
- No runtime logic is changed by these files; they only add testing/deploy automation and docs.
