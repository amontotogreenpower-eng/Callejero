// animator.js — Reproductor de clips con fundido cruzado.
// Trabaja con "desviaciones" respecto a la pose de reposo, de modo que se
// puede mezclar con la pose que escribe el retargeting de MediaPipe.

import * as THREE from 'three';
import { CLIPS, compiledPose } from './clips.js';

const _qa = new THREE.Quaternion();
const _qb = new THREE.Quaternion();
const IDENT = new THREE.Quaternion();

class Track {
  constructor() { this.clip = null; this.time = 0; this.speed = 1; this.done = false; }
  set(clip, speed) { this.clip = clip; this.time = 0; this.speed = speed; this.done = false; }
  advance(dt) {
    if (!this.clip) return;
    this.time += dt * this.speed;
    if (this.time >= this.clip.duration) {
      if (this.clip.loop) this.time %= this.clip.duration;
      else { this.time = this.clip.duration; this.done = true; }
    }
  }
}

/** Muestrea un clip en un instante y acumula en `out` (Map hueso->Quaternion). */
function sample(clip, time, out) {
  out.clear();
  const keys = clip.keys;
  let i = 0;
  while (i < keys.length - 2 && keys[i + 1].t <= time) i++;
  const a = keys[i];
  const b = keys[Math.min(i + 1, keys.length - 1)];
  const span = b.t - a.t;
  const u = span > 1e-6 ? THREE.MathUtils.clamp((time - a.t) / span, 0, 1) : 0;
  // Suavizado tipo ease-in-out: evita el aspecto lineal de los keyframes.
  const k = u * u * (3 - 2 * u);

  const pa = compiledPose(a.pose);
  const pb = compiledPose(b.pose);
  for (const [bone, qa] of pa) {
    const qb = pb.get(bone) || IDENT;
    out.set(bone, new THREE.Quaternion().copy(qa).slerp(qb, k));
  }
  for (const [bone, qb] of pb) {
    if (out.has(bone)) continue;
    out.set(bone, new THREE.Quaternion().copy(IDENT).slerp(qb, k));
  }
  return out;
}

export class Animator {
  constructor(rig) {
    this.rig = rig;
    this.cur = new Track();
    this.prev = new Track();
    this.fade = 0;
    this.fadeDur = 0;
    this._a = new Map();
    this._b = new Map();
    this.pose = new Map();
    this.play('idle', { fade: 0 });
  }

  get clipName() { return this.cur.clip ? this.cur.clip.name : null; }
  get finished() { return this.cur.done; }
  get time() { return this.cur.time; }
  /** Progreso normalizado 0..1 del clip actual. */
  get phase() {
    return this.cur.clip ? THREE.MathUtils.clamp(this.cur.time / this.cur.clip.duration, 0, 1) : 0;
  }

  play(name, { fade = 0.12, speed = 1, restart = false } = {}) {
    const clip = CLIPS[name];
    if (!clip) throw new Error('Clip desconocido: ' + name);
    if (this.cur.clip === clip && !restart) { this.cur.speed = speed; return; }
    if (this.cur.clip && fade > 0) {
      this.prev.clip = this.cur.clip;
      this.prev.time = this.cur.time;
      this.prev.speed = this.cur.speed;
      this.fadeDur = fade;
      this.fade = fade;
    } else {
      this.prev.clip = null;
      this.fade = 0;
    }
    this.cur.set(clip, speed);
  }

  update(dt) {
    this.cur.advance(dt);
    if (this.prev.clip) {
      this.prev.advance(dt);
      this.fade -= dt;
      if (this.fade <= 0) { this.prev.clip = null; this.fade = 0; }
    }

    sample(this.cur.clip, this.cur.time, this._a);
    this.pose = this._a;

    if (this.prev.clip) {
      sample(this.prev.clip, this.prev.time, this._b);
      const w = 1 - this.fade / this.fadeDur; // 0 = pose anterior, 1 = actual
      const blended = new Map();
      for (const [bone, qb] of this._b) {
        const qa = this._a.get(bone) || IDENT;
        blended.set(bone, new THREE.Quaternion().copy(qb).slerp(qa, w));
      }
      for (const [bone, qa] of this._a) {
        if (blended.has(bone)) continue;
        blended.set(bone, new THREE.Quaternion().copy(IDENT).slerp(qa, w));
      }
      this.pose = blended;
    }
  }

  /**
   * Escribe la pose en el esqueleto.
   *
   * Las poses estan escritas en los ejes del personaje (X lateral, Y vertical,
   * Z hacia el rival). Para que funcionen tambien sobre un esqueleto importado
   * de Mixamo —donde cada hueso tiene sus propios ejes— la desviacion se
   * traslada al espacio del hueso:  offsetLocal = restWorld⁻¹ · q · restWorld.
   * En el rig procedural restWorld es la identidad y la formula no cambia nada.
   *
   * @param {number} weight 1 = solo animacion; <1 = se mezcla con lo que ya
   *   hubiera en los huesos (la pose capturada por MediaPipe).
   */
  applyTo(weight = 1) {
    const rest = this.rig.rest;
    for (const name of this.rig.order) {
      const bone = this.rig.bones[name];
      const r = rest[name];
      if (!bone || !r) continue;
      const off = this.pose.get(name);
      if (!off) {
        _qa.copy(r.local);
      } else {
        _qb.copy(r.worldInv).multiply(off).multiply(r.world);
        _qa.copy(r.local).multiply(_qb);
      }
      if (weight >= 0.999) bone.quaternion.copy(_qa);
      else if (weight > 0.001) bone.quaternion.slerp(_qa, weight);
    }
  }

  /** Devuelve los huesos a la pose de reposo (antes de aplicar con peso). */
  resetToRest() {
    for (const name of this.rig.order) {
      const bone = this.rig.bones[name];
      const r = this.rig.rest[name];
      if (bone && r) bone.quaternion.copy(r.local);
    }
  }
}
