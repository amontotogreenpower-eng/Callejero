// hud.js — Interfaz: barras de vida, cronometro, rondas y panel de captura.

export class HUD {
  constructor(root = document) {
    this.el = {
      hpA: root.getElementById('hpA'),
      hpB: root.getElementById('hpB'),
      hpAghost: root.getElementById('hpAghost'),
      hpBghost: root.getElementById('hpBghost'),
      nameA: root.getElementById('nameA'),
      nameB: root.getElementById('nameB'),
      pipsA: root.getElementById('pipsA'),
      pipsB: root.getElementById('pipsB'),
      timer: root.getElementById('timer'),
      center: root.getElementById('center'),
      combo: root.getElementById('combo'),
      mocapStatus: root.getElementById('mocapStatus'),
      gesture: root.getElementById('gesture'),
      preview: root.getElementById('preview'),
    };
    this.ghost = { a: 1, b: 1 };
    this.pctx = this.el.preview ? this.el.preview.getContext('2d') : null;
    this._msgTimer = 0;
  }

  setNames(a, b) {
    if (this.el.nameA) this.el.nameA.textContent = a;
    if (this.el.nameB) this.el.nameB.textContent = b;
  }

  setRounds(winsA, winsB, best) {
    const pips = (n) => Array.from({ length: best }, (_, i) => `<i class="${i < n ? 'on' : ''}"></i>`).join('');
    if (this.el.pipsA) this.el.pipsA.innerHTML = pips(winsA);
    if (this.el.pipsB) this.el.pipsB.innerHTML = pips(winsB);
  }

  update(dt, a, b, timeLeft) {
    const fa = a.hp / a.maxHp;
    const fb = b.hp / b.maxHp;
    if (this.el.hpA) this.el.hpA.style.width = (fa * 100).toFixed(1) + '%';
    if (this.el.hpB) this.el.hpB.style.width = (fb * 100).toFixed(1) + '%';

    // Barra fantasma: baja con retardo para leer el daño recibido.
    this.ghost.a += (fa - this.ghost.a) * Math.min(1, dt * 2.4);
    this.ghost.b += (fb - this.ghost.b) * Math.min(1, dt * 2.4);
    if (this.el.hpAghost) this.el.hpAghost.style.width = (this.ghost.a * 100).toFixed(1) + '%';
    if (this.el.hpBghost) this.el.hpBghost.style.width = (this.ghost.b * 100).toFixed(1) + '%';

    if (this.el.timer) this.el.timer.textContent = String(Math.max(0, Math.ceil(timeLeft))).padStart(2, '0');

    const combo = Math.max(a.combo, b.combo);
    if (this.el.combo) {
      if (combo >= 2) {
        this.el.combo.textContent = combo + ' GOLPES';
        this.el.combo.classList.add('show');
      } else {
        this.el.combo.classList.remove('show');
      }
    }

    if (this._msgTimer > 0) {
      this._msgTimer -= dt;
      if (this._msgTimer <= 0 && this.el.center) this.el.center.classList.remove('show');
    }
  }

  message(text, seconds = 1.4, cls = '') {
    if (!this.el.center) return;
    this.el.center.textContent = text;
    this.el.center.className = 'center show ' + cls;
    this._msgTimer = seconds;
  }

  clearMessage() {
    if (this.el.center) this.el.center.classList.remove('show');
    this._msgTimer = 0;
  }

  mocap(statusText, gestureText) {
    if (this.el.mocapStatus && statusText != null) this.el.mocapStatus.textContent = statusText;
    if (this.el.gesture && gestureText != null) this.el.gesture.textContent = gestureText;
  }

  drawPreview(mocap) {
    if (!this.pctx || !this.el.preview) return;
    const c = this.el.preview;
    mocap.drawPreview(this.pctx, c.width, c.height);
  }
}
