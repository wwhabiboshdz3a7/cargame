// Outil de dev : lance un serveur Vite, ouvre une page dans Chromium headless et capture une image.
// usage: node tools/shot.mjs <url-path> <out.png> [waitMs] [actionsJson]
import { chromium } from 'playwright-core';
import { createServer } from 'vite';

const [, , path = '/', out = 'shot.png', waitMs = '8000', actions = '[]'] = process.argv;
const server = await createServer({ server: { port: 5199, strictPort: false }, logLevel: 'error' });
await server.listen();
const port = server.config.server.port;
const exe = process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const browser = await chromium.launch({ executablePath: exe, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: +(process.env.W || 960), height: +(process.env.H || 540) } });
const logs = [];
page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`));
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}\n${e.stack}`));
await page.goto(`http://localhost:${port}${path}`);
const steps = JSON.parse(actions);
const t0 = Date.now();
for (const st of steps) {
  if (st.wait) await page.waitForTimeout(st.wait);
  if (st.key) await page.keyboard.press(st.key);
  if (st.down) await page.keyboard.down(st.down);
  if (st.up) await page.keyboard.up(st.up);
  if (st.click) await page.click(st.click);
  if (st.eval) logs.push('[eval] ' + JSON.stringify(await page.evaluate(st.eval)));
  if (st.shot) await page.screenshot({ path: st.shot });
}
const rest = +waitMs - (Date.now() - t0);
if (rest > 0) await page.waitForTimeout(rest);
const status = await page.evaluate(() => (typeof window.__status === 'function' ? window.__status() : window.__status));
await page.screenshot({ path: out });
console.log(logs.slice(0, 60).join('\n'));
console.log('status', JSON.stringify(status));
await browser.close();
await server.close();
