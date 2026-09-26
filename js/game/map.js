import { COLS, ROWS, TILE } from '../data/maps.js';
import { createRng } from '../core/rng.js';

/**
 * Runtime map: converts tile-space waypoints into pixel polylines with
 * cumulative lengths, and builds the buildable grid.
 */
export class GameMap {
  constructor(def) {
    this.def = def;
    this.cols = COLS;
    this.rows = ROWS;
    this.tile = TILE;
    this.width = COLS * TILE;
    this.height = ROWS * TILE;

    this.pathTiles = new Set();
    this.blocked = new Set(def.blocked.map(([c, r]) => this.key(c, r)));
    this.water = new Set(def.water.map(([c, r]) => this.key(c, r)));

    this.paths = def.paths.map((wps) => this.buildPath(wps));
    // Flying route: straight line from each spawn to the exit.
    const exit = this.paths[0].points[this.paths[0].points.length - 1];
    this.exit = { x: exit.x, y: exit.y };
    this.airPaths = this.paths.map((p) => this.buildPixelPath([p.points[0], exit]));
    // The keep is drawn one tile before the exit so it sits inside the map.
    const k = GameMap.sample(this.paths[0], this.paths[0].length - TILE * 1.4);
    this.keep = { x: k.x, y: k.y, dx: k.dx, dy: k.dy };
    // Spawn mouths: where each road enters the visible map.
    this.spawns = this.paths.map((p) => {
      const s = GameMap.sample(p, TILE * 0.5);
      return { x: s.x, y: s.y, dx: s.dx, dy: s.dy };
    });

    this.towers = new Map(); // key -> tower
    this.decor = this.generateDecor();
  }

  key(c, r) {
    return r * COLS + c;
  }

  buildPath(waypoints) {
    // Mark tiles along the path as non-buildable.
    for (let i = 0; i < waypoints.length - 1; i++) {
      const [c0, r0] = waypoints[i];
      const [c1, r1] = waypoints[i + 1];
      const dc = Math.sign(c1 - c0);
      const dr = Math.sign(r1 - r0);
      let c = c0;
      let r = r0;
      for (;;) {
        if (c >= 0 && c < COLS && r >= 0 && r < ROWS) this.pathTiles.add(this.key(c, r));
        if (c === c1 && r === r1) break;
        c += dc;
        r += dr;
      }
    }
    const pts = waypoints.map(([c, r]) => ({ x: (c + 0.5) * TILE, y: (r + 0.5) * TILE }));
    return this.buildPixelPath(pts);
  }

  buildPixelPath(points) {
    const seg = [];
    let total = 0;
    for (let i = 0; i < points.length - 1; i++) {
      const a = points[i];
      const b = points[i + 1];
      const len = Math.hypot(b.x - a.x, b.y - a.y);
      seg.push({ a, b, len, start: total, dx: (b.x - a.x) / len, dy: (b.y - a.y) / len });
      total += len;
    }
    return { points, segments: seg, length: total };
  }

  /** Position and heading at distance `d` along a pixel path. */
  static sample(path, d, out = {}) {
    const segs = path.segments;
    if (d <= 0) {
      const s = segs[0];
      out.x = s.a.x;
      out.y = s.a.y;
      out.dx = s.dx;
      out.dy = s.dy;
      return out;
    }
    if (d >= path.length) {
      const s = segs[segs.length - 1];
      out.x = s.b.x;
      out.y = s.b.y;
      out.dx = s.dx;
      out.dy = s.dy;
      return out;
    }
    // Linear scan is fine: paths have < 12 segments.
    let i = 0;
    while (i < segs.length - 1 && d > segs[i].start + segs[i].len) i++;
    const s = segs[i];
    const t = d - s.start;
    out.x = s.a.x + s.dx * t;
    out.y = s.a.y + s.dy * t;
    out.dx = s.dx;
    out.dy = s.dy;
    return out;
  }

  inBounds(c, r) {
    return c >= 0 && c < COLS && r >= 0 && r < ROWS;
  }

  isPath(c, r) {
    return this.pathTiles.has(this.key(c, r));
  }

  isWater(c, r) {
    return this.water.has(this.key(c, r));
  }

  isBlocked(c, r) {
    return this.blocked.has(this.key(c, r));
  }

  canBuild(c, r) {
    if (!this.inBounds(c, r)) return false;
    const k = this.key(c, r);
    return !this.pathTiles.has(k) && !this.blocked.has(k) && !this.water.has(k) && !this.towers.has(k);
  }

  towerAt(c, r) {
    return this.towers.get(this.key(c, r)) || null;
  }

  /** Deterministic decoration placement (flowers, rocks, trees, bushes). */
  generateDecor() {
    const rng = createRng(this.def.seed);
    const decor = [];
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const k = this.key(c, r);
        if (this.pathTiles.has(k) || this.water.has(k)) continue;
        if (this.blocked.has(k)) {
          decor.push({ c, r, type: rng.chance(0.5) ? 'tree' : 'rock', x: (c + 0.5) * TILE, y: (r + 0.5) * TILE, s: rng.range(0.9, 1.15), v: rng.next() });
          continue;
        }
        if (rng.chance(0.16)) {
          decor.push({ c, r, type: 'flower', x: (c + rng.range(0.2, 0.8)) * TILE, y: (r + rng.range(0.2, 0.8)) * TILE, s: rng.range(0.7, 1), v: rng.next() });
        } else if (rng.chance(0.08)) {
          decor.push({ c, r, type: 'tuft', x: (c + rng.range(0.2, 0.8)) * TILE, y: (r + rng.range(0.2, 0.8)) * TILE, s: rng.range(0.8, 1.2), v: rng.next() });
        }
      }
    }
    return decor;
  }
}
