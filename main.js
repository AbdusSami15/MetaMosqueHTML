const OPTIONS_LOGO_PATH = "assets/ui/options_logo.webp";
function assetUrl(rel) {
  return (typeof window !== "undefined" && window.resolveAssetUrl) ? window.resolveAssetUrl(rel) : (rel.startsWith("./") ? rel : "./" + rel);
}



const mainMenu = document.getElementById("homeScreen");
const optionsScreen = document.getElementById("optionsScreen");
const optionsLogoImg = document.getElementById("optionsLogoImg");
const optionsLogoPlaceholder = document.getElementById("optionsLogoPlaceholder");
const exitOverlay = document.getElementById("exitOverlay");
const exitYes = document.getElementById("exitYes");
const exitNo = document.getElementById("exitNo");
const exitHint = document.getElementById("exitHint");
const loadingOverlay = document.getElementById("loadingOverlay");
const pilgrimageOverlay = document.getElementById("pilgrimageOverlay");
const disclaimerOverlay = document.getElementById("disclaimerOverlay");
const globalOptionsBtn = document.getElementById("globalOptionsBtn");
const homeScreen = document.getElementById("homeScreen");
const homePilgrimageView = document.getElementById("homePilgrimageView");
const homeLoginView = document.getElementById("homeLoginView");
const homeSignUpView = document.getElementById("homeSignUpView");
const homeForgetPasswordView = document.getElementById("homeForgetPasswordView");
const homeIntroAudio = document.getElementById("homeIntroAudio");
const API_BASE_URL = (location.hostname === "localhost" || location.hostname === "127.0.0.1") ? "" : "https://app.metamosque.com";
window.IS_LOGGED_IN = false;
if (homeIntroAudio) {
  homeIntroAudio.onerror = () => console.warn("MetaImam: Intro.mp3 failed to load. Check path: assets/media/audio/Intro.mp3");
}

let exitOpen = false;
let pilgrimageOpen = false;
let disclaimerOpen = false;
let pendingPilgrimage = null;

function show(el) { if (el) el.classList.remove("hidden"); }
function hide(el) { if (el) el.classList.add("hidden"); }

function showGlobalOptions() {
  // Only show if we are in a 3D scene (sceneRoot is visible)
  // AND NOT in trainingRoot
  const isInScene = sceneRoot && !sceneRoot.classList.contains("hidden");
  const isInTraining = trainingRoot && !trainingRoot.classList.contains("hidden");

  if (isInScene && !isInTraining) {
    show(globalOptionsBtn);
  } else {
    hide(globalOptionsBtn);
  }
}
function hideGlobalOptions() { hide(globalOptionsBtn); }

// --- Home Intro Audio Logic ---
function playHomeIntro() {
  if (!homeIntroAudio) return;
  homeIntroAudio.play().catch(() => {
    // Autoplay blocked: wait for first interaction
    const startOnInteraction = () => {
      homeIntroAudio.play();
      document.removeEventListener("click", startOnInteraction);
    };
    document.addEventListener("click", startOnInteraction);
  });
}

function stopHomeIntro() {
  if (!homeIntroAudio) return;
  homeIntroAudio.pause();
  homeIntroAudio.currentTime = 0;
}
window.stopHomeIntro = stopHomeIntro; // Expose to global scope

function showHomeScreen(view = "pilgrimage") {
  const wasHomeHidden = homeScreen && homeScreen.classList.contains("hidden");

  show(homeScreen);
  hide(optionsScreen);
  hide(trainingRoot);
  hideGlobalOptions();
  if (sceneRoot) hide(sceneRoot);

  if (view === "login") {
    hide(homePilgrimageView);
    hide(homeSignUpView);
    hide(homeForgetPasswordView);
    show(homeLoginView);
    stopHomeIntro();
  } else if (view === "signup") {
    hide(homePilgrimageView);
    hide(homeLoginView);
    hide(homeForgetPasswordView);
    show(homeSignUpView);
    stopHomeIntro();
  } else if (view === "forgot") {
    hide(homePilgrimageView);
    hide(homeLoginView);
    hide(homeSignUpView);
    show(homeForgetPasswordView);
    stopHomeIntro();
  } else {
    show(homePilgrimageView);
    hide(homeLoginView);
    hide(homeSignUpView);
    hide(homeForgetPasswordView);

    const wasInLogin = homeLoginView && !homeLoginView.classList.contains("hidden");
    const wasInSignup = homeSignUpView && !homeSignUpView.classList.contains("hidden");
    const wasInForgot = homeForgetPasswordView && !homeForgetPasswordView.classList.contains("hidden");

    if (wasHomeHidden || wasInLogin || wasInSignup || wasInForgot) {
      playHomeIntro();
    }
  }
}

function showOptions() {
  hide(mainMenu);
  show(optionsScreen);
}

function initOptionsLogo() {
  if (!optionsLogoImg || !optionsLogoPlaceholder) return;
  const path = assetUrl(OPTIONS_LOGO_PATH);
  show(optionsLogoPlaceholder);
  hide(optionsLogoImg);
  optionsLogoImg.onload = function () {
    hide(optionsLogoPlaceholder);
    show(optionsLogoImg);
  };
  optionsLogoImg.onerror = function () {
    console.warn("MetaImam: options logo not found at " + path);
    show(optionsLogoPlaceholder);
    hide(optionsLogoImg);
  };
  optionsLogoImg.src = path;
}

function openExit() {
  console.log("MetaImam: openExit triggered");
  if (!exitOverlay) return;
  show(exitOverlay);
  if (exitHint) hide(exitHint);
  exitOverlay.setAttribute("aria-hidden", "false");
  exitOpen = true;
  if (exitNo) exitNo.focus();
}

function closeExit() {
  if (!exitOverlay) return;
  hide(exitOverlay);
  exitOverlay.setAttribute("aria-hidden", "true");
  exitOpen = false;
}

function confirmExit() {
  closeExit();
  hide(optionsScreen);
  if (window.sceneRouter && typeof window.sceneRouter.exitScene === "function") {
    window.sceneRouter.exitScene();
  } else {
    showHomeScreen();
  }
}

function openPilgrimage() {
  if (!window.IS_LOGGED_IN) {
    showHomeScreen("login");
    showAuthMessage("login", "Please login to access pilgrimages", "error");
    return;
  }
  if (!pilgrimageOverlay) return;
  hide(mainMenu);
  hideGlobalOptions();
  show(pilgrimageOverlay);
  pilgrimageOverlay.setAttribute("aria-hidden", "false");
  pilgrimageOpen = true;
}

function closePilgrimage() {
  if (!pilgrimageOverlay) return;
  hide(pilgrimageOverlay);
  pilgrimageOverlay.setAttribute("aria-hidden", "true");
  pilgrimageOpen = false;
}

function openDisclaimer(mode) {
  pendingPilgrimage = mode;
  if (!disclaimerOverlay) return;
  show(disclaimerOverlay);
  disclaimerOverlay.setAttribute("aria-hidden", "false");
  disclaimerOpen = true;
}

function closeDisclaimer() {
  if (!disclaimerOverlay) return;
  hide(disclaimerOverlay);
  disclaimerOverlay.setAttribute("aria-hidden", "true");
  disclaimerOpen = false;
}

function showLoading() {
  if (loadingOverlay) show(loadingOverlay);
}

function hideLoading() {
  if (loadingOverlay) hide(loadingOverlay);
}

function proceedAfterDisclaimer() {
  const mode = pendingPilgrimage;
  pendingPilgrimage = null;
  // Store mode globally so scenes (e.g. Safa Marwah) can check it later
  window.PILGRIMAGE_MODE = mode;

  // ✅ Debug: Print selected pilgrimage mode
  const isHajj = mode === "hajj";
  const isUmrah = mode === "umrah";
  console.log("=== PILGRIMAGE SELECTION ===");
  console.log("[" + (isHajj ? "✅" : "❌") + "] HAJJ  =", isHajj);
  console.log("[" + (isUmrah ? "✅" : "❌") + "] UMRAH =", isUmrah);
  console.log("window.PILGRIMAGE_MODE =", window.PILGRIMAGE_MODE);
  closeDisclaimer();
  closePilgrimage();
  hide(homeScreen);
  showLoading();
  setTimeout(function () {
    hideLoading();
    hide(homeScreen); // Ensure home screen is hidden
    hide(optionsScreen);
    show(trainingRoot);
    hideGlobalOptions(); // Explicitly hide during training
    window.dispatchEvent(new CustomEvent("metamosque:startTraining", { detail: { mode } }));
  }, 1200);
}

document.addEventListener("click", (e) => {
  const actionBtn = e.target.closest("[data-action], [data-scene]");
  if (actionBtn) {
    const sceneId = actionBtn.getAttribute("data-scene");
    if (sceneId) {
      hide(homeScreen);
      hide(mainMenu);
      showLoading();
      setTimeout(function () {
        hideLoading();
        if (window.sceneRouter && typeof window.sceneRouter.enterScene === "function") {
          window.sceneRouter.enterScene(sceneId);
        } else {
          show(sceneRoot);
        }
      }, 1000);
      return;
    }

    const action = actionBtn.getAttribute("data-action");
    if (action === "exit") { openExit(); return; }
    if (action === "logout") { handleLogout(); return; }
    if (action === "options") {
      stopHomeIntro();
      showOptions();
      return;
    }
    if (action === "backToMenu") {
      const isIngame = (sceneRoot && !sceneRoot.classList.contains("hidden")) ||
        (trainingRoot && !trainingRoot.classList.contains("hidden"));

      if (isIngame) {
        hide(optionsScreen);
        showGlobalOptions();
      } else {
        showHomeScreen();
      }
      return;
    }
    if (action === "metaimam") { openPilgrimage(); return; }
    if (action === "menu") { showHomeScreen(); return; }
    if (action === "login") {
      stopHomeIntro();
      showHomeScreen("login");
      return;
    }
    if (action === "chooseHajj") {
      if (!window.IS_LOGGED_IN) { showHomeScreen("login"); return; }
      stopHomeIntro();
      openDisclaimer("hajj");
      return;
    }
    if (action === "chooseUmrah") {
      if (!window.IS_LOGGED_IN) { showHomeScreen("login"); return; }
      stopHomeIntro();
      openDisclaimer("umrah");
      return;
    }
    if (action === "goToSignUp") {
      showHomeScreen("signup");
      return;
    }
    if (action === "goToLogin") {
      showHomeScreen("login");
      return;
    }
    if (action === "goToForgot") {
      showHomeScreen("forgot");
      return;
    }
    if (action === "pilgrimageClose") { showHomeScreen(); return; }
    if (action === "disclaimerOk") {
      stopHomeIntro();
      if (pendingPilgrimage !== null) proceedAfterDisclaimer();
      return;
    }

    // --- AUTH FORM SUBMISSIONS ---
    if (action === "loginSubmit") { handleAuthSubmit("login"); return; }
    if (action === "signUpSubmit") { handleAuthSubmit("signup"); return; }
    if (action === "forgotSubmit") { handleAuthSubmit("forgot"); return; }

    // sceneNextScene: default handler for scenes like umrah_haram → go to safa_marwah
    // (safa_marwah uses e.stopPropagation() on its own SCENE button, so it won't hit this)
    if (action === "sceneNextScene") {
      if (window.sceneRouter && typeof window.sceneRouter.enterScene === "function") {
        window.sceneRouter.enterScene("safa_marwah");
      }
      return;
    }

  }
  if (exitOpen && e.target === exitOverlay) closeExit();
  if (pilgrimageOpen && e.target === pilgrimageOverlay) closePilgrimage();
  if (disclaimerOpen && e.target === disclaimerOverlay) closeDisclaimer();
  if (disclaimerOpen && e.target === disclaimerOverlay) closeDisclaimer();
});

if (exitNo) exitNo.addEventListener("click", closeExit);
if (exitYes) exitYes.addEventListener("click", confirmExit);

window.addEventListener("keydown", (e) => {
  if (e.key && e.key.toLowerCase() === "f") {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => { });
    } else {
      document.exitFullscreen().catch(() => { });
    }
  }
  if (e.key === "Escape") {
    if (exitOpen) { closeExit(); return; }
    if (disclaimerOpen) { closeDisclaimer(); return; }
    if (pilgrimageOpen) { closePilgrimage(); return; }
  }
  if (exitOpen && e.key === "Enter") confirmExit();
});

window.addEventListener("metamosque:goToScene", function (e) {
  const raw = e.detail && e.detail.sceneId;
  const sceneId = (raw && String(raw).trim()) ? String(raw).trim() : "umrah_haram";
  hide(homeScreen);
  hide(optionsScreen);
  hide(trainingRoot);
  if (window.sceneRouter && typeof window.sceneRouter.enterScene === "function") {
    window.sceneRouter.enterScene(sceneId);
  } else {
    hide(homeScreen);
    if (sceneRoot) show(sceneRoot);
  }
});

initOptionsLogo();
checkAuth();
showHomeScreen();

// --- Auth API Services & Handlers ---
async function fetchAPI(endpoint, data = null, method = "POST") {
  const url = API_BASE_URL + endpoint;
  const token = localStorage.getItem("mm_token");
  const headers = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = "Bearer " + token;

  try {
    const options = { method, headers };
    if (data) options.body = JSON.stringify(data);

    const response = await fetch(url, options);
    if (response.status === 401) {
      if (endpoint.includes("/api/auth/")) {
        // Authenticate attempt failed (e.g. wrong password)
        const errorBody = await response.json().catch(() => ({}));
        return { error: true, message: errorBody.message || "Incorrect email or password." };
      }
      handleLogout();
      return { error: true, message: "Session expired. Please login again." };
    }
    return await response.json();
  } catch (err) {
    console.error("MetaImam API Error:", err);
    return { error: true, message: "Network error. Please try again later." };
  }
}

function updateAuthUI() {
  const loginBtn = document.getElementById("sidebarLoginBtn");
  const logoutBtn = document.getElementById("sidebarLogoutBtn");
  if (window.IS_LOGGED_IN) {
    if (loginBtn) hide(loginBtn);
    if (logoutBtn) show(logoutBtn);
  } else {
    if (loginBtn) show(loginBtn);
    if (logoutBtn) hide(logoutBtn);
  }
}

async function checkAuth() {
  const token = localStorage.getItem("mm_token");
  if (!token) {
    window.IS_LOGGED_IN = false;
    updateAuthUI();
    return;
  }
  // Optional: Add a request to verify token on serve if endpoint exists
  // For now we trust existence or it will fail on first protected call
  window.IS_LOGGED_IN = true;
  updateAuthUI();
}

function handleLogout() {
  localStorage.removeItem("mm_token");
  window.IS_LOGGED_IN = false;
  updateAuthUI();
  showHomeScreen("login");
}

function showAuthMessage(view, message, type = "error") {
  const statusEl = document.getElementById(view + "Status");
  if (!statusEl) return;
  statusEl.textContent = message;
  statusEl.className = "authStatusMessage " + type;
  statusEl.classList.remove("hidden");
  setTimeout(() => statusEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 50);
}

function clearAuthMessage(view) {
  const statusEl = document.getElementById(view + "Status");
  if (statusEl) statusEl.classList.add("hidden");
}

function validateEmail(email) {
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return re.test(email);
}

async function handleAuthSubmit(type) {
  let endpoint = "";
  let payload = {};
  let submitBtn = null;
  let viewKey = type;

  if (type === "login") {
    const email = document.getElementById("loginEmail")?.value;
    const password = document.getElementById("loginPassword")?.value;
    if (!email || !password) { showAuthMessage("login", "Please enter email and password"); return; }
    if (!validateEmail(email)) { showAuthMessage("login", "Invalid email format"); return; }
    if (password.length < 6) { showAuthMessage("login", "Password must be at least 6 characters"); return; }
    endpoint = "/api/auth/login";
    payload = { email, password };
    submitBtn = document.querySelector('[data-action="loginSubmit"]');
  } else if (type === "signup") {
    const name = document.getElementById("signUpName")?.value;
    const email = document.getElementById("signUpEmail")?.value;
    const password = document.getElementById("signUpPassword")?.value;
    if (!name || !email || !password) { showAuthMessage("signUp", "Please fill all fields"); return; }
    if (!validateEmail(email)) { showAuthMessage("signUp", "Invalid email format"); return; }
    if (password.length < 6) { showAuthMessage("signUp", "Password must be at least 6 characters"); return; }
    endpoint = "/api/auth/signup";
    payload = { name, email, password };
    submitBtn = document.querySelector('[data-action="signUpSubmit"]');
    viewKey = "signUp";
  } else if (type === "forgot") {
    const email = document.getElementById("forgotEmail")?.value;
    if (!email) { showAuthMessage("forgot", "Please enter your email"); return; }
    if (!validateEmail(email)) { showAuthMessage("forgot", "Invalid email format"); return; }
    endpoint = "/api/auth/forgot-password";
    payload = { email };
    submitBtn = document.querySelector('[data-action="forgotSubmit"]');
  }

  if (submitBtn) submitBtn.disabled = true;
  clearAuthMessage(viewKey);

  const result = await fetchAPI(endpoint, payload);

  if (submitBtn) submitBtn.disabled = false;

  if (result.error || result.message?.toLowerCase().includes("error") || result.success === false) {
    showAuthMessage(viewKey, result.message || "An error occurred", "error");
  } else {
    showAuthMessage(viewKey, result.message || "Success!", "success");
    if (type === "login" && result.token) {
      localStorage.setItem("mm_token", result.token);
      window.IS_LOGGED_IN = true;
      updateAuthUI();
      setTimeout(() => showHomeScreen("pilgrimage"), 1500);
    } else if (type === "signup" || type === "forgot") {
      setTimeout(() => showHomeScreen("login"), 3000);
    }
  }
}
// ================= LINKS (SOCIAL + POLICY + CONTACT) =================
(function () {
  const LINKS = {
    facebook: "https://www.facebook.com/p/MetaMosque-100094183150899/",
    instagram: "https://www.instagram.com/meta_mosque/",
    youtube: "https://www.youtube.com/channel/UC9fQVXzzN3gM26XdSgTw6Rw",
    privacy: "https://www.metamosque.com/privacy-policy",
    contact: "https://www.metamosque.com/"
  };

  document.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-action]");
    if (!btn) return;

    const action = btn.getAttribute("data-action");
    const url = LINKS[action];
    if (!url) return;

    e.preventDefault();
    window.open(url, "_blank", "noopener,noreferrer");
  });
})();

