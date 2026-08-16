// input.js — Teclado y botones tactiles.

export const KEYMAP_P1 = {
  KeyA: 'left', KeyD: 'right', KeyW: 'jump', KeyS: 'crouch',
  Space: 'block', ShiftLeft: 'block',
  KeyJ: 'jab', KeyK: 'cross', KeyL: 'hook',
  KeyU: 'lowKick', KeyI: 'highKick', KeyO: 'uppercut',
};

export const KEYMAP_P2 = {
  ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'jump', ArrowDown: 'crouch',
  Numpad0: 'block', ControlRight: 'block',
  Numpad1: 'jab', Numpad2: 'cross', Numpad3: 'hook',
  Numpad4: 'lowKick', Numpad5: 'highKick', Numpad6: 'uppercut',
};

const ATTACKS = new Set(['jab', 'cross', 'hook', 'lowKick', 'highKick', 'uppercut']);

export class Input {
  constructor(keymap = KEYMAP_P1, root = window) {
    this.keymap = keymap;
    this.held = new Set();
    this.buffer = null;       // ultimo ataque pulsado
    this.bufferTime = 0;
    this.jumpEdge = false;
    this.onKey = () => {};

    root.addEventListener('keydown', (e) => {
      const a = this.keymap[e.code];
      if (!a) return;
      e.preventDefault();
      if (!this.held.has(a)) this.press(a);
      this.held.add(a);
    });
    root.addEventListener('keyup', (e) => {
      const a = this.keymap[e.code];
      if (!a) return;
      e.preventDefault();
      this.held.delete(a);
    });
    root.addEventListener('blur', () => this.held.clear());
  }

  /** Registra botones tactiles: elementos con data-action. */
  bindTouch(container) {
    if (!container) return;
    for (const el of container.querySelectorAll('[data-action]')) {
      const a = el.dataset.action;
      const down = (e) => { e.preventDefault(); this.held.add(a); this.press(a); };
      const up = (e) => { e.preventDefault(); this.held.delete(a); };
      el.addEventListener('pointerdown', down);
      el.addEventListener('pointerup', up);
      el.addEventListener('pointercancel', up);
      el.addEventListener('pointerleave', up);
    }
  }

  press(a) {
    if (ATTACKS.has(a)) { this.buffer = a; this.bufferTime = 0.20; }
    if (a === 'jump') this.jumpEdge = true;
    this.onKey(a);
  }

  /** @returns {{moveX:number, crouch:boolean, jump:boolean, block:boolean, attack:string|null}} */
  read(dt) {
    const h = this.held;
    let moveX = 0;
    if (h.has('left')) moveX -= 1;
    if (h.has('right')) moveX += 1;

    this.bufferTime = Math.max(0, this.bufferTime - dt);
    const attack = this.bufferTime > 0 ? this.buffer : null;
    if (attack) { this.buffer = null; this.bufferTime = 0; }

    const jump = this.jumpEdge;
    this.jumpEdge = false;

    return { moveX, crouch: h.has('crouch'), jump, block: h.has('block'), attack };
  }

  get anyHeld() { return this.held.size > 0; }
}
