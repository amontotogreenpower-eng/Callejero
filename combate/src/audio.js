// audio.js — Efectos de sonido sintetizados (sin ficheros externos).

export class Audio {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.enabled = true;
  }

  /** Debe llamarse desde un gesto del usuario. */
  resume() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) { this.enabled = false; return; }
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.35;
      this.master.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }

  _noise(dur) {
    const ctx = this.ctx;
    const n = Math.max(1, Math.floor(ctx.sampleRate * dur));
    const buf = ctx.createBuffer(1, n, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    return src;
  }

  _blip({ freq = 220, dur = 0.12, type = 'square', gain = 0.5, slide = 0.4 }) {
    if (!this.enabled || !this.ctx) return;
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, ctx.currentTime);
    o.frequency.exponentialRampToValueAtTime(Math.max(30, freq * slide), ctx.currentTime + dur);
    g.gain.setValueAtTime(gain, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
    o.connect(g).connect(this.master);
    o.start();
    o.stop(ctx.currentTime + dur + 0.02);
  }

  _thud({ dur = 0.16, gain = 0.6, cutoff = 900 }) {
    if (!this.enabled || !this.ctx) return;
    const ctx = this.ctx;
    const src = this._noise(dur);
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(cutoff, ctx.currentTime);
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
    src.connect(f).connect(g).connect(this.master);
    src.start();
  }

  hit(kind) {
    if (kind === 'light') { this._thud({ dur: 0.10, gain: 0.5, cutoff: 1600 }); this._blip({ freq: 320, dur: 0.07, gain: 0.25 }); }
    else if (kind === 'heavy') { this._thud({ dur: 0.26, gain: 0.9, cutoff: 520 }); this._blip({ freq: 120, dur: 0.18, gain: 0.4, type: 'sawtooth' }); }
    else { this._thud({ dur: 0.16, gain: 0.7, cutoff: 900 }); this._blip({ freq: 200, dur: 0.11, gain: 0.3 }); }
  }

  block() { this._thud({ dur: 0.09, gain: 0.45, cutoff: 3200 }); this._blip({ freq: 720, dur: 0.06, gain: 0.18, type: 'triangle' }); }
  whoosh() { this._thud({ dur: 0.13, gain: 0.18, cutoff: 2600 }); }
  ko() { this._blip({ freq: 90, dur: 0.9, gain: 0.6, type: 'sawtooth', slide: 0.25 }); this._thud({ dur: 0.5, gain: 0.7, cutoff: 380 }); }
  bell() {
    this._blip({ freq: 880, dur: 0.5, gain: 0.35, type: 'triangle', slide: 0.9 });
    setTimeout(() => this._blip({ freq: 1320, dur: 0.6, gain: 0.25, type: 'triangle', slide: 0.9 }), 90);
  }
}
