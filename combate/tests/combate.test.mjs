// Simulacion del combate sin navegador: maquina de estados, hitboxes e IA.

import * as THREE from 'three';
import { Fighter, ARENA_X, PUSH_RADIUS } from '../src/fighter.js';
import { checkHit, separate } from '../src/combat.js';
import { AI } from '../src/ai.js';

let fails = 0;
const ok = (c, m, x = '') => {
  console.log((c ? '  ok   ' : '  FAIL ') + m + (x ? ' — ' + x : ''));
  if (!c) fails++;
};

const scene = new THREE.Scene();
const paleta = { skin: 0xe8b58c, trunk: 0xb02a3a, accent: 0xffd75a };
const a = new Fighter(scene, { name: 'A', palette: paleta });
const b = new Fighter(scene, { name: 'B', palette: paleta });
const dt = 1 / 60;

const stats = { hits: 0, blocks: 0, swings: 0, kos: 0, maxCombo: 0, moves: new Set() };
a.onEvent = b.onEvent = (e) => { if (e.type === 'swing') { stats.swings++; stats.moves.add(e.move.clip); } };

function golpear(att, def) {
  const r = checkHit(att, def);
  if (!r) return;
  att.hasHit = true;
  def.receive(r.move, att, r.blocked);
  if (r.blocked) { stats.blocks++; att.combo = 0; }
  else {
    stats.hits++; att.combo++; att.comboTimer = 1.3;
    stats.maxCombo = Math.max(stats.maxCombo, att.combo);
  }
}

const quieto = { moveX: 0, crouch: false, jump: false, block: false, attack: null };
const cubierto = { ...quieto, block: true };
const agachado = { ...quieto, crouch: true };

function pelea(cmdA, cmdB, frames) {
  for (let i = 0; i < frames; i++) {
    a.update(dt, cmdA, b);
    b.update(dt, cmdB, a);
    golpear(a, b); golpear(b, a);
  }
}

// ------------------------------------------------------------ IA contra IA
console.log('\n== 12 rondas de IA contra IA ==');
const ia1 = new AI('duro'); const ia2 = new AI('normal');
let nan = 0, fuera = 0, agotadas = 0;

for (let ronda = 0; ronda < 12; ronda++) {
  a.reset(-2.1, 1); b.reset(2.1, -1);
  let t = 0;
  while (t < 60) {
    t += dt;
    a.update(dt, ia1.update(dt, a, b), b);
    b.update(dt, ia2.update(dt, b, a), a);
    golpear(a, b); golpear(b, a);
    separate(a, b, PUSH_RADIUS, ARENA_X);
    a.syncTransform(); b.syncTransform();
    for (const f of [a, b]) {
      if (!isFinite(f.pos.x + f.pos.y + f.hp)) nan++;
      if (Math.abs(f.pos.x) > ARENA_X + 0.01 || f.pos.y < -0.01 || f.pos.y > 4) fuera++;
    }
    if (!a.alive || !b.alive) { stats.kos++; break; }
  }
  if (t >= 60) agotadas++;
}

console.log(`  golpes=${stats.hits} bloqueos=${stats.blocks} lanzados=${stats.swings} ` +
  `KO=${stats.kos} agotadas=${agotadas} combo max=${stats.maxCombo}`);
console.log('  repertorio: ' + [...stats.moves].sort().join(', '));

ok(nan === 0, 'sin NaN en posicion ni vida');
ok(fuera === 0, 'los luchadores no salen del escenario ni atraviesan el suelo');
ok(stats.swings > 200, 'la IA ataca con frecuencia', String(stats.swings));
ok(stats.hits > 50, 'los golpes conectan', String(stats.hits));
ok(stats.blocks > 5, 'la IA bloquea', String(stats.blocks));
ok(stats.kos >= 9, 'casi todas las rondas terminan en KO', `${stats.kos}/12`);
ok(stats.moves.size >= 5, 'se usa todo el repertorio', String(stats.moves.size));
ok(stats.maxCombo >= 2, 'se encadenan combos', String(stats.maxCombo));

// ------------------------------------------------------------ marcha
console.log('\n== marcha ==');
// En una marcha correcta siempre hay un pie practicamente quieto respecto al
// suelo. Si la zancada no encaja con el avance, los dos pies se arrastran.
function deslizamiento(dirX) {
  const w = new Fighter(scene, { name: 'W', palette: paleta });
  // Se arranca en un extremo para que no tope con el borde del escenario
  // durante la medida (topar frenaria el cuerpo y falsearia el resultado).
  w.reset(dirX > 0 ? -5 : 5, 1);
  const cmd = { moveX: dirX, crouch: false, jump: false, block: false, attack: null };
  for (let i = 0; i < 40; i++) w.update(dt, cmd, null);
  const v = [];
  let pL = null, pR = null;
  let recorrido = 0;
  const x0 = w.pos.x;
  const N = 120;
  for (let i = 0; i < N; i++) {
    w.update(dt, cmd, null);
    const L = w.rig.bones.LeftFoot.getWorldPosition(new THREE.Vector3()).x;
    const R = w.rig.bones.RightFoot.getWorldPosition(new THREE.Vector3()).x;
    if (pL !== null) v.push(Math.min(Math.abs(L - pL), Math.abs(R - pR)) / dt);
    pL = L; pR = R;
  }
  recorrido = Math.abs(w.pos.x - x0);
  v.sort((a, b) => a - b);
  return { mediana: v[v.length >> 1], velocidadCuerpo: recorrido / (N * dt) };
}
const adelante = deslizamiento(1);
const atras = deslizamiento(-1);
console.log(`  arrastre del pie apoyado: adelante ${adelante.mediana.toFixed(2)} m/s, ` +
  `atras ${atras.mediana.toFixed(2)} m/s (el cuerpo va a ${adelante.velocidadCuerpo.toFixed(2)})`);
ok(adelante.mediana < adelante.velocidadCuerpo * 0.25,
  'andando hacia delante el pie de apoyo no patina', adelante.mediana.toFixed(2) + ' m/s');
ok(atras.mediana < atras.velocidadCuerpo * 0.25,
  'andando hacia atras tampoco', atras.mediana.toFixed(2) + ' m/s');

// ------------------------------------------------------------ reglas
console.log('\n== reglas de daño ==');

function probar(golpe, cmdDef, xA = -0.75, xB = 0.15) {
  a.reset(xA, 1); b.reset(xB, -1);
  if (cmdDef.block) { b.blocking = true; b.state = 'block'; }
  const hp = b.hp;
  a.startMove(golpe);
  pelea(quieto, cmdDef, 55);
  return hp - b.hp;
}

ok(probar('cross', quieto) === 9, 'directo limpio quita 9 pv');
ok(probar('jab', quieto) === 5, 'jab limpio quita 5 pv');
ok(probar('highKick', quieto) === 16, 'patada alta limpia quita 16 pv');
const chip = probar('cross', cubierto);
ok(chip > 0 && chip <= 2, 'bloquear deja el daño en un arañazo', chip + ' pv');
ok(probar('uppercut', agachado) === 0, 'agacharse esquiva los golpes altos');
ok(probar('lowKick', cubierto) === 8, 'la patada baja atraviesa la guardia alta');
ok(probar('lowKick', { ...cubierto, crouch: true }) <= 2, 'agachado y cubierto si para la patada baja');

// Fuera de alcance no debe conectar nada.
ok(probar('jab', quieto, -3.2, 3.2) === 0, 'a distancia larga los golpes no llegan');

// ------------------------------------------------------------ estados
console.log('\n== maquina de estados ==');
a.reset(-0.75, 1); b.reset(0.15, -1);
a.startMove('cross');
pelea(quieto, quieto, 14);
ok(b.state === 'hitstun', 'el impactado entra en aturdimiento', b.state);
pelea(quieto, quieto, 40);
ok(b.state !== 'hitstun', 'el aturdimiento termina solo', b.state);

a.reset(-0.75, 1); b.reset(0.15, -1);
b.hp = 4;
a.startMove('highKick');
pelea(quieto, quieto, 60);
ok(b.state === 'ko' && b.hp === 0, 'la vida a cero manda al KO', `${b.state}/${b.hp}`);
b.update(dt, { ...quieto, attack: 'jab' }, a);
ok(b.state === 'ko', 'en KO no se puede atacar');

a.reset(-2, 1); b.reset(2, -1);
a.update(dt, { ...quieto, jump: true }, b);
for (let i = 0; i < 6; i++) a.update(dt, quieto, b);
ok(a.pos.y > 0.1 && a.state === 'air', 'el salto despega', a.pos.y.toFixed(2));
for (let i = 0; i < 90; i++) a.update(dt, quieto, b);
ok(Math.abs(a.pos.y) < 1e-3 && a.state !== 'air', 'y vuelve al suelo', a.pos.y.toFixed(4));

a.reset(-2, 1); b.reset(2, -1);
ok(a.facing === 1 && b.facing === -1, 'los luchadores se miran al empezar');
a.pos.x = 3; a.update(dt, quieto, b);
ok(a.facing === -1, 'al cruzarse se dan la vuelta');

// El golpe empuja al rival hacia atras.
a.reset(-0.75, 1); b.reset(0.15, -1);
const xAntes = b.pos.x;
a.startMove('highKick');
pelea(quieto, quieto, 55);
ok(b.pos.x - xAntes > 0.15, 'el impacto empuja al rival hacia atras',
  (b.pos.x - xAntes).toFixed(2) + ' m');

// Empuje: nunca se atraviesan.
a.reset(-0.1, 1); b.reset(0.1, -1);
separate(a, b, PUSH_RADIUS, ARENA_X);
ok(Math.abs(a.pos.x - b.pos.x) >= PUSH_RADIUS * 2 - 1e-6, 'el empuje evita que se solapen',
  Math.abs(a.pos.x - b.pos.x).toFixed(2));

console.log(fails === 0 ? '\nTODO OK\n' : `\n${fails} FALLOS\n`);
process.exit(fails ? 1 : 0);
