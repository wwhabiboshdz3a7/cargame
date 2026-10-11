// Végétation instanciée par tuiles (pins, cèdres, oliviers, palmiers, eucalyptus, figuiers de Barbarie, buissons, rochers).
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { hash2, smoothstep } from './noise.js';
import { coastZ, WORLD_HALF, CHOTT, OASIS } from './layout.js';

const TILE = 200;
const CELL = 10;

// --------------------------------------------------------------- géométries des espèces
function colored(geo, color) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  const c = new THREE.Color(color);
  const n = g.attributes.position.count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const v = 0.85 + ((i * 7919) % 31) / 100;
    arr[i * 3] = c.r * v; arr[i * 3 + 1] = c.g * v; arr[i * 3 + 2] = c.b * v;
  }
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  if (g.attributes.uv) g.deleteAttribute('uv');
  return g;
}
function jitter(geo, amt, seed) {
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const h = Math.sin(i * 12.9898 + seed * 78.233) * 43758.5453;
    const r = (h - Math.floor(h)) - 0.5;
    p.setXYZ(i, p.getX(i) * (1 + r * amt), p.getY(i) * (1 + r * amt * 0.5), p.getZ(i) * (1 + r * amt));
  }
  geo.computeVertexNormals();
  return geo;
}

function speciesGeometries() {
  const TR = '#5a4030', TRL = '#cfc2ad';
  const S = {};
  // Pin d'Alep
  S.pine = {
    hi: mergeGeometries([
      colored(new THREE.CylinderGeometry(0.18, 0.32, 9, 6).translate(0, 4.5, 0), TR),
      colored(jitter(new THREE.IcosahedronGeometry(2.6, 1).scale(1.3, 0.55, 1.3).translate(0.4, 9, 0), 0.25, 1), '#2f4a22'),
      colored(jitter(new THREE.IcosahedronGeometry(2.1, 1).scale(1.2, 0.6, 1.2).translate(-1.2, 7.6, 0.6), 0.25, 2), '#36552a'),
      colored(jitter(new THREE.IcosahedronGeometry(1.8, 1).scale(1.2, 0.6, 1.2).translate(1.0, 7.0, -1.0), 0.25, 3), '#2c4620'),
    ]),
    lo: mergeGeometries([
      colored(new THREE.CylinderGeometry(0.2, 0.3, 7, 3).translate(0, 3.5, 0), TR),
      colored(new THREE.IcosahedronGeometry(3, 0).scale(1.3, 0.7, 1.3).translate(0, 8.4, 0), '#2f4a22'),
    ]),
    r: 0.35,
  };
  // Cèdre de l'Atlas (étages plats)
  const cedarHi = [colored(new THREE.CylinderGeometry(0.25, 0.45, 15, 6).translate(0, 7.5, 0), TR)];
  for (let k = 0; k < 5; k++) cedarHi.push(colored(jitter(new THREE.CylinderGeometry(4.8 - k * 0.85, 5.2 - k * 0.85, 1.3, 8).translate(0, 5 + k * 2.3, 0), 0.18, k), k % 2 ? '#24402a' : '#2c4c31'));
  S.cedar = {
    hi: mergeGeometries(cedarHi),
    lo: mergeGeometries([colored(new THREE.CylinderGeometry(0.3, 0.4, 6, 3).translate(0, 3, 0), TR), colored(new THREE.ConeGeometry(5, 12, 5).translate(0, 10, 0), '#24402a')]),
    r: 0.45,
  };
  // Olivier
  S.olive = {
    hi: mergeGeometries([
      colored(new THREE.CylinderGeometry(0.25, 0.4, 2.6, 6).translate(0, 1.3, 0).rotateZ(0.1), '#6b5a48'),
      colored(jitter(new THREE.IcosahedronGeometry(2.2, 1).scale(1.3, 0.8, 1.3).translate(0, 3.5, 0), 0.3, 4), '#76845a'),
      colored(jitter(new THREE.IcosahedronGeometry(1.4, 1).translate(1.2, 3.0, 0.8), 0.3, 5), '#6c7a50'),
    ]),
    lo: mergeGeometries([colored(new THREE.CylinderGeometry(0.3, 0.4, 2.4, 3).translate(0, 1.2, 0), '#6b5a48'), colored(new THREE.IcosahedronGeometry(2.6, 0).scale(1.2, 0.8, 1.2).translate(0, 3.4, 0), '#76845a')]),
    r: 0.4,
  };
  // Oranger
  S.orange = {
    hi: mergeGeometries([
      colored(new THREE.CylinderGeometry(0.15, 0.22, 1.6, 6).translate(0, 0.8, 0), TR),
      colored(jitter(new THREE.IcosahedronGeometry(1.8, 1).translate(0, 2.6, 0), 0.2, 6), '#2f5a24'),
      colored(new THREE.IcosahedronGeometry(0.18, 0).translate(1.2, 2.8, 0.9), '#ff8a10'),
      colored(new THREE.IcosahedronGeometry(0.18, 0).translate(-1.1, 2.3, 1.0), '#ff8a10'),
      colored(new THREE.IcosahedronGeometry(0.18, 0).translate(0.3, 3.6, -1.3), '#ff8a10'),
    ]),
    lo: colored(new THREE.IcosahedronGeometry(1.9, 0).translate(0, 2.5, 0), '#2f5a24'),
    r: 0.25,
  };
  // Palmier dattier
  const palmParts = [];
  for (let k = 0; k < 6; k++) palmParts.push(colored(new THREE.CylinderGeometry(0.28 - k * 0.012, 0.32 - k * 0.012, 2, 7).translate(0.08 * k * k * 0.1, 1 + k * 2, 0), k % 2 ? '#7a6248' : '#6e5840'));
  for (let k = 0; k < 11; k++) {
    const a = (k / 11) * Math.PI * 2;
    const fr = new THREE.PlaneGeometry(0.9, 5.2, 1, 4).translate(0, 2.6, 0);
    const p = fr.attributes.position;
    for (let i = 0; i < p.count; i++) { const y = p.getY(i); p.setZ(i, -(y * y) * 0.06); }
    fr.rotateX(-1.0 + (k % 3) * 0.25).rotateY(a).translate(0.35, 12, 0);
    palmParts.push(colored(fr, k % 2 ? '#4f7a2a' : '#5c8a32'));
  }
  S.palm = {
    hi: mergeGeometries(palmParts),
    lo: mergeGeometries([colored(new THREE.CylinderGeometry(0.25, 0.32, 12, 4).translate(0, 6, 0), '#7a6248'), colored(new THREE.ConeGeometry(4, 2.5, 6, 1, true).translate(0, 11.5, 0), '#4f7a2a')]),
    r: 0.35, doubleSided: true,
  };
  // Eucalyptus
  S.eucalyptus = {
    hi: mergeGeometries([
      colored(new THREE.CylinderGeometry(0.25, 0.45, 16, 6).translate(0, 8, 0), TRL),
      colored(jitter(new THREE.IcosahedronGeometry(2.6, 1).scale(1, 1.6, 1).translate(0.6, 15, 0), 0.3, 7), '#5f7f58'),
      colored(jitter(new THREE.IcosahedronGeometry(2.0, 1).scale(1, 1.5, 1).translate(-1.2, 12, 0.4), 0.3, 8), '#6a8a60'),
    ]),
    lo: mergeGeometries([colored(new THREE.CylinderGeometry(0.3, 0.4, 12, 3).translate(0, 6, 0), TRL), colored(new THREE.IcosahedronGeometry(3, 0).scale(1, 1.6, 1).translate(0, 14, 0), '#5f7f58')]),
    r: 0.45,
  };
  // Buisson
  S.bush = {
    hi: colored(jitter(new THREE.IcosahedronGeometry(1.1, 1).scale(1.3, 0.7, 1.3).translate(0, 0.6, 0), 0.35, 9), '#5d6b38'),
    lo: colored(new THREE.IcosahedronGeometry(1.1, 0).scale(1.3, 0.7, 1.3).translate(0, 0.6, 0), '#5d6b38'),
    r: 0,
  };
  // Figuier de Barbarie
  const pads = [];
  for (let k = 0; k < 7; k++) {
    const a = k * 2.1;
    pads.push(colored(new THREE.SphereGeometry(0.55, 7, 5).scale(1, 1.3, 0.3).rotateY(a).translate(Math.cos(a) * 0.4, 0.7 + (k % 3) * 0.8, Math.sin(a) * 0.4), '#5d8a4a'));
  }
  S.cactus = { hi: mergeGeometries(pads), lo: colored(new THREE.IcosahedronGeometry(1, 0).scale(1, 1.4, 1).translate(0, 1.2, 0), '#5d8a4a'), r: 0.6 };
  // Rocher
  S.rock = {
    hi: colored(jitter(new THREE.DodecahedronGeometry(1.6, 1).scale(1.4, 0.8, 1.1).translate(0, 0.4, 0), 0.35, 10), '#8a6a52'),
    lo: colored(new THREE.DodecahedronGeometry(1.6, 0).scale(1.4, 0.8, 1.1).translate(0, 0.4, 0), '#8a6a52'),
    r: 1.6,
  };
  return S;
}

export class Vegetation {
  constructor(scene, world, colliders, quality, fixed = {}) {
    this.scene = scene;
    this.world = world;
    this.tiles = new Map();
    this.species = speciesGeometries();
    this.types = Object.keys(this.species);
    this.fixed = new Map(); // tuile -> [[type, x, z, scale]]
    for (const [type, list] of Object.entries(fixed)) {
      for (const [x, z, s] of list) {
        const k = this.key(Math.floor((x + WORLD_HALF) / TILE), Math.floor((z + WORLD_HALF) / TILE));
        if (!this.fixed.has(k)) this.fixed.set(k, []);
        this.fixed.get(k).push([type, x, z, s || 1]);
      }
    }
    this.time = { value: 0 };
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, metalness: 0 });
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uTime = this.time;
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float uTime;')
        .replace('#include <begin_vertex>', `#include <begin_vertex>
          #ifdef USE_INSTANCING
          float ph = instanceMatrix[3].x * 0.13 + instanceMatrix[3].z * 0.07;
          float sw = max(0.0, position.y - 2.0) * 0.012;
          transformed.x += sin(uTime * 1.3 + ph) * sw;
          transformed.z += cos(uTime * 1.1 + ph) * sw * 0.7;
          #endif`);
    };
    const matDS = mat.clone();
    matDS.side = THREE.DoubleSide;
    matDS.onBeforeCompile = mat.onBeforeCompile;
    this.mats = { mat, matDS };
    this.meshes = {};
    this.setQuality(quality);
    colliders.providers = colliders.providers || [];
    colliders.providers.push((minx, minz, maxx, maxz, cb) => this.queryTrunks(minx, minz, maxx, maxz, cb));
    this.center = null;
    this.queue = [];
    this.dirty = true;
  }

  key(tx, tz) { return tx * 1000 + tz; }

  setQuality(q) {
    const cfg = { low: [220, 700, 0.45, 9000], medium: [380, 1300, 0.75, 22000], high: [550, 2100, 1, 36000], ultra: [800, 3000, 1.25, 52000] }[q] || [380, 1300, 0.75, 22000];
    [this.near, this.far, this.density, this.cap] = cfg;
    for (const t of Object.values(this.meshes)) { this.scene.remove(t.hi); this.scene.remove(t.lo); }
    this.meshes = {};
    for (const type of this.types) {
      const sp = this.species[type];
      const m = sp.doubleSided ? this.mats.matDS : this.mats.mat;
      const capHi = Math.floor(this.cap * (type === 'pine' || type === 'cedar' ? 0.5 : 0.25));
      const capLo = Math.floor(this.cap * (type === 'pine' || type === 'cedar' ? 1.2 : 0.5));
      const hi = new THREE.InstancedMesh(sp.hi, m, capHi);
      const lo = new THREE.InstancedMesh(sp.lo, m, capLo);
      hi.count = 0; lo.count = 0;
      hi.castShadow = q !== 'low'; lo.castShadow = false;
      hi.receiveShadow = true;
      hi.frustumCulled = false; lo.frustumCulled = false;
      this.scene.add(hi, lo);
      this.meshes[type] = { hi, lo, capHi, capLo };
    }
    this.tiles.clear();
    this.dirty = true;
  }

  // Génération déterministe d'une tuile
  genTile(tx, tz) {
    const w = this.world;
    const x0 = -WORLD_HALF + tx * TILE, z0 = -WORLD_HALF + tz * TILE;
    const items = [];
    const n = TILE / CELL;
    const dens = this.density;
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const gx = tx * n + i, gz = tz * n + j;
      const r0 = hash2(gx, gz, 1);
      const x = x0 + (i + hash2(gx, gz, 2)) * CELL, z = z0 + (j + hash2(gx, gz, 3)) * CELL;
      // probabilité grossière avant les calculs coûteux
      const M = w.mountainMask(z);
      const desert = smoothstep(7000, 9200, z);
      const base = desert > 0.5 ? 0.06 : M > 0.15 ? 0.04 + 0.6 * M : z > 2600 ? 0.04 : 0.4;
      if (r0 > base * dens * 1.4) continue;
      const preH = w.preRoad(x, z);
      if (preH < 1.2) continue;
      // zones aménagées
      let flat = 0;
      for (const r of w.regions) { if (r.id === 'chott' || r.id === 'megaramp') continue; flat = Math.max(flat, w.regionWeight(r, x, z)); }
      if (flat > 0.15) continue;
      const nearRoad = w.queryRoad(x, z);
      if (nearRoad && w.rd < w.rhw + 4) continue;
      const h = w.height(x, z);
      const hx = w.height(x + 2, z), hz = w.height(x, z + 2);
      const slope = Math.hypot(hx - h, hz - h) / 2;
      if (slope > 0.75) continue;
      const r1 = hash2(gx, gz, 4);
      const scale = 0.75 + hash2(gx, gz, 5) * 0.6;
      let type = null;
      const d = z - coastZ(x);
      if (desert > 0.5) {
        const ce = ((x - CHOTT.x) / CHOTT.rx) ** 2 + ((z - CHOTT.z) / CHOTT.rz) ** 2;
        if (ce < 1.2) continue;
        if (x > 5000) { if (r0 < 0.025 * dens) type = 'rock'; }
        else if (x > -1500 && r0 < 0.008 * dens) type = r1 < 0.7 ? 'rock' : 'bush';
        else if (r0 < 0.004 * dens) type = 'rock';
        const od = Math.hypot(x - OASIS.x, z - OASIS.z);
        if (od < 1100 && r0 < 0.05 * dens) type = 'palm';
      } else if (M > 0.15) {
        const f = w.forestMask(x, z, h);
        if (r0 < (0.04 + f * 0.6) * dens) type = f > 0.3 ? (r1 < (h > 700 ? 0.65 : 0.25) ? 'cedar' : 'pine') : (r1 < 0.5 ? 'bush' : r1 < 0.8 ? 'pine' : 'rock');
      } else if (z > 2600) {
        // steppe
        if (r0 < 0.03 * dens) type = r1 < 0.7 ? 'bush' : r1 < 0.85 ? 'cactus' : 'rock';
      } else {
        // côte / Mitidja
        if (d < 400) { if (r0 < 0.02 * dens) type = r1 < 0.35 ? 'palm' : r1 < 0.65 ? 'cactus' : 'bush'; }
        else {
          const grove = w.n4.noise(x * 0.0012 + 3, z * 0.0012);
          if (grove > 0.45 && r0 < 0.35 * dens) type = grove > 0.6 ? 'orange' : 'olive';
          else if (r0 < 0.02 * dens) type = r1 < 0.4 ? 'olive' : r1 < 0.7 ? 'bush' : 'eucalyptus';
          if (nearRoad && w.rd > w.rhw + 4 && w.rd < w.rhw + 9 && w.rtype === 1 && r0 < 0.3) type = 'eucalyptus';
        }
      }
      if (!type) continue;
      items.push(type, x, h - 0.15, z, scale, hash2(gx, gz, 6) * Math.PI * 2);
    }
    const fx = this.fixed.get(this.key(tx, tz));
    if (fx) for (const [type, x, z, s] of fx) items.push(type, x, w.height(x, z) - 0.1, z, s * (0.85 + hash2(x | 0, z | 0, 7) * 0.3), hash2(x | 0, z | 0, 8) * 6.28);
    // troncs pour les collisions
    const trunks = [];
    for (let k = 0; k < items.length; k += 6) {
      const sp = this.species[items[k]];
      if (sp.r > 0) trunks.push({ x: items[k + 1], z: items[k + 3], r: sp.r * items[k + 4], y0: items[k + 2] - 1, y1: items[k + 2] + 8, surf: 6 });
    }
    return { tx, tz, items, trunks, cx: x0 + TILE / 2, cz: z0 + TILE / 2 };
  }

  queryTrunks(minx, minz, maxx, maxz, cb) {
    const tx0 = Math.floor((minx + WORLD_HALF) / TILE), tx1 = Math.floor((maxx + WORLD_HALF) / TILE);
    const tz0 = Math.floor((minz + WORLD_HALF) / TILE), tz1 = Math.floor((maxz + WORLD_HALF) / TILE);
    for (let tz = tz0; tz <= tz1; tz++) for (let tx = tx0; tx <= tx1; tx++) {
      let t = this.tiles.get(this.key(tx, tz));
      if (!t) { t = this.genTile(tx, tz); this.tiles.set(this.key(tx, tz), t); this.dirty = true; }
      for (const c of t.trunks) if (c.x + c.r > minx && c.x - c.r < maxx && c.z + c.r > minz && c.z - c.r < maxz) cb(c);
    }
  }

  update(cam, dt, budgetMs = 4) {
    this.time.value += dt;
    const ctx = Math.floor((cam.x + WORLD_HALF) / TILE), ctz = Math.floor((cam.z + WORLD_HALF) / TILE);
    const R = Math.ceil(this.far / TILE);
    const t0 = performance.now();
    // génère les tuiles manquantes, les plus proches d'abord
    if (!this.center || this.center[0] !== ctx || this.center[1] !== ctz) {
      this.center = [ctx, ctz];
      this.queue = [];
      for (let dz = -R; dz <= R; dz++) for (let dx = -R; dx <= R; dx++) {
        const d = Math.hypot(dx, dz) * TILE;
        if (d > this.far + TILE) continue;
        const k = this.key(ctx + dx, ctz + dz);
        if (!this.tiles.has(k)) this.queue.push([d, ctx + dx, ctz + dz]);
      }
      this.queue.sort((a, b) => b[0] - a[0]);
      this.dirty = true;
    }
    while (this.queue.length && performance.now() - t0 < budgetMs) {
      const [, tx, tz] = this.queue.pop();
      const k = this.key(tx, tz);
      if (!this.tiles.has(k)) { this.tiles.set(k, this.genTile(tx, tz)); this.dirty = true; }
    }
    if (!this.dirty) return;
    this.dirty = false;
    // reconstruit les instances
    const counts = {};
    for (const t of this.types) counts[t] = { hi: 0, lo: 0 };
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
    const near2 = this.near * this.near, far2 = this.far * this.far;
    for (const [k, t] of this.tiles) {
      const d2 = (t.cx - cam.x) ** 2 + (t.cz - cam.z) ** 2;
      if (d2 > (this.far + TILE) ** 2) {
        if (d2 > (this.far + TILE * 6) ** 2) this.tiles.delete(k);
        continue;
      }
      const it = t.items;
      for (let i = 0; i < it.length; i += 6) {
        const type = it[i];
        const dd = (it[i + 1] - cam.x) ** 2 + (it[i + 3] - cam.z) ** 2;
        if (dd > far2) continue;
        const lvl = dd < near2 ? 'hi' : 'lo';
        const mm = this.meshes[type];
        const c = counts[type];
        if (lvl === 'hi' && c.hi >= mm.capHi) continue;
        if (lvl === 'lo' && c.lo >= mm.capLo) continue;
        q.setFromAxisAngle(up, it[i + 5]);
        p.set(it[i + 1], it[i + 2], it[i + 3]);
        const sc = it[i + 4];
        s.set(sc, sc, sc);
        m4.compose(p, q, s);
        mm[lvl].setMatrixAt(c[lvl]++, m4);
      }
    }
    for (const t of this.types) {
      const mm = this.meshes[t];
      mm.hi.count = counts[t].hi; mm.lo.count = counts[t].lo;
      mm.hi.instanceMatrix.needsUpdate = true; mm.lo.instanceMatrix.needsUpdate = true;
    }
    this.lastRebuild = { x: cam.x, z: cam.z };
  }

  // reconstruction périodique des LOD quand la caméra se déplace
  tick(cam) {
    if (!this.lastRebuild || Math.hypot(cam.x - this.lastRebuild.x, cam.z - this.lastRebuild.z) > 40) this.dirty = true;
  }
}
