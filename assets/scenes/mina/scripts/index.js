// assets/scenes/mina/scripts/index.js
// First-person scene for Mina — Sequential Media + Standard HUD UI

import * as THREE from "three";
import { PointerLockControls } from "three/examples/jsm/controls/PointerLockControls.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import {
  stopTriggerMedia,
  initMediaSequence,
  startSequence,
  nextStep,
  prevStep,
  rewind,
  togglePause,
  setVideoTitle,
} from "./media.js";
import { MobileControls } from "./mobileControls.js";

// ─── Module state ─────────────────────────────────────────────────────────────
let ctx = null;
let scene = null;
let camera = null;
let renderer = null;
let controls = null;
let animId = 0;
let mobileControls = null;
let envModel = null;
let characterModel = null;
let mixer = null;
let idleAction = null;
let lastT = 0;

let velocity = new THREE.Vector3();
let moveForward = false;
let moveBack = false;
let moveLeft = false;
let moveRight = false;

const _dir = new THREE.Vector3();
const _right = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);
const _tmpV = new THREE.Vector3();

// Sequential Media & Trigger
let points = [];
let activePointIdx = 0;
let triggered = false;
let completed = false;
let triggerMesh = null;
const TRIGGER_POS = new THREE.Vector3(0, 0, 18.0);
const CHARACTER_POS = new THREE.Vector3(0, 2, 18.0); // Edit this for Imam's position
const TRIGGER_DIST = 4.0;

// Input
const keys = Object.create(null);
let yaw = 0;
let pitch = 0;

// Settings
let MOVE_SPEED = 5.0;
let EYE_HEIGHT = 1.8;
let MIN_GROUND_Y = 0;
let WALK_Y = 1.8;
const LOOK_SENS = 0.0022;

const CHARACTER_FOLLOW_CAMERA = true;
const CHARACTER_OFFSET = new THREE.Vector3(1.0, -0.2, -2.5);

function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

// ─── Helpers ──────────────────────────────────────────────────────────────────
function makeUrl(basePath, p) {
  if (!p) return null;
  if (/^https?:\/\//i.test(p)) return p;
  if (p.startsWith("/")) return p;
  if (p.startsWith("assets/")) return "./" + p;
  try {
    return new URL(p, new URL(basePath, window.location.href)).href;
  } catch (_) {
    return basePath + p;
  }
}

function applyMobileLook() {
  if (!mobileControls || !mobileControls.enabled) return;
  if (controls) {
    controls.getObject().rotation.y += mobileControls.lookVector.x;
    camera.rotation.x += mobileControls.lookVector.y;
    camera.rotation.x = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, camera.rotation.x));
  }
}

function step(dt) {
  if (!camera) return;
  velocity.set(0, 0, 0);

  // Keyboard (available immediately; does not require pointer lock)
  if (controls) {
    camera.getWorldDirection(_dir);
    _dir.y = 0; _dir.normalize();
    _right.crossVectors(_dir, _up).normalize();

    if (moveForward) velocity.add(_dir);
    if (moveBack) velocity.sub(_dir);
    if (moveRight) velocity.add(_right);
    if (moveLeft) velocity.sub(_right);
  }

  // Mobile
  if (mobileControls && mobileControls.enabled) {
    const mv = mobileControls.moveVector;
    if (mv.lengthSq() > 0.0001) {
      camera.getWorldDirection(_dir);
      _dir.y = 0; _dir.normalize();
      _right.crossVectors(_dir, _up).normalize();

      velocity.addScaledVector(_dir, mv.z);
      velocity.addScaledVector(_right, mv.x);
    }
  }

  if (velocity.lengthSq() > 0) {
    if (velocity.lengthSq() > 1) velocity.normalize();
    camera.position.addScaledVector(velocity, MOVE_SPEED * dt);
  }

  camera.position.y = WALK_Y;
}

function updateCharacter() {
  if (!characterModel || !camera) return;

  // Position stationary at CHARACTER_POS
  characterModel.position.copy(CHARACTER_POS);
  characterModel.position.y = CHARACTER_POS.y || 0;

  // Face the camera (continuously)
  _tmpV.copy(camera.position);
  _tmpV.y = characterModel.position.y; // Look horizontally
  characterModel.lookAt(_tmpV);

  // Removed +Math.PI offset as model front appears to be Z+ or lookAt is sufficient
}

function checkTrigger() {
  if (triggered || !camera) return;

  // Distance on XZ plane
  const dx = camera.position.x - TRIGGER_POS.x;
  const dz = camera.position.z - TRIGGER_POS.z;
  const distSq = dx * dx + dz * dz;

  if (distSq < TRIGGER_DIST * TRIGGER_DIST) {
    triggered = true;
    if (triggerMesh) triggerMesh.visible = false;
    if (controls) controls.unlock();

    // Start full media sequence
    if (points.length > 0) {
      setVideoTitle("MINA"); 
      initMediaSequence(ctx, points, {
        isNavLocked: false,
        onEnded: () => {
          completed = true; 
        }
      });
    }

    if (ctx.hint) ctx.hint.textContent = "Media started · Use HUD to navigate";
  }
}

// ─── Event handlers ──────────────────────────────────────────────────────────
function onKeyDown(e) {
  if (e.code === "KeyW") moveForward = true;
  if (e.code === "KeyS") moveBack = true;
  if (e.code === "KeyA") moveLeft = true;
  if (e.code === "KeyD") moveRight = true;

  if (e.code === "Space") {
    togglePause();
    return;
  }
}

function onKeyUp(e) {
  if (e.code === "KeyW") moveForward = false;
  if (e.code === "KeyS") moveBack = false;
  if (e.code === "KeyA") moveLeft = false;
  if (e.code === "KeyD") moveRight = false;
}

function onResize() {
  if (window.sceneRouter && window.sceneRouter.handleSceneResize) {
    window.sceneRouter.handleSceneResize(camera, renderer, ctx.canvas);
  } else {
    if (!ctx?.canvas || !camera || !renderer) return;
    const w = ctx.canvas.clientWidth;
    const h = ctx.canvas.clientHeight;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
  }
}

function tick(t) {
  animId = requestAnimationFrame(tick);
  if (!scene || !renderer || !camera) return;
  const dt = Math.min(0.05, (t - (lastT || t)) / 1000);
  lastT = t;

  if (mixer) mixer.update(dt);

  applyMobileLook();
  if (mobileControls) mobileControls.update();
  step(dt);
  checkTrigger();
  updateCharacter();
  renderer.render(scene, camera);
}

// ─── UI Binding ──────────────────────────────────────────────────────────────
function bindUI() {
  const controlsArea = document.querySelector('.sceneVideoControls');
  if (controlsArea) {
    controlsArea.onclick = (e) => {
      const btn = e.target.closest('[data-action]');
      if (!btn) return;

      const action = btn.getAttribute('data-action');
      console.log("[Mina] Control clicked:", action);

      switch (action) {
        case "scenePlay":
          startSequence();
          break;
        case "sceneRewind":
          rewind();
          break;
        case "scenePause":
          togglePause();
          break;
        case "scenePrevStep":
          prevStep();
          break;
        case "sceneNextStep":
          nextStep();
          break;
        case "sceneNextScene":
          e.stopPropagation();
          onNextSceneClick();
          break;
      }
    };
  }
}

function onNextSceneClick() {
  if (!completed) {
    console.warn("[Mina] Cannot proceed: Playlist not finished");
    return;
  }
  
  stopTriggerMedia(ctx);
  // Transition to Arafat scene
  window.dispatchEvent(new CustomEvent("metamosque:goToScene", {
    detail: { sceneName: "ARAFAT", sceneId: "arafat" }
  }));
}

// ─── Enter / Exit ────────────────────────────────────────────────────────────
export async function enter(c) {
  ctx = c;
  const { canvas, basePath } = ctx;
  if (!canvas) return;

  // ✅ HUD Standardization: Reset handled via initMediaSequence later

  let cfg = {};
  try {
    const res = await fetch(`${basePath}config/scene.config.json`);
    if (res.ok) cfg = await res.json();
  } catch (_) { }

  points = cfg?.points || [];
  activePointIdx = 0;

  const camStart = cfg?.cameraStart || [0, 1.8, 12];
  MIN_GROUND_Y = cfg?.groundY || 0;
  EYE_HEIGHT = cfg?.eyeHeight || 1.8;
  WALK_Y = camStart[1] ?? (MIN_GROUND_Y + EYE_HEIGHT);

  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x87ceeb);

  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  camera = new THREE.PerspectiveCamera(70, w / h, 0.1, 1000);
  camera.rotation.order = "YXZ";
  camera.rotation.set(0, 0, 0);
  camera.position.set(camStart[0] ?? 0, WALK_Y, camStart[2] ?? 12);

  renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setSize(w, h);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

  controls = new PointerLockControls(camera, document.body);
  scene.add(controls.getObject());

  canvas.addEventListener("click", () => {
    if (controls && !controls.isLocked) controls.lock();
  });

  const yawVal = cfg?.cameraYaw || 0;
  const pitchVal = cfg?.cameraPitch || 0;
  controls.getObject().rotation.y = yawVal;
  camera.rotation.x = pitchVal;

  canvas.tabIndex = 0;
  canvas.style.outline = "none";
  try { canvas.focus(); } catch (_) { }

  scene.add(new THREE.HemisphereLight(0xffffff, 0x8888aa, 0.9));
  const sun = new THREE.DirectionalLight(0xffffff, 1.0);
  sun.position.set(10, 20, 10);
  scene.add(sun);

  // Trigger Visual: White Base + Tall Translucent Green Column
  const triggerGroup = new THREE.Group();

  // 1. White glowing base
  const baseGeo = new THREE.CircleGeometry(2.0, 32);
  const baseMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.8, side: THREE.DoubleSide });
  const baseMesh = new THREE.Mesh(baseGeo, baseMat);
  baseMesh.rotation.x = -Math.PI / 2;
  baseMesh.position.y = 0.05;
  triggerGroup.add(baseMesh);

  // 2. Tall green cylinder
  const columnHeight = 20;
  const columnGeo = new THREE.CylinderGeometry(2.0, 2.0, columnHeight, 32, 1, true);
  const columnMat = new THREE.MeshBasicMaterial({ color: 0x00ff00, transparent: true, opacity: 0.3, side: THREE.DoubleSide });
  const columnMesh = new THREE.Mesh(columnGeo, columnMat);
  columnMesh.position.y = columnHeight / 2;
  triggerGroup.add(columnMesh);

  triggerMesh = triggerGroup;
  triggerMesh.position.copy(TRIGGER_POS);
  scene.add(triggerMesh);

  // Ground plane
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(500, 500), new THREE.MeshLambertMaterial({ color: 0xc2a96e }));
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = MIN_GROUND_Y;
  scene.add(ground);

  const loader = new GLTFLoader();

  // Load Env
  const envUrl = makeUrl(basePath, cfg?.model?.path || "media/models/mina_placeholder.glb");
  const envPromise = new Promise((resolve) => {
    loader.load(envUrl, (gltf) => {
      envModel = gltf.scene;
      envModel.scale.setScalar(cfg?.model?.scale || 1);
      const p = cfg?.model?.position || [0, 0, 0];
      envModel.position.set(p[0], p[1], p[2]);
      scene.add(envModel);
      resolve(true);
    }, undefined, (err) => {
      console.warn("[Mina] Env Model missing:", err);
      resolve(false);
    });
  });

  // Load Character
  const charCfg = cfg?.character;
  const charPromise = charCfg?.path ? new Promise((resolve) => {
    loader.load(makeUrl(basePath, charCfg.path), (gltf) => {
      characterModel = gltf.scene;

      // Significantly increased scale as requested
      const baseScale = charCfg.scale || 1.1;
      characterModel.scale.setScalar(baseScale * 3.3);

      scene.add(characterModel);

      // Animations
      if (gltf.animations && gltf.animations.length > 0) {
        mixer = new THREE.AnimationMixer(characterModel);
        // Find 'idle' or first clip
        const clip = gltf.animations.find(a => a.name.toLowerCase().includes("idle")) || gltf.animations[0];
        idleAction = mixer.clipAction(clip);
        idleAction.play();
      }
      resolve(true);
    }, undefined, (err) => {
      console.warn("[Mina] Character Model missing:", err);
      resolve(false);
    });
  }) : Promise.resolve(false);

  // Keep global loading overlay until key assets finish loading
  await Promise.all([envPromise, charPromise]);

  // No auto-play here anymore. Handled by checkTrigger()
  triggered = false;

  // Events
  document.addEventListener("keydown", onKeyDown);
  document.addEventListener("keyup", onKeyUp);
  window.addEventListener("resize", onResize);

  bindUI();
  if (ctx.hint) ctx.hint.textContent = "WASD to move";

  mobileControls = new MobileControls();
  if (mobileControls) mobileControls.enable();

  lastT = performance.now();
  animId = requestAnimationFrame(tick);
}

export function exit() {
  if (animId) cancelAnimationFrame(animId);
  animId = 0; lastT = 0;

  document.removeEventListener("keydown", onKeyDown);
  document.removeEventListener("keyup", onKeyUp);
  window.removeEventListener("resize", onResize);

  if (controls) {
    controls.unlock();
    controls = null;
  }

  if (mobileControls) {
    mobileControls.disable();
    mobileControls = null;
  }

  stopTriggerMedia(ctx);

  if (envModel) scene?.remove(envModel);
  if (characterModel) scene?.remove(characterModel);
  if (renderer) renderer.dispose();

  scene = null; camera = null; renderer = null; ctx = null;
}
