const mainMenu = document.getElementById("mainMenu");
const loadingOverlay = document.getElementById("loadingOverlay");
const sceneRoot = document.getElementById("sceneRoot");

const moduleCache = new Map();
let currentSceneId = null;
let currentModule = null;

function show(el) { if (el) el.classList.remove("hidden"); }
function hide(el) { if (el) el.classList.add("hidden"); }

async function enterScene(sceneId) {
  if (currentSceneId) exitScene();

  hide(mainMenu);
  if (loadingOverlay) show(loadingOverlay);

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

  if (loadingOverlay) hide(loadingOverlay);
  if (sceneRoot) show(sceneRoot);
  await new Promise(r => requestAnimationFrame(r));

  const basePath = `./assets/scenes/${sceneId}/`;
  const ctx = {
    sceneId,
    basePath,
    sceneRoot,
    canvas: document.getElementById("sceneCanvas"),
    hint: document.getElementById("sceneHint"),
    videoOverlay: document.getElementById("sceneVideoOverlay"),
    videoEl: document.getElementById("sceneVideo"),
    audioEl: document.getElementById("sceneAudio"),
  };

  if (typeof mod.enter === "function") await mod.enter(ctx);
  else if (mod.default && typeof mod.default.enter === "function") await mod.default.enter(ctx);

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
