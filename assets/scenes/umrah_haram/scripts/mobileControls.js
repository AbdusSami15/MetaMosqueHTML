import * as THREE from "three";

export class MobileControls {
  constructor(options = {}) {
    this.domElement = options.domElement || document.body;
    this.speed = options.speed || 0.15;
    this.rotationSpeed = options.rotationSpeed || 0.005;

    // Output vectors
    this.moveVector = new THREE.Vector3(0, 0, 0); // x=left/right, z=fwd/back (Forward is -z)
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

    // Check elements immediately
    this.initUI();
  }

  initUI() {
    this.container = document.getElementById("mobileControls");
    this.joystickBase = document.getElementById("joystickBase");
    this.joystickStick = document.getElementById("joystickStick");
    this.lookZone = document.getElementById("lookZone");
  }

  isMobile() {
    const ua = navigator.userAgent || navigator.vendor || window.opera;
    const isTouch = (('ontouchstart' in window) || (navigator.maxTouchPoints > 0));
    const isMobileUA = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(ua);
    return isTouch || isMobileUA; // Simplified check
  }

  enable() {
    if (this.enabled) return;
    if (!this.isMobile()) {
      // Create a debug flag or force enable if needed, but via options
      // console.log("MobileControls: Not a mobile device.");
      // return; 
    }

    this.initUI(); // Re-check UI in case it was added late

    if (this.container) {
      this.container.classList.remove("hidden-mobile");
      // Force layout recalc
      // this.container.offsetHeight; 

      if (this.joystickBase) {
        const rect = this.joystickBase.getBoundingClientRect();
        this.joystickCenter.set(rect.left + rect.width / 2, rect.top + rect.height / 2);
      }
    }

    this.domElement.addEventListener("touchstart", this._onTouchStart, { passive: false });
    this.domElement.addEventListener("touchmove", this._onTouchMove, { passive: false });
    this.domElement.addEventListener("touchend", this._onTouchEnd, { passive: false });
    this.enabled = true;
  }

  disable() {
    if (!this.enabled) return;
    this.domElement.removeEventListener("touchstart", this._onTouchStart);
    this.domElement.removeEventListener("touchmove", this._onTouchMove);
    this.domElement.removeEventListener("touchend", this._onTouchEnd);
    this.enabled = false;

    if (this.container) this.container.classList.add("hidden-mobile");
    this.resetMove();
    this.resetLook();
  }

  update() {
    // Reset look vector each frame as it's a delta
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

      // Left half = Joystick
      if (this.touchIdMove === null && x < width * 0.5) {
        this.touchIdMove = touch.identifier;
        if (this.joystickBase) {
          const rect = this.joystickBase.getBoundingClientRect();
          this.joystickCenter.set(rect.left + rect.width / 2, rect.top + rect.height / 2);
        }
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

    // Prevent default to stop scrolling if we are interacting
    // But be careful not to block UI if touch is on a button (needs tailored approach)
    // For now, if we are tracking these touches, prevent default.
    let handled = false;

    for (let i = 0; i < e.changedTouches.length; i++) {
      const touch = e.changedTouches[i];

      if (touch.identifier === this.touchIdMove) {
        this._updateJoystick(touch.clientX, touch.clientY);
        handled = true;
      }
      else if (touch.identifier === this.touchIdLook) {
        const dx = touch.clientX - this.lastLookX;
        const dy = touch.clientY - this.lastLookY;

        // Sensitivity
        const SENSITIVITY = 0.002;
        this.lookVector.x += dx * SENSITIVITY; // Yaw (add to accumulate if multiple events per frame?)
        this.lookVector.y += dy * SENSITIVITY; // Pitch

        this.lastLookX = touch.clientX;
        this.lastLookY = touch.clientY;
        handled = true;
      }
    }

    if (handled && e.cancelable) e.preventDefault();
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

    const clampedDist = Math.min(dist, this.joystickMaxRadius);
    const angle = Math.atan2(dy, dx);
    const visualX = Math.cos(angle) * clampedDist;
    const visualY = Math.sin(angle) * clampedDist;

    if (this.joystickStick) {
      this.joystickStick.style.transform = `translate(${visualX}px, ${visualY}px)`;
    }

    // Normalize
    // Joystick Up (Negative Y on screen) -> Forward (-Z in 3D usually)
    // Joystick Right (Positive X on screen) -> Right (+X in 3D)

    const normalizedX = dx / this.joystickMaxRadius;
    const normalizedY = dy / this.joystickMaxRadius;

    // Clamp magnitude
    const rawMag = Math.sqrt(normalizedX * normalizedX + normalizedY * normalizedY);
    const mag = Math.min(1, rawMag);

    // Re-project normalized vector with clamped magnitude
    // Avoid divide by zero
    const normFactor = rawMag > 0 ? mag / rawMag : 0;

    const finalX = normalizedX * normFactor;
    const finalY = normalizedY * normFactor;

    // Output:
    // x = Right (+), Left (-)
    // z = Back (+), Forward (-)  <-- screen Y is down (+), so +Y is Back. -Y is Forward.
    this.moveVector.set(finalX, 0, finalY);
  }
}
