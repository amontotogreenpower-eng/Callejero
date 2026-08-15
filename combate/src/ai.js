// ai.js — Oponente controlado por la maquina.

import { MOVES } from './moves.js';

const LEVELS = {
  facil: { react: 0.42, aggression: 0.35, blockChance: 0.25, comboChance: 0.10, idealRange: 1.45 },
  normal: { react: 0.26, aggression: 0.55, blockChance: 0.45, comboChance: 0.30, idealRange: 1.30 },
  duro: { react: 0.16, aggression: 0.75, blockChance: 0.68, comboChance: 0.55, idealRange: 1.20 },
};

const PICKS = [
  // El alcance sale de la posicion real del puño o el pie en el clip, mas
  // el avance del arranque (ver tests/animacion.test.mjs).
  { move: 'jab', range: 1.22, weight: 3 },
  { move: 'cross', range: 1.38, weight: 2.5 },
  { move: 'hook', range: 1.20, weight: 2 },
  { move: 'uppercut', range: 1.00, weight: 1.2 },
  { move: 'lowKick', range: 1.22, weight: 2 },
  { move: 'highKick', range: 1.62, weight: 1.6 },
];

export class AI {
  constructor(level = 'normal') {
    this.setLevel(level);
    this.timer = 0;
    this.plan = 'approach';
    this.blockHold = 0;
    this.cmd = { moveX: 0, crouch: false, jump: false, block: false, attack: null };
  }

  setLevel(level) {
    this.level = level;
    this.p = LEVELS[level] || LEVELS.normal;
  }

  /**
   * @param {number} dt
   * @param {import('./fighter.js').Fighter} me
   * @param {import('./fighter.js').Fighter} foe
   */
  update(dt, me, foe) {
    const c = this.cmd;
    c.attack = null; c.jump = false; c.crouch = false; c.block = false; c.moveX = 0;
    if (!me.alive || !foe.alive || me.state === 'ko' || me.state === 'win') return c;

    const dist = Math.abs(foe.pos.x - me.pos.x);
    const toFoe = Math.sign(foe.pos.x - me.pos.x) || 1;
    this.timer -= dt;
    this.blockHold -= dt;

    // Reaccion defensiva: el rival esta lanzando algo y estamos a tiro.
    if (foe.state === 'attack' && foe.move && dist < 1.9) {
      const incoming = foe.moveTime < foe.move.active;
      if (incoming && Math.random() < this.p.blockChance * dt * 6) {
        this.blockHold = foe.move.dur - foe.moveTime + 0.08;
        this.lowGuard = foe.move.height === 'bajo';
      }
    }
    if (this.blockHold > 0) {
      c.block = true;
      c.crouch = !!this.lowGuard;
      return c;
    }

    if (me.state === 'attack') {
      // Encadenar si el golpe conecto.
      if (me.hasHit && Math.random() < this.p.comboChance * dt * 10) {
        const cur = MOVES[me.moveName.replace(/_m$/, '')];
        if (cur && cur.chain && cur.chain.length) {
          c.attack = cur.chain[(Math.random() * cur.chain.length) | 0];
        }
      }
      return c;
    }

    if (this.timer <= 0) {
      this.timer = this.p.react * (0.6 + Math.random() * 0.8);
      const r = Math.random();
      if (dist < this.p.idealRange + 0.45 && r < this.p.aggression) this.plan = 'attack';
      else if (dist > this.p.idealRange + 0.5) this.plan = 'approach';
      else if (r > 0.85) this.plan = 'retreat';
      else this.plan = 'approach';
    }

    if (this.plan === 'attack') {
      const pick = this.choose(dist);
      if (pick) { c.attack = pick; this.plan = 'approach'; this.timer = this.p.react; return c; }
      this.plan = 'approach';
    }
    if (this.plan === 'approach') c.moveX = dist > this.p.idealRange ? toFoe : 0;
    else if (this.plan === 'retreat') c.moveX = -toFoe;
    return c;
  }

  choose(dist) {
    const ok = PICKS.filter((p) => dist <= p.range);
    if (!ok.length) return null;
    let total = 0;
    for (const p of ok) total += p.weight;
    let r = Math.random() * total;
    for (const p of ok) { r -= p.weight; if (r <= 0) return p.move; }
    return ok[0].move;
  }
}
