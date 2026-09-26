// End-to-end smoke test: boots the real page in headless Chromium, plays a
// few waves through the actual UI (clicks + keys), captures screenshots and
// fails on any console error or unexpected state.
//   node tools/e2e.mjs
import { chromium } from 'playwright-core';
import { createServer } from 'node:http';
import { readFile, stat, mkdir } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const SHOTS = join(ROOT, 'tools', 'shots');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };
const server = createServer(async (req, res) => {
  try {
    let path = new URL(req.url, 'http://x').pathname;
    if (path.endsWith('/')) path += 'index.html';
    const file = join(ROOT, normalize(path));
    await stat(file);
    res.writeHead(200, { 'Content-Type': TYPES[extname(file)] || 'application/octet-stream' });
    res.end(await readFile(file));
  } catch {
    res.writeHead(404);
    res.end();
  }
});
await new Promise((r) => server.listen(0, r));
const url = `http://127.0.0.1:${server.address().port}/`;
await mkdir(SHOTS, { recursive: true });

const exe = process.env.CHROME_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const browser = await chromium.launch({ executablePath: exe, args: ['--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport: { width: 1400, height: 800 }, deviceScaleFactor: 1 });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push(String(e)));

const assert = (cond, msg) => { if (!cond) throw new Error('ASSERT: ' + msg); };
const shot = (name) => page.screenshot({ path: join(SHOTS, name + '.png') });

await page.goto(url);
await page.waitForFunction(() => window.__tb && document.getElementById('map-grid').children.length === 3);
await page.waitForTimeout(300);
await shot('01-menu');

// Pick map + difficulty through the menu and start.
await page.click('.map-card[data-map="meadow"]');
await page.click('.diff-card[data-diff="normal"]');
await page.click('#btn-start');
await page.waitForFunction(() => window.__tb.game && document.getElementById('screen-menu').hidden);
await page.waitForTimeout(400);
await shot('02-prep');

// Canvas helpers: click tile via real pointer events on the scaled canvas.
const tile = async (c, r) => {
  const box = await page.locator('#game').boundingBox();
  return { x: box.x + ((c + 0.5) / 20) * box.width, y: box.y + ((r + 0.5) / 12) * box.height };
};
const clickTile = async (c, r) => { const p = await tile(c, r); await page.mouse.click(p.x, p.y); };
const hoverTile = async (c, r) => { const p = await tile(c, r); await page.mouse.move(p.x, p.y); };

// Build: hotkey 1 (archer), hover shows ghost, click places.
await page.keyboard.press('1');
await hoverTile(2, 3);
await page.waitForTimeout(150);
await shot('03-ghost');
await clickTile(2, 3);
await clickTile(4, 3);
let n = await page.evaluate(() => window.__tb.game.towers.length);
assert(n === 2, `expected 2 towers, got ${n}`);
// Placing on the road must fail with a toast, not a tower.
await clickTile(3, 5);
n = await page.evaluate(() => window.__tb.game.towers.length);
assert(n === 2, 'tower placed on road');
const toast = await page.textContent('#toast');
assert(toast.includes('건설'), 'no toast for invalid placement: ' + toast);
// Shop card click + cancel via Escape.
await page.click('.card[data-tower="frost"]');
assert((await page.evaluate(() => window.__tb.ui.placing)) === 'frost', 'frost not picked');
await page.keyboard.press('Escape');
assert((await page.evaluate(() => window.__tb.ui.placing)) === null, 'escape did not cancel');

// Select a tower, cycle target mode, upgrade with U, sell with S.
await clickTile(2, 3);
await page.waitForTimeout(150);
assert((await page.evaluate(() => window.__tb.ui.selected?.type)) === 'archer', 'tower not selected');
await page.keyboard.press('t');
assert((await page.evaluate(() => window.__tb.ui.selected.targetMode)) === 'last', 'target mode did not cycle');
await page.waitForTimeout(150);
await shot('04-selected');
const goldBefore = await page.evaluate(() => window.__tb.game.gold);
await page.keyboard.press('u');
const lvl = await page.evaluate(() => window.__tb.ui.selected.level);
assert(lvl === 1, 'upgrade via U failed');
await page.waitForTimeout(120);
await page.click('#btn-sell');
n = await page.evaluate(() => window.__tb.game.towers.length);
assert(n === 1, 'sell via button failed');
const goldAfter = await page.evaluate(() => window.__tb.game.gold);
assert(goldAfter > goldBefore - 55 && goldAfter < goldBefore + 60, `sell refund odd: ${goldBefore} -> ${goldAfter}`);

// Rebuild a decent defence quickly through the API-free path (hotkeys + clicks).
await page.keyboard.press('1');
await clickTile(2, 3);
await clickTile(4, 3);
await page.keyboard.press('Escape');

// Space starts the wave; F cycles speed; P pauses.
await page.keyboard.press(' ');
assert((await page.evaluate(() => window.__tb.game.state)) === 'wave', 'space did not start wave');
await page.keyboard.press('f');
assert((await page.evaluate(() => window.__tb.game.speed)) === 2, 'F did not change speed');
await page.keyboard.press('p');
assert((await page.evaluate(() => window.__tb.game.paused)) === true, 'P did not pause');
await page.waitForTimeout(200);
await shot('05-paused');
await page.click('#btn-resume');
assert((await page.evaluate(() => window.__tb.game.paused)) === false, 'resume failed');
await page.click('[data-speed="3"]');

// Let the wave play out at 3x; take an action shot mid-wave.
await page.waitForTimeout(2500);
await shot('06-wave');
await page.waitForFunction(() => window.__tb.game.state === 'countdown' || window.__tb.game.lives < 20, null, { timeout: 60000 });
const s1 = await page.evaluate(() => ({ state: window.__tb.game.state, lives: window.__tb.game.lives, wave: window.__tb.game.wave, kills: window.__tb.game.stats.kills }));
console.log('after wave 1:', s1);
assert(s1.wave === 1 && s1.kills >= 8, 'wave 1 not cleared normally');

// Build more using gold, run through a few more waves (early calls), check no leaks.
await page.evaluate(() => {
  const g = window.__tb.game;
  g.gold += 900;
  for (const [t, c, r] of [['cannon', 4, 7], ['frost', 9, 4], ['tesla', 12, 2], ['sniper', 14, 7], ['archer', 7, 9]]) g.placeTower(t, c, r);
});
for (let i = 0; i < 4; i++) {
  await page.keyboard.press(' ');
  await page.waitForFunction(() => window.__tb.game.state === 'countdown', null, { timeout: 90000 });
}
const s2 = await page.evaluate(() => ({ state: window.__tb.game.state, lives: window.__tb.game.lives, wave: window.__tb.game.wave, kills: window.__tb.game.stats.kills, particles: window.__tb.game.particles.length }));
console.log('after wave 5:', s2);
assert(s2.wave === 5 && s2.lives === 20, 'waves 2-5 leaked with a solid defence');
await page.waitForTimeout(200);
await shot('07-midgame');

// Help overlay opens/closes; menu returns; retry works.
await page.keyboard.press('h');
assert(!(await page.evaluate(() => document.getElementById('screen-help').hidden)), 'help did not open');
await page.keyboard.press('Escape');
assert(await page.evaluate(() => document.getElementById('screen-help').hidden), 'help did not close');

// Game over path: drain lives by letting waves through with towers sold.
await page.evaluate(() => {
  const g = window.__tb.game;
  for (const t of [...g.towers]) g.sellTower(t);
  g.lives = 2;
});
await page.keyboard.press(' ');
await page.waitForFunction(() => window.__tb.game.state === 'over', null, { timeout: 60000 });
await page.waitForSelector('#screen-end:not([hidden])', { timeout: 5000 });
await page.waitForTimeout(300);
await shot('08-gameover');
await page.click('#btn-retry');
await page.waitForFunction(() => window.__tb.game.state === 'prep' && window.__tb.game.wave === 0);

// Scenario shots: boss waves and the victory screen, driven through the API.
const scenario = async (wave, name, towers) => {
  await page.evaluate(({ wave, towers }) => {
    const g = window.__tb.startGame('meadow', 'normal') || window.__tb.game;
    const game = window.__tb.game;
    game.gold = 100000;
    for (const [t, c, r, lvl] of towers) { const tw = game.placeTower(t, c, r); for (let i = 0; i < lvl; i++) game.upgradeTower(tw); }
    game.gold = 500;
    game.wave = wave - 1;
    game.state = 'countdown';
    game.countdown = 0.01;
    game.setSpeed(1);
  }, { wave, towers });
  await page.waitForFunction(() => window.__tb.game.enemies.length >= 1, null, { timeout: 15000 });
  await page.waitForTimeout(3500);
  await shot(name);
};
const DEF = [['archer', 2, 3, 2], ['cannon', 4, 7, 2], ['frost', 9, 4, 2], ['tesla', 12, 2, 2], ['sniper', 14, 7, 2], ['archer', 7, 9, 1], ['tesla', 16, 8, 2], ['sniper', 10, 6, 2]];
await scenario(10, '11-boss-slimeking', DEF);
await scenario(20, '12-boss-drake', DEF);
await scenario(30, '13-boss-titan', DEF);
// Victory: wave 30 with overwhelming defence.
await page.evaluate(() => {
  window.__tb.startGame('meadow', 'easy');
  const game = window.__tb.game;
  game.gold = 1e6;
  for (let r = 0; r < 12; r++) for (let c = 0; c < 20; c += 2) { const t = game.placeTower('sniper', c, r); if (t) { game.upgradeTower(t); game.upgradeTower(t); } }
  game.wave = 29; game.state = 'countdown'; game.countdown = 0.01; game.setSpeed(3);
});
await page.waitForFunction(() => window.__tb.game.state === 'won', null, { timeout: 120000 });
await page.waitForSelector('#screen-end:not([hidden])', { timeout: 5000 });
await page.waitForTimeout(300);
await shot('14-victory');
assert(!(await page.evaluate(() => document.getElementById('btn-endless').hidden)), 'endless button hidden on victory');
await page.click('#btn-endless');
await page.waitForFunction(() => window.__tb.game.endless && window.__tb.game.state === 'countdown');
await page.keyboard.press(' ');
await page.waitForFunction(() => window.__tb.game.wave === 31 && window.__tb.game.enemies.length > 0, null, { timeout: 15000 });

// Other maps render without errors.
for (const map of ['river', 'twin']) {
  await page.evaluate((m) => window.__tb.startGame(m, 'hard'), map);
  await page.waitForTimeout(400);
  await shot(`09-map-${map}`);
}

// Portrait layout.
await page.setViewportSize({ width: 600, height: 1000 });
await page.waitForTimeout(300);
await shot('10-portrait');

assert(errors.length === 0, 'console errors:\n' + errors.join('\n'));
console.log('E2E OK — screenshots in tools/shots/');
await browser.close();
server.close();
