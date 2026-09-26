import { TOWERS, TOWER_ORDER, TARGET_MODES } from '../data/towers.js';
import { ENEMIES } from '../data/enemies.js';
import { MAPS, TILE, COLS, ROWS } from '../data/maps.js';
import { DIFFICULTIES, RULES } from '../data/config.js';
import { waveSummary, WAVE_COUNT } from '../data/waves.js';
import { drawTower, drawEnemy } from '../render/sprites.js';
import { formatNumber } from '../core/util.js';

const $ = (id) => document.getElementById(id);

/** Draw a tower icon into a small canvas. */
function towerIcon(canvas, typeId, level = 0) {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const size = canvas.width / dpr || 48;
  canvas.width = 48 * dpr;
  canvas.height = 48 * dpr;
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, 48, 48);
  const fake = { type: typeId, def: TOWERS[typeId], level, x: 24, y: 28, angle: -Math.PI / 2 + 0.6, recoil: 0, buildAnim: 1, charge: 0.5 };
  drawTower(ctx, fake, 1.2);
  void size;
}

function enemyIcon(canvas, type) {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = 24 * dpr;
  canvas.height = 24 * dpr;
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const def = ENEMIES[type];
  const fake = {
    type, def, radius: def.boss ? 8 : 7, x: 12, y: def.flying ? 14 + 22 * (def.boss ? 0.55 : 0.5) : 17, dx: 1, dy: 0, phase: 1, hitFlash: 0,
    slow: 0, flying: def.flying, boss: def.boss, facing: 1, age: 0,
  };
  if (def.flying) {
    // drawEnemy lifts flyers by ~22-26px; compensate so they sit in the icon.
    ctx.translate(0, def.boss ? 4 : 3);
  }
  drawEnemy(ctx, fake, 0.4);
}

export class Hud {
  constructor(handlers) {
    this.h = handlers;
    this.el = {
      gold: $('gold'), lives: $('lives'), waveNow: $('wave-now'), waveMax: $('wave-max'),
      statGold: $('stat-gold'), statLives: $('stat-lives'), statWave: $('stat-wave'),
      shop: $('shop'), info: $('info'), preview: $('wave-preview'),
      btnWave: $('btn-wave'), btnWaveLabel: $('btn-wave-label'), btnWaveSub: $('btn-wave-sub'), btnWaveBar: $('btn-wave-bar'),
      banner: $('banner'), bannerTitle: $('banner-title'), bannerSub: $('banner-sub'), toast: $('toast'),
      pauseVeil: $('pause-veil'), btnPause: $('btn-pause'), btnSound: $('btn-sound'), btnMusic: $('btn-music'),
      speedSeg: $('speed-seg'), mapGrid: $('map-grid'), diffGrid: $('diff-grid'), best: $('best'),
      screenMenu: $('screen-menu'), screenEnd: $('screen-end'), screenHelp: $('screen-help'),
      endTitle: $('end-title'), endSub: $('end-sub'), endStats: $('end-stats'), btnEndless: $('btn-endless'),
    };
    this.cards = {};
    this.lastGold = null;
    this.lastLives = null;
    this.infoKey = '';
    this.previewWave = -1;
    this.toastTimer = null;
    this.buildShop();
    this.bindButtons();
  }

  bindButtons() {
    const e = this.el;
    e.btnWave.addEventListener('click', () => this.h.onWave());
    e.btnPause.addEventListener('click', () => this.h.onPause());
    $('btn-resume').addEventListener('click', () => this.h.onPause());
    e.btnSound.addEventListener('click', () => this.h.onSound());
    e.btnMusic.addEventListener('click', () => this.h.onMusic());
    $('btn-help').addEventListener('click', () => this.showHelp(true));
    $('btn-menu-help').addEventListener('click', () => this.showHelp(true));
    $('btn-help-close').addEventListener('click', () => this.showHelp(false));
    $('btn-menu').addEventListener('click', () => this.h.onMenu());
    $('btn-start').addEventListener('click', () => this.h.onStart());
    $('btn-retry').addEventListener('click', () => this.h.onRetry());
    $('btn-end-menu').addEventListener('click', () => this.h.onMenu());
    e.btnEndless.addEventListener('click', () => this.h.onEndless());
    e.speedSeg.addEventListener('click', (ev) => {
      const b = ev.target.closest('[data-speed]');
      if (b) this.h.onSpeed(Number(b.dataset.speed));
    });
  }

  buildShop() {
    this.el.shop.innerHTML = '';
    for (const id of TOWER_ORDER) {
      const def = TOWERS[id];
      const card = document.createElement('button');
      card.className = 'card';
      card.dataset.tower = id;
      card.title = `${def.name} — ${def.desc}`;
      card.innerHTML = `<span class="card-key">${def.hotkey}</span><canvas width="48" height="48"></canvas><span class="card-text"><span class="card-name">${def.name}</span><span class="card-cost">🪙 ${def.cost}</span></span>`;
      towerIcon(card.querySelector('canvas'), id);
      card.addEventListener('click', () => this.h.onPick(id));
      this.el.shop.appendChild(card);
      this.cards[id] = card;
    }
  }

  /** Per-frame cheap updates (throttled by caller). */
  update(game, ui) {
    const e = this.el;
    const gold = Math.floor(game.gold);
    if (gold !== this.lastGold) {
      e.gold.textContent = formatNumber(gold);
      if (this.lastGold !== null && gold > this.lastGold) this.pulse(e.statGold, 'bump');
      this.lastGold = gold;
      for (const id of TOWER_ORDER) this.cards[id].classList.toggle('is-poor', gold < TOWERS[id].cost);
      this.infoKey = ''; // upgrade affordability may change
    }
    if (game.lives !== this.lastLives) {
      e.lives.textContent = game.lives;
      if (this.lastLives !== null && game.lives < this.lastLives) this.pulse(e.statLives, 'shake');
      this.lastLives = game.lives;
    }
    e.waveNow.textContent = game.wave;
    e.waveMax.textContent = game.endless ? '∞' : WAVE_COUNT;
    for (const id of TOWER_ORDER) this.cards[id].classList.toggle('is-active', ui.placing === id);
    this.updateWaveButton(game);
    this.updatePreview(game);
    this.updateInfo(game, ui);
    e.pauseVeil.hidden = !game.paused;
    e.btnPause.textContent = game.paused ? '▶' : '⏸';
  }

  pulse(el, cls) {
    el.classList.remove(cls);
    void el.offsetWidth;
    el.classList.add(cls);
  }

  updateWaveButton(game) {
    const e = this.el;
    const done = game.state === 'over' || game.state === 'won';
    e.btnWave.disabled = done || (!game.endless && game.wave >= WAVE_COUNT && game.state === 'wave');
    if (game.state === 'prep') {
      e.btnWaveLabel.textContent = '웨이브 시작';
      e.btnWaveSub.textContent = `${Math.ceil(game.countdown)}초 후 자동 시작 · Space`;
      e.btnWaveBar.style.width = `${(1 - game.countdown / RULES.firstWaveCountdown) * 100}%`;
    } else if (game.state === 'countdown') {
      const bonus = Math.floor(game.countdown * RULES.earlyCallBonusPerSecond);
      e.btnWaveLabel.textContent = `웨이브 ${game.wave + 1} 조기 시작`;
      e.btnWaveSub.textContent = `${Math.ceil(game.countdown)}초 · 지금 시작하면 +${bonus} 🪙`;
      e.btnWaveBar.style.width = `${(1 - game.countdown / RULES.waveCountdown) * 100}%`;
    } else if (game.state === 'wave') {
      const last = !game.endless && game.wave >= WAVE_COUNT;
      e.btnWaveLabel.textContent = last ? '최종 웨이브!' : `웨이브 ${game.wave + 1} 바로 호출`;
      e.btnWaveSub.textContent = last ? '요새를 지켜내세요' : `남은 적 ${game.enemies.length + game.spawnQueue.length}`;
      e.btnWaveBar.style.width = '0%';
    } else {
      e.btnWaveLabel.textContent = game.state === 'won' ? '승리' : '패배';
      e.btnWaveSub.textContent = '';
      e.btnWaveBar.style.width = '0%';
    }
  }

  updatePreview(game) {
    const next = game.wave + 1;
    const key = `${next}-${game.endless}`;
    if (this.previewWave === key) return;
    this.previewWave = key;
    const e = this.el.preview;
    e.innerHTML = '';
    if (!game.endless && next > WAVE_COUNT) {
      e.innerHTML = '<span class="label">마지막 웨이브입니다</span>';
      return;
    }
    const label = document.createElement('span');
    label.className = 'label';
    label.textContent = `다음 (${next})`;
    e.appendChild(label);
    const summary = waveSummary(next);
    for (const [type, count] of Object.entries(summary)) {
      const def = ENEMIES[type];
      const chip = document.createElement('span');
      chip.className = 'chip' + (def.boss ? ' boss' : '') + (def.flying ? ' air' : '');
      chip.title = `${def.name}${def.flying ? ' (공중)' : ''}${def.boss ? ' (보스)' : ''}${def.armor ? ` · 방어 ${def.armor}` : ''}${def.heal ? ' · 치유' : ''}`;
      chip.innerHTML = `<canvas width="24" height="24"></canvas>×${count}`;
      enemyIcon(chip.querySelector('canvas'), type);
      e.appendChild(chip);
    }
  }

  updateInfo(game, ui) {
    const key = ui.selected ? `t${ui.selected.id}:${ui.selected.level}:${ui.selected.targetMode}:${ui.selected.kills}` : ui.placing ? `p${ui.placing}` : 'empty';
    if (key === this.infoKey) return;
    this.infoKey = key;
    const box = this.el.info;
    if (ui.selected) {
      box.innerHTML = this.towerInfoHtml(ui.selected, game);
      box.querySelectorAll('.tm-btn').forEach((b) => b.addEventListener('click', () => this.h.onTargetMode(ui.selected, b.dataset.mode)));
      box.querySelector('#btn-upgrade')?.addEventListener('click', () => this.h.onUpgrade(ui.selected));
      box.querySelector('#btn-sell')?.addEventListener('click', () => this.h.onSell(ui.selected));
    } else if (ui.placing) {
      const def = TOWERS[ui.placing];
      const s = def.levels[0];
      box.innerHTML = `
        <div class="info-head"><div class="info-title">${def.name}</div><div class="tags">${def.tags.map((t) => `<span class="tag">${t}</span>`).join('')}</div></div>
        <div class="info-desc">${def.desc}</div>
        ${this.statRows(def, s, null)}
        <div class="info-empty">맵의 빈 칸을 클릭해 배치하세요. <b>우클릭</b> 또는 <b>Esc</b>로 취소.</div>`;
    } else {
      box.innerHTML = `<div class="info-empty"><b>타워를 골라</b> 맵에 배치하세요.<br>숫자키 <b>1–5</b>로 빠르게 고를 수 있어요.<br><br>길이 꺾이는 모서리가 명당입니다. 박쥐는 길을 무시하고 직진하니 요새 근처도 지켜주세요.</div>`;
    }
  }

  statRows(def, s, next) {
    const rows = [];
    const row = (label, v, nv, fmt = (x) => x) => {
      const up = next && nv !== undefined && nv !== v ? `<span class="up">▲${fmt(nv)}</span>` : '';
      rows.push(`<div class="stat-row"><span>${label}</span><b>${fmt(v)}${up}</b></div>`);
    };
    row('피해', s.damage, next?.damage);
    row('연사', s.rate, next?.rate, (x) => `${(+x).toFixed(1)}/s`);
    row('사거리', s.range, next?.range);
    if (s.splash) row('폭발 범위', s.splash, next?.splash);
    if (s.slow) row('둔화', s.slow, next?.slow, (x) => `${Math.round(x * 100)}%`);
    if (s.chains) row('연쇄', s.chains, next?.chains, (x) => `${x}명`);
    if (s.bossBonus) row('보스 피해', s.bossBonus, next?.bossBonus, (x) => `×${x}`);
    if (s.multishot) row('동시 발사', s.multishot, next?.multishot, (x) => `${x}발`);
    return `<div class="stat-rows">${rows.join('')}</div>`;
  }

  towerInfoHtml(t, game) {
    const def = t.def;
    const s = t.stats;
    const next = t.canUpgrade ? def.levels[t.level + 1] : null;
    const pips = [0, 1, 2].map((i) => `<span class="pip ${i <= t.level ? 'on' : ''}"></span>`).join('');
    const canAfford = next && game.gold >= t.upgradeCost;
    return `
      <div class="info-head"><div class="info-title">${def.name}</div><div class="info-lvl" title="레벨 ${t.level + 1}">${pips}</div></div>
      <div class="tags">${def.tags.map((x) => `<span class="tag">${x}</span>`).join('')}<span class="tag">처치 ${t.kills}</span><span class="tag">피해 ${formatNumber(t.damageDealt)}</span></div>
      ${this.statRows(def, s, next)}
      ${def.kind === 'pulse' ? '' : `<div class="target-modes">${TARGET_MODES.map((m) => `<button class="tm-btn ${t.targetMode === m.id ? 'is-active' : ''}" data-mode="${m.id}">${m.label}</button>`).join('')}</div>`}
      <div class="info-actions">
        <button class="btn btn-primary" id="btn-upgrade" ${next && canAfford ? '' : 'disabled'}>${next ? `업그레이드<small>🪙 ${t.upgradeCost} · U</small>` : '최대 레벨<small>더 강해질 수 없어요</small>'}</button>
        <button class="btn btn-danger" id="btn-sell">판매<small>+🪙 ${t.sellValue} · S</small></button>
      </div>`;
  }

  // ------------------------------------------------------------- feedback

  banner(title, sub = '', cls = '') {
    const e = this.el;
    e.bannerTitle.textContent = title;
    e.bannerTitle.className = 'banner-title ' + cls;
    e.bannerSub.textContent = sub;
    e.banner.classList.remove('show');
    void e.banner.offsetWidth;
    e.banner.classList.add('show');
  }

  toast(msg, warn = false) {
    const e = this.el.toast;
    e.textContent = msg;
    e.className = 'toast show' + (warn ? ' warn' : '');
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => e.classList.remove('show'), 1400);
  }

  setSpeed(speed) {
    this.el.speedSeg.querySelectorAll('.seg-btn').forEach((b) => b.classList.toggle('is-active', Number(b.dataset.speed) === speed));
  }

  setSound(muted, music) {
    this.el.btnSound.textContent = muted ? '🔇' : '🔊';
    this.el.btnSound.classList.toggle('is-off', muted);
    this.el.btnMusic.classList.toggle('is-off', !music);
  }

  showHelp(show) {
    this.el.screenHelp.hidden = !show;
  }

  // ---------------------------------------------------------------- menu

  buildMenu(selection, best) {
    const mg = this.el.mapGrid;
    mg.innerHTML = '';
    for (const m of MAPS) {
      const card = document.createElement('button');
      card.className = 'map-card' + (selection.map === m.id ? ' is-active' : '');
      card.dataset.map = m.id;
      const bestFor = Object.entries(best).filter(([k]) => k.startsWith(m.id + ':')).map(([k, v]) => `${DIFFICULTIES[k.split(':')[1]].name} ${v}`).join(' · ');
      card.innerHTML = `<canvas width="160" height="96"></canvas><div class="map-name">${m.name}</div><div class="map-sub">${m.subtitle}</div><div class="map-best">${bestFor ? '최고 웨이브: ' + bestFor : '기록 없음'}</div>`;
      this.minimap(card.querySelector('canvas'), m);
      card.addEventListener('click', () => {
        selection.map = m.id;
        mg.querySelectorAll('.map-card').forEach((c) => c.classList.toggle('is-active', c.dataset.map === m.id));
        this.h.onSelectionChange?.();
      });
      mg.appendChild(card);
    }
    const dg = this.el.diffGrid;
    dg.innerHTML = '';
    for (const d of Object.values(DIFFICULTIES)) {
      const card = document.createElement('button');
      card.className = 'diff-card' + (selection.difficulty === d.id ? ' is-active' : '');
      card.dataset.diff = d.id;
      card.innerHTML = `<div class="diff-name">${d.name}</div><div class="diff-sub">${d.desc} · ❤️ ${d.lives} · 🪙 ${d.gold}</div>`;
      card.addEventListener('click', () => {
        selection.difficulty = d.id;
        dg.querySelectorAll('.diff-card').forEach((c) => c.classList.toggle('is-active', c.dataset.diff === d.id));
        this.h.onSelectionChange?.();
      });
      dg.appendChild(card);
    }
    this.el.best.textContent = '조작법은 게임 중 ? 버튼 또는 H 키로 볼 수 있어요.';
  }

  minimap(canvas, m) {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = 160 * dpr;
    canvas.height = 96 * dpr;
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const sx = 160 / (COLS * TILE);
    const sy = 96 / (ROWS * TILE);
    ctx.fillStyle = m.theme.grass;
    ctx.fillRect(0, 0, 160, 96);
    ctx.fillStyle = m.theme.water;
    for (const [c, r] of m.water) ctx.fillRect(c * TILE * sx, r * TILE * sy, TILE * sx + 0.5, TILE * sy + 0.5);
    ctx.fillStyle = '#5f8f4a';
    for (const [c, r] of m.blocked) ctx.fillRect(c * TILE * sx, r * TILE * sy, TILE * sx + 0.5, TILE * sy + 0.5);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = TILE * sx * 0.75;
    ctx.strokeStyle = m.theme.path;
    for (const wps of m.paths) {
      ctx.beginPath();
      wps.forEach(([c, r], i) => (i ? ctx.lineTo((c + 0.5) * TILE * sx, (r + 0.5) * TILE * sy) : ctx.moveTo((c + 0.5) * TILE * sx, (r + 0.5) * TILE * sy)));
      ctx.stroke();
    }
    const last = m.paths[0][m.paths[0].length - 1];
    ctx.fillStyle = '#e8e0d4';
    ctx.fillRect((last[0] - 0.9) * TILE * sx, (last[1] - 0.2) * TILE * sy, 6, 6);
  }

  showMenu(show) {
    this.el.screenMenu.hidden = !show;
  }

  showEnd(game, { won, best }) {
    const e = this.el;
    e.screenEnd.hidden = false;
    e.endTitle.textContent = won ? (game.endless ? '무한 모드 종료' : '승리!') : '요새 함락…';
    e.endTitle.className = won ? 'win' : 'lose';
    e.endSub.textContent = won ? '30개의 웨이브를 모두 막아냈어요. 무한 모드에 도전해 보세요!' : `웨이브 ${game.wave}에서 무너졌어요.${best ? ' 최고 기록 갱신!' : ''}`;
    const s = game.stats;
    const tiles = [
      ['도달 웨이브', game.wave],
      ['처치', s.kills],
      ['획득 골드', formatNumber(s.goldEarned)],
      ['건설한 타워', s.towersBuilt],
      ['총 피해', formatNumber(s.damage)],
      ['플레이 시간', `${Math.floor(s.timePlayed / 60)}:${String(Math.floor(s.timePlayed % 60)).padStart(2, '0')}`],
    ];
    e.endStats.innerHTML = tiles.map(([k, v]) => `<div class="stat-tile"><div class="v">${v}</div><div class="k">${k}</div></div>`).join('');
    e.btnEndless.hidden = !(won && !game.endless);
  }

  hideEnd() {
    this.el.screenEnd.hidden = true;
  }
}
