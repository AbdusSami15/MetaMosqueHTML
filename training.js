import { resolveUrl } from "./src/basePath.js";

const NEXT_SCENE_NAME = "SCENE";

const TRAINING_CONFIG = {
  backgroundImage: "assets/bg/training_room_bg.jpg",
  backgroundFallbackColor: "#2a2520",
  silhouetteImage: "assets/ui/training_silhouette.png",
  playlist: [
    { video: "assets/media/videos/umrah/Kaba video compressed.mp4", audio: "assets/media/audio/umrah/UmrahNiyatFinal.mp3" },
    { video: "assets/media/videos/umrah/Ahram.mp4", audio: "assets/media/audio/umrah/Ahram.mp3" },
    { video: "assets/media/videos/umrah/Talbiyah.mp4", audio: "assets/media/audio/umrah/LabbaikBg.mp3" },
  ],
};

const trainingRoot = document.getElementById("trainingRoot");
const trainingBg = document.getElementById("trainingBg");
const trainingCharacter = document.getElementById("trainingCharacter");
const trainingVideo = document.getElementById("trainingVideo");
const trainingAudio = document.getElementById("trainingAudio");
const tapToPlayOverlay = document.getElementById("tapToPlayOverlay");

/* overlays (if present in your HTML) */
const loadingOverlay = document.getElementById("loadingOverlay");
const loadingText = document.getElementById("loadingText");
const disclaimerOverlay = document.getElementById("disclaimerOverlay");
const disclaimerOk = document.getElementById("disclaimerOk");

/* SKIP button (same selector / name) */
function getSkipBtn() {
  return document.querySelector('[data-action="trainSkip"]');
}

let currentIndex = 0;
let isPlaying = false;

/* new state */
let allFinished = false;
let nextSceneName = "";      // label shown on SKIP button
let nextSceneId = "";        // optional id (if you pass it)
let pendingGo = false;

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

function stopBoth() {
  if (trainingVideo) {
    trainingVideo.pause();
    trainingVideo.loop = false;
  }
  if (trainingAudio) trainingAudio.pause();
  isPlaying = false;
  forceHideTapOverlay();
}

function playBothFromStart() {
  if (!trainingVideo || !trainingAudio) return;

  forceHideTapOverlay();

  trainingAudio.currentTime = 0;
  trainingVideo.currentTime = 0;
  trainingVideo.loop = true;

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
  const list = TRAINING_CONFIG.playlist;
  if (!list.length) return Promise.resolve({ ok: true });

  currentIndex = Math.max(0, Math.min(index, list.length - 1));
  const item = list[currentIndex];

  stopBoth();

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
    /* Always wait for new source: do not use readyState (it can be from previous item) */
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

    function onVideoReady() {
      videoReady = true;
      tryResolve();
    }
    function onAudioReady() {
      audioReady = true;
      tryResolve();
    }
    function onVideoError(e) {
      console.warn("Training: video load failed for item " + currentIndex + ":", item.video, e);
      loadFailed = true;
      videoReady = true;
      tryResolve();
    }
    function onAudioError(e) {
      console.warn("Training: audio load failed for item " + currentIndex + ":", item.audio, e);
      loadFailed = true;
      audioReady = true;
      tryResolve();
    }

    trainingVideo.addEventListener("loadeddata", onVideoReady, { once: true });
    trainingVideo.addEventListener("error", onVideoError, { once: true });
    trainingAudio.addEventListener("canplaythrough", onAudioReady, { once: true });
    trainingAudio.addEventListener("error", onAudioError, { once: true });
  });
}

function nextStep() {
  if (currentIndex >= TRAINING_CONFIG.playlist.length - 1) return;
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

/* UPDATED: skip becomes "scene button" and stays disabled until all finished */
function skipTraining() {
  pendingGo = true;

  // show loading then show OK panel (if overlays exist)
  showLoading("LOADING...");
  setTimeout(() => {
    hideLoading();
    showDisclaimer();
  }, 650);
}

/* Buttons */
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

/* OK button -> exit training + go to new scene */
if (disclaimerOk) {
  disclaimerOk.addEventListener("click", () => {
    if (!pendingGo) {
      hideDisclaimer();
      return;
    }

    pendingGo = false;
    hideDisclaimer();

    // keep your existing exit event (no breaking changes)
    window.dispatchEvent(new CustomEvent("metamosque:exitTraining"));

    // optional navigation event for your app router (safe: if nobody listens, nothing breaks)
    window.dispatchEvent(new CustomEvent("metamosque:goToScene", {
      detail: { sceneName: nextSceneName, sceneId: nextSceneId }
    }));
  });
}

/* Audio end => stop video; do NOT auto-play next. Only last item unlocks skip. */
if (trainingAudio) {
  trainingAudio.addEventListener("ended", () => {
    stopBoth();

    const isLast = currentIndex >= (TRAINING_CONFIG.playlist.length - 1);
    if (isLast) {
      allFinished = true;
      setSkipState(true);
    }
    /* Next video/audio only when user clicks NEXT */
  });
}

/* Extra safety:
   If browser doesn't respect loop sometimes, manually replay video while audio is still playing */
if (trainingVideo) {
  trainingVideo.addEventListener("ended", () => {
    if (!trainingAudio) return;
    if (!trainingAudio.ended && !trainingAudio.paused) {
      trainingVideo.currentTime = 0;
      trainingVideo.play().catch(() => {});
    }
  });
}

/* Start / Exit */
window.addEventListener("metamosque:startTraining", (e) => {
  forceHideTapOverlay();
  setBackground();
  setSilhouette();

  // reset state each time
  currentIndex = 0;
  allFinished = false;
  pendingGo = false;

  // scene label/id from event detail (optional)
  const d = (e && e.detail) ? e.detail : {};
  nextSceneName = (d && typeof d.nextSceneName === "string") ? d.nextSceneName : NEXT_SCENE_NAME;
  nextSceneId = (d && typeof d.nextSceneId === "string") ? d.nextSceneId : "";

  // apply to skip button
  setSkipLabel(nextSceneName);
  setSkipState(true);

  if (trainingRoot) trainingRoot.classList.remove("hidden");
  loadItem(0).then((result) => {
    if (result && result.ok) playBothFromStart();
  });
});

window.addEventListener("metamosque:exitTraining", () => {
  stopBoth();
  hideLoading();
  hideDisclaimer();
  pendingGo = false;

  if (trainingRoot) trainingRoot.classList.add("hidden");
  const mainMenu = document.getElementById("mainMenu");
  if (mainMenu) mainMenu.classList.remove("hidden");
});
