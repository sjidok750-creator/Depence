import { TILE, COLS, ROWS } from '../data/maps.js';

/**
 * Pointer + keyboard input for the canvas. Converts pointer positions to
 * tile coordinates regardless of CSS scaling, and distinguishes clicks from
 * drags so touch scrolling never places towers by accident.
 */
export class Input {
  constructor(canvas, handlers) {
    this.canvas = canvas;
    this.h = handlers;
    this.hover = null;
    this.down = null;
    this.enabled = true;

    canvas.addEventListener('pointermove', (e) => this.onMove(e));
    canvas.addEventListener('pointerdown', (e) => this.onDown(e));
    canvas.addEventListener('pointerup', (e) => this.onUp(e));
    canvas.addEventListener('pointerleave', () => {
      this.hover = null;
      this.h.onHover?.(null);
    });
    canvas.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      this.h.onCancel?.();
    });
    window.addEventListener('keydown', (e) => this.onKey(e));
  }

  toTile(e) {
    const rect = this.canvas.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * COLS * TILE;
    const y = ((e.clientY - rect.top) / rect.height) * ROWS * TILE;
    const c = Math.floor(x / TILE);
    const r = Math.floor(y / TILE);
    if (c < 0 || c >= COLS || r < 0 || r >= ROWS) return null;
    return { c, r, x, y };
  }

  onMove(e) {
    if (!this.enabled) return;
    const t = this.toTile(e);
    if (!t) {
      if (this.hover) {
        this.hover = null;
        this.h.onHover?.(null);
      }
      return;
    }
    if (!this.hover || this.hover.c !== t.c || this.hover.r !== t.r) {
      this.hover = t;
      this.h.onHover?.(t);
    }
  }

  onDown(e) {
    if (!this.enabled) return;
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    this.canvas.setPointerCapture?.(e.pointerId);
    this.down = { x: e.clientX, y: e.clientY, t: performance.now() };
    const t = this.toTile(e);
    if (t) {
      this.hover = t;
      this.h.onHover?.(t);
    }
  }

  onUp(e) {
    if (!this.enabled || !this.down) return;
    const moved = Math.hypot(e.clientX - this.down.x, e.clientY - this.down.y);
    const held = performance.now() - this.down.t;
    this.down = null;
    if (moved > 14 || held > 900) return; // treat as drag / long press
    const t = this.toTile(e);
    if (t) this.h.onClick?.(t, e);
  }

  onKey(e) {
    if (!this.enabled) return;
    if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
    const handled = this.h.onKey?.(e.key, e);
    if (handled) e.preventDefault();
  }
}
