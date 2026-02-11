// index.js (FULL REPLACE)
// Tawaf: always-on NEXT (can skip anytime), no CLOSE button, beam marker (particle-like),
// media playback with movement lock on trigger, Restart/Pause buttons wired.

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

const MOVE_SPEED = 0.15;

let renderer, scene, camera, controls;
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

// Marker (beam) instead of black box
let tawafBeam = null;
let tawafGlow = null;
let tawafRing = null;

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
    a.play().catch(() => {});
  } catch (_) {}
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

// NEXT must always be visible
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
  // Inner animated beam
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

  // Outer glow aura (this is the "outer wall" width)
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

  // Ground ring
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
  // On collide: lock player and play media
  tawafMediaLocked = true;
  lockMovement();

  if (ctx?.hint) ctx.hint.textContent = `${point.title} (Reached)`;
  console.log("[Tawaf] Enter:", point.id);

  if (point.video || point.audio) {
    playTriggerMedia(ctx, point, {
      onEnded: () => {
        // NEXT is always available, so we just show status.
        // If you want movement to unlock automatically after audio ends, call unlockMovement() here.
        if (ctx?.hint) ctx.hint.textContent = `${point.title} (Done)`;
      },
    });
  } else {
    if (ctx?.hint) ctx.hint.textContent = `${point.title} (Done)`;
  }
}

// NEXT: always works anytime (even during locked / media playing)
function advanceTawaf() {
  if (tawafComplete || tawafPoints.length === 0) return;

  // Optional sfx on Next
  playSfx(ctx.basePath, "media/audio/NextStep.mp3", 1);

  // Stop current media + unlock immediately
  stopTriggerMedia(ctx);
  tawafMediaLocked = false;
  unlockMovement();

  activeTawafIndex++;

  if (activeTawafIndex >= tawafPoints.length) {
    tawafComplete = true;
    if (ctx?.hint) ctx.hint.textContent = "Tawaf Complete";
    updateTawafMarker();
    return;
  }

  if (ctx?.hint) ctx.hint.textContent = tawafPoints[activeTawafIndex].title;
  updateTawafMarker();
}

function onKeyDown(e) {
  // Always allow NEXT (E) and Pause (Space)
  if (e.code === "KeyE") {
    advanceTawaf();
    return;
  }
  if (e.code === "Space") {
    togglePauseTriggerMedia(ctx);
    return;
  }

  // Movement keys ignored while locked
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

  // Animate marker (cheap)
  if (tawafBeam?.material?.uniforms) {
    tawafBeam.material.uniforms.uTime.value += 0.016;
  }
  if (tawafRing) {
    tawafRing.rotation.z += 0.01;
    const t = tawafBeam?.material?.uniforms?.uTime?.value ?? 0;
    tawafRing.material.opacity = 0.16 + 0.08 * (0.5 + 0.5 * Math.sin(t * 2.0));
  }

  if (controls?.isLocked && !movementLocked) {
    velocity.set(0, 0, 0);

    camera.getWorldDirection(dir);
    dir.y = 0;
    dir.normalize();

    if (moveForward) velocity.add(dir);
    if (moveBack) velocity.sub(dir);

    right.crossVectors(dir, new THREE.Vector3(0, 1, 0));
    if (moveRight) velocity.add(right);
    if (moveLeft) velocity.sub(right);

    if (velocity.lengthSq() > 0) {
      velocity.normalize().multiplyScalar(MOVE_SPEED);
      camera.position.add(velocity);
    }

    camera.position.y = groundY + 1.6;
  }

  // Trigger detection (collide)
  if (!tawafComplete && tawafPoints.length > 0) {
    const point = tawafPoints[activeTawafIndex];
    if (isInsideTawafPoint(point, camera.position) && !tawafMediaLocked) {
      beginStep(point);
    }
  }

  renderer.render(scene, camera);
}

function onResize() {
  if (!renderer || !camera || !ctx?.canvas) return;
  const w = ctx.canvas.clientWidth || window.innerWidth;
  const h = ctx.canvas.clientHeight || window.innerHeight;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
}

export async function enter(c) {
  ctx = c;

  // Auto-detect UI buttons if not passed
  const found = autoFindButtons();
  ctx.nextBtn = ctx.nextBtn || found.nextBtn;
  ctx.restartBtn = ctx.restartBtn || found.restartBtn;
  ctx.pauseBtn = ctx.pauseBtn || found.pauseBtn;
  ctx.closeBtn = ctx.closeBtn || found.closeBtn;

  // No CLOSE button needed
  if (ctx.closeBtn) ctx.closeBtn.style.display = "none";

  // Wire buttons
  if (ctx.nextBtn) ctx.nextBtn.onclick = () => advanceTawaf();

  if (ctx.restartBtn) {
    ctx.restartBtn.onclick = () => {
      if (tawafComplete || tawafPoints.length === 0) return;

      // Restart replays current step media. Keep player locked (like current design).
      lockMovement();
      const point = tawafPoints[activeTawafIndex];
      restartTriggerMedia(ctx, point);
    };
  }

  if (ctx.pauseBtn) ctx.pauseBtn.onclick = () => togglePauseTriggerMedia(ctx);

  // Next always visible
  setNextVisible();

  const { canvas, basePath } = ctx;

  const sceneConfig = await loadSceneConfig(basePath);
  groundY = sceneConfig?.groundY ?? 0;

  const camStart = sceneConfig?.cameraStart;
  const startX = Array.isArray(camStart) && camStart.length >= 1 ? camStart[0] : 0;
  const startY = Array.isArray(camStart) && camStart.length >= 2 ? camStart[1] : groundY + 1.6;
  const startZ = Array.isArray(camStart) && camStart.length >= 3 ? camStart[2] : 5;

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
  scene.fog = new THREE.Fog(0x87ceeb, 35, 140);

  const w = canvas.clientWidth || window.innerWidth;
  const h = canvas.clientHeight || window.innerHeight;

  camera = new THREE.PerspectiveCamera(75, w / h, 0.1, 1000);
  camera.position.set(startX, startY, startZ);
  camera.lookAt(0, startY, 0);

  renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setSize(w, h);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = true;

  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;

  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

  controls = new PointerLockControls(camera, document.body);
  scene.add(controls.getObject());

  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(80, 80),
    new THREE.MeshStandardMaterial({ color: 0xb8b8b8, roughness: 0.95 })
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

  // Create and position marker
  createTawafBeam();
  updateTawafMarker();

  await loadHaramModel(scene, basePath);

  document.addEventListener("keydown", onKeyDown);
  document.addEventListener("keyup", onKeyUp);
  window.addEventListener("resize", onResize);

  canvas.addEventListener("click", () => {
    if (controls && !controls.isLocked) controls.lock();
  });

  if (ctx?.hint && tawafPoints.length > 0) ctx.hint.textContent = tawafPoints[0].title;

  tick();
}

export function exit() {
  document.removeEventListener("keydown", onKeyDown);
  document.removeEventListener("keyup", onKeyUp);
  window.removeEventListener("resize", onResize);

  if (renderer) {
    renderer.dispose();
    renderer = null;
  }

  scene = null;
  camera = null;
  controls = null;
  tawafPoints = [];
  ctx = null;

  tawafBeam = null;
  tawafGlow = null;
  tawafRing = null;
}
