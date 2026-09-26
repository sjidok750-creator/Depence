import { Emitter } from '../core/util.js';
import { GameMap } from './map.js';
import { Enemy } from './enemy.js';
import { Tower } from './tower.js';
import { Effect } from './projectile.js';
import { TOWERS } from '../data/towers.js';
import { ENEMIES } from '../data/enemies.js';
import { getWave, WAVE_COUNT } from '../data/waves.js';
import { DIFFICULTIES, RULES } from '../data/config.js';
import { getMap } from '../data/maps.js';

/**
 * Pure simulation: no DOM, no canvas. Drives enemies, towers, projectiles,
 * economy and wave flow with a fixed timestep. Everything visual subscribes
 * through `events` or reads the public lists.
 */
export class Game {
  constructor({ mapId = 'meadow', difficulty = 'normal', random = Math.random } = {}) {
    this.mapDef = getMap(mapId);
    this.map = new GameMap(this.mapDef);
    this.difficulty = DIFFICULTIES[difficulty] || DIFFICULTIES.normal;
    this.random = random;
    this.events = new Emitter();

    this.gold = this.difficulty.gold;
    this.lives = this.difficulty.lives;
    this.wave = 0; // last started wave
    this.state = 'prep'; // prep | wave | countdown | over | won
    this.countdown = RULES.firstWaveCountdown;
    this.time = 0;
    this.speed = 1;
    this.paused = false;
    this.endless = false;

    this.enemies = [];
    this.towers = [];
    this.projectiles = [];
    this.effects = [];
    this.particles = [];
    this.floaters = [];
    this.shake = 0;
    this.keepFlash = 0;

    this.spawnQueue = []; // { at, type, pathIndex }
    this.pathCursor = 0;
    this.stats = { kills: 0, goldEarned: 0, leaks: 0, towersBuilt: 0, damage: 0, wavesCleared: 0, timePlayed: 0 };
  }

  // ---------------------------------------------------------------- economy

  canAfford(cost) {
    return this.gold >= cost;
  }

  addGold(n, x, y) {
    if (n <= 0) return;
    this.gold += n;
    this.stats.goldEarned += n;
    if (x !== undefined) this.addFloater(`+${n}`, x, y, '#ffd75e');
    this.events.emit('gold', { amount: n });
  }

  // ------------------------------------------------------------------ towers

  canPlace(typeId, c, r) {
    const def = TOWERS[typeId];
    if (!def) return false;
    return this.state !== 'over' && this.state !== 'won' && this.map.canBuild(c, r) && this.gold >= def.cost;
  }

  placeTower(typeId, c, r) {
    if (!this.canPlace(typeId, c, r)) return null;
    const tower = new Tower(typeId, c, r);
    this.gold -= tower.def.cost;
    this.towers.push(tower);
    this.map.towers.set(this.map.key(c, r), tower);
    this.stats.towersBuilt++;
    this.spawnDust(tower.x, tower.y + 10, 10);
    this.events.emit('place', { tower });
    return tower;
  }

  upgradeTower(tower) {
    if (!tower.canUpgrade || this.gold < tower.upgradeCost) return false;
    this.gold -= tower.upgradeCost;
    tower.upgrade();
    this.spawnSparkle(tower.x, tower.y, tower.def.color, 14);
    this.events.emit('upgrade', { tower });
    return true;
  }

  sellTower(tower) {
    const idx = this.towers.indexOf(tower);
    if (idx < 0) return 0;
    const value = tower.sellValue;
    this.towers.splice(idx, 1);
    this.map.towers.delete(this.map.key(tower.c, tower.r));
    this.gold += value;
    this.addFloater(`+${value}`, tower.x, tower.y - 20, '#ffd75e');
    this.spawnDust(tower.x, tower.y + 10, 8);
    this.events.emit('sell', { tower, value });
    return value;
  }

  // ------------------------------------------------------------------- waves

  get finalWave() {
    return WAVE_COUNT;
  }

  get waveActive() {
    return this.state === 'wave';
  }

  /** Start the next wave immediately (from prep, countdown, or while a wave runs). */
  startNextWave({ manual = false } = {}) {
    if (this.state === 'over' || this.state === 'won') return false;
    if (!this.endless && this.wave >= WAVE_COUNT) return false;
    if (manual && this.state === 'countdown') {
      const bonus = Math.floor(this.countdown * RULES.earlyCallBonusPerSecond);
      if (bonus > 0) this.addGold(bonus, this.map.keep.x, this.map.keep.y - 30);
    }
    this.wave++;
    this.state = 'wave';
    this.countdown = 0;
    this.waveTime = 0;
    const groups = getWave(this.wave);
    for (const grp of groups) {
      for (let i = 0; i < grp.count; i++) {
        this.spawnQueue.push({ at: this.time + grp.delay + i * grp.interval, type: grp.type });
      }
    }
    this.spawnQueue.sort((a, b) => a.at - b.at);
    const boss = groups.some((gp) => ENEMIES[gp.type].boss);
    this.events.emit('wave-start', { wave: this.wave, boss });
    return true;
  }

  spawnEnemy(type, opts = {}) {
    const def = ENEMIES[type];
    let path;
    let pathIndex = opts.pathIndex;
    if (pathIndex === undefined) {
      pathIndex = this.pathCursor % this.map.paths.length;
      this.pathCursor++;
    }
    path = def.flying ? this.map.airPaths[pathIndex] : this.map.paths[pathIndex];
    const enemy = new Enemy(type, path, this.wave, {
      hpMult: this.difficulty.hpMult * this.mapDef.difficultyMult,
      goldMult: this.difficulty.goldMult,
      dist: opts.dist,
      hpScale: opts.hpScale,
    });
    enemy.pathIndex = pathIndex;
    enemy.phase = this.random() * Math.PI * 2;
    this.enemies.push(enemy);
    return enemy;
  }

  // ------------------------------------------------------------------ combat

  hitEnemy(enemy, amount, { source = null, pierce = false, bossBonus = 1 } = {}) {
    if (!enemy.alive) return 0;
    const dealt = enemy.takeDamage(amount, { pierce, bossBonus });
    this.stats.damage += dealt;
    if (source && source.damageDealt !== undefined) source.damageDealt += dealt;
    if (!enemy.alive) this.killEnemy(enemy, source);
    return dealt;
  }

  killEnemy(enemy, source) {
    this.stats.kills++;
    if (source && source.kills !== undefined) source.kills++;
    this.addGold(enemy.reward, enemy.x, enemy.y - enemy.radius - 6);
    this.spawnBurst(enemy.x, enemy.y, enemy.def.color, enemy.boss ? 26 : 8, enemy.boss ? 180 : 90);
    if (enemy.def.splitInto) {
      const { type, count } = enemy.def.splitInto;
      for (let i = 0; i < count; i++) {
        const child = this.spawnEnemy(type, { pathIndex: enemy.pathIndex, dist: Math.max(0, enemy.dist - 10 + i * 6), hpScale: 0.6 });
        child.phase = i;
      }
    }
    if (enemy.boss) this.shake = Math.max(this.shake, 8);
    this.events.emit('kill', { enemy, source });
  }

  explode(x, y, radius, damage) {
    const r2 = radius * radius;
    for (const e of this.enemies) {
      if (!e.alive || e.flying) continue;
      const dx = e.x - x;
      const dy = e.y - y;
      const d2 = dx * dx + dy * dy;
      if (d2 <= r2) {
        // Full damage at centre, 55% at the edge.
        const falloff = 1 - 0.45 * Math.sqrt(d2 / r2);
        this.hitEnemy(e, damage * falloff, { source: null });
      }
    }
    this.addEffect(new Effect('blast', { x, y, r: radius }, 0.35));
    this.spawnBurst(x, y, '#ffb347', 12, 140);
    this.spawnDust(x, y + 4, 6);
    this.shake = Math.max(this.shake, 3);
    this.events.emit('explode', { x, y });
  }

  leak(enemy) {
    const loss = enemy.boss ? 3 : 1;
    this.lives = Math.max(0, this.lives - loss);
    this.stats.leaks++;
    this.keepFlash = 0.5;
    this.shake = Math.max(this.shake, 6);
    this.addFloater(`-${loss}`, this.map.keep.x, this.map.keep.y - 34, '#ff6b6b');
    this.events.emit('leak', { enemy, loss });
    if (this.lives <= 0) {
      this.state = 'over';
      this.events.emit('gameover', { stats: this.stats, wave: this.wave });
    }
  }

  // ------------------------------------------------------------------ juice

  addProjectile(p) {
    this.projectiles.push(p);
  }

  addEffect(e) {
    this.effects.push(e);
  }

  addFloater(text, x, y, color) {
    this.floaters.push({ text, x, y, color, life: 1, vy: -34 });
  }

  spawnParticle(p) {
    if (this.particles.length > 600) return;
    this.particles.push(p);
  }

  spawnBurst(x, y, color, n, speed) {
    for (let i = 0; i < n; i++) {
      const a = this.random() * Math.PI * 2;
      const s = speed * (0.3 + this.random() * 0.7);
      this.spawnParticle({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 40, life: 0.45 + this.random() * 0.35, maxLife: 0.8, size: 2 + this.random() * 3, color, gravity: 260, kind: 'dot' });
    }
  }

  spawnHitSpark(x, y, color, n) {
    for (let i = 0; i < n; i++) {
      const a = this.random() * Math.PI * 2;
      const s = 50 + this.random() * 80;
      this.spawnParticle({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0.2 + this.random() * 0.15, maxLife: 0.35, size: 1.5 + this.random() * 2, color, gravity: 0, kind: 'spark' });
    }
  }

  spawnDust(x, y, n) {
    for (let i = 0; i < n; i++) {
      const a = this.random() * Math.PI * 2;
      const s = 20 + this.random() * 40;
      this.spawnParticle({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s * 0.4 - 10, life: 0.4 + this.random() * 0.3, maxLife: 0.7, size: 3 + this.random() * 4, color: 'rgba(120,90,60,0.5)', gravity: 0, kind: 'puff' });
    }
  }

  spawnSparkle(x, y, color, n) {
    for (let i = 0; i < n; i++) {
      const a = this.random() * Math.PI * 2;
      const s = 30 + this.random() * 60;
      this.spawnParticle({ x, y: y - 10, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 60, life: 0.6 + this.random() * 0.4, maxLife: 1, size: 2 + this.random() * 2, color, gravity: 60, kind: 'star' });
    }
  }

  // -------------------------------------------------------------------- loop

  /** Advance the simulation by one fixed step (dt in seconds). */
  step(dt) {
    if (this.paused || this.state === 'over') return;
    this.time += dt;
    this.stats.timePlayed += dt;

    // Wave timers.
    if (this.state === 'prep' || this.state === 'countdown') {
      this.countdown -= dt;
      if (this.countdown <= 0) this.startNextWave();
    }

    // Spawning.
    while (this.spawnQueue.length && this.spawnQueue[0].at <= this.time) {
      const s = this.spawnQueue.shift();
      this.spawnEnemy(s.type);
    }

    // Enemies.
    for (const e of this.enemies) {
      e.update(dt);
      if (e.reached) this.leak(e);
      if (this.state === 'over') return;
    }
    // Healers.
    for (const h of this.enemies) {
      if (!h.alive || !h.heal) continue;
      h.healTick += dt;
      if (h.healTick >= 0.5) {
        h.healTick -= 0.5;
        const r2 = h.healRadius * h.healRadius;
        for (const e of this.enemies) {
          if (!e.alive || e === h || e.hp >= e.maxHp) continue;
          const dx = e.x - h.x;
          const dy = e.y - h.y;
          if (dx * dx + dy * dy <= r2) {
            e.hp = Math.min(e.maxHp, e.hp + h.heal * 0.5 * (e.boss ? 3 : 1));
          }
        }
        this.addEffect(new Effect('heal', { x: h.x, y: h.y, r: h.healRadius }, 0.4));
      }
    }
    this.enemies = this.enemies.filter((e) => e.alive);

    // Towers & projectiles.
    for (const t of this.towers) t.update(dt, this);
    for (const p of this.projectiles) p.update(dt, this);
    this.projectiles = this.projectiles.filter((p) => p.alive);
    for (const fx of this.effects) fx.update(dt);
    this.effects = this.effects.filter((fx) => fx.alive);

    // Particles & floaters (cheap, simulated here so the renderer stays dumb).
    for (const p of this.particles) {
      p.life -= dt;
      p.vy += p.gravity * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.kind === 'puff') {
        p.vx *= 0.9;
        p.vy *= 0.9;
      }
    }
    this.particles = this.particles.filter((p) => p.life > 0);
    for (const f of this.floaters) {
      f.life -= dt * 0.9;
      f.y += f.vy * dt;
      f.vy *= 0.96;
    }
    this.floaters = this.floaters.filter((f) => f.life > 0);
    if (this.shake > 0) this.shake = Math.max(0, this.shake - dt * 24);
    if (this.keepFlash > 0) this.keepFlash -= dt;

    // Wave completion.
    if (this.state === 'wave' && this.spawnQueue.length === 0 && this.enemies.length === 0) {
      this.stats.wavesCleared = this.wave;
      const bonus = RULES.waveClearBonusBase + RULES.waveClearBonusPerWave * this.wave;
      this.addGold(bonus, this.map.keep.x, this.map.keep.y - 30);
      this.events.emit('wave-clear', { wave: this.wave, bonus });
      if (!this.endless && this.wave >= WAVE_COUNT) {
        this.state = 'won';
        this.events.emit('victory', { stats: this.stats, wave: this.wave });
      } else {
        this.state = 'countdown';
        this.countdown = RULES.waveCountdown;
      }
    }
  }

  /** Called after victory to keep playing into endless waves. */
  continueEndless() {
    if (this.state !== 'won') return;
    this.endless = true;
    this.state = 'countdown';
    this.countdown = RULES.waveCountdown;
    this.events.emit('endless', {});
  }

  togglePause() {
    if (this.state === 'over' || this.state === 'won') return;
    this.paused = !this.paused;
    this.events.emit('pause', { paused: this.paused });
  }

  setSpeed(s) {
    this.speed = Math.max(1, Math.min(RULES.maxSpeed, s));
    this.events.emit('speed', { speed: this.speed });
  }
}
