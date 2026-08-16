// retarget.js — Convierte los landmarks 3D de MediaPipe en rotaciones del
// esqueleto Mixamo.
//
// Metodo: para cada hueso se conoce su direccion en la pose de reposo. Se
// calcula la direccion que deberia tener segun los puntos capturados y se
// obtiene la rotacion minima que lleva una a la otra. El giro sobre el propio
// eje del hueso (twist), que las direcciones no determinan, se resuelve
// alineando el plano del hueso hijo: asi los codos y las rodillas doblan hacia
// donde toca en vez de rotar al azar.
//
// Espacio de trabajo: el del rig (X izquierda, Y arriba, Z hacia el rival).
// Conversion desde MediaPipe:  x -> x,  y -> -y,  z -> -z

import * as THREE from 'three';
import { LM } from './mocap.js';

const MIN_VIS = 0.3;

const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _c = new THREE.Vector3();
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const IDENT = new THREE.Quaternion();
const UP = new THREE.Vector3(0, 1, 0);
const FWD = new THREE.Vector3(0, 0, 1);

/** Rotacion sobre `axis` que acerca `current` a `target`. */
function twistTowards(axis, current, target, out = new THREE.Quaternion()) {
  const u = _a.copy(axis).normalize();
  const cp = _b.copy(current).addScaledVector(u, -current.dot(u));
  const tp = _c.copy(target).addScaledVector(u, -target.dot(u));
  if (cp.lengthSq() < 1e-6 || tp.lengthSq() < 1e-6) return out.identity();
  cp.normalize(); tp.normalize();
  let ang = Math.acos(THREE.MathUtils.clamp(cp.dot(tp), -1, 1));
  const sign = Math.sign(cp.clone().cross(tp).dot(u)) || 1;
  return out.setFromAxisAngle(u, ang * sign);
}

/** Limita un cuaternion a un angulo maximo respecto a la identidad. */
function clampAngle(q, maxRad) {
  const ang = 2 * Math.acos(THREE.MathUtils.clamp(Math.abs(q.w), -1, 1));
  if (ang <= maxRad) return q;
  return q.slerp(IDENT, 1 - maxRad / ang);
}

export class Retargeter {
  /**
   * @param {object} rig
   * @param {{smooth?:number, mirror?:boolean}} opts
   *   smooth: constante de tiempo del filtro (s). Mas alto = mas suave y lento.
   *   mirror: invierte izquierda/derecha (util si tu camara ya viene espejada).
   */
  constructor(rig, opts = {}) {
    this.rig = rig;
    this.tau = opts.smooth != null ? opts.smooth : 0.055;
    this.sx = opts.mirror ? -1 : 1;

    this.local = new Map();     // hueso -> cuaternion local suavizado
    this.world = new Map();     // hueso -> cuaternion acumulado (temporal)
    this._pending = new Map();  // huesos calculados este fotograma
    this.pts = [];              // landmarks convertidos al espacio del rig
    this.vis = [];
    this.valid = false;
    this.confidence = 0;

    // Metricas para el lector de gestos
    this.metrics = {
      scale: 0.35,
      hipY: 0.5, hipX: 0.5, hipYRaw: 0.5,
      shoulderY: 0.35,
      wristL: new THREE.Vector3(), wristR: new THREE.Vector3(),
      velL: new THREE.Vector3(), velR: new THREE.Vector3(),
      ankleL: new THREE.Vector3(), ankleR: new THREE.Vector3(),
      ankleVelL: new THREE.Vector3(), ankleVelR: new THREE.Vector3(),
      lean: 0, crouchRatio: 1, torsoYaw: 0,
    };
    this._prevW = { L: new THREE.Vector3(), R: new THREE.Vector3() };
    this._prevA = { L: new THREE.Vector3(), R: new THREE.Vector3() };
    this._hasPrev = false;

    for (const name of rig.order) this.local.set(name, rig.rest[name].local.clone());
  }

  /**
   * @param {Array} world  worldLandmarks de MediaPipe
   * @param {Array} screen landmarks normalizados (para posicion en pantalla)
   * @param {number} dt
   */
  update(world, screen, dt) {
    if (!world || world.length < 33) { this.valid = false; return false; }

    // 1. Puntos al espacio del rig
    const pts = this.pts;
    const vis = this.vis;
    for (let i = 0; i < 33; i++) {
      const l = world[i];
      pts[i] = (pts[i] || new THREE.Vector3()).set(l.x * this.sx, -l.y, -l.z);
      vis[i] = l.visibility != null ? l.visibility : 1;
    }
    if (this.sx < 0) swapSides(pts, vis);

    const shoulderMid = _mid(pts[LM.SHOULDER_L], pts[LM.SHOULDER_R], new THREE.Vector3());
    const hipMid = _mid(pts[LM.HIP_L], pts[LM.HIP_R], new THREE.Vector3());
    const shoulderW = pts[LM.SHOULDER_L].distanceTo(pts[LM.SHOULDER_R]);
    if (!(shoulderW > 0.05)) { this.valid = false; return false; }

    this.confidence = (vis[LM.SHOULDER_L] + vis[LM.SHOULDER_R] + vis[LM.HIP_L] + vis[LM.HIP_R]) / 4;
    if (this.confidence < MIN_VIS) { this.valid = false; return false; }

    // 2. Bases de cadera y pecho
    const upTorso = _c.copy(shoulderMid).sub(hipMid).normalize();
    const hipsQ = basisQuat(
      _a.copy(pts[LM.HIP_L]).sub(pts[LM.HIP_R]).normalize(),
      upTorso, new THREE.Quaternion());
    const chestQ = basisQuat(
      _a.copy(pts[LM.SHOULDER_L]).sub(pts[LM.SHOULDER_R]).normalize(),
      upTorso, new THREE.Quaternion());

    // La cadera no debe girar tanto como para dar la espalda al rival.
    clampAngle(hipsQ, 70 * Math.PI / 180);

    this.world.clear();
    const rest = this.rig.rest;

    // 3. Cadera + columna
    this._setWorld('Hips', hipsQ, null);
    const spineDelta = hipsQ.clone().invert().multiply(chestQ);
    const third = new THREE.Quaternion().copy(IDENT).slerp(spineDelta, 1 / 3);
    for (const s of ['Spine', 'Spine1', 'Spine2']) {
      const parent = this.world.get(parentName(this.rig, s)) || IDENT;
      this._setWorld(s, parent.clone().multiply(rest[s].local).multiply(third), third.clone().premultiply(rest[s].local));
    }

    // 4. Cuello y cabeza
    const earMid = _mid(pts[LM.EAR_L], pts[LM.EAR_R], new THREE.Vector3());
    const headUp = earMid.clone().sub(shoulderMid).normalize();
    const noseDir = pts[LM.NOSE].clone().sub(earMid).normalize();
    this._aimBone('Neck', headUp, null, null);
    this._aimBone('Head', headUp, FWD, noseDir);

    // 5. Brazos
    this._arm('Left', LM.SHOULDER_L, LM.ELBOW_L, LM.WRIST_L, LM.INDEX_L, shoulderMid);
    this._arm('Right', LM.SHOULDER_R, LM.ELBOW_R, LM.WRIST_R, LM.INDEX_R, shoulderMid);

    // 6. Piernas
    this._leg('Left', LM.HIP_L, LM.KNEE_L, LM.ANKLE_L, LM.FOOT_L);
    this._leg('Right', LM.HIP_R, LM.KNEE_R, LM.ANKLE_R, LM.FOOT_R);

    // 7. Suavizado temporal
    const alpha = 1 - Math.exp(-Math.max(dt, 1e-3) / this.tau);
    for (const [name, q] of this._pending) {
      const cur = this.local.get(name);
      if (cur) cur.slerp(q, alpha);
    }
    this._pending.clear();

    this._updateMetrics(pts, vis, screen, shoulderMid, hipMid, shoulderW, hipsQ, dt);
    this.valid = true;
    return true;
  }

  /** Guarda la rotacion de mundo y encola la local correspondiente. */
  _setWorld(name, worldQ, localQ) {
    const rig = this.rig;
    if (!rig.bones[name]) return;
    this.world.set(name, worldQ.clone());
    if (!localQ) {
      const pn = parentName(rig, name);
      const pw = pn && this.world.get(pn) ? this.world.get(pn) : IDENT;
      localQ = pw.clone().invert().multiply(worldQ);
    }
    this._pending.set(name, localQ.clone());
  }

  /**
   * Orienta un hueso hacia `dir` y, opcionalmente, resuelve el twist alineando
   * el vector local `refLocal` con `refTarget`.
   */
  _aimBone(name, dir, refLocal, refTarget) {
    const rest = this.rig.rest[name];
    if (!rest || !rest.dirLocal || !dir) return null;
    const pn = parentName(this.rig, name);
    const pw = pn && this.world.get(pn) ? this.world.get(pn) : IDENT;

    const restWorldDir = rest.dirLocal.clone().applyQuaternion(rest.world);
    const q = new THREE.Quaternion().setFromUnitVectors(restWorldDir, dir).multiply(rest.world);

    if (refLocal && refTarget) {
      const cur = refLocal.clone().applyQuaternion(q);
      q.premultiply(twistTowards(dir, cur, refTarget, _q2));
    }
    this._setWorld(name, q, pw.clone().invert().multiply(q));
    return q;
  }

  /** Twist del hueso padre para que el hijo doble en el plano correcto. */
  _aimChain(parentBone, childBone, dirParent, dirChild) {
    const rig = this.rig;
    const restC = rig.rest[childBone];
    const qp = this._aimBone(parentBone, dirParent, null, null);
    if (!qp || !restC || !restC.dirLocal) return;

    // Direccion que tendria el hijo si estuviera en reposo bajo el padre.
    const predicted = restC.dirLocal.clone()
      .applyQuaternion(_q.copy(qp).multiply(restC.local));
    const tw = twistTowards(dirParent, predicted, dirChild, _q2);
    qp.premultiply(tw);

    const pn = parentName(rig, parentBone);
    const pw = pn && this.world.get(pn) ? this.world.get(pn) : IDENT;
    this._setWorld(parentBone, qp, pw.clone().invert().multiply(qp));
    this._aimBone(childBone, dirChild, null, null);
  }

  _arm(side, iSh, iEl, iWr, iIx, shoulderMid) {
    const p = this.pts, v = this.vis;
    if (v[iEl] < MIN_VIS || v[iWr] < MIN_VIS) return;
    const upper = p[iEl].clone().sub(p[iSh]);
    const fore = p[iWr].clone().sub(p[iEl]);
    if (upper.lengthSq() < 1e-5 || fore.lengthSq() < 1e-5) return;
    upper.normalize(); fore.normalize();

    // Clavicula: del centro de hombros al hombro.
    const clav = p[iSh].clone().sub(shoulderMid);
    if (clav.lengthSq() > 1e-5) this._aimBone(side + 'Shoulder', clav.normalize(), null, null);

    this._aimChain(side + 'Arm', side + 'ForeArm', upper, fore);

    if (v[iIx] >= MIN_VIS) {
      const hand = p[iIx].clone().sub(p[iWr]);
      if (hand.lengthSq() > 1e-6) this._aimBone(side + 'Hand', hand.normalize(), null, null);
    }
  }

  _leg(side, iHip, iKnee, iAnkle, iFoot) {
    const p = this.pts, v = this.vis;
    if (v[iKnee] < MIN_VIS || v[iAnkle] < MIN_VIS) return;
    const thigh = p[iKnee].clone().sub(p[iHip]);
    const shin = p[iAnkle].clone().sub(p[iKnee]);
    if (thigh.lengthSq() < 1e-5 || shin.lengthSq() < 1e-5) return;
    this._aimChain(side + 'UpLeg', side + 'Leg', thigh.normalize(), shin.normalize());

    if (v[iFoot] >= MIN_VIS) {
      const foot = p[iFoot].clone().sub(p[iAnkle]);
      if (foot.lengthSq() > 1e-6) this._aimBone(side + 'Foot', foot.normalize(), null, null);
    }
  }

  _updateMetrics(pts, vis, screen, shoulderMid, hipMid, shoulderW, hipsQ, dt) {
    const m = this.metrics;
    m.scale = shoulderW;
    const inv = hipsQ.clone().invert();

    // Posiciones en el marco del cuerpo, normalizadas por el ancho de hombros.
    const toBody = (v3) => v3.clone().sub(shoulderMid).applyQuaternion(inv).divideScalar(shoulderW);
    const wl = toBody(pts[LM.WRIST_L]);
    const wr = toBody(pts[LM.WRIST_R]);
    const al = pts[LM.ANKLE_L].clone().sub(hipMid).applyQuaternion(inv).divideScalar(shoulderW);
    const ar = pts[LM.ANKLE_R].clone().sub(hipMid).applyQuaternion(inv).divideScalar(shoulderW);

    if (this._hasPrev && dt > 1e-4) {
      m.velL.copy(wl).sub(this._prevW.L).divideScalar(dt);
      m.velR.copy(wr).sub(this._prevW.R).divideScalar(dt);
      m.ankleVelL.copy(al).sub(this._prevA.L).divideScalar(dt);
      m.ankleVelR.copy(ar).sub(this._prevA.R).divideScalar(dt);
    }
    this._prevW.L.copy(wl); this._prevW.R.copy(wr);
    this._prevA.L.copy(al); this._prevA.R.copy(ar);
    this._hasPrev = true;

    m.wristL.copy(wl); m.wristR.copy(wr);
    m.ankleL.copy(al); m.ankleR.copy(ar);

    // Relacion de altura: 1 de pie, baja al agacharse.
    const torso = shoulderMid.distanceTo(hipMid);
    const legL = pts[LM.HIP_L].distanceTo(pts[LM.KNEE_L]) + pts[LM.KNEE_L].distanceTo(pts[LM.ANKLE_L]);
    const ankleY = Math.min(pts[LM.ANKLE_L].y, pts[LM.ANKLE_R].y);
    m.crouchRatio = legL > 0.05 ? THREE.MathUtils.clamp((hipMid.y - ankleY) / legL, 0, 1.3) : 1;

    // Inclinacion lateral del torso (para desplazarse sin mover los pies).
    m.lean = torso > 0.05 ? (shoulderMid.x - hipMid.x) / torso : 0;
    m.torsoYaw = Math.atan2(
      pts[LM.SHOULDER_L].z - pts[LM.SHOULDER_R].z,
      pts[LM.SHOULDER_L].x - pts[LM.SHOULDER_R].x);

    if (screen && screen.length >= 33) {
      const hx = (screen[LM.HIP_L].x + screen[LM.HIP_R].x) / 2;
      const hy = (screen[LM.HIP_L].y + screen[LM.HIP_R].y) / 2;
      const sy = (screen[LM.SHOULDER_L].y + screen[LM.SHOULDER_R].y) / 2;
      m.hipX = hx;
      m.hipYRaw = hy;
      m.hipY = hy;
      m.shoulderY = sy;
    }
  }

  /** Escribe la pose capturada en el esqueleto. */
  apply() {
    if (!this.valid) return false;
    for (const name of this.rig.order) {
      const bone = this.rig.bones[name];
      const q = this.local.get(name);
      if (bone && q) bone.quaternion.copy(q);
    }
    return true;
  }
}

function _mid(a, b, out) { return out.copy(a).add(b).multiplyScalar(0.5); }

/** Cuaternion a partir de los ejes izquierda/arriba (el frente se deduce). */
function basisQuat(left, up, out) {
  const f = new THREE.Vector3().crossVectors(left, up).normalize();
  const l = new THREE.Vector3().crossVectors(up, f).normalize();
  const u = new THREE.Vector3().crossVectors(f, l).normalize();
  _m.makeBasis(l, u, f);
  return out.setFromRotationMatrix(_m);
}

function parentName(rig, name) {
  const b = rig.bones[name];
  const p = b && b.parent;
  if (!p) return null;
  const n = p.userData && p.userData.mixamo;
  return n && rig.bones[n] ? n : null;
}

/** Intercambia los indices izquierda/derecha cuando se trabaja en espejo. */
function swapSides(pts, vis) {
  const pairs = [[1, 4], [2, 5], [3, 6], [7, 8], [9, 10], [11, 12], [13, 14], [15, 16],
    [17, 18], [19, 20], [21, 22], [23, 24], [25, 26], [27, 28], [29, 30], [31, 32]];
  for (const [a, b] of pairs) {
    const t = pts[a]; pts[a] = pts[b]; pts[b] = t;
    const tv = vis[a]; vis[a] = vis[b]; vis[b] = tv;
  }
}
