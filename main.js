const mainMenu = document.getElementById("mainMenu");
const optionsScreen = document.getElementById("optionsScreen");

const exitOverlay = document.getElementById("exitOverlay");
const exitYes = document.getElementById("exitYes");
const exitNo = document.getElementById("exitNo");

const pilgrimageOverlay = document.getElementById("pilgrimageOverlay");
const disclaimerOverlay = document.getElementById("disclaimerOverlay");

let exitOpen = false;
let pilgrimageOpen = false;
let disclaimerOpen = false;

let pendingPilgrimage = null; // "hajj" | "umrah"

function show(el) { if (el) el.classList.remove("hidden"); }
function hide(el) { if (el) el.classList.add("hidden"); }

function showMainMenu() {
  show(mainMenu);
  hide(optionsScreen);
}

function showOptions() {
  hide(mainMenu);
  show(optionsScreen);
}

function openExit() {
  if (!exitOverlay) return;
  show(exitOverlay);
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
  try { window.close(); } catch (_) {}
  document.body.innerHTML =
    "<div style='height:100vh;display:flex;align-items:center;justify-content:center;background:#000;color:#fff;font-family:system-ui,Segoe UI,Arial'>Session Ended</div>";
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
  pendingPilgrimage = mode; // "hajj" or "umrah"
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

function proceedAfterDisclaimer() {
  const mode = pendingPilgrimage;
  pendingPilgrimage = null;

  // Close overlays
  closeDisclaimer();
  closePilgrimage();

  // TODO: yahan actual Three.js scene/flow start karo
  console.log("Proceed to:", mode);

  // Example placeholder: show a lightweight "loading" log
  // You can replace with real loader (assets fetch, progress bar, etc.)
}

document.addEventListener("click", (e) => {
  const actionBtn = e.target.closest("[data-action]");
  if (actionBtn) {
    const action = actionBtn.getAttribute("data-action");

    // MAIN TOP BUTTONS
    if (action === "exit") { openExit(); return; }
    if (action === "options") { showOptions(); return; }
    if (action === "backToMenu") { showMainMenu(); return; }

    // METAIMAM -> OPEN HAJJ/UMRAH PANEL
    if (action === "metaimam") { openPilgrimage(); return; }

    // PILGRIMAGE PANEL
    if (action === "pilgrimageClose") { closePilgrimage(); return; }
    if (action === "chooseHajj") { openDisclaimer("hajj"); return; }
    if (action === "chooseUmrah") { openDisclaimer("umrah"); return; }

    // DISCLAIMER OK
    if (action === "disclaimerOk") { proceedAfterDisclaimer(); return; }

    // OPTIONS ACTIONS
    if (action === "contact") { console.log("CONTACT US"); return; }
    if (action === "privacy") { console.log("PRIVACY POLICY"); return; }
    if (action === "facebook") { console.log("FACEBOOK"); return; }
    if (action === "instagram") { console.log("INSTAGRAM"); return; }
    if (action === "youtube") { console.log("YOUTUBE"); return; }

    console.log("Action:", action);
    return;
  }

  const tileBtn = e.target.closest("[data-scene]");
  if (tileBtn) {
    console.log("Selected scene:", tileBtn.getAttribute("data-scene"));
  }

  // click outside close overlays
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

    if (optionsScreen && !optionsScreen.classList.contains("hidden")) {
      showMainMenu();
    }
  }

  if (exitOpen && e.key === "Enter") confirmExit();
});

// default view
showMainMenu();
