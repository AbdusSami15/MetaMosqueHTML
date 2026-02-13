import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

import { loadPoints, isInsidePoint, getPointCenter } from "./points.js";
import { playTriggerMedia, stopTriggerMedia, restartTriggerMedia, togglePauseTriggerMedia } from "./media.js";

let ctx = null;

let scene = null;
let camera = null;
let renderer = null;

let modelRoot = null;

let points = [];
let activeIndex = 0;
let mediaLocked = false;      // when true => player movement locked until NEXT pressed
let completed = false;

let marker = null;

const keys = Object.create(null);
let yaw = 0;
let pitch = 0;
let dragging = false;

let rafId = 0;
let lastT = 0;

const PLAYER_HEIGHT = 1.6;
const MOVE_SPEED = 2.2;       // meters/sec (tune)
const LOOK_SENS = 0.0022;     // mouse sensitivity (tune)

/** ✅ Marker width/size controls (YOU asked “width kam karni ho to kahan?”) */
const MARKER_RADIUS = 0.9;    // <-- width (kam/zyaada yahan se)
const MARKER_HEIGHT = 3.2;

/** Small helpers */
function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

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
  const btn = document.getElementById("sceneNextSceneBtn");
  if (!btn) return;

  btn.disabled = !enabled;
  btn.setAttribute("aria-disabled", enabled ? "false" : "true");

  if (enabled) btn.classList.remove("hudBtnDisabled");
  else btn.classList.add("hudBtnDisabled");
}

function setVideoTitle(text) {
  if (ctx?.videoTitle && typeof text === "string") ctx.videoTitle.textContent = text;
}

function setHint(text) {
  if (ctx?.hint && typeof text === "string") ctx.hint.textContent = text;
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

  // soft glow disc on bottom
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
  marker.position.set(c.x, c.y + MARKER_HEIGHT * 0.5, c.z);

  // show hint
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

    // play video+audio (loop video until audio ends)
    playTriggerMedia(ctx, p, {
      onEnded: () => {
        // audio finished, keep locked until user presses NEXT (matches your requirement)
        setHint(`${p.title || p.id} (Done) - press NEXT`);
      }
    });

    setHint(`${p.title || p.id} (Playing)`);
  }
}

function goNextPoint() {
  if (completed) return;

  // If media is playing/locked => stop it first
  if (mediaLocked) {
    stopAllMedia();
  }

  // Advance
  if (activeIndex < points.length - 1) {
    activeIndex += 1;
    moveMarkerToPoint(activeIndex);
    setHint(`${points[activeIndex].title || points[activeIndex].id} (Reach)`);
    return;
  }

  // last point completed => enable SCENE button
  completed = true;
  moveMarkerToPoint(-1);
  setSceneButtonEnabled(true);
  setHint("All done - press SCENE");
}

function onNextSceneClick() {
  if (!completed) return;

  // IMPORTANT: When going next scene, video overlay off, just scene load
  stopAllMedia();
  if (ctx?.videoOverlay) ctx.videoOverlay.classList.add("hidden");

  // Let your router handle navigation
  window.dispatchEvent(new CustomEvent("metamosque:goToScene", {
    detail: {
      sceneName: "al-haram" // <-- change if you want another target
    }
  }));
}

/** Input + movement (no PointerLock errors) */
function onKeyDown(e) { keys[e.code] = true; }
function onKeyUp(e) { keys[e.code] = false; }

function onMouseDown(e) {
  if (!ctx?.canvas) return;
  if (e.button !== 0) return;
  dragging = true;
}

function onMouseUp() { dragging = false; }

function onMouseMove(e) {
  if (!dragging) return;
  yaw -= e.movementX * LOOK_SENS;
  pitch -= e.movementY * LOOK_SENS;
  pitch = clamp(pitch, -1.1, 1.1);

  camera.rotation.order = "YXZ";
  camera.rotation.y = yaw;
  camera.rotation.x = pitch;
}

function step(dt) {
  if (mediaLocked) return;

  const forward = (keys["KeyW"] ? 1 : 0) + (keys["ArrowUp"] ? 1 : 0) - (keys["KeyS"] ? 1 : 0) - (keys["ArrowDown"] ? 1 : 0);
  const strafe  = (keys["KeyD"] ? 1 : 0) + (keys["ArrowRight"] ? 1 : 0) - (keys["KeyA"] ? 1 : 0) - (keys["ArrowLeft"] ? 1 : 0);

  if (forward === 0 && strafe === 0) return;

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
  camera.position.y = PLAYER_HEIGHT;
}

function tick(t) {
  rafId = requestAnimationFrame(tick);
  const now = (t || performance.now());
  const dt = Math.min(0.05, (now - lastT) / 1000);
  lastT = now;

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
  // point controls
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

  if (sceneBtn) sceneBtn.onclick = () => onNextSceneClick();
}

export async function enter(c) {
  ctx = c;

  // Always start clean: no leftover overlay from previous scene
  stopAllMedia();
  if (ctx?.videoOverlay) ctx.videoOverlay.classList.add("hidden");

  const basePath = ctx.basePath;

  // load config
  const cfg = await loadSceneConfig(basePath);
  const groundY = (cfg?.groundY ?? 0);

  // points
  points = await loadPoints(basePath);
  points = (points || []).map(p => ({
    ...p,
    video: p.video || p.media?.video || "",
    audio: p.audio || p.media?.audio || "",
  }));

  activeIndex = 0;
  mediaLocked = false;
  completed = false;

  // build scene
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x87ceeb);

  const w = ctx.canvas.clientWidth || window.innerWidth;
  const h = ctx.canvas.clientHeight || window.innerHeight;

  camera = new THREE.PerspectiveCamera(75, w / h, 0.1, 2000);

  const cs = cfg?.cameraStart;
  const startX = Array.isArray(cs) ? (cs[0] ?? 0) : 0;
  const startY = Array.isArray(cs) ? (cs[1] ?? (groundY + PLAYER_HEIGHT)) : (groundY + PLAYER_HEIGHT);
  const startZ = Array.isArray(cs) ? (cs[2] ?? 0) : 0;

  camera.position.set(startX, startY, startZ);
  camera.rotation.order = "YXZ";
  yaw = camera.rotation.y;
  pitch = camera.rotation.x;

  renderer = new THREE.WebGLRenderer({ canvas: ctx.canvas, antialias: true });
  renderer.setSize(w, h);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  // lighting
  scene.add(new THREE.AmbientLight(0xffffff, 0.55));
  const sun = new THREE.DirectionalLight(0xffffff, 1.0);
  sun.position.set(15, 25, 15);
  scene.add(sun);

  // floor (simple)
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(200, 200),
    new THREE.MeshStandardMaterial({ color: 0xb8b8b8, roughness: 0.95 })
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = groundY;
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

  // marker
  marker = createMarker();
  scene.add(marker);
  moveMarkerToPoint(activeIndex);

  // UI
  setVideoTitle("UMRAH: MAKKAH");
  ensureOverlayVisible();          // start layout visible like your screenshot
  setSceneButtonEnabled(false);    // SCENE disabled at start

  // IMPORTANT: at start no media auto-play until collision
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

  if (renderer) {
    renderer.dispose();
    renderer = null;
  }

  scene = null;
  camera = null;
  modelRoot = null;
  marker = null;
  points = [];
  ctx = null;
}
