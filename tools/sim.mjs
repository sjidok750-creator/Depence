// Headless balance simulator. A greedy bot builds and upgrades towers on
// every map/difficulty and reports lives lost per wave. Used to tune the
// numbers so the game is winnable with sensible play but not trivial.
//   node tools/sim.mjs [--map meadow] [--diff normal] [--verbose]

import { Game } from '../js/game/game.js';
import { GameMap } from '../js/game/map.js';
import { MAPS, COLS, ROWS } from '../js/data/maps.js';
import { TOWERS, TOWER_ORDER } from '../js/data/towers.js';
import { WAVE_COUNT } from '../js/data/waves.js';
import { createRng } from '../js/core/rng.js';

const args = process.argv.slice(2);
const opt = (name, def) => {
  const i = args.indexOf('--' + name);
  return i >= 0 ? args[i + 1] : def;
};
const verbose = args.includes('--verbose');

function coverageScores(map) {
  // Sample points along every ground path + air path.
  const samples = [];
  for (const p of map.paths) for (let d = 0; d < p.length; d += 12) samples.push({ ...GameMap.sample(p, d), air: false });
  for (const p of map.airPaths) for (let d = 0; d < p.length; d += 12) samples.push({ ...GameMap.sample(p, d), air: true });
  return (c, r, range, groundOnly) => {
    const x = (c + 0.5) * map.tile;
    const y = (r + 0.5) * map.tile;
    let n = 0;
    for (const s of samples) {
      if (groundOnly && s.air) continue;
      if ((s.x - x) ** 2 + (s.y - y) ** 2 <= range * range) n++;
    }
    return n;
  };
}

// Rough single-target DPS estimate for ranking build options.
function dps(def, level) {
  const s = def.levels[level];
  switch (def.kind) {
    case 'projectile': return s.damage * s.rate * (s.multishot || 1);
    case 'artillery': return s.damage * s.rate * 2.2; // splash value
    case 'pulse': return s.damage * s.rate + 25 * s.slow; // slow utility
    case 'chain': return s.damage * s.rate * (1 + s.chains * 0.5);
    case 'hitscan': return s.damage * s.rate * 1.15;
  }
  return 0;
}

function runOne(mapId, diff, seed = 1) {
  const rng = createRng(seed);
  const game = new Game({ mapId, difficulty: diff, random: rng.next });
  const map = game.map;
  const cover = coverageScores(map);
  const results = [];
  let livesAtWaveStart = game.lives;
  game.events.on('wave-start', () => (livesAtWaveStart = game.lives));
  game.events.on('wave-clear', ({ wave }) => results.push({ wave, lost: livesAtWaveStart - game.lives, gold: game.gold, towers: game.towers.length }));

  const counts = () => {
    const c = {};
    for (const t of game.towers) c[t.type] = (c[t.type] || 0) + 1;
    return c;
  };

  // Target composition a sensible player might aim for.
  const RATIO = { archer: 0.34, cannon: 0.2, frost: 0.12, tesla: 0.16, sniper: 0.18 };
  const UNLOCK = { archer: 1, cannon: 1, frost: 3, tesla: 4, sniper: 6 };

  function decide() {
    const options = [];
    const have = counts();
    const total = game.towers.length || 1;
    for (const id of TOWER_ORDER) {
      const def = TOWERS[id];
      if (game.gold < def.cost || game.wave < UNLOCK[id]) continue;
      const deficit = RATIO[id] - (have[id] || 0) / total; // >0 means under-represented
      let best = null;
      for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
          if (!map.canBuild(c, r)) continue;
          const cov = cover(c, r, def.levels[0].range, def.groundOnly);
          if (!best || cov > best.cov) best = { c, r, cov };
        }
      }
      if (best && best.cov > 4) options.push({ kind: 'build', id, c: best.c, r: best.r, value: (dps(def, 0) * best.cov) / def.cost * (1 + deficit * 3) });
    }
    for (const t of game.towers) {
      if (!t.canUpgrade || game.gold < t.upgradeCost) continue;
      const gain = dps(t.def, t.level + 1) - dps(t.def, t.level);
      const cov = cover(t.c, t.r, t.def.levels[t.level + 1].range, t.def.groundOnly);
      options.push({ kind: 'upgrade', tower: t, value: (gain * cov) / t.upgradeCost });
    }
    if (!options.length) return false;
    options.sort((a, b) => b.value - a.value);
    const pick = options[0];
    if (pick.kind === 'build') game.placeTower(pick.id, pick.c, pick.r);
    else game.upgradeTower(pick.tower);
    return true;
  }

  const DT = 1 / 60;
  let ticks = 0;
  game.startNextWave();
  while (game.state !== 'over' && game.state !== 'won' && ticks < 60 * 60 * 60) {
    if (ticks % 30 === 0) {
      // A human-ish player acts a couple of times per second.
      let acted = 0;
      while (acted < 3 && decide()) acted++;
    }
    if (game.state === 'countdown' && game.countdown < 18) game.startNextWave({ manual: true });
    game.step(DT);
    ticks++;
  }
  return { game, results };
}

const mapsToRun = opt('map', null) ? [opt('map')] : MAPS.map((m) => m.id);
const diffsToRun = opt('diff', null) ? [opt('diff')] : ['easy', 'normal', 'hard'];
let failures = 0;
for (const mapId of mapsToRun) {
  for (const diff of diffsToRun) {
    const { game, results } = runOne(mapId, diff);
    const lost = results.reduce((a, r) => a + r.lost, 0);
    const status = game.state === 'won' ? 'WON ' : `LOST@${game.wave}`;
    if (game.state !== 'won') failures++;
    console.log(`${mapId.padEnd(7)} ${diff.padEnd(6)} ${status} lives=${game.lives} leaksTotal=${lost} towers=${game.towers.length} gold=${game.gold} kills=${game.stats.kills} time=${Math.round(game.stats.timePlayed)}s`);
    if (verbose) {
      console.log('  ' + results.map((r) => `w${r.wave}:${r.lost ? '-' + r.lost : '·'}`).join(' '));
      const comp = {};
      for (const t of game.towers) comp[`${t.type}${t.level + 1}`] = (comp[`${t.type}${t.level + 1}`] || 0) + 1;
      console.log('  ' + JSON.stringify(comp));
    }
  }
}
if (failures) {
  console.log(`\n${failures} run(s) lost — tune the numbers.`);
  process.exitCode = 1;
} else {
  console.log(`\nAll ${mapsToRun.length * diffsToRun.length} runs cleared wave ${WAVE_COUNT}.`);
}
