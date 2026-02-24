import { setBaseFromEntry, getBasePath, join, resolveUrl } from "./src/basePath.js";

setBaseFromEntry(import.meta.url);
if (typeof window !== "undefined") {
  window.getBasePath = getBasePath;
  window.joinBase = join;
  window.resolveAssetUrl = resolveUrl;
}

const mainMenu = document.getElementById("mainMenu");
const loadingOverlay = document.getElementById("loadingOverlay");
const sceneRoot = document.getElementById("sceneRoot");
const globalOptionsBtn = document.getElementById("globalOptionsBtn");

const moduleCache = new Map();
let currentSceneId = null;
let currentModule = null;

function show(el) { if (el) el.classList.remove("hidden"); }
function hide(el) { if (el) el.classList.add("hidden"); }

async function enterScene(sceneId) {
  if (currentSceneId) exitScene();

  hide(mainMenu);
  if (loadingOverlay) show(loadingOverlay);
  if (globalOptionsBtn) globalOptionsBtn.classList.remove("hidden");

  const sceneBaseUrl = resolveUrl(`assets/scenes/${sceneId}/`);

  let mod = moduleCache.get(sceneId);
  if (!mod) {
    try {
      mod = await import(`./assets/scenes/${sceneId}/scripts/index.js`);
      moduleCache.set(sceneId, mod);
    } catch (err) {
      console.error("Scene load failed:", sceneId, err);
      if (loadingOverlay) hide(loadingOverlay);
      show(mainMenu);
      return;
    }
  }

  if (sceneRoot) show(sceneRoot);
  await new Promise(r => requestAnimationFrame(r));

  const ctx = {
    sceneId,
    basePath: sceneBaseUrl,
    sceneRoot,
    canvas: document.getElementById("sceneCanvas"),
    hint: document.getElementById("sceneHint"),
    videoOverlay: document.getElementById("sceneVideoOverlay"),
    videoEl: document.getElementById("sceneVideo"),
    audioEl: document.getElementById("sceneAudio"),
  };

  try {
    if (typeof mod.enter === "function") await mod.enter(ctx);
    else if (mod.default && typeof mod.default.enter === "function") await mod.default.enter(ctx);
  } catch (err) {
    console.error("sceneRouter: scene enter failed for", sceneId, err);
    if (loadingOverlay) hide(loadingOverlay);
    // On failure, show main menu to avoid leaving user with hidden UI
    if (sceneRoot) hide(sceneRoot);
    if (mainMenu) show(mainMenu);
    currentSceneId = null;
    currentModule = null;
    return;
  }

  if (loadingOverlay) hide(loadingOverlay);

  // ✅ Show Disclaimer Panel (Updated: Skip for Haram)
  if (sceneId !== "umrah_haram" && sceneId !== "al-haram") {
    const disclaimerOverlay = document.getElementById("disclaimerOverlay");
    if (disclaimerOverlay) {
      show(disclaimerOverlay);
      disclaimerOverlay.setAttribute("aria-hidden", "false");

      const okBtn = document.getElementById("disclaimerOk");

      // Stop video if it started auto-playing in background
      if (ctx.videoEl) ctx.videoEl.pause();

      if (okBtn) {
        const onOk = () => {
          hide(disclaimerOverlay);
          disclaimerOverlay.setAttribute("aria-hidden", "true");
          okBtn.removeEventListener("click", onOk);

          // Resume video if it was supposed to be playing (or just try play)
          // Since scene likely tried to play it, we can just play.
          if (ctx.videoEl && ctx.videoEl.src) {
            ctx.videoEl.play().catch(e => console.log("Video resume failed/not ready", e));
          }
        };
        okBtn.addEventListener("click", onOk);
      }
    }
  }

  currentSceneId = sceneId;
  currentModule = mod;
}

function exitScene() {
  if (currentModule) {
    if (typeof currentModule.exit === "function") currentModule.exit();
    else if (currentModule.default && typeof currentModule.default.exit === "function") currentModule.default.exit();
  }
  currentSceneId = null;
  currentModule = null;
  if (sceneRoot) hide(sceneRoot);
  if (mainMenu) show(mainMenu);
}

window.sceneRouter = { enterScene, exitScene };
