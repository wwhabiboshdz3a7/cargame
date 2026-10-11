// Maillage des routes (rubans texturés), glissières, séparateur central, lampadaires, portiques.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { roadTexture, signTexture, concreteTexture } from './textures.js';
import { ROAD_TYPES } from './roadsData.js';

const TILE = { highway: 24, national: 24, mountain: 16, piste: 30 };
const PRIO = { highway: 4, national: 3, mountain: 2, piste: 1 };

export function buildRoads(scene, world, colliders, quality) {
  const group = new THREE.Group();
  group.name = 'roads';
  scene.add(group);
  const mats = {};
  for (const type of ['highway', 'national', 'mountain', 'piste']) {
    mats[type] = new THREE.MeshStandardMaterial({
      map: roadTexture(type), roughness: type === 'piste' ? 1 : 0.82, metalness: 0,
      polygonOffset: true, polygonOffsetFactor: -1 - PRIO[type], polygonOffsetUnits: -2 - PRIO[type] * 2,
      transparent: type === 'piste', depthWrite: type !== 'piste',
    });
  }
  // degré des noeuds et routes qui y passent
  const nodeRoads = new Map();
  world.roads.forEach((r, ri) => {
    for (const nd of r.nodes) {
      if (!nodeRoads.has(nd.name)) nodeRoads.set(nd.name, []);
      nodeRoads.get(nd.name).push({ r, ri, i: nd.i });
    }
  });
  const trimAt = (r, nodeName) => {
    let t = 0;
    for (const o of nodeRoads.get(nodeName) || []) {
      if (o.r === r) continue;
      if (o.r.type === 'city') { t = Math.max(t, 9); continue; }
      const passes = o.i > 0 && o.i < o.r.n - 1;
      if (passes || o.r.hw > r.hw) t = Math.max(t, o.r.hw - 0.8);
    }
    return t;
  };

  const pieces = [];
  const barrierGeos = [];
  const railGeos = [];
  const lampPos = [];
  const signs = [];
  const roadInfo = [];

  for (const r of world.roads) {
    if (r.type === 'city') continue;
    const n = r.n;
    const startNode = r.nodes.find((nd) => nd.i === 0);
    const endNode = r.nodes.find((nd) => nd.i === n - 1);
    const trimS = startNode ? trimAt(r, startNode.name) : 0;
    const trimE = endNode ? r.length - trimAt(r, endNode.name) : r.length;
    // tangentes
    const tx = new Float64Array(n), tz = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      const a = Math.max(0, i - 1), b = Math.min(n - 1, i + 1);
      const dx = r.xs[b] - r.xs[a], dz = r.zs[b] - r.zs[a];
      const L = Math.hypot(dx, dz) || 1;
      tx[i] = dx / L; tz[i] = dz / L;
    }
    roadInfo.push({ r, tx, tz });
    const hw = r.hw;
    const lift = 0.06;
    const PIECE = 64;
    for (let p0 = 0; p0 < n - 1; p0 += PIECE) {
      const p1 = Math.min(n - 1, p0 + PIECE);
      const pos = [], uv = [], idx = [];
      let vi = 0;
      for (let i = p0; i <= p1; i++) {
        let s = r.ss[i];
        let x = r.xs[i], z = r.zs[i], y = r.ys[i];
        if (s < trimS || s > trimE) {
          // déplace le point sur la limite du découpage
          const target = s < trimS ? trimS : trimE;
          if ((s < trimS && i + 1 < n && r.ss[i + 1] <= trimS) || (s > trimE && i > 0 && r.ss[i - 1] >= trimE)) {
            // complètement hors zone : point dégénéré
          }
          const j = s < trimS ? Math.min(n - 1, i + 1) : Math.max(0, i - 1);
          const u = Math.abs(target - s) / Math.max(1e-6, Math.abs(r.ss[j] - s));
          const k = Math.min(1, u);
          x += (r.xs[j] - x) * k; z += (r.zs[j] - z) * k; y += (r.ys[j] - y) * k; s = s + (r.ss[j] - s) * k;
        }
        const rx = -tz[i], rz = tx[i];
        const v = s / TILE[r.type];
        const sk = hw + 1.4;
        pos.push(x - rx * sk, y - 0.5, z - rz * sk, x - rx * hw, y + lift, z - rz * hw, x + rx * hw, y + lift, z + rz * hw, x + rx * sk, y - 0.5, z + rz * sk);
        uv.push(-0.03, v, 0, v, 1, v, 1.03, v);
        if (i > p0) {
          const a = vi - 4, b = vi;
          for (let c = 0; c < 3; c++) idx.push(a + c, a + c + 1, b + c, a + c + 1, b + c + 1, b + c);
        }
        vi += 4;
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      const nrm = new Float32Array(pos.length);
      for (let k = 1; k < nrm.length; k += 3) nrm[k] = 1;
      geo.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
      geo.setIndex(idx);
      geo.computeBoundingSphere();
      const mesh = new THREE.Mesh(geo, mats[r.type]);
      mesh.receiveShadow = true;
      mesh.matrixAutoUpdate = false;
      mesh.userData.center = geo.boundingSphere.center.clone();
      mesh.userData.type = r.type;
      group.add(mesh);
      pieces.push(mesh);
    }

    // --- séparateur central (autoroute) avec ouvertures aux échangeurs
    if (r.type === 'highway') {
      const gaps = r.nodes.filter((nd) => (nodeRoads.get(nd.name) || []).length > 1).map((nd) => r.ss[nd.i]);
      const inGap = (s) => gaps.some((g) => Math.abs(g - s) < 40);
      const prof = [[-0.32, 0], [-0.12, 0.25], [-0.09, 0.82], [0.09, 0.82], [0.12, 0.25], [0.32, 0]];
      let run = [];
      const flush = () => {
        if (run.length >= 2) barrierGeos.push(sweep(run, prof));
        run = [];
      };
      for (let i = 0; i < n; i++) {
        if (inGap(r.ss[i]) || r.ss[i] < 30 || r.ss[i] > r.length - 30) { flush(); continue; }
        run.push({ x: r.xs[i], y: r.ys[i] + lift, z: r.zs[i], tx: tx[i], tz: tz[i] });
        if (i > 0 && !inGap(r.ss[i - 1]) && i % 2 === 0) {
          const j = i - 2 >= 0 ? i - 2 : 0;
          addSegmentBox(colliders, r.xs[j], r.zs[j], r.ys[j], r.xs[i], r.zs[i], r.ys[i], 0.3, 0.9, 0, 5);
        }
        if (i % 7 === 0) lampPos.push({ x: r.xs[i], y: r.ys[i], z: r.zs[i], yaw: Math.atan2(tx[i], tz[i]), double: true });
      }
      flush();
      // portiques de signalisation
      for (let s = 1500; s < r.length - 500; s += 3200) signs.push({ r, s, tx, tz });
    }

    // --- glissières de sécurité sur les côtés en contrebas (routes de montagne / nationales)
    if (r.type === 'mountain' || r.type === 'national') {
      for (const side of [-1, 1]) {
        let run = [];
        const flush = () => {
          if (run.length >= 3) {
            railGeos.push(sweep(run.map((p) => ({ ...p, x: p.x, z: p.z })), [[-0.05, 0.45], [0.05, 0.45], [0.05, 0.78], [-0.05, 0.78]]));
            for (let k = 1; k < run.length; k++) {
              const a = run[k - 1], b = run[k];
              addSegmentBox(colliders, a.x, a.z, a.y, b.x, b.z, b.y, 0.15, 0.9, 0, 5);
            }
          }
          run = [];
        };
        for (let i = 0; i < n; i++) {
          if (r.ss[i] < trimS + 15 || r.ss[i] > trimE - 15) { flush(); continue; }
          const rx = -tz[i] * side, rz = tx[i] * side;
          const ox = r.xs[i] + rx * (hw + 0.6), oz = r.zs[i] + rz * (hw + 0.6);
          const drop = r.ys[i] - world.height(r.xs[i] + rx * (hw + 12), r.zs[i] + rz * (hw + 12));
          if (drop > 4.5) run.push({ x: ox, y: r.ys[i] + lift, z: oz, tx: tx[i], tz: tz[i] });
          else flush();
        }
        flush();
      }
    }
  }

  const barrierMat = new THREE.MeshStandardMaterial({ map: concreteTexture(9, [1, 1, 0.97], 0), roughness: 0.9 });
  if (barrierGeos.length) {
    const g = mergeGeometries(barrierGeos);
    const m = new THREE.Mesh(g, barrierMat);
    m.castShadow = quality !== 'low'; m.receiveShadow = true;
    group.add(m);
  }
  const railMat = new THREE.MeshStandardMaterial({ color: 0xb8bcc0, metalness: 0.85, roughness: 0.35 });
  if (railGeos.length) {
    const g = mergeGeometries(railGeos);
    const m = new THREE.Mesh(g, railMat);
    m.castShadow = false; m.receiveShadow = true;
    group.add(m);
  }

  // --- lampadaires (instanciés)
  const lamps = buildLamps(lampPos);
  group.add(lamps.group);

  // --- portiques
  for (const sg of signs) group.add(buildGantry(world, sg, colliders));

  return {
    group, pieces, lamps, roadInfo,
    update(camPos, viewDist) {
      const d2 = viewDist * viewDist;
      for (const m of pieces) m.visible = m.userData.center.distanceToSquared(camPos) < d2;
    },
  };
}

// Ajoute une boîte de collision entre deux points d'un tracé
export function addSegmentBox(colliders, ax, az, ay, bx, bz, by, halfW, height, offsetY = 0, surf = 5) {
  const dx = bx - ax, dz = bz - az;
  const len = Math.hypot(dx, dz);
  if (len < 0.1) return;
  const pitch = -Math.atan2(by - ay, len);
  colliders.addBox({
    c: [(ax + bx) / 2, (ay + by) / 2 + height / 2 + offsetY, (az + bz) / 2],
    h: [halfW, height / 2, len / 2 + 0.3],
    yaw: Math.atan2(dx, dz), pitch, surf,
  });
}

// Balayage d'un profil 2D (x latéral, y hauteur) le long d'un tracé
export function sweep(path, prof) {
  const pos = [], idx = [];
  const P = prof.length;
  path.forEach((p, i) => {
    const rx = -p.tz, rz = p.tx;
    for (const [px, py] of prof) pos.push(p.x + rx * px, p.y + py, p.z + rz * px);
    if (i > 0) {
      const a = (i - 1) * P, b = i * P;
      for (let k = 0; k < P - 1; k++) idx.push(a + k, a + k + 1, b + k, a + k + 1, b + k + 1, b + k);
    }
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  const uv = [];
  path.forEach((p, i) => prof.forEach((_, k) => uv.push(k / (P - 1), i * 0.5)));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

function buildLamps(list) {
  const group = new THREE.Group();
  if (!list.length) return { group, heads: null, list };
  const poleGeo = mergeGeometries([
    new THREE.CylinderGeometry(0.09, 0.14, 11, 6).translate(0, 5.5, 0),
    new THREE.BoxGeometry(5.4, 0.12, 0.12).translate(0, 10.9, 0),
  ]);
  const headGeo = mergeGeometries([
    new THREE.BoxGeometry(0.9, 0.18, 0.4).translate(2.6, 10.8, 0),
    new THREE.BoxGeometry(0.9, 0.18, 0.4).translate(-2.6, 10.8, 0),
  ]);
  const poleMat = new THREE.MeshStandardMaterial({ color: 0x8a8f94, metalness: 0.7, roughness: 0.45 });
  const headMat = new THREE.MeshStandardMaterial({ color: 0x333333, emissive: 0xffd9a0, emissiveIntensity: 0 });
  const poles = new THREE.InstancedMesh(poleGeo, poleMat, list.length);
  const heads = new THREE.InstancedMesh(headGeo, headMat, list.length);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(1, 1, 1), p = new THREE.Vector3();
  list.forEach((l, i) => {
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), l.yaw + Math.PI / 2);
    p.set(l.x, l.y, l.z);
    m.compose(p, q, s);
    poles.setMatrixAt(i, m); heads.setMatrixAt(i, m);
  });
  poles.castShadow = false;
  group.add(poles, heads);
  return { group, heads, headMat, list };
}

function buildGantry(world, sg, colliders) {
  const { r, s, tx, tz } = sg;
  let i = 0;
  while (i < r.n - 1 && r.ss[i] < s) i++;
  const x = r.xs[i], z = r.zs[i], y = r.ys[i];
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: 0x9aa0a6, metalness: 0.8, roughness: 0.4 });
  const yaw = Math.atan2(tx[i], tz[i]);
  const span = r.hw * 2 + 3;
  const post = new THREE.CylinderGeometry(0.3, 0.3, 8.5, 8);
  for (const sd of [-1, 1]) {
    const p = new THREE.Mesh(post, mat);
    p.position.set(sd * span / 2, 4.25, 0);
    g.add(p);
  }
  const beam = new THREE.Mesh(new THREE.BoxGeometry(span, 0.5, 0.5), mat);
  beam.position.set(0, 8.2, 0);
  g.add(beam);
  // panneaux pour chaque sens
  const westbound = tx[i] < 0;
  const dirA = [{ fr: 'Alger', ar: 'الجزائر', arrow: 0 }, { fr: 'Oran', ar: 'وهران', arrow: 0 }, { fr: 'Aéroport', ar: 'المطار', arrow: Math.PI / 4 }];
  const dirB = [{ fr: 'Constantine', ar: 'قسنطينة', arrow: 0 }, { fr: 'Bouira', ar: 'البويرة', arrow: 0 }, { fr: 'Blida', ar: 'البليدة', arrow: -Math.PI / 4 }];
  const mk = (lines, side) => {
    const tex = signTexture(lines);
    const pm = new THREE.Mesh(new THREE.PlaneGeometry(9, 3.4), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.6, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.05 }));
    pm.position.set(side * (r.hw / 2 + 0.7), 9.9, side > 0 ? -0.3 : 0.3);
    if (side < 0) pm.rotation.y = Math.PI;
    g.add(pm);
    const back = new THREE.Mesh(new THREE.BoxGeometry(9.2, 3.6, 0.15), mat);
    back.position.copy(pm.position); back.position.z += side > 0 ? 0.1 : -0.1;
    g.add(back);
  };
  mk(westbound ? dirA : dirB, -1);
  mk(westbound ? dirB : dirA, 1);
  g.position.set(x, y, z);
  // z local = sens de la route, x local = travers
  g.rotation.y = yaw;
  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; } });
  // colliders des poteaux
  for (const sd of [-1, 1]) {
    const rx = -tz[i], rz = tx[i];
    colliders.addCylinder(x + rx * sd * span / 2, z + rz * sd * span / 2, 0.35, y, y + 8.5, 5);
  }
  return g;
}

export { ROAD_TYPES };
