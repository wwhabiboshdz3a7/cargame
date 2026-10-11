// Outil de dev : génère un aperçu PNG de la carte + statistiques des routes.
import { WorldGen } from '../src/world/worldgen.js';
import { WORLD_HALF, POIS } from '../src/world/layout.js';
import zlib from 'node:zlib';
import fs from 'node:fs';

const N = +(process.argv[2] || 800);
const out = process.argv[3] || 'map-preview.png';
const region = process.argv[4] ? process.argv[4].split(',').map(Number) : [-WORLD_HALF, -WORLD_HALF, WORLD_HALF, WORLD_HALF];
let t0 = performance.now();
const w = new WorldGen();
console.log('build ms', (performance.now() - t0).toFixed(0), 'roads', w.roads.length, 'nodes', w.graph.nodes.length, 'edges', w.graph.edges.length);

for (const r of w.roads) {
  if (r.type === 'city') continue;
  let maxG = 0, maxCut = 0, maxFill = 0, minY = 1e9, maxY = -1e9;
  for (let i = 0; i < r.n; i++) {
    const nat = w.preRoad(r.xs[i], r.zs[i]);
    maxCut = Math.max(maxCut, nat - r.ys[i]);
    maxFill = Math.max(maxFill, r.ys[i] - nat);
    minY = Math.min(minY, r.ys[i]); maxY = Math.max(maxY, r.ys[i]);
    if (i > 0) maxG = Math.max(maxG, Math.abs(r.ys[i] - r.ys[i - 1]) / (r.ss[i] - r.ss[i - 1]));
  }
  console.log(r.id.padEnd(14), 'len', (r.length / 1000).toFixed(1) + 'km', 'grade', (maxG * 100).toFixed(1) + '%', 'cut', maxCut.toFixed(0), 'fill', maxFill.toFixed(0), 'y', minY.toFixed(0), '..', maxY.toFixed(0));
}
console.log('regions', w.regions.map((r) => r.id + '=' + (+r.y).toFixed(0)).join(' '));

t0 = performance.now();
let cnt = 0;
for (let i = 0; i < 20000; i++) { w.height(Math.random() * 32000 - 16000, Math.random() * 32000 - 16000); cnt++; }
console.log('height() µs', ((performance.now() - t0) * 1000 / cnt).toFixed(2));

const [x0, z0, x1, z1] = region;
const img = Buffer.alloc(N * N * 3);
const H = new Float32Array(N * N);
const sh = { splat: [0, 0, 0, 0], tint: [0, 0, 0], hr: 0, field: 0 };
for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
  const x = x0 + (i + 0.5) / N * (x1 - x0), z = z0 + (j + 0.5) / N * (z1 - z0);
  H[j * N + i] = w.height(x, z);
}
const px = (x1 - x0) / N;
for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
  const x = x0 + (i + 0.5) / N * (x1 - x0), z = z0 + (j + 0.5) / N * (z1 - z0);
  const h = H[j * N + i];
  const hl = H[j * N + Math.max(0, i - 1)], hr = H[j * N + Math.min(N - 1, i + 1)];
  const hu = H[Math.max(0, j - 1) * N + i], hd = H[Math.min(N - 1, j + 1) * N + i];
  const nx = (hl - hr) / (2 * px), nz = (hu - hd) / (2 * px);
  const ny = 1 / Math.hypot(nx, 1, nz);
  let c;
  if (h < 0) c = [30, 80 + Math.max(-40, h) , 140 + h];
  else {
    w.shade(x, z, h, ny, sh);
    const s = sh.splat;
    const grass = [sh.tint[0] * 255, sh.tint[1] * 255, sh.tint[2] * 255];
    const rock = [120, 110, 100], sand = grass, dirt = [140, 115, 85];
    c = [0, 1, 2].map((k) => grass[k] * s[0] + rock[k] * s[1] + sand[k] * s[2] + dirt[k] * s[3]);
    if (sh.field > 0.3) c = c.map((v, k) => v * (1 - sh.field * 0.4) + [200, 170, 80][k] * sh.field * 0.4);
    const shade = Math.max(0.35, Math.min(1.3, 0.75 + (nx * -0.6 + nz * -0.6) * 2.2));
    c = c.map((v) => v * shade);
  }
  const o = (j * N + i) * 3;
  img[o] = Math.max(0, Math.min(255, c[0])); img[o + 1] = Math.max(0, Math.min(255, c[1])); img[o + 2] = Math.max(0, Math.min(255, c[2]));
}
// routes
const col = { highway: [255, 255, 255], national: [255, 220, 60], mountain: [255, 140, 40], piste: [200, 120, 80], city: [90, 90, 90] };
for (const r of w.roads) {
  for (let k = 0; k < r.n; k++) {
    const i = Math.floor((r.xs[k] - x0) / (x1 - x0) * N), j = Math.floor((r.zs[k] - z0) / (z1 - z0) * N);
    if (i < 0 || j < 0 || i >= N || j >= N) continue;
    const o = (j * N + i) * 3; const c = col[r.type];
    img[o] = c[0]; img[o + 1] = c[1]; img[o + 2] = c[2];
  }
}
for (const p of POIS) {
  const i = Math.floor((p.x - x0) / (x1 - x0) * N), j = Math.floor((p.z - z0) / (z1 - z0) * N);
  for (let a = -3; a <= 3; a++) for (let b = -3; b <= 3; b++) {
    const ii = i + a, jj = j + b; if (ii < 0 || jj < 0 || ii >= N || jj >= N) continue;
    const o = (jj * N + ii) * 3; img[o] = 255; img[o + 1] = 0; img[o + 2] = 200;
  }
}
// encodage PNG
const raw = Buffer.alloc((N * 3 + 1) * N);
for (let j = 0; j < N; j++) { raw[j * (N * 3 + 1)] = 0; img.copy(raw, j * (N * 3 + 1) + 1, j * N * 3, (j + 1) * N * 3); }
const crcTable = new Int32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c; });
const crc = (buf) => { let c = -1; for (const b of buf) c = crcTable[(c ^ b) & 255] ^ (c >>> 8); return (c ^ -1) >>> 0; };
const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([len, td, c]); };
const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(N, 0); ihdr.writeUInt32BE(N, 4); ihdr[8] = 8; ihdr[9] = 2;
fs.writeFileSync(out, Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]));
console.log('wrote', out);
