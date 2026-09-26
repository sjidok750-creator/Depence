import { Game } from './game/game.js';
import { Renderer } from './render/renderer.js';
import { Input } from './core/input.js';
import { AudioEngine } from './core/audio.js';
import { Hud } from './ui/hud.js';
import { TOWERS, TOWER_ORDER, TARGET_MODES } from './data/towers.js';
import { RULES } from './data/config.js';
import { drawEnemy } from './render/sprites.js';
import { ENEMIES } from './data/enemies.js';
import { waveSummary } from './data/waves.js';

const canvas = document.getElementById('game');
const app = document.getElementById('app');
const renderer = new Renderer(canvas);
const audio = new AudioEngine();

const STORAGE = 'tb.save.v1';
const store = load();
const selection = { map: store.map || 'meadow', difficulty: store.difficulty || 'normal' };

let game = null;
const ui = { hover: null, placing: null, selected: null, touchPreview: null };
let running = false;
let lastFrame = 0;
let acc = 0;
let hudTick = 0;

function load() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE) || '{}');
  } catch {
    return {};
  }
}
function save() {
  try {
    localStorage.setItem(STORAGE, JSON.stringify(store));
  } catch {
    /* ignore */
  }
}

// ------------------------------------------------------------------ HUD

const hud = new Hud({
  onPick: (id) => pickTower(id),
  onWave: () => callWave(),
  onPause: () => togglePause(),
  onSound: () => {
    audio.unlock();
    audio.setMuted(!audio.muted);
    hud.setSound(audio.muted, audio.musicOn);
  },
  onMusic: () => {
    audio.unlock();
    audio.setMusic(!audio.musicOn);
    hud.setSound(audio.muted, audio.musicOn);
  },
  onSpeed: (s) => setSpeed(s),
  onMenu: () => showMenu(),
  onStart: () => startGame(selection.map, selection.difficulty),
  onRetry: () => startGame(game ? game.mapDef.id : selection.map, game ? game.difficulty.id : selection.difficulty),
  onEndless: () => {
    hud.hideEnd();
    game.continueEndless();
    running = true;
    hud.banner('무한 모드', '얼마나 버틸 수 있을까요?', '');
  },
  onTargetMode: (t, mode) => {
    t.targetMode = mode;
    t.target = null;
    audio.play('select');
  },
  onUpgrade: (t) => upgrade(t),
  onSell: (t) => sell(t),
  onSelectionChange: () => {
    store.map = selection.map;
    store.difficulty = selection.difficulty;
    save();
  },
});
hud.setSound(audio.muted, audio.musicOn);

// ---------------------------------------------------------------- input

const input = new Input(canvas, {
  onHover: (t) => {
    ui.hover = t;
    updateCursor();
  },
  onClick: (t, e) => {
    audio.unlock();
    if (!game || game.paused) return;
    if (ui.placing) {
      // Touch has no hover: first tap previews the ghost, second tap confirms.
      if (e && e.pointerType === 'touch' && !(ui.touchPreview && ui.touchPreview.c === t.c && ui.touchPreview.r === t.r)) {
        ui.touchPreview = { c: t.c, r: t.r };
        ui.hover = t;
        return;
      }
      ui.touchPreview = null;
      if (game.canPlace(ui.placing, t.c, t.r)) {
        game.placeTower(ui.placing, t.c, t.r);
        // Keep placing if affordable (fast building), otherwise drop the tool.
        if (game.gold < TOWERS[ui.placing].cost) ui.placing = null;
      } else if (!game.map.canBuild(t.c, t.r)) {
        const existing = game.map.towerAt(t.c, t.r);
        if (existing) {
          ui.placing = null;
          select(existing);
        } else {
          hud.toast('여기에는 건설할 수 없어요', true);
          audio.play('deny');
        }
      } else {
        hud.toast('골드가 부족해요', true);
        audio.play('deny');
      }
      updateCursor();
      return;
    }
    const tower = game.map.towerAt(t.c, t.r);
    if (tower) select(tower);
    else if (ui.selected) select(null);
  },
  onCancel: () => cancel(),
  onKey: (key, e) => onKey(key, e),
});

function updateCursor() {
  canvas.classList.toggle('is-placing', !!ui.placing);
  canvas.classList.toggle('is-pointer', !ui.placing && !!(ui.hover && game && game.map.towerAt(ui.hover.c, ui.hover.r)));
}

function select(tower) {
  ui.selected = tower;
  if (tower) audio.play('select');
}

function cancel() {
  if (ui.placing) ui.placing = null;
  else ui.selected = null;
  updateCursor();
}

function pickTower(id) {
  audio.unlock();
  if (!game || game.state === 'over' || game.state === 'won') return;
  if (ui.placing === id) {
    ui.placing = null;
  } else if (game.gold < TOWERS[id].cost) {
    hud.toast(`${TOWERS[id].name}은(는) 🪙 ${TOWERS[id].cost}이 필요해요`, true);
    audio.play('deny');
  } else {
    ui.placing = id;
    ui.selected = null;
    audio.play('select');
  }
  updateCursor();
}

function upgrade(t) {
  if (!t) return;
  if (!t.canUpgrade) return hud.toast('이미 최대 레벨이에요');
  if (!game.upgradeTower(t)) {
    hud.toast(`업그레이드에 🪙 ${t.upgradeCost}이 필요해요`, true);
    audio.play('deny');
  }
}

function sell(t) {
  if (!t) return;
  game.sellTower(t);
  if (ui.selected === t) ui.selected = null;
}

function callWave() {
  audio.unlock();
  if (!game || game.paused) return;
  if (game.state === 'prep' || game.state === 'countdown') game.startNextWave({ manual: true });
  else if (game.state === 'wave' && (game.endless || game.wave < game.finalWave)) game.startNextWave({ manual: true });
}

function togglePause() {
  if (!game || game.state === 'over' || game.state === 'won') return;
  game.togglePause();
}

function setSpeed(s) {
  if (!game) return;
  game.setSpeed(s);
  hud.setSpeed(game.speed);
}

function onKey(key, e) {
  audio.unlock();
  if (!hud.el.screenHelp.hidden) {
    if (key === 'Escape' || key === 'h' || key === 'H') hud.showHelp(false);
    return true;
  }
  if (!game || !hud.el.screenMenu.hidden || !hud.el.screenEnd.hidden) {
    if (key === 'Enter' && !hud.el.screenMenu.hidden) startGame(selection.map, selection.difficulty);
    return false;
  }
  const k = key.toLowerCase();
  const towerIdx = ['1', '2', '3', '4', '5'].indexOf(key);
  if (towerIdx >= 0) {
    pickTower(TOWER_ORDER[towerIdx]);
    return true;
  }
  switch (k) {
    case 'escape':
      cancel();
      return true;
    case ' ':
      callWave();
      return true;
    case 'p':
      togglePause();
      return true;
    case 'f':
      setSpeed(game.speed >= RULES.maxSpeed ? 1 : game.speed + 1);
      return true;
    case 'm':
      hud.h.onSound();
      return true;
    case 'h':
      hud.showHelp(true);
      return true;
    case 'u':
      upgrade(ui.selected);
      return true;
    case 's':
      sell(ui.selected);
      return true;
    case 't':
      if (ui.selected && ui.selected.def.kind !== 'pulse') {
        const i = TARGET_MODES.findIndex((m) => m.id === ui.selected.targetMode);
        hud.h.onTargetMode(ui.selected, TARGET_MODES[(i + 1) % TARGET_MODES.length].id);
      }
      return true;
    case 'r':
      if (e.shiftKey) startGame(game.mapDef.id, game.difficulty.id);
      return true;
  }
  return false;
}

// ---------------------------------------------------------------- game flow

function startGame(mapId, difficulty) {
  audio.unlock();
  game = new Game({ mapId, difficulty });
  ui.hover = null;
  ui.placing = null;
  ui.selected = null;
  hud.lastGold = null;
  hud.lastLives = null;
  hud.infoKey = '';
  hud.previewWave = -1;
  hud.hideEnd();
  hud.showMenu(false);
  hud.showHelp(false);
  hud.setSpeed(1);
  wireEvents(game);
  running = true;
  lastFrame = performance.now();
  acc = 0;
  hud.banner(game.mapDef.name, `${game.difficulty.name} · 타워를 배치하고 웨이브를 시작하세요`, '');
  window.__tb.game = game;
}

function wireEvents(g) {
  const ev = g.events;
  for (const name of ['shoot', 'explode', 'kill', 'gold', 'place', 'upgrade', 'sell', 'leak', 'pause']) ev.on(name, (p) => audio.play(name, p));
  ev.on('wave-start', ({ wave, boss }) => {
    audio.play('wave-start', { boss });
    hud.banner(boss ? `보스 웨이브 ${wave}` : `웨이브 ${wave}`, boss ? '강력한 적이 다가옵니다!' : waveHint(wave), boss ? 'boss' : '');
  });
  ev.on('wave-clear', ({ wave, bonus }) => {
    audio.play('wave-clear');
    if (g.state !== 'won') hud.banner(`웨이브 ${wave} 클리어`, `보너스 +${bonus} 🪙`, 'clear');
  });
  ev.on('gameover', () => {
    audio.play('gameover');
    running = false;
    const best = recordBest(g);
    setTimeout(() => hud.showEnd(g, { won: false, best }), 900);
  });
  ev.on('victory', () => {
    audio.play('victory');
    running = false;
    recordBest(g);
    setTimeout(() => hud.showEnd(g, { won: true }), 1200);
  });
}

function waveHint(wave) {
  const types = new Set(Object.keys(waveSummary(wave)));
  if (types.has('bat')) return '박쥐는 길을 무시하고 날아옵니다';
  if (types.has('shaman')) return '주술사가 아군을 치료합니다';
  if (types.has('beetle')) return '딱정벌레는 방어력이 있어요';
  if (types.has('golem')) return '골렘은 튼튼합니다. 화력을 집중하세요';
  return '요새를 지켜내세요';
}

function recordBest(g) {
  store.best = store.best || {};
  const key = `${g.mapDef.id}:${g.difficulty.id}`;
  const reached = g.state === 'won' ? g.wave : Math.max(0, g.wave - 1);
  const prev = store.best[key] || 0;
  if (reached > prev) {
    store.best[key] = reached;
    save();
    return true;
  }
  return false;
}

function showMenu() {
  running = false;
  if (game) game.paused = false;
  hud.hideEnd();
  hud.buildMenu(selection, store.best || {});
  hud.showMenu(true);
}

// ------------------------------------------------------------------- loop

function frame(now) {
  requestAnimationFrame(frame);
  const dtReal = Math.min(0.1, (now - lastFrame) / 1000);
  lastFrame = now;
  if (!game) return;
  if (running && !game.paused) {
    acc += dtReal * game.speed;
    const step = 1 / RULES.tickRate;
    let n = 0;
    while (acc >= step && n < 12) {
      game.step(step);
      acc -= step;
      n++;
    }
    if (n === 12) acc = 0; // drop time if the tab was throttled
  }
  if (ui.selected && !game.towers.includes(ui.selected)) ui.selected = null;
  renderer.draw(game, ui, game.paused ? 0 : dtReal * game.speed);
  hudTick += dtReal;
  if (hudTick > 0.08) {
    hudTick = 0;
    hud.update(game, ui);
  }
}

// ----------------------------------------------------------------- layout

function layout() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  const portrait = h > w * 1.05;
  app.classList.toggle('portrait', portrait);
  const aw = portrait ? 976 : 1216;
  const ah = portrait ? 880 : 652;
  const scale = Math.min(w / aw, h / ah);
  app.style.transform = `translate(-50%, -50%) scale(${scale})`;
  app.style.left = '50%';
  app.style.top = '50%';
  app.style.transformOrigin = 'center center';
  renderer.resize(scale);
  if (game) renderer.buildTerrain(game.map);
}
window.addEventListener('resize', layout);
// Auto-pause when the tab is hidden so a wave never runs unattended.
document.addEventListener('visibilitychange', () => {
  if (document.hidden && game && running && !game.paused && game.state !== 'over' && game.state !== 'won') game.togglePause();
});
layout();

// Menu hero: a few cute characters bouncing.
(function heroLoop() {
  const c = document.getElementById('menu-hero-canvas');
  const ctx = c.getContext('2d');
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  c.width = 360 * dpr;
  c.height = 120 * dpr;
  const cast = ['slime', 'bat', 'beetle', 'wisp', 'golem', 'shaman'].map((type, i) => ({
    type, def: ENEMIES[type], radius: ENEMIES[type].radius * 0.9, x: 45 + i * 54, y: 92, dx: 1, dy: 0, phase: i * 1.3, hitFlash: 0, slow: 0,
    flying: ENEMIES[type].flying, boss: false, facing: 1, age: 0,
  }));
  let t = 0;
  const tick = () => {
    requestAnimationFrame(tick);
    if (hud.el.screenMenu.hidden) return;
    t += 1 / 60;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, 360, 120);
    for (const e of cast) drawEnemy(ctx, e, t);
  };
  tick();
})();

// Expose a tiny handle for automated tests and curious players.
window.__tb = { get game() { return game; }, set game(v) { game = v; }, ui, startGame, selection, renderer, hud };

hud.buildMenu(selection, store.best || {});
hud.showMenu(true);
requestAnimationFrame((t) => {
  lastFrame = t;
  requestAnimationFrame(frame);
});
