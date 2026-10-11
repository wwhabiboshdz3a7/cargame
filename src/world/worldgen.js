// Générateur du monde : relief naturel, zones aplanies, réseau routier (hauteurs, index spatial, graphe).
// Partagé entre le thread principal et les workers (aucune dépendance à three.js).
import { Simplex2, smoothstep, clamp, lerp } from './noise.js';
import { coastZ, FLAT_REGIONS, WORLD_HALF, CITY, AIRPORT, STUNT_PARK, CHOTT, OASIS, MONUMENT, PORT_QUAYS } from './layout.js';
import { ROADS, NODES, ROAD_TYPES } from './roadsData.js';

export const TYPE_NAMES = ['highway', 'national', 'mountain', 'piste', 'city'];
const TYPE_IDS = { highway: 0, national: 1, mountain: 2, piste: 3, city: 4 };

export const SURF = { ASPHALT: 0, DIRT: 1, GRASS: 2, SAND: 3, SALT: 4, CONCRETE: 5, ROCK: 6, WATER: 7 };
export const SURF_NAMES = ['Asphalte', 'Piste', 'Herbe', 'Sable', 'Sel', 'Béton', 'Roche', 'Eau'];

const ROAD_FLAT = 2.5; // accotement plat au-delà de la demi-largeur
const ROAD_FALL_MAX = 46;

// ---------------------------------------------------------------- grille spatiale CSR
function buildGrid(count, cell, bboxFn) {
  const cols = Math.ceil((WORLD_HALF * 2) / cell) + 2;
  const counts = new Int32Array(cols * cols + 1);
  const bb = [0, 0, 0, 0];
  const cellRange = (i) => {
    bboxFn(i, bb);
    const cx0 = clamp(Math.floor((bb[0] + WORLD_HALF) / cell), 0, cols - 1);
    const cz0 = clamp(Math.floor((bb[1] + WORLD_HALF) / cell), 0, cols - 1);
    const cx1 = clamp(Math.floor((bb[2] + WORLD_HALF) / cell), 0, cols - 1);
    const cz1 = clamp(Math.floor((bb[3] + WORLD_HALF) / cell), 0, cols - 1);
    return [cx0, cz0, cx1, cz1];
  };
  for (let i = 0; i < count; i++) {
    const [cx0, cz0, cx1, cz1] = cellRange(i);
    for (let cz = cz0; cz <= cz1; cz++) for (let cx = cx0; cx <= cx1; cx++) counts[cz * cols + cx + 1]++;
  }
  for (let k = 1; k < counts.length; k++) counts[k] += counts[k - 1];
  const start = counts;
  const fill = new Int32Array(cols * cols);
  const items = new Int32Array(start[cols * cols]);
  for (let i = 0; i < count; i++) {
    const [cx0, cz0, cx1, cz1] = cellRange(i);
    for (let cz = cz0; cz <= cz1; cz++) for (let cx = cx0; cx <= cx1; cx++) {
      const c = cz * cols + cx;
      items[start[c] + fill[c]++] = i;
    }
  }
  return { cell, cols, start, items };
}

// ---------------------------------------------------------------- spline Catmull-Rom centripète
function catmullRom(pts, step) {
  const out = [];
  const ctrlIdx = [];
  const n = pts.length;
  const P = (i) => {
    if (i < 0) return [2 * pts[0][0] - pts[1][0], 2 * pts[0][1] - pts[1][1]];
    if (i >= n) return [2 * pts[n - 1][0] - pts[n - 2][0], 2 * pts[n - 1][1] - pts[n - 2][1]];
    return pts[i];
  };
  for (let i = 0; i < n - 1; i++) {
    const p0 = P(i - 1), p1 = P(i), p2 = P(i + 1), p3 = P(i + 2);
    const d01 = Math.max(1e-3, Math.hypot(p1[0] - p0[0], p1[1] - p0[1]) ** 0.5);
    const d12 = Math.max(1e-3, Math.hypot(p2[0] - p1[0], p2[1] - p1[1]) ** 0.5);
    const d23 = Math.max(1e-3, Math.hypot(p3[0] - p2[0], p3[1] - p2[1]) ** 0.5);
    const t0 = 0, t1 = d01, t2 = t1 + d12, t3 = t2 + d23;
    const len = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]);
    const segs = Math.max(1, Math.ceil(len / step));
    ctrlIdx.push(out.length);
    for (let k = 0; k < segs; k++) {
      const t = lerp(t1, t2, k / segs);
      const r = [0, 0];
      for (let c = 0; c < 2; c++) {
        const a1 = ((t1 - t) / (t1 - t0)) * p0[c] + ((t - t0) / (t1 - t0)) * p1[c];
        const a2 = ((t2 - t) / (t2 - t1)) * p1[c] + ((t - t1) / (t2 - t1)) * p2[c];
        const a3 = ((t3 - t) / (t3 - t2)) * p2[c] + ((t - t2) / (t3 - t2)) * p3[c];
        const b1 = ((t2 - t) / (t2 - t0)) * a1 + ((t - t0) / (t2 - t0)) * a2;
        const b2 = ((t3 - t) / (t3 - t1)) * a2 + ((t - t1) / (t3 - t1)) * a3;
        r[c] = ((t2 - t) / (t2 - t1)) * b1 + ((t - t1) / (t2 - t1)) * b2;
      }
      out.push(r);
    }
  }
  ctrlIdx.push(out.length);
  out.push([pts[n - 1][0], pts[n - 1][1]]);
  return { samples: out, ctrlIdx };
}

export class WorldGen {
  constructor(serialized = null) {
    this.n1 = new Simplex2(1337);
    this.n2 = new Simplex2(4242);
    this.n3 = new Simplex2(9001);
    this.n4 = new Simplex2(777);
    this.regions = FLAT_REGIONS.map((r) => ({ ...r }));
    for (const r of this.regions) {
      if (r.type === 'rect') r.bb = [r.x0 - r.m[0], r.z0 - r.m[2], r.x1 + r.m[1], r.z1 + r.m[3]];
      else if (r.type === 'circle') r.bb = [r.x - r.r - r.m, r.z - r.r - r.m, r.x + r.r + r.m, r.z + r.r + r.m];
      else r.bb = [r.x - r.rx - r.m, r.z - r.rz - r.m, r.x + r.rx + r.m, r.z + r.rz + r.m];
    }
    // résultats de requête route (évite les allocations)
    this.rd = 0; this.ry = 0; this.rhw = 0; this.rtype = -1; this.rroad = -1; this.rs = 0; this.rtx = 0; this.rtz = 0; this.rseg = -1;
    this.surf = SURF.GRASS;
    if (serialized) this._load(serialized);
    else this._build();
  }

  // ------------------------------------------------------------ construction
  _build() {
    const roads = [];
    for (const def of ROADS) {
      const t = ROAD_TYPES[def.type];
      const pts = def.pts.map((p) => (typeof p === 'string' ? NODES[p] : p));
      const { samples, ctrlIdx } = def.type === 'city' ? this._straight(pts, t.step) : catmullRom(pts, t.step);
      const n = samples.length;
      const xs = new Float64Array(n), zs = new Float64Array(n), ys = new Float64Array(n), ss = new Float64Array(n);
      for (let i = 0; i < n; i++) {
        xs[i] = samples[i][0]; zs[i] = samples[i][1];
        if (i > 0) ss[i] = ss[i - 1] + Math.hypot(xs[i] - xs[i - 1], zs[i] - zs[i - 1]);
      }
      const nodes = [];
      def.pts.forEach((p, k) => { if (typeof p === 'string') nodes.push({ name: p, i: ctrlIdx[k] }); });
      if (typeof def.pts[0] !== 'string') nodes.unshift({ name: def.id + '_start', i: 0 });
      if (typeof def.pts[def.pts.length - 1] !== 'string') nodes.push({ name: def.id + '_end', i: n - 1 });
      roads.push({
        id: def.id, name: def.name, type: def.type, typeId: TYPE_IDS[def.type], carve: def.carve || 0,
        hw: t.halfWidth, n, xs, zs, ys, ss, nodes, length: ss[n - 1],
      });
    }
    this.roads = roads;
    this._buildCarve();
    // hauteurs 'auto' des zones
    for (const r of this.regions) {
      if (r.y === 'auto') {
        const cx = r.type === 'rect' ? (r.x0 + r.x1) / 2 : r.x;
        const cz = r.type === 'rect' ? (r.z0 + r.z1) / 2 : r.z;
        let s = 0, k = 0;
        for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) {
          const ex = r.type === 'rect' ? (r.x1 - r.x0) * 0.3 : (r.r || r.rx) * 0.4;
          const ez = r.type === 'rect' ? (r.z1 - r.z0) * 0.3 : (r.r || r.rz) * 0.4;
          s += this.natural(cx + a * ex, cz + b * ez); k++;
        }
        r.y = Math.max(3, s / k);
        if (r.id === 'chott') r.y -= 6;
      }
    }
    this._computeRoadHeights();
    this._buildRoadGrid();
    this._buildGraph();
  }

  _straight(pts, step) {
    const out = [], ctrlIdx = [];
    for (let i = 0; i < pts.length - 1; i++) {
      const [ax, az] = pts[i], [bx, bz] = pts[i + 1];
      const segs = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / step));
      ctrlIdx.push(out.length);
      for (let k = 0; k < segs; k++) out.push([lerp(ax, bx, k / segs), lerp(az, bz, k / segs)]);
    }
    ctrlIdx.push(out.length);
    out.push([...pts[pts.length - 1]]);
    return { samples: out, ctrlIdx };
  }

  _buildCarve() {
    const cs = [];
    for (const r of this.roads) {
      if (!r.carve) continue;
      for (let i = 0; i < r.n - 1; i += 4) {
        const j = Math.min(r.n - 1, i + 4);
        cs.push(r.xs[i], r.zs[i], r.xs[j], r.zs[j], r.carve);
      }
    }
    this.carveSegs = new Float64Array(cs);
    const R = 700;
    const segs = this.carveSegs;
    this.carveGrid = buildGrid(segs.length / 5, 250, (i, bb) => {
      const o = i * 5;
      bb[0] = Math.min(segs[o], segs[o + 2]) - R; bb[1] = Math.min(segs[o + 1], segs[o + 3]) - R;
      bb[2] = Math.max(segs[o], segs[o + 2]) + R; bb[3] = Math.max(segs[o + 1], segs[o + 3]) + R;
    });
  }

  // Facteur d'atténuation du relief le long des routes "creusées" (vallées, cols) : 0.12 .. 1
  carveFactor(x, z) {
    const g = this.carveGrid;
    const cx = Math.floor((x + WORLD_HALF) / g.cell), cz = Math.floor((z + WORLD_HALF) / g.cell);
    if (cx < 0 || cz < 0 || cx >= g.cols || cz >= g.cols) return 1;
    const c = cz * g.cols + cx;
    const segs = this.carveSegs;
    let f = 1;
    for (let k = g.start[c]; k < g.start[c + 1]; k++) {
      const o = g.items[k] * 5;
      const ax = segs[o], az = segs[o + 1], dx = segs[o + 2] - ax, dz = segs[o + 3] - az;
      const L2 = dx * dx + dz * dz;
      let t = L2 > 0 ? ((x - ax) * dx + (z - az) * dz) / L2 : 0;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      const ex = ax + dx * t - x, ez = az + dz * t - z;
      const d = Math.sqrt(ex * ex + ez * ez);
      if (d < 700) {
        const v = 1 - segs[o + 4] * 0.88 * (1 - smoothstep(40, 700, d));
        if (v < f) f = v;
      }
    }
    return f;
  }

  _computeRoadHeights() {
    const nodeY = {};
    const order = this.roads.map((r, i) => i).sort((a, b) => ROAD_TYPES[this.roads[b].type].priority - ROAD_TYPES[this.roads[a].type].priority);
    for (const ri of order) {
      const r = this.roads[ri];
      const t = ROAD_TYPES[r.type];
      const n = r.n;
      const nat = new Float64Array(n);
      for (let i = 0; i < n; i++) nat[i] = this.preRoad(r.xs[i], r.zs[i]);
      let ys = r.ys;
      if (r.type === 'city') {
        for (let i = 0; i < n; i++) ys[i] = nat[i];
      } else {
        // moyenne glissante sur une fenêtre en mètres
        const W = t.smooth;
        let lo = 0, hi = 0, sum = 0;
        for (let i = 0; i < n; i++) {
          while (hi < n && r.ss[hi] <= r.ss[i] + W) { sum += nat[hi]; hi++; }
          while (r.ss[lo] < r.ss[i] - W) { sum -= nat[lo]; lo++; }
          ys[i] = Math.max(2.5, sum / (hi - lo));
        }
        // ancrage sur les noeuds déjà fixés
        const fixed = new Uint8Array(n);
        const pins = r.nodes.filter((nd) => nodeY[nd.name] !== undefined).map((nd) => ({ i: nd.i, d: nodeY[nd.name] - ys[nd.i] }));
        pins.sort((a, b) => a.i - b.i);
        if (pins.length) {
          const corr = new Float64Array(n);
          for (let i = 0; i < n; i++) {
            const s = r.ss[i];
            if (i <= pins[0].i) corr[i] = pins[0].d * (1 - smoothstep(0, 500, r.ss[pins[0].i] - s));
            else if (i >= pins[pins.length - 1].i) { const p = pins[pins.length - 1]; corr[i] = p.d * (1 - smoothstep(0, 500, s - r.ss[p.i])); }
            else {
              let k = 0;
              while (pins[k + 1].i < i) k++;
              const a = pins[k], b = pins[k + 1];
              const u = (s - r.ss[a.i]) / Math.max(1e-6, r.ss[b.i] - r.ss[a.i]);
              corr[i] = lerp(a.d, b.d, u);
            }
          }
          for (let i = 0; i < n; i++) ys[i] += corr[i];
          for (const p of pins) fixed[p.i] = 1;
        }
        // limitation de pente : cônes depuis les points fixes + passes avant/arrière
        this._limitGrade(r, ys, fixed, t.maxGrade);
        for (let i = 0; i < n; i++) if (ys[i] < 2.5) ys[i] = 2.5;
      }
      for (const nd of r.nodes) if (nodeY[nd.name] === undefined) nodeY[nd.name] = ys[nd.i];
    }
    this.nodeY = nodeY;
  }

  _limitGrade(r, ys, fixed, g) {
    const n = r.n, ss = r.ss;
    const fixedIdx = [];
    for (let i = 0; i < n; i++) if (fixed[i]) fixedIdx.push(i);
    const bounds = [-1, ...fixedIdx, n];
    for (let k = 0; k < bounds.length - 1; k++) {
      const a = bounds[k], b = bounds[k + 1];
      const i0 = a < 0 ? 0 : a + 1, i1 = b >= n ? n - 1 : b - 1;
      if (i1 < i0) continue;
      const feasible = a < 0 || b >= n || Math.abs(ys[b] - ys[a]) <= g * (ss[b] - ss[a]);
      for (let i = i0; i <= i1; i++) {
        if (!feasible) { ys[i] = lerp(ys[a], ys[b], (ss[i] - ss[a]) / (ss[b] - ss[a])); continue; }
        let lo = -1e9, hi = 1e9;
        if (a >= 0) { lo = Math.max(lo, ys[a] - g * (ss[i] - ss[a])); hi = Math.min(hi, ys[a] + g * (ss[i] - ss[a])); }
        if (b < n) { lo = Math.max(lo, ys[b] - g * (ss[b] - ss[i])); hi = Math.min(hi, ys[b] + g * (ss[b] - ss[i])); }
        ys[i] = clamp(ys[i], lo, hi);
      }
      if (!feasible) continue;
      const s0 = a < 0 ? i0 : a, s1 = b >= n ? i1 : b;
      const F = ys.slice(s0, s1 + 1), B = ys.slice(s0, s1 + 1);
      for (let i = 1; i < F.length; i++) { const ds = g * (ss[s0 + i] - ss[s0 + i - 1]); F[i] = clamp(F[i], F[i - 1] - ds, F[i - 1] + ds); }
      for (let i = B.length - 2; i >= 0; i--) { const ds = g * (ss[s0 + i + 1] - ss[s0 + i]); B[i] = clamp(B[i], B[i + 1] - ds, B[i + 1] + ds); }
      for (let i = i0; i <= i1; i++) ys[i] = 0.5 * (F[i - s0] + B[i - s0]);
    }
    // léger lissage final (préserve les points fixes)
    for (let it = 0; it < 4; it++) {
      for (let i = 1; i < n - 1; i++) if (!fixed[i]) ys[i] = 0.25 * ys[i - 1] + 0.5 * ys[i] + 0.25 * ys[i + 1];
    }
  }

  _buildRoadGrid() {
    // Segments des routes hors ville (la ville est déjà plate)
    const segRoad = [], segI = [];
    for (let ri = 0; ri < this.roads.length; ri++) {
      const r = this.roads[ri];
      if (r.type === 'city') continue;
      for (let i = 0; i < r.n - 1; i++) { segRoad.push(ri); segI.push(i); }
    }
    this.segRoad = Int32Array.from(segRoad);
    this.segI = Int32Array.from(segI);
    const roads = this.roads;
    this.roadGrid = buildGrid(segRoad.length, 64, (k, bb) => {
      const r = roads[segRoad[k]], i = segI[k];
      const R = r.hw + ROAD_FLAT + ROAD_FALL_MAX;
      bb[0] = Math.min(r.xs[i], r.xs[i + 1]) - R; bb[1] = Math.min(r.zs[i], r.zs[i + 1]) - R;
      bb[2] = Math.max(r.xs[i], r.xs[i + 1]) + R; bb[3] = Math.max(r.zs[i], r.zs[i + 1]) + R;
    });
  }

  _buildGraph() {
    const nodes = [], byName = {};
    const getNode = (name, x, z) => {
      if (byName[name] !== undefined) return byName[name];
      const id = nodes.length;
      nodes.push({ id, name, x, z, y: this.nodeY[name] ?? this.height(x, z), edges: [] });
      byName[name] = id;
      return id;
    };
    const edges = [];
    for (let ri = 0; ri < this.roads.length; ri++) {
      const r = this.roads[ri];
      const nds = r.nodes.slice().sort((a, b) => a.i - b.i);
      for (let k = 0; k < nds.length - 1; k++) {
        const A = nds[k], B = nds[k + 1];
        if (B.i <= A.i) continue;
        const a = getNode(A.name, r.xs[A.i], r.zs[A.i]);
        const b = getNode(B.name, r.xs[B.i], r.zs[B.i]);
        const e = { id: edges.length, a, b, road: ri, i0: A.i, i1: B.i, len: r.ss[B.i] - r.ss[A.i] };
        edges.push(e);
        nodes[a].edges.push(e.id);
        nodes[b].edges.push(e.id);
      }
    }
    this.graph = { nodes, edges, byName };
  }

  serialize() {
    return {
      roads: this.roads.map((r) => ({ id: r.id, type: r.type, typeId: r.typeId, carve: r.carve, hw: r.hw, n: r.n, xs: r.xs, zs: r.zs, ys: r.ys, ss: r.ss, nodes: r.nodes, name: r.name, length: r.length })),
      regionsY: this.regions.map((r) => r.y),
    };
  }

  _load(s) {
    this.roads = s.roads;
    this.regions.forEach((r, i) => { r.y = s.regionsY[i]; });
    this._buildCarve();
    this._buildRoadGrid();
  }

  // ------------------------------------------------------------ relief
  mountainMask(z) {
    return smoothstep(-5200, -3200, z) * (1 - smoothstep(2400, 4600, z));
  }

  natural(x, z) {
    const n1 = this.n1, n2 = this.n2, n3 = this.n3;
    const c = coastZ(x);
    const d = z - c;
    const lf = n1.fbm(x * 0.00012, z * 0.00012, 3);
    if (d < -60) {
      let h = -1.2 + (d + 60) * 0.014 + n2.noise(x * 0.003, z * 0.003) * 0.8 - 0.84;
      return h < -45 ? -45 : h;
    }
    const beach = -2.04 + 4.4 * smoothstep(-60, 110, d);
    if (d < 30) return beach;
    // profil macro nord -> sud
    let h = 10 + 30 * smoothstep(300, 4500, d)
      + 400 * smoothstep(-5000, -600, z)
      + 220 * smoothstep(1500, 4800, z)
      - 240 * smoothstep(6500, 9500, z)
      + 30 * lf * smoothstep(200, 2500, d);
    const desert = smoothstep(7000, 9200, z);
    const M = this.mountainMask(z);
    const carve = (M > 0 || desert > 0) ? this.carveFactor(x, z) : 1;
    // Atlas tellien : crêtes orientées est-ouest
    if (M > 0) {
      const ridge = n3.ridged(x * 0.00026, z * 0.00048, 4, 2.0, 0.42);
      const amp = 0.7 + 0.3 * n1.noise(x * 0.00015 + 5, z * 0.0003);
      h += M * (ridge * 700 - 110) * amp * carve;
      h += M * 14 * n2.fbm(x * 0.004, z * 0.004, 3) * carve;
    }
    // collines génériques
    h += (1 - M) * (1 - desert) * 22 * n2.fbm(x * 0.0011, z * 0.0011, 4);
    // Sahel côtier (collines derrière la côte), atténué autour d'Alger et de l'aéroport
    const sahelMask = smoothstep(200, 1000, d) * (1 - smoothstep(2400, 3900, d))
      * (1 - 0.85 * smoothstep(-7400, -6200, x) * (1 - smoothstep(8600, 9800, x)));
    if (sahelMask > 0) h += sahelMask * Math.max(0, 55 + 85 * n1.fbm(x * 0.0007 + 3.1, z * 0.0007, 4));
    // Riadh El Feth (colline du monument)
    const mx = x - MONUMENT.x, mz = z - MONUMENT.z;
    h += 28 * Math.exp(-(mx * mx + mz * mz) / (450 * 450));
    // Désert
    if (desert > 0) {
      const erg = desert * (1 - smoothstep(-1800, 1400, x));
      const tassili = desert * smoothstep(5200, 7800, x);
      if (erg > 0) h += erg * this.dunes(x, z) * 34 * (0.25 + 0.75 * carve);
      if (tassili > 0) {
        const m = n3.fbm(x * 0.0009 + 7.7, z * 0.0009, 4);
        let v = smoothstep(0.02, 0.09, m) * 60 + smoothstep(0.3, 0.36, m) * 55;
        const p = n2.noise(x * 0.0055, z * 0.0055);
        v += smoothstep(0.7, 0.78, p) * 45;
        h += tassili * v * carve;
      }
      // reg : petites ondulations
      h += desert * 6 * n1.fbm(x * 0.003, z * 0.003, 2);
    }
    // raccord avec la plage
    return lerp(beach, h, smoothstep(30, 300, d));
  }

  dunes(x, z) {
    const n1 = this.n1, n2 = this.n2, n3 = this.n3;
    const wx = x + 420 * n2.noise(x * 0.0004, z * 0.0004);
    const wz = z + 420 * n2.noise(x * 0.0004 + 50, z * 0.0004 + 50);
    const u = (wx * 0.83 + wz * 0.55) / 340;
    const f = u - Math.floor(u);
    const prof = f < 0.72 ? smoothstep(0, 0.72, f) : 1 - smoothstep(0.72, 1.0, f);
    const amp = 0.55 + 0.45 * n1.noise(wx * 0.0007, wz * 0.0007);
    const sec = 1 - Math.abs(n3.noise(x * 0.004, z * 0.004));
    return prof * amp + sec * 0.12;
  }

  regionWeight(r, x, z) {
    const bb = r.bb;
    if (x < bb[0] || x > bb[2] || z < bb[1] || z > bb[3]) return 0;
    if (r.type === 'rect') {
      let wx = 1, wz = 1;
      if (x < r.x0) wx = 1 - smoothstep(0, r.m[0], r.x0 - x);
      else if (x > r.x1) wx = 1 - smoothstep(0, r.m[1], x - r.x1);
      if (z < r.z0) wz = 1 - smoothstep(0, r.m[2], r.z0 - z);
      else if (z > r.z1) wz = 1 - smoothstep(0, r.m[3], z - r.z1);
      return wx * wz;
    }
    if (r.type === 'circle') {
      const d = Math.hypot(x - r.x, z - r.z) - r.r;
      return d <= 0 ? 1 : 1 - smoothstep(0, r.m, d);
    }
    const ex = (x - r.x) / r.rx, ez = (z - r.z) / r.rz;
    const e = Math.sqrt(ex * ex + ez * ez);
    if (e <= 1) return 1;
    return 1 - smoothstep(0, r.m, (e - 1) * Math.min(r.rx, r.rz));
  }

  preRoad(x, z) {
    let h = this.natural(x, z);
    const regs = this.regions;
    for (let i = 0; i < regs.length; i++) {
      const w = this.regionWeight(regs[i], x, z);
      if (w > 0) h += (regs[i].y - h) * w;
    }
    return h;
  }

  // Requête de la route la plus proche (bord le plus proche). Renvoie true si trouvée.
  queryRoad(x, z) {
    const g = this.roadGrid;
    const cx = Math.floor((x + WORLD_HALF) / g.cell), cz = Math.floor((z + WORLD_HALF) / g.cell);
    this.rroad = -1;
    if (cx < 0 || cz < 0 || cx >= g.cols || cz >= g.cols) return false;
    const c = cz * g.cols + cx;
    let best = 1e18;
    const roads = this.roads;
    for (let k = g.start[c]; k < g.start[c + 1]; k++) {
      const sk = g.items[k];
      const r = roads[this.segRoad[sk]], i = this.segI[sk];
      const ax = r.xs[i], az = r.zs[i], dx = r.xs[i + 1] - ax, dz = r.zs[i + 1] - az;
      const L2 = dx * dx + dz * dz;
      let t = L2 > 0 ? ((x - ax) * dx + (z - az) * dz) / L2 : 0;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      const ex = ax + dx * t - x, ez = az + dz * t - z;
      const d = Math.sqrt(ex * ex + ez * ez);
      const m = d - r.hw;
      if (m < best && d < r.hw + ROAD_FLAT + ROAD_FALL_MAX) {
        best = m;
        this.rd = d; this.rhw = r.hw; this.rtype = r.typeId; this.rroad = this.segRoad[sk]; this.rseg = sk;
        this.ry = r.ys[i] + (r.ys[i + 1] - r.ys[i]) * t;
        this.rs = r.ss[i] + (r.ss[i + 1] - r.ss[i]) * t;
        const L = Math.sqrt(L2) || 1;
        this.rtx = dx / L; this.rtz = dz / L;
      }
    }
    return this.rroad >= 0;
  }

  // Hauteur exacte du sol (physique)
  height(x, z) {
    let h = this.preRoad(x, z);
    if (this.queryRoad(x, z)) {
      const e = this.rd - (this.rhw + ROAD_FLAT);
      if (e <= 0) return this.ry;
      const diff = h - this.ry;
      const fall = clamp(6 + Math.abs(diff) * 1.4, 6, ROAD_FALL_MAX);
      if (e < fall) h = this.ry + diff * smoothstep(0, fall, e);
    }
    return h;
  }

  // Hauteur + type de surface (this.surf)
  ground(x, z) {
    const h = this.height(x, z);
    this.surf = this.surfaceAfterHeight(x, z, h);
    return h;
  }

  surfaceAfterHeight(x, z, h) {
    if (this.rroad >= 0 && this.rd < this.rhw + 0.4) return this.rtype === 3 ? SURF.DIRT : SURF.ASPHALT;
    if (h < -0.3) return SURF.WATER;
    if (x > CITY.x0 - 200 && x < CITY.x1 + 200 && z > -10020 && z < CITY.z1 + 60) return SURF.ASPHALT;
    if (z < -9990 && z > -11000 && x > -5400 && x < -1600) {
      for (const q of PORT_QUAYS) if (x >= q.x0 && x <= q.x1 && z >= q.z0 && z <= q.z1) return SURF.CONCRETE;
    }
    if (x > AIRPORT.x0 && x < AIRPORT.x1 && z > AIRPORT.z0 && z < AIRPORT.z1) {
      const R = AIRPORT.runway, T = AIRPORT.taxiway, A = AIRPORT.apron;
      if (Math.abs(z - R.z) < R.w / 2 && x > R.x0 && x < R.x1) return SURF.ASPHALT;
      if (Math.abs(z - T.z) < T.w / 2 && x > T.x0 && x < T.x1) return SURF.ASPHALT;
      if (x > A.x0 && x < A.x1 && z > A.z0 && z < A.z1) return SURF.CONCRETE;
      return SURF.GRASS;
    }
    if (x > STUNT_PARK.x0 && x < STUNT_PARK.x1 && z > STUNT_PARK.z0 && z < STUNT_PARK.z1) return SURF.CONCRETE;
    const ex = (x - CHOTT.x) / CHOTT.rx, ez = (z - CHOTT.z) / CHOTT.rz;
    if (ex * ex + ez * ez < 1.05) return SURF.SALT;
    if (z > 7600) {
      if (Math.hypot(x - OASIS.x, z - OASIS.z) < OASIS.r) return SURF.DIRT;
      if (x < 300) return SURF.SAND;
      if (x > 6500) return SURF.ROCK;
      return SURF.DIRT;
    }
    if (z - coastZ(x) < 70) return SURF.SAND;
    if (z > 3600) return SURF.DIRT;
    return SURF.GRASS;
  }

  // Normale du terrain (différences finies)
  normal(x, z, out, eps = 0.6) {
    const hl = this.height(x - eps, z), hr = this.height(x + eps, z);
    const hd = this.height(x, z - eps), hu = this.height(x, z + eps);
    let nx = hl - hr, ny = 2 * eps, nz = hd - hu;
    const L = Math.hypot(nx, ny, nz);
    out.x = nx / L; out.y = ny / L; out.z = nz / L;
    return out;
  }

  forestMask(x, z, h) {
    const M = this.mountainMask(z);
    if (M <= 0) return 0;
    return M * smoothstep(-0.15, 0.2, this.n4.fbm(x * 0.0008, z * 0.0008, 3)) * (1 - smoothstep(1050, 1250, h));
  }

  // ------------------------------------------------------------ données d'apparence pour le rendu
  // Remplit out: { hr (hauteur rendue), splat[4] (herbe, roche, sable, terre), tint[3], field }
  shade(x, z, h, ny, out) {
    const n4 = this.n4;
    const d = z - coastZ(x);
    const desert = smoothstep(7000, 9200, z);
    const steppe = smoothstep(2600, 4200, z) * (1 - desert);
    const M = this.mountainMask(z);
    let grass = 1, rock = 0, sand = 0, dirt = 0, field = 0;
    // teinte d'herbe
    let tr = 0.40, tg = 0.50, tb = 0.21;
    const forestN = n4.fbm(x * 0.0008, z * 0.0008, 3);
    const forest = M * smoothstep(-0.15, 0.2, forestN) * (1 - smoothstep(1050, 1250, h));
    tr = lerp(tr, 0.47, M * 0.6); tg = lerp(tg, 0.47, M * 0.6); tb = lerp(tb, 0.25, M * 0.6);
    tr = lerp(tr, 0.20, forest); tg = lerp(tg, 0.30, forest); tb = lerp(tb, 0.12, forest);
    tr = lerp(tr, 0.64, steppe); tg = lerp(tg, 0.58, steppe); tb = lerp(tb, 0.35, steppe);
    // terres agricoles (Mitidja)
    if (M < 0.6 && steppe < 0.5 && desert === 0) {
      const fm = smoothstep(350, 900, d) * (1 - M) * smoothstep(-0.3, 0.05, n4.noise(x * 0.00045 + 9, z * 0.00045));
      field = fm * (1 - smoothstep(-4600, -3600, z));
    }
    // désert
    if (desert > 0) {
      const erg = 1 - smoothstep(-1800, 1400, x);
      const tass = smoothstep(5200, 7800, x);
      sand = desert * (0.55 + 0.45 * erg) * (1 - tass * 0.7);
      dirt = desert * (1 - erg) * 0.4;
      grass *= 1 - desert;
      const sr = lerp(0.84, 0.93, erg), sg = lerp(0.64, 0.66, erg), sb = lerp(0.42, 0.38, erg);
      tr = lerp(tr, sr, desert); tg = lerp(tg, sg, desert); tb = lerp(tb, sb, desert);
      rock += desert * tass * 0.5;
      // oasis : sol plus sombre et palmeraie
      const od = Math.hypot(x - OASIS.x, z - OASIS.z);
      const oas = 1 - smoothstep(OASIS.r * 0.4, OASIS.r * 1.3, od);
      if (oas > 0) { dirt += oas * 0.5; sand *= 1 - oas * 0.5; tr = lerp(tr, 0.62, oas * 0.6); tg = lerp(tg, 0.55, oas * 0.6); tb = lerp(tb, 0.32, oas * 0.6); }
    }
    // plage
    if (d < 140 && h < 6) {
      const b = (1 - smoothstep(60, 140, d)) * (1 - smoothstep(3, 6, h));
      sand = Math.max(sand, b); grass *= 1 - b; field *= 1 - b;
      tr = lerp(tr, 0.88, b); tg = lerp(tg, 0.80, b); tb = lerp(tb, 0.60, b);
    }
    // chott (sel)
    const ce = Math.hypot((x - CHOTT.x) / CHOTT.rx, (z - CHOTT.z) / CHOTT.rz);
    if (ce < 1.25) {
      const s = 1 - smoothstep(0.85, 1.2, ce);
      sand = Math.max(sand, s); grass *= 1 - s;
      tr = lerp(tr, 0.95, s); tg = lerp(tg, 0.94, s); tb = lerp(tb, 0.90, s);
    }
    // pente => roche
    const slope = 1 - ny;
    const rs = smoothstep(0.16, 0.36, slope);
    rock = Math.max(rock, rs);
    // montagnes hautes : roche partielle
    rock = Math.max(rock, M * smoothstep(900, 1200, h) * 0.6);
    // zones aménagées
    let flat = 0;
    for (let i = 0; i < this.regions.length; i++) {
      const r = this.regions[i];
      if (r.id === 'chott' || r.id === 'megaramp' || r.id === 'oasis') continue;
      flat = Math.max(flat, this.regionWeight(r, x, z));
    }
    if (flat > 0) { field *= 1 - flat; dirt = Math.max(dirt, flat * 0.35); }
    // accotements de route
    let hr = h;
    if (this.queryRoad(x, z)) {
      const e = this.rd - this.rhw;
      const sh = 1 - smoothstep(0, 4.5, e);
      if (sh > 0) { dirt = Math.max(dirt, sh * 0.9); field *= 1 - sh; }
      hr -= 0.16 * (1 - smoothstep(-1, ROAD_FLAT + 1.5, e));
    }
    // normalisation
    grass = Math.max(0, grass * (1 - rock) * (1 - sand) * (1 - dirt));
    rock = rock * (1 - sand * 0.3);
    const sum = grass + rock + sand + dirt + 1e-5;
    out.hr = hr;
    out.splat[0] = grass / sum; out.splat[1] = rock / sum; out.splat[2] = sand / sum; out.splat[3] = dirt / sum;
    out.tint[0] = tr; out.tint[1] = tg; out.tint[2] = tb;
    out.field = clamp(field * (1 - rock) * 1.2, 0, 1);
    out.forest = forest * (1 - rock);
    return out;
  }

  // ------------------------------------------------------------ utilitaires réseau
  // Point le plus proche sur une route (renvoie {road, i, t, x, z, y, dist, tx, tz})
  nearestRoadPoint(x, z, maxDist = 400, includeCity = true) {
    let best = null;
    const tryRoad = (r, ri) => {
      for (let i = 0; i < r.n - 1; i++) {
        const ax = r.xs[i], az = r.zs[i];
        if (Math.abs(ax - x) > maxDist + 50 || Math.abs(az - z) > maxDist + 50) continue;
        const dx = r.xs[i + 1] - ax, dz = r.zs[i + 1] - az;
        const L2 = dx * dx + dz * dz;
        let t = L2 > 0 ? ((x - ax) * dx + (z - az) * dz) / L2 : 0;
        t = clamp(t, 0, 1);
        const px = ax + dx * t, pz = az + dz * t;
        const dist = Math.hypot(px - x, pz - z);
        if (dist < maxDist && (!best || dist < best.dist)) {
          const L = Math.sqrt(L2) || 1;
          best = { road: ri, i, t, x: px, z: pz, y: r.ys[i] + (r.ys[i + 1] - r.ys[i]) * t, dist, tx: dx / L, tz: dz / L };
        }
      }
    };
    this.roads.forEach((r, ri) => { if (includeCity || r.type !== 'city') tryRoad(r, ri); });
    return best;
  }
}
