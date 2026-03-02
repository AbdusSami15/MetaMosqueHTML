// index.js (FULL REPLACE)
// ✅ Flow same as before:
//    NEXT always advances tawaf (stops video overlay, moves to next point, demo character moves).
// ✅ NEW: On first NEXT only, show Dua side panel (non-blocking) + auto-hide after 5 seconds.

import * as THREE from "three";
import { PointerLockControls } from "three/examples/jsm/controls/PointerLockControls.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";

import { loadTawaf, isInsideTawafPoint, getTawafPointCenter } from "./tawaf.js";
import {
  stopTriggerMedia,
  playTriggerMedia,
  restartTriggerMedia,
  togglePauseTriggerMedia,
} from "./media.js";
import { MobileControls } from "./mobileControls.js";

const MOVE_SPEED = 0.15;

let renderer, scene, camera, controls;
let mobileControls = null;
let tawafPoints = [];
let activeTawafIndex = 0;
let tawafMediaLocked = false;
let tawafComplete = false;

let movementLocked = false;

let velocity = new THREE.Vector3();
let dir = new THREE.Vector3();
let right = new THREE.Vector3();

let moveForward = false;
let moveBack = false;
let moveLeft = false;
let moveRight = false;

let ctx = null;
let groundY = 0;
// Respect configured camera start Y across update loop
let CAMERA_START_Y = null;

// Marker (beam)
let tawafBeam = null;
let tawafGlow = null;
let tawafRing = null;

// Demo character
// Demo character (3D Model)
let demoCharacter = null;
let demoCharacterMixer = null;
let demoCharacterActions = {};
let demoCharacterActiveAction = null;
let clock = new THREE.Clock();

// Walking state
let demoCharacterWalkTarget = null;
let demoCharacterWalking = false;
const DEMO_CHARACTER_WALK_SPEED = 1.6; // slightly faster/slower depending on animation

// Kaaba boundary
const KAABA_HALF_X = 9;
const KAABA_HALF_Z = 9;
const KAABA_MARGIN = 2;
const HATEEM_RADIUS = 15;
const HATEEM_HALF = -1;
let demoCharacterArcWalk = null;

// ✅ Dua UI state
let haramDuaShown = false;
let duaUi = null;
let duaAutoHideTimer = null;

function clampToOutsideKaaba(x, z) {
  const L = -KAABA_HALF_X - KAABA_MARGIN;
  const R = KAABA_HALF_X + KAABA_MARGIN;
  const B = -KAABA_HALF_Z - KAABA_MARGIN;
  const T = KAABA_HALF_Z + KAABA_MARGIN;
  let out = { x, z };

  if (x >= L && x <= R && z >= B && z <= T) {
    const dR = R - x, dL = x - L, dT = T - z, dB = z - B;
    const minD = Math.min(dR, dL, dT, dB);
    if (minD === dR) out = { x: R, z };
    else if (minD === dL) out = { x: L, z };
    else if (minD === dT) out = { x, z: T };
    else out = { x, z: B };
  }

  const r = Math.sqrt(out.x * out.x + out.z * out.z);

  // Hateem Zone: The hard clamp should only be a safety net (e.g. wall collision).
  // The walking logic now handles the smooth path.
  // We keep this to prevent entering the wall if something else pushes it there.
  const WALL_RADIUS = 14;

  // Check mostly North side
  const inHateemZone = (out.z > 2.0);

  if (inHateemZone && r < WALL_RADIUS && r > 1e-6) {
    const scale = WALL_RADIUS / r;
    out = { x: out.x * scale, z: out.z * scale };
  }
  return out;
}

function resolveUrl(basePath, relPath) {
  if (!basePath) return relPath;
  if (!relPath) return relPath;
  if (relPath.startsWith("http")) return relPath;
  return `${basePath}${relPath}`;
}

function playSfx(basePath, relPath, volume = 1) {
  try {
    const a = new Audio(resolveUrl(basePath, relPath));
    a.volume = volume;
    a.play().catch(() => { });
  } catch (_) { }
}

function normalizeBtnText(t) {
  return (t || "").replace(/\s+/g, " ").trim().toUpperCase();
}

function autoFindButtons() {
  const buttons = Array.from(document.querySelectorAll("button, .btn, [role='button']"));
  const out = { nextBtn: null, restartBtn: null, pauseBtn: null, closeBtn: null };

  for (const b of buttons) {
    const txt = normalizeBtnText(b.innerText || b.textContent);
    if (!txt) continue;

    if (!out.nextBtn && txt === "NEXT") out.nextBtn = b;
    else if (!out.restartBtn && txt === "RESTART") out.restartBtn = b;
    else if (!out.pauseBtn && txt === "PAUSE") out.pauseBtn = b;
    else if (!out.closeBtn && txt === "CLOSE") out.closeBtn = b;
  }
  return out;
}

async function loadSceneConfig(basePath) {
  const url = `${basePath}config/scene.config.json`;
  try {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) return null;
    return await res.json();
  } catch (_) {
    return null;
  }
}

function snapModelToGround(root, groundYLocal = 0) {
  const box = new THREE.Box3().setFromObject(root);
  const offset = groundYLocal - box.min.y;
  root.position.y += offset;
}

// ✅ Load Character GLB with Animations
function loadDemoCharacter(sceneThree, basePath) {
  return new Promise((resolve) => {
    const loader = new GLTFLoader();
    const url = resolveUrl(basePath, "media/models/character.glb");

    loader.load(
      url,
      (gltf) => {
        const root = gltf.scene;
        root.name = "demoCharacter";

        // Scale/Position
        root.scale.set(1.5, 1.5, 1.5);

        // Shadows & Materials
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

        // Extract clips
        // We look for "idle" and "walk" (fuzzy match)
        clips.forEach((clip) => {
          const name = clip.name.toLowerCase();
          let action = mixer.clipAction(clip);
          action.setLoop(THREE.LoopRepeat, Infinity);
          action.clampWhenFinished = false;
          action.enabled = false; // start disabled

          if (name.includes("walk")) {
            demoCharacterActions["walk"] = action;
          } else if (name.includes("idle") || name.includes("breathing")) {
            demoCharacterActions["idle"] = action;
          } else if (name.includes("talk")) {
            demoCharacterActions["talk"] = action;
          }
        });

        // Fallback if no specific walk/idle found
        if (!demoCharacterActions["idle"] && clips.length > 0) {
          demoCharacterActions["idle"] = mixer.clipAction(clips[0]);
        }
        if (!demoCharacterActions["walk"] && clips.length > 1) {
          demoCharacterActions["walk"] = mixer.clipAction(clips[1]);
        }

        // Snap to ground
        snapModelToGround(root, groundY);

        // Start Idle
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

function loadHaramModel(sceneThree, basePath) {
  return new Promise((resolve) => {
    const loader = new GLTFLoader();
    const url = resolveUrl(basePath, "media/models/haram.glb");

    loader.load(
      url,
      (gltf) => {
        const root = gltf.scene;

        root.traverse((child) => {
          if (!child.isMesh) return;
          child.castShadow = true;
          child.receiveShadow = true;

          const mats = Array.isArray(child.material) ? child.material : [child.material];
          for (const m of mats) {
            if (!m) continue;
            if ("metalness" in m) m.metalness = 0.05;
            if ("roughness" in m) m.roughness = 0.9;
            if (m.map) m.map.colorSpace = THREE.SRGBColorSpace;
            m.needsUpdate = true;
          }
        });

        snapModelToGround(root, groundY);
        sceneThree.add(root);
        resolve();
      },
      undefined,
      () => resolve()
    );
  });
}

function setNextVisible() {
  if (!ctx?.nextBtn) return;
  ctx.nextBtn.classList.remove("hidden");
  ctx.nextBtn.style.display = "";
}

function lockMovement() {
  movementLocked = true;
  moveForward = moveBack = moveLeft = moveRight = false;
}

function unlockMovement() {
  movementLocked = false;
}

function createTawafBeam() {
  const beamGeometry = new THREE.CylinderGeometry(1.45, 1.45, 6, 36, 1, true);
  const beamMaterial = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: {
      uTime: { value: 0 },
      uColor: { value: new THREE.Color(0x00ff66) },
    },
    vertexShader: `
      varying vec2 vUv;
      void main(){
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      varying vec2 vUv;
      uniform float uTime;
      uniform vec3 uColor;
      float hash(float n){ return fract(sin(n)*43758.5453); }
      void main(){
        float mid = 1.0 - abs(vUv.y - 0.5) * 2.0;
        float band = sin((vUv.y * 12.0) + (uTime * 3.0)) * 0.5 + 0.5;
        float n = hash(floor(vUv.y*40.0) + floor(uTime*10.0));
        float flicker = 0.85 + 0.15 * n;
        float alpha = mid * (0.35 + 0.35 * band) * flicker;
        float edge = 1.0 - abs(vUv.x - 0.5) * 2.0;
        alpha *= pow(edge, 0.35);
        float pulse = 0.75 + 0.25 * sin(uTime * 2.5);
        alpha *= pulse;
        gl_FragColor = vec4(uColor, alpha);
      }
    `,
  });

  tawafBeam = new THREE.Mesh(beamGeometry, beamMaterial);
  tawafBeam.position.y = groundY + 3;
  scene.add(tawafBeam);

  const glowGeometry = new THREE.CylinderGeometry(2.6, 2.6, 6.2, 36, 1, true);
  const glowMaterial = new THREE.MeshBasicMaterial({
    color: 0x00ff66,
    transparent: true,
    opacity: 0.14,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });

  tawafGlow = new THREE.Mesh(glowGeometry, glowMaterial);
  tawafGlow.position.y = groundY + 3;
  scene.add(tawafGlow);

  const ringGeo = new THREE.RingGeometry(1.2, 2.0, 64);
  const ringMat = new THREE.MeshBasicMaterial({
    color: 0x00ff66,
    transparent: true,
    opacity: 0.22,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    depthWrite: false,
  });

  tawafRing = new THREE.Mesh(ringGeo, ringMat);
  tawafRing.rotation.x = -Math.PI / 2;
  tawafRing.position.y = groundY + 0.03;
  scene.add(tawafRing);
}

function updateTawafMarker() {
  if (!tawafBeam) createTawafBeam();

  if (tawafComplete || tawafPoints.length === 0) {
    tawafBeam.visible = false;
    tawafGlow.visible = false;
    tawafRing.visible = false;
    return;
  }

  const point = tawafPoints[activeTawafIndex];
  const center = getTawafPointCenter(point);
  if (!center) return;

  tawafBeam.visible = true;
  tawafGlow.visible = true;
  tawafRing.visible = true;

  tawafBeam.position.set(center.x, groundY + 3, center.z);
  tawafGlow.position.set(center.x, groundY + 3, center.z);
  tawafRing.position.set(center.x, groundY + 0.03, center.z);
}

function beginStep(point) {
  tawafMediaLocked = true;
  lockMovement();

  if (ctx?.hint) ctx.hint.textContent = `${point.title} (Reached)`;

  const isLastPoint = tawafPoints.length > 0 && activeTawafIndex === tawafPoints.length - 1;

  console.log("[Haram] beginStep called:", { pointTitle: point.title, activeTawafIndex, totalPoints: tawafPoints.length, isLastPoint });

  // Disable next button if this is the last point
  if (isLastPoint) {
    console.log("[Haram] Last point detected, calling setNextSceneButton");
    setNextSceneButton();
  }

  if (point.video || point.audio) {
    playCharacterAction("talk");
    playTriggerMedia(ctx, point, {
      onEnded: () => {
        if (ctx?.hint) ctx.hint.textContent = `${point.title} (Done)`;
        playCharacterAction("idle");
      },
    });
  } else {
    // No media, just idle
    playCharacterAction("idle");
    if (ctx?.hint) ctx.hint.textContent = `${point.title} (Done)`;
  }
}



function setNextSceneButton() {
  const nextBtn = document.getElementById("sceneVideoNext");
  const sceneBtn = document.getElementById("sceneNextSceneBtn");

  console.log("[Haram] setNextSceneButton called:", { nextBtn: !!nextBtn, sceneBtn: !!sceneBtn });

  if (!nextBtn || !sceneBtn) {
    console.warn("[Haram] Button elements not found!");
    return;
  }

  // Disable next button
  nextBtn.disabled = true;
  nextBtn.setAttribute("aria-disabled", "true");
  nextBtn.classList.add("hudBtnDisabled");

  // Enable scene button
  sceneBtn.disabled = false;
  sceneBtn.setAttribute("aria-disabled", "false");
  sceneBtn.classList.remove("hudBtnDisabled");

  console.log("[Haram] Buttons updated successfully");
}

function advanceTawaf() {
  if (tawafComplete || tawafPoints.length === 0) return;

  // Function to play specific audio for the Yameni to Hajr-e-Aswad transition
  if (activeTawafIndex === 1) {
    playSfx(ctx.basePath, "media/audio/DuaTawafAi.mp3", 1);
  } else {
    playSfx(ctx.basePath, "media/audio/NextStep.mp3", 1);
  }

  // ✅ This hides video overlay too (same as before)
  stopTriggerMedia(ctx);
  // Ensure we stop talking if we force advance
  // Walking action will override in a moment, but good to be safe.

  tawafMediaLocked = false;
  unlockMovement();

  activeTawafIndex++;

  if (activeTawafIndex >= tawafPoints.length) {
    tawafComplete = true;
    if (ctx?.hint) ctx.hint.textContent = "Tawaf Complete";
    updateTawafMarker();
    setNextSceneButton(); // ✅ Enable SCENE button on last point
    demoCharacterWalking = false;
    demoCharacterWalkTarget = null;
    demoCharacterArcWalk = null;
    playCharacterAction("idle");
    return;
  }

  if (ctx?.hint) ctx.hint.textContent = tawafPoints[activeTawafIndex].title;
  updateTawafMarker();

  // ✅ Demo character moves to next point (same as before)
  if (demoCharacter && tawafPoints[activeTawafIndex]) {
    const nextCenter = getTawafPointCenter(tawafPoints[activeTawafIndex]);
    if (nextCenter) {
      const pos = demoCharacter.position;
      const nextClamp = clampToOutsideKaaba(nextCenter.x, nextCenter.z);
      const tx = nextClamp.x;
      const tz = nextClamp.z;

      const startClamp = clampToOutsideKaaba(pos.x, pos.z);
      const startAngle = Math.atan2(startClamp.x, startClamp.z);
      const endAngle = Math.atan2(tx, tz);

      let totalAngle = (endAngle - startAngle + 2 * Math.PI) % (2 * Math.PI);
      if (totalAngle < 1e-6) totalAngle = 2 * Math.PI;

      const r1 = Math.sqrt(startClamp.x * startClamp.x + startClamp.z * startClamp.z);
      const r2 = Math.sqrt(tx * tx + tz * tz);
      const avgR = (r1 + r2) * 0.5;
      const totalTime = (totalAngle * Math.max(avgR, 1)) / DEMO_CHARACTER_WALK_SPEED;

      demoCharacterWalkTarget = new THREE.Vector3(tx, groundY, tz);
      demoCharacterArcWalk = {
        startAngle,
        totalAngle,
        r1,
        r2,
        totalTime: Math.max(0.5, totalTime),
        t: 0,
      };

      demoCharacter.position.set(startClamp.x, groundY, startClamp.z);
      demoCharacterWalking = true;
      playCharacterAction("walk");

      // Rotate to face movement direction immediately
      const lookTarget = new THREE.Vector3(tx, groundY, tz);
      // Simple lookAt might be wrong if we arc, but good for start
      // For updated rotation see tick()
      demoCharacter.lookAt(lookTarget);
    }
  }
}

// ✅ Dua helpers
async function loadHaramDua(basePath) {
  try {
    const res = await fetch(`${basePath}config/haram_dua.json`, { cache: "no-store" });
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
  }, 10000);
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
async function maybeShowDuaNonBlocking() {
  if (haramDuaShown) return;
  haramDuaShown = true;

  const ui = initDuaUiOnce();
  if (!ui) return;

  if (!ui.data) ui.data = await loadHaramDua(ctx.basePath);
  if (!ui.data) return;

  showDuaPanel(ui.data);
}

function onKeyDown(e) {
  if (e.code === "KeyE") {
    // ✅ Same flow as before: always advance
    // ✅ plus first time dua show (non-blocking)
    maybeShowDuaNonBlocking();
    advanceTawaf();
    return;
  }

  if (e.code === "Space") {
    togglePauseTriggerMedia(ctx);
    return;
  }

  if (movementLocked) return;

  if (e.code === "KeyW") moveForward = true;
  if (e.code === "KeyS") moveBack = true;
  if (e.code === "KeyA") moveLeft = true;
  if (e.code === "KeyD") moveRight = true;
}

function onKeyUp(e) {
  if (e.code === "KeyW") moveForward = false;
  if (e.code === "KeyS") moveBack = false;
  if (e.code === "KeyA") moveLeft = false;
  if (e.code === "KeyD") moveRight = false;
}

function tick() {
  requestAnimationFrame(tick);

  const dt = clock.getDelta();

  if (demoCharacterMixer) {
    demoCharacterMixer.update(dt);
  }

  if (!renderer || !scene) return;

  if (tawafBeam?.material?.uniforms) {
    tawafBeam.material.uniforms.uTime.value += 0.016;
  }

  if (tawafRing) {
    tawafRing.rotation.z += 0.01;
    const t = tawafBeam?.material?.uniforms?.uTime?.value ?? 0;
    tawafRing.material.opacity = 0.16 + 0.08 * (0.5 + 0.5 * Math.sin(t * 2.0));
  }

  // ✅ Unified Movement Logic (Keyboard + Mobile)
  if (!movementLocked) {
    // 1. Reset velocity for this frame
    velocity.set(0, 0, 0);

    // 2. Keyboard Input (only if PointerLock is active)
    if (controls?.isLocked) {
      camera.getWorldDirection(dir);
      dir.y = 0;
      dir.normalize();

      if (moveForward) velocity.add(dir);
      if (moveBack) velocity.sub(dir);

      right.crossVectors(dir, new THREE.Vector3(0, 1, 0));
      if (moveRight) velocity.add(right);
      if (moveLeft) velocity.sub(right);
    }

    // 3. Mobile Input
    if (mobileControls && mobileControls.enabled) {
      // Look
      controls.getObject().rotation.y -= mobileControls.lookVector.x;
      if (mobileControls.lookVector.y !== 0) {
        // Direct camera pitch rotation
        camera.rotation.x -= mobileControls.lookVector.y;
        // Clamp pitch
        const PI_2 = Math.PI / 2;
        camera.rotation.x = Math.max(-PI_2, Math.min(PI_2, camera.rotation.x));
      }

      // Move
      const mv = mobileControls.moveVector;
      // mv.z: Back(+), Forward(-). mv.x: Right(+), Left(-)
      if (mv.lengthSq() > 0.00001) {
        camera.getWorldDirection(dir);
        dir.y = 0;
        dir.normalize();

        right.crossVectors(dir, new THREE.Vector3(0, 1, 0));

        // Add to velocity (accumulate with keyboard if both active)
        // Forward is -z in Joystick land, so we ADD dir * (-z)
        velocity.addScaledVector(dir, -mv.z);
        velocity.addScaledVector(right, mv.x);
      }

      mobileControls.update();
    }

    // 4. Apply Velocity
    if (velocity.lengthSq() > 0) {
      // Clamp magnitude to 1.0 (so diagonals or combined inputs don't exceed max speed)
      if (velocity.lengthSq() > 1) velocity.normalize();

      // Apply Move Speed
      camera.position.addScaledVector(velocity, MOVE_SPEED);
    }
  }

  // Keep height fixed: use configured start Y when available
  if (typeof CAMERA_START_Y === "number") camera.position.y = CAMERA_START_Y;
  else camera.position.y = groundY + 1.6;

  if (!tawafComplete && tawafPoints.length > 0) {
    const point = tawafPoints[activeTawafIndex];
    if (isInsideTawafPoint(point, camera.position) && !tawafMediaLocked) {
      beginStep(point);
    }
  }

  if (demoCharacter) {
    if (demoCharacterWalking && demoCharacterWalkTarget && demoCharacterArcWalk) {
      const pos = demoCharacter.position;
      const arc = demoCharacterArcWalk;
      const dt = 0.016;

      arc.t += dt / arc.totalTime;
      const t = Math.min(1, arc.t);

      const angle = arc.startAngle + arc.totalAngle * t;

      // Base radius from arc interpolation
      let r = arc.r1 + (arc.r2 - arc.r1) * t;

      // ✅ SMOOTH HATEEM AVOIDANCE
      // Calculate angular distance from North (Angle 0, where Z is positive)
      // Normalizing angle to [-PI, PI] for easier distance check
      let normAngle = angle % (2 * Math.PI);
      if (normAngle > Math.PI) normAngle -= 2 * Math.PI;

      // Hateem is roughly at Angle 0. Let's say +/- 60 degrees (PI/3).
      // We want to smoothly push 'r' out to ~25 when near 0.
      const hateemCenterAngle = 0;
      const hateemWidth = Math.PI / 2.5; // Width of influence
      const dist = Math.abs(normAngle - hateemCenterAngle);

      if (dist < hateemWidth) {
        // Smooth blend factor (1 at center, 0 at edges)
        // Cosine bump or simple linear. Cosine is smoother.
        const blend = 0.5 + 0.5 * Math.cos((dist / hateemWidth) * Math.PI);
        const targetRadius = 26; // Enough to clear Hateem
        if (r < targetRadius) {
          r = r + (targetRadius - r) * blend;
        }
      }

      let px = r * Math.sin(angle);
      let pz = r * Math.cos(angle);

      // Relaxed clamping (just keep outside Kaaba box, don't force radius hard if we already adjusted it)
      // We still run clamp for the Box, but the Radius check in clampToOutsideKaaba might fight us
      // if HATEEM_RADIUS is set high.
      // So we should rely on THIS logic for Hateem, and basic Box clamp for Kaaba walls.

      const c = clampToOutsideKaaba(px, pz);
      pos.x = c.x;
      pos.z = c.z;
      pos.y = groundY;

      // Calculate target point slightly ahead to determine facing direction
      const lookT = Math.min(1, t + 0.05);
      const lookAngle = arc.startAngle + arc.totalAngle * lookT;
      let lookR = arc.r1 + (arc.r2 - arc.r1) * lookT;

      // Apply same radius logic
      let lookNormAngle = lookAngle % (2 * Math.PI);
      if (lookNormAngle > Math.PI) lookNormAngle -= 2 * Math.PI;
      const lookDist = Math.abs(lookNormAngle - hateemCenterAngle);

      if (lookDist < hateemWidth) {
        const blend = 0.5 + 0.5 * Math.cos((lookDist / hateemWidth) * Math.PI);
        const targetRadius = 26;
        if (lookR < targetRadius) lookR = lookR + (targetRadius - lookR) * blend;
      }

      const lx = lookR * Math.sin(lookAngle);
      const lz = lookR * Math.cos(lookAngle);
      const lc = clampToOutsideKaaba(lx, lz);

      const lookTarget = new THREE.Vector3(lc.x, groundY, lc.z);
      demoCharacter.lookAt(lookTarget);

      if (arc.t >= 1) {
        demoCharacterWalking = false;
        demoCharacterWalkTarget = null;
        demoCharacterArcWalk = null;
        playCharacterAction("idle");
      }
    } else {
      // ✅ NOT WALKING (Idle)
      // 1. Maintain position at current point if needed (Snapping)
      if (!tawafComplete && tawafPoints.length > 0) {
        const point = tawafPoints[activeTawafIndex];
        const center = getTawafPointCenter(point);
        if (center) {
          const c = clampToOutsideKaaba(center.x, center.z);
          demoCharacter.position.set(c.x, groundY, c.z);
        }
      }

      // 2. ALWAYS Face Camera when idle (Start of scene, or reached point)
      if (camera) {
        // Look at camera but keep Y level (no tipping)
        const target = camera.position.clone();
        target.y = demoCharacter.position.y;
        demoCharacter.lookAt(target);
      }
    }
  }

  renderer.render(scene, camera);
}

function onResize() {
  if (window.sceneRouter && window.sceneRouter.handleSceneResize) {
    window.sceneRouter.handleSceneResize(camera, renderer, ctx.canvas);
  } else {
    if (!renderer || !camera || !ctx?.canvas) return;
    const w = ctx.canvas.clientWidth || window.innerWidth;
    const h = ctx.canvas.clientHeight || window.innerHeight;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
  }
}

function showHajjChoicePanel() {
  const overlay = document.createElement("div");
  overlay.id = "hajjChoiceOverlay";
  overlay.style.cssText = "position:fixed; inset:0; background:rgba(0,0,0,0.85); z-index:100000; display:flex; align-items:center; justify-content:center; backdrop-filter:blur(5px); transition: opacity 0.3s;";

  const panel = document.createElement("div");
  panel.style.cssText = "background:white; padding:40px; border-radius:20px; text-align:center; max-width:500px; border:3px solid #d4af37; box-shadow:0 10px 30px rgba(0,0,0,0.5); font-family:sans-serif;";

  const title = document.createElement("h2");
  title.innerText = "Hajj Rituals Progress";
  title.style.cssText = "color:#d4af37; margin-bottom:20px; font-size:24px; text-transform:uppercase; letter-spacing:1px; margin-top:0;";

  const msg = document.createElement("p");
  msg.innerText = "Would you like to perform Tawaf-el-Ziarat or return to the Main Menu?";
  msg.style.cssText = "color:#333; font-size:18px; line-height:1.6; margin-bottom:30px;";

  const btnStyle = "padding:12px 30px; border-radius:30px; border:none; font-weight:bold; cursor:pointer; font-size:16px; transition:transform 0.2s; margin:10px; width:200px; display:inline-block;";

  const tawafBtn = document.createElement("button");
  tawafBtn.innerText = "Tawaf-el-Ziarat";
  tawafBtn.style.cssText = btnStyle + "background:#d4af37; color:white; border:2px solid #d4af37;";
  tawafBtn.onmouseover = () => tawafBtn.style.transform = "scale(1.05)";
  tawafBtn.onmouseout = () => tawafBtn.style.transform = "scale(1)";

  const menuBtn = document.createElement("button");
  menuBtn.innerText = "Main Menu";
  menuBtn.style.cssText = btnStyle + "background:white; color:#d4af37; border:2px solid #d4af37;";
  menuBtn.onmouseover = () => menuBtn.style.transform = "scale(1.05)";
  menuBtn.onmouseout = () => menuBtn.style.transform = "scale(1)";

  tawafBtn.onclick = () => {
    localStorage.removeItem("hajj_status");
    if (tawafPoints.length > 0) {
      // ✅ Swapping first tawaf audio for Hajj users arriving from Rami
      tawafPoints[0].audio = "media/audio/HajjTawaf1.mp3";
    }
    document.body.removeChild(overlay);
    unlockMovement();
  };

  menuBtn.onclick = () => {
    localStorage.removeItem("hajj_status");
    document.body.removeChild(overlay);
    if (ctx?.window?.sceneRouter) ctx.window.sceneRouter.exitScene();
    else if (window.sceneRouter) window.sceneRouter.exitScene();
    else window.location.reload();
  };

  panel.appendChild(title);
  panel.appendChild(msg);
  panel.appendChild(tawafBtn);
  panel.appendChild(menuBtn);
  overlay.appendChild(panel);
  document.body.appendChild(overlay);
  lockMovement();
}

export async function enter(c) {
  ctx = c;

  const found = autoFindButtons();
  ctx.nextBtn = ctx.nextBtn || found.nextBtn;
  ctx.restartBtn = ctx.restartBtn || found.restartBtn;
  ctx.pauseBtn = ctx.pauseBtn || found.pauseBtn;
  ctx.closeBtn = ctx.closeBtn || found.closeBtn;

  if (ctx.closeBtn) ctx.closeBtn.style.display = "none";

  // ✅ HUD Standardization: Reset to neutral state on entry
  if (ctx.nextBtn) {
    ctx.nextBtn.disabled = false;
    ctx.nextBtn.classList.remove("hudBtnDisabled");
    ctx.nextBtn.style.display = "block";
  }
  const sceneNextBtn = document.getElementById("sceneNextSceneBtn");
  if (sceneNextBtn) {
    sceneNextBtn.disabled = true; // ✅ Disabled until last point
    sceneNextBtn.classList.add("hudBtnDisabled");
    sceneNextBtn.style.display = "block";
    sceneNextBtn.style.zIndex = "1000";
    sceneNextBtn.style.pointerEvents = "auto";
    sceneNextBtn.style.position = "relative";
  }

  // reset dua
  haramDuaShown = false;
  if (duaAutoHideTimer) {
    clearTimeout(duaAutoHideTimer);
    duaAutoHideTimer = null;
  }
  hideDuaPanel();

  // ✅ NEXT button: always advance (same as before) + non-blocking dua once
  if (ctx.nextBtn) {
    ctx.nextBtn.onclick = () => {
      maybeShowDuaNonBlocking();
      advanceTawaf();
    };
  }

  if (ctx.restartBtn) {
    ctx.restartBtn.onclick = () => {
      if (tawafComplete || tawafPoints.length === 0) return;
      lockMovement();
      const point = tawafPoints[activeTawafIndex];
      restartTriggerMedia(ctx, point);
    };
  }

  if (ctx.pauseBtn) ctx.pauseBtn.onclick = () => togglePauseTriggerMedia(ctx);

  setNextVisible();

  const { canvas, basePath } = ctx;

  const sceneConfig = await loadSceneConfig(basePath);
  groundY = sceneConfig?.groundY ?? 0;

  const camStart = sceneConfig?.cameraStart;
  const startX = Array.isArray(camStart) && camStart.length >= 1 ? camStart[0] : 0;
  const startY = Array.isArray(camStart) && camStart.length >= 2 ? camStart[1] : groundY + 1.6;
  const startZ = Array.isArray(camStart) && camStart.length >= 3 ? camStart[2] : 5;

  // Persist for update loop so we don't override configured startY
  CAMERA_START_Y = startY;

  tawafPoints = await loadTawaf(basePath);
  tawafPoints = (tawafPoints || []).map((p) => ({
    ...p,
    video: p.video || p.media?.video || "",
    audio: p.audio || p.media?.audio || "",
  }));

  activeTawafIndex = 0;
  tawafMediaLocked = false;
  tawafComplete = false;
  movementLocked = false;

  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x87ceeb);

  const w = canvas.clientWidth || window.innerWidth;
  const h = canvas.clientHeight || window.innerHeight;

  camera = new THREE.PerspectiveCamera(75, w / h, 0.1, 1000);
  camera.rotation.order = "YXZ";
  camera.position.set(startX, startY, startZ);
  camera.lookAt(0, startY, 0);

  renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setSize(w, h);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = true;

  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.88;

  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

  controls = new PointerLockControls(camera, document.body);
  scene.add(controls.getObject());

  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(80, 80),
    new THREE.MeshStandardMaterial({ color: 0x2e2e2e, roughness: 0.95 })
  );
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  floor.position.y = groundY;
  scene.add(floor);

  scene.add(new THREE.AmbientLight(0xffffff, 0.35));
  scene.add(new THREE.HemisphereLight(0xffffff, 0x4a4a4a, 0.55));

  const sun = new THREE.DirectionalLight(0xffffff, 1.35);
  sun.position.set(15, 25, 15);
  scene.add(sun);

  const fill = new THREE.DirectionalLight(0xb8d4f0, 0.35);
  fill.position.set(-10, 10, -5);
  scene.add(fill);

  createTawafBeam();
  updateTawafMarker();

  mobileControls = new MobileControls();
  // Don't add to scene, just logic.

  // demoCharacter = createDemoCharacter(); // OLD
  // scene.add(demoCharacter);             // OLD

  // ✅ New Async Load
  loadDemoCharacter(scene, basePath).then((model) => {
    if (!model) return;

    if (tawafPoints.length > 0) {
      const firstCenter = getTawafPointCenter(tawafPoints[0]);
      if (firstCenter) {
        const c2 = clampToOutsideKaaba(firstCenter.x, firstCenter.z);
        model.position.set(c2.x, groundY, c2.z);

        // Face initial direction (tangent-ish) or just toward center?
        // Let's face the next point if possible, or just tangent.
        // For now, looking at 0,0 (Kaaba) might be weird for Tawaf.
        // Let's look along the tangent (-z, x). 
        // Tangent of circle at (x,z) is (-z, x) for CCW.
        model.rotation.y = Math.atan2(-c2.x, c2.z);
      }
    } else {
      model.position.set(-11, groundY, -6);
    }
  });

  demoCharacterWalking = false;
  demoCharacterWalkTarget = null;

  demoCharacterWalking = false;
  demoCharacterWalkTarget = null;
  demoCharacterArcWalk = null;

  await loadHaramModel(scene, basePath);

  document.addEventListener("keydown", onKeyDown);
  document.addEventListener("keyup", onKeyUp);
  window.addEventListener("resize", onResize);

  canvas.addEventListener("click", () => {
    if (controls && !controls.isLocked) controls.lock();
  });

  if (ctx?.hint && tawafPoints.length > 0) ctx.hint.textContent = tawafPoints[0].title;

  if (mobileControls) {
    mobileControls.enable();
  }

  // Check Hajj Completion
  if (localStorage.getItem("hajj_status") === "completed") {
    showHajjChoicePanel();
  }

  tick();
}

export function exit() {
  document.removeEventListener("keydown", onKeyDown);
  document.removeEventListener("keyup", onKeyUp);
  window.removeEventListener("resize", onResize);

  if (duaAutoHideTimer) {
    clearTimeout(duaAutoHideTimer);
    duaAutoHideTimer = null;
  }

  hideDuaPanel();
  duaUi = null;
  haramDuaShown = false;

  if (renderer) {
    renderer.dispose();
    renderer = null;
  }

  scene = null;
  camera = null;
  controls = null;
  if (mobileControls) {
    mobileControls.disable();
    mobileControls = null;
  }
  tawafPoints = [];
  ctx = null;

  tawafBeam = null;
  tawafGlow = null;
  tawafRing = null;
  demoCharacter = null;
  demoCharacterWalkTarget = null;
  demoCharacterWalking = false;
  demoCharacterArcWalk = null;
}
