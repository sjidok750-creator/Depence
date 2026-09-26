import { TILE, COLS, ROWS } from '../data/maps.js';
import { TOWERS } from '../data/towers.js';
import { createRng } from '../core/rng.js';
import { TAU, clamp, ease } from '../core/util.js';
import { drawEnemy, drawEnemyShadow, drawHealthBar, drawTower, drawTowerShadow, drawKeep, drawSpawn, drawDecor, roundRect } from './sprites.js';

/**
 * Canvas renderer. Terrain is rasterised once per map into an offscreen
 * canvas; everything dynamic is drawn each frame in world order.
 */
export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.scale = 1;
    this.dpr = 1;
    this.terrain = null;
    this.terrainFor = null;
    this.time = 0;
    this.hoverAlpha = 0;
  }

  /** Match the backing store to the displayed size for crisp output. */
  resize(displayScale) {
    this.scale = displayScale;
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = COLS * TILE;
    const h = ROWS * TILE;
    this.canvas.width = Math.round(w * displayScale * this.dpr);
    this.canvas.height = Math.round(h * displayScale * this.dpr);
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${h}px`;
  }

  buildTerrain(map) {
    const w = map.width;
    const h = map.height;
    const k = this.scale * this.dpr;
    const off = document.createElement('canvas');
    off.width = Math.round(w * k);
    off.height = Math.round(h * k);
    const ctx = off.getContext('2d');
    ctx.scale(k, k);
    const theme = map.def.theme;
    const rng = createRng(map.def.seed + 1000);

    // Grass base + subtle checker for tile readability.
    ctx.fillStyle = theme.grass;
    ctx.fillRect(0, 0, w, h);
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        if ((c + r) % 2 === 0) {
          ctx.fillStyle = 'rgba(0,0,0,0.035)';
          ctx.fillRect(c * TILE, r * TILE, TILE, TILE);
        }
      }
    }
    // Fine grass texture: short blades in two tones.
    ctx.lineCap = 'round';
    for (let i = 0; i < 420; i++) {
      const x = rng.range(0, w);
      const y = rng.range(0, h);
      const c = Math.floor(x / TILE);
      const r = Math.floor(y / TILE);
      if (map.isPath(c, r) || map.isWater(c, r)) continue;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + rng.range(-1.5, 1.5), y - rng.range(3, 6));
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = rng.chance(0.5) ? 'rgba(255,255,255,0.16)' : 'rgba(20,70,20,0.16)';
      ctx.stroke();
    }
    // Water.
    if (map.water.size) {
      ctx.fillStyle = theme.water;
      for (const k2 of map.water) {
        const c = k2 % COLS;
        const r = Math.floor(k2 / COLS);
        roundRect(ctx, c * TILE - 3, r * TILE - 3, TILE + 6, TILE + 6, 10);
        ctx.fill();
      }
      ctx.strokeStyle = 'rgba(255,255,255,0.45)';
      ctx.lineWidth = 1.5;
      for (const k2 of map.water) {
        const c = k2 % COLS;
        const r = Math.floor(k2 / COLS);
        for (let i = 0; i < 2; i++) {
          const x = c * TILE + rng.range(6, 24);
          const y = r * TILE + rng.range(8, 40);
          ctx.beginPath();
          ctx.moveTo(x, y);
          ctx.quadraticCurveTo(x + 5, y - 3, x + 10, y);
          ctx.quadraticCurveTo(x + 15, y + 3, x + 20, y);
          ctx.stroke();
        }
      }
    }
    // Roads.
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (const [width, color] of [[TILE * 0.92, theme.pathEdge], [TILE * 0.72, theme.path]]) {
      ctx.lineWidth = width;
      ctx.strokeStyle = color;
      for (const p of map.paths) {
        ctx.beginPath();
        p.points.forEach((pt, i) => (i ? ctx.lineTo(pt.x, pt.y) : ctx.moveTo(pt.x, pt.y)));
        ctx.stroke();
      }
    }
    // Pebbles on the road.
    for (const p of map.paths) {
      for (let d = 20; d < p.length; d += rng.range(30, 70)) {
        const s = { };
        const pt = mapSample(p, d, s);
        const ox = -pt.dy * rng.range(-12, 12);
        const oy = pt.dx * rng.range(-12, 12);
        ctx.beginPath();
        ctx.ellipse(pt.x + ox, pt.y + oy, rng.range(1.5, 3.5), rng.range(1, 2.5), rng.range(0, 3), 0, TAU);
        ctx.fillStyle = 'rgba(120,90,50,0.25)';
        ctx.fill();
      }
    }
    // Static decorations (flowers, tufts). Trees/rocks animate, drawn live.
    for (const d of map.decor) if (d.type === 'flower' || d.type === 'tuft') drawDecor(ctx, d, 0);
    // Vignette edge.
    const grad = ctx.createRadialGradient(w / 2, h / 2, h * 0.5, w / 2, h / 2, h * 1.05);
    grad.addColorStop(0, 'rgba(0,0,0,0)');
    grad.addColorStop(1, 'rgba(20,40,20,0.22)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);
    this.terrain = off;
    this.terrainFor = map;
  }

  /**
   * @param game Game
   * @param ui { hover: {c,r}|null, placing: towerId|null, selected: Tower|null }
   */
  draw(game, ui, dt) {
    this.time += dt;
    const time = this.time;
    const ctx = this.ctx;
    const map = game.map;
    if (this.terrainFor !== map || !this.terrain) this.buildTerrain(map);
    const k = this.scale * this.dpr;
    ctx.setTransform(k, 0, 0, k, 0, 0);

    // Screen shake.
    if (game.shake > 0) {
      const s = game.shake;
      ctx.translate((Math.random() - 0.5) * s, (Math.random() - 0.5) * s);
    }
    ctx.drawImage(this.terrain, 0, 0, map.width, map.height);

    // Hover tile & range preview (under entities).
    this.hoverAlpha = ui.hover ? Math.min(1, this.hoverAlpha + dt * 10) : Math.max(0, this.hoverAlpha - dt * 10);
    if (ui.hover && this.hoverAlpha > 0) {
      const { c, r } = ui.hover;
      const ok = ui.placing ? game.canPlace(ui.placing, c, r) : map.towerAt(c, r) !== null;
      if (ui.placing || map.towerAt(c, r)) {
        ctx.globalAlpha = this.hoverAlpha * 0.9;
        ctx.fillStyle = ok ? 'rgba(255,255,255,0.28)' : 'rgba(255,80,80,0.35)';
        roundRect(ctx, c * TILE + 3, r * TILE + 3, TILE - 6, TILE - 6, 8);
        ctx.fill();
        ctx.globalAlpha = 1;
      }
    }
    if (ui.selected) this.drawRange(ctx, ui.selected.x, ui.selected.y, ui.selected.range, TOWERS[ui.selected.type].color, 1);
    if (!ui.placing && ui.hover) {
      const ht = map.towerAt(ui.hover.c, ui.hover.r);
      if (ht && ht !== ui.selected) this.drawRange(ctx, ht.x, ht.y, ht.range, TOWERS[ht.type].color, this.hoverAlpha * 0.5);
    }
    if (ui.placing && ui.hover) {
      const def = TOWERS[ui.placing];
      const ok = game.canPlace(ui.placing, ui.hover.c, ui.hover.r);
      this.drawRange(ctx, (ui.hover.c + 0.5) * TILE, (ui.hover.r + 0.5) * TILE, def.levels[0].range, ok ? def.color : '#ff6b6b', this.hoverAlpha);
    }

    // Animated decorations (trees & rocks) behind entities that are lower.
    const drawables = [];
    for (const d of map.decor) if (d.type === 'tree' || d.type === 'rock') drawables.push({ y: d.y + 10, fn: () => drawDecor(ctx, d, time) });
    for (const s of map.spawns) drawables.push({ y: s.y + 30, fn: () => drawSpawn(ctx, s, time) });
    for (const t of game.towers) drawables.push({ y: t.y + 8, fn: () => drawTower(ctx, t, time) });
    for (const e of game.enemies) if (!e.flying) drawables.push({ y: e.y, fn: () => drawEnemy(ctx, e, time) });
    drawables.push({ y: map.keep.y + 12, fn: () => drawKeep(ctx, map.keep, time, game.keepFlash) });

    // Shadows first so they never overlap other bodies oddly.
    for (const t of game.towers) drawTowerShadow(ctx, t);
    for (const e of game.enemies) drawEnemyShadow(ctx, e);
    drawables.sort((a, b) => a.y - b.y);
    for (const d of drawables) d.fn();

    this.drawProjectiles(ctx, game);
    for (const e of game.enemies) if (e.flying) drawEnemy(ctx, e, time);
    this.drawEffects(ctx, game, time);
    this.drawParticles(ctx, game);
    for (const e of game.enemies) drawHealthBar(ctx, e);
    this.drawFloaters(ctx, game);

    // Ghost tower while placing.
    if (ui.placing && ui.hover) {
      const def = TOWERS[ui.placing];
      const ghost = {
        type: ui.placing, def, level: 0, x: (ui.hover.c + 0.5) * TILE, y: (ui.hover.r + 0.5) * TILE,
        angle: -Math.PI / 2, recoil: 0, buildAnim: 1, charge: 0,
      };
      ctx.globalAlpha = this.hoverAlpha;
      drawTower(ctx, ghost, time, { ghost: true });
      ctx.globalAlpha = 1;
    }
    // Selection ring.
    if (ui.selected) {
      const t = ui.selected;
      const pulse = 1 + Math.sin(time * 5) * 0.04;
      ctx.beginPath();
      roundRect(ctx, t.x - 20 * pulse, t.y - 22 * pulse, 40 * pulse, 44 * pulse, 10);
      ctx.lineWidth = 2.5;
      ctx.strokeStyle = 'rgba(255,255,255,0.9)';
      ctx.stroke();
    }
  }

  drawRange(ctx, x, y, r, color, alpha) {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, TAU);
    ctx.fillStyle = hexToRgba(color, 0.13);
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 6]);
    ctx.lineDashOffset = -this.time * 20;
    ctx.strokeStyle = hexToRgba(color, 0.8);
    ctx.stroke();
    ctx.restore();
  }

  drawProjectiles(ctx, game) {
    for (const p of game.projectiles) {
      if (p.kind === 'arrow') {
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.angle);
        ctx.beginPath();
        ctx.moveTo(-8, 0);
        ctx.lineTo(6, 0);
        ctx.lineWidth = 2.2;
        ctx.strokeStyle = '#4a3320';
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(9, 0);
        ctx.lineTo(4, -3);
        ctx.lineTo(4, 3);
        ctx.closePath();
        ctx.fillStyle = '#d8dee6';
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(-8, 0);
        ctx.lineTo(-11, -3);
        ctx.lineTo(-6, 0);
        ctx.lineTo(-11, 3);
        ctx.closePath();
        ctx.fillStyle = '#ff7b7b';
        ctx.fill();
        ctx.restore();
      } else if (p.kind === 'shell') {
        // ground shadow
        ctx.beginPath();
        ctx.ellipse(p.x, p.y + 4, 6, 3, 0, 0, TAU);
        ctx.fillStyle = 'rgba(0,0,0,0.2)';
        ctx.fill();
        ctx.beginPath();
        ctx.arc(p.x, p.y - p.height, 5.5, 0, TAU);
        ctx.fillStyle = '#2d2a36';
        ctx.fill();
        ctx.beginPath();
        ctx.arc(p.x - 1.5, p.y - p.height - 1.5, 2, 0, TAU);
        ctx.fillStyle = 'rgba(255,255,255,0.35)';
        ctx.fill();
        // fuse spark
        ctx.beginPath();
        ctx.arc(p.x + 3, p.y - p.height - 5, 1.5 + Math.random(), 0, TAU);
        ctx.fillStyle = '#ffb347';
        ctx.fill();
      }
    }
  }

  drawEffects(ctx, game, time) {
    for (const fx of game.effects) {
      const t = fx.t;
      switch (fx.kind) {
        case 'bolt': {
          ctx.save();
          ctx.globalAlpha = 1 - t;
          ctx.lineCap = 'round';
          const rng = createRng(Math.floor(fx.seed));
          for (const [w, col] of [[5, hexToRgba(fx.color, 0.35)], [2, '#f3ebff']]) {
            ctx.beginPath();
            ctx.moveTo(fx.x1, fx.y1);
            const n = 6;
            for (let i = 1; i < n; i++) {
              const f = i / n;
              const x = fx.x1 + (fx.x2 - fx.x1) * f;
              const y = fx.y1 + (fx.y2 - fx.y1) * f;
              const j = (rng.next() - 0.5) * 14;
              ctx.lineTo(x + j, y + j * 0.6);
            }
            ctx.lineTo(fx.x2, fx.y2);
            ctx.lineWidth = w;
            ctx.strokeStyle = col;
            ctx.stroke();
          }
          ctx.restore();
          break;
        }
        case 'tracer': {
          ctx.save();
          ctx.globalAlpha = 1 - t;
          ctx.beginPath();
          ctx.moveTo(fx.x1, fx.y1);
          ctx.lineTo(fx.x2, fx.y2);
          ctx.lineWidth = 2;
          ctx.strokeStyle = '#fff4d6';
          ctx.stroke();
          ctx.beginPath();
          ctx.arc(fx.x1, fx.y1, 6 * (1 - t), 0, TAU);
          ctx.fillStyle = '#ffd98a';
          ctx.fill();
          ctx.restore();
          break;
        }
        case 'ring': {
          ctx.save();
          ctx.globalAlpha = (1 - t) * 0.7;
          ctx.beginPath();
          ctx.arc(fx.x, fx.y, fx.r * ease.outCubic(t), 0, TAU);
          ctx.lineWidth = 3 * (1 - t) + 1;
          ctx.strokeStyle = fx.color;
          ctx.stroke();
          ctx.restore();
          break;
        }
        case 'blast': {
          ctx.save();
          const r = fx.r * (0.5 + 0.5 * ease.outCubic(t));
          ctx.globalAlpha = (1 - t) * 0.8;
          ctx.beginPath();
          ctx.arc(fx.x, fx.y, r, 0, TAU);
          ctx.fillStyle = 'rgba(255,170,80,0.5)';
          ctx.fill();
          ctx.beginPath();
          ctx.arc(fx.x, fx.y, r * 0.55 * (1 - t * 0.5), 0, TAU);
          ctx.fillStyle = '#fff1c4';
          ctx.fill();
          ctx.restore();
          break;
        }
        case 'heal': {
          ctx.save();
          ctx.globalAlpha = (1 - t) * 0.5;
          ctx.beginPath();
          ctx.arc(fx.x, fx.y, fx.r * (0.4 + 0.6 * t), 0, TAU);
          ctx.lineWidth = 2;
          ctx.strokeStyle = '#9dffc4';
          ctx.stroke();
          ctx.restore();
          break;
        }
      }
    }
  }

  drawParticles(ctx, game) {
    for (const p of game.particles) {
      const a = clamp(p.life / p.maxLife, 0, 1);
      ctx.globalAlpha = a;
      ctx.fillStyle = p.color;
      if (p.kind === 'star') {
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.life * 5);
        ctx.fillRect(-p.size, -p.size * 0.35, p.size * 2, p.size * 0.7);
        ctx.fillRect(-p.size * 0.35, -p.size, p.size * 0.7, p.size * 2);
        ctx.restore();
      } else {
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * (p.kind === 'puff' ? 1 + (1 - a) : a), 0, TAU);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  }

  drawFloaters(ctx, game) {
    ctx.save();
    ctx.font = 'bold 13px "Pretendard", "Noto Sans KR", system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.lineWidth = 3;
    ctx.lineJoin = 'round';
    for (const f of game.floaters) {
      ctx.globalAlpha = clamp(f.life * 1.5, 0, 1);
      ctx.strokeStyle = 'rgba(20,20,30,0.7)';
      ctx.strokeText(f.text, f.x, f.y);
      ctx.fillStyle = f.color;
      ctx.fillText(f.text, f.x, f.y);
    }
    ctx.restore();
  }
}

function mapSample(path, d, out) {
  // Local copy of GameMap.sample to avoid importing the game layer here.
  const segs = path.segments;
  let i = 0;
  while (i < segs.length - 1 && d > segs[i].start + segs[i].len) i++;
  const s = segs[i];
  const t = Math.min(s.len, Math.max(0, d - s.start));
  out.x = s.a.x + s.dx * t;
  out.y = s.a.y + s.dy * t;
  out.dx = s.dx;
  out.dy = s.dy;
  return out;
}

export function hexToRgba(hex, a) {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}
