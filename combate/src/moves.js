// moves.js — Frame data de los golpes.
// Los tiempos van en segundos y estan alineados con los keyframes de clips.js.
//
//  startup .. active : el golpe todavia no hace daño
//  active  .. recover: la hitbox esta viva (una sola conexion por golpe)
//  recover .. dur    : recuperacion, el luchador esta vendido
//
// height: 'alto'  -> lo esquiva quien se agacha
//         'medio' -> se bloquea de pie o agachado
//         'bajo'  -> solo se bloquea agachado

/**
 * @typedef {object} Move
 * @property {string} clip      clip de animacion
 * @property {number} dur       duracion total
 * @property {number} active    inicio de la hitbox
 * @property {number} recover   fin de la hitbox
 * @property {number} damage
 * @property {string} bone      hueso que golpea
 * @property {number} radius    radio de la hitbox (m)
 * @property {number} hitstun   segundos que el rival queda aturdido
 * @property {number} knockback empuje horizontal (m/s)
 * @property {number} launch    empuje vertical (m/s)
 * @property {string} height
 * @property {number} advance   avance del atacante (m/s durante el arranque)
 * @property {string} sfx
 */

/** @type {Object<string, Move>} */
export const MOVES = {
  jab: {
    clip: 'jab', dur: 0.40, active: 0.125, recover: 0.245,
    damage: 5, bone: 'LeftHand', radius: 0.22,
    hitstun: 0.20, knockback: 1.1, launch: 0, height: 'medio',
    advance: 1.1, sfx: 'light', chain: ['jab', 'cross', 'hook', 'lowKick'],
  },
  cross: {
    clip: 'cross', dur: 0.54, active: 0.190, recover: 0.330,
    damage: 9, bone: 'RightHand', radius: 0.23,
    hitstun: 0.28, knockback: 2.0, launch: 0, height: 'medio',
    advance: 1.4, sfx: 'medium', chain: ['hook', 'highKick', 'uppercut'],
  },
  hook: {
    clip: 'hook', dur: 0.62, active: 0.240, recover: 0.390,
    damage: 12, bone: 'LeftHand', radius: 0.25,
    hitstun: 0.34, knockback: 2.6, launch: 0, height: 'medio',
    advance: 1.0, sfx: 'heavy', chain: ['uppercut', 'highKick'],
  },
  uppercut: {
    clip: 'uppercut', dur: 0.70, active: 0.255, recover: 0.405,
    damage: 14, bone: 'RightHand', radius: 0.26,
    hitstun: 0.42, knockback: 1.8, launch: 4.2, height: 'alto',
    advance: 0.7, sfx: 'heavy', chain: [],
  },
  lowKick: {
    clip: 'lowKick', dur: 0.60, active: 0.225, recover: 0.365,
    damage: 8, bone: 'RightFoot', radius: 0.26,
    hitstun: 0.30, knockback: 1.7, launch: 0, height: 'bajo',
    advance: 1.2, sfx: 'medium', chain: ['highKick'],
  },
  highKick: {
    clip: 'highKick', dur: 0.76, active: 0.290, recover: 0.445,
    damage: 16, bone: 'RightFoot', radius: 0.28,
    hitstun: 0.46, knockback: 3.4, launch: 1.2, height: 'alto',
    advance: 1.5, sfx: 'heavy', chain: [],
  },
};

// Variantes espejadas: las usa la captura de movimiento cuando detecta que el
// golpe salio del otro lado del cuerpo.
const MIRROR = {
  jab: ['jabR', 'RightHand'],
  hook: ['hookR', 'RightHand'],
  lowKick: ['lowKickL', 'LeftFoot'],
  highKick: ['highKickL', 'LeftFoot'],
};
for (const [base, [clip, bone]] of Object.entries(MIRROR)) {
  MOVES[base + '_m'] = { ...MOVES[base], clip, bone };
}
// cross/uppercut nacen del lado derecho: su espejo va con la mano izquierda.
MOVES.cross_m = { ...MOVES.cross, clip: 'jab', bone: 'LeftHand', damage: 8 };
MOVES.uppercut_m = { ...MOVES.uppercut, clip: 'uppercut', bone: 'RightHand' };

/** Devuelve el nombre del golpe adecuado segun el lado del cuerpo. */
export function sided(name, isLeftSide) {
  const m = name + '_m';
  const leftIsBase = MOVES[name] && /Left/.test(MOVES[name].bone);
  if (isLeftSide === leftIsBase) return name;
  return MOVES[m] ? m : name;
}

export const MOVE_NAMES = Object.keys(MOVES);
