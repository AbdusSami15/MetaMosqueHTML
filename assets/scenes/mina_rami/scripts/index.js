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
let characterState = "START"; // "START", "WALKING", "AT_STONES", "BALD_WAITING"
let walkSpeed = 2.0;
const RAMI_POS = new THREE.Vector3(76.9866, 0, 9.3314);
const CHARACTER_POS = new THREE.Vector3(91.9569, 0, 10.3015);
const TRIGGER_POS = new THREE.Vector3(91.9569, 0, 10.3015);
const TRIGGER_DIST = 4.0;

// Sequential Media & Trigger
let points = [];
let activePointIdx = 0;
let triggered = false;
let ramiTriggered = false; // Flag for Rami phase
let triggerMesh = null;

// Projectiles
let activeStones = [];

// Input
const keys = Object.create(null);
let yaw = 0;
let pitch = 0;
let dragging = false;

// Settings
let MOVE_SPEED = 5.0;
let EYE_HEIGHT = 2.8;
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

            // Imam reached destination, now show the particle for the player to trigger Rami
            if (triggerMesh) {
                triggerMesh.position.copy(RAMI_POS);
                triggerMesh.visible = true;
            }

            _tmpV.copy(camera.position);
            _tmpV.y = characterModel.position.y;
            characterModel.lookAt(_tmpV);

            if (mixer) {
                mixer.stopAllAction();
                if (idleAction) idleAction.play();
            }
        }
    } else if (characterState === "RAMI_STARTED" || characterState === "AT_STONES") {
        // Character is at stones, UI is shown or waiting
        characterModel.position.copy(RAMI_POS);
        _tmpV.copy(camera.position);
        _tmpV.y = characterModel.position.y;
        characterModel.lookAt(_tmpV);

        // Safety: Ensure we aren't stuck in walk animation
        if (mixer && !mixer.existingAction?.name?.includes("idle")) {
            // Just let the current animation (idle) play out
        }
    } else {
        characterModel.position.copy(CHARACTER_POS);
        _tmpV.copy(camera.position);
        _tmpV.y = characterModel.position.y;
        characterModel.lookAt(_tmpV);
    }
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
    // 2. Rami Phase Trigger (only when Imam is already at stones)
    else if (characterState === "AT_STONES" && !ramiTriggered) {
        const dx = camera.position.x - RAMI_POS.x;
        const dz = camera.position.z - RAMI_POS.z;
        if (dx * dx + dz * dz < TRIGGER_DIST * TRIGGER_DIST) {
            ramiTriggered = true;
            if (triggerMesh) triggerMesh.visible = false;
            showRamiUI();
            if (ctx.hint) ctx.hint.textContent = "Click button to throw stones!";
        }
    }
    // 3. Post-Rami (Bald) Final Media Trigger
    else if (characterState === "BALD_WAITING" && !ramiTriggered) {
        const dx = camera.position.x - RAMI_POS.x;
        const dz = camera.position.z - RAMI_POS.z;
        if (dx * dx + dz * dz < TRIGGER_DIST * TRIGGER_DIST) {
            ramiTriggered = true;
            if (triggerMesh) triggerMesh.visible = false;

            // Play final media: GoziaratNew audio + RamiVideo1 video
            const finalPoint = {
                video: "media/videos/RamiVideo1.mp4", // RamiVideo1
                audio: "media/audios/GoziaratNew.mp3", // GoziaratNew
                title: "FINAL ZIARAT"
            };
            // Disable HUD "Next" during ziarat
            const nextBtn = document.getElementById("sceneVideoNext");
            const sceneBtn = document.getElementById("sceneNextSceneBtn");
            if (nextBtn) {
                nextBtn.disabled = true;
                nextBtn.classList.add("hudBtnDisabled");
            }
            if (sceneBtn) sceneBtn.style.display = "none";

            playTriggerMedia(ctx, finalPoint, {
                onEnded: () => {
                    localStorage.setItem("hajj_status", "completed");
                    if (sceneBtn) {
                        sceneBtn.style.display = "block";
                        sceneBtn.disabled = false;
                        sceneBtn.classList.remove("hudBtnDisabled");
                        sceneBtn.onclick = (e) => {
                            e.stopPropagation();
                            stopTriggerMedia(ctx);
                            if (window.sceneRouter && window.sceneRouter.enterScene) {
                                window.sceneRouter.enterScene('umrah_haram');
                            }
                        };
                    }
                    if (ctx.hint) ctx.hint.textContent = "Final Ziarat complete. Proceed to Haram.";
                }
            });
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

function updateStones(dt) {
    for (let i = activeStones.length - 1; i >= 0; i--) {
        const s = activeStones[i];
        const moveDist = s.speed * dt;
        s.mesh.position.addScaledVector(s.direction, moveDist);
        s.distanceMoved += moveDist;

        if (s.distanceMoved >= s.totalDistance) {
            scene.remove(s.mesh);
            if (s.mesh.geometry) s.mesh.geometry.dispose();
            if (s.mesh.material) s.mesh.material.dispose();
            activeStones.splice(i, 1);
        }
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
    updateStones(dt);
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

        // Keep particle hidden while Imam walks; it will appear in updateCharacter once he arrives
        if (triggerMesh) {
            triggerMesh.visible = false;
        }

        if (mixer && characterModel?.animations) {
            mixer.stopAllAction();
            const walkClip = characterModel.animations.find(a => a.name.toLowerCase().includes("walk"));
            if (walkClip) mixer.clipAction(walkClip).play();
        }
        if (ctx.hint) ctx.hint.textContent = "Moving to Jamarat...";
    }
}

// ─── Rami Interaction UI ──────────────────────────────────────────────────
// ─── Rami Interaction UI ──────────────────────────────────────────────────
function showRamiUI() {
    characterState = "RAMI_STARTED";
    const ramiUI = document.createElement("div");
    ramiUI.className = "sceneInteractiveUI";

    const topLabel = document.createElement("div");
    topLabel.className = "sceneCounterLabel";
    topLabel.textContent = "RAMI (JAMARAT): 0 / 7";
    ramiUI.appendChild(topLabel);

    const pickBtn = document.createElement("button");
    pickBtn.className = "sceneActionBtn";
    pickBtn.innerHTML = `<img src="assets/ui/al_haram.png">`;

    let picksCount = 0;
    pickBtn.onclick = () => {
        if (picksCount >= 7) return;
        throwStone();

        // Animation
        if (mixer && characterModel.animations) {
            mixer.stopAllAction();
            const pickClip = characterModel.animations.find(a =>
                a.name.toLowerCase().includes("pick") ||
                a.name.toLowerCase().includes("bow") ||
                a.name.toLowerCase().includes("throw")
            );
            if (pickClip) {
                const action = mixer.clipAction(pickClip);
                action.setLoop(THREE.LoopOnce);
                action.clampWhenFinished = true;
                action.play();

                setTimeout(() => {
                    mixer.stopAllAction();
                    if (idleAction) idleAction.play();
                }, 1500);
            }
        }

        picksCount++;
        topLabel.textContent = `RAMI (JAMARAT): ${picksCount} / 7`;

        if (picksCount >= 7) {
            pickBtn.style.opacity = "0.5";
            pickBtn.style.pointerEvents = "none";
            setTimeout(() => {
                if (ramiUI.parentNode) ramiUI.parentNode.removeChild(ramiUI);

                // Phase 1: Fade to black
                showFadeSequence(() => {
                    // Phase 2: Make Imam Bald & Reset for Final Trigger
                    makeImamBald();
                    characterState = "BALD_WAITING";
                    ramiTriggered = false; // Reset for second trigger

                    if (triggerMesh) {
                        triggerMesh.position.copy(RAMI_POS);
                        triggerMesh.visible = true;
                    }

                    if (ctx.hint) ctx.hint.textContent = "Rami complete! Visit Imam for final Ziarat.";
                });
            }, 800);
        }
    };
    ramiUI.appendChild(pickBtn);

    ctx.canvas.parentNode.appendChild(ramiUI);
}

function showSuccessPanel() {
    const successOverlay = document.createElement("div");
    successOverlay.className = "successOverlay";

    const panel = document.createElement("div");
    panel.className = "successPanel";

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
    title.textContent = "CONGRATULATIONS! YOU HAVE COMPLETED RAMI";
    panel.appendChild(title);

    const okBtn = document.createElement("button");
    okBtn.className = "successBtn";
    okBtn.textContent = "OK";
    okBtn.onclick = () => {
        if (successOverlay.parentNode) successOverlay.parentNode.removeChild(successOverlay);
        if (window.sceneRouter) {
            stopTriggerMedia(ctx);
            window.sceneRouter.exitScene();
        }
    };
    panel.appendChild(okBtn);

    successOverlay.appendChild(panel);
    document.body.appendChild(successOverlay);
}

function showFadeSequence(onDone) {
    const fade = document.createElement("div");
    fade.style.cssText = `
        position: fixed; inset: 0; background: #000;
        z-index: 10000; opacity: 0; transition: opacity 1.5s;
        pointer-events: none;
    `;
    document.body.appendChild(fade);

    // Fade In
    setTimeout(() => { fade.style.opacity = "1"; }, 100);

    // Fade Out after delay
    setTimeout(() => {
        if (onDone) onDone();
        fade.style.opacity = "0";
        setTimeout(() => {
            if (fade.parentNode) fade.parentNode.removeChild(fade);
        }, 1500);
    }, 2500);
}

function makeImamBald() {
    if (!characterModel) return;
    characterModel.traverse(child => {
        if (child.isMesh) {
            const name = child.name.toLowerCase();
            // Naming conventions for hair/cap in common avatars
            if (name.includes("hair") || name.includes("cap") || name.includes("top") || name.includes("head_wear")) {
                child.visible = false;
            }
        }
    });
}

function throwStone() {
    if (!scene || !camera) return;

    const stoneGeo = new THREE.SphereGeometry(0.12, 8, 8);
    const stoneMat = new THREE.MeshStandardMaterial({ color: 0x444444, roughness: 0.8 });
    const stone = new THREE.Mesh(stoneGeo, stoneMat);

    // Start at camera position
    stone.position.copy(camera.position);
    scene.add(stone);

    // Extract camera's forward direction to ensure it throws where player looks
    const direction = new THREE.Vector3();
    camera.getWorldDirection(direction);

    // Add a slight upward arc
    direction.y += 0.15;
    direction.normalize();

    const speed = 25.0; // Faster stone
    const totalDist = 40.0; // Fly for a long distance

    activeStones.push({
        mesh: stone,
        direction: direction,
        speed: speed,
        distanceMoved: 0,
        totalDistance: totalDist
    });

    // Play Audio
    const audio = new Audio(`${ctx.basePath}media/audios/BismillahiAllahuAkabar.mp3`);
    audio.play().catch(() => { });
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

    // Environment model will provide the ground

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
    if (renderer) renderer.dispose();
    scene = null; camera = null; renderer = null; ctx = null;
}
