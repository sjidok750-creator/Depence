import { TOWERS, towerTotalCost, SELL_RATIO } from '../data/towers.js';
import { TILE } from '../data/maps.js';
import { approachAngle, distSq } from '../core/util.js';
import { Arrow, Shell, Effect } from './projectile.js';

let nextId = 1;

export class Tower {
  constructor(typeId, c, r) {
    this.id = nextId++;
    this.type = typeId;
    this.def = TOWERS[typeId];
    this.c = c;
    this.r = r;
    this.x = (c + 0.5) * TILE;
    this.y = (r + 0.5) * TILE;
    this.level = 0;
    this.targetMode = 'first';
    this.cooldown = 0.2;
    this.angle = -Math.PI / 2;
    this.target = null;
    this.recoil = 0;
    this.buildAnim = 0; // 0..1 pop-in
    this.kills = 0;
    this.damageDealt = 0;
    this.invested = this.def.cost;
    this.charge = 0; // visual pulse for frost/tesla
  }

  get stats() {
    return this.def.levels[this.level];
  }

  get range() {
    return this.stats.range;
  }

  get canUpgrade() {
    return this.level < this.def.levels.length - 1;
  }

  get upgradeCost() {
    return this.canUpgrade ? this.def.levels[this.level + 1].cost : 0;
  }

  get sellValue() {
    return Math.floor(towerTotalCost(this.def, this.level) * SELL_RATIO);
  }

  upgrade() {
    if (!this.canUpgrade) return false;
    this.level++;
    this.invested += this.stats.cost;
    this.buildAnim = 0;
    return true;
  }

  canTarget(enemy) {
    if (!enemy.alive) return false;
    if (this.def.groundOnly && enemy.flying) return false;
    return distSq(this.x, this.y, enemy.x, enemy.y) <= this.range * this.range;
  }

  pickTarget(enemies) {
    let best = null;
    let bestScore = -Infinity;
    const mode = this.targetMode;
    for (const e of enemies) {
      if (!this.canTarget(e)) continue;
      let score;
      switch (mode) {
        case 'last':
          score = -e.progress;
          break;
        case 'strong':
          score = e.hp + (e.boss ? 1e9 : 0);
          break;
        case 'close':
          score = -distSq(this.x, this.y, e.x, e.y);
          break;
        default:
          score = e.progress;
      }
      if (score > bestScore) {
        bestScore = score;
        best = e;
      }
    }
    return best;
  }

  update(dt, game) {
    if (this.buildAnim < 1) this.buildAnim = Math.min(1, this.buildAnim + dt * 3);
    if (this.recoil > 0) this.recoil = Math.max(0, this.recoil - dt * 6);
    this.cooldown -= dt;
    const st = this.stats;

    if (this.def.kind === 'pulse') {
      this.charge = Math.max(0, 1 - Math.max(0, this.cooldown) * st.rate);
      if (this.cooldown <= 0) {
        const hit = game.enemies.filter((e) => this.canTarget(e));
        if (hit.length > 0) {
          this.cooldown = 1 / st.rate;
          for (const e of hit) {
            e.applySlow(st.slow, st.slowDuration);
            game.hitEnemy(e, st.damage, { source: this, pierce: true });
          }
          game.addEffect(new Effect('ring', { x: this.x, y: this.y, r: this.range, color: this.def.color }, 0.5));
          game.events.emit('shoot', { tower: this });
        }
      }
      return;
    }

    // Keep or re-acquire the target.
    if (!this.target || !this.canTarget(this.target)) this.target = this.pickTarget(game.enemies);
    if (this.target && this.def.turnSpeed > 0) {
      const desired = Math.atan2(this.target.y - this.y, this.target.x - this.x);
      this.angle = approachAngle(this.angle, desired, this.def.turnSpeed * dt);
    }
    if (!this.target || this.cooldown > 0) return;

    // Turret towers fire only when roughly facing the target.
    if (this.def.turnSpeed > 0) {
      const desired = Math.atan2(this.target.y - this.y, this.target.x - this.x);
      let d = desired - this.angle;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      if (Math.abs(d) > 0.25) return;
    }

    this.cooldown = 1 / st.rate;
    this.recoil = 1;
    game.events.emit('shoot', { tower: this });

    switch (this.def.kind) {
      case 'projectile': {
        game.addProjectile(new Arrow(this, this.target, st.damage));
        if (st.multishot > 1) {
          // Second arrow finds a different enemy when possible.
          const other = game.enemies.find((e) => e !== this.target && this.canTarget(e)) || this.target;
          game.addProjectile(new Arrow(this, other, st.damage));
        }
        break;
      }
      case 'artillery': {
        // Lead the target by its expected movement during the flight.
        const t = this.target;
        const lead = t.speed * st.flightTime * 0.9;
        const px = t.x + t.dx * lead;
        const py = t.y + t.dy * lead;
        game.addProjectile(new Shell(this, px, py, st.damage, st.splash));
        break;
      }
      case 'chain': {
        this.fireChain(game);
        break;
      }
      case 'hitscan': {
        const t = this.target;
        game.hitEnemy(t, st.damage, { source: this, pierce: st.armorPierce, bossBonus: st.bossBonus });
        game.addEffect(new Effect('tracer', { x1: this.x, y1: this.y - 18, x2: t.x, y2: t.y - 6, color: this.def.color }, 0.15));
        game.spawnHitSpark(t.x, t.y - 6, '#fff3c4', 6);
        break;
      }
    }
  }

  fireChain(game) {
    const st = this.stats;
    const chain = [this.target];
    const visited = new Set([this.target.id]);
    let current = this.target;
    for (let i = 1; i < st.chains; i++) {
      let best = null;
      let bestD = st.chainRange * st.chainRange;
      for (const e of game.enemies) {
        if (!e.alive || visited.has(e.id)) continue;
        const d = distSq(current.x, current.y, e.x, e.y);
        if (d < bestD) {
          bestD = d;
          best = e;
        }
      }
      if (!best) break;
      visited.add(best.id);
      chain.push(best);
      current = best;
    }
    let dmg = st.damage;
    let px = this.x;
    let py = this.y - 20;
    for (const e of chain) {
      game.hitEnemy(e, dmg, { source: this, pierce: true });
      game.addEffect(new Effect('bolt', { x1: px, y1: py, x2: e.x, y2: e.y - (e.flying ? 16 : 4), color: this.def.color, seed: Math.random() * 1000 }, 0.18));
      game.spawnHitSpark(e.x, e.y - 4, this.def.color, 2);
      px = e.x;
      py = e.y - 4;
      dmg *= st.falloff;
    }
  }
}
