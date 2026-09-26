// Procedural vector "sprites". Everything is drawn with canvas paths so the
// game has zero image assets and stays crisp at any scale.

import { TAU, clamp } from '../core/util.js';

const OUTLINE = 'rgba(30, 26, 40, 0.55)';

export function roundRect(ctx, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

function blob(ctx, x, y, rx, ry, fill, stroke = OUTLINE, lw = 2) {
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, 0, 0, TAU);
  ctx.fillStyle = fill;
  ctx.fill();
  if (stroke) {
    ctx.lineWidth = lw;
    ctx.strokeStyle = stroke;
    ctx.stroke();
  }
}

function shine(ctx, x, y, rx, ry) {
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, -0.5, 0, TAU);
  ctx.fillStyle = 'rgba(255,255,255,0.45)';
  ctx.fill();
}

/** Cute eyes: white with dark pupils looking toward (lookX, lookY). */
function eyes(ctx, x, y, gap, size, lookX, lookY, blink, angry = false) {
  for (const s of [-1, 1]) {
    const ex = x + s * gap;
    if (blink) {
      ctx.beginPath();
      ctx.moveTo(ex - size, y);
      ctx.lineTo(ex + size, y);
      ctx.lineWidth = 2;
      ctx.strokeStyle = '#2a2436';
      ctx.stroke();
      continue;
    }
    ctx.beginPath();
    ctx.ellipse(ex, y, size, size * 1.15, 0, 0, TAU);
    ctx.fillStyle = '#fff';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(ex + lookX * size * 0.35, y + lookY * size * 0.35, size * 0.55, 0, TAU);
    ctx.fillStyle = '#2a2436';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(ex + lookX * size * 0.35 - size * 0.2, y + lookY * size * 0.35 - size * 0.25, size * 0.18, 0, TAU);
    ctx.fillStyle = '#fff';
    ctx.fill();
    if (angry) {
      ctx.beginPath();
      ctx.moveTo(ex - size * 1.1, y - size * 1.4 + (s < 0 ? size * 0.6 : 0));
      ctx.lineTo(ex + size * 1.1, y - size * 1.4 + (s > 0 ? size * 0.6 : 0));
      ctx.lineWidth = 2.2;
      ctx.strokeStyle = '#2a2436';
      ctx.stroke();
    }
  }
}

function shadow(ctx, x, y, rx, ry, alpha = 0.22) {
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, 0, 0, TAU);
  ctx.fillStyle = `rgba(20,30,20,${alpha})`;
  ctx.fill();
}

// ------------------------------------------------------------------ enemies

export function drawEnemyShadow(ctx, e) {
  const r = e.radius;
  if (e.flying) shadow(ctx, e.x, e.y + 4, r * 0.7, r * 0.3, 0.16);
  else shadow(ctx, e.x, e.y + r * 0.55, r * 0.95, r * 0.38);
}

let scratch = null;
function getScratch(size) {
  if (!scratch) {
    scratch = document.createElement('canvas');
    scratch.ctx = scratch.getContext('2d');
  }
  if (scratch.width !== size) {
    scratch.width = size;
    scratch.height = size;
  }
  return scratch;
}

export function drawEnemy(ctx, e, time) {
  if (e.hitFlash > 0 && typeof document !== 'undefined') {
    // Render to a scratch canvas so the white flash only tints the body.
    const size = Math.ceil(e.radius * 7);
    const res = 2; // supersample so the flash stays crisp on scaled canvases
    const sc = getScratch(size * res);
    const c2 = sc.ctx;
    c2.setTransform(res, 0, 0, res, 0, 0);
    c2.clearRect(0, 0, size, size);
    const proxy = Object.create(e, { x: { value: size / 2 }, y: { value: size * 0.7 } });
    drawEnemyBody(c2, proxy, time);
    c2.globalCompositeOperation = 'source-atop';
    c2.fillStyle = 'rgba(255,255,255,0.6)';
    c2.fillRect(0, 0, size, size);
    c2.globalCompositeOperation = 'source-over';
    ctx.drawImage(sc, e.x - size / 2, e.y - size * 0.7, size, size);
  } else {
    drawEnemyBody(ctx, e, time);
  }
  if (e.slow > 0) drawFrostSparkles(ctx, e, time);
}

function drawEnemyBody(ctx, e, time) {
  ctx.save();
  ctx.translate(e.x, e.y);
  const blink = Math.sin(time * 1.7 + e.phase * 5) > 0.975;
  const lookX = e.dx * 0.9;
  const lookY = e.dy * 0.6;
  switch (e.type) {
    case 'slime':
    case 'slimeKing':
      drawSlime(ctx, e, time, blink, lookX, lookY);
      break;
    case 'wisp':
      drawWisp(ctx, e, time, blink, lookX, lookY);
      break;
    case 'bat':
      drawBat(ctx, e, time, blink, lookX, lookY);
      break;
    case 'beetle':
      drawBeetle(ctx, e, time, blink, lookX, lookY);
      break;
    case 'golem':
    case 'titan':
      drawGolem(ctx, e, time, blink, lookX, lookY);
      break;
    case 'shaman':
      drawShaman(ctx, e, time, blink, lookX, lookY);
      break;
    case 'drake':
      drawDrake(ctx, e, time, blink, lookX, lookY);
      break;
  }
  ctx.restore();
}

function drawFrostSparkles(ctx, e, time) {
  ctx.save();
  ctx.fillStyle = '#dff6ff';
  for (let i = 0; i < 3; i++) {
    const a = time * 2 + i * 2.1 + e.phase;
    const r = e.radius + 4;
    const px = e.x + Math.cos(a) * r;
    const py = e.y - e.radius * 0.6 + Math.sin(a * 1.3) * r * 0.5 - (e.flying ? 20 : 0);
    ctx.beginPath();
    ctx.arc(px, py, 1.6, 0, TAU);
    ctx.fill();
  }
  ctx.restore();
}

function drawSlime(ctx, e, time, blink, lookX, lookY) {
  const r = e.radius;
  const t = time * 7 + e.phase;
  const hop = Math.max(0, Math.sin(t));
  const squash = 1 + 0.12 * Math.cos(t * 2) * (1 - hop);
  const sx = squash;
  const sy = 2 - squash;
  ctx.translate(0, -hop * r * 0.35);
  ctx.scale(sx, sy);
  // body
  ctx.beginPath();
  ctx.moveTo(-r, 0);
  ctx.bezierCurveTo(-r, -r * 1.55, r, -r * 1.55, r, 0);
  ctx.bezierCurveTo(r, r * 0.5, -r, r * 0.5, -r, 0);
  ctx.fillStyle = e.def.color;
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = OUTLINE;
  ctx.stroke();
  shine(ctx, -r * 0.4, -r * 0.9, r * 0.28, r * 0.16);
  eyes(ctx, 0, -r * 0.55, r * 0.36, r * 0.2, lookX, lookY, blink, e.boss);
  // mouth
  ctx.beginPath();
  ctx.arc(0, -r * 0.2, r * 0.18, 0.15 * Math.PI, 0.85 * Math.PI);
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = '#2a2436';
  ctx.stroke();
  if (e.boss) drawCrown(ctx, 0, -r * 1.5, r * 0.55);
}

function drawCrown(ctx, x, y, s) {
  ctx.beginPath();
  ctx.moveTo(x - s, y + s * 0.5);
  ctx.lineTo(x - s, y - s * 0.4);
  ctx.lineTo(x - s * 0.5, y);
  ctx.lineTo(x, y - s * 0.6);
  ctx.lineTo(x + s * 0.5, y);
  ctx.lineTo(x + s, y - s * 0.4);
  ctx.lineTo(x + s, y + s * 0.5);
  ctx.closePath();
  ctx.fillStyle = '#ffd35a';
  ctx.fill();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = '#8a5a12';
  ctx.stroke();
  ctx.fillStyle = '#ff5f7a';
  ctx.beginPath();
  ctx.arc(x, y + s * 0.15, s * 0.16, 0, TAU);
  ctx.fill();
}

function drawWisp(ctx, e, time, blink, lookX, lookY) {
  const r = e.radius;
  const t = time * 10 + e.phase;
  const bob = Math.sin(t * 0.7) * 2;
  ctx.translate(0, -r * 0.6 + bob);
  // flame tail
  ctx.beginPath();
  ctx.moveTo(-r * 0.9, 0);
  ctx.quadraticCurveTo(-r * 0.4 + Math.sin(t) * 2, -r * 1.7, 0, -r * 2.3 - Math.abs(Math.sin(t * 1.3)) * 4);
  ctx.quadraticCurveTo(r * 0.4 + Math.cos(t) * 2, -r * 1.7, r * 0.9, 0);
  ctx.arc(0, 0, r * 0.9, 0, Math.PI);
  ctx.closePath();
  ctx.fillStyle = e.def.color;
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = OUTLINE;
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(-r * 0.45, 0);
  ctx.quadraticCurveTo(0, -r * 1.6 + Math.sin(t * 1.1) * 2, r * 0.45, 0);
  ctx.closePath();
  ctx.fillStyle = 'rgba(255,255,255,0.7)';
  ctx.fill();
  eyes(ctx, 0, -r * 0.1, r * 0.32, r * 0.2, lookX, lookY, blink);
}

function drawBat(ctx, e, time, blink, lookX, lookY) {
  const r = e.radius;
  const t = time * 14 + e.phase;
  const flap = Math.sin(t);
  const bob = Math.sin(time * 5 + e.phase) * 3;
  ctx.translate(0, -22 + bob);
  ctx.fillStyle = e.def.dark;
  ctx.lineWidth = 2;
  ctx.strokeStyle = OUTLINE;
  for (const s of [-1, 1]) {
    ctx.save();
    ctx.scale(s, 1);
    ctx.beginPath();
    ctx.moveTo(r * 0.4, -r * 0.2);
    ctx.quadraticCurveTo(r * 1.4, -r * 1.2 - flap * r * 0.9, r * 2.2, -r * 0.4 - flap * r * 1.1);
    ctx.quadraticCurveTo(r * 1.8, r * 0.2 - flap * r * 0.5, r * 1.4, r * 0.1 - flap * r * 0.4);
    ctx.quadraticCurveTo(r * 1.0, r * 0.5 - flap * r * 0.3, r * 0.4, r * 0.3);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }
  // ears
  for (const s of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(s * r * 0.35, -r * 0.8);
    ctx.lineTo(s * r * 0.75, -r * 1.7);
    ctx.lineTo(s * r * 0.95, -r * 0.6);
    ctx.closePath();
    ctx.fillStyle = e.def.color;
    ctx.fill();
    ctx.stroke();
  }
  blob(ctx, 0, 0, r, r * 0.95, e.def.color);
  shine(ctx, -r * 0.35, -r * 0.45, r * 0.22, r * 0.13);
  eyes(ctx, 0, -r * 0.05, r * 0.36, r * 0.2, lookX, lookY, blink);
  // fangs
  ctx.fillStyle = '#fff';
  for (const s of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(s * r * 0.18, r * 0.45);
    ctx.lineTo(s * r * 0.3, r * 0.45);
    ctx.lineTo(s * r * 0.24, r * 0.7);
    ctx.closePath();
    ctx.fill();
  }
}

function drawBeetle(ctx, e, time, blink, lookX, lookY) {
  const r = e.radius;
  const t = time * 12 + e.phase;
  ctx.scale(e.facing, 1);
  // legs
  ctx.lineWidth = 2.2;
  ctx.strokeStyle = '#3a2418';
  for (let i = 0; i < 3; i++) {
    const wig = Math.sin(t + i * 1.4) * 2.5;
    for (const s of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo((i - 1) * r * 0.55, r * 0.1);
      ctx.lineTo((i - 1) * r * 0.55 + s * r * 0.9, r * 0.55 + wig * s);
      ctx.stroke();
    }
  }
  // shell
  ctx.beginPath();
  ctx.ellipse(-r * 0.15, -r * 0.35, r * 1.05, r * 0.8, 0, 0, TAU);
  ctx.fillStyle = e.def.color;
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = OUTLINE;
  ctx.stroke();
  // shell split line
  ctx.beginPath();
  ctx.moveTo(-r * 0.15, -r * 1.1);
  ctx.lineTo(-r * 0.15, r * 0.4);
  ctx.strokeStyle = e.def.dark;
  ctx.lineWidth = 1.5;
  ctx.stroke();
  shine(ctx, -r * 0.55, -r * 0.7, r * 0.25, r * 0.12);
  // head
  blob(ctx, r * 0.8, -r * 0.2, r * 0.45, r * 0.42, e.def.dark);
  eyes(ctx, r * 0.85, -r * 0.3, r * 0.17, r * 0.13, 1, lookY, blink);
  // horn
  ctx.beginPath();
  ctx.moveTo(r * 1.0, -r * 0.5);
  ctx.quadraticCurveTo(r * 1.6, -r * 0.9, r * 1.5, -r * 1.35);
  ctx.lineWidth = 3;
  ctx.strokeStyle = '#3a2418';
  ctx.stroke();
}

function drawGolem(ctx, e, time, blink, lookX, lookY) {
  const r = e.radius;
  const t = time * 5 + e.phase;
  const step = Math.sin(t);
  const isTitan = e.type === 'titan';
  ctx.scale(e.facing, 1);
  ctx.translate(0, Math.abs(step) * -2);
  // arms
  ctx.fillStyle = e.def.dark;
  ctx.lineWidth = 2;
  ctx.strokeStyle = OUTLINE;
  for (const s of [-1, 1]) {
    const swing = step * s * r * 0.25;
    roundRect(ctx, s * r * 0.95 - r * 0.28 + swing * 0.3, -r * 0.9 + swing, r * 0.56, r * 1.2, r * 0.28);
    ctx.fill();
    ctx.stroke();
  }
  // body
  roundRect(ctx, -r * 0.85, -r * 1.55, r * 1.7, r * 1.75, r * 0.45);
  ctx.fillStyle = e.def.color;
  ctx.fill();
  ctx.stroke();
  // cracks
  ctx.beginPath();
  ctx.moveTo(-r * 0.4, -r * 0.5);
  ctx.lineTo(-r * 0.15, -r * 0.2);
  ctx.lineTo(-r * 0.35, r * 0.05);
  ctx.moveTo(r * 0.3, -r * 1.2);
  ctx.lineTo(r * 0.5, -r * 0.9);
  ctx.strokeStyle = e.def.dark;
  ctx.lineWidth = 1.8;
  ctx.stroke();
  shine(ctx, -r * 0.4, -r * 1.25, r * 0.28, r * 0.12);
  // glowing eyes
  const glow = isTitan ? '#ffd166' : '#8ef0ff';
  for (const s of [-1, 1]) {
    ctx.beginPath();
    ctx.ellipse(s * r * 0.32, -r * 0.95, r * 0.16, blink ? r * 0.03 : r * 0.12, 0, 0, TAU);
    ctx.fillStyle = glow;
    ctx.shadowColor = glow;
    ctx.shadowBlur = 6;
    ctx.fill();
    ctx.shadowBlur = 0;
  }
  // mouth
  ctx.beginPath();
  ctx.moveTo(-r * 0.25, -r * 0.45);
  ctx.lineTo(r * 0.25, -r * 0.45);
  ctx.strokeStyle = '#2a2436';
  ctx.lineWidth = 2;
  ctx.stroke();
  // feet
  ctx.fillStyle = e.def.dark;
  for (const s of [-1, 1]) {
    roundRect(ctx, s * r * 0.45 - r * 0.3, r * 0.05 + (s * step > 0 ? -3 : 0), r * 0.6, r * 0.32, r * 0.12);
    ctx.fill();
    ctx.strokeStyle = OUTLINE;
    ctx.stroke();
  }
  if (isTitan) {
    ctx.scale(e.facing, 1);
    drawCrown(ctx, 0, -r * 1.7, r * 0.5);
  }
}

function drawShaman(ctx, e, time, blink, lookX, lookY) {
  const r = e.radius;
  const t = time * 6 + e.phase;
  const bob = Math.sin(t) * 1.5;
  ctx.scale(e.facing, 1);
  ctx.translate(0, bob);
  // staff
  ctx.beginPath();
  ctx.moveTo(r * 0.9, r * 0.3);
  ctx.lineTo(r * 1.1, -r * 1.6);
  ctx.lineWidth = 3;
  ctx.strokeStyle = '#6b4a2a';
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(r * 1.12, -r * 1.75, r * 0.28, 0, TAU);
  ctx.fillStyle = '#9dffc4';
  ctx.shadowColor = '#9dffc4';
  ctx.shadowBlur = 8;
  ctx.fill();
  ctx.shadowBlur = 0;
  // robe
  ctx.beginPath();
  ctx.moveTo(-r * 0.8, r * 0.35);
  ctx.quadraticCurveTo(-r * 0.6, -r * 0.9, 0, -r * 1.1);
  ctx.quadraticCurveTo(r * 0.6, -r * 0.9, r * 0.8, r * 0.35);
  ctx.closePath();
  ctx.fillStyle = e.def.color;
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = OUTLINE;
  ctx.stroke();
  // hood
  ctx.beginPath();
  ctx.moveTo(-r * 0.7, -r * 0.55);
  ctx.quadraticCurveTo(-r * 0.2, -r * 2.1, r * 0.15, -r * 1.7);
  ctx.quadraticCurveTo(r * 0.7, -r * 1.2, r * 0.7, -r * 0.55);
  ctx.closePath();
  ctx.fillStyle = e.def.dark;
  ctx.fill();
  ctx.stroke();
  // face
  blob(ctx, 0, -r * 0.65, r * 0.42, r * 0.36, '#fbe4d1', null);
  eyes(ctx, 0.02, -r * 0.7, r * 0.17, r * 0.12, 1, lookY, blink);
}

function drawDrake(ctx, e, time, blink, lookX, lookY) {
  const r = e.radius;
  const t = time * 9 + e.phase;
  const flap = Math.sin(t);
  const bob = Math.sin(time * 3 + e.phase) * 4;
  ctx.scale(e.facing, 1);
  ctx.translate(0, -26 + bob);
  ctx.lineWidth = 2;
  ctx.strokeStyle = OUTLINE;
  // wings
  ctx.fillStyle = e.def.dark;
  for (const s of [-1, 1]) {
    ctx.save();
    ctx.translate(s * r * 0.2 - r * 0.3, -r * 0.4);
    ctx.scale(1, s);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.quadraticCurveTo(-r * 0.8, -r * 1.3 - flap * r * 0.6, -r * 1.9, -r * 1.2 - flap * r * 1.0);
    ctx.quadraticCurveTo(-r * 1.4, -r * 0.5 - flap * r * 0.4, -r * 1.7, r * 0.1 - flap * r * 0.3);
    ctx.quadraticCurveTo(-r * 0.9, -r * 0.1, -r * 0.2, r * 0.3);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }
  // tail
  ctx.beginPath();
  ctx.moveTo(-r * 0.8, 0);
  ctx.quadraticCurveTo(-r * 1.6, r * 0.4 + Math.sin(t * 0.5) * 3, -r * 2.1, -r * 0.3);
  ctx.lineWidth = 5;
  ctx.strokeStyle = e.def.color;
  ctx.stroke();
  ctx.lineWidth = 2;
  ctx.strokeStyle = OUTLINE;
  // body
  blob(ctx, -r * 0.2, 0, r * 1.05, r * 0.8, e.def.color);
  // belly
  ctx.beginPath();
  ctx.ellipse(-r * 0.1, r * 0.2, r * 0.6, r * 0.4, 0, 0, TAU);
  ctx.fillStyle = '#ffd8b8';
  ctx.fill();
  // head
  blob(ctx, r * 0.8, -r * 0.5, r * 0.6, r * 0.52, e.def.color);
  // snout
  blob(ctx, r * 1.25, -r * 0.35, r * 0.3, r * 0.22, e.def.color);
  // horns
  ctx.fillStyle = '#ffe8a8';
  for (const o of [-0.1, 0.25]) {
    ctx.beginPath();
    ctx.moveTo(r * (0.55 + o), -r * 0.95);
    ctx.lineTo(r * (0.45 + o), -r * 1.5);
    ctx.lineTo(r * (0.8 + o), -r * 1.0);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }
  eyes(ctx, r * 0.85, -r * 0.6, r * 0.18, r * 0.13, 1, lookY, blink, true);
  // fire puff
  const fire = Math.sin(t * 0.8) > 0.4;
  if (fire) {
    ctx.beginPath();
    ctx.arc(r * 1.7, -r * 0.35, r * 0.2 + Math.random() * 3, 0, TAU);
    ctx.fillStyle = '#ffb347';
    ctx.fill();
  }
  drawCrown(ctx, r * 0.6, -r * 1.35, r * 0.35);
}

/** Health bar drawn above damaged enemies. */
export function drawHealthBar(ctx, e) {
  if (e.hp >= e.maxHp) return;
  const w = e.boss ? 44 : 22;
  const h = e.boss ? 5 : 3;
  const x = e.x - w / 2;
  const y = e.y - e.radius * (e.flying ? 1.4 : 1.7) - (e.flying ? 26 : 8) - (e.boss ? 8 : 0);
  ctx.fillStyle = 'rgba(20,20,30,0.7)';
  roundRect(ctx, x - 1, y - 1, w + 2, h + 2, 2);
  ctx.fill();
  const p = clamp(e.hp / e.maxHp, 0, 1);
  ctx.fillStyle = p > 0.5 ? '#6ee787' : p > 0.25 ? '#ffd166' : '#ff6b6b';
  roundRect(ctx, x, y, w * p, h, 1.5);
  ctx.fill();
}

// ------------------------------------------------------------------- towers

const STONE = '#d9d2c7';
const STONE_DARK = '#a79e92';
const WOOD = '#a0683a';
const WOOD_DARK = '#6b4322';

export function drawTowerShadow(ctx, t) {
  shadow(ctx, t.x, t.y + 12, 19, 8, 0.25);
}

export function drawTower(ctx, t, time, { ghost = false } = {}) {
  ctx.save();
  ctx.translate(t.x, t.y);
  const pop = ghost ? 1 : t.buildAnim;
  const s = pop < 1 ? 0.6 + 0.4 * (1 - Math.pow(1 - pop, 3)) * (1 + Math.sin(pop * Math.PI) * 0.12) : 1;
  ctx.scale(s, s);
  if (ghost) ctx.globalAlpha = 0.6;
  drawBase(ctx, t);
  ctx.translate(0, -10);
  switch (t.type) {
    case 'archer':
      drawArcherHead(ctx, t);
      break;
    case 'cannon':
      drawCannonHead(ctx, t);
      break;
    case 'frost':
      drawFrostHead(ctx, t, time);
      break;
    case 'tesla':
      drawTeslaHead(ctx, t, time);
      break;
    case 'sniper':
      drawSniperHead(ctx, t);
      break;
  }
  ctx.restore();
}

function drawBase(ctx, t) {
  const lvl = t.level;
  // Plinth: rounded octagon with a lit top and darker side.
  ctx.lineWidth = 2;
  ctx.strokeStyle = OUTLINE;
  ctx.fillStyle = STONE_DARK;
  roundRect(ctx, -17, -8, 34, 26, 8);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = STONE;
  roundRect(ctx, -17, -14, 34, 24, 8);
  ctx.fill();
  ctx.stroke();
  // Colored trim showing tower type.
  ctx.fillStyle = t.def.color;
  roundRect(ctx, -13, -11, 26, 5, 2.5);
  ctx.fill();
  // Level pips.
  for (let i = 0; i < 3; i++) {
    ctx.beginPath();
    ctx.arc(-8 + i * 8, 13, 2.4, 0, TAU);
    ctx.fillStyle = i <= lvl ? '#ffd35a' : 'rgba(0,0,0,0.25)';
    ctx.fill();
  }
}

function turret(ctx, t, fn) {
  ctx.save();
  ctx.rotate(t.angle);
  ctx.translate(-t.recoil * 5, 0);
  fn();
  ctx.restore();
}

function drawArcherHead(ctx, t) {
  const lvl = t.level;
  turret(ctx, t, () => {
    // stock
    ctx.fillStyle = WOOD;
    ctx.strokeStyle = OUTLINE;
    ctx.lineWidth = 2;
    roundRect(ctx, -10, -3.5, 22, 7, 3);
    ctx.fill();
    ctx.stroke();
    // bow limbs
    const spread = 10 + lvl * 2;
    ctx.beginPath();
    ctx.moveTo(4, -spread);
    ctx.quadraticCurveTo(12, 0, 4, spread);
    ctx.lineWidth = 3.5;
    ctx.strokeStyle = lvl >= 1 ? '#e8c170' : WOOD_DARK;
    ctx.stroke();
    // string
    ctx.beginPath();
    ctx.moveTo(4, -spread);
    ctx.lineTo(-2 + t.recoil * 4, 0);
    ctx.lineTo(4, spread);
    ctx.lineWidth = 1.2;
    ctx.strokeStyle = '#f5f0e6';
    ctx.stroke();
    // loaded arrow
    ctx.beginPath();
    ctx.moveTo(-4, 0);
    ctx.lineTo(13, 0);
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#3d2c1e';
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(15, 0);
    ctx.lineTo(11, -2.5);
    ctx.lineTo(11, 2.5);
    ctx.closePath();
    ctx.fillStyle = lvl >= 2 ? '#c9f0ff' : '#8c8c8c';
    ctx.fill();
  });
  // wooden pivot
  blob(ctx, 0, 0, 5, 5, WOOD_DARK, OUTLINE, 1.5);
}

function drawCannonHead(ctx, t) {
  const lvl = t.level;
  turret(ctx, t, () => {
    const len = 18 + lvl * 3;
    const w = 9 + lvl * 1.5;
    ctx.fillStyle = '#4a4756';
    ctx.strokeStyle = OUTLINE;
    ctx.lineWidth = 2;
    roundRect(ctx, -6, -w / 2, len, w, 3);
    ctx.fill();
    ctx.stroke();
    // barrel band
    ctx.fillStyle = lvl >= 2 ? '#e0b45a' : '#8d8a9b';
    roundRect(ctx, len - 12, -w / 2 - 1, 4, w + 2, 1.5);
    ctx.fill();
    // muzzle
    ctx.fillStyle = '#26232e';
    ctx.beginPath();
    ctx.ellipse(len - 6, 0, 2.5, w / 2 - 1.5, 0, 0, TAU);
    ctx.fill();
  });
  blob(ctx, 0, 0, 9, 9, '#5c5969', OUTLINE, 2);
  blob(ctx, 0, 0, 4, 4, '#8d8a9b', null);
  if (t.recoil > 0.6) {
    // muzzle flash
    ctx.save();
    ctx.rotate(t.angle);
    ctx.translate(18 + lvl * 3, 0);
    ctx.fillStyle = `rgba(255,200,90,${(t.recoil - 0.6) * 2.2})`;
    ctx.beginPath();
    ctx.arc(0, 0, 7 + lvl, 0, TAU);
    ctx.fill();
    ctx.restore();
  }
}

function drawFrostHead(ctx, t, time) {
  const lvl = t.level;
  const pulse = 0.5 + 0.5 * Math.sin(time * 3);
  const glow = 0.35 + t.charge * 0.5 + pulse * 0.15;
  ctx.save();
  ctx.shadowColor = t.def.color;
  ctx.shadowBlur = 8 + glow * 12;
  const crystals = [[0, -4, 1]];
  if (lvl >= 1) crystals.push([-9, 2, 0.6]);
  if (lvl >= 2) crystals.push([9, 2, 0.6]);
  for (const [cx, cy, s] of crystals) {
    ctx.beginPath();
    ctx.moveTo(cx, cy - 16 * s);
    ctx.lineTo(cx + 7 * s, cy - 2 * s);
    ctx.lineTo(cx, cy + 6 * s);
    ctx.lineTo(cx - 7 * s, cy - 2 * s);
    ctx.closePath();
    ctx.fillStyle = `rgba(190,235,255,${0.85})`;
    ctx.fill();
    ctx.lineWidth = 1.8;
    ctx.strokeStyle = '#4b8fc9';
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(cx, cy - 16 * s);
    ctx.lineTo(cx - 2 * s, cy - 2 * s);
    ctx.lineTo(cx, cy + 6 * s);
    ctx.strokeStyle = 'rgba(255,255,255,0.7)';
    ctx.lineWidth = 1;
    ctx.stroke();
  }
  ctx.restore();
}

function drawTeslaHead(ctx, t, time) {
  const lvl = t.level;
  // coil pole
  ctx.fillStyle = '#6a6577';
  ctx.strokeStyle = OUTLINE;
  ctx.lineWidth = 2;
  roundRect(ctx, -4, -14, 8, 18, 2);
  ctx.fill();
  ctx.stroke();
  for (let i = 0; i < 3 + lvl; i++) {
    ctx.beginPath();
    ctx.ellipse(0, 2 - i * 4, 7, 2.2, 0, 0, TAU);
    ctx.fillStyle = '#c9a3ff';
    ctx.fill();
    ctx.strokeStyle = '#5c34a8';
    ctx.lineWidth = 1;
    ctx.stroke();
  }
  // orb
  const pulse = 0.6 + 0.4 * Math.sin(time * 6);
  ctx.save();
  ctx.shadowColor = '#d9c1ff';
  ctx.shadowBlur = 10 + pulse * 8 + t.recoil * 14;
  blob(ctx, 0, -18, 6 + lvl, 6 + lvl, '#efe3ff', '#7b52d1', 1.5);
  ctx.restore();
  // idle sparks
  ctx.strokeStyle = 'rgba(230,210,255,0.9)';
  ctx.lineWidth = 1.2;
  for (let i = 0; i < 2 + lvl; i++) {
    const a = time * 9 + i * 2.5;
    const r1 = 7 + lvl;
    const r2 = r1 + 4 + Math.sin(a * 3) * 2;
    ctx.beginPath();
    ctx.moveTo(Math.cos(a) * r1, -18 + Math.sin(a) * r1);
    ctx.lineTo(Math.cos(a + 0.3) * r2, -18 + Math.sin(a + 0.3) * r2);
    ctx.stroke();
  }
}

function drawSniperHead(ctx, t) {
  const lvl = t.level;
  turret(ctx, t, () => {
    const len = 26 + lvl * 4;
    ctx.fillStyle = '#5a4634';
    ctx.strokeStyle = OUTLINE;
    ctx.lineWidth = 2;
    roundRect(ctx, -9, -3, 14, 6, 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#3b3947';
    roundRect(ctx, 3, -2, len, 4, 1.5);
    ctx.fill();
    ctx.stroke();
    // scope
    ctx.fillStyle = lvl >= 2 ? '#e0b45a' : '#8d8a9b';
    roundRect(ctx, 4, -6.5, 9, 4, 2);
    ctx.fill();
    ctx.stroke();
    if (lvl >= 1) {
      ctx.fillStyle = '#26232e';
      roundRect(ctx, len - 2, -3, 6, 6, 1.5);
      ctx.fill();
    }
  });
  blob(ctx, 0, 0, 6, 6, '#8a6a4a', OUTLINE, 1.5);
}

// ------------------------------------------------------------------ terrain

export function drawKeep(ctx, keep, time, flash) {
  ctx.save();
  ctx.translate(keep.x, keep.y);
  shadow(ctx, 0, 14, 30, 10, 0.25);
  ctx.lineWidth = 2;
  ctx.strokeStyle = OUTLINE;
  const wall = flash > 0 ? '#ffb3b3' : '#e8e0d4';
  const dark = flash > 0 ? '#d98282' : '#b3a898';
  // towers
  for (const s of [-1, 1]) {
    ctx.fillStyle = wall;
    roundRect(ctx, s * 18 - 8, -30, 16, 42, 3);
    ctx.fill();
    ctx.stroke();
    // battlements
    ctx.fillStyle = dark;
    for (let i = 0; i < 3; i++) {
      ctx.fillRect(s * 18 - 8 + i * 6, -34, 4, 5);
    }
    ctx.fillStyle = '#7d5a3c';
    roundRect(ctx, s * 18 - 5, -30, 10, 12, 5);
    ctx.fill();
  }
  // wall
  ctx.fillStyle = wall;
  roundRect(ctx, -14, -16, 28, 28, 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = dark;
  for (let i = 0; i < 4; i++) ctx.fillRect(-13 + i * 7, -20, 4, 5);
  // gate
  ctx.fillStyle = '#3d2c1e';
  ctx.beginPath();
  ctx.moveTo(-7, 12);
  ctx.lineTo(-7, -2);
  ctx.arc(0, -2, 7, Math.PI, 0);
  ctx.lineTo(7, 12);
  ctx.closePath();
  ctx.fill();
  // flag
  const wave = Math.sin(time * 6) * 2;
  ctx.beginPath();
  ctx.moveTo(0, -20);
  ctx.lineTo(0, -44);
  ctx.strokeStyle = '#5a4634';
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(0, -44);
  ctx.quadraticCurveTo(8, -42 + wave, 16, -40 + wave);
  ctx.quadraticCurveTo(8, -36 + wave * 0.5, 0, -34);
  ctx.closePath();
  ctx.fillStyle = '#ff6b8a';
  ctx.fill();
  ctx.restore();
}

export function drawSpawn(ctx, spawn, time) {
  ctx.save();
  ctx.translate(spawn.x, spawn.y);
  const a = Math.atan2(spawn.dy, spawn.dx);
  ctx.rotate(a);
  ctx.translate(14, 0);
  // cave mouth facing the road direction
  ctx.fillStyle = '#4a3b52';
  ctx.strokeStyle = OUTLINE;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-26, 22);
  ctx.lineTo(-26, -22);
  ctx.quadraticCurveTo(-6, -30, 6, -12);
  ctx.quadraticCurveTo(12, 0, 6, 12);
  ctx.quadraticCurveTo(-6, 30, -26, 22);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#20182a';
  ctx.beginPath();
  ctx.ellipse(-8, 0, 12, 14, 0, 0, TAU);
  ctx.fill();
  // swirling portal glow
  const g = 0.5 + 0.5 * Math.sin(time * 4);
  ctx.strokeStyle = `rgba(190,140,255,${0.35 + g * 0.35})`;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.ellipse(-8, 0, 7 + g * 2, 9 + g * 2, time, 0, TAU);
  ctx.stroke();
  ctx.restore();
}

export function drawDecor(ctx, d, time) {
  ctx.save();
  ctx.translate(d.x, d.y);
  ctx.scale(d.s, d.s);
  switch (d.type) {
    case 'flower': {
      const c = ['#ff8fb1', '#ffd166', '#c8a8ff', '#ffffff'][Math.floor(d.v * 4)];
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * TAU;
        ctx.beginPath();
        ctx.arc(Math.cos(a) * 3, Math.sin(a) * 3, 2.2, 0, TAU);
        ctx.fillStyle = c;
        ctx.fill();
      }
      ctx.beginPath();
      ctx.arc(0, 0, 1.8, 0, TAU);
      ctx.fillStyle = '#ffef9a';
      ctx.fill();
      break;
    }
    case 'tuft': {
      ctx.strokeStyle = 'rgba(60,120,50,0.8)';
      ctx.lineWidth = 1.6;
      for (let i = -1; i <= 1; i++) {
        ctx.beginPath();
        ctx.moveTo(i * 3, 3);
        ctx.quadraticCurveTo(i * 4, -3, i * 5, -7);
        ctx.stroke();
      }
      break;
    }
    case 'tree': {
      shadow(ctx, 2, 14, 16, 6, 0.2);
      ctx.fillStyle = '#7d5a3c';
      ctx.strokeStyle = OUTLINE;
      ctx.lineWidth = 2;
      roundRect(ctx, -4, 0, 8, 14, 3);
      ctx.fill();
      ctx.stroke();
      const sway = Math.sin(time * 1.5 + d.v * 6) * 1.2;
      for (const [ox, oy, r, col] of [[-7 + sway, -6, 11, '#4f9a4a'], [8 + sway, -4, 10, '#4f9a4a'], [sway, -14, 12, '#5db55a']]) {
        blob(ctx, ox, oy, r, r * 0.9, col);
      }
      shine(ctx, -3 + sway, -20, 4, 2);
      break;
    }
    case 'rock': {
      shadow(ctx, 2, 8, 14, 5, 0.2);
      ctx.fillStyle = '#b9b2ad';
      ctx.strokeStyle = OUTLINE;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-14, 6);
      ctx.lineTo(-10, -6);
      ctx.lineTo(0, -11);
      ctx.lineTo(11, -5);
      ctx.lineTo(14, 6);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      ctx.beginPath();
      ctx.moveTo(-8, -4);
      ctx.lineTo(0, -8);
      ctx.lineTo(3, -4);
      ctx.closePath();
      ctx.fill();
      break;
    }
  }
  ctx.restore();
}
