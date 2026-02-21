export function stopTriggerMedia(ctx) {
  const { videoEl, audioEl, videoOverlay } = ctx;

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

/**
 * @param {Object} ctx
 * @param {{video?:string, audio?:string}} item
 * @param {{onEnded?:()=>void}} options
 */
export function playTriggerMedia(ctx, item, options = {}) {
  const { basePath, videoEl, audioEl, videoOverlay } = ctx;
  if (!item || !videoEl || !audioEl) return;

  const videoSrc = resolveUrl(basePath, item.video || "");
  const audioSrc = resolveUrl(basePath, item.audio || "");

  // Video
  videoEl.src = videoSrc;
  videoEl.muted = true;
  videoEl.loop = true;
  videoEl.preload = "metadata";
  videoEl.load();

  // Audio
  audioEl.src = audioSrc;
  audioEl.preload = "metadata";
  audioEl.load();

  // IMPORTANT: overlay ko audio end pe hide nahi karna
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

  const paused = videoEl.paused || audioEl.paused;
  if (paused) {
    Promise.all([videoEl.play(), audioEl.play()]).catch(() => {});
  } else {
    videoEl.pause();
    audioEl.pause();
  }
}
