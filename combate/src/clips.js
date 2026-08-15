// clips.js — Poses y clips de animacion escritos a mano sobre el esqueleto
// Mixamo. Cada pose es {hueso: [rx, ry, rz]} en GRADOS, como desviacion
// respecto a la pose de reposo (T-pose). Como todas las rotaciones locales de
// reposo son identidad, los ejes coinciden con los del mundo del personaje:
//   X = eje lateral (positivo = izquierda del personaje)
//   Y = vertical
//   Z = hacia el rival
//
// Orden de Euler XYZ (three.js): se aplica primero Z, luego Y, luego X.

import * as THREE from 'three';

const D = Math.PI / 180;

/** Espeja una pose: intercambia Left/Right y niega los giros Y y Z. */
export function mirror(pose) {
  const out = {};
  for (const [bone, e] of Object.entries(pose)) {
    let n = bone;
    if (bone.startsWith('Left')) n = 'Right' + bone.slice(4);
    else if (bone.startsWith('Right')) n = 'Left' + bone.slice(5);
    out[n] = [e[0], -e[1], -e[2]];
  }
  return out;
}

const merge = (...poses) => Object.assign({}, ...poses);

// --- Bloques reutilizables -------------------------------------------------

const TORSO_STANCE = {
  Hips: [0, -22, 0],
  Spine: [-2, 6, 0],
  Spine1: [1, 8, 0],
  Spine2: [0, 6, 0],
  Neck: [4, 6, 0],
  Head: [6, 4, 0],
};

const LEGS_STANCE = {
  LeftUpLeg: [-16, 4, 4],
  LeftLeg: [22, 0, 0],
  LeftFoot: [-8, 0, 0],
  RightUpLeg: [14, -6, -6],
  RightLeg: [20, 0, 0],
  RightFoot: [-10, 0, 0],
};

const ARMS_GUARD = {
  LeftShoulder: [0, 0, -6],
  LeftArm: [-30, -12, -66],
  LeftForeArm: [0, -108, 0],
  LeftHand: [0, -14, 0],
  RightShoulder: [0, 0, 6],
  RightArm: [-34, 14, 64],
  RightForeArm: [0, 112, 0],
  RightHand: [0, 14, 0],
};

// --- Poses -----------------------------------------------------------------

export const POSES = {
  stance: merge(TORSO_STANCE, LEGS_STANCE, ARMS_GUARD),

  stanceUp: merge(TORSO_STANCE, LEGS_STANCE, ARMS_GUARD, {
    Spine: [-5, 6, 0],
    LeftUpLeg: [-14, 4, 4],
    RightUpLeg: [12, -6, -6],
    LeftArm: [-34, -12, -62],
    RightArm: [-38, 14, 60],
    Head: [3, 4, 0],
  }),

  // Desplazamiento lateral: dos apoyos alternos
  stepA: merge(TORSO_STANCE, ARMS_GUARD, {
    LeftUpLeg: [-30, 4, 6],
    LeftLeg: [34, 0, 0],
    LeftFoot: [-6, 0, 0],
    RightUpLeg: [22, -6, -8],
    RightLeg: [12, 0, 0],
    RightFoot: [-8, 0, 0],
    Hips: [0, -22, 0],
  }),
  stepB: merge(TORSO_STANCE, ARMS_GUARD, {
    LeftUpLeg: [-6, 4, 4],
    LeftLeg: [14, 0, 0],
    LeftFoot: [-10, 0, 0],
    RightUpLeg: [2, -6, -6],
    RightLeg: [34, 0, 0],
    RightFoot: [-4, 0, 0],
    Hips: [0, -22, 0],
  }),

  crouch: merge(TORSO_STANCE, ARMS_GUARD, {
    Hips: [12, -22, 0],
    Spine: [10, 6, 0],
    Spine1: [8, 8, 0],
    LeftUpLeg: [-62, 6, 10],
    LeftLeg: [86, 0, 0],
    LeftFoot: [-24, 0, 0],
    RightUpLeg: [-52, -8, -12],
    RightLeg: [92, 0, 0],
    RightFoot: [-30, 0, 0],
    LeftArm: [-24, -12, -58],
    RightArm: [-28, 14, 56],
  }),

  air: merge(TORSO_STANCE, ARMS_GUARD, {
    LeftUpLeg: [-52, 4, 6],
    LeftLeg: [64, 0, 0],
    RightUpLeg: [-18, -6, -6],
    RightLeg: [78, 0, 0],
    LeftFoot: [16, 0, 0],
    RightFoot: [18, 0, 0],
  }),

  block: merge(TORSO_STANCE, LEGS_STANCE, {
    Hips: [0, -34, 0],
    Spine: [4, 10, 0],
    Spine1: [6, 10, 0],
    Head: [12, 6, 0],
    LeftArm: [-58, -18, -52],
    LeftForeArm: [0, -128, 0],
    LeftHand: [0, -20, 0],
    RightArm: [-62, 20, 50],
    RightForeArm: [0, 130, 0],
    RightHand: [0, 20, 0],
  }),

  // --- Golpes de brazo -----------------------------------------------------

  jabWind: merge(TORSO_STANCE, LEGS_STANCE, ARMS_GUARD, {
    Hips: [0, -26, 0],
    LeftArm: [-26, -4, -66],
    LeftForeArm: [0, -122, 0],
  }),
  // Giro acumulado del torso: -30 +4 -6 -4 = -36; con el hombro, -52.
  // El brazo apunta al frente cuando su Y de mundo vale -92 -> local -40.
  jabHit: merge(TORSO_STANCE, LEGS_STANCE, ARMS_GUARD, {
    Hips: [0, -30, 0],
    Spine: [-2, 4, 0],
    Spine1: [0, -6, 0],
    Spine2: [0, -4, 0],
    LeftShoulder: [0, -16, -10],
    LeftArm: [0, -40, -12],
    LeftForeArm: [0, -6, 0],
    LeftHand: [0, 0, 0],
    RightArm: [-34, 46, 64],
    LeftUpLeg: [-24, 4, 4],
    RightUpLeg: [18, -6, -6],
  }),

  crossWind: merge(TORSO_STANCE, LEGS_STANCE, ARMS_GUARD, {
    Hips: [0, -30, 0],
    Spine1: [0, -2, 0],
    RightArm: [-40, 34, 62],
    RightForeArm: [0, 128, 0],
  }),
  // Giro acumulado: 16 +10 +14 +10 = 50; con el hombro, 64.
  // Brazo al frente = Y de mundo +92 -> local +28.
  crossHit: merge(TORSO_STANCE, LEGS_STANCE, ARMS_GUARD, {
    Hips: [0, 16, 0],
    Spine: [-2, 10, 0],
    Spine1: [0, 14, 0],
    Spine2: [0, 10, 0],
    RightShoulder: [0, 14, 10],
    RightArm: [-4, 28, 12],
    RightForeArm: [0, 4, 0],
    RightHand: [0, 0, 0],
    LeftArm: [-30, -44, -66],
    RightUpLeg: [4, -6, -6],
    RightFoot: [-26, 0, 0],
    LeftUpLeg: [-26, 4, 4],
  }),

  hookWind: merge(TORSO_STANCE, LEGS_STANCE, ARMS_GUARD, {
    Hips: [0, -14, 0],
    LeftArm: [-46, 10, -46],
    LeftForeArm: [0, -104, 0],
  }),
  // Giro acumulado: -40 -6 -6 -3 = -55; con el hombro, -73.
  // El gancho cruza por delante: Y de mundo -122 -> local -49.
  hookHit: merge(TORSO_STANCE, LEGS_STANCE, ARMS_GUARD, {
    Hips: [0, -40, 0],
    Spine: [-4, -6, 0],
    Spine1: [0, -6, 0],
    Spine2: [0, -3, 0],
    LeftShoulder: [0, -18, -14],
    LeftArm: [-10, -35, -14],
    LeftForeArm: [0, -50, 0],
    RightArm: [-34, 50, 64],
    LeftUpLeg: [-24, 4, 4],
    RightUpLeg: [10, -6, -6],
  }),

  uppercutWind: merge(TORSO_STANCE, LEGS_STANCE, ARMS_GUARD, {
    Hips: [14, -24, 0],
    Spine: [12, 4, 0],
    RightArm: [-16, 26, 78],
    RightForeArm: [0, 120, 0],
    RightUpLeg: [-38, -8, -10],
    RightLeg: [58, 0, 0],
    LeftUpLeg: [-30, 4, 6],
    LeftLeg: [44, 0, 0],
  }),
  // Giro acumulado: 16 +10 +12 +8 = 46; con el hombro, 56.
  // Sube y va al frente: Y de mundo +92 (local +36) con Z negativa que eleva.
  uppercutHit: merge(TORSO_STANCE, LEGS_STANCE, ARMS_GUARD, {
    Hips: [-12, 16, 0],
    Spine: [-12, 10, 0],
    Spine1: [-8, 12, 0],
    Spine2: [0, 8, 0],
    RightShoulder: [0, 10, 16],
    RightArm: [0, 26, -30],
    RightForeArm: [0, 10, 0],
    LeftArm: [-30, -40, -70],
    LeftUpLeg: [-14, 4, 4],
    RightUpLeg: [6, -6, -6],
  }),

  // --- Patadas -------------------------------------------------------------

  lowKickWind: merge(TORSO_STANCE, LEGS_STANCE, ARMS_GUARD, {
    Hips: [0, -30, 0],
    RightUpLeg: [-24, -8, -10],
    RightLeg: [70, 0, 0],
  }),
  lowKickHit: merge(TORSO_STANCE, ARMS_GUARD, {
    Hips: [-4, -8, 0],
    Spine: [-8, 4, 0],
    Spine1: [-4, 4, 0],
    Spine2: [0, 0, 0],
    LeftUpLeg: [-8, 4, 4],
    LeftLeg: [16, 0, 0],
    LeftFoot: [-6, 0, 0],
    RightUpLeg: [-44, -10, -14],
    RightLeg: [16, 0, 0],
    RightFoot: [-16, 0, 0],
    LeftArm: [-38, -12, -58],
    RightArm: [-46, 20, 52],
  }),

  highKickWind: merge(TORSO_STANCE, LEGS_STANCE, ARMS_GUARD, {
    Hips: [-6, -28, 0],
    RightUpLeg: [-46, -10, -12],
    RightLeg: [96, 0, 0],
    LeftLeg: [16, 0, 0],
  }),
  highKickHit: merge(TORSO_STANCE, ARMS_GUARD, {
    Hips: [-8, -4, -6],
    Spine: [-9, 2, 0],
    Spine1: [-6, 2, 0],
    Spine2: [0, 0, 0],
    Head: [-4, 8, 0],
    LeftUpLeg: [-4, 4, 4],
    LeftLeg: [10, 0, 0],
    LeftFoot: [-4, 0, 0],
    RightUpLeg: [-84, -12, -16],
    RightLeg: [10, 0, 0],
    RightFoot: [-24, 0, 0],
    LeftArm: [-56, -16, -44],
    RightArm: [-30, 22, 78],
    RightForeArm: [0, 84, 0],
  }),

  // --- Reacciones ----------------------------------------------------------

  hitHigh: merge(TORSO_STANCE, LEGS_STANCE, ARMS_GUARD, {
    Hips: [-8, -22, 0],
    Spine: [-14, 6, 0],
    Spine1: [-12, 8, 0],
    Neck: [-18, 6, 0],
    Head: [-24, 4, 0],
    LeftArm: [-16, -12, -74],
    RightArm: [-20, 14, 72],
    LeftUpLeg: [-8, 4, 4],
    RightUpLeg: [20, -6, -6],
  }),
  hitLow: merge(TORSO_STANCE, LEGS_STANCE, ARMS_GUARD, {
    Hips: [16, -22, 0],
    Spine: [18, 6, 0],
    Spine1: [14, 8, 0],
    Neck: [10, 6, 0],
    Head: [14, 4, 0],
    LeftUpLeg: [-26, 4, 6],
    LeftLeg: [40, 0, 0],
    RightUpLeg: [-4, -6, -6],
    RightLeg: [46, 0, 0],
  }),

  ko: {
    Hips: [-72, 0, 0],
    Spine: [-14, 0, 0],
    Spine1: [-10, 0, 0],
    Neck: [-16, 0, 0],
    Head: [-18, 0, 0],
    LeftArm: [-10, -20, -18],
    RightArm: [-10, 20, 18],
    LeftForeArm: [0, -32, 0],
    RightForeArm: [0, 32, 0],
    LeftUpLeg: [12, 6, 10],
    RightUpLeg: [16, -6, -10],
    LeftLeg: [26, 0, 0],
    RightLeg: [20, 0, 0],
  },

  win: merge(TORSO_STANCE, LEGS_STANCE, {
    Hips: [0, -6, 0],
    Spine: [-6, 0, 0],
    Head: [-8, 0, 0],
    LeftArm: [-10, -20, -152],
    LeftForeArm: [0, -46, 0],
    RightArm: [-10, 20, 150],
    RightForeArm: [0, 44, 0],
  }),

  winB: merge(TORSO_STANCE, LEGS_STANCE, {
    Hips: [0, -6, 0],
    Spine: [-2, 0, 0],
    Head: [2, 0, 0],
    LeftArm: [-16, -20, -140],
    LeftForeArm: [0, -70, 0],
    RightArm: [-16, 20, 138],
    RightForeArm: [0, 68, 0],
  }),
};

// Golpes espejados: version con el otro lado del cuerpo.
POSES.jabWindR = mirror(POSES.jabWind);
POSES.jabHitR = mirror(POSES.jabHit);
POSES.hookWindR = mirror(POSES.hookWind);
POSES.hookHitR = mirror(POSES.hookHit);
POSES.lowKickWindL = mirror(POSES.lowKickWind);
POSES.lowKickHitL = mirror(POSES.lowKickHit);
POSES.highKickWindL = mirror(POSES.highKickWind);
POSES.highKickHitL = mirror(POSES.highKickHit);

// --- Compilacion a cuaterniones -------------------------------------------

const _e = new THREE.Euler();
const compiled = new Map();

/** @returns {Map<string,THREE.Quaternion>} desviaciones respecto al reposo */
export function compiledPose(name) {
  let m = compiled.get(name);
  if (m) return m;
  const pose = POSES[name];
  if (!pose) throw new Error('Pose desconocida: ' + name);
  m = new Map();
  for (const [bone, e] of Object.entries(pose)) {
    _e.set(e[0] * D, e[1] * D, e[2] * D, 'XYZ');
    m.set(bone, new THREE.Quaternion().setFromEuler(_e));
  }
  compiled.set(name, m);
  return m;
}

// --- Clips -----------------------------------------------------------------

const clip = (name, loop, keys) => ({
  name, loop,
  keys,
  duration: keys[keys.length - 1].t,
});

export const CLIPS = {
  idle: clip('idle', true, [
    { t: 0.00, pose: 'stance' },
    { t: 0.70, pose: 'stanceUp' },
    { t: 1.40, pose: 'stance' },
  ]),
  walk: clip('walk', true, [
    { t: 0.00, pose: 'stance' },
    { t: 0.18, pose: 'stepA' },
    { t: 0.36, pose: 'stance' },
    { t: 0.54, pose: 'stepB' },
    { t: 0.72, pose: 'stance' },
  ]),
  crouch: clip('crouch', true, [
    { t: 0.00, pose: 'crouch' },
    { t: 0.60, pose: 'crouch' },
  ]),
  air: clip('air', true, [
    { t: 0.00, pose: 'air' },
    { t: 0.50, pose: 'air' },
  ]),
  block: clip('block', true, [
    { t: 0.00, pose: 'block' },
    { t: 0.40, pose: 'block' },
  ]),

  jab: clip('jab', false, [
    { t: 0.00, pose: 'stance' },
    { t: 0.07, pose: 'jabWind' },
    { t: 0.15, pose: 'jabHit' },
    { t: 0.24, pose: 'jabHit' },
    { t: 0.40, pose: 'stance' },
  ]),
  cross: clip('cross', false, [
    { t: 0.00, pose: 'stance' },
    { t: 0.10, pose: 'crossWind' },
    { t: 0.21, pose: 'crossHit' },
    { t: 0.32, pose: 'crossHit' },
    { t: 0.54, pose: 'stance' },
  ]),
  hook: clip('hook', false, [
    { t: 0.00, pose: 'stance' },
    { t: 0.12, pose: 'hookWind' },
    { t: 0.26, pose: 'hookHit' },
    { t: 0.38, pose: 'hookHit' },
    { t: 0.62, pose: 'stance' },
  ]),
  uppercut: clip('uppercut', false, [
    { t: 0.00, pose: 'stance' },
    { t: 0.13, pose: 'uppercutWind' },
    { t: 0.27, pose: 'uppercutHit' },
    { t: 0.40, pose: 'uppercutHit' },
    { t: 0.70, pose: 'stance' },
  ]),
  lowKick: clip('lowKick', false, [
    { t: 0.00, pose: 'stance' },
    { t: 0.11, pose: 'lowKickWind' },
    { t: 0.24, pose: 'lowKickHit' },
    { t: 0.36, pose: 'lowKickHit' },
    { t: 0.60, pose: 'stance' },
  ]),
  highKick: clip('highKick', false, [
    { t: 0.00, pose: 'stance' },
    { t: 0.14, pose: 'highKickWind' },
    { t: 0.30, pose: 'highKickHit' },
    { t: 0.44, pose: 'highKickHit' },
    { t: 0.76, pose: 'stance' },
  ]),

  hitHigh: clip('hitHigh', false, [
    { t: 0.00, pose: 'hitHigh' },
    { t: 0.10, pose: 'hitHigh' },
    { t: 0.34, pose: 'stance' },
  ]),
  hitLow: clip('hitLow', false, [
    { t: 0.00, pose: 'hitLow' },
    { t: 0.10, pose: 'hitLow' },
    { t: 0.34, pose: 'stance' },
  ]),
  ko: clip('ko', false, [
    { t: 0.00, pose: 'hitHigh' },
    { t: 0.30, pose: 'ko' },
    { t: 1.20, pose: 'ko' },
  ]),
  win: clip('win', true, [
    { t: 0.00, pose: 'win' },
    { t: 0.55, pose: 'winB' },
    { t: 1.10, pose: 'win' },
  ]),
};

// Variantes espejadas de los ataques (mano/pierna contraria).
CLIPS.jabR = clip('jabR', false, [
  { t: 0.00, pose: 'stance' },
  { t: 0.07, pose: 'jabWindR' },
  { t: 0.15, pose: 'jabHitR' },
  { t: 0.24, pose: 'jabHitR' },
  { t: 0.40, pose: 'stance' },
]);
CLIPS.hookR = clip('hookR', false, [
  { t: 0.00, pose: 'stance' },
  { t: 0.12, pose: 'hookWindR' },
  { t: 0.26, pose: 'hookHitR' },
  { t: 0.38, pose: 'hookHitR' },
  { t: 0.62, pose: 'stance' },
]);
CLIPS.lowKickL = clip('lowKickL', false, [
  { t: 0.00, pose: 'stance' },
  { t: 0.11, pose: 'lowKickWindL' },
  { t: 0.24, pose: 'lowKickHitL' },
  { t: 0.36, pose: 'lowKickHitL' },
  { t: 0.60, pose: 'stance' },
]);
CLIPS.highKickL = clip('highKickL', false, [
  { t: 0.00, pose: 'stance' },
  { t: 0.14, pose: 'highKickWindL' },
  { t: 0.30, pose: 'highKickHitL' },
  { t: 0.44, pose: 'highKickHitL' },
  { t: 0.76, pose: 'stance' },
]);
