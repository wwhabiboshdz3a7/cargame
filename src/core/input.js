// Entrées unifiées clavier / souris / manette (API Gamepad, mapping standard).
const DEFAULT_KEYS = {
  throttle: ['KeyW', 'ArrowUp'], brake: ['KeyS', 'ArrowDown'], left: ['KeyA', 'ArrowLeft'], right: ['KeyD', 'ArrowRight'],
  handbrake: ['Space'], nitro: ['ShiftLeft', 'ShiftRight'], camera: ['KeyC'], reset: ['KeyR'], horn: ['KeyH'], lights: ['KeyL'],
  map: ['KeyM'], pause: ['Escape', 'KeyP'], interact: ['KeyF', 'Enter'], gearUp: ['KeyE'], gearDown: ['KeyQ'], lookBack: ['KeyB'],
  siren: ['KeyK'], photo: ['KeyO'], time: ['KeyN'],
};
// boutons manette (mapping standard)
const PAD = {
  handbrake: [0], nitro: [1], interact: [2], camera: [3], gearDown: [4], gearUp: [5], map: [8], pause: [9],
  horn: [10], lookBack: [11], lights: [12], reset: [13], siren: [14], time: [15],
};

export class Input {
  constructor() {
    this.keys = new Set();
    this.pressedKeys = new Set();
    this.padButtons = [];
    this.prevPad = [];
    this.padAxes = [0, 0, 0, 0];
    this.padConnected = false;
    this.lastDevice = 'keyboard';
    this.mouse = { dx: 0, dy: 0, down: false, wheel: 0 };
    this.labels = {};
    this.enabled = true;
    window.addEventListener('keydown', (e) => {
      if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') && e.target.type !== 'range') return;
      if (!e.repeat) this.pressedKeys.add(e.code);
      this.keys.add(e.code);
      this.lastDevice = 'keyboard';
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(e.code)) e.preventDefault();
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());
    window.addEventListener('mousemove', (e) => {
      if (this.mouse.down || document.pointerLockElement) { this.mouse.dx += e.movementX; this.mouse.dy += e.movementY; }
    });
    window.addEventListener('mousedown', (e) => { if (e.button === 2 || e.button === 0 && e.target.tagName === 'CANVAS') this.mouse.down = true; });
    window.addEventListener('mouseup', () => { this.mouse.down = false; });
    window.addEventListener('wheel', (e) => { this.mouse.wheel += Math.sign(e.deltaY); }, { passive: true });
    window.addEventListener('contextmenu', (e) => { if (e.target.tagName === 'CANVAS') e.preventDefault(); });
    window.addEventListener('gamepadconnected', () => { this.padConnected = true; });
    this._initLabels();
  }

  async _initLabels() {
    // Affiche les bonnes lettres pour les claviers AZERTY (ZQSD)
    try {
      if (navigator.keyboard && navigator.keyboard.getLayoutMap) {
        const map = await navigator.keyboard.getLayoutMap();
        for (const code of ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyQ', 'KeyE', 'KeyM', 'KeyR', 'KeyC', 'KeyF', 'KeyH', 'KeyL', 'KeyB', 'KeyN', 'KeyK', 'KeyO', 'KeyP']) {
          const v = map.get(code);
          if (v) this.labels[code] = v.toUpperCase();
        }
      } else if ((navigator.language || '').startsWith('fr')) {
        Object.assign(this.labels, { KeyW: 'Z', KeyA: 'Q', KeyQ: 'A' });
      }
    } catch { /* ignore */ }
  }

  keyLabel(code) {
    if (this.labels[code]) return this.labels[code];
    const m = { Space: 'Espace', ShiftLeft: 'Maj', ShiftRight: 'Maj', Escape: 'Échap', Enter: 'Entrée', ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→' };
    return m[code] || code.replace('Key', '').replace('Digit', '');
  }

  // Libellé d'une action selon le périphérique actif
  label(action) {
    if (this.lastDevice === 'gamepad') {
      const names = ['Ⓐ', 'Ⓑ', 'Ⓧ', 'Ⓨ', 'LB', 'RB', 'LT', 'RT', 'View', 'Menu', 'L3', 'R3', '↑', '↓', '←', '→'];
      if (action === 'throttle') return 'RT';
      if (action === 'brake') return 'LT';
      const b = PAD[action];
      return b ? names[b[0]] : '';
    }
    const k = DEFAULT_KEYS[action];
    return k ? this.keyLabel(k[0]) : '';
  }

  poll() {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    let pad = null;
    for (const p of pads) if (p && p.connected) { pad = p; break; }
    this.prevPad = this.padButtons;
    if (pad) {
      this.padConnected = true;
      this.padButtons = pad.buttons.map((b) => b.value);
      this.padAxes = [0, 1, 2, 3].map((i) => {
        const v = pad.axes[i] || 0;
        return Math.abs(v) < 0.12 ? 0 : (v - Math.sign(v) * 0.12) / 0.88;
      });
      if (this.padButtons.some((v) => v > 0.3) || this.padAxes.some((v) => Math.abs(v) > 0.3)) this.lastDevice = 'gamepad';
      this.pad = pad;
    } else {
      this.padButtons = [];
      this.padAxes = [0, 0, 0, 0];
      this.pad = null;
    }
  }

  endFrame() {
    this.pressedKeys.clear();
    this.mouse.dx = 0; this.mouse.dy = 0; this.mouse.wheel = 0;
  }

  held(action) {
    if (DEFAULT_KEYS[action]?.some((k) => this.keys.has(k))) return true;
    return PAD[action]?.some((b) => (this.padButtons[b] || 0) > 0.5) || false;
  }

  pressed(action) {
    if (DEFAULT_KEYS[action]?.some((k) => this.pressedKeys.has(k))) return true;
    return PAD[action]?.some((b) => (this.padButtons[b] || 0) > 0.5 && !((this.prevPad[b] || 0) > 0.5)) || false;
  }

  padPressed(b) { return (this.padButtons[b] || 0) > 0.5 && !((this.prevPad[b] || 0) > 0.5); }

  // Commandes de conduite (valeurs continues)
  drive() {
    const k = (a) => (DEFAULT_KEYS[a].some((c) => this.keys.has(c)) ? 1 : 0);
    let throttle = k('throttle'), brake = k('brake');
    let steer = k('left') - k('right');
    const rt = this.padButtons[7] || 0, lt = this.padButtons[6] || 0;
    throttle = Math.max(throttle, rt);
    brake = Math.max(brake, lt);
    const sx = this.padAxes[0];
    let analog = false;
    if (Math.abs(sx) > 0.01) { steer = -Math.sign(sx) * Math.pow(Math.abs(sx), 1.5); analog = true; }
    const pitchAxis = this.padAxes[1];
    return {
      throttle, brake, steer, analog,
      handbrake: this.held('handbrake') ? 1 : 0,
      nitro: this.held('nitro') ? 1 : 0,
      airPitch: Math.abs(pitchAxis) > 0.05 ? pitchAxis : (brake - throttle),
      airYaw: steer,
      airRoll: this.held('handbrake') ? steer : 0,
      lookX: this.padAxes[2], lookY: this.padAxes[3],
    };
  }

  // Navigation de menus
  nav() {
    const ax = this.padAxes[0], ay = this.padAxes[1];
    const now = performance.now();
    let dir = null;
    if (this.pressedKeys.has('ArrowUp') || this.padPressed(12)) dir = 'up';
    if (this.pressedKeys.has('ArrowDown') || this.padPressed(13)) dir = 'down';
    if (this.pressedKeys.has('ArrowLeft') || this.padPressed(14)) dir = 'left';
    if (this.pressedKeys.has('ArrowRight') || this.padPressed(15)) dir = 'right';
    if (!dir && (Math.abs(ax) > 0.6 || Math.abs(ay) > 0.6)) {
      if (!this._navT || now - this._navT > 220) {
        this._navT = now;
        dir = Math.abs(ax) > Math.abs(ay) ? (ax > 0 ? 'right' : 'left') : (ay > 0 ? 'down' : 'up');
      }
    } else if (Math.abs(ax) < 0.3 && Math.abs(ay) < 0.3) this._navT = 0;
    const ok = this.pressedKeys.has('Enter') || this.pressedKeys.has('Space') || this.padPressed(0);
    const back = this.pressedKeys.has('Escape') || this.pressedKeys.has('Backspace') || this.padPressed(1);
    const tabL = this.pressedKeys.has('KeyQ') || this.padPressed(4);
    const tabR = this.pressedKeys.has('KeyE') || this.padPressed(5);
    return { dir, ok, back, tabL, tabR };
  }

  rumble(strong, weak, ms) {
    const a = this.pad?.vibrationActuator;
    if (a && a.playEffect) a.playEffect('dual-rumble', { duration: ms, strongMagnitude: strong, weakMagnitude: weak }).catch(() => {});
  }
}
