// index.js (Hajj Haram Custom Implementation)
// This file is customized for Hajj flow, adding a choice panel (Tawaf vs Main Menu)
// and Hajj-specific audio if arriving from Mina Rami.

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
import { MobileControls } from "./mobileControls.js";

const MOVE_SPEED = 0.15;

let renderer, scene, camera, controls;
let mobileControls = null;
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
let CAMERA_START_Y = null;

let tawafBeam = null;
let tawafGlow = null;
let tawafRing = null;

let demoCharacter = null;
let demoCharacterMixer = null;
let demoCharacterActions = {};
let demoCharacterActiveAction = null;
let clock = new THREE.Clock();

let demoCharacterWalkTarget = null;
let demoCharacterWalking = false;
const DEMO_CHARACTER_WALK_SPEED = 1.6;

const KAABA_HALF_X = 9;
const KAABA_HALF_Z = 9;
const KAABA_MARGIN = 2;
const HATEEM_RADIUS = 15;
const HATEEM_HALF = -1;
let demoCharacterArcWalk = null;

let haramDuaShown = false;
let duaUi = null;
let duaAutoHideTimer = null;

function clampToOutsideKaaba(x, z) {
    const L = -KAABA_HALF_X - KAABA_MARGIN;
    const R = KAABA_HALF_X + KAABA_MARGIN;
    const B = -KAABA_HALF_Z - KAABA_MARGIN;
    const T = KAABA_HALF_Z + KAABA_MARGIN;
    let out = { x, z };

    if (x >= L && x <= R && z >= B && z <= T) {
        const dR = R - x, dL = x - L, dT = T - z, dB = z - B;
        const minD = Math.min(dR, dL, dT, dB);
        if (minD === dR) out = { x: R, z };
        else if (minD === dL) out = { x: L, z };
        else if (minD === dT) out = { x, z: T };
        else out = { x, z: B };
    }
    const r = Math.sqrt(out.x * out.x + out.z * out.z);
    const WALL_RADIUS = 14;
    const inHateemZone = (out.z > 2.0);
    if (inHateemZone && r < WALL_RADIUS && r > 1e-6) {
        const scale = WALL_RADIUS / r;
        out = { x: out.x * scale, z: out.z * scale };
    }
    return out;
}

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
        a.play().catch(() => { });
    } catch (_) { }
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
    } catch (_) { return null; }
}

function snapModelToGround(root, groundYLocal = 0) {
    const box = new THREE.Box3().setFromObject(root);
    const offset = groundYLocal - box.min.y;
    root.position.y += offset;
}

function loadDemoCharacter(sceneThree, basePath) {
    return new Promise((resolve) => {
        const loader = new GLTFLoader();
        const url = resolveUrl(basePath, "media/models/character.glb");
        loader.load(url, (gltf) => {
            const root = gltf.scene;
            root.name = "demoCharacter";
            root.scale.set(1.5, 1.5, 1.5);
            root.traverse((child) => {
                if (!child.isMesh) return;
                child.castShadow = true;
                child.receiveShadow = true;
            });
            const mixer = new THREE.AnimationMixer(root);
            demoCharacterMixer = mixer;
            const clips = gltf.animations || [];
            clips.forEach((clip) => {
                const name = clip.name.toLowerCase();
                let action = mixer.clipAction(clip);
                action.setLoop(THREE.LoopRepeat, Infinity);
                if (name.includes("walk")) demoCharacterActions["walk"] = action;
                else if (name.includes("idle") || name.includes("breathing")) demoCharacterActions["idle"] = action;
                else if (name.includes("talk")) demoCharacterActions["talk"] = action;
            });
            snapModelToGround(root, groundY);
            playCharacterAction("idle");
            sceneThree.add(root);
            demoCharacter = root;
            resolve(root);
        }, undefined, (err) => resolve(null));
    });
}

function playCharacterAction(name, transitionDuration = 0.5) {
    if (!demoCharacterMixer) return;
    const newAction = demoCharacterActions[name];
    if (!newAction) return;
    if (demoCharacterActiveAction !== newAction) {
        if (demoCharacterActiveAction) demoCharacterActiveAction.fadeOut(transitionDuration);
        newAction.reset().fadeIn(transitionDuration).play();
        newAction.enabled = true;
        demoCharacterActiveAction = newAction;
    }
}

function loadHaramModel(sceneThree, basePath) {
    return new Promise((resolve) => {
        const loader = new GLTFLoader();
        const url = resolveUrl(basePath, "media/models/haram.glb");
        loader.load(url, (gltf) => {
            const root = gltf.scene;
            root.traverse((child) => {
                if (!child.isMesh) return;
                child.castShadow = true;
                child.receiveShadow = true;
            });
            snapModelToGround(root, groundY);
            sceneThree.add(root);
            resolve();
        }, undefined, () => resolve());
    });
}

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
    const beamGeometry = new THREE.CylinderGeometry(1.45, 1.45, 6, 36, 1, true);
    const beamMaterial = new THREE.ShaderMaterial({
        transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
        uniforms: { uTime: { value: 0 }, uColor: { value: new THREE.Color(0x00ff66) } },
        vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
        fragmentShader: `varying vec2 vUv; uniform float uTime; uniform vec3 uColor; float hash(float n){ return fract(sin(n)*43758.5453); } void main(){ float mid = 1.0 - abs(vUv.y - 0.5) * 2.0; float band = sin((vUv.y * 12.0) + (uTime * 3.0)) * 0.5 + 0.5; float n = hash(floor(vUv.y*40.0) + floor(uTime*10.0)); float flicker = 0.85 + 0.15 * n; float alpha = mid * (0.35 + 0.35 * band) * flicker; float edge = 1.0 - abs(vUv.x - 0.5) * 2.0; alpha *= pow(edge, 0.35); float pulse = 0.75 + 0.25 * sin(uTime * 2.5); alpha *= pulse; gl_FragColor = vec4(uColor, alpha); }`,
    });
    tawafBeam = new THREE.Mesh(beamGeometry, beamMaterial);
    tawafBeam.position.y = groundY + 3;
    scene.add(tawafBeam);

    const glowGeometry = new THREE.CylinderGeometry(2.6, 2.6, 6.2, 36, 1, true);
    const glowMaterial = new THREE.MeshBasicMaterial({ color: 0x00ff66, transparent: true, opacity: 0.14, blending: THREE.AdditiveBlending, depthWrite: false });
    tawafGlow = new THREE.Mesh(glowGeometry, glowMaterial);
    tawafGlow.position.y = groundY + 3;
    scene.add(tawafGlow);

    const ringGeo = new THREE.RingGeometry(1.2, 2.0, 64);
    const ringMat = new THREE.MeshBasicMaterial({ color: 0x00ff66, transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, depthWrite: false });
    tawafRing = new THREE.Mesh(ringGeo, ringMat);
    tawafRing.rotation.x = -Math.PI / 2;
    tawafRing.position.y = groundY + 0.03;
    scene.add(tawafRing);
}

function updateTawafMarker() {
    if (!tawafBeam) createTawafBeam();
    if (tawafComplete || tawafPoints.length === 0) {
        tawafBeam.visible = false; tawafGlow.visible = false; tawafRing.visible = false;
        return;
    }
    const point = tawafPoints[activeTawafIndex];
    const center = getTawafPointCenter(point);
    if (!center) return;
    tawafBeam.visible = true; tawafGlow.visible = true; tawafRing.visible = true;
    tawafBeam.position.set(center.x, groundY + 3, center.z);
    tawafGlow.position.set(center.x, groundY + 3, center.z);
    tawafRing.position.set(center.x, groundY + 0.03, center.z);
}

function beginStep(point) {
    tawafMediaLocked = true;
    lockMovement();
    if (ctx?.hint) ctx.hint.textContent = `${point.title} (Reached)`;
    const isLastPoint = tawafPoints.length > 0 && activeTawafIndex === tawafPoints.length - 1;
    if (isLastPoint) setNextSceneButton();
    if (point.video || point.audio) {
        playCharacterAction("talk");
        playTriggerMedia(ctx, point, { onEnded: () => { if (ctx?.hint) ctx.hint.textContent = `${point.title} (Done)`; playCharacterAction("idle"); } });
    } else {
        playCharacterAction("idle");
        if (ctx?.hint) ctx.hint.textContent = `${point.title} (Done)`;
    }
}

function setNextSceneButton() {
    const nextBtn = document.getElementById("sceneVideoNext");
    const sceneBtn = document.getElementById("sceneNextSceneBtn");
    if (!nextBtn || !sceneBtn) return;
    // nextBtn.disabled = true; nextBtn.classList.add("hudBtnDisabled"); // Keep NEXT enabled if user wants
    sceneBtn.disabled = false; sceneBtn.classList.remove("hudBtnDisabled");
    sceneBtn.style.display = "block";
    sceneBtn.style.zIndex = "1000";
    sceneBtn.style.pointerEvents = "auto";
    sceneBtn.style.position = "relative";
}

function advanceTawaf() {
    if (tawafComplete || tawafPoints.length === 0) return;
    if (activeTawafIndex === 1) playSfx(ctx.basePath, "media/audio/DuaTawafAi.mp3", 1);
    else playSfx(ctx.basePath, "media/audio/NextStep.mp3", 1);
    stopTriggerMedia(ctx);
    tawafMediaLocked = false;
    unlockMovement();
    activeTawafIndex++;
    if (activeTawafIndex >= tawafPoints.length) {
        tawafComplete = true; if (ctx?.hint) ctx.hint.textContent = "Tawaf Complete";
        updateTawafMarker();
        setNextSceneButton(); // ✅ Enable SCENE button
        demoCharacterWalking = false; demoCharacterWalkTarget = null;
        playCharacterAction("idle"); return;
    }
    if (ctx?.hint) ctx.hint.textContent = tawafPoints[activeTawafIndex].title;
    updateTawafMarker();
    if (demoCharacter && tawafPoints[activeTawafIndex]) {
        const nextCenter = getTawafPointCenter(tawafPoints[activeTawafIndex]);
        if (nextCenter) {
            const pos = demoCharacter.position;
            const nextClamp = clampToOutsideKaaba(nextCenter.x, nextCenter.z);
            const startClamp = clampToOutsideKaaba(pos.x, pos.z);
            const startAngle = Math.atan2(startClamp.x, startClamp.z);
            const endAngle = Math.atan2(nextClamp.x, nextClamp.z);
            let totalAngle = (endAngle - startAngle + 2 * Math.PI) % (2 * Math.PI);
            if (totalAngle < 1e-6) totalAngle = 2 * Math.PI;
            const r1 = Math.sqrt(startClamp.x * startClamp.x + startClamp.z * startClamp.z);
            const r2 = Math.sqrt(nextClamp.x * nextClamp.x + nextClamp.z * nextClamp.z);
            const totalTime = (totalAngle * Math.max((r1 + r2) * 0.5, 1)) / DEMO_CHARACTER_WALK_SPEED;
            demoCharacterWalkTarget = new THREE.Vector3(nextClamp.x, groundY, nextClamp.z);
            demoCharacterArcWalk = { startAngle, totalAngle, r1, r2, totalTime: Math.max(0.5, totalTime), t: 0 };
            demoCharacter.position.set(startClamp.x, groundY, startClamp.z);
            demoCharacterWalking = true;
            playCharacterAction("walk");
            demoCharacter.lookAt(new THREE.Vector3(nextClamp.x, groundY, nextClamp.z));
        }
    }
}

function showHajjChoicePanel() {
    const overlay = document.createElement("div");
    overlay.style.cssText = "position:fixed; inset:0; background:rgba(0,0,0,0.85); z-index:100000; display:flex; align-items:center; justify-content:center; backdrop-filter:blur(5px);";

    const panel = document.createElement("div");
    panel.style.cssText = "background:white; padding:40px; border-radius:20px; text-align:center; max-width:500px; border:3px solid #d4af37; box-shadow:0 10px 30px rgba(0,0,0,0.5); font-family:sans-serif;";

    const title = document.createElement("h2");
    title.innerText = "Hajj Rituals Progress";
    title.style.cssText = "color:#d4af37; margin-bottom:20px; font-size:24px; text-transform:uppercase; letter-spacing:1px;";

    const msg = document.createElement("p");
    msg.innerText = "Would you like to perform Tawaf-el-Ziarat or return to the Main Menu?";
    msg.style.cssText = "color:#333; font-size:18px; line-height:1.6; margin-bottom:30px;";

    const btnStyle = "padding:12px 30px; border-radius:30px; border:none; font-weight:bold; cursor:pointer; font-size:16px; transition:transform 0.2s; margin:10px; width:200px;";

    const tawafBtn = document.createElement("button");
    tawafBtn.innerText = "Tawaf-el-Ziarat";
    tawafBtn.style.cssText = btnStyle + "background:#d4af37; color:white; border:2px solid #d4af37;";
    tawafBtn.onmouseover = () => tawafBtn.style.transform = "scale(1.05)";
    tawafBtn.onmouseout = () => tawafBtn.style.transform = "scale(1)";

    const menuBtn = document.createElement("button");
    menuBtn.innerText = "Main Menu";
    menuBtn.style.cssText = btnStyle + "background:white; color:#d4af37; border:2px solid #d4af37;";
    menuBtn.onmouseover = () => menuBtn.style.transform = "scale(1.05)";
    menuBtn.onmouseout = () => menuBtn.style.transform = "scale(1)";

    tawafBtn.onclick = () => {
        localStorage.removeItem("hajj_status");
        if (tawafPoints.length > 0) {
            // ✅ Swapping first tawaf audio for Hajj users
            tawafPoints[0].audio = "media/audio/HajjTawaf1.mp3";
        }
        document.body.removeChild(overlay);
        unlockMovement();
    };

    menuBtn.onclick = () => {
        localStorage.removeItem("hajj_status");
        if (ctx?.window?.sceneRouter) ctx.window.sceneRouter.exitScene();
        else window.location.reload();
    };

    panel.appendChild(title);
    panel.appendChild(msg);
    panel.appendChild(tawafBtn);
    panel.appendChild(menuBtn);
    overlay.appendChild(panel);
    document.body.appendChild(overlay);
    lockMovement();
}

export async function enter(c) {
    ctx = c;
    const { canvas, basePath } = ctx;
    if (!canvas) return;

    groundY = 0;
    const cfg = await loadSceneConfig(basePath);
    const camStart = cfg?.cameraStart || [0, 1.8, 0];
    CAMERA_START_Y = camStart[1];
    groundY = cfg?.groundY || 0;

    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x87ceeb);

    camera = new THREE.PerspectiveCamera(70, canvas.clientWidth / canvas.clientHeight, 0.1, 1000);
    camera.rotation.order = "YXZ";
    camera.position.set(camStart[0], CAMERA_START_Y, camStart[2]);

    renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    renderer.setSize(canvas.clientWidth, canvas.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    controls = new PointerLockControls(camera, canvas);

    mobileControls = new MobileControls();
    if (mobileControls) mobileControls.enable();

    const btns = autoFindButtons();
    const scnBtn = document.getElementById("sceneNextSceneBtn");
    if (scnBtn) {
        scnBtn.disabled = true; // ✅ Disabled until last point
        scnBtn.classList.add("hudBtnDisabled");
        scnBtn.style.display = "block";
        scnBtn.style.zIndex = "1000";
        scnBtn.style.pointerEvents = "auto";
        scnBtn.style.position = "relative";
    }
    ctx.nextBtn = btns.nextBtn;
    if (ctx.nextBtn) ctx.nextBtn.onclick = () => advanceTawaf();

    scene.add(new THREE.AmbientLight(0xffffff, 0.8));
    const sun = new THREE.DirectionalLight(0xffffff, 1);
    sun.position.set(5, 10, 5);
    scene.add(sun);

    await loadHaramModel(scene, basePath);
    await loadDemoCharacter(scene, basePath);
    tawafPoints = await loadTawaf(basePath);
    updateTawafMarker();

    // Check Hajj Completion
    if (localStorage.getItem("hajj_status") === "completed") {
        showHajjChoicePanel();
    }

    tick();
}

function tick() {
    requestAnimationFrame(tick);
    const dt = clock.getDelta();
    if (demoCharacterMixer) demoCharacterMixer.update(dt);
    if (tawafBeam?.material?.uniforms) tawafBeam.material.uniforms.uTime.value += 0.016;
    if (tawafRing) tawafRing.rotation.z += 0.01;

    if (!movementLocked) {
        velocity = new THREE.Vector3();
        if (controls?.isLocked) {
            camera.getWorldDirection(dir); dir.y = 0; dir.normalize();
            if (moveForward) velocity.add(dir);
            if (moveBack) velocity.sub(dir);
            right.crossVectors(dir, new THREE.Vector3(0, 1, 0));
            if (moveRight) velocity.add(right);
            if (moveLeft) velocity.sub(right);
        }

        if (mobileControls && mobileControls.enabled) {
            // Look
            if (mobileControls.lookVector.x !== 0) {
                controls.getObject().rotation.y -= mobileControls.lookVector.x;
            }
            if (mobileControls.lookVector.y !== 0) {
                camera.rotation.x -= mobileControls.lookVector.y;
                camera.rotation.x = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, camera.rotation.x));
            }

            // Move
            const mv = mobileControls.moveVector;
            if (mv.lengthSq() > 0.00001) {
                camera.getWorldDirection(dir); dir.y = 0; dir.normalize();
                right.crossVectors(dir, new THREE.Vector3(0, 1, 0));
                velocity.addScaledVector(dir, -mv.z);
                velocity.addScaledVector(right, mv.x);
            }
            mobileControls.update();
        }

        if (velocity.lengthSq() > 0) {
            if (velocity.lengthSq() > 1) velocity.normalize();
            camera.position.addScaledVector(velocity, MOVE_SPEED);
        }
    }
    camera.position.y = CAMERA_START_Y || 1.6;

    if (!tawafComplete && tawafPoints.length > 0) {
        const p = tawafPoints[activeTawafIndex];
        if (isInsideTawafPoint(p, camera.position) && !tawafMediaLocked) beginStep(p);
    }

    if (demoCharacterWalking && demoCharacterWalkTarget && demoCharacterArcWalk) {
        const arc = demoCharacterArcWalk;
        arc.t += 0.016 / arc.totalTime;
        const t = Math.min(1, arc.t);
        const angle = arc.startAngle + arc.totalAngle * t;
        let r = arc.r1 + (arc.r2 - arc.r1) * t;
        demoCharacter.position.set(r * Math.sin(angle), groundY, r * Math.cos(angle));
        if (t >= 1) { demoCharacterWalking = false; playCharacterAction("idle"); }
    }
    renderer.render(scene, camera);
}

export function exit() {
    if (renderer) renderer.dispose();
    if (mobileControls) {
        mobileControls.disable();
        mobileControls = null;
    }
}
