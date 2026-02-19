// assets/scenes/mina_rami/scripts/index.js
// First-person scene for Mina Rami — Sequential Media + Standard HUD UI

import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import {
    playTriggerMedia,
    stopTriggerMedia,
    restartTriggerMedia,
    togglePauseTriggerMedia
} from "./media.js";

// ─── Module state ─────────────────────────────────────────────────────────────
let ctx = null;
let scene = null;
let camera = null;
let renderer = null;
let animId = 0;
let envModel = null;
let characterModel = null;
let mixer = null;
let idleAction = null;
let lastT = 0;

// Sequencing & Character Movement
let characterState = "START"; // "START", "WALKING", "AT_STONES"
let walkSpeed = 2.0;
const RAMI_POS = new THREE.Vector3(0, 0, -20.0); // Placeholder Rama position
const CHARACTER_POS = new THREE.Vector3(0, 0, 18.0);
const TRIGGER_POS = new THREE.Vector3(0, 0, 18.0);
const TRIGGER_DIST = 4.0;

// Sequential Media & Trigger
let points = [];
let activePointIdx = 0;
let triggered = false;
let triggerMesh = null;

// Input
const keys = Object.create(null);
let yaw = 0;
let pitch = 0;
let dragging = false;

// Settings
let MOVE_SPEED = 5.0;
let EYE_HEIGHT = 1.8;
let MIN_GROUND_Y = 0;
let WALK_Y = 1.8;
const LOOK_SENS = 0.0022;

const _dir = new THREE.Vector3();
const _right = new THREE.Vector3();
const _move = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);
const _tmpV = new THREE.Vector3();

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

function applyYawPitch() {
    if (!camera) return;
    pitch = clamp(pitch, -1.1, 1.1);
    camera.rotation.order = "YXZ";
    camera.rotation.y = yaw;
    camera.rotation.x = pitch;
}

function step(dt) {
    if (!camera) return;
    let fwd = (keys["KeyW"] || keys["ArrowUp"] ? 1 : 0) - (keys["KeyS"] || keys["ArrowDown"] ? 1 : 0);
    let str = (keys["KeyD"] || keys["ArrowRight"] ? 1 : 0) - (keys["KeyA"] || keys["ArrowLeft"] ? 1 : 0);

    if (fwd === 0 && str === 0) {
        camera.position.y = WALK_Y;
        return;
    }

    const speed = MOVE_SPEED * dt;
    camera.getWorldDirection(_dir);
    _dir.y = 0; _dir.normalize();
    _right.crossVectors(_dir, _up).normalize();

    _move.set(0, 0, 0);
    if (fwd !== 0) _move.addScaledVector(_dir, fwd * speed);
    if (str !== 0) _move.addScaledVector(_right, str * speed);

    camera.position.add(_move);
    camera.position.y = WALK_Y;
}

function updateCharacter(dt) {
    if (!characterModel || !camera) return;

    if (characterState === "WALKING") {
        const dist = characterModel.position.distanceTo(RAMI_POS);
        if (dist > 1.5) {
            _tmpV.copy(RAMI_POS).sub(characterModel.position).normalize();
            characterModel.position.addScaledVector(_tmpV, walkSpeed * dt);

            _tmpV.copy(RAMI_POS);
            _tmpV.y = characterModel.position.y;
            characterModel.lookAt(_tmpV);
        } else {
            characterState = "AT_STONES";
            characterModel.position.copy(RAMI_POS);
            _tmpV.copy(camera.position);
            _tmpV.y = characterModel.position.y;
            characterModel.lookAt(_tmpV);

            if (mixer) {
                mixer.stopAllAction();
                if (idleAction) idleAction.play();
            }
        }
    } else if (characterState === "AT_STONES") {
        characterModel.position.copy(RAMI_POS);
        _tmpV.copy(camera.position);
        _tmpV.y = characterModel.position.y;
        characterModel.lookAt(_tmpV);
    } else {
        characterModel.position.copy(CHARACTER_POS);
        _tmpV.copy(camera.position);
        _tmpV.y = characterModel.position.y;
        characterModel.lookAt(_tmpV);
    }
}

function checkTrigger() {
    if (triggered || !camera) return;
    const dx = camera.position.x - TRIGGER_POS.x;
    const dz = camera.position.z - TRIGGER_POS.z;
    if (dx * dx + dz * dz < TRIGGER_DIST * TRIGGER_DIST) {
        triggered = true;
        if (triggerMesh) triggerMesh.visible = false;
        if (points.length > 0) playTriggerMedia(ctx, points[0]);
        bindUI();
        if (ctx.hint) ctx.hint.textContent = "Media started · Use HUD to navigate";
    }
}

// ─── Event handlers ──────────────────────────────────────────────────────────
function onKeyDown(e) { keys[e.code] = true; }
function onKeyUp(e) { keys[e.code] = false; }
function onMouseDown(e) {
    if (!ctx?.canvas || e.button !== 0) return;
    dragging = true;
    try { ctx.canvas.focus?.(); } catch (_) { }
}
function onMouseUp() { dragging = false; }
function onMouseMove(e) {
    if (!dragging || !camera) return;
    yaw -= e.movementX * LOOK_SENS;
    pitch += e.movementY * LOOK_SENS;
    applyYawPitch();
}

function onResize() {
    if (!ctx?.canvas || !camera || !renderer) return;
    const w = ctx.canvas.clientWidth;
    const h = ctx.canvas.clientHeight;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
}

function tick(t) {
    animId = requestAnimationFrame(tick);
    if (!scene || !renderer || !camera) return;
    const dt = Math.min(0.05, (t - (lastT || t)) / 1000);
    lastT = t;

    if (mixer) mixer.update(dt);

    step(dt);
    checkTrigger();
    updateCharacter(dt);
    renderer.render(scene, camera);
}

// ─── UI Binding ──────────────────────────────────────────────────────────────
function updateHUDButtons() {
    const nextBtn = document.getElementById("sceneVideoNext");
    const sceneBtn = document.getElementById("sceneNextSceneBtn");
    if (nextBtn) {
        nextBtn.disabled = false;
        nextBtn.classList.remove("hudBtnDisabled");
    }
    if (sceneBtn) sceneBtn.style.display = "none";
}

function goNextPoint() {
    if (activePointIdx < points.length - 1) {
        activePointIdx++;
        const item = points[activePointIdx];
        playTriggerMedia(ctx, item);
        updateHUDButtons();
    } else {
        // Final video "Next" button clicked
        stopTriggerMedia(ctx);
        characterState = "WALKING";
        if (mixer && characterModel?.animations) {
            mixer.stopAllAction();
            const walkClip = characterModel.animations.find(a => a.name.toLowerCase().includes("walk"));
            if (walkClip) mixer.clipAction(walkClip).play();
        }
        if (ctx.hint) ctx.hint.textContent = "Moving to Jamarat...";
    }
}

function bindUI() {
    const nextBtn = document.getElementById("sceneVideoNext");
    const restartBtn = document.getElementById("sceneVideoRestart");
    const pauseBtn = document.getElementById("sceneVideoPause");

    if (nextBtn) nextBtn.onclick = (e) => { e.stopPropagation(); goNextPoint(); };
    if (restartBtn) restartBtn.onclick = (e) => { e.stopPropagation(); if (points[activePointIdx]) restartTriggerMedia(ctx, points[activePointIdx]); };
    if (pauseBtn) pauseBtn.onclick = (e) => { e.stopPropagation(); togglePauseTriggerMedia(ctx); };

    updateHUDButtons();
}

// ─── Enter / Exit ────────────────────────────────────────────────────────────
export async function enter(c) {
    ctx = c;
    const { canvas, basePath } = ctx;
    if (!canvas) return;

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
    camera.position.set(camStart[0] ?? 0, WALK_Y, camStart[2] ?? 12);
    yaw = cfg?.cameraYaw || 0;
    pitch = cfg?.cameraPitch || 0;
    applyYawPitch();

    renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    renderer.setSize(w, h);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    canvas.tabIndex = 0;
    canvas.style.outline = "none";
    try { canvas.focus(); } catch (_) { }

    scene.add(new THREE.HemisphereLight(0xffffff, 0x8888aa, 0.9));
    const sun = new THREE.DirectionalLight(0xffffff, 1.0);
    sun.position.set(10, 20, 10);
    scene.add(sun);

    // Initial Trigger Visual
    const triggerGroup = new THREE.Group();
    const baseGeo = new THREE.CircleGeometry(2.0, 32);
    const baseMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.8, side: THREE.DoubleSide });
    const baseMesh = new THREE.Mesh(baseGeo, baseMat);
    baseMesh.rotation.x = -Math.PI / 2;
    baseMesh.position.y = 0.05;
    triggerGroup.add(baseMesh);

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
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(800, 800), new THREE.MeshLambertMaterial({ color: 0x8b7355 }));
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = MIN_GROUND_Y;
    scene.add(ground);

    const loader = new GLTFLoader();

    // Load Env
    const envUrl = makeUrl(basePath, cfg?.model?.path || "media/models/rami_placeholder.glb");
    loader.load(envUrl, (gltf) => {
        envModel = gltf.scene;
        envModel.scale.setScalar(cfg?.model?.scale || 1);
        const p = cfg?.model?.position || [0, 0, 0];
        envModel.position.set(p[0], p[1], p[2]);
        scene.add(envModel);
    }, undefined, (err) => console.warn("Rami Env Model missing:", err));

    // Load Character
    const charCfg = cfg?.character;
    if (charCfg?.path) {
        loader.load(makeUrl(basePath, charCfg.path), (gltf) => {
            characterModel = gltf.scene;
            const baseScale = charCfg.scale || 1.1;
            characterModel.scale.setScalar(baseScale * 3.3);
            scene.add(characterModel);

            if (gltf.animations && gltf.animations.length > 0) {
                characterModel.animations = gltf.animations;
                mixer = new THREE.AnimationMixer(characterModel);
                const idleClip = gltf.animations.find(a => a.name.toLowerCase().includes("idle")) || gltf.animations[0];
                idleAction = mixer.clipAction(idleClip);
                idleAction.play();
            }
        });
    }

    triggered = false;
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("keyup", onKeyUp);
    canvas.addEventListener("mousedown", onMouseDown);
    window.addEventListener("mouseup", onMouseUp);
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("resize", onResize);

    if (ctx.hint) ctx.hint.textContent = "Mina Rami Scene · Walk to the light";
    lastT = performance.now();
    animId = requestAnimationFrame(tick);
}

export function exit() {
    if (animId) cancelAnimationFrame(animId);
    animId = 0; lastT = 0;
    document.removeEventListener("keydown", onKeyDown);
    document.removeEventListener("keyup", onKeyUp);
    if (ctx?.canvas) ctx.canvas.removeEventListener("mousedown", onMouseDown);
    window.removeEventListener("mouseup", onMouseUp);
    window.removeEventListener("mousemove", onMouseMove);
    window.removeEventListener("resize", onResize);
    stopTriggerMedia(ctx);
    if (renderer) renderer.dispose();
    scene = null; camera = null; renderer = null; ctx = null;
}
