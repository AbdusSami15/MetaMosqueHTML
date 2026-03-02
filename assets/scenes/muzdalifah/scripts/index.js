// assets/scenes/muzdalifah/scripts/index.js
// First-person scene for Muzdalifah — Sequential Media + Standard HUD UI

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

// Sequencing & Character Movement
let characterState = "START"; // "START", "WALKING", "AT_STONES"
let walkSpeed = 2.0;
const STONES_POS = new THREE.Vector3(1.8009, 0, 3.1194);
const CHARACTER_POS = new THREE.Vector3(0, 0, 18.0);
const TRIGGER_POS = new THREE.Vector3(0, 0, 18.0);
const TRIGGER_DIST = 4.0;

// Stones Picking State
let stonesTriggerMesh = null;
let picksCount = 0;
let isPicking = false;
let pickingAnimT = 0;
let originalPitch = 0;
let pickingUI = null;
let stonesTriggered = false;

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

function updateCharacter(dt) {
    if (!characterModel || !camera) return;

    if (characterState === "WALKING") {
        const dist = characterModel.position.distanceTo(STONES_POS);
        if (dist > 1.5) {
            _tmpV.copy(STONES_POS).sub(characterModel.position).normalize();
            characterModel.position.addScaledVector(_tmpV, walkSpeed * dt);

            _tmpV.copy(STONES_POS);
            _tmpV.y = characterModel.position.y;
            characterModel.lookAt(_tmpV);
        } else {
            characterState = "AT_STONES";

            // Final snap to position and face camera
            characterModel.position.copy(STONES_POS);
            _tmpV.copy(camera.position);
            _tmpV.y = characterModel.position.y;
            characterModel.lookAt(_tmpV);

            if (mixer) {
                mixer.stopAllAction();
                if (idleAction) idleAction.play();
            }
        }
    } else if (characterState === "AT_STONES") {
        characterModel.position.copy(STONES_POS);
        // Face the camera
        _tmpV.copy(camera.position);
        _tmpV.y = characterModel.position.y;
        characterModel.lookAt(_tmpV);
    } else {
        // START position
        characterModel.position.copy(CHARACTER_POS);
        // Face the camera
        _tmpV.copy(camera.position);
        _tmpV.y = characterModel.position.y;
        characterModel.lookAt(_tmpV);
    }
}

function updatePickingAnimation(dt) {
    if (!isPicking || !camera) return;

    pickingAnimT += dt * 4.5; // Faster snappy animation
    if (pickingAnimT > Math.PI) {
        // End animation
        isPicking = false;
        pickingAnimT = 0;
        pitch = originalPitch;
        applyYawPitch();
        return;
    }

    // Bow DOWN (Pitch goes negative in this project's coordinate logic for down)
    // Adjusting based on user feedback to prevent "looking up"
    const bowAmount = Math.sin(pickingAnimT) * 1.0;
    pitch = originalPitch - bowAmount; // INVERTED: Minus moves look direction downwards
    applyYawPitch();
}

function checkTrigger() {
    if (!camera) return;

    // 1. Initial Media Trigger
    if (!triggered) {
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

    // 2. Stones Trigger (appear after media ends)
    if (stonesTriggerMesh && stonesTriggerMesh.visible && !stonesTriggered) {
        const dx = camera.position.x - STONES_POS.x;
        const dz = camera.position.z - STONES_POS.z;
        if (dx * dx + dz * dz < TRIGGER_DIST * TRIGGER_DIST) {
            stonesTriggered = true;
            stonesTriggerMesh.visible = false;
            showPickingUI();
        }
    }
}

// ─── Event handlers ──────────────────────────────────────────────────────────
function onKeyDown(e) {
    keys[e.code] = true;

    // Capture Position Feature (Press 'C')
    if (e.code === "KeyC") {
        if (camera) {
            const p = camera.position;
            const posStr = `[${p.x.toFixed(4)}, ${p.y.toFixed(4)}, ${p.z.toFixed(4)}]`;
            console.log("%c[Capture Position]:", "color: #00ff00; font-weight: bold;", posStr);
            if (ctx.hint) ctx.hint.textContent = `Captured: ${posStr}`;
        }
    }
}
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
    updateCharacter(dt);
    updatePickingAnimation(dt);
    renderer.render(scene, camera);
}

// ─── UI Binding ──────────────────────────────────────────────────────────────
function updateHUDButtons() {
    const nextBtn = document.getElementById("sceneVideoNext");
    const sceneBtn = document.getElementById("sceneNextSceneBtn");

    // NEXT button is ALWAYS enabled here so final click triggers walk
    if (nextBtn) {
        nextBtn.disabled = false;
        nextBtn.classList.remove("hudBtnDisabled");
    }

    // SCENE button is DISABLED / HIDDEN as requested for this scene's custom flow
    if (sceneBtn) {
        sceneBtn.style.display = "none";
    }
}

function goNextPoint() {
    if (activePointIdx < points.length - 1) {
        activePointIdx++;
        const item = points[activePointIdx];
        playTriggerMedia(ctx, item);
        updateHUDButtons();
    } else {
        // Final video "Next" button clicked -> Start walking sequence
        startWalkingSequence();
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

function startWalkingSequence() {
    stopTriggerMedia(ctx); // Turns off video canvas
    characterState = "WALKING";

    // Show the stones trigger
    if (stonesTriggerMesh) stonesTriggerMesh.visible = true;

    if (mixer && characterModel?.animations) {
        mixer.stopAllAction();
        const walkClip = characterModel.animations.find(a => a.name.toLowerCase().includes("walk"));
        if (walkClip) {
            mixer.clipAction(walkClip).play();
        }
    }

    if (ctx.hint) ctx.hint.textContent = "Character is moving to the stones...";
}

function showPickingUI() {
    if (pickingUI) return;

    pickingUI = document.createElement("div");
    pickingUI.className = "sceneInteractiveUI";

    // Counter UI
    const topLabel = document.createElement("div");
    topLabel.id = "pickingCounter";
    topLabel.className = "sceneCounterLabel";
    topLabel.textContent = "COLLECT STONES: 0 / 7";
    pickingUI.appendChild(topLabel);

    // Pick Button UI
    const pickBtn = document.createElement("button");
    pickBtn.className = "sceneActionBtn";
    pickBtn.innerHTML = `<img src="assets/ui/al_haram.png">`;

    pickBtn.onclick = () => {
        if (isPicking || picksCount >= 7) return;

        isPicking = true;
        pickingAnimT = 0;
        originalPitch = pitch;

        picksCount++;
        topLabel.textContent = `COLLECT STONES: ${picksCount} / 7`;

        if (picksCount >= 7) {
            pickBtn.style.opacity = "0.5";
            pickBtn.style.pointerEvents = "none";
            setTimeout(() => {
                if (pickingUI.parentNode) pickingUI.parentNode.removeChild(pickingUI);
                showSuccessPanel();
            }, 800);
        }
    };
    pickingUI.appendChild(pickBtn);

    ctx.canvas.parentNode.appendChild(pickingUI);
}

function showSuccessPanel() {
    const successOverlay = document.createElement("div");
    successOverlay.className = "successOverlay";

    const panel = document.createElement("div");
    panel.className = "successPanel";

    // Inner gold border
    const goldFrame = document.createElement("div");
    goldFrame.className = "successGoldFrame";
    panel.appendChild(goldFrame);

    const whiteInner = document.createElement("div");
    whiteInner.className = "successWhiteInner";
    panel.appendChild(whiteInner);

    const innerBorder = document.createElement("div");
    innerBorder.className = "successInnerBorder";
    panel.appendChild(innerBorder);

    const title = document.createElement("div");
    title.className = "successTitle";
    title.textContent = "NOW WE WILL MOVE TO THE NEXT STEP";
    panel.appendChild(title);

    const okBtn = document.createElement("button");
    okBtn.className = "successBtn";
    okBtn.textContent = "OK";
    okBtn.onclick = () => {
        if (successOverlay.parentNode) successOverlay.parentNode.removeChild(successOverlay);
        if (window.sceneRouter) {
            stopTriggerMedia(ctx);
            window.sceneRouter.enterScene("mina_rami");
        }
    };
    panel.appendChild(okBtn);

    successOverlay.appendChild(panel);
    document.body.appendChild(successOverlay);
}

function onNextSceneClick() {
    // This probably won't be called since we hid the button, but keeping for safety
    stopTriggerMedia(ctx);
    if (window.sceneRouter) window.sceneRouter.exitScene();
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

    // ─── Stones Trigger ───
    const stonesGroup = new THREE.Group();
    const sBaseGeo = new THREE.CircleGeometry(2.0, 32);
    const sBaseMat = new THREE.MeshBasicMaterial({ color: 0x00ff00, transparent: true, opacity: 0.6, side: THREE.DoubleSide });
    const sBaseMesh = new THREE.Mesh(sBaseGeo, sBaseMat);
    sBaseMesh.rotation.x = -Math.PI / 2;
    sBaseMesh.position.y = 0.1;
    stonesGroup.add(sBaseMesh);

    const sColGeo = new THREE.CylinderGeometry(2.0, 2.0, 10, 32, 1, true);
    const sColMat = new THREE.MeshBasicMaterial({ color: 0x00ff00, transparent: true, opacity: 0.2, side: THREE.DoubleSide });
    const sColMesh = new THREE.Mesh(sColGeo, sColMat);
    sColMesh.position.y = 5;
    stonesGroup.add(sColMesh);

    stonesTriggerMesh = stonesGroup;
    stonesTriggerMesh.position.copy(STONES_POS);
    stonesTriggerMesh.visible = false; // Hidden until walk starts
    scene.add(stonesTriggerMesh);

    // Ground plane
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(800, 800), new THREE.MeshLambertMaterial({ color: 0x8b7355 }));
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = MIN_GROUND_Y;
    scene.add(ground);

    const loader = new GLTFLoader();

    // Load Env
    const envUrl = makeUrl(basePath, cfg?.model?.path || "media/models/muzdalifah_placeholder.glb");
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
                characterModel.animations = gltf.animations; // Store for later
                mixer = new THREE.AnimationMixer(characterModel);

                const idleClip = gltf.animations.find(a => a.name.toLowerCase().includes("idle")) || gltf.animations[0];
                idleAction = mixer.clipAction(idleClip);
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
    if (ctx.hint) ctx.hint.textContent = "Muzdalifah Scene · Walk to the light";

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
