const OPTIONS_LOGO_PATH = "assets/ui/options_logo.webp";

const mainMenu = document.getElementById("mainMenu");
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
const trainingRoot = document.getElementById("trainingRoot");
const sceneRoot = document.getElementById("sceneRoot");

let exitOpen = false;
let pilgrimageOpen = false;
let disclaimerOpen = false;
let pendingPilgrimage = null;

function show(el) { if (el) el.classList.remove("hidden"); }
function hide(el) { if (el) el.classList.add("hidden"); }

function showMainMenu() {
  show(mainMenu);
  hide(optionsScreen);
  hide(trainingRoot);
  if (sceneRoot) hide(sceneRoot);
}

function showOptions() {
  hide(mainMenu);
  show(optionsScreen);
}

function initOptionsLogo() {
  if (!optionsLogoImg || !optionsLogoPlaceholder) return;
  const path = OPTIONS_LOGO_PATH.startsWith("./") ? OPTIONS_LOGO_PATH : "./" + OPTIONS_LOGO_PATH;
  show(optionsLogoPlaceholder);
  hide(optionsLogoImg);
  optionsLogoImg.onload = function () {
    hide(optionsLogoPlaceholder);
    show(optionsLogoImg);
  };
  optionsLogoImg.onerror = function () {
    console.warn("MetaMosque: options logo not found at " + path);
    show(optionsLogoPlaceholder);
    hide(optionsLogoImg);
  };
  optionsLogoImg.src = path;
}

function openExit() {
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
  try {
    window.close();
  } catch (_) {}
  if (exitHint) show(exitHint);
}

function openPilgrimage() {
  if (!pilgrimageOverlay) return;
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
  closeDisclaimer();
  closePilgrimage();
  showLoading();
  setTimeout(function () {
    hideLoading();
    hide(mainMenu);
    hide(optionsScreen);
    show(trainingRoot);
    window.dispatchEvent(new CustomEvent("metamosque:startTraining", { detail: { mode } }));
  }, 1200);
}

document.addEventListener("click", (e) => {
  const actionBtn = e.target.closest("[data-action]");
  if (actionBtn) {
    const action = actionBtn.getAttribute("data-action");
    if (action === "exit") { openExit(); return; }
    if (action === "options") { showOptions(); return; }
    if (action === "backToMenu") { showMainMenu(); return; }
    if (action === "metaimam") { openPilgrimage(); return; }
    if (action === "pilgrimageClose") { closePilgrimage(); return; }
    if (action === "chooseHajj") { openDisclaimer("hajj"); return; }
    if (action === "chooseUmrah") { openDisclaimer("umrah"); return; }
    if (action === "disclaimerOk") {
      if (pendingPilgrimage !== null) proceedAfterDisclaimer();
      return;
    }
    if (action === "sceneBackToMenu") {
      if (window.sceneRouter && typeof window.sceneRouter.exitScene === "function") {
        window.sceneRouter.exitScene();
      } else {
        hide(sceneRoot);
        show(mainMenu);
      }
      return;
    }
    return;
  }
  if (exitOpen && e.target === exitOverlay) closeExit();
  if (pilgrimageOpen && e.target === pilgrimageOverlay) closePilgrimage();
  if (disclaimerOpen && e.target === disclaimerOverlay) closeDisclaimer();
});

if (exitNo) exitNo.addEventListener("click", closeExit);
if (exitYes) exitYes.addEventListener("click", confirmExit);

window.addEventListener("keydown", (e) => {
  if (e.key && e.key.toLowerCase() === "f") {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
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
  hide(optionsScreen);
  hide(trainingRoot);
  if (window.sceneRouter && typeof window.sceneRouter.enterScene === "function") {
    window.sceneRouter.enterScene(sceneId);
  } else {
    hide(mainMenu);
    if (sceneRoot) show(sceneRoot);
  }
});

initOptionsLogo();
showMainMenu();
// ================= LINKS (SOCIAL + POLICY + CONTACT) =================
(function () {
  const LINKS = {
    facebook: "https://www.facebook.com/p/MetaMosque-100094183150899/",
    instagram: "https://www.instagram.com/meta_mosque/",
    youtube: "https://www.youtube.com/channel/UC9fQVXzzN3gM26XdSgTw6Rw",
    privacy: "https://games.tecshield.io/terms-conditions/dbf760bc1fd1a28b2d40",
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

