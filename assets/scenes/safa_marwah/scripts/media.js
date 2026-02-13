export function stopTriggerMedia(ctx) {
  const { videoEl, audioEl, videoOverlay } = ctx;
  if (videoEl) {
    videoEl.pause();
    videoEl.removeAttribute("src");
    videoEl.load();
  }
  if (audioEl) audioEl.pause();
  if (videoOverlay) videoOverlay.classList.add("hidden");
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

export function playTriggerMedia(ctx, item, options = {}) {
  const { basePath, videoEl, audioEl, videoOverlay } = ctx;
  if (!item || !videoEl || !audioEl) return;

  const videoSrc = resolveUrl(basePath, item.video || "");
  const audioSrc = resolveUrl(basePath, item.audio || "");

  videoEl.src = videoSrc;
  videoEl.muted = true;
  videoEl.load();
  videoEl.loop = true;
  videoEl.preload = "metadata";

  audioEl.src = audioSrc;
  audioEl.load();
  audioEl.preload = "metadata";

  videoEl.onended = null;
  audioEl.onended = () => {
    if (videoEl) videoEl.pause();
    options.onEnded?.();
  };

  if (videoOverlay) videoOverlay.classList.remove("hidden");

  Promise.all([videoEl.play(), audioEl.play()]).catch(() => stopTriggerMedia(ctx));
}

export function restartTriggerMedia(ctx, item) {
  if (!item) return;
  playTriggerMedia(ctx, item);
}

export function togglePauseTriggerMedia(ctx) {
  const { videoEl, audioEl } = ctx;
  if (!videoEl || !audioEl) return;

  if (videoEl.paused) {
    Promise.all([videoEl.play(), audioEl.play()]).catch(() => {});
  } else {
    videoEl.pause();
    audioEl.pause();
  }
}
