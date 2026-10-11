// Visite automatique : charge le jeu une fois, se téléporte à plusieurs endroits et capture chaque vue.
import { chromium } from 'playwright-core';
import { createServer } from 'vite';

const outDir = process.argv[2] || '.';
const spots = JSON.parse(process.argv[3] || '[]');
const query = process.argv[4] || '?play';
const server = await createServer({ server: { port: 5198 }, logLevel: 'error' });
await server.listen();
const port = server.config.server.port;
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport: { width: +(process.env.W || 960), height: +(process.env.H || 540) } });
const logs = [];
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') logs.push(`[${m.type()}] ${m.text().slice(0, 300)}`); });
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}\n${e.stack}`));
await page.goto(`http://localhost:${port}/${query}`);
await page.waitForFunction(() => window.__game && window.__game.state !== 'loading', null, { timeout: 120000 });
for (const s of spots) {
  await page.evaluate((s) => {
    const g = window.__game;
    if (s.t !== undefined) { g.atmosphere.time = s.t; g.atmosphere.cycle = false; g.atmosphere.lastEnvTime = -100; }
    if (s.car) g.spawnPlayer(s.car);
    if (s.x !== undefined) g.teleport(s.x, s.z, s.yaw ?? null, s.snap ?? true);
    if (s.cam !== undefined) g.cameraRig.mode = s.cam;
    if (s.ev) g.events.start(s.ev);
    if (s.eval) eval(s.eval);
  }, s);
  // attend le chargement du terrain
  for (let i = 0; i < 60; i++) {
    const p = await page.evaluate(() => window.__game.pool.pending);
    if (p === 0 && i > 3) break;
    await page.waitForTimeout(1000);
  }
  if (s.keys) { for (const k of s.keys) await page.keyboard.down(k); }
  await page.waitForTimeout(s.wait || 4000);
  if (s.keys) { for (const k of s.keys) await page.keyboard.up(k); }
  await page.screenshot({ path: `${outDir}/${s.name}.png`, timeout: 180000 });
  const st = await page.evaluate(() => window.__status());
  console.log(s.name, JSON.stringify(st));
}
console.log(logs.slice(0, 30).join('\n'));
await browser.close();
await server.close();
