export function stopMedia(sceneVideo, sceneAudio, sceneVideoOverlay) {
  if (sceneVideo) {
    sceneVideo.pause();
    sceneVideo.removeAttribute("src");
    sceneVideo.load();
  }
  if (sceneAudio) {
    sceneAudio.pause();
    sceneAudio.removeAttribute("src");
    sceneAudio.load();
  }
  if (sceneVideoOverlay) sceneVideoOverlay.classList.add("hidden");
}

export async function playMedia(item, sceneVideo, sceneAudio, sceneVideoOverlay) {
  if (!item || !sceneVideo || !sceneAudio) return;

  sceneVideo.src = item.video;
  sceneVideo.loop = true;
  sceneVideo.preload = "metadata";

  sceneAudio.src = item.audio;
  sceneAudio.preload = "metadata";

  if (sceneVideoOverlay) sceneVideoOverlay.classList.remove("hidden");

  try {
    await Promise.all([sceneVideo.play(), sceneAudio.play()]);
  } catch {
    stopMedia(sceneVideo, sceneAudio, sceneVideoOverlay);
  }
}
