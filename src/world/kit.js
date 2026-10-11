// Outils de construction : boîtes orientées (visuel + collision), rampes, loopings, murs inclinés.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

const UP = new THREE.Vector3(0, 1, 0);

export function boxUV(g, sx, sy, sz, tile) {
  const uv = g.attributes.uv;
  const dims = [[sz, sy], [sz, sy], [sx, sz], [sx, sz], [sx, sy], [sx, sy]];
  for (let f = 0; f < 6; f++) for (let k = 0; k < 4; k++) {
    const i = f * 4 + k;
    uv.setXY(i, uv.getX(i) * dims[f][0] / tile, uv.getY(i) * dims[f][1] / tile);
  }
  return g;
}

export class Kit {
  constructor(colliders) {
    this.col = colliders;
    this.geos = new Map();
  }

  add(matKey, geo) {
    if (!this.geos.has(matKey)) this.geos.set(matKey, []);
    const g = geo.index ? geo.toNonIndexed() : geo;
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    if (!g.attributes.normal) g.computeVertexNormals();
    for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
    this.geos.get(matKey).push(g);
  }

  // Boîte orientée par une base (ax, ay, az : Vector3 unitaires), centre c, demi-tailles h
  obb(matKey, c, h, ax, ay, az, { collide = true, surf = 5, tile = 4, visual = true, kind = 'static', data = null } = {}) {
    if (visual && matKey) {
      const g = boxUV(new THREE.BoxGeometry(h.x * 2, h.y * 2, h.z * 2), h.x * 2, h.y * 2, h.z * 2, tile);
      g.applyMatrix4(new THREE.Matrix4().makeBasis(ax, ay, az).setPosition(c));
      this.add(matKey, g);
    }
    if (collide) this.col.addBox({ c: [c.x, c.y, c.z], h: [h.x, h.y, h.z], axes: [ax.toArray(), ay.toArray(), az.toArray()], surf, kind, data });
  }

  // Boîte posée (base au sol à y), tournée de yaw
  box(matKey, x, y, z, sx, sy, sz, yaw = 0, opts = {}) {
    const ax = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
    const az = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw));
    this.obb(matKey, new THREE.Vector3(x, y + sy / 2, z), new THREE.Vector3(sx / 2, sy / 2, sz / 2), ax, UP.clone(), az, opts);
  }

  // Géométrie quelconque positionnée
  mesh(matKey, geo, x = 0, y = 0, z = 0, ry = 0, rx = 0, rz = 0, s = 1) {
    const g = geo.clone();
    g.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz, 'YXZ')), new THREE.Vector3(s, s, s)));
    this.add(matKey, g);
  }

  // Rampe : profil [[s, h], ...] le long de la direction yaw depuis (x, y0, z)
  ramp(x, y0, z, yaw, width, profile, { mat = 'concrete', lipMat = 'chevron', thick = null, surf = 5 } = {}) {
    const d = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw));
    const l = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
    const o = new THREE.Vector3(x, y0, z);
    for (let i = 0; i < profile.length - 1; i++) {
      const [s0, h0] = profile[i], [s1, h1] = profile[i + 1];
      const p0 = o.clone().addScaledVector(d, s0).addScaledVector(UP, h0);
      const p1 = o.clone().addScaledVector(d, s1).addScaledVector(UP, h1);
      const t = p1.clone().sub(p0);
      const len = t.length();
      t.normalize();
      const n = new THREE.Vector3().crossVectors(t, l).normalize();
      const T = thick ?? Math.max(0.6, (h0 + h1) / 2 + 0.6);
      const c = p0.clone().add(p1).multiplyScalar(0.5).addScaledVector(n, -T / 2);
      const last = i === profile.length - 2 && lipMat;
      this.obb(last ? lipMat : mat, c, new THREE.Vector3(width / 2, T / 2, len / 2 + 0.03), l, n, t, { surf, kind: 'ramp' });
    }
  }

  // Looping hélicoïdal : entrée en (x, y0, z), direction yaw ; décalage latéral `offset` sur un tour
  loop(x, y0, z, yaw, R, width, N, offset, mat = 'concrete') {
    const d = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw));
    const l = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
    const o = new THREE.Vector3(x, y0, z);
    const P = (th) => o.clone().addScaledVector(d, R * Math.sin(th)).addScaledVector(UP, R * (1 - Math.cos(th))).addScaledVector(l, (offset * th) / (Math.PI * 2));
    const thick = 1.6;
    for (let i = 0; i < N; i++) {
      const a = (i / N) * Math.PI * 2, b = ((i + 1) / N) * Math.PI * 2, m = (a + b) / 2;
      const pa = P(a), pb = P(b);
      const t = pb.clone().sub(pa);
      const len = t.length();
      t.normalize();
      let n = d.clone().multiplyScalar(-Math.sin(m)).addScaledVector(UP, Math.cos(m));
      // orthogonalisation
      n.addScaledVector(t, -n.dot(t)).normalize();
      const ax = new THREE.Vector3().crossVectors(n, t).normalize();
      const mid = pa.clone().add(pb).multiplyScalar(0.5);
      const c = mid.clone().addScaledVector(n, -thick / 2);
      // guide latéral : la voiture est ramenée vers l'axe de l'hélice
      const guide = { x: mid.x, y: mid.y, z: mid.z, l: [l.x, l.y, l.z] };
      this.obb(i % 4 === 0 ? 'chevron' : mat, c, new THREE.Vector3(width / 2, thick / 2, len / 2 + 0.06), ax, n, t, { tile: 4, kind: 'ramp', data: { guide } });
    }
  }

  // Anneau incliné (mur de rotation / wall ride)
  bankRing(cx, y0, cz, R, bank, w, N, mat = 'concrete') {
    for (let i = 0; i < N; i++) {
      const a = (i / N) * Math.PI * 2, b = ((i + 1) / N) * Math.PI * 2, m = (a + b) / 2;
      const r = new THREE.Vector3(Math.cos(m), 0, Math.sin(m));
      const t = new THREE.Vector3(-Math.sin(m), 0, Math.cos(m));
      const n = r.clone().multiplyScalar(-Math.sin(bank)).addScaledVector(UP, Math.cos(bank)).normalize();
      const ax = new THREE.Vector3().crossVectors(n, t).normalize();
      const segLen = 2 * Math.sin((b - a) / 2) * (R + Math.cos(bank) * w);
      const thick = 0.8;
      const c = new THREE.Vector3(cx, y0, cz).addScaledVector(r, R + Math.cos(bank) * w / 2).addScaledVector(UP, Math.sin(bank) * w / 2).addScaledVector(n, -thick / 2);
      this.obb(i % 3 === 0 ? 'chevron' : mat, c, new THREE.Vector3(w / 2, thick / 2, segLen / 2 + 0.1), ax, n, t, { tile: 4, kind: 'ramp' });
    }
  }

  build(group, mats, { castShadow = true, receiveShadow = true } = {}) {
    const meshes = [];
    for (const [k, list] of this.geos) {
      if (!list.length || !mats[k]) continue;
      const g = mergeGeometries(list);
      if (!g) continue;
      g.computeBoundingSphere();
      const m = new THREE.Mesh(g, mats[k]);
      m.castShadow = castShadow && !mats[k].transparent;
      m.receiveShadow = receiveShadow;
      group.add(m);
      meshes.push(m);
    }
    this.geos.clear();
    return meshes;
  }
}
