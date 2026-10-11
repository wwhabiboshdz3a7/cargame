// Textures procédurales générées sur canvas (aucun fichier externe).
import * as THREE from 'three';
import { mulberry32 } from './noise.js';

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}

// Bruit de valeur tuilable (fbm) dans [0,1]
export function tileNoise(size, baseCells, octaves, seed, gain = 0.5) {
  const rand = mulberry32(seed);
  const out = new Float32Array(size * size);
  let amp = 1, norm = 0, cells = baseCells;
  for (let o = 0; o < octaves; o++) {
    const lat = new Float32Array(cells * cells);
    for (let i = 0; i < lat.length; i++) lat[i] = rand();
    for (let y = 0; y < size; y++) {
      const fy = (y / size) * cells, y0 = Math.floor(fy), ty = fy - y0;
      const sy = ty * ty * (3 - 2 * ty);
      const ya = y0 % cells, yb = (y0 + 1) % cells;
      for (let x = 0; x < size; x++) {
        const fx = (x / size) * cells, x0 = Math.floor(fx), tx = fx - x0;
        const sx = tx * tx * (3 - 2 * tx);
        const xa = x0 % cells, xb = (x0 + 1) % cells;
        const v = (lat[ya * cells + xa] * (1 - sx) + lat[ya * cells + xb] * sx) * (1 - sy)
          + (lat[yb * cells + xa] * (1 - sx) + lat[yb * cells + xb] * sx) * sy;
        out[y * size + x] += v * amp;
      }
    }
    norm += amp; amp *= gain; cells *= 2;
  }
  for (let i = 0; i < out.length; i++) out[i] /= norm;
  return out;
}

function toTexture(c, { repeat = true, srgb = true, aniso = 8 } = {}) {
  const t = new THREE.CanvasTexture(c);
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.anisotropy = aniso;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.needsUpdate = true;
  return t;
}

function fillFromFn(size, fn) {
  const c = canvas(size, size);
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(size, size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const [r, g, b] = fn(x, y, y * size + x);
    const o = (y * size + x) * 4;
    img.data[o] = r; img.data[o + 1] = g; img.data[o + 2] = b; img.data[o + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

const cache = {};

export function terrainTextures() {
  if (cache.terrain) return cache.terrain;
  const S = 512;
  const n1 = tileNoise(S, 8, 6, 11);
  const n2 = tileNoise(S, 32, 4, 12);
  const n3 = tileNoise(S, 4, 5, 13);
  const grass = fillFromFn(S, (x, y, i) => {
    const v = 0.72 + 0.35 * (n1[i] - 0.5) + 0.25 * (n2[i] - 0.5);
    const blade = (((x * 7 + y * 13) ^ (x * y)) & 7) / 7 * 0.06;
    const l = (v + blade) * 205;
    return [l * 0.98, l * 1.02, l * 0.9];
  });
  const rock = fillFromFn(S, (x, y, i) => {
    const strata = 0.5 + 0.5 * Math.sin((y / S) * Math.PI * 28 + n3[i] * 9);
    const v = 0.45 + 0.35 * n1[i] + 0.12 * strata + 0.15 * (n2[i] - 0.5);
    return [v * 165, v * 150, v * 135];
  });
  const sand = fillFromFn(S, (x, y, i) => {
    const rip = 0.5 + 0.5 * Math.sin((x / S) * Math.PI * 2 * 22 + (y / S) * Math.PI * 2 * 6 + n3[i] * 6);
    const grain = (((x * 2654435761) ^ (y * 40503)) >>> 0) % 100 / 100;
    const v = 0.82 + 0.08 * rip + 0.1 * (n1[i] - 0.5) + 0.05 * (grain - 0.5);
    return [v * 230, v * 225, v * 215];
  });
  const dirt = fillFromFn(S, (x, y, i) => {
    const pebble = n2[i] > 0.66 ? 0.12 : 0;
    const v = 0.55 + 0.3 * n1[i] + pebble + 0.1 * (n2[i] - 0.5);
    return [v * 170, v * 140, v * 105];
  });
  cache.terrain = {
    grass: toTexture(grass), rock: toTexture(rock), sand: toTexture(sand), dirt: toTexture(dirt),
  };
  return cache.terrain;
}

// Normal map d'eau tuilable
export function waterNormalTexture() {
  if (cache.water) return cache.water;
  const S = 256;
  const h = tileNoise(S, 8, 5, 77, 0.55);
  const c = fillFromFn(S, (x, y) => {
    const hx = h[y * S + ((x + 1) % S)] - h[y * S + ((x - 1 + S) % S)];
    const hy = h[((y + 1) % S) * S + x] - h[((y - 1 + S) % S) * S + x];
    const nx = -hx * 6, ny = -hy * 6, nz = 1;
    const L = Math.hypot(nx, ny, nz);
    return [(nx / L * 0.5 + 0.5) * 255, (ny / L * 0.5 + 0.5) * 255, (nz / L * 0.5 + 0.5) * 255];
  });
  cache.water = toTexture(c, { srgb: false });
  return cache.water;
}

// Texture de route : u en travers (0..1), v le long (1 tuile = `len` mètres)
export function roadTexture(type) {
  const key = 'road_' + type;
  if (cache[key]) return cache[key];
  const W = 512, H = 1024;
  const c = canvas(W, H);
  const ctx = c.getContext('2d');
  const n = tileNoise(128, 8, 4, type.length * 7 + 3);
  const asph = (base) => {
    const img = ctx.createImageData(W, H);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const v = base + 22 * (n[(y % 128) * 128 + (x % 128)] - 0.5) + ((((x * 1103515245) ^ (y * 12345)) >>> 0) % 16 - 8);
      const o = (y * W + x) * 4;
      img.data[o] = v; img.data[o + 1] = v; img.data[o + 2] = v * 1.02; img.data[o + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
  };
  const line = (u, w, color, dash = 0, gap = 0, offset = 0) => {
    ctx.fillStyle = color;
    const x = u * W - (w * W) / 2;
    if (!dash) { ctx.fillRect(x, 0, w * W, H); return; }
    for (let y = -offset; y < H; y += dash + gap) ctx.fillRect(x, y, w * W, dash);
  };
  const gravel = (u0, u1) => {
    for (let x = Math.floor(u0 * W); x < u1 * W; x++) for (let y = 0; y < H; y += 1) {
      const v = 110 + ((((x * 2654435761) ^ (y * 2246822519)) >>> 0) % 50);
      ctx.fillStyle = `rgb(${v},${v * 0.9 | 0},${v * 0.75 | 0})`;
      ctx.fillRect(x, y, 1, 1);
    }
  };
  if (type === 'highway') {
    // 29.2 m : accotement | 3 voies | terre-plein | 3 voies | accotement ; tuile = 24 m
    asph(72);
    const m = 1 / 29.2;
    gravel(0, 0.02); gravel(0.98, 1);
    ctx.fillStyle = 'rgb(115,112,104)'; ctx.fillRect(W * (0.5 - 1.3 * m), 0, W * 2.6 * m, H);
    line(0.5 - 1.3 * m - 0.15 * m, 0.15 * m, '#f2f2ea');
    line(0.5 + 1.3 * m + 0.15 * m, 0.15 * m, '#f2f2ea');
    const edgeL = 0.5 - (1.3 + 10.8) * m, edgeR = 0.5 + (1.3 + 10.8) * m;
    line(edgeL, 0.18 * m, '#f2f2ea'); line(edgeR, 0.18 * m, '#f2f2ea');
    for (const k of [1, 2]) {
      line(0.5 - (1.3 + 3.6 * k) * m, 0.15 * m, '#f2f2ea', H * 0.25, H * 0.5);
      line(0.5 + (1.3 + 3.6 * k) * m, 0.15 * m, '#f2f2ea', H * 0.25, H * 0.5);
    }
  } else if (type === 'national') {
    asph(80);
    const m = 1 / 11.2;
    gravel(0, 0.03); gravel(0.97, 1);
    line(0.5, 0.14 * m, '#f4f4ee', H * 0.3, H * 0.45);
    line(0.5 - 3.6 * m, 0.14 * m, '#f4f4ee'); line(0.5 + 3.6 * m, 0.14 * m, '#f4f4ee');
  } else if (type === 'mountain') {
    asph(86);
    const m = 1 / 8.8;
    gravel(0, 0.04); gravel(0.96, 1);
    line(0.5, 0.12 * m, '#efe9c8', H * 0.2, H * 0.3);
    // bordures rouge/blanc
    for (let y = 0; y < H; y += 64) {
      ctx.fillStyle = (y / 64) % 2 ? '#c22' : '#eee';
      ctx.fillRect(W * 0.04, y, W * 0.02, 64); ctx.fillRect(W * 0.94, y, W * 0.02, 64);
    }
  } else if (type === 'piste') {
    const img = ctx.createImageData(W, H);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const u = x / W;
      const track = Math.exp(-(((u - 0.32) / 0.05) ** 2)) + Math.exp(-(((u - 0.68) / 0.05) ** 2));
      const edge = Math.min(1, Math.min(u, 1 - u) * 6);
      const v = 0.75 + 0.2 * (n[(y % 128) * 128 + (x % 128)] - 0.5) - track * 0.1 + ((((x * 1103515245) ^ (y * 12345)) >>> 0) % 12) / 120;
      const o = (y * W + x) * 4;
      img.data[o] = v * 205; img.data[o + 1] = v * 165; img.data[o + 2] = v * 120; img.data[o + 3] = 255 * edge;
    }
    ctx.putImageData(img, 0, 0);
  }
  const t = toTexture(c);
  cache[key] = t;
  return t;
}

// Rue de ville (u en travers sur 20 m, v le long ; tuile = 20 m)
export function cityStreetTexture() {
  if (cache.street) return cache.street;
  const W = 512, H = 512;
  const c = canvas(W, H);
  const ctx = c.getContext('2d');
  const n = tileNoise(128, 8, 4, 99);
  const img = ctx.createImageData(W, H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const v = 68 + 20 * (n[(y % 128) * 128 + (x % 128)] - 0.5) + ((((x * 1103515245) ^ (y * 12345)) >>> 0) % 14 - 7);
    const o = (y * W + x) * 4;
    img.data[o] = v; img.data[o + 1] = v; img.data[o + 2] = v + 2; img.data[o + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  const m = W / 20;
  ctx.fillStyle = '#eeeeea';
  ctx.fillRect(W / 2 - 0.12 * m, 0, 0.12 * m, H); ctx.fillRect(W / 2 + 0.06 * m, 0, 0.12 * m, H); // double ligne
  for (let y = 0; y < H; y += H / 2) { ctx.fillRect(W / 2 - 3.6 * m, y, 0.13 * m, H / 4); ctx.fillRect(W / 2 + 3.5 * m, y, 0.13 * m, H / 4); }
  ctx.fillStyle = 'rgba(255,255,255,0.8)'; ctx.fillRect(1.6 * m, 0, 0.1 * m, H); ctx.fillRect(W - 1.7 * m, 0, 0.1 * m, H);
  cache.street = toTexture(c);
  return cache.street;
}

// Carrefour 20x20 m avec passages piétons
export function intersectionTexture() {
  if (cache.inter) return cache.inter;
  const W = 512;
  const c = canvas(W, W);
  const ctx = c.getContext('2d');
  const n = tileNoise(128, 8, 4, 98);
  const img = ctx.createImageData(W, W);
  for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) {
    const v = 66 + 20 * (n[(y % 128) * 128 + (x % 128)] - 0.5) + ((((x * 1103515245) ^ (y * 12345)) >>> 0) % 14 - 7);
    const o = (y * W + x) * 4;
    img.data[o] = v; img.data[o + 1] = v; img.data[o + 2] = v + 2; img.data[o + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  const m = W / 20;
  ctx.fillStyle = '#f0f0ea';
  for (let k = 0; k < 8; k++) {
    const p = (2.2 + k * 2) * m;
    ctx.fillRect(p, 0.4 * m, 1 * m, 2.2 * m); ctx.fillRect(p, W - 2.6 * m, 1 * m, 2.2 * m);
    ctx.fillRect(0.4 * m, p, 2.2 * m, 1 * m); ctx.fillRect(W - 2.6 * m, p, 2.2 * m, 1 * m);
  }
  cache.inter = toTexture(c);
  return cache.inter;
}

export function concreteTexture(seed = 5, tint = [1, 1, 1], joints = 8) {
  const key = 'concrete' + seed + tint.join() + joints;
  if (cache[key]) return cache[key];
  const S = 512;
  const n1 = tileNoise(S, 8, 5, seed);
  const n2 = tileNoise(S, 64, 2, seed + 1);
  const c = fillFromFn(S, (x, y, i) => {
    let v = 0.68 + 0.18 * (n1[i] - 0.5) + 0.08 * (n2[i] - 0.5);
    if (joints && (x % (S / joints) < 2 || y % (S / joints) < 2)) v *= 0.7;
    return [v * 220 * tint[0], v * 218 * tint[1], v * 210 * tint[2]];
  });
  cache[key] = toTexture(c);
  return cache[key];
}

// Piste d'atterrissage : u en travers (60 m), v le long (tuile 120 m)
export function runwayTexture() {
  if (cache.runway) return cache.runway;
  const W = 512, H = 1024;
  const c = canvas(W, H);
  const ctx = c.getContext('2d');
  const n = tileNoise(128, 8, 4, 31);
  const img = ctx.createImageData(W, H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const v = 58 + 18 * (n[(y % 128) * 128 + (x % 128)] - 0.5) + ((((x * 1103515245) ^ (y * 12345)) >>> 0) % 12 - 6);
    const o = (y * W + x) * 4;
    img.data[o] = v; img.data[o + 1] = v; img.data[o + 2] = v; img.data[o + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  ctx.fillStyle = '#f2f2f0';
  const m = W / 60;
  ctx.fillRect(W / 2 - 0.45 * m, 0, 0.9 * m, H * 0.25); ctx.fillRect(W / 2 - 0.45 * m, H * 0.5, 0.9 * m, H * 0.25);
  ctx.fillRect(1.5 * m, 0, 0.9 * m, H); ctx.fillRect(W - 2.4 * m, 0, 0.9 * m, H);
  cache.runway = toTexture(c);
  return cache.runway;
}

// --------------------------------------------------------------- façades
// Chaque façade : tuile = 4 fenêtres x 4 étages (12 m x 12 m). Renvoie {map, emissive}
export function facadeTextures(style) {
  const key = 'facade_' + style;
  if (cache[key]) return cache[key];
  const S = 512;
  const c = canvas(S, S), e = canvas(S, S);
  const ctx = c.getContext('2d'), ex = e.getContext('2d');
  ex.fillStyle = '#000'; ex.fillRect(0, 0, S, S);
  const rand = mulberry32(style.length * 131 + 7);
  const cell = S / 4;
  const noiseOverlay = (alpha) => {
    const n = tileNoise(128, 4, 4, style.length);
    for (let y = 0; y < S; y += 4) for (let x = 0; x < S; x += 4) {
      const v = n[((y / 4) % 128) * 128 + ((x / 4) % 128)];
      ctx.fillStyle = `rgba(0,0,0,${(v - 0.3) * alpha})`;
      ctx.fillRect(x, y, 4, 4);
    }
  };
  const lit = (x, y, w, h) => {
    if (rand() < 0.42) {
      const warm = rand();
      ex.fillStyle = warm < 0.7 ? `rgb(255,${200 + rand() * 40 | 0},${120 + rand() * 60 | 0})` : 'rgb(190,220,255)';
      ex.fillRect(x, y, w, h);
    }
  };
  if (style === 'haussmann') {
    ctx.fillStyle = '#ecebe4'; ctx.fillRect(0, 0, S, S);
    noiseOverlay(0.12);
    for (let fy = 0; fy < 4; fy++) for (let fx = 0; fx < 4; fx++) {
      const x = fx * cell, y = fy * cell;
      // fenêtre haute avec volets bleus
      ctx.fillStyle = '#2b3440'; ctx.fillRect(x + cell * 0.32, y + cell * 0.18, cell * 0.36, cell * 0.6);
      lit(x + cell * 0.32, y + cell * 0.18, cell * 0.36, cell * 0.6);
      ctx.fillStyle = '#2f6fa8'; ctx.fillRect(x + cell * 0.16, y + cell * 0.18, cell * 0.14, cell * 0.6); ctx.fillRect(x + cell * 0.7, y + cell * 0.18, cell * 0.14, cell * 0.6);
      ctx.fillStyle = '#d8d6cc'; ctx.fillRect(x + cell * 0.28, y + cell * 0.12, cell * 0.44, cell * 0.06);
      // balcon en fer forgé
      ctx.fillStyle = '#1d1f22'; ctx.fillRect(x + cell * 0.12, y + cell * 0.74, cell * 0.76, cell * 0.04);
      for (let k = 0; k < 9; k++) ctx.fillRect(x + cell * (0.13 + k * 0.09), y + cell * 0.64, 2, cell * 0.12);
      ctx.fillRect(x + cell * 0.12, y + cell * 0.63, cell * 0.76, 3);
    }
  } else if (style === 'hlm') {
    const tones = ['#e8dcc0', '#f0e2c8', '#e6d3b3', '#efe8d8'];
    ctx.fillStyle = tones[style.length % tones.length]; ctx.fillRect(0, 0, S, S);
    noiseOverlay(0.15);
    for (let fy = 0; fy < 4; fy++) for (let fx = 0; fx < 4; fx++) {
      const x = fx * cell, y = fy * cell;
      ctx.fillStyle = '#3a3d42'; ctx.fillRect(x + cell * 0.25, y + cell * 0.25, cell * 0.5, cell * 0.45);
      lit(x + cell * 0.25, y + cell * 0.25, cell * 0.5, cell * 0.45);
      ctx.fillStyle = '#cfc6b0'; ctx.fillRect(x + cell * 0.2, y + cell * 0.7, cell * 0.6, cell * 0.05);
      if (rand() < 0.35) { // parabole
        ctx.fillStyle = '#f4f4f4'; ctx.beginPath(); ctx.arc(x + cell * 0.82, y + cell * 0.32, cell * 0.08, 0, Math.PI * 2); ctx.fill();
      }
      if (rand() < 0.25) { ctx.fillStyle = ['#c33', '#36c', '#3a3', '#eb3'][rand() * 4 | 0]; ctx.fillRect(x + cell * 0.27, y + cell * 0.6, cell * 0.46, cell * 0.06); }
    }
  } else if (style === 'glass') {
    const g = ctx.createLinearGradient(0, 0, S, S);
    g.addColorStop(0, '#5f8fae'); g.addColorStop(0.5, '#3f6c8c'); g.addColorStop(1, '#6d9cb8');
    ctx.fillStyle = g; ctx.fillRect(0, 0, S, S);
    ctx.strokeStyle = '#c9d4dc'; ctx.lineWidth = 4;
    for (let k = 0; k <= 8; k++) { ctx.beginPath(); ctx.moveTo(k * S / 8, 0); ctx.lineTo(k * S / 8, S); ctx.stroke(); }
    ctx.lineWidth = 6;
    for (let k = 0; k <= 4; k++) { ctx.beginPath(); ctx.moveTo(0, k * cell); ctx.lineTo(S, k * cell); ctx.stroke(); }
    for (let fy = 0; fy < 4; fy++) for (let fx = 0; fx < 8; fx++) if (rand() < 0.5) {
      ex.fillStyle = `rgb(${200 + rand() * 50 | 0},${210 + rand() * 40 | 0},255)`;
      ex.fillRect(fx * S / 8 + 3, fy * cell + 4, S / 8 - 6, cell - 8);
    }
  } else if (style === 'casbah') {
    ctx.fillStyle = '#f6f4ee'; ctx.fillRect(0, 0, S, S);
    noiseOverlay(0.18);
    for (let fy = 0; fy < 4; fy++) for (let fx = 0; fx < 4; fx++) {
      if (rand() < 0.45) continue;
      const x = fx * cell, y = fy * cell;
      ctx.fillStyle = '#28323a'; ctx.fillRect(x + cell * 0.38, y + cell * 0.35, cell * 0.22, cell * 0.28);
      lit(x + cell * 0.38, y + cell * 0.35, cell * 0.22, cell * 0.28);
      ctx.fillStyle = '#2f7fb8'; ctx.fillRect(x + cell * 0.36, y + cell * 0.33, cell * 0.26, cell * 0.03);
    }
  } else if (style === 'mzab') {
    ctx.fillStyle = '#d9a77a'; ctx.fillRect(0, 0, S, S);
    noiseOverlay(0.25);
    for (let fy = 0; fy < 4; fy++) for (let fx = 0; fx < 4; fx++) {
      if (rand() < 0.5) continue;
      const x = fx * cell, y = fy * cell;
      ctx.fillStyle = '#4a3020'; ctx.fillRect(x + cell * 0.4, y + cell * 0.4, cell * 0.16, cell * 0.2);
      lit(x + cell * 0.4, y + cell * 0.4, cell * 0.16, cell * 0.2);
    }
  } else if (style === 'warehouse') {
    ctx.fillStyle = '#9aa3a8'; ctx.fillRect(0, 0, S, S);
    for (let x = 0; x < S; x += 8) { ctx.fillStyle = x % 16 ? '#8c959a' : '#a8b0b4'; ctx.fillRect(x, 0, 4, S); }
    noiseOverlay(0.2);
    ctx.fillStyle = '#c0392b'; ctx.fillRect(0, S * 0.9, S, S * 0.1);
  } else if (style === 'mosque') {
    ctx.fillStyle = '#f3f1ea'; ctx.fillRect(0, 0, S, S);
    noiseOverlay(0.06);
    for (let fy = 0; fy < 4; fy++) for (let fx = 0; fx < 4; fx++) {
      const x = fx * cell, y = fy * cell;
      ctx.fillStyle = '#c8c2b4';
      ctx.beginPath(); ctx.moveTo(x + cell * 0.3, y + cell * 0.9); ctx.lineTo(x + cell * 0.3, y + cell * 0.4);
      ctx.arc(x + cell * 0.5, y + cell * 0.4, cell * 0.2, Math.PI, 0); ctx.lineTo(x + cell * 0.7, y + cell * 0.9); ctx.fill();
      ctx.fillStyle = '#3c5a6e';
      ctx.beginPath(); ctx.moveTo(x + cell * 0.36, y + cell * 0.88); ctx.lineTo(x + cell * 0.36, y + cell * 0.42);
      ctx.arc(x + cell * 0.5, y + cell * 0.42, cell * 0.14, Math.PI, 0); ctx.lineTo(x + cell * 0.64, y + cell * 0.88); ctx.fill();
      ex.fillStyle = '#ffe9b0';
      ex.beginPath(); ex.moveTo(x + cell * 0.36, y + cell * 0.88); ex.lineTo(x + cell * 0.36, y + cell * 0.42);
      ex.arc(x + cell * 0.5, y + cell * 0.42, cell * 0.14, Math.PI, 0); ex.lineTo(x + cell * 0.64, y + cell * 0.88); ex.fill();
    }
  } else if (style === 'shop') {
    // rez-de-chaussée commerçant (arcades)
    ctx.fillStyle = '#e9e6dc'; ctx.fillRect(0, 0, S, S);
    for (let fx = 0; fx < 4; fx++) {
      const x = fx * cell;
      ctx.fillStyle = '#26282b';
      ctx.beginPath(); ctx.moveTo(x + cell * 0.1, S); ctx.lineTo(x + cell * 0.1, S * 0.4); ctx.arc(x + cell * 0.5, S * 0.4, cell * 0.4, Math.PI, 0); ctx.lineTo(x + cell * 0.9, S); ctx.fill();
      const col = ['#b03a2e', '#1f618d', '#117a65', '#b7950b'][fx];
      ctx.fillStyle = col; ctx.fillRect(x + cell * 0.12, S * 0.45, cell * 0.76, S * 0.08);
      ex.fillStyle = '#ffdca0'; ex.fillRect(x + cell * 0.14, S * 0.56, cell * 0.72, S * 0.42);
    }
  }
  cache[key] = { map: toTexture(c), emissive: toTexture(e) };
  return cache[key];
}

export function roofTexture(tone = 'grey') {
  const key = 'roof' + tone;
  if (cache[key]) return cache[key];
  const S = 256;
  const n = tileNoise(S, 8, 4, 41);
  const base = tone === 'ochre' ? [205, 160, 115] : tone === 'white' ? [235, 233, 226] : [150, 148, 142];
  const c = fillFromFn(S, (x, y, i) => {
    const v = 0.85 + 0.25 * (n[i] - 0.5) - ((x % 64 < 2 || y % 64 < 2) ? 0.1 : 0);
    return [base[0] * v, base[1] * v, base[2] * v];
  });
  cache[key] = toTexture(c);
  return cache[key];
}

export function smokeSprite() {
  if (cache.smoke) return cache.smoke;
  const c = canvas(128, 128);
  const ctx = c.getContext('2d');
  const n = tileNoise(128, 4, 4, 5);
  const img = ctx.createImageData(128, 128);
  for (let y = 0; y < 128; y++) for (let x = 0; x < 128; x++) {
    const d = Math.hypot(x - 64, y - 64) / 64;
    const a = Math.max(0, 1 - d) ** 1.5 * (0.6 + 0.6 * n[y * 128 + x]);
    const o = (y * 128 + x) * 4;
    img.data[o] = 255; img.data[o + 1] = 255; img.data[o + 2] = 255; img.data[o + 3] = Math.min(255, a * 255);
  }
  ctx.putImageData(img, 0, 0);
  cache.smoke = toTexture(c, { repeat: false });
  return cache.smoke;
}

export function glowSprite() {
  if (cache.glow) return cache.glow;
  const c = canvas(64, 64);
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.25, 'rgba(255,255,255,0.6)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, 64, 64);
  cache.glow = toTexture(c, { repeat: false });
  return cache.glow;
}

export function plateTexture(text, wilaya = '16') {
  const c = canvas(256, 56);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#f4f4f0'; ctx.fillRect(0, 0, 256, 56);
  ctx.strokeStyle = '#111'; ctx.lineWidth = 4; ctx.strokeRect(2, 2, 252, 52);
  ctx.fillStyle = '#111'; ctx.font = 'bold 34px Arial, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(`${text} ${wilaya}`, 128, 30);
  return toTexture(c, { repeat: false });
}

// Panneau autoroutier vert (texte FR + AR)
export function signTexture(lines, color = '#0d6b3a') {
  const c = canvas(1024, 384);
  const ctx = c.getContext('2d');
  ctx.fillStyle = color; ctx.fillRect(0, 0, 1024, 384);
  ctx.strokeStyle = '#fff'; ctx.lineWidth = 10; ctx.strokeRect(14, 14, 996, 356);
  ctx.fillStyle = '#fff'; ctx.textBaseline = 'middle';
  const rowH = 340 / lines.length;
  lines.forEach((l, k) => {
    const y = 22 + rowH * (k + 0.5);
    ctx.font = 'bold 56px Arial, sans-serif'; ctx.textAlign = 'left';
    ctx.fillText(l.fr, 50, y);
    ctx.font = 'bold 54px "Noto Naskh Arabic", "Geeza Pro", Tahoma, Arial, sans-serif'; ctx.textAlign = 'right';
    ctx.fillText(l.ar || '', 900, y);
    if (l.arrow) {
      ctx.save(); ctx.translate(960, y); ctx.rotate(l.arrow);
      ctx.beginPath(); ctx.moveTo(0, -28); ctx.lineTo(22, 4); ctx.lineTo(8, 4); ctx.lineTo(8, 28); ctx.lineTo(-8, 28); ctx.lineTo(-8, 4); ctx.lineTo(-22, 4); ctx.closePath(); ctx.fill();
      ctx.restore();
    }
  });
  return toTexture(c, { repeat: false });
}

export function textTexture(text, { w = 512, h = 128, bg = 'rgba(0,0,0,0)', color = '#fff', font = 'bold 64px Arial', stroke = null } = {}) {
  const c = canvas(w, h);
  const ctx = c.getContext('2d');
  ctx.fillStyle = bg; ctx.fillRect(0, 0, w, h);
  ctx.font = font; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 8; ctx.strokeText(text, w / 2, h / 2); }
  ctx.fillStyle = color; ctx.fillText(text, w / 2, h / 2);
  return toTexture(c, { repeat: false });
}

export function chevronTexture() {
  if (cache.chev) return cache.chev;
  const c = canvas(256, 64);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#f2c500'; ctx.fillRect(0, 0, 256, 64);
  ctx.fillStyle = '#111';
  for (let x = -64; x < 256; x += 64) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x + 32, 0); ctx.lineTo(x + 64, 64); ctx.lineTo(x + 32, 64); ctx.fill(); }
  cache.chev = toTexture(c);
  return cache.chev;
}
