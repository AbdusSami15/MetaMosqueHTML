let currentPlaylist = [];
let currentIndex = 0;
let maxIndexReached = 0;
let isSequencePlaying = false;
let currentCtx = null;
let onCompletionCallback = null;
let isNavLocked = false;
let isFinalPoint = false;
let disableSceneBtnOnEnd = false;

function getBtn(action) {
  return document.querySelector(`[data-action="${action}"]`);
}

export function setBtnState(action, enabled) {
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

export function setVideoTitle(title) {
  const titleEl = document.getElementById("sceneVideoTitle");
  if (titleEl && title) {
    titleEl.textContent = title;
  }
}

export function getCurrentIndex() {
  return currentIndex;
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
  disableSceneBtnOnEnd = !!options.disableSceneBtnOnEnd;

  // Initially set up buttons
  setBtnState("scenePlay", true);
  setBtnState("sceneRewind", true);
  setBtnState("scenePause", true);
  
  // Custom: These may be overridden by the caller immediately after init
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
  videoEl.playsInline = true;
  videoEl.setAttribute("webkit-playsinline", "true");
  videoEl.preload = "auto";
  videoEl.load();

  audioEl.src = audioSrc;
  audioEl.preload = "auto";
  audioEl.load();

  audioEl.onended = () => {
    if (videoEl) videoEl.pause();
    
    // Call completion callback for the current item
    if (onCompletionCallback) onCompletionCallback(currentIndex);

    const isLast = currentIndex >= currentPlaylist.length - 1;

    if (!isNavLocked && isSequencePlaying) {
      if (isLast) {
        // ✅ Finished automated sequence
        isSequencePlaying = false;
        setBtnState("scenePlay", true);
        // Respect disableSceneBtnOnEnd (e.g. Muzdalifah: SCENE stays off after full playlist)
        setSkipState(!disableSceneBtnOnEnd);
      } else {
        setTimeout(() => {
          nextStep();
        }, 500);
      }
    } else {
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
        if (isLast && !disableSceneBtnOnEnd) setSkipState(true);
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

  // Update navigation button states (default logic, caller can override)
  if (isNavLocked) {
    setBtnState("scenePrevStep", false);
  } else {
    setBtnState("scenePrevStep", currentIndex > 0);
    setBtnState("sceneNextStep", currentIndex < maxIndexReached);
  }

  // If we are at the very last item and it finishes, enable SCENE
  const isLast = currentIndex >= currentPlaylist.length - 1;
  if (isLast && !audioEl.paused && audioEl.ended && !disableSceneBtnOnEnd) {
    setSkipState(true);
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
    console.warn("Media: play failed", err);
    showTapToPlay();
  }
}

export function nextStep() {
  if (currentIndex < currentPlaylist.length - 1) {
    loadItem(currentIndex + 1).then(() => {
      if (isSequencePlaying) playCurrent();
    });
  }
}

export function prevStep() {
  if (currentIndex > 0) {
    loadItem(currentIndex - 1).then(() => {
      if (isSequencePlaying) playCurrent();
    });
  }
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

export function stopTriggerMedia(ctx) {
  if (!ctx) return;
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
