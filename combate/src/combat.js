// combat.js — Deteccion de impactos entre luchadores.

import * as THREE from 'three';

const _p = new THREE.Vector3();
const _spheres = [];

/**
 * Comprueba si `att` conecta sobre `def` en este instante.
 * @returns {null|{blocked:boolean, point:THREE.Vector3, move:object}}
 */
export function checkHit(att, def) {
  if (att.state !== 'attack' || !att.move || att.hasHit) return null;
  const mv = att.move;
  if (att.moveTime < mv.active || att.moveTime > mv.recover) return null;

  att.bonePos(mv.bone, _p);

  // Un golpe alto pasa por encima de quien se agacha.
  if (mv.height === 'alto' && def.crouching && def.grounded) {
    // Solo se esquiva si el golpe viene por arriba de la cadera.
    const hip = def.bonePos('Hips', new THREE.Vector3());
    if (_p.y > hip.y + 0.15) return null;
  }

  def.hurtSpheres(_spheres);
  for (const s of _spheres) {
    const d = _p.distanceTo(s.p);
    if (d <= s.r + mv.radius) {
      const blocked = def.blocksAgainst(mv, att.pos.x);
      const point = _p.clone().lerp(s.p, 0.5);
      return { blocked, point, move: mv, zone: s.zone };
    }
  }
  return null;
}

/** Separa los luchadores para que no se atraviesen. */
export function separate(a, b, radius, limit) {
  const dx = b.pos.x - a.pos.x;
  const dist = Math.abs(dx);
  const min = radius * 2;
  if (dist >= min) return;
  const push = (min - dist) / 2;
  const s = Math.sign(dx) || 1;
  a.pos.x = THREE.MathUtils.clamp(a.pos.x - s * push, -limit, limit);
  b.pos.x = THREE.MathUtils.clamp(b.pos.x + s * push, -limit, limit);
}
