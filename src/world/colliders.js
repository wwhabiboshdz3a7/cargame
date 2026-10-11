// Collisions statiques : boîtes orientées (OBB) et cylindres verticaux, indexés par une grille spatiale.
import * as THREE from 'three';

const CELL = 32;
const keyOf = (cx, cz) => (cx + 2000) * 4000 + (cz + 2000);

export class Colliders {
  constructor() {
    this.boxes = [];
    this.cyls = [];
    this.grid = new Map();
    this.cgrid = new Map();
    this._stamp = 0;
  }

  // b: {c:[x,y,z], h:[hx,hy,hz], yaw, pitch, roll, surf, kind}
  addBox(b) {
    let ax, ay, az;
    if (b.axes) [ax, ay, az] = b.axes;
    else {
      const e = new THREE.Euler(b.pitch || 0, b.yaw || 0, b.roll || 0, 'YXZ');
      const me = new THREE.Matrix4().makeRotationFromEuler(e).elements;
      ax = [me[0], me[1], me[2]]; ay = [me[4], me[5], me[6]]; az = [me[8], me[9], me[10]];
    }
    const box = {
      cx: b.c[0], cy: b.c[1], cz: b.c[2], hx: b.h[0], hy: b.h[1], hz: b.h[2],
      // axes locaux (colonnes de la matrice)
      ax, ay, az,
      surf: b.surf ?? 5, kind: b.kind || 'static', id: this.boxes.length, stamp: 0, data: b.data || null,
    };
    // AABB
    const ex = Math.abs(box.ax[0]) * box.hx + Math.abs(box.ay[0]) * box.hy + Math.abs(box.az[0]) * box.hz;
    const ey = Math.abs(box.ax[1]) * box.hx + Math.abs(box.ay[1]) * box.hy + Math.abs(box.az[1]) * box.hz;
    const ez = Math.abs(box.ax[2]) * box.hx + Math.abs(box.ay[2]) * box.hy + Math.abs(box.az[2]) * box.hz;
    box.min = [box.cx - ex, box.cy - ey, box.cz - ez];
    box.max = [box.cx + ex, box.cy + ey, box.cz + ez];
    this.boxes.push(box);
    const x0 = Math.floor(box.min[0] / CELL), x1 = Math.floor(box.max[0] / CELL);
    const z0 = Math.floor(box.min[2] / CELL), z1 = Math.floor(box.max[2] / CELL);
    for (let cz = z0; cz <= z1; cz++) for (let cx = x0; cx <= x1; cx++) {
      const k = keyOf(cx, cz);
      let arr = this.grid.get(k);
      if (!arr) { arr = []; this.grid.set(k, arr); }
      arr.push(box);
    }
    return box;
  }

  addCylinder(x, z, r, y0, y1, surf = 6) {
    const c = { x, z, r, y0, y1, surf };
    this.cyls.push(c);
    const x0 = Math.floor((x - r) / CELL), x1 = Math.floor((x + r) / CELL);
    const z0 = Math.floor((z - r) / CELL), z1 = Math.floor((z + r) / CELL);
    for (let cz = z0; cz <= z1; cz++) for (let cx = x0; cx <= x1; cx++) {
      const k = keyOf(cx, cz);
      let arr = this.cgrid.get(k);
      if (!arr) { arr = []; this.cgrid.set(k, arr); }
      arr.push(c);
    }
    return c;
  }

  removeCylinders(list) {
    const set = new Set(list);
    for (const [k, arr] of this.cgrid) {
      const f = arr.filter((c) => !set.has(c));
      if (f.length !== arr.length) { if (f.length) this.cgrid.set(k, f); else this.cgrid.delete(k); }
    }
  }

  // Appelle cb(box) pour chaque boîte dont la cellule touche l'AABB (sans doublon)
  queryBoxes(minx, minz, maxx, maxz, cb) {
    const s = ++this._stamp;
    const x0 = Math.floor(minx / CELL), x1 = Math.floor(maxx / CELL);
    const z0 = Math.floor(minz / CELL), z1 = Math.floor(maxz / CELL);
    for (let cz = z0; cz <= z1; cz++) for (let cx = x0; cx <= x1; cx++) {
      const arr = this.grid.get(keyOf(cx, cz));
      if (!arr) continue;
      for (const b of arr) {
        if (b.stamp === s) continue;
        b.stamp = s;
        if (b.max[0] < minx || b.min[0] > maxx || b.max[2] < minz || b.min[2] > maxz) continue;
        cb(b);
      }
    }
  }

  queryCyls(minx, minz, maxx, maxz, cb) {
    if (this.providers) for (const pr of this.providers) pr(minx, minz, maxx, maxz, cb);
    const x0 = Math.floor(minx / CELL), x1 = Math.floor(maxx / CELL);
    const z0 = Math.floor(minz / CELL), z1 = Math.floor(maxz / CELL);
    const seen = (x0 === x1 && z0 === z1) ? null : new Set();
    for (let cz = z0; cz <= z1; cz++) for (let cx = x0; cx <= x1; cx++) {
      const arr = this.cgrid.get(keyOf(cx, cz));
      if (!arr) continue;
      for (const c of arr) {
        if (seen) { if (seen.has(c)) continue; seen.add(c); }
        cb(c);
      }
    }
  }

  // Lancer de rayon contre les boîtes. Renvoie la distance ou Infinity ; remplit outN (normale) et this.hitSurf
  raycast(ox, oy, oz, dx, dy, dz, maxT, outN) {
    let best = maxT;
    let hit = null;
    const ex = ox + dx * maxT, ez = oz + dz * maxT;
    this.queryBoxes(Math.min(ox, ex) - 0.1, Math.min(oz, ez) - 0.1, Math.max(ox, ex) + 0.1, Math.max(oz, ez) + 0.1, (b) => {
      if (Math.min(oy, oy + dy * maxT) > b.max[1] || Math.max(oy, oy + dy * maxT) < b.min[1]) return;
      // passage en repère local
      const px = ox - b.cx, py = oy - b.cy, pz = oz - b.cz;
      const lo = [px * b.ax[0] + py * b.ax[1] + pz * b.ax[2], px * b.ay[0] + py * b.ay[1] + pz * b.ay[2], px * b.az[0] + py * b.az[1] + pz * b.az[2]];
      const ld = [dx * b.ax[0] + dy * b.ax[1] + dz * b.ax[2], dx * b.ay[0] + dy * b.ay[1] + dz * b.ay[2], dx * b.az[0] + dy * b.az[1] + dz * b.az[2]];
      const he = [b.hx, b.hy, b.hz];
      let tmin = -Infinity, tmax = Infinity, axis = -1, sign = 1;
      for (let a = 0; a < 3; a++) {
        if (Math.abs(ld[a]) < 1e-9) {
          if (lo[a] < -he[a] || lo[a] > he[a]) return;
        } else {
          let t1 = (-he[a] - lo[a]) / ld[a], t2 = (he[a] - lo[a]) / ld[a];
          let s = -1;
          if (t1 > t2) { const tt = t1; t1 = t2; t2 = tt; s = 1; }
          if (t1 > tmin) { tmin = t1; axis = a; sign = s; }
          if (t2 < tmax) tmax = t2;
          if (tmin > tmax) return;
        }
      }
      if (tmin < 0 || tmin >= best || axis < 0) return;
      best = tmin;
      hit = b;
      const A = axis === 0 ? b.ax : axis === 1 ? b.ay : b.az;
      // la normale pointe vers l'extérieur de la face touchée (sign = -signe de la direction locale)
      const sgn = ld[axis] > 0 ? -1 : 1;
      outN.x = A[0] * sgn; outN.y = A[1] * sgn; outN.z = A[2] * sgn;
    });
    this.hitBox = hit;
    this.hitSurf = hit ? hit.surf : -1;
    return hit ? best : Infinity;
  }

  // Rampe : surface à sens unique (la moitié haute renvoie toujours la normale du dessus)
  static pointInRamp(b, x, y, z, outN) {
    const px = x - b.cx, py = y - b.cy, pz = z - b.cz;
    const lx = px * b.ax[0] + py * b.ax[1] + pz * b.ax[2];
    const ly = px * b.ay[0] + py * b.ay[1] + pz * b.ay[2];
    const lz = px * b.az[0] + py * b.az[1] + pz * b.az[2];
    if (Math.abs(lx) >= b.hx || Math.abs(ly) >= b.hy || Math.abs(lz) >= b.hz) return 0;
    if (ly > -b.hy * 0.2 || b.hy < 0.6) { outN.x = b.ay[0]; outN.y = b.ay[1]; outN.z = b.ay[2]; return b.hy - ly; }
    return Colliders.pointInBox(b, x, y, z, outN);
  }

  // Pénétration d'un point dans une boîte : renvoie la profondeur (>0) et remplit outN
  static pointInBox(b, x, y, z, outN) {
    const px = x - b.cx, py = y - b.cy, pz = z - b.cz;
    const lx = px * b.ax[0] + py * b.ax[1] + pz * b.ax[2];
    const ly = px * b.ay[0] + py * b.ay[1] + pz * b.ay[2];
    const lz = px * b.az[0] + py * b.az[1] + pz * b.az[2];
    const dx = b.hx - Math.abs(lx), dy = b.hy - Math.abs(ly), dz = b.hz - Math.abs(lz);
    if (dx <= 0 || dy <= 0 || dz <= 0) return 0;
    if (dy <= dx && dy <= dz) { const s = ly > 0 ? 1 : -1; outN.x = b.ay[0] * s; outN.y = b.ay[1] * s; outN.z = b.ay[2] * s; return dy; }
    if (dx <= dz) { const s = lx > 0 ? 1 : -1; outN.x = b.ax[0] * s; outN.y = b.ax[1] * s; outN.z = b.ax[2] * s; return dx; }
    const s = lz > 0 ? 1 : -1; outN.x = b.az[0] * s; outN.y = b.az[1] * s; outN.z = b.az[2] * s; return dz;
  }
}
