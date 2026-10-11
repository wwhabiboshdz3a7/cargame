// Alger : rues, trottoirs, immeubles (Casbah, haussmannien, HLM, tours), parcs, mobilier urbain.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { CITY } from './layout.js';
import { mulberry32 } from './noise.js';
import { cityStreetTexture, intersectionTexture, facadeTextures, roofTexture, concreteTexture } from './textures.js';

const Y = CITY.y;
const SIDEWALK_H = 0.16;

// Accumulateur de géométrie brute (boîtes) par matériau
class BoxBatch {
  constructor() { this.pos = []; this.nor = []; this.uv = []; this.idx = []; this.n = 0; }
  // boîte alignée, faces latérales seulement (+ dessus optionnel), uv en mètres / tile
  box(x0, y0, z0, x1, y1, z1, tile = 12, top = false, sides = true, uOff = 0) {
    const faces = [];
    if (sides) {
      faces.push([[x0, z1], [x1, z1], [0, 0, 1]]); // sud
      faces.push([[x1, z0], [x0, z0], [0, 0, -1]]); // nord
      faces.push([[x1, z1], [x1, z0], [1, 0, 0]]); // est
      faces.push([[x0, z0], [x0, z1], [-1, 0, 0]]); // ouest
    }
    for (const [[ax, az], [bx, bz], n] of faces) {
      const w = Math.hypot(bx - ax, bz - az);
      const b = this.n;
      this.pos.push(ax, y0, az, bx, y0, bz, bx, y1, bz, ax, y1, az);
      for (let k = 0; k < 4; k++) this.nor.push(...n);
      const u0 = uOff, u1 = uOff + w / tile;
      this.uv.push(u0, y0 / tile * 0 + 0, u1, 0, u1, (y1 - y0) / tile, u0, (y1 - y0) / tile);
      this.idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
      this.n += 4;
    }
    if (top) this.top(x0, z0, x1, z1, y1, tile);
  }

  top(x0, z0, x1, z1, y, tile = 12) {
    const b = this.n;
    this.pos.push(x0, y, z1, x1, y, z1, x1, y, z0, x0, y, z0);
    for (let k = 0; k < 4; k++) this.nor.push(0, 1, 0);
    this.uv.push(x0 / tile, z1 / tile, x1 / tile, z1 / tile, x1 / tile, z0 / tile, x0 / tile, z0 / tile);
    this.idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
    this.n += 4;
  }

  geometry() {
    if (!this.n) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setIndex(this.idx);
    g.computeBoundingSphere();
    return g;
  }
}

export function districtOf(i, j) {
  if (i >= 31 && i <= 34 && j >= 1 && j <= 3) return 'mosque';
  if (j === 0) return 'front';
  if (i >= 26 && i <= 27 && j >= 2 && j <= 4) return 'park';
  if (i >= 23 && i <= 24 && j >= 12 && j <= 13) return 'stadium';
  if (i === 8 && j === 1) return 'plaza';
  if (i === 17 && j === 2) return 'poste';
  if (i <= 7 && j >= 1 && j <= 6) return 'casbah';
  if (i >= 27 && j >= 7) return 'towers';
  if (j >= 11) return 'hlm';
  if (i >= 8 && i <= 24 && j <= 9) return 'centre';
  return (i * 7 + j * 13) % 3 === 0 ? 'hlm' : 'centre';
}

export function buildCity(scene, world, colliders, quality) {
  const group = new THREE.Group();
  group.name = 'city';
  scene.add(group);
  const rand = mulberry32(2024);
  const P = CITY.pitch, SW = CITY.street;

  // ---------------- chaussées
  const streetGeo = [], interGeo = [];
  const quad = (cx, cz, w, l, alongX, tileLen, arr) => {
    const g = new THREE.PlaneGeometry(alongX ? l : w, alongX ? w : l);
    g.rotateX(-Math.PI / 2);
    const uv = g.attributes.uv;
    for (let k = 0; k < uv.count; k++) {
      const u = uv.getX(k), v = uv.getY(k);
      if (alongX) uv.setXY(k, v, u * (l / tileLen)); else uv.setXY(k, u, v * (l / tileLen));
    }
    g.translate(cx, Y + 0.03, cz);
    arr.push(g);
  };
  for (let j = 0; j <= CITY.nz; j++) for (let i = 0; i <= CITY.nx; i++) {
    const x = CITY.x0 + i * P, z = CITY.z0 + j * P;
    quad(x, z, SW, SW, true, SW, interGeo);
    if (i < CITY.nx) quad(x + P / 2, z, SW, P - SW, true, 20, streetGeo);
    if (j < CITY.nz) quad(x, z + P / 2, SW, P - SW, false, 20, streetGeo);
  }
  const roadMat = new THREE.MeshStandardMaterial({ map: cityStreetTexture(), roughness: 0.85, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 });
  const interMat = new THREE.MeshStandardMaterial({ map: intersectionTexture(), roughness: 0.85, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 });
  const sm = new THREE.Mesh(mergeGeometries(streetGeo), roadMat); sm.receiveShadow = true; group.add(sm);
  const im = new THREE.Mesh(mergeGeometries(interGeo), interMat); im.receiveShadow = true; group.add(im);

  // ---------------- îlots
  const sectors = new Map();
  const sectorOf = (x, z) => {
    const k = Math.floor((x - CITY.x0) / 720) + '_' + Math.floor((z - CITY.z0) / 720);
    if (!sectors.has(k)) sectors.set(k, {});
    return sectors.get(k);
  };
  const batch = (x, z, style) => {
    const s = sectorOf(x, z);
    if (!s[style]) s[style] = new BoxBatch();
    return s[style];
  };
  const sidewalk = new BoxBatch();
  const grass = new BoxBatch();
  const parked = [];
  const lamps = [];
  const palms = [];
  const trees = [];
  const landmarks = [];
  const addBuilding = (x0, z0, x1, z1, h, style, ground = null) => {
    const y0 = Y + SIDEWALK_H;
    if (ground) {
      batch(x0, z0, ground).box(x0, y0, z0, x1, y0 + 4.5, z1, 12);
      batch(x0, z0, style).box(x0, y0 + 4.5, z0, x1, y0 + h, z1, 12, false, true, 0);
    } else batch(x0, z0, style).box(x0, y0, z0, x1, y0 + h, z1, 12);
    const roofStyle = style === 'casbah' ? 'roofWhite' : 'roof';
    batch(x0, z0, roofStyle).top(x0, z0, x1, z1, y0 + h, 16);
    colliders.addBox({ c: [(x0 + x1) / 2, y0 + h / 2, (z0 + z1) / 2], h: [(x1 - x0) / 2, h / 2, (z1 - z0) / 2], surf: 5, kind: 'building' });
  };

  for (let j = 0; j < CITY.nz; j++) for (let i = 0; i < CITY.nx; i++) {
    const bx0 = CITY.x0 + i * P + SW / 2, bz0 = CITY.z0 + j * P + SW / 2;
    const bx1 = bx0 + P - SW, bz1 = bz0 + P - SW;
    const d = districtOf(i, j);
    // trottoir (dalle surélevée)
    if (d !== 'park') sidewalk.box(bx0, Y, bz0, bx1, Y + SIDEWALK_H, bz1, 3, true);
    else grass.box(bx0, Y, bz0, bx1, Y + SIDEWALK_H, bz1, 3, true);
    colliders.addBox({ c: [(bx0 + bx1) / 2, Y + SIDEWALK_H / 2 - 0.5, (bz0 + bz1) / 2], h: [(bx1 - bx0) / 2, SIDEWALK_H / 2 + 0.5, (bz1 - bz0) / 2], surf: 5, kind: 'sidewalk' });
    const ix0 = bx0 + 4, iz0 = bz0 + 4, ix1 = bx1 - 4, iz1 = bz1 - 4;
    // lampadaires aux coins
    for (const [lx, lz] of [[bx0 + 1.5, bz0 + 1.5], [bx1 - 1.5, bz1 - 1.5]]) lamps.push([lx, lz]);
    // voitures garées le long du trottoir sud/nord
    if (d !== 'mosque' && d !== 'park' && rand() < 0.55) {
      for (let x = bx0 + 6; x < bx1 - 6; x += 5.6) if (rand() < 0.5) parked.push([x, bz1 + 1.6, Math.PI / 2 * (rand() < 0.5 ? 1 : -1)]);
    }
    if (d !== 'mosque' && d !== 'park' && rand() < 0.4) {
      for (let z = bz0 + 6; z < bz1 - 6; z += 5.6) if (rand() < 0.5) parked.push([bx0 - 1.6, z, rand() < 0.5 ? 0 : Math.PI]);
    }
    if (d === 'casbah') {
      // petites maisons blanches serrées
      for (let x = ix0; x < ix1 - 4; x += 6 + rand() * 4) {
        for (let z = iz0; z < iz1 - 4; z += 6 + rand() * 4) {
          if (rand() < 0.08) continue;
          const w = 5 + rand() * 4, l = 5 + rand() * 4;
          addBuilding(x, z, Math.min(ix1, x + w), Math.min(iz1, z + l), 4 + Math.floor(rand() * 4) * 3, 'casbah');
        }
      }
    } else if (d === 'centre' || d === 'front') {
      const tall = d === 'front' ? 22 + rand() * 6 : 15 + Math.floor(rand() * 4) * 3;
      perimeter(ix0, iz0, ix1, iz1, 16, (a0, b0, a1, b1) => {
        addBuilding(a0, b0, a1, b1, tall + Math.floor(rand() * 3) * 3, d === 'front' || rand() < 0.75 ? 'haussmann' : 'hlm', 'shop');
      }, rand);
    } else if (d === 'hlm') {
      // barres d'immeubles
      const vertical = rand() < 0.5;
      const n = 2 + Math.floor(rand() * 2);
      for (let k = 0; k < n; k++) {
        const h = 15 + Math.floor(rand() * 4) * 3;
        if (vertical) {
          const x = ix0 + 6 + k * ((ix1 - ix0 - 12) / n);
          addBuilding(x, iz0 + 6, x + 13, iz1 - 6, h, 'hlm');
        } else {
          const z = iz0 + 6 + k * ((iz1 - iz0 - 12) / n);
          addBuilding(ix0 + 6, z, ix1 - 6, z + 13, h, 'hlm');
        }
      }
      for (let k = 0; k < 4; k++) trees.push([ix0 + rand() * (ix1 - ix0), iz0 + rand() * (iz1 - iz0)]);
    } else if (d === 'towers') {
      const n = 1 + Math.floor(rand() * 3);
      const used = [];
      for (let k = 0; k < n; k++) {
        const w = 22 + rand() * 14, l = 22 + rand() * 14;
        const x = ix0 + 4 + rand() * (ix1 - ix0 - w - 8), z = iz0 + 4 + rand() * (iz1 - iz0 - l - 8);
        if (used.some((u) => x < u[2] + 6 && x + w > u[0] - 6 && z < u[3] + 6 && z + l > u[1] - 6)) continue;
        used.push([x, z, x + w, z + l]);
        const h = 45 + rand() * 95;
        addBuilding(x, z, x + w, z + l, h, 'glass');
        // couronnement
        addBuilding(x + w * 0.2, z + l * 0.2, x + w * 0.8, z + l * 0.8, h + 4 + rand() * 6, 'glass');
      }
    } else if (d === 'park') {
      for (let k = 0; k < 22; k++) palms.push([ix0 + rand() * (ix1 - ix0), iz0 + rand() * (iz1 - iz0)]);
    } else if (d === 'plaza') {
      for (let k = 0; k < 10; k++) palms.push([ix0 + 6 + (k % 5) * ((ix1 - ix0 - 12) / 4), k < 5 ? iz0 + 8 : iz1 - 8]);
      landmarks.push({ type: 'fountain', x: (bx0 + bx1) / 2, z: (bz0 + bz1) / 2 });
    } else if (d === 'poste') {
      landmarks.push({ type: 'poste', x0: ix0 + 10, z0: iz0 + 14, x1: ix1 - 10, z1: iz1 - 14 });
      colliders.addBox({ c: [(ix0 + ix1) / 2, Y + 12, (iz0 + iz1) / 2], h: [(ix1 - ix0) / 2 - 10, 12, (iz1 - iz0) / 2 - 14], surf: 5 });
    } else if (d === 'stadium') {
      if (i === 23 && j === 12) landmarks.push({ type: 'stadium', x: bx1 + SW / 2, z: bz1 + SW / 2 });
    }
  }

  // ---------------- matériaux des immeubles
  const night = { value: 0 };
  const facadeMat = (style) => {
    const t = facadeTextures(style);
    const m = new THREE.MeshStandardMaterial({ map: t.map, emissiveMap: t.emissive, emissive: 0xffffff, emissiveIntensity: 0, roughness: style === 'glass' ? 0.15 : 0.85, metalness: style === 'glass' ? 0.6 : 0 });
    m.userData.nightEmissive = style === 'glass' ? 1.2 : 1.6;
    return m;
  };
  const mats = {
    haussmann: facadeMat('haussmann'), hlm: facadeMat('hlm'), glass: facadeMat('glass'), casbah: facadeMat('casbah'), shop: facadeMat('shop'),
    roof: new THREE.MeshStandardMaterial({ map: roofTexture('grey'), roughness: 0.95 }),
    roofWhite: new THREE.MeshStandardMaterial({ map: roofTexture('white'), roughness: 0.95 }),
  };
  const meshes = [];
  for (const s of sectors.values()) {
    for (const [style, b] of Object.entries(s)) {
      const g = b.geometry();
      if (!g) continue;
      const m = new THREE.Mesh(g, mats[style]);
      m.castShadow = quality !== 'low' && style !== 'roof' && style !== 'roofWhite';
      m.receiveShadow = true;
      m.matrixAutoUpdate = false;
      group.add(m);
      meshes.push(m);
    }
  }
  const swMat = new THREE.MeshStandardMaterial({ map: concreteTexture(17, [1, 0.97, 0.92], 16), roughness: 0.9 });
  const sw = new THREE.Mesh(sidewalk.geometry(), swMat); sw.receiveShadow = true; group.add(sw);
  const grassMat = new THREE.MeshStandardMaterial({ color: 0x4f7a32, roughness: 1 });
  const gm = grass.geometry();
  if (gm) group.add(new THREE.Mesh(gm, grassMat));

  // ---------------- promenade du front de mer
  const prom = new THREE.Mesh(new THREE.PlaneGeometry(CITY.x1 - CITY.x0 + 400, 100).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: (() => { const t = concreteTexture(23, [1, 0.95, 0.88], 8).clone(); t.repeat.set(160, 4); t.needsUpdate = true; return t; })(), roughness: 0.9, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 }));
  prom.position.set((CITY.x0 + CITY.x1) / 2, Y + 0.02, CITY.z0 - 10 - 50);
  prom.receiveShadow = true;
  group.add(prom);
  for (let x = CITY.x0; x <= CITY.x1; x += 28) palms.push([x, CITY.z0 - 16]);
  for (let x = CITY.x0 + 14; x <= CITY.x1; x += 56) lamps.push([x, CITY.z0 - 13]);

  // ---------------- voitures garées (instanciées)
  const pcGeo = mergeGeometries([
    new THREE.BoxGeometry(1.75, 0.7, 4.2).translate(0, 0.55, 0),
    new THREE.BoxGeometry(1.5, 0.55, 2.1).translate(0, 1.15, 0.2),
  ]);
  const pcMat = new THREE.MeshStandardMaterial({ roughness: 0.35, metalness: 0.5 });
  const pcs = new THREE.InstancedMesh(pcGeo, pcMat, parked.length);
  const colors = ['#f2f2f2', '#c9ccd1', '#111214', '#8a1020', '#1d4fa0', '#6b7076', '#f2c40f', '#2f3a33', '#d9c49a'];
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0);
  parked.forEach(([x, z, yaw], k) => {
    q.setFromAxisAngle(up, yaw);
    m4.compose(new THREE.Vector3(x, Y, z), q, new THREE.Vector3(1, 1, 1));
    pcs.setMatrixAt(k, m4);
    pcs.setColorAt(k, new THREE.Color(colors[k % colors.length]));
    colliders.addBox({ c: [x, Y + 0.75, z], h: [0.9, 0.75, 2.1], yaw, surf: 5, kind: 'parked' });
  });
  pcs.castShadow = quality !== 'low';
  group.add(pcs);

  // ---------------- lampadaires
  const lampGeo = mergeGeometries([
    new THREE.CylinderGeometry(0.08, 0.12, 7, 6).translate(0, 3.5, 0),
    new THREE.BoxGeometry(1.4, 0.08, 0.08).translate(0.7, 7, 0),
  ]);
  const lampHeadGeo = new THREE.BoxGeometry(0.6, 0.15, 0.3).translate(1.3, 6.95, 0);
  const lampMat = new THREE.MeshStandardMaterial({ color: 0x2b3036, metalness: 0.6, roughness: 0.5 });
  const lampHeadMat = new THREE.MeshStandardMaterial({ color: 0x222222, emissive: 0xffcf8a, emissiveIntensity: 0 });
  const lp = new THREE.InstancedMesh(lampGeo, lampMat, lamps.length);
  const lh = new THREE.InstancedMesh(lampHeadGeo, lampHeadMat, lamps.length);
  lamps.forEach(([x, z], k) => {
    q.setFromAxisAngle(up, (k % 4) * Math.PI / 2);
    m4.compose(new THREE.Vector3(x, Y + SIDEWALK_H, z), q, new THREE.Vector3(1, 1, 1));
    lp.setMatrixAt(k, m4); lh.setMatrixAt(k, m4);
    colliders.addCylinder(x, z, 0.15, Y, Y + 7, 5);
  });
  group.add(lp, lh);

  return {
    group, meshes, mats, palms, trees, landmarks, lampHeadMat, night,
    setNight(n) {
      for (const k of ['haussmann', 'hlm', 'glass', 'casbah', 'shop']) mats[k].emissiveIntensity = n * mats[k].userData.nightEmissive;
      lampHeadMat.emissiveIntensity = n * 3;
    },
  };
}

// Découpe le pourtour d'un îlot en immeubles mitoyens
function perimeter(x0, z0, x1, z1, depth, cb, rand) {
  const seg = (a0, a1, f) => {
    let a = a0;
    while (a < a1 - 6) {
      const w = Math.min(a1 - a, 14 + rand() * 12);
      f(a, a + w);
      a += w;
    }
  };
  seg(x0, x1, (a, b) => cb(a, z0, b, z0 + depth));
  seg(x0, x1, (a, b) => cb(a, z1 - depth, b, z1));
  seg(z0 + depth, z1 - depth, (a, b) => cb(x0, a, x0 + depth, b));
  seg(z0 + depth, z1 - depth, (a, b) => cb(x1 - depth, a, x1, b));
}
