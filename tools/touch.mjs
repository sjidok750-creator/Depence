// Touch (tablet) smoke test: tap-to-place, drag-to-place, cancel chip.
//   node tools/touch.mjs
import { chromium } from 'playwright-core';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, extname } from 'node:path';
const ROOT = '/home/user/Depence';
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };
const server = createServer(async (req, res) => { try { let p = new URL(req.url, 'http://x').pathname; if (p.endsWith('/')) p += 'index.html'; res.writeHead(200, { 'Content-Type': TYPES[extname(p)] || 'text/plain' }); res.end(await readFile(join(ROOT, p))); } catch { res.writeHead(404); res.end(); } });
await new Promise((r) => server.listen(0, r));
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
for (const [name, vp] of [['ipad-landscape', { width: 1024, height: 768 }], ['ipad-portrait', { width: 768, height: 1024 }]]) {
  const ctx = await browser.newContext({ viewport: vp, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  const errs = [];
  page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  page.on('pageerror', (e) => errs.push(String(e)));
  await page.goto(`http://127.0.0.1:${server.address().port}/`);
  await page.waitForTimeout(500);
  await page.tap('#btn-start');
  await page.waitForTimeout(300);
  const box = await page.locator('#game').boundingBox();
  console.log(name, 'canvas box', JSON.stringify(box));
  await page.tap('.card[data-tower="archer"]');
  console.log(name, 'placing:', await page.evaluate(() => window.__tb.ui.placing));
  const px = box.x + 2.5 / 20 * box.width, py = box.y + 3.5 / 12 * box.height;
  await page.touchscreen.tap(px, py);
  await page.waitForTimeout(150);
  console.log(name, 'after single tap towers:', await page.evaluate(() => window.__tb.game.towers.length));
  // drag from a road tile to a grass tile and release: should place at release tile
  const cdp = await ctx.newCDPSession(page);
  const rx = box.x + 3.5 / 20 * box.width, ry = box.y + 5.5 / 12 * box.height; // road (3,5)
  const gx = box.x + 5.5 / 20 * box.width, gy = box.y + 5.5 / 12 * box.height; // grass (5,5)
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: rx, y: ry }] });
  await page.waitForTimeout(80);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: gx, y: gy }] });
  await page.waitForTimeout(80);
  console.log(name, 'ghost while dragging:', await page.evaluate(() => JSON.stringify(window.__tb.ui.hover && [window.__tb.ui.hover.c, window.__tb.ui.hover.r])));
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await page.waitForTimeout(150);
  console.log(name, 'after drag towers:', await page.evaluate(() => window.__tb.game.towers.length), 'last at', await page.evaluate(() => { const t = window.__tb.game.towers.at(-1); return [t.c, t.r]; }));
  console.log(name, 'cancel chip visible:', await page.evaluate(() => !document.getElementById('btn-cancel-place').hidden));
  await page.tap('#btn-cancel-place');
  console.log(name, 'placing after cancel:', await page.evaluate(() => window.__tb.ui.placing));
  await page.tap('#btn-wave');
  console.log(name, 'state:', await page.evaluate(() => window.__tb.game.state));
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `tools/shots/touch-${name}.png` });
  console.log(name, 'errors:', errs);
  await ctx.close();
}
await browser.close(); server.close();
