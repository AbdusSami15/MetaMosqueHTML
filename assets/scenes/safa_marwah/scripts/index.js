// assets/scenes/safa_marwah/scripts/index.js (FULL REPLACE)
// SIMPLE "player collider" style fix (no raycast, no physics):
// - Player keeps a fixed walking height (start Y) so movement stays smooth
// - Player can NEVER go below a minimum ground level (clamp), like a basic collider stop.
//
// Config support (optional) in scene.config.json:
// {
//   "groundY": 0,
//   "minGroundY": 0,        // if not set, uses groundY
//   "eyeHeight": 1.6,       // camera height offset
//   "cameraStart": [x, y, z],
//   "cameraYawPitch": [yaw, pitch]
// }

import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

import { loadPoints, isInsidePoint, getPointCenter } from "./points.js";
import {
  playTriggerMedia,
  stopTriggerMedia,
  restartTriggerMedia,
  togglePauseTriggerMedia
} from "./media.js";
import { MobileControls } from "./mobileControls.js";

function resolveUrl(basePath, relPath) {
  if (!basePath) return relPath;
  if (!relPath) return relPath;
  if (relPath.startsWith("http")) return relPath;
  return `${basePath}${relPath}`;
}

let ctx = null;

let scene = null;
let camera = null;
let renderer = null;

let modelRoot = null;

let points = [];
let activeIndex = 0;
let mediaLocked = false;
let completed = false;

let marker = null;

// ✅ Dua UI state
let safaDuaShown = false;
let duaUi = null;
let duaAutoHideTimer = null;

// Mobile controls
let mobileControls = null;

// ✅ Demo Character State
let demoCharacter = null;
let demoCharacterMixer = null;
let demoCharacterActions = {};
let demoCharacterActiveAction = null;
let demoCharacterWalkTarget = null;
let demoCharacterWalking = false;
const DEMO_CHARACTER_WALK_SPEED = 1.6;
const clock = new THREE.Clock();

// ✅ Raycaster for grounding
const navRaycaster = new THREE.Raycaster();
const navDown = new THREE.Vector3(0, -1, 0);

const keys = Object.create(null);
let yaw = 0;
let pitch = 0;
let dragging = false;

let rafId = 0;
let lastT = 0;

const MOVE_SPEED = 50.0;
const LOOK_SENS = 0.0022;

const MARKER_RADIUS = 0.9;
const MARKER_HEIGHT = 3.2;

// ---- "Collider" clamp settings ----
let EYE_HEIGHT = 1.6;     // camera offset above ground
let MIN_GROUND_Y = 0;     // clamp floor level (world Y)
let WALK_Y = 1.6;         // fixed walking Y (set from start) so movement stays smooth

function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
function round3(v) { return Math.round(v * 1000) / 1000; }

async function loadSceneConfig(basePath) {
  const res = await fetch(`${basePath}config/scene.config.json`);
  if (!res.ok) return {};
  return await res.json();
}

async function loadGLB(basePath, modelCfg) {
  if (!modelCfg?.path) return null;

  const loader = new GLTFLoader();
  const url = new URL(modelCfg.path, new URL(basePath, window.location.href)).href;

  return new Promise((resolve) => {
    loader.load(
      url,
      (gltf) => resolve(gltf.scene),
      undefined,
      (err) => {
        console.warn("[SafaMarwah] GLB load failed:", err);
        resolve(null);
      }
    );
  });
}

function ensureOverlayVisible() {
  if (!ctx?.videoOverlay) return;
  ctx.videoOverlay.classList.remove("hidden");
}

function setSceneButtonEnabled(enabled) {
  const nextBtn = document.getElementById("sceneVideoNext");
  const sceneBtn = document.getElementById("sceneNextSceneBtn");

  console.log("[SafaMarwah] setSceneButtonEnabled:", { enabled, nextBtn: !!nextBtn, sceneBtn: !!sceneBtn });

  if (nextBtn) {
    nextBtn.disabled = enabled;
    nextBtn.setAttribute("aria-disabled", enabled ? "true" : "false");
    if (enabled) nextBtn.classList.add("hudBtnDisabled");
    else nextBtn.classList.remove("hudBtnDisabled");
  }

  if (sceneBtn) {
    sceneBtn.disabled = !enabled;
    sceneBtn.setAttribute("aria-disabled", !enabled ? "true" : "false");
    if (!enabled) sceneBtn.classList.add("hudBtnDisabled");
    else sceneBtn.classList.remove("hudBtnDisabled");
  }

  console.log("[SafaMarwah] Button states updated");
}

function setVideoTitle(text) {
  if (ctx?.videoTitle && typeof text === "string") ctx.videoTitle.textContent = text;
}

function setHint(text) {
  if (ctx?.hint && typeof text === "string") ctx.hint.textContent = text;
}

// ✅ Load Character GLB with Animations (Reused from Haram)
function loadDemoCharacter(sceneThree, basePath) {
  return new Promise((resolve) => {
    const loader = new GLTFLoader();
    // Path to Haram model
    // Safa path: assets/scenes/safa_marwah/scripts/index.js
    // Model: assets/scenes/umrah_haram/media/models/character.glb
    // Relative from config/scene: ../../umrah_haram/media/models/character.glb
    // Or simpler: construct absolute URL based on base path root.

    // basePath is: .../assets/scenes/safa_marwah/
    // We want: .../assets/scenes/umrah_haram/media/models/character.glb

    // basePath is .../safa_marwah/
    // ../ takes us to .../scenes/
    // So we need ../umrah_haram/...
    const url = new URL("../umrah_haram/media/models/character.glb", new URL(basePath, window.location.href)).href;

    loader.load(
      url,
      (gltf) => {
        const root = gltf.scene;
        root.name = "demoCharacter";

        // Scale/Position
        root.scale.set(1.5, 1.5, 1.5);

        root.traverse((child) => {
          if (!child.isMesh) return;
          child.castShadow = true;
          child.receiveShadow = true;
          if (child.material) {
            const mats = Array.isArray(child.material) ? child.material : [child.material];
            for (const m of mats) {
              if (m.map) m.map.colorSpace = THREE.SRGBColorSpace;
              m.needsUpdate = true;
            }
          }
        });

        // Setup Animation Mixer
        const mixer = new THREE.AnimationMixer(root);
        demoCharacterMixer = mixer;
        const clips = gltf.animations || [];

        clips.forEach((clip) => {
          const name = clip.name.toLowerCase();
          let action = mixer.clipAction(clip);
          action.setLoop(THREE.LoopRepeat, Infinity);
          action.clampWhenFinished = false;
          action.enabled = false;

          if (name.includes("walk")) {
            demoCharacterActions["walk"] = action;
          } else if (name.includes("run")) {
            demoCharacterActions["run"] = action;
          } else if (name.includes("idle") || name.includes("breathing")) {
            demoCharacterActions["idle"] = action;
          } else if (name.includes("talk")) {
            demoCharacterActions["talk"] = action;
          }
        });

        // Fallback
        if (!demoCharacterActions["idle"] && clips.length > 0) {
          demoCharacterActions["idle"] = mixer.clipAction(clips[0]);
        }
        if (!demoCharacterActions["walk"] && clips.length > 1) {
          demoCharacterActions["walk"] = mixer.clipAction(clips[1]);
        }

        playCharacterAction("idle");

        sceneThree.add(root);
        demoCharacter = root;
        resolve(root);
      },
      undefined,
      (err) => {
        console.warn("Failed to load character:", err);
        resolve(null);
      }
    );
  });
}

function playCharacterAction(name, transitionDuration = 0.5) {
  if (!demoCharacterMixer) return;

  const newAction = demoCharacterActions[name];
  if (!newAction) return;

  if (demoCharacterActiveAction !== newAction) {
    if (demoCharacterActiveAction) {
      demoCharacterActiveAction.fadeOut(transitionDuration);
    }
    newAction.reset().fadeIn(transitionDuration).play();
    newAction.enabled = true;
    demoCharacterActiveAction = newAction;
  }
}

function createMarker() {
  const geo = new THREE.CylinderGeometry(MARKER_RADIUS, MARKER_RADIUS, MARKER_HEIGHT, 24, 1, true);
  const mat = new THREE.MeshBasicMaterial({
    color: 0x00ff66,
    transparent: true,
    opacity: 0.28,
    side: THREE.DoubleSide,
    depthWrite: false,
  });

  const m = new THREE.Mesh(geo, mat);

  const disc = new THREE.Mesh(
    new THREE.CircleGeometry(MARKER_RADIUS * 1.2, 24),
    new THREE.MeshBasicMaterial({ color: 0x00ff66, transparent: true, opacity: 0.18, depthWrite: false })
  );
  disc.rotation.x = -Math.PI / 2;
  disc.position.y = -MARKER_HEIGHT * 0.5 + 0.05;
  m.add(disc);

  return m;
}

function moveMarkerToPoint(i) {
  if (!marker) return;

  if (i < 0 || i >= points.length) {
    marker.visible = false;
    return;
  }

  const c = getPointCenter(points[i]);
  marker.visible = true;

  // Raycast for marker goudning
  let groundY = c.y - 1.6; // Default fallback
  if (modelRoot && navRaycaster) {
    const origin = new THREE.Vector3(c.x, c.y + 2.0, c.z); // Start high
    navRaycaster.set(origin, navDown);
    const hits = navRaycaster.intersectObject(modelRoot, true);
    if (hits.length > 0) {
      groundY = hits[0].point.y;
    }
  }

  // Marker pivot is at bottom now? No, cylinder pivot is center. 
  // createMarker: m is cylinder. disk is child at -HEIGHT*0.5. 
  // So if we pull M up by HEIGHT*0.5, the disk is at 0.
  // Wait, let's look at createMarker:
  // disc.position.y = -MARKER_HEIGHT * 0.5 + 0.05;
  // So if marker.position.y = groundY + MARKER_HEIGHT * 0.5, then disk is at groundY + 0.05.
  // That seems correct for "sitting on ground".

  marker.position.set(c.x, groundY + MARKER_HEIGHT * 0.5, c.z);

  setHint(`${points[i].title || points[i].id || "Point"} (Reach)`);
}

function stopAllMedia() {
  stopTriggerMedia(ctx);
  mediaLocked = false;
}

function tryStartPointMedia() {
  if (completed) return;
  if (mediaLocked) return;
  if (!points.length) return;

  const p = points[activeIndex];
  if (!p) return;

  const pos = camera.position;
  if (isInsidePoint(p, pos)) {
    mediaLocked = true;

    setVideoTitle(p.title || "SAFA / MARWAH");
    ensureOverlayVisible();

    const isLastPoint = activeIndex === points.length - 1;

    console.log("[SafaMarwah] Starting point media:", { pointId: p.id, activeIndex, totalPoints: points.length, isLastPoint });

    // Disable next button if this is the last point
    if (isLastPoint) {
      console.log("[SafaMarwah] Last point detected, enabling scene button and marking completed");
      completed = true;
      setSceneButtonEnabled(true);
    }

    playTriggerMedia(ctx, p, {
      onEnded: () => {
        setHint(`${p.title || p.id} (Done)`);
      }
    });

    setHint(`${p.title || p.id} (Playing)`);
  }
}

// ✅ Advance to next point (Character Walk)
// ✅ Advance to next point (Character Walk)
function goNextPoint() {
  // Only show initial dua if we are just starting or standard flow, 
  // but for the "run" segment we handle it specially below.
  if (activeIndex === 0) maybeShowDuaNonBlocking();

  if (completed) return;
  if (mediaLocked) stopAllMedia();

  if (activeIndex < points.length - 1) {
    const prevIndex = activeIndex;

    // 1. Update index
    activeIndex += 1;

    // 2. Hide marker temporarily or move it
    moveMarkerToPoint(activeIndex);
    setHint(`${points[activeIndex].title || points[activeIndex].id} (Walking...)`);

    // 3. Trigger Character Walk
    if (demoCharacter) {
      const nextPoint = points[activeIndex];
      const center = getPointCenter(nextPoint);

      // Grounding: Assume point is at eye level. 
      // We set target Y to current Y initially, but tick() will snap it.
      // However, to be safe, start with a reasonable guess (center.y - 1.6)
      // BUT let tick override it.
      let targetY = center.y - 1.6;

      demoCharacterWalkTarget = new THREE.Vector3(center.x, targetY, center.z);
      demoCharacterWalking = true;

      // Detect "Run" segment?
      // If we just left "Running Start" (index 1) -> Going to Marwah (index 2)
      const prevPoint = points[prevIndex];
      const isRunSegment = prevPoint && (prevPoint.id === "running_start" || prevPoint.title === "Running Start");

      if (isRunSegment) {
        // Play RUN
        playCharacterAction("run");
        // Speed up? (Logic in tick needs to use run speed)
        demoCharacter.userData.isRunning = true;

        // Play Run Audio - Changed to safa2.mp3 per user request
        const runAudio = new Audio(resolveUrl(ctx.basePath, "media/audio/safa2.mp3"));
        runAudio.play().catch(e => console.warn("Run audio failed", e));

        // After 10s (was 5s), switch to walk + Show Dua
        setTimeout(() => {
          // Only if still walking/active
          if (demoCharacterWalking && demoCharacter.userData.isRunning) {
            playCharacterAction("walk");
            demoCharacter.userData.isRunning = false;

            // Show Custom Dua (Post-Run)
            const duaData = {
              title: "Dua (Post-Run)",
              arabic: "لَا إِلَٰهَ إِلَّا ٱللَّٰهُ وَحْدَهُ لَا شَرِيكَ لَهُ ۖ لَهُ ٱلْمُلْكُ وَلَهُ ٱلْحَمْدُ ۖ وَهُوَ عَلَىٰ كُلِّ شَيْءٍ قَدِيرٌ. لَا إِلَٰهَ إِلَّا ٱللَّٰهُ وَحْدَهُ أَنْجَزَ وَعْدَهُ وَنَصَرَ عَبْدَهُ وَهَزَمَ ٱلْأَحْزَابَ وَحْدَهُ.",
              latin: "La ilaha illallah wahdahu la sharikalahu, lahu al-mulku wa lahu al-hamdu, wa huwa ala kulli shay'in qadeer. La ilaha illallah wahdahu anjaza wa'dahu wa nasara abduhu wa hazama al-ahzaba wahdahu.",
              audio: "media/audio/DuaSafaMarwahAi.mp3"
            };
            showDuaPanel(duaData);

            // Mark general dua as shown too so we don't double show?
            safaDuaShown = true;
          }
        }, 10000);
      } else {
        // Normal Walk
        playCharacterAction("walk");
        demoCharacter.userData.isRunning = false;
      }

      // Face target immediatley (or smooth turn)
      demoCharacter.lookAt(demoCharacterWalkTarget);
    } else {
      // Fallback if no character loaded yet
      setHint(`${points[activeIndex].title || points[activeIndex].id} (Reach)`);
    }
    return;
  }

  completed = true;
  moveMarkerToPoint(-1);
  setHint("All done");

  // If character, make it idle
  if (demoCharacter) {
    demoCharacterWalking = false;
    demoCharacterWalkTarget = null;
    playCharacterAction("idle");
  }
}

function onNextSceneClick() {
  if (!completed) return;

  stopAllMedia();
  if (ctx?.videoOverlay) ctx.videoOverlay.classList.add("hidden");

  // ✅ Mode check — same flags set in main.js when user chose Hajj/Umrah
  const mode = window.PILGRIMAGE_MODE || "umrah";
  const isHajj = mode === "hajj";
  const isUmrah = mode === "umrah";

  console.log("=== SAFA MARWAH → SCENE BUTTON PRESSED ===");
  console.log("[" + (isHajj ? "✅" : "❌") + "] HAJJ  =", isHajj);
  console.log("[" + (isUmrah ? "✅" : "❌") + "] UMRAH =", isUmrah);
  console.log("→ Going to:", isHajj ? "MINA SCENE" : "CONCLUSION / TRAINING");

  if (isHajj) {
    // Hajj → Load Mina scene (sceneRouter.enterScene will call exitScene() automatically)
    window.dispatchEvent(new CustomEvent("metamosque:goToScene", {
      detail: { sceneName: "MINA", sceneId: "mina" }
    }));
  } else {
    // Umrah → Training conclusion
    // 1. Exit safa_marwah scene (cleans up ThreeJS, hides sceneRoot, shows mainMenu)
    if (window.sceneRouter && typeof window.sceneRouter.exitScene === "function") {
      window.sceneRouter.exitScene();
    }
    // 2. Hide mainMenu (exitScene shows it), show trainingRoot
    const mainMenuEl = document.getElementById("mainMenu");
    const trainingRootEl = document.getElementById("trainingRoot");
    if (mainMenuEl) mainMenuEl.classList.add("hidden");
    if (trainingRootEl) trainingRootEl.classList.remove("hidden");

    // 3. Tell training.js to start Training 2
    const detail = { trainingId: 2, nextSceneName: "AL HARAM", nextSceneId: "umrah_haram", mode };
    window.dispatchEvent(new CustomEvent("metamosque:startTraining", { detail }));
  }
}

function captureNow() {
  if (!camera) return;

  const pos = camera.position;
  const rot = camera.rotation;

  const data = {
    activePoint: points?.[activeIndex]?.id || points?.[activeIndex]?.title || null,
    activePointIndex: activeIndex,
    cameraPos: [round3(pos.x), round3(pos.y), round3(pos.z)],
    cameraRot: [round3(rot.x), round3(rot.y), round3(rot.z)],
    pitch: round3(pitch),
    yaw: round3(yaw),
    minGroundY: round3(MIN_GROUND_Y),
    eyeHeight: round3(EYE_HEIGHT),
    walkY: round3(WALK_Y),
  };

  console.log("[SafaMarwah] CAPTURE:", data);

  const text = JSON.stringify(data, null, 2);
  if (navigator.clipboard && window.isSecureContext) {
    navigator.clipboard.writeText(text).then(
      () => console.log("[SafaMarwah] Copied to clipboard"),
      () => { }
    );
  }
}

function applyYawPitch(newYaw, newPitch) {
  yaw = newYaw || 0;
  pitch = newPitch || 0;
  pitch = clamp(pitch, -1.1, 1.1);

  camera.rotation.order = "YXZ";
  camera.rotation.y = yaw;
  camera.rotation.x = pitch;
}

function onKeyDown(e) {
  keys[e.code] = true;

  const tag = e.target && e.target.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA") return;

  if (e.code === "KeyP") captureNow();
}

function onKeyUp(e) { keys[e.code] = false; }

function onMouseDown(e) {
  if (!ctx?.canvas) return;
  if (e.button !== 0) return;
  dragging = true;
  try { ctx.canvas.focus?.(); } catch { }
}

function onMouseUp() { dragging = false; }

function onMouseMove(e) {
  if (!dragging) return;
  yaw -= e.movementX * LOOK_SENS;
  pitch += e.movementY * LOOK_SENS;
  applyYawPitch(yaw, pitch);
}

// Apply mobile look
function applyMobileLook() {
  if (!mobileControls || !mobileControls.enabled) return;
  yaw += mobileControls.lookVector.x;
  pitch -= mobileControls.lookVector.y;
  applyYawPitch(yaw, pitch);
}

// "Collider clamp": never allow camera below min ground + eye height
function clampToGround() {
  const minY = MIN_GROUND_Y + EYE_HEIGHT;

  // if walkY itself is below min, push it up (so movement won't snap down later)
  if (WALK_Y < minY) WALK_Y = minY;

  // enforce current y
  if (camera.position.y < minY) camera.position.y = minY;

  // keep walking at fixed height (smooth / non-jerky)
  camera.position.y = WALK_Y;
}

function step(dt) {
  if (mediaLocked) return;

  let forward =
    (keys["KeyW"] ? 1 : 0) + (keys["ArrowUp"] ? 1 : 0) -
    (keys["KeyS"] ? 1 : 0) - (keys["ArrowDown"] ? 1 : 0);

  let strafe =
    (keys["KeyD"] ? 1 : 0) + (keys["ArrowRight"] ? 1 : 0) -
    (keys["KeyA"] ? 1 : 0) - (keys["ArrowLeft"] ? 1 : 0);

  // Add mobile controls
  if (mobileControls && mobileControls.enabled) {
    forward += mobileControls.moveVector.z;
    strafe += mobileControls.moveVector.x;
  }

  if (forward === 0 && strafe === 0) {
    clampToGround();
    return;
  }

  const speed = MOVE_SPEED * dt;

  const dir = new THREE.Vector3();
  camera.getWorldDirection(dir);
  dir.y = 0;
  dir.normalize();

  const right = new THREE.Vector3().crossVectors(dir, new THREE.Vector3(0, 1, 0)).normalize();

  const move = new THREE.Vector3();
  move.addScaledVector(dir, forward * speed);
  move.addScaledVector(right, strafe * speed);

  camera.position.add(move);

  // prevent falling below floor + keep fixed height
  clampToGround();
}

function tick(t) {
  rafId = requestAnimationFrame(tick);

  // Guard: if scene was cleaned up (exit called), stop loop
  if (!scene || !renderer || !camera) {
    cancelAnimationFrame(rafId);
    rafId = 0;
    return;
  }

  const dtClock = clock.getDelta(); // Animation delta


  if (demoCharacterMixer) {
    demoCharacterMixer.update(dtClock);
  }

  // ✅ Character Movement Logic
  // ✅ Character Movement Logic
  if (demoCharacter) {
    const pos = demoCharacter.position;

    // 1. Raycast Grounding
    let groundY = MIN_GROUND_Y;
    if (modelRoot) {
      // Raycast from slightly above current pos to find floor
      // We assume character pivot is at feet.
      // If we sink, pos.y is low. Let's cast from pos.y + 2.0 (head height) down.
      const origin = new THREE.Vector3(pos.x, pos.y + 2.0, pos.z);
      navRaycaster.set(origin, navDown);

      // Intersect modelRoot (recursive)
      const hits = navRaycaster.intersectObject(modelRoot, true);
      if (hits.length > 0) {
        // Find highest point below origin? 
        // hits are sorted by distance. unique hit?
        groundY = hits[0].point.y;
      }
    }

    // Smooth snap to ground (or instant if walking?)
    // Instant is better to prevent sinking visuals
    pos.y = groundY;


    if (demoCharacterWalking && demoCharacterWalkTarget) {
      const target = demoCharacterWalkTarget;

      // Distance on XZ plane only
      const dx = target.x - pos.x;
      const dz = target.z - pos.z;
      const distSq = dx * dx + dz * dz;

      // Check speed
      let speed = DEMO_CHARACTER_WALK_SPEED;
      if (demoCharacter.userData && demoCharacter.userData.isRunning) {
        speed = DEMO_CHARACTER_WALK_SPEED * 2.5;
      }

      const step = speed * dtClock;

      if (distSq <= step * step) {
        // Arrived
        pos.x = target.x;
        pos.z = target.z;
        // y is already grounded above

        demoCharacterWalking = false;
        demoCharacterWalkTarget = null;
        playCharacterAction("idle");

        // Update hint
        const p = points[activeIndex];
        if (p) setHint(`${p.title || p.id} (Reached)`);
      } else {
        // Move XZ
        const moveDir = new THREE.Vector3(dx, 0, dz).normalize();
        pos.x += moveDir.x * step;
        pos.z += moveDir.z * step;

        // Face target
        // lookAt target (adjust Y to match character height so it doesn't tilt)
        const lookT = new THREE.Vector3(target.x, pos.y, target.z);
        demoCharacter.lookAt(lookT);
      }
    } else {
      // IDLE: Face Player
      if (camera) {
        const target = camera.position.clone();
        target.y = demoCharacter.position.y; // Keep level
        demoCharacter.lookAt(target);
      }
    }
  }

  const now = (t || performance.now());
  const dt = Math.min(0.05, (now - lastT) / 1000);
  lastT = now;

  applyMobileLook();
  if (mobileControls) mobileControls.update();

  step(dt);
  tryStartPointMedia();

  if (renderer && scene && camera) renderer.render(scene, camera);
}

function onResize() {
  if (!renderer || !camera || !ctx?.canvas) return;
  const w = ctx.canvas.clientWidth || window.innerWidth;
  const h = ctx.canvas.clientHeight || window.innerHeight;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
}

function bindUI() {
  const nextBtn = document.getElementById("sceneVideoNext");
  const restartBtn = document.getElementById("sceneVideoRestart");
  const pauseBtn = document.getElementById("sceneVideoPause");
  const sceneBtn = document.getElementById("sceneNextSceneBtn");

  if (nextBtn) nextBtn.onclick = () => goNextPoint();
  if (restartBtn) restartBtn.onclick = () => {
    if (!points[activeIndex]) return;
    restartTriggerMedia(ctx, points[activeIndex]);
  };
  if (pauseBtn) pauseBtn.onclick = () => togglePauseTriggerMedia(ctx);
  if (sceneBtn) sceneBtn.onclick = (e) => { e.stopPropagation(); onNextSceneClick(); };
}

export async function enter(c) {
  ctx = c;

  // Reset dua state
  safaDuaShown = false;

  stopAllMedia();
  if (ctx?.videoOverlay) ctx.videoOverlay.classList.add("hidden");

  const basePath = ctx.basePath;

  const cfg = await loadSceneConfig(basePath);

  // Clamp base
  const gy = (typeof cfg?.groundY === "number") ? cfg.groundY : 0;
  MIN_GROUND_Y = (typeof cfg?.minGroundY === "number") ? cfg.minGroundY : gy;
  EYE_HEIGHT = (typeof cfg?.eyeHeight === "number") ? cfg.eyeHeight : 1.6;

  points = await loadPoints(basePath);
  points = (points || []).map(p => ({
    ...p,
    video: p.video || p.media?.video || "",
    audio: p.audio || p.media?.audio || "",
  }));

  activeIndex = 0;
  mediaLocked = false;
  completed = false;

  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x87ceeb);

  const w = ctx.canvas.clientWidth || window.innerWidth;
  const h = ctx.canvas.clientHeight || window.innerHeight;

  camera = new THREE.PerspectiveCamera(75, w / h, 0.1, 3000);

  // Start position
  const cs = cfg?.cameraStart;
  const startX = Array.isArray(cs) ? (cs[0] ?? 0) : 0;
  const startY = Array.isArray(cs) ? (cs[1] ?? (MIN_GROUND_Y + EYE_HEIGHT)) : (MIN_GROUND_Y + EYE_HEIGHT);
  const startZ = Array.isArray(cs) ? (cs[2] ?? 0) : 0;

  camera.position.set(startX, startY, startZ);

  // Rotation
  const yyp = cfg?.cameraYawPitch;
  if (Array.isArray(yyp) && yyp.length >= 2) applyYawPitch(yyp[0], yyp[1]);
  else applyYawPitch(0, 0);

  renderer = new THREE.WebGLRenderer({ canvas: ctx.canvas, antialias: true });
  renderer.setSize(w, h);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  // focusable canvas
  if (ctx?.canvas) {
    ctx.canvas.tabIndex = 0;
    ctx.canvas.style.outline = "none";
    ctx.canvas.addEventListener("click", () => {
      try { ctx.canvas.focus(); } catch { }
    });
  }

  // lights
  scene.add(new THREE.AmbientLight(0xffffff, 0.55));
  const sun = new THREE.DirectionalLight(0xffffff, 1.0);
  sun.position.set(15, 25, 15);
  scene.add(sun);

  // simple fallback floor (visual only)
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(400, 400),
    new THREE.MeshStandardMaterial({ color: 0xb8b8b8, roughness: 0.95 })
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = gy;
  scene.add(floor);

  // model
  modelRoot = await loadGLB(basePath, cfg?.model);
  if (modelRoot) {
    const m = cfg.model || {};
    const s = (m.scale ?? 1);
    modelRoot.scale.setScalar(s);

    const pos = m.position || [0, 0, 0];
    modelRoot.position.set(pos[0] || 0, pos[1] || 0, pos[2] || 0);

    const rot = m.rotation || [0, 0, 0];
    modelRoot.rotation.set(rot[0] || 0, rot[1] || 0, rot[2] || 0);

    scene.add(modelRoot);
  }

  // Set fixed walking Y from start, but never below min
  WALK_Y = camera.position.y;
  const minY = MIN_GROUND_Y + EYE_HEIGHT;
  if (WALK_Y < minY) WALK_Y = minY;
  camera.position.y = WALK_Y;

  // marker (still create it, but maybe hide depending on logic)
  marker = createMarker();
  scene.add(marker);

  // Mobile controls
  mobileControls = new MobileControls();
  mobileControls.enable();

  // ✅ Load Shared 3D Character
  loadDemoCharacter(scene, basePath).then((model) => {
    if (!model) return;
    // Place at start
    if (points.length > 0) {
      const c = getPointCenter(points[0]);
      // Safe Y?
      const safeY = WALK_Y < MIN_GROUND_Y ? MIN_GROUND_Y : WALK_Y;

      // Offset character from camera start (which is at point center)
      // Camera is at [-119.203, 8.6, -141.535].
      // Move character slightly so we don't spawn inside it.
      model.position.set(c.x, safeY, c.z + 2.0);

      // Face initial direction?
      // Maybe face point 1? Or just face camera?
      // Let's face next point if exists
      if (points.length > 1) {
        const c2 = getPointCenter(points[1]);
        model.lookAt(c2.x, safeY, c2.z);
      }
    } else {
      model.position.set(0, WALK_Y, 0);
    }
  });

  // UI
  setVideoTitle("UMRAH: MAKKAH");
  ensureOverlayVisible();
  setSceneButtonEnabled(false);

  // If we have character, we can hide marker or keep it for clarity
  // goNextPoint handles showing/hiding marker. 
  // Initially we cover point 0.
  moveMarkerToPoint(activeIndex);

  stopAllMedia();
  bindUI();

  // events
  window.addEventListener("resize", onResize);
  document.addEventListener("keydown", onKeyDown);
  document.addEventListener("keyup", onKeyUp);

  ctx.canvas.addEventListener("mousedown", onMouseDown);
  window.addEventListener("mouseup", onMouseUp);
  window.addEventListener("mousemove", onMouseMove);

  lastT = performance.now();
  tick();
}

// ✅ Dua helpers
async function loadSafaDua(basePath) {
  try {
    const res = await fetch(`${basePath}config/safa_dua.json`, { cache: "no-store" });
    if (!res.ok) return null;
    return await res.json();
  } catch (_) {
    return null;
  }
}

function initDuaUiOnce() {
  if (duaUi) return duaUi;
  const panel = document.getElementById("duaSidePanel");
  const titleEl = document.getElementById("duaSideTitle");
  const arEl = document.getElementById("duaSideArabic");
  const laEl = document.getElementById("duaSideLatin");
  const okBtn = document.getElementById("duaSideOk");
  const audioEl = document.getElementById("duaSideAudio");

  duaUi = { panel, titleEl, arEl, laEl, okBtn, audioEl, data: null };

  if (okBtn) okBtn.onclick = () => hideDuaPanel();
  return duaUi;
}

function showDuaPanel(data) {
  const ui = initDuaUiOnce();
  if (!ui?.panel) return;

  ui.data = data;

  if (ui.titleEl) ui.titleEl.textContent = data?.title || "Dua";
  if (ui.arEl) ui.arEl.textContent = data?.arabic || "";
  if (ui.laEl) ui.laEl.textContent = data?.latin || "";

  ui.panel.classList.remove("hidden");
  ui.panel.setAttribute("aria-hidden", "false");

  if (ui.audioEl && data?.audio) {
    const src = resolveUrl(ctx?.basePath || "", data.audio);
    ui.audioEl.pause();
    ui.audioEl.currentTime = 0;
    if (ui.audioEl.src !== src) ui.audioEl.src = src;
    ui.audioEl.play().catch(() => { });
  }

  if (duaAutoHideTimer) {
    clearTimeout(duaAutoHideTimer);
    duaAutoHideTimer = null;
  }

  duaAutoHideTimer = setTimeout(() => {
    hideDuaPanel();
  }, 25000);
}

function hideDuaPanel() {
  const ui = initDuaUiOnce();
  if (!ui?.panel) return;

  if (duaAutoHideTimer) {
    clearTimeout(duaAutoHideTimer);
    duaAutoHideTimer = null;
  }

  ui.panel.classList.add("hidden");
  ui.panel.setAttribute("aria-hidden", "true");

  if (ui.audioEl) {
    ui.audioEl.pause();
    ui.audioEl.currentTime = 0;
  }
}

// ✅ Non-blocking: show dua but do NOT stop next flow
async function maybeShowDuaNonBlocking(force = false) {
  if (safaDuaShown && !force) return;
  safaDuaShown = true;

  const ui = initDuaUiOnce();
  if (!ui) return;

  if (!ui.data) ui.data = await loadSafaDua(ctx.basePath);
  if (!ui.data) return;

  showDuaPanel(ui.data);
}

export function exit() {
  cancelAnimationFrame(rafId);
  rafId = 0;

  stopAllMedia();

  window.removeEventListener("resize", onResize);
  document.removeEventListener("keydown", onKeyDown);
  document.removeEventListener("keyup", onKeyUp);

  if (ctx?.canvas) ctx.canvas.removeEventListener("mousedown", onMouseDown);
  window.removeEventListener("mouseup", onMouseUp);
  window.removeEventListener("mousemove", onMouseMove);

  if (mobileControls) {
    mobileControls.disable();
    mobileControls = null;
  }

  if (renderer) {
    renderer.dispose();
    renderer = null;
  }

  // Dispose Character
  if (demoCharacter) {
    scene.remove(demoCharacter);
    demoCharacter = null;
  }
  demoCharacterMixer = null;
  demoCharacterActions = {};
  demoCharacterActiveAction = null;

  scene = null;
  camera = null;
  modelRoot = null;
  marker = null;
  points = [];
  ctx = null;
}
