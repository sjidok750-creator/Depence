import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../js/game/game.js';
import { GameMap } from '../js/game/map.js';
import { MAPS, COLS, ROWS } from '../js/data/maps.js';
import { TOWERS, TOWER_ORDER } from '../js/data/towers.js';
import { ENEMIES } from '../js/data/enemies.js';
import { WAVES, getWave, waveSummary, endlessWave } from '../js/data/waves.js';
import { angleDiff, approachAngle } from '../js/core/util.js';
import { createRng } from '../js/core/rng.js';

const DT = 1 / 60;
const run = (game, seconds) => {
  for (let i = 0; i < seconds * 60; i++) game.step(DT);
};

test('every map builds continuous paths inside the grid', () => {
  for (const def of MAPS) {
    const map = new GameMap(def);
    for (const path of map.paths) {
      assert.ok(path.length > 500, `${def.id} path too short`);
      for (const seg of path.segments) assert.ok(seg.len > 0);
      const mid = GameMap.sample(path, path.length / 2);
      assert.ok(mid.x >= 0 && mid.x <= map.width && mid.y >= 0 && mid.y <= map.height);
    }
    // Consecutive waypoints share a row or column (axis-aligned road).
    for (const wps of def.paths) {
      for (let i = 1; i < wps.length; i++) {
        assert.ok(wps[i][0] === wps[i - 1][0] || wps[i][1] === wps[i - 1][1], `${def.id} diagonal segment at ${i}`);
      }
    }
    // Enough buildable tiles remain.
    let buildable = 0;
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) if (map.canBuild(c, r)) buildable++;
    assert.ok(buildable > 100, `${def.id} has only ${buildable} buildable tiles`);
    // Water and blocked tiles never overlap the road.
    for (const [c, r] of [...def.water, ...def.blocked]) assert.ok(!map.isPath(c, r), `${def.id} obstacle on road at ${c},${r}`);
  }
});

test('wave data references valid enemies and counts', () => {
  assert.equal(WAVES.length, 30);
  for (let w = 1; w <= 40; w++) {
    for (const grp of getWave(w)) {
      assert.ok(ENEMIES[grp.type], `unknown enemy ${grp.type} in wave ${w}`);
      assert.ok(grp.count >= 1);
      assert.ok(grp.interval >= 0);
    }
    const total = Object.values(waveSummary(w)).reduce((a, b) => a + b, 0);
    assert.ok(total >= 1);
  }
  assert.ok(endlessWave(35).some((gp) => gp.type === 'titan'));
});

test('tower data is consistent (3 levels, rising stats)', () => {
  for (const id of TOWER_ORDER) {
    const def = TOWERS[id];
    assert.equal(def.levels.length, 3);
    assert.equal(def.levels[0].cost, 0);
    for (let i = 1; i < 3; i++) {
      assert.ok(def.levels[i].cost > 0);
      assert.ok(def.levels[i].damage >= def.levels[i - 1].damage);
      assert.ok(def.levels[i].range >= def.levels[i - 1].range);
    }
  }
});

test('angle helpers take the shortest arc', () => {
  assert.ok(Math.abs(angleDiff(0.1, -0.1) + 0.2) < 1e-9);
  assert.ok(Math.abs(angleDiff(3, -3) - (2 * Math.PI - 6)) < 1e-9);
  const a = approachAngle(3, -3, 0.1);
  assert.ok(a > 3, 'should wrap around through PI');
});

test('rng is deterministic', () => {
  const a = createRng(7);
  const b = createRng(7);
  for (let i = 0; i < 10; i++) assert.equal(a.next(), b.next());
});

test('placing, upgrading and selling towers moves gold correctly', () => {
  const game = new Game({ mapId: 'meadow', difficulty: 'normal' });
  const start = game.gold;
  assert.equal(game.placeTower('archer', 0, 2), null, 'cannot build on the road');
  const t = game.placeTower('archer', 1, 0);
  assert.ok(t);
  assert.equal(game.gold, start - TOWERS.archer.cost);
  assert.equal(game.placeTower('archer', 1, 0), null, 'tile occupied');
  assert.ok(game.upgradeTower(t));
  assert.equal(t.level, 1);
  assert.equal(game.gold, start - TOWERS.archer.cost - TOWERS.archer.levels[1].cost);
  const value = game.sellTower(t);
  assert.equal(value, Math.floor((TOWERS.archer.cost + TOWERS.archer.levels[1].cost) * 0.7));
  assert.equal(game.towers.length, 0);
  assert.ok(game.map.canBuild(1, 0));
});

test('enemies walk the road and leak lives at the keep', () => {
  const game = new Game({ mapId: 'meadow', difficulty: 'normal' });
  game.startNextWave();
  run(game, 60);
  assert.ok(game.stats.leaks > 0, 'undefended wave should leak');
  assert.ok(game.lives < 20);
});

test('flying enemies ignore the road and cannot be hit by cannons', () => {
  const game = new Game({ mapId: 'meadow', difficulty: 'normal' });
  game.gold = 10000;
  game.startNextWave();
  const bat = game.spawnEnemy('bat');
  assert.equal(bat.path, game.map.airPaths[bat.pathIndex]);
  const cannon = game.placeTower('cannon', 1, 1);
  const archer = game.placeTower('archer', 1, 3);
  bat.x = cannon.x + 10;
  bat.y = cannon.y + 10;
  assert.equal(cannon.canTarget(bat), false);
  assert.equal(archer.canTarget(bat), true);
});

test('armor reduces damage but pierce ignores it; bosses take sniper bonus', () => {
  const game = new Game({ mapId: 'meadow' });
  game.startNextWave();
  const beetle = game.spawnEnemy('beetle');
  const dealt = game.hitEnemy(beetle, 10);
  assert.equal(dealt, 6);
  const dealt2 = game.hitEnemy(beetle, 10, { pierce: true });
  assert.equal(dealt2, 10);
  const boss = game.spawnEnemy('slimeKing');
  const dealt3 = game.hitEnemy(boss, 100, { pierce: true, bossBonus: 1.6 });
  assert.equal(dealt3, 160);
});

test('slow keeps the strongest value and expires', () => {
  const game = new Game({ mapId: 'meadow' });
  game.startNextWave();
  const e = game.spawnEnemy('slime');
  e.applySlow(0.4, 1);
  e.applySlow(0.2, 5);
  assert.equal(e.slow, 0.4);
  e.update(1.2);
  assert.equal(e.slow, 0);
});

test('slime king splits into slimes on death', () => {
  const game = new Game({ mapId: 'meadow' });
  game.startNextWave();
  const king = game.spawnEnemy('slimeKing');
  king.dist = 200;
  game.hitEnemy(king, 1e9, { pierce: true });
  const slimes = game.enemies.filter((e) => e.type === 'slime' && e.alive);
  assert.equal(slimes.length, 5);
  assert.ok(slimes.every((s) => s.dist > 150));
});

test('a defended first wave is cleared and pays a bonus', () => {
  const game = new Game({ mapId: 'meadow', difficulty: 'normal' });
  game.placeTower('archer', 2, 3);
  game.placeTower('archer', 4, 3);
  game.placeTower('archer', 2, 1);
  const cleared = [];
  game.events.on('wave-clear', (e) => cleared.push(e.wave));
  game.startNextWave();
  run(game, 30);
  assert.deepEqual(cleared, [1]);
  assert.equal(game.state, 'countdown');
  assert.equal(game.lives, 20);
  assert.ok(game.stats.kills >= 8);
});

test('calling a wave early pays a countdown bonus', () => {
  const game = new Game({ mapId: 'meadow', difficulty: 'normal' });
  game.state = 'countdown';
  game.countdown = 10;
  const before = game.gold;
  game.startNextWave({ manual: true });
  assert.equal(game.gold, before + 15);
  assert.equal(game.wave, 1);
});

test('game over fires when lives reach zero', () => {
  const game = new Game({ mapId: 'meadow', difficulty: 'hard' });
  let over = false;
  game.events.on('gameover', () => (over = true));
  for (let w = 0; w < 3; w++) game.startNextWave();
  run(game, 120);
  assert.ok(over);
  assert.equal(game.state, 'over');
});

test('victory at wave 30 and endless continuation', () => {
  const game = new Game({ mapId: 'meadow', difficulty: 'easy' });
  let won = false;
  game.events.on('victory', () => (won = true));
  game.wave = 29;
  game.state = 'countdown';
  game.countdown = 0.01;
  game.gold = 100000;
  // Ring the whole map with maxed snipers so the final wave dies quickly.
  for (let r = 0; r < 12; r++) for (let c = 0; c < 20; c += 2) {
    const t = game.placeTower('sniper', c, r);
    if (t) { game.upgradeTower(t); game.upgradeTower(t); }
  }
  run(game, 150);
  assert.ok(won, 'expected victory');
  assert.equal(game.state, 'won');
  assert.equal(game.startNextWave(), false, 'no more waves without endless');
  game.continueEndless();
  assert.equal(game.state, 'countdown');
  assert.ok(game.startNextWave({ manual: true }));
  assert.equal(game.wave, 31);
  assert.ok(game.spawnQueue.length > 30);
});

test('towers only fire when the turret faces the target', () => {
  const game = new Game({ mapId: 'meadow' });
  game.gold = 1000;
  game.startNextWave();
  const t = game.placeTower('cannon', 2, 3); // road runs above and left of it
  const e = game.spawnEnemy('slime');
  e.dist = 48 * 3.5; // near (3, 2)
  e.update(0);
  t.angle = Math.PI / 2; // facing down, away from the enemy
  t.cooldown = 0;
  t.update(1 / 60, game);
  assert.equal(game.projectiles.length, 0, 'fired before turning');
  run(game, 1);
  assert.ok(game.projectiles.length > 0 || game.stats.damage > 0, 'never fired after turning');
});
