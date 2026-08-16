// gestures.js — Traduce la pose capturada en ordenes de combate.
//
// Todas las medidas llegan normalizadas por el ancho de hombros, asi que
// funcionan igual de cerca o de lejos de la camara.
//
//   Puño adelante ................ jab / directo (segun velocidad)
//   Puño en gancho lateral ....... hook
//   Puño de abajo arriba ......... uppercut
//   Rodilla o pie adelante ....... patada baja / alta segun altura
//   Manos junto a la cara ........ guardia (bloqueo)
//   Agacharse .................... cubrirse abajo / esquivar altos
//   Salto ........................ salto
//   Desplazarse lateralmente ..... avanzar / retroceder

import * as THREE from 'three';
import { sided } from './moves.js';

export const DEFAULT_TUNING = {
  punchReach: 0.95,     // z minimo de la muñeca (anchos de hombro) para golpear
  punchSpeed: 3.2,      // velocidad minima hacia delante
  punchRearm: 0.55,     // por debajo de esto el brazo vuelve a estar listo
  hookLateral: 2.6,     // velocidad lateral que convierte el golpe en gancho
  uppercutRise: 3.0,    // velocidad vertical que lo convierte en gancho ascendente
  kickHeight: -1.45,    // altura de tobillo (respecto a cadera) para patear
  kickHigh: -0.75,      // por encima de esto la patada es alta
  kickSpeed: 1.8,
  kickRearm: -1.95,
  guardHeight: -0.55,   // altura de muñecas para considerar guardia
  guardWidth: 0.95,
  crouchRatio: 0.80,    // fraccion de la altura de pie
  jumpDelta: 0.055,     // caida de la Y de cadera en pantalla
  moveDeadzone: 0.045,
  moveGain: 14,
  cooldown: 0.28,
};

export class GestureReader {
  constructor(tuning = {}) {
    this.t = { ...DEFAULT_TUNING, ...tuning };
    this.base = null;            // calibracion
    this.cmd = { moveX: 0, crouch: false, jump: false, block: false, attack: null };
    this.arm = { L: true, R: true };
    this.leg = { L: true, R: true };
    this.cool = 0;
    this.jumpLatch = false;
    this.last = '';              // ultimo gesto reconocido (para el HUD)
    this.lastAt = 0;
    this._calSamples = [];
  }

  /** Toma la pose actual como postura neutra de referencia. */
  calibrate(metrics) {
    this.base = {
      hipX: metrics.hipX,
      hipY: metrics.hipYRaw,
      crouch: metrics.crouchRatio,
    };
    this.last = 'calibrado';
    this.lastAt = performance.now();
  }

  /** Calibracion automatica con las primeras muestras estables. */
  autoCalibrate(metrics) {
    if (this.base) return;
    this._calSamples.push({ x: metrics.hipX, y: metrics.hipYRaw, c: metrics.crouchRatio });
    if (this._calSamples.length < 30) return;
    const n = this._calSamples.length;
    const avg = this._calSamples.reduce((a, s) => ({ x: a.x + s.x / n, y: a.y + s.y / n, c: a.c + s.c / n }), { x: 0, y: 0, c: 0 });
    this.base = { hipX: avg.x, hipY: avg.y, crouch: avg.c };
    this._calSamples.length = 0;
    this.last = 'calibrado';
    this.lastAt = performance.now();
  }

  /**
   * @param {object} metrics  Retargeter.metrics
   * @param {number} dt
   * @returns {{moveX:number, crouch:boolean, jump:boolean, block:boolean, attack:string|null}}
   */
  read(metrics, dt) {
    const t = this.t;
    const c = this.cmd;
    c.attack = null;
    c.jump = false;
    this.cool = Math.max(0, this.cool - dt);

    this.autoCalibrate(metrics);
    const base = this.base;
    if (!base) { c.moveX = 0; c.crouch = false; c.block = false; return c; }

    // --- Guardia ---------------------------------------------------------
    const wl = metrics.wristL, wr = metrics.wristR;
    const guardL = wl.y > t.guardHeight && Math.abs(wl.x) < t.guardWidth;
    const guardR = wr.y > t.guardHeight && Math.abs(wr.x) < t.guardWidth;
    const forwardL = wl.z, forwardR = wr.z;
    c.block = guardL && guardR && forwardL < t.punchReach * 0.8 && forwardR < t.punchReach * 0.8;

    // --- Agacharse y saltar ----------------------------------------------
    const crouchNow = metrics.crouchRatio < base.crouch * t.crouchRatio;
    c.crouch = crouchNow;

    const dyUp = base.hipY - metrics.hipYRaw;   // en pantalla la Y crece hacia abajo
    if (dyUp > t.jumpDelta && !this.jumpLatch) {
      c.jump = true; this.jumpLatch = true;
      this._mark('salto');
    } else if (dyUp < t.jumpDelta * 0.4) {
      this.jumpLatch = false;
    }

    // --- Desplazamiento ---------------------------------------------------
    // Vista en espejo: si el jugador se mueve a un lado, el luchador va al mismo
    // lado de la pantalla.
    let dx = base.hipX - metrics.hipX;
    if (Math.abs(dx) < t.moveDeadzone) dx = 0;
    const lean = Math.abs(metrics.lean) > 0.18 ? -metrics.lean * 0.5 : 0;
    c.moveX = THREE.MathUtils.clamp(dx * t.moveGain + lean, -1, 1);

    // --- Golpes ----------------------------------------------------------
    if (this.cool <= 0) {
      const punch = this._punch('L', wl, metrics.velL) || this._punch('R', wr, metrics.velR);
      if (punch) { c.attack = punch; this.cool = t.cooldown; }
      else {
        const kick = this._kick('L', metrics.ankleL, metrics.ankleVelL)
          || this._kick('R', metrics.ankleR, metrics.ankleVelR);
        if (kick) { c.attack = kick; this.cool = t.cooldown; }
      }
    }
    // Rearme de extremidades
    if (wl.z < t.punchRearm) this.arm.L = true;
    if (wr.z < t.punchRearm) this.arm.R = true;
    if (metrics.ankleL.y < t.kickRearm) this.leg.L = true;
    if (metrics.ankleR.y < t.kickRearm) this.leg.R = true;

    return c;
  }

  _punch(side, wrist, vel) {
    const t = this.t;
    if (!this.arm[side]) return null;
    const extended = wrist.z > t.punchReach;
    const fast = vel.z > t.punchSpeed;
    const rising = vel.y > t.uppercutRise && wrist.y > -1.2;
    const swinging = Math.abs(vel.x) > t.hookLateral && wrist.z > t.punchReach * 0.55;

    let base = null;
    if (rising && wrist.z > t.punchReach * 0.4) base = 'uppercut';
    else if (swinging) base = 'hook';
    else if (extended && fast) base = vel.z > t.punchSpeed * 1.7 ? 'cross' : 'jab';
    if (!base) return null;

    this.arm[side] = false;
    this._mark(base + ' ' + (side === 'L' ? 'izq' : 'der'));
    return sided(base, side === 'L');
  }

  _kick(side, ankle, vel) {
    const t = this.t;
    if (!this.leg[side]) return null;
    if (ankle.y < t.kickHeight) return null;
    if (vel.z < t.kickSpeed && ankle.z < 0.6) return null;
    const base = ankle.y > t.kickHigh ? 'highKick' : 'lowKick';
    this.leg[side] = false;
    this._mark(base + ' ' + (side === 'L' ? 'izq' : 'der'));
    return sided(base, side === 'L');
  }

  _mark(name) { this.last = name; this.lastAt = performance.now(); }
}
