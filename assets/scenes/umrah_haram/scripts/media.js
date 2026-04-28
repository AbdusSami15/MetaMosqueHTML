let currentPlaylist = [];
let currentIndex = 0;
let maxIndexReached = 0;
let isSequencePlaying = false;
let currentCtx = null;
let onCompletionCallback = null;
let isNavLocked = false;
let isFinalPoint = false;

function getBtn(action) {
  return document.querySelector(`[data-action="${action}"]`);
}

function setBtnState(action, enabled) {
  const btn = getBtn(action);
  if (!btn) return;
  btn.disabled = !enabled;
  btn.setAttribute("aria-disabled", enabled ? "false" : "true");
  btn.style.opacity = enabled ? "1" : "0.45";
  btn.style.pointerEvents = enabled ? "auto" : "none";
  if (enabled) btn.classList.remove("hudBtnDisabled");
  else btn.classList.add("hudBtnDisabled");
}

export function setSkipState(enabled) {
  setBtnState("sceneNextScene", enabled);
}

export function initMediaSequence(ctx, playlist, options = {}) {
  currentCtx = ctx;
  currentPlaylist = Array.isArray(playlist) ? playlist : [playlist];
  currentIndex = 0;
  maxIndexReached = 0;
  isSequencePlaying = false;
  onCompletionCallback = options.onEnded || null;
  isNavLocked = !!options.isNavLocked;
  isFinalPoint = !!options.isFinalPoint;

  // Initially only Play is enabled
  setBtnState("scenePlay", true);
  setBtnState("sceneRewind", true);
  setBtnState("scenePause", true);
  setBtnState("scenePrevStep", false);
  setBtnState("sceneNextStep", false);
  setSkipState(false);

  loadItem(0);
}

async function loadItem(index) {
  if (!currentCtx || !currentPlaylist.length) return;

  currentIndex = Math.max(0, Math.min(index, currentPlaylist.length - 1));
  maxIndexReached = Math.max(maxIndexReached, currentIndex);

  const item = currentPlaylist[currentIndex];
  const { basePath, videoEl, audioEl, videoOverlay } = currentCtx;

  if (!videoEl || !audioEl) return;

  stopTriggerMedia(currentCtx);

  const loader = document.getElementById("sceneMediaLoader");
  if (loader) loader.classList.remove("hidden");

  const videoSrc = resolveUrl(basePath, item.video || "");
  const audioSrc = resolveUrl(basePath, item.audio || "");

  videoEl.src = videoSrc;
  videoEl.muted = true;
  videoEl.loop = true;
  videoEl.preload = "auto";
  videoEl.load();

  audioEl.src = audioSrc;
  audioEl.preload = "auto";
  audioEl.load();

  audioEl.onended = () => {
    if (videoEl) videoEl.pause();
    
    // Call completion callback for the current item
    if (onCompletionCallback) onCompletionCallback();

    if (!isNavLocked && isSequencePlaying) {
      setTimeout(() => {
        nextStep();
      }, 500);
    } else {
      const isLast = currentIndex >= currentPlaylist.length - 1;
      
      if (isNavLocked) {
        if (isLast) {
          if (isFinalPoint) {
            setSkipState(true);
            setBtnState("sceneNextStep", false);
          } else {
            setBtnState("sceneNextStep", true);
            setSkipState(false);
          }
        }
      } else {
        if (isLast) setSkipState(true);
      }
    }
  };

  if (videoOverlay) videoOverlay.classList.remove("hidden");

  // Wait for both to be ready
  await Promise.all([
    item.video ? waitMediaReady(videoEl) : Promise.resolve(),
    item.audio ? waitMediaReady(audioEl) : Promise.resolve()
  ]);

  if (loader) loader.classList.add("hidden");

  // Update navigation button states
  if (isNavLocked) {
    setBtnState("scenePrevStep", false);
    // Becomes active only on ended
  } else {
    setBtnState("scenePrevStep", currentIndex > 0);
    setBtnState("sceneNextStep", currentIndex < maxIndexReached);
  }

  // If we are at the very last item and it finishes, enable SCENE
  const isLast = currentIndex >= currentPlaylist.length - 1;
  if (isLast && !audioEl.paused && audioEl.ended) {
    if (isNavLocked) {
      if (isFinalPoint) setSkipState(true);
      else setBtnState("sceneNextStep", true);
    } else {
      setSkipState(true);
    }
  }
}

export function startSequence() {
  if (isSequencePlaying) return;
  isSequencePlaying = true;
  setBtnState("scenePlay", false);
  playCurrent();
}

/**
 * Plays current item from start
 */
async function playCurrent() {
  const { videoEl, audioEl } = currentCtx;
  if (!videoEl || !audioEl) return;

  videoEl.currentTime = 0;
  audioEl.currentTime = 0;

  try {
    await Promise.all([videoEl.play(), audioEl.play()]);
  } catch (err) {
    console.warn("Playback failed:", err);
    showTapToPlay();
  }
}

export function nextStep() {
  const isLast = currentIndex >= currentPlaylist.length - 1;
  if (isLast) {
    setSkipState(true);
    if (onCompletionCallback) onCompletionCallback();
    return;
  }
  loadItem(currentIndex + 1).then(() => {
    playCurrent();
  });
}

export function prevStep() {
  if (currentIndex <= 0) return;
  loadItem(currentIndex - 1).then(() => {
    playCurrent();
  });
}

export function rewind() {
  playCurrent();
}

export function togglePause() {
  const { videoEl, audioEl } = currentCtx;
  if (!videoEl || !audioEl) return;

  if (videoEl.paused || audioEl.paused) {
    Promise.all([videoEl.play(), audioEl.play()]).catch(() => showTapToPlay());
  } else {
    videoEl.pause();
    audioEl.pause();
  }
}

function showTapToPlay() {
  const tapOverlay = document.getElementById("sceneTapToPlayOverlay");
  if (tapOverlay) {
    tapOverlay.classList.remove("hidden");
    tapOverlay.onclick = (e) => {
      e.stopPropagation();
      tapOverlay.classList.add("hidden");
      currentCtx.videoEl.play();
      currentCtx.audioEl.play();
    };
  }
}

export function stopTriggerMedia(ctx) {
  const { videoEl, audioEl, videoOverlay } = ctx;
  if (videoOverlay) videoOverlay.classList.add("hidden");
  if (videoEl) {
    videoEl.pause();
    videoEl.removeAttribute("src");
    videoEl.load();
  }
  if (audioEl) {
    audioEl.pause();
    audioEl.removeAttribute("src");
    audioEl.load();
  }
}

function resolveUrl(basePath, path) {
  if (!path) return "";
  try {
    const baseUrl = new URL(basePath, window.location.href);
    return new URL(path, baseUrl.href).href;
  } catch (_) {
    return basePath + path;
  }
}

function waitMediaReady(el) {
  return new Promise((resolve) => {
    if (el.readyState >= 3) {
      resolve();
      return;
    }
    const onReady = () => {
      el.removeEventListener("canplaythrough", onReady);
      el.removeEventListener("error", onReady);
      resolve();
    };
    el.addEventListener("canplaythrough", onReady);
    el.addEventListener("error", onReady);
    setTimeout(resolve, 10000);
  });
}

