/**
 * Single source of truth for base URL. Works on any static host (Live Server,
 * GitHub Pages subfolder, Vercel/Netlify root) without changing gameplay logic.
 */

let cachedBase = null;

/**
 * Normalize path: ensure leading slash, single trailing slash for non-root.
 * @param {string} path
 * @returns {string}
 */
function normalize(path) {
  if (path == null || path === "") return "/";
  let p = path.replace(/\\/g, "/").replace(/\/+/g, "/").trim();
  if (!p.startsWith("/")) p = "/" + p;
  if (p !== "/" && !p.endsWith("/")) p = p + "/";
  return p;
}

/**
 * Set base from the entry script's URL (call from a module at app root, e.g. sceneRouter.js).
 * Uses import.meta.url to compute the folder of the current JS file.
 * @param {string} entryScriptUrl - e.g. import.meta.url from root script
 */
export function setBaseFromEntry(entryScriptUrl) {
  try {
    const url = new URL(entryScriptUrl);
    const pathname = url.pathname;
    const lastSlash = pathname.lastIndexOf("/");
    const dir = lastSlash <= 0 ? "/" : pathname.slice(0, lastSlash + 1);
    cachedBase = normalize(dir);
  } catch (_) {
    cachedBase = "/";
  }
}

/**
 * Get the app base path (normalized, ending with /). Root = "/".
 * Precedence: window.__BASE_PATH__ (for GH Pages) > setBaseFromEntry cache > document pathname.
 */
export function getBasePath() {
  if (typeof window !== "undefined" && window.__BASE_PATH__ != null && window.__BASE_PATH__ !== "") {
    return normalize(String(window.__BASE_PATH__));
  }
  if (cachedBase != null) return cachedBase;
  if (typeof document !== "undefined" && document.location) {
    const path = document.location.pathname;
    const base = path.endsWith("/") ? path : path.replace(/\/[^/]*$/, "/");
    return normalize(base);
  }
  return "/";
}

/**
 * Join base path with a relative path. Handles leading "./" and "/" in rel.
 * @param {string} base - from getBasePath()
 * @param {string} rel - e.g. "assets/ui/x.png" or "./assets/..." or "/assets/..."
 * @returns {string} path (with leading slash)
 */
export function join(base, rel) {
  if (rel == null || rel === "") return base === "/" ? "/" : base.slice(0, -1);
  let r = rel.replace(/\\/g, "/").trim();
  if (r.startsWith("./")) r = r.slice(2);
  if (r.startsWith("/")) r = r.slice(1);
  const b = base === "/" ? "" : base.endsWith("/") ? base.slice(0, -1) : base;
  const out = b ? b + "/" + r : r;
  return out.startsWith("/") ? out : "/" + out;
}

/**
 * Resolve a relative path to a full URL (for fetch, video, audio, img).
 * @param {string} rel - e.g. "assets/media/videos/umrah/x.mp4"
 * @returns {string} full URL
 */
export function resolveUrl(rel) {
  const base = getBasePath();
  const path = join(base, rel);
  try {
    return new URL(path, window.location.origin).href;
  } catch (_) {
    return path;
  }
}
