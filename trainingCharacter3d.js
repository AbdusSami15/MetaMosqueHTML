// trainingCharacter3d.js (FULL REPLACE) - Single "Talk" animation only + strong debug
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { resolveUrl } from "./src/basePath.js";

let renderer = null;
let scene = null;
let camera = null;
let mixer = null;
let clock = null;

let hostEl = null;
let canvasEl = null;

let rafId = 0;
let onResizeBound = null;

let modelRoot = null;
let activeAction = null;

const DEFAULTS = {
  modelUrl: "assets/scenes/umrah_haram/media/models/character.glb",

  hostStyle: {
    position: "absolute",
    right: "6%",
    bottom: "14%",
    width: "26%",
    height: "70%",
    pointerEvents: "none",
    zIndex: "6",
  },

  backgroundAlpha: 0,
  fov: 28,

  camPos: new THREE.Vector3(-0.35, 1.5, 3.9),
  camLookAt: new THREE.Vector3(-0.35, 1.25, 0.0),

  modelScale: 1.0,
  modelPos: new THREE.Vector3(0.0, 0, 0),
  modelRotY: 0,

  // Force talk only (exact match first, then contains)
  preferredClips: ["talk", "Talking", "Talk", "Armature|Talk", "Armature|Talking"],

  // Debug
  debug: true,
};

function applyStyles(el, styleObj) {
  if (!el || !styleObj) return;
  for (const k of Object.keys(styleObj)) el.style[k] = styleObj[k];
}

function log(cfg, ...args) {
  if (cfg && cfg.debug) console.log("[TrainingCharacter3D]", ...args);
}

function warn(cfg, ...args) {
  if (cfg && cfg.debug) console.warn("[TrainingCharacter3D]", ...args);
}

function error(cfg, ...args) {
  if (cfg && cfg.debug) console.error("[TrainingCharacter3D]", ...args);
}

// Strict clip pick: exact match first, then contains. NO fallback.
function pickClipStrict(clips, preferredNames) {
  if (!clips || !clips.length) return null;

  const list = clips.map((c) => ({ clip: c, n: String(c?.name || "").toLowerCase() }));

  // 1) exact match
  for (const pref of preferredNames || []) {
    const p = String(pref).toLowerCase();
    const exact = list.find((x) => x.n === p);
    if (exact) return exact.clip;
  }

  // 2) contains match
  for (const pref of preferredNames || []) {
    const p = String(pref).toLowerCase();
    const found = list.find((x) => x.n.includes(p));
    if (found) return found.clip;
  }

  // 3) no fallback
  return null;
}

function setRendererSizeToHost() {
  if (!renderer || !camera || !hostEl) return;

  const w = Math.max(2, hostEl.clientWidth | 0);
  const h = Math.max(2, hostEl.clientHeight | 0);

  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}

function tick() {
  rafId = requestAnimationFrame(tick);

  const dt = clock ? clock.getDelta() : 0.016;
  if (mixer) mixer.update(dt);

  if (renderer && scene && camera) renderer.render(scene, camera);
}

function disposeThreeDeep() {
  // Disposes geometries/materials/textures of modelRoot
  if (!modelRoot) return;
  modelRoot.traverse((o) => {
    if (!o.isMesh) return;

    if (o.geometry) {
      o.geometry.dispose();
    }

    if (o.material) {
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of mats) {
        if (!m) continue;
        if (m.map) m.map.dispose?.();
        if (m.normalMap) m.normalMap.dispose?.();
        if (m.roughnessMap) m.roughnessMap.dispose?.();
        if (m.metalnessMap) m.metalnessMap.dispose?.();
        if (m.aoMap) m.aoMap.dispose?.();
        if (m.emissiveMap) m.emissiveMap.dispose?.();
        m.dispose?.();
      }
    }
  });
}

export async function initTrainingCharacter3D(options = {}) {
  const cfg = {
    ...DEFAULTS,
    ...options,
    hostStyle: { ...DEFAULTS.hostStyle, ...(options.hostStyle || {}) },
  };

  disposeTrainingCharacter3D();

  hostEl = typeof cfg.host === "string" ? document.getElementById(cfg.host) : cfg.host;
  if (!hostEl) {
    warn(cfg, "Host element not found.");
    return false;
  }

  // Canvas
  canvasEl = document.createElement("canvas");
  canvasEl.style.width = "100%";
  canvasEl.style.height = "100%";
  canvasEl.style.display = "block";
  hostEl.appendChild(canvasEl);

  // Renderer
  renderer = new THREE.WebGLRenderer({
    canvas: canvasEl,
    antialias: true,
    alpha: true,
    premultipliedAlpha: true,
  });

  // Optimization: cap DPR (Chromebook/Web)
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setClearColor(0x000000, cfg.backgroundAlpha);

  // Scene
  scene = new THREE.Scene();

  // Camera
  const w = Math.max(2, hostEl.clientWidth | 0);
  const h = Math.max(2, hostEl.clientHeight | 0);

  camera = new THREE.PerspectiveCamera(cfg.fov, w / h, 0.01, 80);
  camera.position.copy(cfg.camPos);
  camera.lookAt(cfg.camLookAt);

  // Lights (cheap)
  scene.add(new THREE.AmbientLight(0xffffff, 0.9));
  const key = new THREE.DirectionalLight(0xffffff, 0.9);
  key.position.set(2, 4, 3);
  scene.add(key);

  // Load model
  const loader = new GLTFLoader();
  const modelUrl = resolveUrl(cfg.modelUrl);

  log(cfg, "Loading model:", modelUrl);

  let gltf;
  try {
    gltf = await new Promise((resolve, reject) => {
      loader.load(modelUrl, resolve, undefined, reject);
    });
  } catch (e) {
    error(cfg, "Model load failed:", e);
    return false;
  }

  modelRoot = gltf.scene || gltf.scenes?.[0];
  if (!modelRoot) {
    error(cfg, "No scene found in GLTF.");
    return false;
  }

  // Fix materials (cheap + safe)
  modelRoot.traverse((o) => {
    if (!o.isMesh) return;
    o.frustumCulled = true;

    if (o.material) {
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of mats) {
        if (m?.map) m.map.colorSpace = THREE.SRGBColorSpace;
        if (m) m.needsUpdate = true;
      }
    }
  });

  // Transforms
  modelRoot.scale.setScalar(cfg.modelScale);
  modelRoot.position.copy(cfg.modelPos);
  modelRoot.rotation.y = cfg.modelRotY;

  scene.add(modelRoot);

  // Ground align
  {
    const box = new THREE.Box3().setFromObject(modelRoot);
    const minY = box.min.y;
    modelRoot.position.y -= minY;
  }

    // Animation - ensure only one clip runs at a time (robust stop of others)
    {
      const clips = gltf.animations || [];
      log(cfg, "Found clips:", clips.map((c) => c.name));

      if (!clips.length) {
        warn(cfg, "No animations found in model.");
      } else {
        mixer = new THREE.AnimationMixer(modelRoot);
        mixer.stopAllAction();
        mixer.timeScale = 1;

        // Create actions for all clips and stop/disable them explicitly
        const actions = clips.map((c) => ({ clip: c, action: mixer.clipAction(c) }));
        for (const { clip: c, action: a } of actions) {
          if (!a) continue;
          try { a.stop(); } catch {}
          try { a.reset(); } catch {}
          a.enabled = false;
          a.setEffectiveWeight(0);
          // set a safe loop mode (repeat) so it doesn't leave bones in odd states
          try { a.setLoop(THREE.LoopRepeat, Infinity); } catch {}
        }

        // Pick preferred clip (strict), fallback to single clip if present
        let clip = pickClipStrict(clips, cfg.preferredClips);
        if (!clip && clips.length === 1) {
          clip = clips[0];
          warn(cfg, "Preferred clip not matched. Only one clip exists so playing:", clip.name);
        }

        if (!clip) {
          warn(cfg, "No matching clip found. All actions will remain stopped.");
        } else {
          log(cfg, "Selected clip:", clip.name);

          // Ensure all other actions remain stopped and unregistered
          for (const c of clips) {
            if (c === clip) continue;
            try {
              const other = mixer.clipAction(c);
              if (other) {
                other.stop();
                other.enabled = false;
                other.setEffectiveWeight(0);
                mixer.uncacheAction(c, modelRoot);
              }
            } catch (e) { /* ignore */ }
          }

          // Play the selected action only
          const sel = mixer.clipAction(clip);
          sel.reset();
          sel.enabled = true;
          sel.setEffectiveWeight(1);
          try { sel.setLoop(THREE.LoopRepeat, Infinity); } catch {}
          sel.play();
          activeAction = sel;
        }
      }
    }

  clock = new THREE.Clock();

  // Host style + size
  applyStyles(hostEl, cfg.hostStyle);
  setRendererSizeToHost();

  onResizeBound = () => setRendererSizeToHost();
  window.addEventListener("resize", onResizeBound);

  tick();
  return true;
}

export function disposeTrainingCharacter3D() {
  if (rafId) cancelAnimationFrame(rafId);
  rafId = 0;

  if (onResizeBound) window.removeEventListener("resize", onResizeBound);
  onResizeBound = null;

  if (mixer) {
    mixer.stopAllAction();
    try {
      // Strong cleanup
      if (modelRoot) mixer.uncacheRoot(modelRoot);
    } catch {}
  }
  mixer = null;
  activeAction = null;
  clock = null;

  if (scene && modelRoot) scene.remove(modelRoot);

  // Optional deep dispose (helps on repeated open/close)
  try { disposeThreeDeep(); } catch {}

  modelRoot = null;

  if (renderer) renderer.dispose();
  renderer = null;
  scene = null;
  camera = null;

  if (hostEl && canvasEl && canvasEl.parentNode === hostEl) hostEl.removeChild(canvasEl);
  canvasEl = null;
  hostEl = null;
}
