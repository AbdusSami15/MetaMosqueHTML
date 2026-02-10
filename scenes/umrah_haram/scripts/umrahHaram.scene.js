import * as THREE from "three";
import { PointerLockControls } from "three/examples/jsm/controls/PointerLockControls.js";
import { buildTriggers, findTriggerIndex } from "./umrahHaram.triggers.js";
import { playMedia, stopMedia } from "./umrahHaram.media.js";

const sceneRoot = document.getElementById("sceneRoot");
const sceneCanvas = document.getElementById("sceneCanvas");
const sceneHint = document.getElementById("sceneHint");
const sceneVideoOverlay = document.getElementById("sceneVideoOverlay");
const sceneVideo = document.getElementById("sceneVideo");
const sceneAudio = document.getElementById("sceneAudio");

let renderer, scene, camera, controls;
let rafId = null;

let MOVE_SPEED = 0.15;
let TRIGGERS = [];
let activeTriggerIndex = -1;

let moveForward = false, moveBack = false, moveLeft = false, moveRight = false;

async function loadJSON(path) {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`Failed to load: ${path}`);
  return res.json();
}

async function loadUmrahHaramData() {
  const base = "/assets/scenes/umrah_haram";
  const config = await loadJSON(`${base}/config/scene.config.json`);
  const triggersRaw = await loadJSON(`${base}/config/triggers.json`);
  TRIGGERS = buildTriggers(triggersRaw);
  MOVE_SPEED = config.player.moveSpeed || MOVE_SPEED;
  return config;
}

function updateTriggerState() {
  if (!camera || TRIGGERS.length === 0) return;

  const idx = findTriggerIndex(camera.position, TRIGGERS);
  if (idx === activeTriggerIndex) return;

  if (activeTriggerIndex >= 0) stopMedia(sceneVideo, sceneAudio, sceneVideoOverlay);
  activeTriggerIndex = idx;

  if (activeTriggerIndex >= 0) {
    const media = TRIGGERS[activeTriggerIndex].media;
    playMedia(media, sceneVideo, sceneAudio, sceneVideoOverlay);
  }
}

function onKeyDown(e) {
  if (!sceneRoot || sceneRoot.classList.contains("hidden")) return;
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

function animate() {
  if (!renderer || !scene || !camera) return;
  rafId = requestAnimationFrame(animate);

  if (controls?.isLocked) {
    const velocity = new THREE.Vector3();
    const dir = new THREE.Vector3();

    camera.getWorldDirection(dir);
    dir.y = 0;
    dir.normalize();

    if (moveForward) velocity.add(dir);
    if (moveBack) velocity.sub(dir);

    const right = new THREE.Vector3();
    right.crossVectors(dir, new THREE.Vector3(0, 1, 0)).normalize();

    if (moveRight) velocity.add(right);
    if (moveLeft) velocity.sub(right);

    if (velocity.lengthSq() > 0) {
      velocity.normalize().multiplyScalar(MOVE_SPEED);
      camera.position.add(velocity);
      updateTriggerState();
    }
  }

  renderer.render(scene, camera);
}

async function init() {
  if (!sceneCanvas || !sceneRoot) return;

  const config = await loadUmrahHaramData();

  scene = new THREE.Scene();
  scene.background = new THREE.Color(config.environment.backgroundColor || "#87CEEB");

  camera = new THREE.PerspectiveCamera(75, sceneCanvas.offsetWidth / sceneCanvas.offsetHeight, 0.1, 1000);
  camera.position.fromArray(config.player.spawn || [0, 1.6, 5]);

  renderer = new THREE.WebGLRenderer({ canvas: sceneCanvas, antialias: true });
  renderer.setSize(sceneCanvas.offsetWidth, sceneCanvas.offsetHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  controls = new PointerLockControls(camera, document.body);
  scene.add(controls.getObject());

  const hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 0.8);
  scene.add(hemi);

  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(50, 50),
    new THREE.MeshStandardMaterial({ color: 0xf5f5dc })
  );
  floor.rotation.x = -Math.PI / 2;
  scene.add(floor);

  document.addEventListener("keydown", onKeyDown);
  document.addEventListener("keyup", onKeyUp);

  controls.addEventListener("lock", () => sceneHint?.classList.add("hidden"));
  controls.addEventListener("unlock", () => sceneHint?.classList.remove("hidden"));

  activeTriggerIndex = -1;
  stopMedia(sceneVideo, sceneAudio, sceneVideoOverlay);

  rafId = requestAnimationFrame(animate);
}

export function enterUmrahHaramScene() {
  init();
}
