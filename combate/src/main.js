// main.js — Montaje del juego: bucle, rondas y conexion entre modulos.

import * as THREE from 'three';
import { Stage } from './stage.js';
import { Fighter, ARENA_X, PUSH_RADIUS } from './fighter.js';
import { checkHit, separate } from './combat.js';
import { Input, KEYMAP_P1, KEYMAP_P2 } from './input.js';
import { AI } from './ai.js';
import { Mocap } from './mocap.js';
import { Retargeter } from './retarget.js';
import { GestureReader } from './gestures.js';
import { HUD } from './hud.js';
import { Audio } from './audio.js';
import { loadMixamoCharacter } from './rig.js';

const ROUND_TIME = 60;
const ROUNDS_TO_WIN = 2;
const START_X = 2.1;

const PALETTES = {
  rojo: { skin: 0xe8b58c, trunk: 0xb02a3a, accent: 0xffd75a },
  azul: { skin: 0xd9a877, trunk: 0x2a4fb0, accent: 0x3bffd1 },
};

const canvas = document.getElementById('gl');
const stage = new Stage(canvas);
const hud = new HUD(document);
const audio = new Audio();

const p1 = new Fighter(stage.scene, { name: 'ROJO', palette: PALETTES.rojo });
const p2 = new Fighter(stage.scene, { name: 'AZUL', palette: PALETTES.azul });
hud.setNames(p1.name, p2.name);

const in1 = new Input(KEYMAP_P1);
const in2 = new Input(KEYMAP_P2);
const ai = new AI('normal');

const mocap = new Mocap({ onStatus: (s) => hud.mocap(s, null) });
let retarget = new Retargeter(p1.rig, { smooth: 0.055 });
const gestures = new GestureReader();
p1.poseSource = () => retarget.apply();

const game = {
  mode: 'cpu',          // 'cpu' | 'local'
  state: 'menu',        // menu | intro | fight | roundEnd | matchEnd
  timer: ROUND_TIME,
  phase: 0,
  round: 1,
  wins: [0, 0],
  hitstop: 0,
  useMocap: false,
};

// ---------------------------------------------------------------------------
// Rondas
// ---------------------------------------------------------------------------

function startMatch(mode, difficulty, useMocap) {
  game.mode = mode;
  game.useMocap = useMocap;
  game.wins = [0, 0];
  game.round = 1;
  ai.setLevel(difficulty);
  hud.setRounds(0, 0, ROUNDS_TO_WIN);
  startRound();
}

function startRound() {
  p1.reset(-START_X, 1);
  p2.reset(START_X, -1);
  game.timer = ROUND_TIME;
  game.state = 'intro';
  game.phase = 0;
  hud.message('RONDA ' + game.round, 1.0);
  audio.bell();
}

function endRound(winner) {
  game.state = 'roundEnd';
  game.phase = 0;
  if (winner === 0 || winner === 1) {
    game.wins[winner]++;
    hud.setRounds(game.wins[0], game.wins[1], ROUNDS_TO_WIN);
    const w = winner === 0 ? p1 : p2;
    const l = winner === 0 ? p2 : p1;
    w.celebrate();
    hud.message(l.hp <= 0 ? '¡K.O.!' : 'TIEMPO', 1.6, 'big');
    if (l.hp <= 0) audio.ko();
  } else {
    hud.message('EMPATE', 1.6, 'big');
  }
  stage.addShake(0.5);
}

function nextAfterRound() {
  if (game.wins[0] >= ROUNDS_TO_WIN || game.wins[1] >= ROUNDS_TO_WIN) {
    game.state = 'matchEnd';
    game.phase = 0;
    const champ = game.wins[0] > game.wins[1] ? p1.name : p2.name;
    hud.message(champ + ' GANA EL COMBATE', 3.2, 'big');
    return;
  }
  game.round++;
  startRound();
}

// ---------------------------------------------------------------------------
// Impactos
// ---------------------------------------------------------------------------

function tryHit(att, def) {
  const r = checkHit(att, def);
  if (!r) return;
  att.hasHit = true;

  if (r.blocked) {
    def.receive(r.move, att, true);
    audio.block();
    stage.burst(r.point, 0x9fd8ff, 9, 2.4);
    stage.addShake(0.14);
    game.hitstop = Math.max(game.hitstop, 0.035);
    att.combo = 0;
  } else {
    def.receive(r.move, att, false);
    audio.hit(r.move.sfx);
    stage.burst(r.point, 0xffd75a, 16, 3.6);
    stage.addShake(0.22 + r.move.damage * 0.018);
    game.hitstop = Math.max(game.hitstop, 0.045 + r.move.damage * 0.0035);
    att.combo++;
    att.comboTimer = 1.3;
    def.combo = 0;
  }
}

// ---------------------------------------------------------------------------
// Bucle
// ---------------------------------------------------------------------------

let last = performance.now();
let previewTick = 0;

function frame(now) {
  requestAnimationFrame(frame);
  let dt = Math.min(0.05, (now - last) / 1000);
  last = now;

  // Captura de movimiento (se actualiza siempre que este activa)
  let gcmd = null;
  if (game.useMocap && mocap.running) {
    if (mocap.update() && mocap.world) {
      retarget.update(mocap.world, mocap.landmarks, dt);
      gcmd = gestures.read(retarget.metrics, dt);
      p1.mocapActive = retarget.valid;
    }
    if (++previewTick % 2 === 0) hud.drawPreview(mocap);
    const age = (performance.now() - gestures.lastAt) / 1000;
    hud.mocap(
      retarget.valid ? `captura ok · ${mocap.fps.toFixed(0)} fps` : 'buscando cuerpo…',
      age < 1.1 ? gestures.last : '—');
  } else {
    p1.mocapActive = false;
  }

  if (game.state === 'fight' || game.state === 'intro' || game.state === 'roundEnd' || game.state === 'matchEnd') {
    step(dt, gcmd);
  }

  for (const f of [p1, p2]) f.setColorPulse();
  stage.update(dt, p1, p2);
  hud.update(dt, p1, p2, game.timer);
  stage.render();
}

function step(dt, gcmd) {
  // Congelacion de impacto: da peso a los golpes.
  if (game.hitstop > 0) {
    game.hitstop -= dt;
    return;
  }

  game.phase += dt;

  if (game.state === 'intro') {
    if (game.phase > 1.1) { game.state = 'fight'; hud.message('¡PELEA!', 0.8, 'big'); }
    p1.update(dt, null, p2);
    p2.update(dt, null, p1);
    return;
  }

  if (game.state === 'roundEnd') {
    p1.update(dt, null, p2);
    p2.update(dt, null, p1);
    if (game.phase > 2.6) nextAfterRound();
    return;
  }

  if (game.state === 'matchEnd') {
    p1.update(dt, null, p2);
    p2.update(dt, null, p1);
    if (game.phase > 4.0) showMenu();
    return;
  }

  // --- Combate ---
  const kb1 = in1.read(dt);
  const cmd1 = gcmd ? mergeCmd(kb1, gcmd) : kb1;
  const cmd2 = game.mode === 'local' ? in2.read(dt) : ai.update(dt, p2, p1);

  p1.update(dt, cmd1, p2);
  p2.update(dt, cmd2, p1);

  tryHit(p1, p2);
  tryHit(p2, p1);
  separate(p1, p2, PUSH_RADIUS, ARENA_X);
  p1.syncTransform();
  p2.syncTransform();

  game.timer -= dt;
  if (!p1.alive || !p2.alive) {
    endRound(!p1.alive && !p2.alive ? -1 : (p1.alive ? 0 : 1));
  } else if (game.timer <= 0) {
    const f1 = p1.hp / p1.maxHp, f2 = p2.hp / p2.maxHp;
    endRound(Math.abs(f1 - f2) < 0.01 ? -1 : (f1 > f2 ? 0 : 1));
  }
}

function mergeCmd(kb, g) {
  return {
    moveX: kb.moveX !== 0 ? kb.moveX : g.moveX,
    crouch: kb.crouch || g.crouch,
    jump: kb.jump || g.jump,
    block: kb.block || g.block,
    attack: kb.attack || g.attack,
  };
}

// ---------------------------------------------------------------------------
// Menu y ajustes
// ---------------------------------------------------------------------------

const menu = document.getElementById('menu');
const panel = document.getElementById('panel');
const touch = document.getElementById('touch');
in1.bindTouch(touch);

function showMenu() {
  game.state = 'menu';
  menu.classList.remove('hidden');
  hud.clearMessage();
}

async function launch(useMocap) {
  audio.resume();
  const diff = document.getElementById('diff').value;
  const mode = document.getElementById('twoPlayers').checked ? 'local' : 'cpu';

  if (useMocap && !mocap.running) {
    hud.mocap('iniciando camara…', '—');
    const ok = await mocap.start();
    if (!ok) {
      hud.message('Sin camara: se juega con teclado', 2.2);
      useMocap = false;
    }
  }
  panel.classList.toggle('hidden', !useMocap);
  menu.classList.add('hidden');
  startMatch(mode, diff, useMocap);
}

document.getElementById('btnPlay').addEventListener('click', () => launch(false));
document.getElementById('btnCam').addEventListener('click', () => launch(true));
document.getElementById('btnCal').addEventListener('click', () => {
  if (retarget.valid) { gestures.calibrate(retarget.metrics); hud.message('Postura calibrada', 1.0); }
  else hud.message('No te veo: sitúate ante la camara', 1.4);
});
document.getElementById('btnMirror').addEventListener('click', (e) => {
  retarget.sx *= -1;
  e.target.textContent = 'Espejo: ' + (retarget.sx < 0 ? 'ON' : 'OFF');
});

document.getElementById('btnFlip').addEventListener('click', () => {
  const obj = p1.rig.object || p1.rig.root;
  obj.rotation.y += Math.PI;
});

document.getElementById('glb').addEventListener('change', async (e) => {
  const file = e.target.files && e.target.files[0];
  if (!file) return;
  const url = URL.createObjectURL(file);
  try {
    hud.message('Cargando personaje…', 1.5);
    const rig = await loadMixamoCharacter(url, 1.75);
    swapRig(p1, rig);
    hud.message('Personaje Mixamo cargado', 1.6);
  } catch (err) {
    console.error(err);
    hud.message('GLB no valido: ' + err.message, 2.4);
  } finally {
    URL.revokeObjectURL(url);
  }
});

/** Sustituye el muñeco de un luchador por un personaje Mixamo importado. */
function swapRig(fighter, rig) {
  stage.scene.remove(fighter.group);
  fighter.rig = rig;
  fighter.group = new THREE.Group();
  fighter.group.add(rig.object || rig.root);
  stage.scene.add(fighter.group);
  fighter.animator.rig = rig;
  fighter.animator.play('idle', { fade: 0, restart: true });
  if (fighter === p1) {
    const sx = retarget.sx;
    retarget = new Retargeter(rig, { smooth: 0.055 });
    retarget.sx = sx;
  }
  fighter.syncTransform();
}

window.addEventListener('keydown', (e) => {
  if (e.code === 'Escape') showMenu();
  if (e.code === 'KeyR' && game.state !== 'menu') startRound();
});

function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  stage.resize(w, h);
}
window.addEventListener('resize', resize);
resize();

hud.setRounds(0, 0, ROUNDS_TO_WIN);
requestAnimationFrame(frame);
