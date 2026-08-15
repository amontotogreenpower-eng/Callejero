// fighter.js — Entidad luchador: fisica, maquina de estados y cajas de golpeo.

import * as THREE from 'three';
import { buildSkeleton, computeRestState, buildMannequin } from './rig.js';
import { Animator } from './animator.js';
import { MOVES } from './moves.js';

export const ARENA_X = 5.4;      // limite lateral del escenario
export const PUSH_RADIUS = 0.52; // radio del "pushbox"
const GRAVITY = 22;
const JUMP_VEL = 6.6;
const WALK_FWD = 2.7;
const WALK_BACK = 2.1;
const GROUND_FRICTION = 9;  // frenado del retroceso en el suelo (1/s)

const _v = new THREE.Vector3();

// Esferas de daño: hueso, radio y altura logica.
const HURT = [
  { bone: 'Head', r: 0.17, zone: 'alto' },
  { bone: 'Spine2', r: 0.24, zone: 'medio' },
  { bone: 'Spine', r: 0.25, zone: 'medio' },
  { bone: 'Hips', r: 0.24, zone: 'bajo' },
  { bone: 'LeftLeg', r: 0.17, zone: 'bajo' },
  { bone: 'RightLeg', r: 0.17, zone: 'bajo' },
];

export class Fighter {
  /**
   * @param {THREE.Scene} scene
   * @param {{name:string, palette:object, rig?:object, maxHp?:number}} opts
   */
  constructor(scene, opts) {
    this.name = opts.name;
    this.maxHp = opts.maxHp || 100;
    this.hp = this.maxHp;

    if (opts.rig) {
      this.rig = opts.rig;
      this.group = new THREE.Group();
      this.group.add(opts.rig.object || opts.rig.root);
    } else {
      this.rig = buildSkeleton();
      computeRestState(this.rig);
      this.group = buildMannequin(this.rig, opts.palette);
    }
    scene.add(this.group);

    this.animator = new Animator(this.rig);

    // Estado fisico
    this.pos = new THREE.Vector3(0, 0, 0);
    this.vel = new THREE.Vector3(0, 0, 0);
    this.facing = 1;

    // Estado logico
    this.state = 'idle';        // idle | walk | crouch | air | block | attack | hitstun | ko | win
    this.stateTime = 0;
    this.move = null;           // Move activo
    this.moveName = null;
    this.moveTime = 0;
    this.hasHit = false;
    this.stun = 0;
    this.blocking = false;
    this.crouching = false;
    this.combo = 0;
    this.comboTimer = 0;
    this.chainFrom = null;      // encadenado permitido tras conectar
    this.hitFlash = 0;

    // Origen de pose externo (captura de movimiento). Se llama antes de
    // aplicar la animacion; debe escribir cuaterniones en los huesos.
    this.poseSource = null;
    this.mocapActive = false;

    this.onEvent = () => {};
  }

  reset(x, facing, hp = this.maxHp) {
    this.pos.set(x, 0, 0);
    this.vel.set(0, 0, 0);
    this.facing = facing;
    this.hp = hp;
    this.state = 'idle';
    this.stateTime = 0;
    this.move = null; this.moveName = null; this.moveTime = 0; this.hasHit = false;
    this.stun = 0; this.combo = 0; this.comboTimer = 0; this.chainFrom = null;
    this.blocking = false; this.crouching = false; this.hitFlash = 0;
    this.animator.play('idle', { fade: 0 });
    this.syncTransform();
  }

  get grounded() { return this.pos.y <= 1e-4; }
  get alive() { return this.hp > 0; }
  get busy() { return this.state === 'attack' || this.state === 'hitstun' || this.state === 'ko'; }

  /** ¿Puede iniciar un ataque ahora mismo? */
  canAct() {
    if (this.state === 'ko' || this.state === 'hitstun' || this.state === 'win') return false;
    if (this.state !== 'attack') return true;
    // Cancelacion: solo tras conectar y dentro de la recuperacion.
    if (!this.hasHit || !this.move) return false;
    return this.moveTime >= this.move.active && this.moveTime <= this.move.dur * 0.85;
  }

  startMove(name) {
    const mv = MOVES[name];
    if (!mv) return false;
    if (this.state === 'attack' && this.chainFrom) {
      const allowed = MOVES[this.chainFrom] ? MOVES[this.chainFrom].chain : null;
      const base = name.replace(/_m$/, '');
      if (!allowed || !allowed.includes(base)) return false;
    } else if (!this.canAct()) {
      return false;
    }
    this.state = 'attack';
    this.stateTime = 0;
    this.move = mv;
    this.moveName = name;
    this.moveTime = 0;
    this.hasHit = false;
    this.chainFrom = null;
    this.animator.play(mv.clip, { fade: 0.05, restart: true });
    this.onEvent({ type: 'swing', move: mv, fighter: this });
    return true;
  }

  /**
   * @param {number} dt
   * @param {{moveX:number, crouch:boolean, jump:boolean, block:boolean, attack:string|null}} cmd
   * @param {Fighter} opp
   */
  update(dt, cmd, opp) {
    this.stateTime += dt;
    this.comboTimer = Math.max(0, this.comboTimer - dt);
    if (this.comboTimer === 0) this.combo = 0;
    this.hitFlash = Math.max(0, this.hitFlash - dt * 6);

    if (this.state === 'ko') {
      this.applyPhysics(dt, 0);
      this.stepAnim(dt);
      return;
    }
    if (this.state === 'win') {
      this.animator.play('win', { fade: 0.25 });
      this.stepAnim(dt);
      this.syncTransform();
      return;
    }

    // Mirar siempre al rival mientras no se este atacando.
    if (opp && this.state !== 'attack' && this.grounded) {
      const want = opp.pos.x >= this.pos.x ? 1 : -1;
      if (want !== this.facing && this.state !== 'hitstun') this.facing = want;
    }

    if (this.state === 'hitstun') {
      this.stun -= dt;
      if (this.stun <= 0 && this.grounded) this.toIdle();
      this.applyPhysics(dt, 0);
      this.stepAnim(dt);
      return;
    }

    if (this.state === 'attack') {
      this.moveTime += dt;
      const mv = this.move;
      // Avance del atacante durante el arranque.
      const drive = this.grounded && this.moveTime < mv.active ? mv.advance : 0;
      this.applyPhysics(dt, drive * this.facing);
      if (cmd && cmd.attack && this.hasHit) {
        // Encadenado con cancelacion.
        this.chainFrom = this.moveName.replace(/_m$/, '');
        if (this.startMove(cmd.attack)) { this.stepAnim(dt); return; }
      }
      if (this.moveTime >= mv.dur) this.toIdle();
      this.stepAnim(dt);
      return;
    }

    // --- Estados libres ------------------------------------------------
    const c = cmd || { moveX: 0, crouch: false, jump: false, block: false, attack: null };

    if (c.attack && this.startMove(c.attack)) { this.stepAnim(dt); return; }

    if (!this.grounded) {
      this.state = 'air';
      this.blocking = false;
      this.crouching = false;
      this.animator.play('air', { fade: 0.10 });
      this.applyPhysics(dt, c.moveX * WALK_FWD * 0.75);
      this.stepAnim(dt);
      return;
    }

    if (c.jump) {
      this.vel.y = JUMP_VEL;
      this.state = 'air';
      this.animator.play('air', { fade: 0.08 });
      this.applyPhysics(dt, c.moveX * WALK_FWD * 0.75);
      this.stepAnim(dt);
      return;
    }

    this.crouching = !!c.crouch;
    this.blocking = !!c.block;

    if (this.blocking) {
      this.state = 'block';
      this.animator.play('block', { fade: 0.10 });
      this.applyPhysics(dt, 0);
    } else if (this.crouching) {
      this.state = 'crouch';
      this.animator.play('crouch', { fade: 0.12 });
      this.applyPhysics(dt, 0);
    } else if (Math.abs(c.moveX) > 0.15) {
      this.state = 'walk';
      const forward = Math.sign(c.moveX) === this.facing;
      const spd = forward ? WALK_FWD : WALK_BACK;
      this.animator.play('walk', { fade: 0.12, speed: forward ? 1.15 : -1.0 });
      this.applyPhysics(dt, Math.sign(c.moveX) * spd);
    } else {
      this.state = 'idle';
      this.animator.play('idle', { fade: 0.15 });
      this.applyPhysics(dt, 0);
    }
    this.stepAnim(dt);
  }

  toIdle() {
    this.state = 'idle';
    this.stateTime = 0;
    this.move = null; this.moveName = null; this.moveTime = 0; this.hasHit = false;
    this.chainFrom = null;
    this.animator.play('idle', { fade: 0.14 });
  }

  applyPhysics(dt, vx) {
    // Con orden de movimiento manda la orden; si no, el impulso residual
    // (retroceso de un golpe) se frena por rozamiento en vez de cortarse en
    // seco, que es lo que hace que los impactos empujen de verdad.
    if (vx !== 0) this.vel.x = vx;
    else if (this.grounded) this.vel.x *= Math.max(0, 1 - dt * GROUND_FRICTION);
    this.pos.x += this.vel.x * dt;
    this.pos.y += this.vel.y * dt;
    if (this.pos.y > 0) this.vel.y -= GRAVITY * dt;
    else {
      this.pos.y = 0;
      if (this.vel.y < 0) {
        this.vel.y = 0;
        if (this.state === 'air') this.toIdle();
      }
    }
    if (this.pos.y <= 0 && this.vel.y > 0) this.pos.y = 1e-4;
    this.pos.x = THREE.MathUtils.clamp(this.pos.x, -ARENA_X, ARENA_X);
  }

  /** Avanza el animador, aplica la pose (mezclando con la captura) y coloca el grupo. */
  stepAnim(dt) {
    this.animator.update(dt);

    let weight = 1;
    if (this.poseSource && this.mocapActive) {
      const ok = this.poseSource(this.rig, this);
      if (ok) {
        // Durante ataques y reacciones manda la animacion; el resto del tiempo
        // manda el cuerpo del jugador.
        weight = (this.state === 'attack') ? 0.88
          : (this.state === 'hitstun' || this.state === 'ko' || this.state === 'win') ? 1
            : 0.14;
      }
    }
    this.animator.applyTo(weight);
    this.syncTransform();
  }

  syncTransform() {
    this.group.position.set(this.pos.x, this.pos.y, this.pos.z);
    this.group.rotation.y = this.facing * Math.PI / 2;
    this.group.updateMatrixWorld(true);
  }

  /** Posicion en el mundo del hueso indicado. */
  bonePos(name, out = _v) {
    const b = this.rig.bones[name];
    if (!b) return out.set(this.pos.x, 1, 0);
    return b.getWorldPosition(out);
  }

  /** Esferas de daño en coordenadas de mundo. */
  hurtSpheres(out = []) {
    out.length = 0;
    for (const h of HURT) {
      const b = this.rig.bones[h.bone];
      if (!b) continue;
      const p = b.getWorldPosition(new THREE.Vector3());
      out.push({ p, r: h.r, zone: h.zone });
    }
    return out;
  }

  /** ¿Esta bloqueando un golpe de esta altura y viniendo de este lado? */
  blocksAgainst(move, fromX) {
    if (!this.blocking && this.state !== 'block') return false;
    const towardAttacker = Math.sign(fromX - this.pos.x) === this.facing;
    if (!towardAttacker) return false;
    if (move.height === 'bajo') return this.crouching;
    if (move.height === 'alto') return !this.crouching;
    return true;
  }

  receive(move, attacker, blocked) {
    const dir = Math.sign(this.pos.x - attacker.pos.x) || attacker.facing;
    if (blocked) {
      this.hp = Math.max(0, this.hp - Math.max(1, Math.round(move.damage * 0.14)));
      this.pos.x = THREE.MathUtils.clamp(this.pos.x + dir * 0.08, -ARENA_X, ARENA_X);
      this.stun = Math.max(this.stun, move.hitstun * 0.55);
      this.state = 'block';
      this.hitFlash = 0.5;
      return;
    }
    this.hp = Math.max(0, this.hp - move.damage);
    this.hitFlash = 1;
    this.vel.x = dir * move.knockback;
    if (move.launch > 0) { this.vel.y = move.launch; this.pos.y = Math.max(this.pos.y, 1e-3); }
    this.move = null; this.moveName = null; this.hasHit = false;

    if (this.hp <= 0) {
      this.state = 'ko';
      this.stateTime = 0;
      this.animator.play('ko', { fade: 0.05, restart: true });
      this.vel.x = dir * (move.knockback + 1.4);
      return;
    }
    this.state = 'hitstun';
    this.stun = move.hitstun;
    this.animator.play(move.height === 'bajo' ? 'hitLow' : 'hitHigh', { fade: 0.04, restart: true });
  }

  celebrate() {
    if (this.state === 'ko') return;
    this.state = 'win';
    this.stateTime = 0;
    this.animator.play('win', { fade: 0.3 });
  }

  setColorPulse() {
    const mats = this.group.userData.materials;
    if (!mats) return;
    const f = this.hitFlash;
    const boost = f * 0.32;
    for (const m of Object.values(mats)) {
      if (!m.emissive) continue;
      m.emissive.setRGB(boost, boost * 0.25, boost * 0.15);
    }
  }
}
