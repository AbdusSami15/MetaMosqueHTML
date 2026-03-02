// assets/scenes/arafat/scripts/index.js
// First-person scene for Arafat — Sequential Media + Standard HUD UI

import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import {
    playTriggerMedia,
    stopTriggerMedia,
    restartTriggerMedia,
    togglePauseTriggerMedia
} from "./media.js";
import { MobileControls } from "./mobileControls.js";

// ─── Module state ─────────────────────────────────────────────────────────────
let ctx = null;
let scene = null;
let camera = null;
let renderer = null;
let animId = 0;
let mobileControls = null;
let envModel = null;
let characterModel = null;
let mixer = null;
let idleAction = null;
let lastT = 0;

// Sequential Media & Trigger
let points = [];
let activePointIdx = 0;
let triggered = false;
let triggerMesh = null;
const TRIGGER_POS = new THREE.Vector3(0, 0, 18.0);
const CHARACTER_POS = new THREE.Vector3(0, 0, 18.0); // Match Mina's latest adjust
const TRIGGER_DIST = 4.0;

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

const CHARACTER_FOLLOW_CAMERA = true;
const CHARACTER_OFFSET = new THREE.Vector3(1.0, -0.2, -2.5);

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

function applyMobileLook() {
    if (!mobileControls || !mobileControls.enabled) return;
    // Transverse look logic matching Safa Marwah
    yaw += mobileControls.lookVector.x;
    pitch += mobileControls.lookVector.y;
    applyYawPitch();
}

function step(dt) {
    if (!camera) return;
    let fwd = (keys["KeyW"] || keys["ArrowUp"] ? 1 : 0) - (keys["KeyS"] || keys["ArrowDown"] ? 1 : 0);
    let str = (keys["KeyD"] || keys["ArrowRight"] ? 1 : 0) - (keys["KeyA"] || keys["ArrowLeft"] ? 1 : 0);

    if (mobileControls && mobileControls.enabled) {
        fwd += mobileControls.moveVector.z;
        str += mobileControls.moveVector.x;
    }

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

function updateCharacter() {
    if (!characterModel || !camera) return;

    // Position stationary at CHARACTER_POS
    characterModel.position.copy(CHARACTER_POS);
    characterModel.position.y = CHARACTER_POS.y || 0;

    // Face the camera (continuously)
    _tmpV.copy(camera.position);
    _tmpV.y = characterModel.position.y; // Look horizontally
    characterModel.lookAt(_tmpV);

    // Correction rotation (most models face Z-, lookAt points Z+)
    // We keep it dynamic like the working Mina model
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

        // Start first media point
        if (points.length > 0) {
            playTriggerMedia(ctx, points[0]);
        }

        bindUI(); // Show HUD buttons now
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
function updateHUDButtons() {
    const nextBtn = document.getElementById("sceneVideoNext");
    const sceneBtn = document.getElementById("sceneNextSceneBtn");

    // NEXT button is enabled if more points exist
    const hasNext = activePointIdx < points.length - 1;
    if (nextBtn) {
        nextBtn.disabled = !hasNext;
        if (!hasNext) nextBtn.classList.add("hudBtnDisabled");
        else nextBtn.classList.remove("hudBtnDisabled");
    }

    // SCENE button is enabled only after the final media is started
    const isLast = activePointIdx === points.length - 1;
    if (sceneBtn) {
        sceneBtn.disabled = !isLast;
        if (!isLast) sceneBtn.classList.add("hudBtnDisabled");
        else sceneBtn.classList.remove("hudBtnDisabled");
    }
}

function goNextPoint() {
    if (activePointIdx < points.length - 1) {
        activePointIdx++;
        const item = points[activePointIdx];
        playTriggerMedia(ctx, item);
        updateHUDButtons();
    }
}

function bindUI() {
    const nextBtn = document.getElementById("sceneVideoNext");
    const restartBtn = document.getElementById("sceneVideoRestart");
    const pauseBtn = document.getElementById("sceneVideoPause");
    const sceneBtn = document.getElementById("sceneNextSceneBtn");

    if (nextBtn) nextBtn.onclick = (e) => { e.stopPropagation(); goNextPoint(); };
    if (restartBtn) restartBtn.onclick = (e) => { e.stopPropagation(); if (points[activePointIdx]) restartTriggerMedia(ctx, points[activePointIdx]); };
    if (pauseBtn) pauseBtn.onclick = (e) => { e.stopPropagation(); togglePauseTriggerMedia(ctx); };
    if (sceneBtn) sceneBtn.onclick = (e) => { e.stopPropagation(); onNextSceneClick(); };

    updateHUDButtons();
}

function onNextSceneClick() {
    stopTriggerMedia(ctx);
    // Transition to Muzdalifah scene
    window.dispatchEvent(new CustomEvent("metamosque:goToScene", {
        detail: { sceneName: "MUZDALIFAH", sceneId: "muzdalifah" }
    }));
}

// ─── Enter / Exit ────────────────────────────────────────────────────────────
export async function enter(c) {
    ctx = c;
    const { canvas, basePath } = ctx;
    if (!canvas) return;

    // ✅ HUD Standardization: Reset to neutral state on entry
    const nextBtn = document.getElementById("sceneVideoNext");
    const sceneBtn = document.getElementById("sceneNextSceneBtn");
    if (nextBtn) {
        nextBtn.disabled = false;
        nextBtn.classList.remove("hudBtnDisabled");
        nextBtn.style.display = "block";
    }
    if (sceneBtn) {
        sceneBtn.disabled = true;
        sceneBtn.classList.add("hudBtnDisabled");
        sceneBtn.style.display = "block";
    }

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
    const envUrl = makeUrl(basePath, cfg?.model?.path || "media/models/arafat_placeholder.glb");
    loader.load(envUrl, (gltf) => {
        envModel = gltf.scene;
        envModel.scale.setScalar(cfg?.model?.scale || 1);
        const p = cfg?.model?.position || [0, 0, 0];
        envModel.position.set(p[0], p[1], p[2]);
        scene.add(envModel);
    });

    // Load Character
    const charCfg = cfg?.character;
    if (charCfg?.path) {
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
        });
    }

    // No auto-play here anymore. Handled by checkTrigger()
    triggered = false;

    // Events
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("keyup", onKeyUp);
    canvas.addEventListener("mousedown", onMouseDown);
    window.addEventListener("mouseup", onMouseUp);
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("resize", onResize);

    bindUI();
    if (ctx.hint) ctx.hint.textContent = "Arafat Scene · Walk to the light";

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
    if (ctx?.canvas) ctx.canvas.removeEventListener("mousedown", onMouseDown);
    window.removeEventListener("mouseup", onMouseUp);
    window.removeEventListener("mousemove", onMouseMove);
    window.removeEventListener("resize", onResize);

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
