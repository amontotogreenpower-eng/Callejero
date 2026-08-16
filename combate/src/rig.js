// rig.js — Esqueleto Mixamo estandar (mixamorig:*) construido por codigo,
// mas la carga opcional de un personaje GLB exportado desde Mixamo.
//
// Convenio de espacio (pose de reposo, T-pose):
//   +X = izquierda del personaje   (LeftArm apunta a +X)
//   +Y = arriba
//   +Z = frente del personaje      (mira al rival / a la camara)
// Todas las rotaciones locales en reposo son identidad: los offsets llevan la
// geometria. Eso hace que las poses se puedan escribir en grados "mundo".

import * as THREE from 'three';

export const PREFIX = 'mixamorig:';

// [nombre, padre, offset respecto al padre en metros]
export const BONE_TABLE = [
  ['Hips', null, [0, 0.98, 0]],
  ['Spine', 'Hips', [0, 0.10, 0]],
  ['Spine1', 'Spine', [0, 0.12, 0]],
  ['Spine2', 'Spine1', [0, 0.12, 0]],
  ['Neck', 'Spine2', [0, 0.16, 0]],
  ['Head', 'Neck', [0, 0.09, 0]],
  ['HeadTop_End', 'Head', [0, 0.18, 0]],

  ['LeftShoulder', 'Spine2', [0.05, 0.11, 0]],
  ['LeftArm', 'LeftShoulder', [0.13, 0, 0]],
  ['LeftForeArm', 'LeftArm', [0.27, 0, 0]],
  ['LeftHand', 'LeftForeArm', [0.25, 0, 0]],
  ['LeftHandMiddle1', 'LeftHand', [0.09, 0, 0]],

  ['RightShoulder', 'Spine2', [-0.05, 0.11, 0]],
  ['RightArm', 'RightShoulder', [-0.13, 0, 0]],
  ['RightForeArm', 'RightArm', [-0.27, 0, 0]],
  ['RightHand', 'RightForeArm', [-0.25, 0, 0]],
  ['RightHandMiddle1', 'RightHand', [-0.09, 0, 0]],

  ['LeftUpLeg', 'Hips', [0.09, -0.06, 0]],
  ['LeftLeg', 'LeftUpLeg', [0, -0.42, 0]],
  ['LeftFoot', 'LeftLeg', [0, -0.41, 0]],
  ['LeftToeBase', 'LeftFoot', [0, -0.07, 0.13]],
  ['LeftToe_End', 'LeftToeBase', [0, 0, 0.07]],

  ['RightUpLeg', 'Hips', [-0.09, -0.06, 0]],
  ['RightLeg', 'RightUpLeg', [0, -0.42, 0]],
  ['RightFoot', 'RightLeg', [0, -0.41, 0]],
  ['RightToeBase', 'RightFoot', [0, -0.07, 0.13]],
  ['RightToe_End', 'RightToeBase', [0, 0, 0.07]],
];

// Hijo principal de cada hueso: define su direccion de reposo para el
// retargeting. Se listan alternativas porque los rigs de Mixamo reales
// terminan las manos en dedos con nombres variables.
export const CHAIN_CHILD = {
  Hips: ['Spine'],
  Spine: ['Spine1'],
  Spine1: ['Spine2'],
  Spine2: ['Neck'],
  Neck: ['Head'],
  Head: ['HeadTop_End'],
  LeftShoulder: ['LeftArm'],
  LeftArm: ['LeftForeArm'],
  LeftForeArm: ['LeftHand'],
  LeftHand: ['LeftHandMiddle1', 'LeftHandIndex1', 'LeftHandMiddle2'],
  RightShoulder: ['RightArm'],
  RightArm: ['RightForeArm'],
  RightForeArm: ['RightHand'],
  RightHand: ['RightHandMiddle1', 'RightHandIndex1', 'RightHandMiddle2'],
  LeftUpLeg: ['LeftLeg'],
  LeftLeg: ['LeftFoot'],
  LeftFoot: ['LeftToeBase'],
  RightUpLeg: ['RightLeg'],
  RightLeg: ['RightFoot'],
  RightFoot: ['RightToeBase'],
};

const V = (a) => new THREE.Vector3(a[0], a[1], a[2]);

/**
 * Construye el esqueleto Mixamo por codigo.
 * @returns {{root: THREE.Bone, bones: Object<string,THREE.Bone>, names: string[]}}
 */
export function buildSkeleton() {
  const bones = {};
  const names = [];
  let root = null;

  for (const [name, parent, off] of BONE_TABLE) {
    const bone = new THREE.Bone();
    bone.name = PREFIX + name;
    bone.userData.mixamo = name;
    bone.position.copy(V(off));
    bones[name] = bone;
    names.push(name);
    if (parent === null) root = bone;
    else bones[parent].add(bone);
  }

  root.updateMatrixWorld(true);
  return { root, bones, names };
}

/**
 * Captura la pose de reposo (bind pose) del rig: rotacion local y de "mundo"
 * (relativa a la raiz del rig) mas la direccion hacia el hijo principal.
 * Funciona igual para el rig procedural y para uno importado de Mixamo.
 */
export function computeRestState(rig) {
  const rest = {};
  const order = topoOrder(rig);

  for (const name of order) {
    const bone = rig.bones[name];
    if (!bone) continue;
    const parentName = parentOf(rig, name);
    const parentWorld = parentName && rest[parentName]
      ? rest[parentName].world
      : new THREE.Quaternion();

    const local = bone.quaternion.clone();
    const world = parentWorld.clone().multiply(local);

    // Direccion hacia el hijo principal, en espacio local del hueso.
    let dirLocal = null;
    let childName = null;
    for (const cand of CHAIN_CHILD[name] || []) {
      if (rig.bones[cand]) { childName = cand; break; }
    }
    if (childName) {
      const c = rig.bones[childName].position;
      if (c.lengthSq() > 1e-8) dirLocal = c.clone().normalize();
    }

    rest[name] = {
      local,
      world,
      worldInv: world.clone().invert(),
      dirLocal,
      child: childName,
      length: childName ? rig.bones[childName].position.length() : 0,
    };
  }
  rig.rest = rest;
  rig.order = order;
  return rest;
}

function parentOf(rig, name) {
  const bone = rig.bones[name];
  const p = bone && bone.parent;
  if (!p) return null;
  const pn = p.userData && p.userData.mixamo ? p.userData.mixamo : stripPrefix(p.name);
  return rig.bones[pn] ? pn : null;
}

/** Orden padre-antes-que-hijo, imprescindible para acumular rotaciones. */
function topoOrder(rig) {
  const out = [];
  const seen = new Set();
  const visit = (bone) => {
    const n = bone.userData && bone.userData.mixamo ? bone.userData.mixamo : stripPrefix(bone.name);
    if (rig.bones[n] && !seen.has(n)) { seen.add(n); out.push(n); }
    for (const c of bone.children) if (c.isBone) visit(c);
  };
  visit(rig.root);
  return out;
}

export function stripPrefix(name) {
  return String(name).replace(/^mixamorig\d*:?/i, '');
}

// ---------------------------------------------------------------------------
// Muñeco procedural: mallas rigidas emparentadas a cada hueso.
// No usa skinning, asi que no hay pesos que ajustar y el retargeting se ve
// limpio. Si cargas un GLB de Mixamo se usa su SkinnedMesh en su lugar.
// ---------------------------------------------------------------------------

const LIMB_RADIUS = {
  Spine: 0.115, Spine1: 0.125, Spine2: 0.13, Neck: 0.055,
  LeftArm: 0.055, RightArm: 0.055,
  LeftForeArm: 0.045, RightForeArm: 0.045,
  LeftShoulder: 0.07, RightShoulder: 0.07,
  LeftUpLeg: 0.08, RightUpLeg: 0.08,
  LeftLeg: 0.062, RightLeg: 0.062,
  LeftHand: 0.05, RightHand: 0.05,
};

/**
 * @param {object} rig
 * @param {{skin:number, trunk:number, accent:number}} palette
 * @returns {THREE.Group} grupo con el rig y las mallas
 */
export function buildMannequin(rig, palette) {
  const group = new THREE.Group();
  group.add(rig.root);

  const matSkin = new THREE.MeshStandardMaterial({ color: palette.skin, roughness: 0.62, metalness: 0.05 });
  const matTrunk = new THREE.MeshStandardMaterial({ color: palette.trunk, roughness: 0.55, metalness: 0.08 });
  const matAccent = new THREE.MeshStandardMaterial({ color: palette.accent, roughness: 0.42, metalness: 0.15 });

  const parts = [];
  const attach = (boneName, mesh) => {
    const bone = rig.bones[boneName];
    if (!bone) return;
    mesh.castShadow = true;
    mesh.receiveShadow = false;
    bone.add(mesh);
    parts.push(mesh);
  };

  // Segmentos: capsula desde el hueso hasta su hijo principal.
  for (const [name, info] of Object.entries(rig.rest)) {
    if (!info.child || info.length < 0.02) continue;
    const r = LIMB_RADIUS[name];
    if (!r) continue;
    const len = Math.max(info.length - r * 0.7, 0.02);
    const geo = new THREE.CapsuleGeometry(r, len, 4, 10);
    geo.translate(0, len / 2 + r * 0.1, 0);
    const isTrunk = /Spine|Shoulder|UpLeg/.test(name);
    const mesh = new THREE.Mesh(geo, isTrunk ? matTrunk : matSkin);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), info.dirLocal);
    attach(name, mesh);
  }

  // Cadera
  const hips = new THREE.Mesh(new THREE.BoxGeometry(0.30, 0.18, 0.20), matTrunk);
  hips.geometry.translate(0, 0.02, 0);
  attach('Hips', hips);

  // Cabeza + cara (una visera para saber hacia donde mira)
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.105, 16, 12), matSkin);
  head.geometry.translate(0, 0.09, 0.005);
  attach('Head', head);
  const visor = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.035, 0.03), matAccent);
  visor.geometry.translate(0, 0.10, 0.095);
  attach('Head', visor);

  // Guantes
  for (const side of ['Left', 'Right']) {
    const s = side === 'Left' ? 1 : -1;
    const glove = new THREE.Mesh(new THREE.SphereGeometry(0.072, 12, 10), matAccent);
    glove.geometry.translate(0.045 * s, 0, 0);
    attach(side + 'Hand', glove);

    const boot = new THREE.Mesh(new THREE.BoxGeometry(0.10, 0.075, 0.24), matAccent);
    boot.geometry.translate(0, -0.035, 0.055);
    attach(side + 'Foot', boot);
  }

  group.userData.parts = parts;
  group.userData.materials = { matSkin, matTrunk, matAccent };
  return group;
}

// ---------------------------------------------------------------------------
// Carga de un personaje Mixamo real (GLB/GLTF con esqueleto mixamorig:*)
// ---------------------------------------------------------------------------

/**
 * @param {string} url  .glb exportado desde Mixamo ("With Skin", formato glTF)
 * @param {number} targetHeight altura deseada en metros (se reescala)
 */
export async function loadMixamoCharacter(url, targetHeight = 1.75) {
  const { GLTFLoader } = await import('three/addons/loaders/GLTFLoader.js');
  const gltf = await new GLTFLoader().loadAsync(url);
  const scene = gltf.scene;

  const bones = {};
  let root = null;
  scene.traverse((o) => {
    if (!o.isBone) return;
    const n = stripPrefix(o.name);
    o.userData.mixamo = n;
    bones[n] = o;
  });
  if (!bones.Hips) throw new Error('El GLB no contiene un esqueleto Mixamo (falta mixamorig:Hips)');

  root = bones.Hips;
  scene.traverse((o) => { if (o.isMesh || o.isSkinnedMesh) { o.castShadow = true; o.frustumCulled = false; } });

  // Escalado: alto real medido por la caja envolvente.
  const box = new THREE.Box3().setFromObject(scene);
  const h = box.max.y - box.min.y;
  if (h > 0.01) scene.scale.multiplyScalar(targetHeight / h);

  const rig = { root, bones, names: Object.keys(bones), object: scene, clips: gltf.animations || [] };
  computeRestState(rig);
  return rig;
}
