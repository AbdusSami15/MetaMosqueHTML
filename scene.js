import * as THREE from "three";
import { PointerLockControls } from "three/examples/jsm/controls/PointerLockControls.js";

const sceneRoot = document.getElementById("sceneRoot");
const sceneCanvas = document.getElementById("sceneCanvas");
const sceneHint = document.getElementById("sceneHint");
const sceneVideoOverlay = document.getElementById("sceneVideoOverlay");
const sceneVideo = document.getElementById("sceneVideo");
const sceneAudio = document.getElementById("sceneAudio");

const MOVE_SPEED = 0.15;
const TRIGGER_MEDIA = [
  { video: "./assets/media/videos/umrah/Kaba video compressed.mp4", audio: "./assets/media/audio/umrah/UmrahNiyatFinal.mp3" },
];
const TRIGGERS = [
  { min: new THREE.Vector3(4, 0, 4), max: new THREE.Vector3(8, 3, 8) },
];

let renderer, scene, camera, controls;
let rafId = null;
let activeTriggerIndex = -1;
let moveForward = false, moveBack = false, moveLeft = false, moveRight = false;

function isInsideTrigger(pos, t) {
  return pos.x >= t.min.x && pos.x <= t.max.x &&
         pos.y >= t.min.y && pos.y <= t.max.y &&
         pos.z >= t.min.z && pos.z <= t.max.z;
}

function updateTriggerState() {
  if (!camera) return;
  const pos = camera.position;
  const idx = TRIGGERS.findIndex(t => isInsideTrigger(pos, t));
  if (idx === activeTriggerIndex) return;
  if (activeTriggerIndex >= 0) stopTriggerMedia();
  activeTriggerIndex = idx;
  if (activeTriggerIndex >= 0) playTriggerMedia();
}

function stopTriggerMedia() {
  if (sceneVideo) {
    sceneVideo.pause();
    sceneVideo.removeAttribute("src");
    sceneVideo.load();
  }
  if (sceneAudio) sceneAudio.pause();
  if (sceneVideoOverlay) sceneVideoOverlay.classList.add("hidden");
}

function playTriggerMedia() {
  const item = TRIGGER_MEDIA[activeTriggerIndex] || TRIGGER_MEDIA[0];
  if (!item || !sceneVideo || !sceneAudio) return;
  sceneVideo.src = item.video;
  sceneVideo.load();
  sceneVideo.loop = true;
  sceneVideo.preload = "metadata";
  sceneAudio.src = item.audio;
  sceneAudio.load();
  sceneAudio.preload = "metadata";
  sceneVideo.onended = null;
  sceneAudio.onended = () => {
    if (sceneVideo) sceneVideo.pause();
    if (sceneVideoOverlay) sceneVideoOverlay.classList.add("hidden");
  };
  if (sceneVideoOverlay) sceneVideoOverlay.classList.remove("hidden");
  Promise.all([sceneVideo.play(), sceneAudio.play()]).catch(() => stopTriggerMedia());
}

function initScene() {
  if (!sceneCanvas || !sceneRoot) return;

  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x87ceeb);

  camera = new THREE.PerspectiveCamera(75, sceneCanvas.offsetWidth / sceneCanvas.offsetHeight, 0.1, 1000);
  camera.position.set(0, 1.6, 5);

  renderer = new THREE.WebGLRenderer({ canvas: sceneCanvas, antialias: true });
  renderer.setSize(sceneCanvas.offsetWidth, sceneCanvas.offsetHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  controls = new PointerLockControls(camera, document.body);
  scene.add(controls.getObject());

  const floorGeo = new THREE.PlaneGeometry(50, 50);
  const floorMat = new THREE.MeshStandardMaterial({ color: 0xf5f5dc });
  const floor = new THREE.Mesh(floorGeo, floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);

  const hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 0.8);
  scene.add(hemi);
  const dir = new THREE.DirectionalLight(0xffffff, 0.6);
  dir.position.set(10, 20, 10);
  dir.castShadow = true;
  dir.shadow.mapSize.width = 1024;
  dir.shadow.mapSize.height = 1024;
  scene.add(dir);

  const boxGeo = new THREE.BoxGeometry(3, 4, 3);
  const boxMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a });
  const box = new THREE.Mesh(boxGeo, boxMat);
  box.position.set(6, 2, 6);
  box.castShadow = true;
  box.receiveShadow = true;
  scene.add(box);

  const wallGeo = new THREE.BoxGeometry(20, 6, 0.5);
  const wallMat = new THREE.MeshStandardMaterial({ color: 0xd4a84b });
  const wall = new THREE.Mesh(wallGeo, wallMat);
  wall.position.set(0, 3, -10);
  wall.castShadow = true;
  scene.add(wall);

  document.addEventListener("keydown", onKeyDown);
  document.addEventListener("keyup", onKeyUp);
  controls.addEventListener("lock", () => { if (sceneHint) sceneHint.classList.add("hidden"); });
  controls.addEventListener("unlock", () => { if (sceneHint) sceneHint.classList.remove("hidden"); });

  activeTriggerIndex = -1;
  stopTriggerMedia();
  rafId = requestAnimationFrame(animate);
}

function onKeyDown(e) {
  if (!sceneRoot || sceneRoot.classList.contains("hidden")) return;
  switch (e.code) {
    case "KeyW": moveForward = true; break;
    case "KeyS": moveBack = true; break;
    case "KeyA": moveLeft = true; break;
    case "KeyD": moveRight = true; break;
  }
}

function onKeyUp(e) {
  switch (e.code) {
    case "KeyW": moveForward = false; break;
    case "KeyS": moveBack = false; break;
    case "KeyA": moveLeft = false; break;
    case "KeyD": moveRight = false; break;
  }
}

function animate() {
  if (!renderer || !scene || !camera) return;
  rafId = requestAnimationFrame(animate);

  if (controls.isLocked) {
    const velocity = new THREE.Vector3();
    const dir = new THREE.Vector3();
    camera.getWorldDirection(dir);
    dir.y = 0;
    dir.normalize();
    if (moveForward) velocity.add(dir);
    if (moveBack) velocity.sub(dir);
    const right = new THREE.Vector3();
    right.crossVectors(camera.getWorldDirection(new THREE.Vector3()), new THREE.Vector3(0, 1, 0));
    if (moveRight) velocity.add(right);
    if (moveLeft) velocity.sub(right);
    velocity.normalize().multiplyScalar(MOVE_SPEED);
    camera.position.add(velocity);
    camera.position.y = Math.max(0.5, Math.min(3, camera.position.y));
    updateTriggerState();
  }

  renderer.render(scene, camera);
}

function exitScene() {
  document.removeEventListener("keydown", onKeyDown);
  document.removeEventListener("keyup", onKeyUp);
  if (rafId) cancelAnimationFrame(rafId);
  rafId = null;
  if (controls && controls.isLocked) controls.unlock();
  if (sceneHint) sceneHint.classList.remove("hidden");
  stopTriggerMedia();
  if (renderer && sceneCanvas) {
    renderer.dispose();
    const ctx = sceneCanvas.getContext("webgl2") || sceneCanvas.getContext("webgl");
    if (ctx) ctx.getExtension("WEBGL_lose_context")?.loseContext();
  }
  renderer = null;
  scene = null;
  camera = null;
  controls = null;
}

sceneCanvas.addEventListener("click", () => {
  if (sceneRoot && !sceneRoot.classList.contains("hidden") && !controls?.isLocked) {
    document.body.requestPointerLock();
  }
});

window.addEventListener("resize", () => {
  if (!sceneRoot || sceneRoot.classList.contains("hidden") || !camera || !renderer || !sceneCanvas) return;
  camera.aspect = sceneCanvas.offsetWidth / sceneCanvas.offsetHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(sceneCanvas.offsetWidth, sceneCanvas.offsetHeight);
});

window.addEventListener("metamosque:sceneReady", () => {
  initScene();
});

document.addEventListener("click", (e) => {
  if (!sceneRoot || sceneRoot.classList.contains("hidden")) return;
  if (e.target.closest("[data-action='sceneBackToMenu']")) exitScene();
});

const observer = new MutationObserver(() => {
  if (sceneRoot?.classList.contains("hidden")) exitScene();
});
if (sceneRoot) observer.observe(sceneRoot, { attributes: true, attributeFilter: ["class"] });
