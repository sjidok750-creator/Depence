import { ENEMIES, hpScale, rewardScale } from '../data/enemies.js';
import { GameMap } from './map.js';

let nextId = 1;

export class Enemy {
  constructor(type, path, wave, mods = {}) {
    const def = ENEMIES[type];
    this.id = nextId++;
    this.type = type;
    this.def = def;
    this.path = path;
    this.wave = wave;
    this.flying = !!def.flying;
    this.boss = !!def.boss;
    this.radius = def.radius;
    this.armor = def.armor;
    this.maxHp = Math.round(def.hp * hpScale(wave) * (mods.hpMult ?? 1) * (mods.hpScale ?? 1));
    this.hp = this.maxHp;
    this.baseSpeed = def.speed;
    this.reward = Math.round(def.reward * rewardScale(wave) * (mods.goldMult ?? 1) * (mods.rewardScale ?? 1));
    this.dist = mods.dist ?? 0;
    this.x = 0;
    this.y = 0;
    this.dx = 1;
    this.dy = 0;
    this.slow = 0; // fraction of speed removed
    this.slowTimer = 0;
    this.alive = true;
    this.reached = false;
    this.hitFlash = 0;
    this.age = 0;
    this.phase = Math.random() * Math.PI * 2; // animation offset
    this.facing = 1;
    this.heal = def.heal || 0;
    this.healRadius = def.healRadius || 0;
    this.healTick = 0;
    GameMap.sample(path, this.dist, this);
  }

  get progress() {
    return this.dist / this.path.length;
  }

  get speed() {
    return this.baseSpeed * (1 - this.slow);
  }

  applySlow(amount, duration) {
    // Keep the strongest slow; refresh the timer if equal or stronger.
    if (amount >= this.slow) {
      this.slow = amount;
      this.slowTimer = Math.max(this.slowTimer, duration);
    }
  }

  /** Returns actual damage dealt. */
  takeDamage(amount, { pierce = false, bossBonus = 1 } = {}) {
    if (!this.alive) return 0;
    let dmg = amount;
    if (this.boss) dmg *= bossBonus;
    if (!pierce) dmg = Math.max(1, dmg - this.armor);
    dmg = Math.min(dmg, this.hp);
    this.hp -= dmg;
    this.hitFlash = 0.12;
    if (this.hp <= 0) {
      this.hp = 0;
      this.alive = false;
    }
    return dmg;
  }

  update(dt) {
    if (!this.alive) return;
    this.age += dt;
    if (this.hitFlash > 0) this.hitFlash -= dt;
    if (this.slowTimer > 0) {
      this.slowTimer -= dt;
      if (this.slowTimer <= 0) {
        this.slow = 0;
        this.slowTimer = 0;
      }
    }
    this.dist += this.speed * dt;
    GameMap.sample(this.path, this.dist, this);
    if (Math.abs(this.dx) > 0.01) this.facing = Math.sign(this.dx);
    if (this.dist >= this.path.length) {
      this.reached = true;
      this.alive = false;
    }
  }
}
