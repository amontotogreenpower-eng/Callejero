// Pruebas del esqueleto, los clips y el retargeting de MediaPipe.
// Ejecutar con:  npm test   (desde la carpeta combate/)

import * as THREE from 'three';
import { buildSkeleton, computeRestState, canonicalBone, orientRig } from '../src/rig.js';
import { Animator } from '../src/animator.js';
import { CLIPS } from '../src/clips.js';
import { MOVES } from '../src/moves.js';
import { Retargeter } from '../src/retarget.js';
import { GestureReader } from '../src/gestures.js';

let fails = 0;
const ok = (c, msg, extra = '') => {
  console.log((c ? '  ok   ' : '  FAIL ') + msg + (extra ? ' — ' + extra : ''));
  if (!c) fails++;
};
const deg = (r) => (r * 180 / Math.PI).toFixed(1);

// --------------------------------------------------------------- esqueleto
console.log('\n== esqueleto mixamo ==');
const rig = buildSkeleton();
computeRestState(rig);
rig.root.updateMatrixWorld(true);

const top = rig.bones.HeadTop_End.getWorldPosition(new THREE.Vector3());
const toe = rig.bones.LeftToe_End.getWorldPosition(new THREE.Vector3());
ok(Math.abs(top.y - 1.75) < 0.02, 'altura total ~1.75 m', top.y.toFixed(3));
ok(Math.abs(toe.y) < 0.12, 'pies cerca del suelo', toe.y.toFixed(3));
ok(rig.order[0] === 'Hips', 'el orden topologico empieza en Hips');
ok(rig.order.indexOf('Spine2') < rig.order.indexOf('LeftArm'), 'padres antes que hijos');
ok(rig.bones.LeftArm.name === 'mixamorig:LeftArm', 'nomenclatura mixamorig:*');
ok(rig.rest.LeftArm.dirLocal.x > 0.99, 'LeftArm apunta a +X en reposo (T-pose)');
ok(rig.rest.LeftUpLeg.dirLocal.y < -0.99, 'LeftUpLeg apunta a -Y en reposo');
ok(Object.keys(rig.rest).length === rig.order.length, 'todos los huesos con pose de reposo');

// --------------------------------------------------------------- clips
console.log('\n== clips de animacion ==');
const anim = new Animator(rig);
let nan = false;
for (const name of Object.keys(CLIPS)) {
  anim.play(name, { fade: 0, restart: true });
  const clip = CLIPS[name];
  for (let i = 0; i <= 8; i++) {
    anim.update(clip.duration / 8);
    anim.applyTo(1);
    for (const b of Object.values(rig.bones)) {
      const q = b.quaternion;
      if (!isFinite(q.x + q.y + q.z + q.w)) nan = true;
    }
  }
}
ok(!nan, `sin rotaciones NaN en los ${Object.keys(CLIPS).length} clips`);

function poseAt(clip, t) {
  anim.play(clip, { fade: 0, restart: true });
  const step = 1 / 240;
  for (let x = 0; x < t; x += step) anim.update(step);
  anim.applyTo(1);
  rig.root.updateMatrixWorld(true);
}
const at = (bone) => rig.bones[bone].getWorldPosition(new THREE.Vector3());

poseAt('idle', 0.2);
const hL = at('LeftHand'), sL = at('LeftArm');
ok(hL.y < sL.y + 0.05, 'guardia: la mano no queda por encima del hombro', 'y=' + hL.y.toFixed(2));
ok(hL.z > sL.z + 0.15, 'guardia: manos por delante del cuerpo', 'dz=' + (hL.z - sL.z).toFixed(2));

// Cada golpe debe llegar al frente (+Z local) y no desviarse de lado.
// Aqui se detecta si los giros del torso descolocan brazos o piernas.
console.log('\n== alcance de los golpes (en el instante de impacto) ==');
const ALCANCE = {
  jab: { bone: 'LeftHand', z: 0.50, x: 0.30 },
  cross: { bone: 'RightHand', z: 0.50, x: 0.30 },
  hook: { bone: 'LeftHand', z: 0.40, x: 0.38 },
  uppercut: { bone: 'RightHand', z: 0.25, x: 0.38, minY: 1.68 },
  lowKick: { bone: 'RightFoot', z: 0.38, x: 0.42, maxY: 0.55 },
  highKick: { bone: 'RightFoot', z: 0.60, x: 0.50, minY: 0.85 },
};
for (const [name, exp] of Object.entries(ALCANCE)) {
  const mv = MOVES[name];
  poseAt(mv.clip, (mv.active + mv.recover) / 2);
  const p = at(exp.bone);
  const info = `(${p.x.toFixed(2)}, ${p.y.toFixed(2)}, ${p.z.toFixed(2)})`;
  ok(p.z >= exp.z, `${name}: alcanza hacia el rival (z>=${exp.z})`, info);
  ok(Math.abs(p.x) <= exp.x, `${name}: no se va de lado (|x|<=${exp.x})`, info);
  if (exp.minY) ok(p.y >= exp.minY, `${name}: golpea alto (y>=${exp.minY})`, info);
  if (exp.maxY) ok(p.y <= exp.maxY, `${name}: golpea bajo (y<=${exp.maxY})`, info);
  ok(mv.bone === exp.bone, `${name}: la hitbox usa ${exp.bone}`);
}

// --------------------------------------------------------------- nombres
console.log('\n== nombres de hueso importados ==');
// El mismo esqueleto llega escrito de muchas formas segun por donde haya
// pasado el fichero; todas tienen que reconocerse.
const NOMBRES = [
  ['mixamorig:LeftArm', 'LeftArm'],
  ['mixamorig_LeftArm', 'LeftArm'],       // glTF no admite ':'
  ['mixamorig1:LeftArm', 'LeftArm'],      // segunda descarga de Mixamo
  ['mixamorig2_LeftUpLeg', 'LeftUpLeg'],
  ['Armature|mixamorig:Hips', 'Hips'],
  ['mixamorig:LeftToe_End', 'LeftToe_End'],
  ['mixamorigHeadTop_End', 'HeadTop_End'],
  ['LeftForeArm', 'LeftForeArm'],         // sin prefijo
  ['Bip01_Spine', null],                  // otro rig: no es Mixamo
  ['Cube', null],
];
for (const [crudo, esperado] of NOMBRES) {
  ok(canonicalBone(crudo) === esperado,
    `"${crudo}" -> ${esperado === null ? 'no es hueso Mixamo' : esperado}`,
    String(canonicalBone(crudo)));
}

// --------------------------------------------------------------- rig importado
console.log('\n== esqueleto importado (modelo grabado del reves) ==');
// Muchos personajes de Mixamo convertidos a glTF vienen mirando a -Z. El juego
// lo detecta por los pies y lo corrige girando la base; despues los golpes
// tienen que salir hacia donde mira el personaje, no hacia el lado contrario.
{
  const rig2 = buildSkeleton();
  const contenedor = new THREE.Object3D();
  contenedor.add(rig2.root);
  rig2.object = contenedor;
  rig2.root.quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI); // datos al reves
  contenedor.updateMatrixWorld(true);

  orientRig(rig2, 0);
  const yawDetectado = rig2.yaw;
  // orientRig(0) no corrige por si solo: se pide la deteccion como hace el cargador.
  const pie = rig2.bones.LeftFoot.getWorldPosition(new THREE.Vector3());
  const dedo = rig2.bones.LeftToeBase.getWorldPosition(new THREE.Vector3());
  ok(dedo.z - pie.z < 0, 'de partida el modelo mira hacia atras', (dedo.z - pie.z).toFixed(2));

  orientRig(rig2, Math.PI);   // lo que aplica el cargador tras detectarlo
  contenedor.updateMatrixWorld(true);
  const pie2 = rig2.bones.LeftFoot.getWorldPosition(new THREE.Vector3());
  const dedo2 = rig2.bones.LeftToeBase.getWorldPosition(new THREE.Vector3());
  ok(dedo2.z - pie2.z > 0, 'tras corregir, el personaje mira al frente', (dedo2.z - pie2.z).toFixed(2));

  const anim2 = new Animator(rig2);
  anim2.play('cross', { fade: 0, restart: true });
  for (let i = 0; i < 13; i++) anim2.update(0.02);
  anim2.applyTo(1);
  contenedor.updateMatrixWorld(true);
  const mano = rig2.bones.RightHand.getWorldPosition(new THREE.Vector3());
  const hombro = rig2.bones.RightArm.getWorldPosition(new THREE.Vector3());
  ok(mano.z - hombro.z > 0.35, 'el directo sale hacia donde mira el personaje',
    'dz=' + (mano.z - hombro.z).toFixed(2));
  ok(Math.abs(mano.x) < 0.35, 'y no se va de lado', 'x=' + mano.x.toFixed(2));
  ok(yawDetectado === 0, 'orientRig guarda el giro aplicado');
}

// --------------------------------------------------------------- retargeting
console.log('\n== retargeting mediapipe -> mixamo ==');

// Puntos definidos en espacio del rig y convertidos al convenio de MediaPipe
// (x = x, y = -y, z = -z), que es justo lo que deshace Retargeter.
function mkPose({ elbowL, wristL, elbowR, wristR, kneeL, ankleL, kneeR, ankleR }) {
  const P = {
    0: [0, 0.70, 0.12],
    7: [0.075, 0.66, 0.02], 8: [-0.075, 0.66, 0.02],
    11: [0.19, 0.50, 0], 12: [-0.19, 0.50, 0],
    13: elbowL, 14: elbowR, 15: wristL, 16: wristR,
    19: [wristL[0], wristL[1] - 0.02, wristL[2] + 0.08],
    20: [wristR[0], wristR[1] - 0.02, wristR[2] + 0.08],
    23: [0.10, 0, 0], 24: [-0.10, 0, 0],
    25: kneeL, 26: kneeR, 27: ankleL, 28: ankleR,
    31: [ankleL[0], ankleL[1] - 0.03, ankleL[2] + 0.16],
    32: [ankleR[0], ankleR[1] - 0.03, ankleR[2] + 0.16],
  };
  return Array.from({ length: 33 }, (_, i) => {
    const p = P[i] || [0, 0, 0];
    return { x: p[0], y: -p[1], z: -p[2], visibility: P[i] ? 0.95 : 0.2 };
  });
}
const screenPose = () => Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, z: 0, visibility: 0.9 }));

const DE_PIE = {
  elbowL: [0.30, 0.22, 0.02], wristL: [0.34, -0.05, 0.05],
  elbowR: [-0.30, 0.22, 0.02], wristR: [-0.34, -0.05, 0.05],
  kneeL: [0.10, -0.45, 0.02], ankleL: [0.10, -0.88, 0],
  kneeR: [-0.10, -0.45, 0.02], ankleR: [-0.10, -0.88, 0],
};

const rt = new Retargeter(rig, { smooth: 0.02 });
function capturar(pose, frames = 90) {
  const lm = mkPose(pose);
  for (let i = 0; i < frames; i++) rt.update(lm, screenPose(), 1 / 60);
  rt.apply();
  rig.root.updateMatrixWorld(true);
}
function dirHueso(name) {
  const b = rig.bones[name];
  const c = rig.bones[rig.rest[name].child];
  return c.getWorldPosition(new THREE.Vector3())
    .sub(b.getWorldPosition(new THREE.Vector3())).normalize();
}
const error = (name, target) =>
  Math.acos(THREE.MathUtils.clamp(dirHueso(name).dot(new THREE.Vector3(...target).normalize()), -1, 1));

capturar(DE_PIE);
ok(rt.valid, 'cuerpo de pie reconocido');
ok(error('LeftArm', [0.11, -0.28, 0.02]) < 0.10, 'brazo izq apunta al codo', deg(error('LeftArm', [0.11, -0.28, 0.02])) + '°');
ok(error('LeftForeArm', [0.04, -0.27, 0.03]) < 0.10, 'antebrazo izq apunta a la muñeca', deg(error('LeftForeArm', [0.04, -0.27, 0.03])) + '°');
ok(error('RightArm', [-0.11, -0.28, 0.02]) < 0.10, 'brazo der apunta al codo');
ok(error('LeftUpLeg', [0, -0.45, 0.02]) < 0.10, 'muslo izq apunta a la rodilla');
ok(error('LeftLeg', [0, -0.43, -0.02]) < 0.10, 'tibia izq apunta al tobillo');
ok(error('Neck', [0, 0.16, 0.02]) < 0.20, 'cuello hacia la cabeza');

capturar({ ...DE_PIE, elbowL: [0.22, 0.42, 0.22], wristL: [0.16, 0.44, 0.62] });
ok(error('LeftArm', [0.03, -0.08, 0.22]) < 0.12, 'puñetazo: brazo hacia el codo adelantado');
ok(error('LeftForeArm', [-0.06, 0.02, 0.40]) < 0.12, 'puñetazo: antebrazo extendido al frente');
const dzMano = at('LeftHand').z - at('LeftArm').z;
ok(dzMano > 0.35, 'puñetazo: la mano del rig sale al frente', 'dz=' + dzMano.toFixed(2));

capturar({ ...DE_PIE, kneeR: [-0.12, -0.10, 0.34], ankleR: [-0.12, -0.05, 0.74] });
ok(error('RightUpLeg', [-0.02, -0.10, 0.34]) < 0.12, 'patada: muslo levantado al frente');
ok(error('RightLeg', [0, 0.05, 0.40]) < 0.12, 'patada: tibia extendida');
ok(at('RightFoot').z > 0.55, 'patada: el pie del rig llega lejos', 'z=' + at('RightFoot').z.toFixed(2));

// Giro del torso: 30° del jugador -> 30° del personaje.
const girado = mkPose(DE_PIE);
const rot = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), 30 * Math.PI / 180);
for (const i of [11, 12, 23, 24]) {
  const v = new THREE.Vector3(girado[i].x, -girado[i].y, -girado[i].z).applyQuaternion(rot);
  girado[i] = { x: v.x, y: -v.y, z: -v.z, visibility: 0.95 };
}
for (let i = 0; i < 90; i++) rt.update(girado, screenPose(), 1 / 60);
rt.apply(); rig.root.updateMatrixWorld(true);
const q = new THREE.Quaternion();
rig.bones.Hips.getWorldQuaternion(q);
const f = new THREE.Vector3(0, 0, 1).applyQuaternion(q);
ok(Math.abs(deg(Math.atan2(f.x, f.z)) - 30) < 6, 'giro de cadera de 30° reproducido',
  deg(Math.atan2(f.x, f.z)) + '°');

// Con puntos poco fiables no debe romperse ni dar saltos.
const malos = mkPose(DE_PIE).map((p) => ({ ...p, visibility: 0.05 }));
const antes = rig.bones.LeftArm.quaternion.clone();
rt.update(malos, screenPose(), 1 / 60);
ok(!rt.valid, 'ignora capturas sin confianza');
rt.apply();
ok(rig.bones.LeftArm.quaternion.angleTo(antes) < 1e-6, 'la pose no salta cuando se pierde el cuerpo');

// --------------------------------------------------------------- gestos
console.log('\n== gestos ==');
const gr = new GestureReader();
const metricas = () => ({
  scale: 0.38, hipX: 0.5, hipYRaw: 0.55, hipY: 0.55, shoulderY: 0.35,
  wristL: new THREE.Vector3(0.9, -2.2, 0.1), wristR: new THREE.Vector3(-0.9, -2.2, 0.1),
  velL: new THREE.Vector3(), velR: new THREE.Vector3(),
  ankleL: new THREE.Vector3(0.3, -2.4, 0), ankleR: new THREE.Vector3(-0.3, -2.4, 0),
  ankleVelL: new THREE.Vector3(), ankleVelR: new THREE.Vector3(),
  lean: 0, crouchRatio: 1.0, torsoYaw: 0,
});
const reposo = (n = 20) => { for (let i = 0; i < n; i++) gr.read(metricas(), 1 / 30); };

reposo(40);
ok(!!gr.base, 'se autocalibra en ~1 s de pie');

let m = metricas();
m.wristL.set(0.2, -0.3, 1.4); m.velL.set(0, 0, 6.0);
let c = gr.read(m, 1 / 30);
ok(c.attack === 'cross_m', 'puño rapido al frente -> directo con esa mano', String(c.attack));

reposo();
m = metricas();
m.wristR.set(-0.3, -0.9, 1.2); m.velR.set(-3.4, 0, 2.0);
c = gr.read(m, 1 / 30);
ok(c.attack === 'hook_m', 'puño lateral -> gancho', String(c.attack));

reposo();
m = metricas();
m.wristR.set(-0.3, -0.6, 0.6); m.velR.set(0, 4.0, 1.0);
c = gr.read(m, 1 / 30);
ok(c.attack === 'uppercut', 'puño de abajo arriba -> gancho ascendente', String(c.attack));

reposo();
m = metricas();
m.ankleR.set(-0.3, -0.6, 0.9); m.ankleVelR.set(0, 0, 3.0);
c = gr.read(m, 1 / 30);
ok(c.attack === 'highKick', 'pierna alta al frente -> patada alta', String(c.attack));

reposo();
m = metricas();
m.ankleL.set(0.3, -1.3, 0.8); m.ankleVelL.set(0, 0, 2.5);
c = gr.read(m, 1 / 30);
ok(c.attack === 'lowKick_m', 'pierna baja al frente -> patada baja', String(c.attack));

reposo();
m = metricas();
m.wristL.set(0.5, -0.1, 0.3); m.wristR.set(-0.5, -0.1, 0.3);
ok(gr.read(m, 1 / 30).block === true, 'manos junto a la cara -> guardia');

m = metricas(); m.crouchRatio = 0.6;
ok(gr.read(m, 1 / 30).crouch === true, 'bajar el cuerpo -> agacharse');

m = metricas(); m.hipYRaw = 0.55 - 0.09;
ok(gr.read(m, 1 / 30).jump === true, 'subir el cuerpo -> salto');

m = metricas(); m.hipX = 0.62;
ok(gr.read(m, 1 / 30).moveX < -0.5, 'desplazarse a un lado mueve al luchador (espejo)');

// Un mismo golpe sostenido no se repite hasta recoger el brazo.
reposo();
m = metricas(); m.wristL.set(0.2, -0.3, 1.4); m.velL.set(0, 0, 6.0);
const primero = gr.read(m, 1 / 30).attack;
const segundo = gr.read(m, 1 / 30).attack;
ok(primero && !segundo, 'el brazo estirado no dispara golpes en cadena');

console.log(fails === 0 ? '\nTODO OK\n' : `\n${fails} FALLOS\n`);
process.exit(fails ? 1 : 0);
