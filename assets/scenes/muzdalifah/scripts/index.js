// assets/scenes/muzdalifah/scripts/index.js
// First-person scene for Muzdalifah — Sequential Media + Standard HUD UI

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
    setBtnState,
    setSkipState,
    getCurrentIndex
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
let triggered = false;
let completed = false;
let triggerMesh = null;
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

            // Hide Imam when he reaches the green light.
            if (characterModel) characterModel.visible = false;

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
        if (controls) {
            // Re-sync PointerLock pitch if needed, but usually not necessary 
            // since we manipulate camera.rotation.x directly.
        }
        return;
    }

    // Bow DOWN (Pitch goes negative in this project's coordinate logic for down)
    // Adjusting based on user feedback to prevent "looking up"
    const bowAmount = Math.sin(pickingAnimT) * 1.0;
    camera.rotation.x = originalPitch - bowAmount;
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
            if (controls) controls.unlock();

            // Start full media sequence
            if (points.length > 0) {
                setVideoTitle("MUZDALIFAH");
                initMediaSequence(ctx, points, {
                    isNavLocked: false, 
                    disableSceneBtnOnEnd: true, // As requested, keep SCENE button OFF
                    onEnded: (idx) => {
                        console.log("[Muzdalifah] Ended point index:", idx);
                        
                        if (idx === 2) {
                            completed = true;
                            // Explicitly unlock NEXT STEP for the walking transition
                            setBtnState("sceneNextStep", true);
                            // Ensure SCENE button stays OFF as requested
                            setSkipState(false);
                        }
                    }
                });

                // Auto-start disabled as requested

                // Initially ensure NEXT STEP is locked (even if media.js tries to enable it for skipping)
                // We want them to watch the full sequence
                setBtnState("sceneNextStep", false);
                setSkipState(false);
            }

            if (ctx.hint) ctx.hint.textContent = "Media started · Use HUD to navigate";
        }
    }

    // 2. Stones Trigger (appear after media ends)
    if (stonesTriggerMesh && !stonesTriggered) {
        const dx = camera.position.x - STONES_POS.x;
        const dz = camera.position.z - STONES_POS.z;
        if (dx * dx + dz * dz < TRIGGER_DIST * TRIGGER_DIST) {
            stonesTriggered = true;
            stonesTriggerMesh.visible = false;
            if (controls) controls.unlock();
            showPickingUI();
        }
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
    updateCharacter(dt);
    updatePickingAnimation(dt);
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
            console.log("[Muzdalifah] Control clicked:", action);

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
                    e.stopPropagation();
                    const curIdx = getCurrentIndex();
                    if (curIdx === points.length - 1) {
                        startWalkingSequence();
                    } else {
                        nextStep();
                    }
                    break;
                case "sceneNextScene":
                    e.stopPropagation();
                    onNextSceneClick();
                    break;
            }
        };
    }
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
    pickBtn.innerHTML = `<img src="assets/ui/pick_stone.png">`;

    pickBtn.onclick = () => {
        if (isPicking || picksCount >= 7) return;

        isPicking = true;
        pickingAnimT = 0;
        originalPitch = camera.rotation.x;

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
    if (!completed) {
        console.warn("[Muzdalifah] Cannot proceed: Playlist not finished");
        return;
    }

    stopTriggerMedia(ctx);
    if (window.sceneRouter) window.sceneRouter.exitScene();
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
    const envPromise = new Promise((resolve) => {
        loader.load(envUrl, (gltf) => {
            envModel = gltf.scene;
            envModel.scale.setScalar(cfg?.model?.scale || 1);
            const p = cfg?.model?.position || [0, 0, 0];
            envModel.position.set(p[0], p[1], p[2]);
            scene.add(envModel);
            resolve(true);
        }, undefined, (err) => {
            console.warn("[Muzdalifah] Env Model missing:", err);
            resolve(false);
        });
    });

    // Load Character
    const charCfg = cfg?.character;
    const charPromise = charCfg?.path ? new Promise((resolve) => {
        loader.load(makeUrl(basePath, charCfg.path), (gltf) => {
            characterModel = gltf.scene;
            characterModel.visible = true;

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
            resolve(true);
        }, undefined, (err) => {
            console.warn("[Muzdalifah] Character Model missing:", err);
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
