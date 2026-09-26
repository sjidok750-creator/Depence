import { distSq } from '../core/util.js';

let nextId = 1;

/** Homing arrow. Always resolves against its target unless the target dies. */
export class Arrow {
  constructor(tower, target, damage) {
    this.id = nextId++;
    this.kind = 'arrow';
    this.x = tower.x;
    this.y = tower.y - 14;
    this.target = target;
    this.damage = damage;
    this.speed = tower.stats.projectileSpeed;
    this.angle = Math.atan2(target.y - this.y, target.x - this.x);
    this.tx = target.x;
    this.ty = target.y;
    this.alive = true;
    this.age = 0;
    this.color = tower.def.color;
  }

  update(dt, game) {
    this.age += dt;
    if (this.target.alive) {
      this.tx = this.target.x;
      this.ty = this.target.y - (this.target.flying ? 18 : 6);
    }
    const dx = this.tx - this.x;
    const dy = this.ty - this.y;
    const d = Math.hypot(dx, dy);
    const step = this.speed * dt;
    if (d <= step + 4) {
      this.alive = false;
      if (this.target.alive) game.hitEnemy(this.target, this.damage, { source: 'archer' });
      game.spawnHitSpark(this.tx, this.ty, this.color, 3);
      return;
    }
    this.angle = Math.atan2(dy, dx);
    this.x += (dx / d) * step;
    this.y += (dy / d) * step;
    if (this.age > 3) this.alive = false;
  }
}

/** Lobbed cannonball with a fixed flight time; explodes where it lands. */
export class Shell {
  constructor(tower, targetX, targetY, damage, splash) {
    this.id = nextId++;
    this.kind = 'shell';
    this.sx = tower.x;
    this.sy = tower.y - 16;
    this.x = this.sx;
    this.y = this.sy;
    this.tx = targetX;
    this.ty = targetY;
    this.damage = damage;
    this.splash = splash;
    this.duration = tower.stats.flightTime;
    this.t = 0;
    this.alive = true;
    this.height = 0;
    this.arc = Math.min(110, 40 + Math.hypot(targetX - this.sx, targetY - this.sy) * 0.35);
  }

  update(dt, game) {
    this.t += dt;
    const p = Math.min(1, this.t / this.duration);
    this.x = this.sx + (this.tx - this.sx) * p;
    this.y = this.sy + (this.ty - this.sy) * p;
    this.height = Math.sin(p * Math.PI) * this.arc;
    if (p >= 1) {
      this.alive = false;
      game.explode(this.tx, this.ty, this.splash, this.damage);
    }
  }
}

/** Short-lived visual effects that the renderer draws (bolts, tracers, rings). */
export class Effect {
  constructor(kind, props, life) {
    this.id = nextId++;
    this.kind = kind;
    Object.assign(this, props);
    this.life = life;
    this.maxLife = life;
    this.alive = true;
  }
  update(dt) {
    this.life -= dt;
    if (this.life <= 0) this.alive = false;
  }
  get t() {
    return 1 - this.life / this.maxLife;
  }
}

export function inRange(ax, ay, bx, by, r) {
  return distSq(ax, ay, bx, by) <= r * r;
}
