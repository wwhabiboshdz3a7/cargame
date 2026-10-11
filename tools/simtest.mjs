// Test de gameplay accéléré : lance une épreuve et simule sans rendu.
import { chromium } from 'playwright-core';
import { createServer } from 'vite';
const steps = JSON.parse(process.argv[2] || '[]');
const query = process.argv[3] || '?play&q=low';
const server = await createServer({ server: { port: 5197 }, logLevel: 'error' });
await server.listen();
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 640, height: 360 } });
const logs = [];
page.on('console', (m) => { if (['error', 'warning'].includes(m.type()) && !m.text().includes('AudioContext')) logs.push(`[${m.type()}] ${m.text().slice(0, 400)}`); });
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}\n${e.stack}`));
await page.goto(`http://localhost:${server.config.server.port}/${query}`);
await page.waitForFunction(() => window.__game && window.__game.state !== 'loading', null, { timeout: 120000 });
for (const s of steps) {
  if (s.js) { const r = await page.evaluate(s.js); console.log('js>', JSON.stringify(r)); }
  if (s.sim) {
    for (let k = 0; k < (s.repeat || 1); k++) {
      const r = await page.evaluate(([sec, keys, aim]) => window.__sim(sec, keys, aim), [s.sim, s.keys || [], s.aim || null]);
      console.log(`sim ${s.sim}s [${(s.keys || []).join(',')}]`, JSON.stringify(r));
    }
  }
  if (s.shot) await page.screenshot({ path: s.shot, timeout: 120000 });
}
console.log(logs.slice(0, 20).join('\n'));
await browser.close();
await server.close();
