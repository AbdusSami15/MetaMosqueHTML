// training.js (UPDATED)
import { resolveUrl } from "./src/basePath.js";
import { initTrainingCharacter3D, disposeTrainingCharacter3D, setTrainingCharacterAction } from "./trainingCharacter3d.js";

const NEXT_SCENE_NAME = "SCENE";

// Training 1 (Before Safa Marwah)
const TRAINING_CONFIG = {
  backgroundImage: "assets/bg/training_room_bg.jpg",
  backgroundFallbackColor: "#2a2520",
  silhouetteImage: "assets/ui/training_silhouette.png",
  characterGlb: "assets/scenes/umrah_haram/media/models/character.glb",
  nextStepAudio: "assets/media/audio/umrah/NextStep.mp3",
  playlist: [
    { video: "assets/media/videos/umrah/Kaba video compressed.mp4", audio: "assets/media/audio/umrah/UmrahNiyatFinal.mp3" },
    { video: "assets/media/videos/umrah/Ahram.mp4", audio: "assets/media/audio/umrah/Ahram.mp3" },
    { video: "assets/media/videos/umrah/Talbiyah.mp4", audio: "assets/media/audio/umrah/LabbaikBg.mp3" },
  ],
};

// Training 2 (After Safa Marwah) - Simple finish screen
const TRAINING_CONFIG_2 = {
  backgroundImage: "assets/bg/training_room_bg.jpg",
  backgroundFallbackColor: "#2a2520",
  silhouetteImage: "assets/ui/training_silhouette.png",
  characterGlb: "assets/scenes/umrah_haram/media/models/character.glb", // User will replace later
  nextStepAudio: null, // No next step audio - just finish
  playlist: [
    { video: "assets/media/videos/umrah2/Kaba video compressed.mp4", audio: "assets/media/audio/umrah2/Conclusion.mp3" },
  ],
};

// Active configuration
let activeConfig = TRAINING_CONFIG;
// Persist selected pilgrimage mode ('umrah' or 'hajj')
let PILGRIMAGE_MODE = 'umrah';

const trainingRoot = document.getElementById("trainingRoot");
const trainingBg = document.getElementById("trainingBg");
const trainingCharacter = document.getElementById("trainingCharacter");
const trainingVideo = document.getElementById("trainingVideo");
const trainingAudio = document.getElementById("trainingAudio");
const tapToPlayOverlay = document.getElementById("tapToPlayOverlay");
// Use homeScreen instead of mainMenu
const homeScreen = document.getElementById("homeScreen");

const loadingOverlay = document.getElementById("loadingOverlay");
const loadingText = document.getElementById("loadingText");
const disclaimerOverlay = document.getElementById("disclaimerOverlay");
const disclaimerOk = document.getElementById("disclaimerOk");

function getSkipBtn() {
  return document.querySelector('[data-action="trainSkip"]');
}

let currentIndex = 0;
let isPlaying = false;

let allFinished = false;
let nextSceneName = "";
let nextSceneId = "";
let pendingGo = false;

let characterHost = null;

// ✅ last-step audio play only once
let nextStepOncePlayed = false;
let nextStepEl = null;

function forceHideTapOverlay() {
  if (tapToPlayOverlay) tapToPlayOverlay.classList.add("hidden");
}

function setBackground() {
  if (!trainingBg) return;

  const path = resolveUrl(TRAINING_CONFIG.backgroundImage);
  const img = new Image();
  img.onload = () => { trainingBg.style.backgroundImage = "url(" + path + ")"; };
  img.onerror = () => {
    console.warn("Training: background image not found at " + path);
    trainingBg.style.backgroundColor = TRAINING_CONFIG.backgroundFallbackColor;
  };
  img.src = path;
}

function setSilhouette() {
  if (!trainingCharacter || !TRAINING_CONFIG.silhouetteImage) return;

  const path = resolveUrl(TRAINING_CONFIG.silhouetteImage);
  const img = new Image();
  img.onload = () => { trainingCharacter.style.backgroundImage = "url(" + path + ")"; };
  img.onerror = () => { trainingCharacter.style.backgroundImage = "none"; };
  img.src = path;
}

function ensureCharacterHost() {
  if (!trainingRoot) return null;

  let host = document.getElementById("trainingCharacter3dHost");
  if (!host) {
    host = document.createElement("div");
    host.id = "trainingCharacter3dHost";

    host.style.position = "absolute";
    host.style.right = "6%";
    host.style.bottom = "18%";
    host.style.width = "22%";
    host.style.height = "62%";
    host.style.pointerEvents = "none";
    host.style.zIndex = "6";

    trainingRoot.appendChild(host);
  }
  characterHost = host;
  return host;
}

async function init3DCharacter() {
  const host = ensureCharacterHost();
  if (!host) return;

  disposeTrainingCharacter3D();

  host.style.right = "7%";
  host.style.bottom = "0%";
  host.style.width = "40%";
  host.style.height = "100%";

  const THREE_MOD = await import("three");
  const { Vector3 } = THREE_MOD;

  await initTrainingCharacter3D({
    host,
    modelUrl: activeConfig.characterGlb,

    modelScale: 1.8,
    modelPos: new Vector3(-0.25, 0, 0),
    modelRotY: 0,

    camPos: new Vector3(-0.6, 2.2, 3.8),
    camLookAt: new Vector3(-0.25, 1.9, 0.0),
  });
}

function setSkipState(enabled) {
  const btn = getSkipBtn();
  if (!btn) return;

  btn.disabled = !enabled;
  btn.setAttribute("aria-disabled", enabled ? "false" : "true");
  btn.style.opacity = enabled ? "1" : "0.45";
  btn.style.pointerEvents = enabled ? "auto" : "none";
  if (enabled) btn.classList.remove("hudBtnDisabled");
  else btn.classList.add("hudBtnDisabled");
}

function setSkipLabel(text) {
  const btn = getSkipBtn();
  if (!btn) return;
  if (typeof text === "string" && text.trim().length) btn.textContent = text;
}

function showLoading(text) {
  if (!loadingOverlay) return;
  if (loadingText && typeof text === "string") loadingText.textContent = text;
  loadingOverlay.classList.remove("hidden");
}

function hideLoading() {
  if (!loadingOverlay) return;
  loadingOverlay.classList.add("hidden");
}

function showDisclaimer() {
  if (!disclaimerOverlay) return;
  disclaimerOverlay.classList.remove("hidden");
  disclaimerOverlay.setAttribute("aria-hidden", "false");
}

function hideDisclaimer() {
  if (!disclaimerOverlay) return;
  disclaimerOverlay.classList.add("hidden");
  disclaimerOverlay.setAttribute("aria-hidden", "true");
}

function stopNextStepAudio() {
  if (!nextStepEl) return;
  try { nextStepEl.pause(); } catch (_) { }
  try { nextStepEl.currentTime = 0; } catch (_) { }
}

function stopBoth() {
  if (trainingVideo) {
    trainingVideo.pause();
    trainingVideo.loop = false;
  }
  if (trainingAudio) trainingAudio.pause();
  isPlaying = false;
  forceHideTapOverlay();
  // Don't set idle here - this is called during loading too
}

function playBothFromStart() {
  if (!trainingVideo || !trainingAudio) return;

  forceHideTapOverlay();

  trainingAudio.currentTime = 0;
  trainingVideo.currentTime = 0;
  trainingVideo.loop = true;

  // ✅ Character to talk when media starts
  setTrainingCharacterAction('talk');

  Promise.all([trainingVideo.play(), trainingAudio.play()])
    .then(() => { isPlaying = true; })
    .catch((err) => {
      console.warn("Training: autoplay blocked:", err);
      stopBoth();
    });
}

function resumeBoth() {
  if (!trainingVideo || !trainingAudio) return;

  forceHideTapOverlay();
  trainingVideo.loop = true;

  Promise.all([trainingVideo.play(), trainingAudio.play()])
    .then(() => { isPlaying = true; })
    .catch((err) => {
      console.warn("Training: resume blocked:", err);
      stopBoth();
    });
}

function loadItem(index) {
  const list = activeConfig.playlist;
  if (!list.length) return Promise.resolve({ ok: true });

  currentIndex = Math.max(0, Math.min(index, list.length - 1));
  const item = list[currentIndex];

  stopBoth();
  stopNextStepAudio();

  const videoUrl = resolveUrl(item.video);
  const audioUrl = resolveUrl(item.audio);

  if (trainingVideo) {
    trainingVideo.removeAttribute("src");
    trainingVideo.load();
    trainingVideo.muted = true;
    trainingVideo.preload = "auto";
    trainingVideo.loop = true;
    trainingVideo.src = videoUrl;
    trainingVideo.load();
  }

  if (trainingAudio) {
    trainingAudio.removeAttribute("src");
    trainingAudio.load();
    trainingAudio.preload = "auto";
    trainingAudio.src = audioUrl;
    trainingAudio.load();
  }

  forceHideTapOverlay();

  return new Promise((resolve) => {
    if (!trainingVideo || !trainingAudio) {
      resolve({ ok: true });
      return;
    }
    let videoReady = false;
    let audioReady = false;
    let loadFailed = false;

    function tryResolve() {
      if (!videoReady || !audioReady) return;
      trainingVideo.removeEventListener("loadeddata", onVideoReady);
      trainingVideo.removeEventListener("error", onVideoError);
      trainingAudio.removeEventListener("canplaythrough", onAudioReady);
      trainingAudio.removeEventListener("error", onAudioError);
      resolve({ ok: !loadFailed });
    }

    function onVideoReady() { videoReady = true; tryResolve(); }
    function onAudioReady() { audioReady = true; tryResolve(); }

    function onVideoError(e) {
      console.warn("Training: video load failed for item " + currentIndex + ":", item.video, e);
      loadFailed = true; videoReady = true; tryResolve();
    }
    function onAudioError(e) {
      console.warn("Training: audio load failed for item " + currentIndex + ":", item.audio, e);
      loadFailed = true; audioReady = true; tryResolve();
    }

    trainingVideo.addEventListener("loadeddata", onVideoReady, { once: true });
    trainingVideo.addEventListener("error", onVideoError, { once: true });
    trainingAudio.addEventListener("canplaythrough", onAudioReady, { once: true });
    trainingAudio.addEventListener("error", onAudioError, { once: true });
  });
}

function nextStep() {
  const isLast = currentIndex >= activeConfig.playlist.length - 1;

  if (isLast) {
    if (nextStepOncePlayed) return;
    nextStepOncePlayed = true;

    stopBoth();
    stopNextStepAudio();

    const nextStepSrc = activeConfig.nextStepAudio && resolveUrl(activeConfig.nextStepAudio);
    if (!nextStepSrc) {
      setSkipState(true);
      return;
    }

    if (!nextStepEl) nextStepEl = new Audio();
    nextStepEl.src = nextStepSrc;
    nextStepEl.currentTime = 0;

    setSkipState(false);

    nextStepEl.onended = () => {
      setSkipState(true);
      // ✅ Character to idle when next step audio ends
      setTrainingCharacterAction('idle');
    };
    nextStepEl.onerror = () => {
      setSkipState(true);
      setTrainingCharacterAction('idle');
    };

    nextStepEl.play().catch(() => {
      setSkipState(true);
      setTrainingCharacterAction('idle');
    });
    return;
  }

  loadItem(currentIndex + 1).then((result) => {
    if (result && result.ok) playBothFromStart();
  });
}

function restartStep() {
  playBothFromStart();
}

function togglePause() {
  if (!trainingVideo || !trainingAudio) return;

  if (isPlaying) {
    trainingVideo.pause();
    trainingAudio.pause();
    isPlaying = false;
  } else {
    resumeBoth();
  }
}

function skipTraining() {
  // ✅ Character to idle when FINISH button clicked
  setTrainingCharacterAction('idle');

  // Check if this is Training 2 (goes to main menu)
  if (activeConfig === TRAINING_CONFIG_2) {
    // Exit training - this shows Main Menu via metamosque:exitTraining listener
    window.dispatchEvent(new CustomEvent("metamosque:exitTraining"));
    return;
  }

  // Training 1 flow (original behavior)
  pendingGo = true;
  showLoading("LOADING...");
  setTimeout(() => {
    hideLoading();
    showDisclaimer();
  }, 650);
}

document.addEventListener("click", (e) => {
  if (!trainingRoot || trainingRoot.classList.contains("hidden")) return;

  const btn = e.target.closest("[data-action]");
  if (!btn) return;

  const action = btn.getAttribute("data-action");
  if (action === "trainNext") { nextStep(); return; }
  if (action === "trainRestart") { restartStep(); return; }
  if (action === "trainPause") { togglePause(); return; }
  if (action === "trainSkip") { skipTraining(); return; }
});

if (disclaimerOk) {
  disclaimerOk.addEventListener("click", () => {
    if (!pendingGo) {
      hideDisclaimer();
      return;
    }

    pendingGo = false;
    hideDisclaimer();

    window.dispatchEvent(new CustomEvent("metamosque:exitTraining"));
    window.dispatchEvent(new CustomEvent("metamosque:goToScene", {
      detail: { sceneName: nextSceneName, sceneId: nextSceneId }
    }));
  });
}

if (trainingAudio) {
  trainingAudio.addEventListener("ended", () => {
    stopBoth();
    const isLast = currentIndex >= (activeConfig.playlist.length - 1);
    if (isLast) allFinished = true;

    // ✅ Character to idle when audio ends
    setTrainingCharacterAction('idle');
  });
}

if (trainingVideo) {
  trainingVideo.addEventListener("ended", () => {
    if (!trainingAudio) return;
    if (!trainingAudio.ended && !trainingAudio.paused) {
      trainingVideo.currentTime = 0;
      trainingVideo.play().catch(() => { });
    }
  });
}

window.addEventListener("metamosque:startTraining", async (e) => {
  forceHideTapOverlay();

  const d = (e && e.detail) ? e.detail : {};
  // Persist mode if provided by caller (main menu)
  PILGRIMAGE_MODE = (d && typeof d.mode === 'string') ? d.mode : (window.PILGRIMAGE_MODE || PILGRIMAGE_MODE);
  // Expose globally for other modules (safa_marwah uses this)
  window.PILGRIMAGE_MODE = PILGRIMAGE_MODE;
  const trainingId = (d && typeof d.trainingId === "number") ? d.trainingId : 1;

  // Select configuration
  activeConfig = (trainingId === 2) ? TRAINING_CONFIG_2 : TRAINING_CONFIG;

  setBackground();
  // setSilhouette();

  currentIndex = 0;
  allFinished = false;
  pendingGo = false;

  nextStepOncePlayed = false;
  stopNextStepAudio();

  nextSceneName = (d && typeof d.nextSceneName === "string") ? d.nextSceneName : NEXT_SCENE_NAME;
  nextSceneId = (d && typeof d.nextSceneId === "string") ? d.nextSceneId : "";

  // Set button label based on training ID
  const buttonLabel = (trainingId === 2) ? "FINISH" : nextSceneName;
  setSkipLabel(buttonLabel);
  setSkipState(false);

  // Hide/show buttons based on training ID
  const nextBtn = document.querySelector('[data-action="trainNext"]');
  const restartBtn = document.querySelector('[data-action="trainRestart"]');
  const pauseBtn = document.querySelector('[data-action="trainPause"]');
  const controlsContainer = document.querySelector('.trainingControls');

  if (trainingId === 2) {
    // Training 2: Feed back: Add restart and pause button as well
    if (nextBtn) nextBtn.style.display = 'none';
    if (restartBtn) restartBtn.style.display = '';
    if (pauseBtn) pauseBtn.style.display = '';

    // Make finish button interactable true
    setSkipState(true);

    // Remove centering for single button
    if (controlsContainer) controlsContainer.classList.remove('training2-mode');
  } else {
    // Training 1: Show all buttons
    if (nextBtn) nextBtn.style.display = '';
    if (restartBtn) restartBtn.style.display = '';
    if (pauseBtn) pauseBtn.style.display = '';
    // Remove training2-mode class
    if (controlsContainer) controlsContainer.classList.remove('training2-mode');
  }

  if (trainingRoot) trainingRoot.classList.remove("hidden");

  // try { await init3DCharacter(); } catch (err) { console.warn("Training character init failed:", err); }

  loadItem(0).then((result) => {
    if (result && result.ok) playBothFromStart();
  });
});

window.addEventListener("metamosque:exitTraining", () => {
  stopBoth();
  stopNextStepAudio();
  hideLoading();
  hideDisclaimer();
  pendingGo = false;

  nextStepOncePlayed = false;

  disposeTrainingCharacter3D();

  if (trainingRoot) trainingRoot.classList.add("hidden");
  // Fixed: mainMenu ID does not exist, use homeScreen
  if (homeScreen) {
    homeScreen.classList.remove("hidden");
  }
});
