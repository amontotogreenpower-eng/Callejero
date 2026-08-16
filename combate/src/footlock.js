// footlock.js — Fijado del pie de apoyo con cinematica inversa.
//
// El problema: por muy bien que encaje la zancada, la pierna gira describiendo
// un arco, asi que el tobillo nunca avanza justo a la velocidad del cuerpo y
// el pie acaba arrastrandose por el suelo (el clasico "patinaje").
//
// La solucion: mientras un pie esta apoyado se clava su posicion en el mundo y
// la pierna se resuelve hacia atras con IK de dos huesos (muslo + tibia). El
// resultado se mezcla con la animacion con un peso que sube y baja de forma
// suave para que no haya tirones al cambiar de apoyo.
//
// Funciona igual con el muñeco procedural y con un personaje importado: las
// longitudes de los huesos se miden en cada fotograma sobre las posiciones
// reales, asi que la escala del modelo da igual.

import * as THREE from 'three';

const _h = new THREE.Vector3();
const _k = new THREE.Vector3();
const _a = new THREE.Vector3();
const _t = new THREE.Vector3();
const _v = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _axis = new THREE.Vector3();
const _pole = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _qp = new THREE.Quaternion();
const _qg = new THREE.Quaternion();
const _restDir = new THREE.Vector3();

/** Ventana de apoyo de cada pie dentro del ciclo (fase 0..1 del clip walk). */
const CONTACTO = { Left: [0.0, 0.5], Right: [0.5, 1.0] };

export class FootLock {
  constructor() {
    this.pin = { Left: new THREE.Vector3(), Right: new THREE.Vector3() };
    this.fijado = { Left: false, Right: false };
    this.peso = { Left: 0, Right: 0 };
  }

  reset() {
    this.fijado.Left = this.fijado.Right = false;
    this.peso.Left = this.peso.Right = 0;
  }

  /**
   * @param {import('./fighter.js').Fighter} f  con las matrices ya actualizadas
   * @param {number} dt
   * @param {boolean} activo  false = soltar los pies (saltos, golpes, KO…)
   */
  update(f, dt, activo) {
    const rig = f.rig;
    if (!rig.bones.LeftFoot || !rig.bones.RightFoot) return;
    if (!activo) {
      for (const side of ['Left', 'Right']) {
        this.fijado[side] = false;
        this.peso[side] = Math.max(0, this.peso[side] - dt * 8);
      }
      return;
    }

    const fase = f.animator.phase;
    f.group.getWorldQuaternion(_qg);
    let tocado = false;

    for (const side of ['Left', 'Right']) {
      const [ini, fin] = CONTACTO[side];
      const dentro = fase >= ini && fase < fin;
      const ankle = rig.bones[side + 'Foot'];

      if (dentro) {
        // Peso en forma de trapecio: 0 en los bordes de la ventana, 1 en medio.
        const u = (fase - ini) / (fin - ini);
        const objetivo = Math.min(1, Math.min(u, 1 - u) / 0.14);
        this.peso[side] += (objetivo - this.peso[side]) * Math.min(1, dt * 18);
        if (!this.fijado[side]) {
          ankle.getWorldPosition(this.pin[side]);
          this.fijado[side] = true;
        }
      } else {
        this.fijado[side] = false;
        this.peso[side] = Math.max(0, this.peso[side] - dt * 12);
      }

      if (this.peso[side] > 0.01) {
        // Se conserva la altura que marca la animacion: solo se clava el avance.
        ankle.getWorldPosition(_t);
        _t.x = this.pin[side].x;
        _t.z = this.pin[side].z;
        if (this.resolverPierna(rig, side, _t, this.peso[side], _qg)) tocado = true;
      }
    }

    if (tocado) f.group.updateMatrixWorld(true);
  }

  /**
   * IK de dos huesos: coloca el tobillo en `target` doblando la rodilla en el
   * mismo plano en el que ya la tenia la animacion.
   * @returns {boolean} si se llego a tocar el esqueleto
   */
  resolverPierna(rig, side, target, peso, groupQuat) {
    const hip = rig.bones[side + 'UpLeg'];
    const knee = rig.bones[side + 'Leg'];
    const ankle = rig.bones[side + 'Foot'];
    const restHip = rig.rest[side + 'UpLeg'];
    const restKnee = rig.rest[side + 'Leg'];
    if (!hip || !knee || !ankle || !restHip || !restKnee) return false;

    hip.getWorldPosition(_h);
    knee.getWorldPosition(_k);
    ankle.getWorldPosition(_a);

    // Longitudes reales (valen para cualquier escala de modelo).
    const l1 = _h.distanceTo(_k);
    const l2 = _k.distanceTo(_a);
    if (l1 < 1e-4 || l2 < 1e-4) return false;

    _v.copy(target).sub(_h);
    const dist = THREE.MathUtils.clamp(_v.length(), Math.abs(l1 - l2) + 1e-3, (l1 + l2) * 0.999);
    if (_v.lengthSq() < 1e-8) return false;
    _dir.copy(_v).normalize();

    // Angulo del muslo respecto a la recta cadera-objetivo (ley del coseno).
    const cosA = THREE.MathUtils.clamp((l1 * l1 + dist * dist - l2 * l2) / (2 * l1 * dist), -1, 1);
    const A = Math.acos(cosA);

    // El plano de flexion se toma de la rodilla que ya habia: asi la rodilla
    // sigue doblando hacia donde toca en vez de girar sobre si misma.
    _pole.copy(_k).sub(_h);
    _axis.crossVectors(_dir, _pole);
    if (_axis.lengthSq() < 1e-8) return false;
    _axis.normalize();

    const muslo = _dir.clone().applyQuaternion(_q.setFromAxisAngle(_axis, A));
    const rodilla = _h.clone().addScaledVector(muslo, l1);
    const tibia = target.clone().sub(rodilla);
    if (tibia.lengthSq() < 1e-8) return false;
    tibia.normalize();

    this.orientar(hip, restHip, muslo, peso, groupQuat);
    hip.updateMatrixWorld(true);
    this.orientar(knee, restKnee, tibia, peso, groupQuat);
    knee.updateMatrixWorld(true);
    return true;
  }

  /** Gira un hueso hasta apuntar a `dirMundo`, mezclando con lo que ya tenia. */
  orientar(bone, rest, dirMundo, peso, groupQuat) {
    if (!rest.dirLocal) return;
    _restDir.copy(rest.dirLocal).applyQuaternion(rest.world).applyQuaternion(groupQuat);
    _q.setFromUnitVectors(_restDir, dirMundo);          // giro minimo en mundo
    _qp.copy(groupQuat).multiply(rest.world);           // reposo del hueso en mundo
    _q.multiply(_qp);                                    // orientacion final en mundo
    bone.parent.getWorldQuaternion(_qp);
    _q.premultiply(_qp.invert());                        // a espacio del padre
    bone.quaternion.slerp(_q, peso);
  }
}
