// Construction des données géométriques d'un noeud de terrain (utilisé par les workers ou en secours sur le thread principal).
export const SEG = 64;
export const NV = SEG + 1;

const srgbToLin = (c) => Math.pow(c, 2.2);

export function buildChunk(world, x0, z0, size) {
  const N = NV, M = N + 2;
  const step = size / SEG;
  const H = new Float64Array(M * M);
  for (let j = 0; j < M; j++) for (let i = 0; i < M; i++) {
    H[j * M + i] = world.height(x0 + (i - 1) * step, z0 + (j - 1) * step);
  }
  const vcount = N * N + 4 * N;
  const pos = new Float32Array(vcount * 3);
  const nor = new Int8Array(vcount * 3);
  const spl = new Uint8Array(vcount * 4);
  const col = new Uint8Array(vcount * 4);
  const sh = { splat: [0, 0, 0, 0], tint: [0, 0, 0], hr: 0, field: 0, forest: 0 };
  let minY = 1e9, maxY = -1e9;
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const x = x0 + i * step, z = z0 + j * step;
    const k = (j + 1) * M + (i + 1);
    const h = H[k];
    let nx = H[k - 1] - H[k + 1], ny = 2 * step, nz = H[k - M] - H[k + M];
    const L = Math.hypot(nx, ny, nz);
    nx /= L; ny /= L; nz /= L;
    world.shade(x, z, h, ny, sh);
    const v = j * N + i;
    const y = sh.hr;
    pos[v * 3] = x; pos[v * 3 + 1] = y; pos[v * 3 + 2] = z;
    if (y < minY) minY = y; if (y > maxY) maxY = y;
    nor[v * 3] = nx * 127; nor[v * 3 + 1] = ny * 127; nor[v * 3 + 2] = nz * 127;
    spl[v * 4] = sh.splat[0] * 255; spl[v * 4 + 1] = sh.splat[1] * 255; spl[v * 4 + 2] = sh.splat[2] * 255; spl[v * 4 + 3] = sh.splat[3] * 255;
    col[v * 4] = srgbToLin(sh.tint[0]) * 255; col[v * 4 + 1] = srgbToLin(sh.tint[1]) * 255; col[v * 4 + 2] = srgbToLin(sh.tint[2]) * 255;
    col[v * 4 + 3] = sh.field * 255;
  }
  // jupes (skirts) le long des bords pour masquer les fissures entre niveaux de détail
  const skirt = Math.max(2, step * 0.6);
  const edges = [
    (k) => k, // haut j=0
    (k) => (N - 1) * N + k, // bas
    (k) => k * N, // gauche
    (k) => k * N + N - 1, // droite
  ];
  for (let e = 0; e < 4; e++) {
    for (let k = 0; k < N; k++) {
      const src = edges[e](k);
      const dst = N * N + e * N + k;
      pos[dst * 3] = pos[src * 3]; pos[dst * 3 + 1] = pos[src * 3 + 1] - skirt; pos[dst * 3 + 2] = pos[src * 3 + 2];
      for (let c = 0; c < 3; c++) nor[dst * 3 + c] = nor[src * 3 + c];
      for (let c = 0; c < 4; c++) { spl[dst * 4 + c] = spl[src * 4 + c]; col[dst * 4 + c] = col[src * 4 + c]; }
    }
  }
  return { pos, nor, spl, col, minY: minY - skirt, maxY };
}

export function buildIndex() {
  const N = NV;
  const idx = [];
  for (let j = 0; j < N - 1; j++) for (let i = 0; i < N - 1; i++) {
    const a = j * N + i, b = a + 1, c = a + N, d = c + 1;
    // diagonale alternée pour un rendu plus régulier
    if ((i + j) & 1) { idx.push(a, c, b, b, c, d); } else { idx.push(a, c, d, a, d, b); }
  }
  const edges = [(k) => k, (k) => (N - 1) * N + k, (k) => k * N, (k) => k * N + N - 1];
  for (let e = 0; e < 4; e++) {
    for (let k = 0; k < N - 1; k++) {
      const a = edges[e](k), b = edges[e](k + 1);
      const sa = N * N + e * N + k, sb = sa + 1;
      idx.push(a, sa, b, b, sa, sb); // les deux sens
      idx.push(a, b, sa, b, sb, sa);
    }
  }
  return new Uint32Array(idx);
}

// Image de la carte du monde (RGBA), avec ombrage du relief
export function buildMapImage(world, N, x0, z0, x1, z1) {
  const H = new Float32Array(N * N);
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    H[j * N + i] = world.preRoad(x0 + (i + 0.5) / N * (x1 - x0), z0 + (j + 0.5) / N * (z1 - z0));
  }
  const img = new Uint8ClampedArray(N * N * 4);
  const px = (x1 - x0) / N;
  const sh = { splat: [0, 0, 0, 0], tint: [0, 0, 0], hr: 0, field: 0, forest: 0 };
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const x = x0 + (i + 0.5) / N * (x1 - x0), z = z0 + (j + 0.5) / N * (z1 - z0);
    const h = H[j * N + i];
    const hl = H[j * N + Math.max(0, i - 1)], hr = H[j * N + Math.min(N - 1, i + 1)];
    const hu = H[Math.max(0, j - 1) * N + i], hd = H[Math.min(N - 1, j + 1) * N + i];
    const nx = (hl - hr) / (2 * px), nz = (hu - hd) / (2 * px);
    const ny = 1 / Math.hypot(nx, 1, nz);
    let c;
    if (h < 0) {
      const d = Math.max(-40, h);
      c = [28 + d * 0.2, 96 + d * 1.2, 150 + d * 0.8];
    } else {
      world.shade(x, z, h, ny, sh);
      const s = sh.splat;
      const t = [sh.tint[0] * 255, sh.tint[1] * 255, sh.tint[2] * 255];
      const rock = z > 7000 ? [150, 100, 72] : [128, 118, 104];
      const dirt = [150, 125, 92];
      c = [0, 1, 2].map((k) => t[k] * (s[0] + s[2]) + rock[k] * s[1] + dirt[k] * s[3]);
      if (sh.field > 0.3) c = c.map((v, k) => v * (1 - sh.field * 0.35) + [196, 170, 92][k] * sh.field * 0.35);
      const shade = Math.max(0.45, Math.min(1.25, 0.82 + (nx * -0.55 + nz * -0.55) * 1.8));
      c = c.map((v) => v * shade);
    }
    const o = (j * N + i) * 4;
    img[o] = c[0]; img[o + 1] = c[1]; img[o + 2] = c[2]; img[o + 3] = 255;
  }
  return img;
}
