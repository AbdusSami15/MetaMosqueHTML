import * as THREE from "three";

export class MobileControls {
  constructor(options = {}) {
    this.domElement = options.domElement || document.body;
    this.speed = options.speed || 0.15;
    this.rotationSpeed = options.rotationSpeed || 0.004;

    // Output vectors
    this.moveVector = new THREE.Vector3(0, 0, 0); // x=left/right, z=fwd/back
    this.lookVector = new THREE.Vector2(0, 0);    // x=yaw, y=pitch

    // Internal state
    this.touchIdMove = null;
    this.touchIdLook = null;

    this.joystickBase = null;
    this.joystickStick = null;
    this.lookZone = null;

    this.joystickCenter = new THREE.Vector2();
    this.joystickMaxRadius = 40; // px

    this.enabled = false;

    // Bindings
    this._onTouchStart = this._onTouchStart.bind(this);
    this._onTouchMove = this._onTouchMove.bind(this);
    this._onTouchEnd = this._onTouchEnd.bind(this);

    this.initUI();
  }

  initUI() {
    // Create UI elements dynamically if they don't exist, 
    // or expected to be in HTML. For this plan, we assume they are passed or found.
    // However, to be self-contained, let's look for them or creates them? 
    // The plan said "Add container elements... in index.html". 
    // So we will look for them.

    this.container = document.getElementById("mobileControls");
    this.joystickBase = document.getElementById("joystickBase");
    this.joystickStick = document.getElementById("joystickStick");
    this.lookZone = document.getElementById("lookZone");

    if (!this.container || !this.joystickBase || !this.joystickStick || !this.lookZone) {
      console.warn("MobileControls: UI elements not found in DOM via IDs.");
      return;
    }
  }


  isMobile() {
    const ua = navigator.userAgent || navigator.vendor || window.opera;
    const isTouch = (('ontouchstart' in window) || (navigator.maxTouchPoints > 0));

    // iPads often identify as Macintosh in Desktop mode, but have touch capability
    const isIPad = /iPad/i.test(ua) || (ua.includes("Macintosh") && navigator.maxTouchPoints > 1);
    const isMobileUA = isIPad || /Android|webOS|iPhone|iPod|BlackBerry|IEMobile|Opera Mini/i.test(ua);

    // Support larger tablets up to iPad Pro Pro 12.9" (1024x1366)
    const isNarrow = window.innerWidth <= 1366;

    return isMobileUA || (isTouch && isNarrow);
  }

  enable() {
    if (this.enabled) return;

    // Check if mobile
    if (!this.isMobile()) {
      console.log("MobileControls: Not a mobile device, skipping enable.");
      return;
    }

    this.domElement.addEventListener("touchstart", this._onTouchStart, { passive: false });
    this.domElement.addEventListener("touchmove", this._onTouchMove, { passive: false });
    this.domElement.addEventListener("touchend", this._onTouchEnd, { passive: false });
    this.enabled = true;

    // Show Container
    if (this.container) {
      this.container.classList.remove("hidden-mobile");

      // Force layout check or wait for render to ensure getBoundingClientRect is correct
      // But in JS execution, removing class should trigger style recalc before next read if we force it.
      // Reading offsetHeight forces reflow.
      const _ = this.container.offsetHeight;

      // Recalculate center now that it's visible
      const rect = this.joystickBase.getBoundingClientRect();
      this.joystickCenter.set(rect.left + rect.width / 2, rect.top + rect.height / 2);
    }
  }

  disable() {
    if (!this.enabled) return;
    this.domElement.removeEventListener("touchstart", this._onTouchStart);
    this.domElement.removeEventListener("touchmove", this._onTouchMove);
    this.domElement.removeEventListener("touchend", this._onTouchEnd);
    this.enabled = false;

    // Hide UI
    // Hide UI
    if (this.container) this.container.classList.add("hidden-mobile");

    this.resetMove();
    this.resetLook();
  }

  update() {
    // Decay look vector (simulation of drag release)
    this.lookVector.set(0, 0);
  }

  resetMove() {
    this.moveVector.set(0, 0, 0);
    this.touchIdMove = null;
    if (this.joystickStick) {
      this.joystickStick.style.transform = `translate(0px, 0px)`;
    }
  }

  resetLook() {
    this.lookVector.set(0, 0);
    this.touchIdLook = null;
  }

  _onTouchStart(e) {
    if (!this.enabled) return;

    for (let i = 0; i < e.changedTouches.length; i++) {
      const touch = e.changedTouches[i];
      const x = touch.clientX;
      const y = touch.clientY;
      const width = window.innerWidth;

      // Left half = Move (Joystick)
      if (this.touchIdMove === null && x < width * 0.5) {
        this.touchIdMove = touch.identifier;

        // Reposition joystick base to where touched? Or fixed position?
        // Let's go with fixed position for now as per index.html plan, 
        // but often dynamic is better. For simplicity: fixed at bottom-left.
        // Actually, let's make it snap to finger if possible? 
        // No, standard is fixed or floating. Let's use the fixed DOM element center.

        const rect = this.joystickBase.getBoundingClientRect();
        this.joystickCenter.set(rect.left + rect.width / 2, rect.top + rect.height / 2);

        // Calculate initial delta if they tapped precisely on it?
        // Usually joystick logic: 
        //  - If touched inside joystick area, grab stick.
        //  - If logic is "dynamic joystick", we move base to touch.
        // Let's stick to: Joystick is at fixed screen position. 
        // User touches anywhere on left half -> NO, that's messy.
        // User touches Joystick element? 
        // Better: User touches left half -> standard mobile FPS often does dynamic or fixed.
        // Let's assume Fixed Joystick for now to match UI styling.
        // So we only care if touch is near the joystick or we treat left side AS joystick input?
        // Let's treat "touch on left half" as engaging the joystick, but we clamp the visual stick to the base.

        this._updateJoystick(x, y);
      }

      // Right half = Look
      else if (this.touchIdLook === null && x >= width * 0.5) {
        this.touchIdLook = touch.identifier;
        this.lastLookX = x;
        this.lastLookY = y;
      }
    }
  }

  _onTouchMove(e) {
    if (!this.enabled) return;
    // e.preventDefault(); // Prevent scrolling - might block other UI? 
    // Better to use touch-action: none in CSS.

    for (let i = 0; i < e.changedTouches.length; i++) {
      const touch = e.changedTouches[i];

      if (touch.identifier === this.touchIdMove) {
        this._updateJoystick(touch.clientX, touch.clientY);
      }
      else if (touch.identifier === this.touchIdLook) {
        const dx = touch.clientX - this.lastLookX;
        const dy = touch.clientY - this.lastLookY;

        this.lookVector.x -= dx * this.rotationSpeed; // Yaw
        this.lookVector.y -= dy * this.rotationSpeed; // Pitch

        this.lastLookX = touch.clientX;
        this.lastLookY = touch.clientY;
      }
    }
  }

  _onTouchEnd(e) {
    if (!this.enabled) return;

    for (let i = 0; i < e.changedTouches.length; i++) {
      const touch = e.changedTouches[i];
      if (touch.identifier === this.touchIdMove) {
        this.resetMove();
      }
      else if (touch.identifier === this.touchIdLook) {
        this.resetLook();
      }
    }
  }

  _updateJoystick(x, y) {
    const dx = x - this.joystickCenter.x;
    const dy = y - this.joystickCenter.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    // Clamp visual
    const clampedDist = Math.min(dist, this.joystickMaxRadius);
    const angle = Math.atan2(dy, dx);
    const visualX = Math.cos(angle) * clampedDist;
    const visualY = Math.sin(angle) * clampedDist;

    if (this.joystickStick) {
      this.joystickStick.style.transform = `translate(${visualX}px, ${visualY}px)`;
    }

    // Normalize input -1 to 1
    // In screen space: +y is down. In 3D: -z is forward.
    // Joystick Up (neg y) -> Move Forward (pos ?) 
    // Standard: Up is -1 y. 
    // We want Up -> Forward. 

    const normalizedX = (dx / this.joystickMaxRadius);
    const normalizedY = (dy / this.joystickMaxRadius);

    // Clamp magnitude to 1
    const mag = Math.min(1, Math.sqrt(normalizedX * normalizedX + normalizedY * normalizedY));

    // If we simply use cos/sin of angle with capped mag
    const finalX = Math.cos(angle) * mag;
    const finalY = Math.sin(angle) * mag;

    // Map to MoveVector: 
    // x = left/right = finalX
    // z = fwd/back = finalY (Up on screen is -y, which should be Forward -z? or Forward +z? Depends on camera)
    // Usually: Forward is -z in ThreeJS.
    // Joystick Up = negative dy. We want negative z.
    // Joystick Down = positive dy. We want positive z.
    // So z = finalY.
    // Joystick Right = positive dx. We want positive x. 

    this.moveVector.set(finalX, 0, -finalY);
  }
}