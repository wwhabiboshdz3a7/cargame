// Modélisation procédurale des voitures : carrosserie par lissage de sections (loft), vitrages,
// optiques, jantes paramétriques, accessoires et livrées.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { RIM_COLORS, NEONS } from './carDefs.js';
import { plateTexture } from '../world/textures.js';

// --------------------------------------------------------------- interpolation monotone
function monotone(knots) {
  const n = knots.length;
  const xs = knots.map((k) => k[0]), ys = knots.map((k) => k[1]);
  const d = new Array(n).fill(0), m = new Array(n - 1);
  for (let i = 0; i < n - 1; i++) m[i] = (ys[i + 1] - ys[i]) / Math.max(1e-6, xs[i + 1] - xs[i]);
  d[0] = m[0]; d[n - 1] = m[n - 2];
  for (let i = 1; i < n - 1; i++) d[i] = m[i - 1] * m[i] <= 0 ? 0 : (m[i - 1] + m[i]) / 2;
  for (let i = 0; i < n - 1; i++) {
    if (m[i] === 0) { d[i] = d[i + 1] = 0; continue; }
    const a = d[i] / m[i], b = d[i + 1] / m[i];
    const s = a * a + b * b;
    if (s > 9) { const t = 3 / Math.sqrt(s); d[i] = t * a * m[i]; d[i + 1] = t * b * m[i]; }
  }
  return (x) => {
    if (x <= xs[0]) return ys[0];
    if (x >= xs[n - 1]) return ys[n - 1];
    let i = 0;
    while (x > xs[i + 1]) i++;
    const h = xs[i + 1] - xs[i], t = (x - xs[i]) / h;
    const t2 = t * t, t3 = t2 * t;
    return (2 * t3 - 3 * t2 + 1) * ys[i] + (t3 - 2 * t2 + t) * h * d[i] + (-2 * t3 + 3 * t2) * ys[i + 1] + (t3 - t2) * h * d[i + 1];
  };
}

// --------------------------------------------------------------- matériaux
export function paintMaterial(color, finish) {
  const m = new THREE.MeshPhysicalMaterial({ color: new THREE.Color(color) });
  setFinish(m, finish);
  return m;
}
export function setFinish(m, finish) {
  m.metalness = 0.15; m.roughness = 0.32; m.clearcoat = 1; m.clearcoatRoughness = 0.04; m.sheen = 0; m.iridescence = 0;
  if (finish === 'metal') { m.metalness = 0.6; m.roughness = 0.35; }
  if (finish === 'pearl') { m.metalness = 0.45; m.roughness = 0.3; m.iridescence = 0.6; m.iridescenceIOR = 1.6; }
  if (finish === 'matte') { m.metalness = 0.1; m.roughness = 0.75; m.clearcoat = 0; }
  if (finish === 'chrome') { m.metalness = 1; m.roughness = 0.06; m.clearcoat = 0.3; }
  m.envMapIntensity = 1.2;
  m.needsUpdate = true;
}

const shared = {};
function sharedMats() {
  if (shared.ready) return shared;
  shared.trim = new THREE.MeshStandardMaterial({ color: 0x17181a, roughness: 0.65, metalness: 0.1 });
  shared.chrome = new THREE.MeshStandardMaterial({ color: 0xdddddd, roughness: 0.08, metalness: 1 });
  shared.rubber = new THREE.MeshStandardMaterial({ color: 0x141414, roughness: 0.92, metalness: 0 });
  shared.disc = new THREE.MeshStandardMaterial({ color: 0x55585c, roughness: 0.45, metalness: 0.85 });
  shared.wellMat = new THREE.MeshStandardMaterial({ color: 0x0b0b0c, roughness: 0.95, side: THREE.DoubleSide });
  shared.grille = new THREE.MeshStandardMaterial({ color: 0x0e0f10, roughness: 0.5, metalness: 0.6 });
  shared.metal = new THREE.MeshStandardMaterial({ color: 0x8c9095, roughness: 0.4, metalness: 0.85 });
  shared.ready = true;
  return shared;
}

// --------------------------------------------------------------- roues
const wheelCache = new Map();
function wheelGeometries(R, W, style) {
  const key = `${R.toFixed(3)}_${W.toFixed(3)}_${style}`;
  if (wheelCache.has(key)) return wheelCache.get(key);
  const rimR = R * (style === 'offroad' ? 0.6 : style === 'steel' ? 0.62 : 0.68);
  const hw = W / 2;
  const prof = [
    [rimR * 0.98, -hw * 0.92], [R * 0.86, -hw * 1.0], [R * 0.97, -hw * 0.9], [R, -hw * 0.62],
    [R, hw * 0.62], [R * 0.97, hw * 0.9], [R * 0.86, hw * 1.0], [rimR * 0.98, hw * 0.92],
  ].map(([r, y]) => new THREE.Vector2(r, y));
  const tire = new THREE.LatheGeometry(prof, 30).rotateZ(-Math.PI / 2);
  // flancs : lettrage/sculptures simulés par des crampons pour le tout-terrain
  const tireParts = [tire];
  if (style === 'offroad') {
    for (let k = 0; k < 18; k++) {
      const a = (k / 18) * Math.PI * 2;
      const lug = new THREE.BoxGeometry(W * 0.9, 0.035, 0.07).translate(0, R + 0.005, 0).rotateX(a + (k % 2) * 0.06);
      tireParts.push(lug);
    }
  }
  const tireGeo = mergeGeometries(tireParts.map((g) => g.toNonIndexed ? g.toNonIndexed() : g));
  const face = hw * 0.62; // position de la face de la jante (vers l'extérieur +x)
  const rimParts = [];
  const barrel = new THREE.CylinderGeometry(rimR, rimR, W * 0.84, 28, 1, true).rotateZ(Math.PI / 2);
  rimParts.push(barrel);
  const lip = new THREE.TorusGeometry(rimR * 0.985, rimR * 0.035, 6, 32).rotateY(Math.PI / 2).translate(face, 0, 0);
  rimParts.push(lip);
  const hub = new THREE.CylinderGeometry(rimR * 0.2, rimR * 0.22, 0.05, 16).rotateZ(Math.PI / 2).translate(face - 0.02, 0, 0);
  rimParts.push(hub);
  const spoke = (n, width, depth, twist = 0, inset = 0) => {
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2;
      const g = new THREE.BoxGeometry(depth, rimR * 0.82, width).translate(0, rimR * 0.5, 0);
      if (twist) g.rotateY(twist);
      g.rotateX(a).translate(face - 0.025 - inset, 0, 0);
      rimParts.push(g);
    }
  };
  if (style === 'sport5') { spoke(5, rimR * 0.22, 0.05); spoke(5, rimR * 0.06, 0.04, 0, 0.01); }
  else if (style === 'multi') spoke(10, rimR * 0.09, 0.045);
  else if (style === 'mesh') { spoke(14, rimR * 0.05, 0.035, 0.35); spoke(14, rimR * 0.05, 0.035, -0.35, 0.012); }
  else if (style === 'turbine') spoke(12, rimR * 0.16, 0.035, 0.6);
  else if (style === 'offroad') {
    spoke(6, rimR * 0.28, 0.06);
    const ring = new THREE.TorusGeometry(rimR * 0.92, rimR * 0.06, 6, 24).rotateY(Math.PI / 2).translate(face + 0.01, 0, 0);
    rimParts.push(ring);
  } else if (style === 'steel') {
    const disc = new THREE.CylinderGeometry(rimR * 0.95, rimR * 0.95, 0.02, 28).rotateZ(Math.PI / 2).translate(face - 0.03, 0, 0);
    const cap = new THREE.CylinderGeometry(rimR * 0.78, rimR * 0.86, 0.04, 28).rotateZ(Math.PI / 2).translate(face - 0.005, 0, 0);
    rimParts.push(disc, cap);
  }
  const rimGeo = mergeGeometries(rimParts.map((g) => (g.index ? g.toNonIndexed() : g)));
  const discGeo = new THREE.CylinderGeometry(rimR * 0.78, rimR * 0.78, 0.03, 24).rotateZ(Math.PI / 2).translate(face - 0.1, 0, 0);
  const caliperGeo = new THREE.BoxGeometry(0.07, rimR * 0.42, rimR * 0.3).translate(face - 0.075, rimR * 0.55, -rimR * 0.2);
  const res = { tireGeo, rimGeo, discGeo, caliperGeo, rimR };
  wheelCache.set(key, res);
  return res;
}

function makeWheel(R, W, style, rimMat, caliperMat, mats) {
  const g = wheelGeometries(R, W, style);
  const pivot = new THREE.Group();
  const spin = new THREE.Group();
  const tire = new THREE.Mesh(g.tireGeo, mats.rubber);
  const rim = new THREE.Mesh(g.rimGeo, rimMat);
  const disc = new THREE.Mesh(g.discGeo, mats.disc);
  tire.castShadow = true; rim.castShadow = true;
  spin.add(tire, rim, disc);
  const caliper = new THREE.Mesh(g.caliperGeo, caliperMat);
  pivot.add(spin, caliper);
  pivot.userData.spin = spin;
  return pivot;
}

// --------------------------------------------------------------- décalcomanies latérales
function sideDecalTexture(livery, colorHex) {
  const c = document.createElement('canvas');
  c.width = 1024; c.height = 256;
  const ctx = c.getContext('2d');
  ctx.clearRect(0, 0, 1024, 256);
  if (livery === 'dz') {
    ctx.fillStyle = '#006233'; ctx.fillRect(0, 0, 512, 256);
    ctx.fillStyle = '#ffffff'; ctx.fillRect(512, 0, 512, 256);
    ctx.fillStyle = '#d21034';
    ctx.beginPath(); ctx.arc(520, 128, 92, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(548, 128, 76, 0, Math.PI * 2); ctx.fill();
    // moitié gauche du disque sur fond vert
    ctx.save(); ctx.beginPath(); ctx.rect(0, 0, 512, 256); ctx.clip();
    ctx.fillStyle = '#d21034'; ctx.beginPath(); ctx.arc(520, 128, 92, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#006233'; ctx.beginPath(); ctx.arc(548, 128, 76, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    // étoile
    ctx.fillStyle = '#d21034';
    ctx.beginPath();
    for (let k = 0; k < 10; k++) {
      const r = k % 2 ? 22 : 54, a = -Math.PI / 2 + (k * Math.PI) / 5 + Math.PI / 10;
      ctx.lineTo(600 + Math.cos(a) * r, 128 + Math.sin(a) * r);
    }
    ctx.fill();
  } else if (livery === 'side') {
    ctx.fillStyle = 'rgba(255,255,255,0.92)'; ctx.fillRect(0, 150, 1024, 26);
    ctx.fillStyle = 'rgba(20,20,20,0.9)'; ctx.fillRect(0, 182, 1024, 10);
  } else if (livery === 'police') {
    ctx.fillStyle = '#0b3d91'; ctx.fillRect(0, 110, 1024, 70);
    ctx.fillStyle = '#ffffff'; ctx.font = 'bold 54px Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('POLICE', 360, 146);
    ctx.font = 'bold 52px Tahoma, Arial'; ctx.fillText('الشرطة', 720, 146);
    ctx.fillStyle = '#d21034'; ctx.fillRect(0, 185, 1024, 12);
  } else if (livery === 'rally') {
    ctx.fillStyle = '#ffffff';
    ctx.beginPath(); ctx.moveTo(0, 256); ctx.lineTo(420, 60); ctx.lineTo(600, 60); ctx.lineTo(180, 256); ctx.fill();
    ctx.fillStyle = '#f2c500';
    ctx.beginPath(); ctx.moveTo(220, 256); ctx.lineTo(640, 60); ctx.lineTo(700, 60); ctx.lineTo(280, 256); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(820, 140, 70, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#111'; ctx.font = 'bold 96px Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('16', 820, 146);
  } else if (livery === 'stripes') {
    // pas de décor latéral pour les bandes (elles sont sur le capot)
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

// --------------------------------------------------------------- construction principale
export function buildCarModel(car, cfg, opts = {}) {
  const mats = sharedMats();
  const b = car.body;
  const L = b.L, W = b.W;
  const topF = monotone(b.top), botF = monotone(b.bottom), widF = monotone(b.width);
  const lowDetail = !!opts.lowDetail;
  const paint = opts.paintMat || (lowDetail
    ? new THREE.MeshStandardMaterial({ color: cfg.color, metalness: 0.4, roughness: 0.35 })
    : paintMaterial(cfg.color, cfg.finish));
  const glass = lowDetail
    ? new THREE.MeshStandardMaterial({ color: 0x1a2430, roughness: 0.1, metalness: 0.6 })
    : new THREE.MeshPhysicalMaterial({ color: new THREE.Color(0x0e141a).lerp(new THREE.Color(0x4a5a66), Math.max(0, 0.6 - cfg.tint * 0.2)), roughness: 0.04, metalness: 0.3, clearcoat: 1, envMapIntensity: 1.4, transparent: true, opacity: 0.94 - (3 - cfg.tint) * 0.05 });
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);

  // positions des roues (repère modèle : avant vers -z, sol à y=0)
  const zf = -(L / 2 - b.front), zr = zf + b.WB;
  const tf = (zf + L / 2) / L, tr = (zr + L / 2) / L;
  const archR = b.R + 0.07;
  // hauteur du passage de roue à la station t (0 si hors passage)
  const archAt = (t) => {
    let y = 0;
    for (const tw of [tf, tr]) {
      const dz = (t - tw) * L;
      if (Math.abs(dz) < archR) y = Math.max(y, b.R + Math.sqrt(archR * archR - dz * dz) * 0.95);
    }
    return y;
  };
  // stations
  const N = lowDetail ? 34 : 70;
  const tset = new Set();
  for (let i = 0; i < N; i++) tset.add(+((1 - Math.cos((Math.PI * i) / (N - 1))) / 2).toFixed(5));
  for (const v of [b.ws[0], b.ws[1], b.rw[0], b.rw[1]]) tset.add(v);
  for (const tw of [tf, tr]) for (let k = -6; k <= 6; k++) { const t = tw + (k / 6) * (archR / L); if (t > 0 && t < 1) tset.add(+t.toFixed(5)); }
  const ts = [...tset].sort((a, c) => a - c);
  const PH = 14; // points par demi-section
  const sections = [];
  for (const t of ts) {
    const yt = topF(t), yb = Math.min(botF(t), yt - 0.15), hw = (W / 2) * widF(t);
    const gh = !b.noGlass && yt > b.belt + 0.1;
    const rT = gh ? 0.07 : Math.min(0.12, (yt - yb) * 0.3);
    const yS = gh ? b.belt : Math.max(yb + 0.1, yt - rT);
    let rB = Math.min(0.1, (yS - yb) * 0.3);
    let ya = Math.max(yb, archAt(t));
    ya = Math.min(ya, yS - rB - 0.03);
    const inArch = ya > yb + 0.01;
    const roofHW = gh ? hw * b.tumble : hw - rT;
    const crown = 0.018 * hw;
    const inX = inArch ? Math.max(hw * 0.35, hw - b.RW * 1.3) : hw * 0.55;
    const pts = [
      [0, yb], [inX, yb], [hw - rB, ya], [hw - rB * 0.3, ya + rB * 0.3], [hw, ya + rB],
      [hw * 1.006, (ya + rB + yS) / 2], [hw, yS],
    ];
    if (gh) {
      const x7 = hw * 0.965, y7 = yS + 0.03;
      pts.push([x7, y7], [x7 + (roofHW - x7) * 0.55, y7 + (yt - rT - y7) * 0.55], [roofHW, yt - rT], [roofHW - rT * 0.3, yt - rT * 0.3], [roofHW - rT, yt]);
    } else {
      pts.push([hw, yS + (yt - rT - yS) * 0.33], [hw, yS + (yt - rT - yS) * 0.66], [hw, yt - rT], [hw - rT * 0.3, yt - rT * 0.3], [hw - rT, yt]);
    }
    pts.push([roofHW * 0.5, yt + crown * 0.8], [0, yt + crown]);
    sections.push({ t, z: -L / 2 + t * L, pts, gh, inArch });
  }
  // sommets : pour chaque section, côté droit (x>0) puis côté gauche miroir
  const pos = [], uvs = [];
  const S = sections.length;
  const ringN = PH * 2;
  for (const s of sections) {
    for (let k = 0; k < PH; k++) { pos.push(s.pts[k][0], s.pts[k][1], s.z); uvs.push(s.t, k / (PH - 1)); }
    for (let k = 0; k < PH; k++) { pos.push(-s.pts[k][0], s.pts[k][1], s.z); uvs.push(s.t, k / (PH - 1)); }
  }
  const groups = { paint: [], glass: [], trim: [] };
  const pillarB = (b.ws[1] + b.rw[0]) / 2;
  const longCabin = b.rw[0] - b.ws[1] > 0.4;
  const pillarC = longCabin ? b.ws[1] + (b.rw[0] - b.ws[1]) * 0.72 : -1;
  const sideG0 = b.ws[0] + (b.ws[1] - b.ws[0]) * 0.42, sideG1 = b.rw[1] - (b.rw[1] - b.rw[0]) * 0.45;
  const matFor = (tm, k, gh, arch) => {
    if (k === 0 || (k === 1 && arch)) return 'trim';
    if (!gh || b.noGlass) return ((tm < 0.05 || tm > 0.95) && k <= 3) ? 'trim' : 'paint';
    const inCabin = tm > b.ws[0] + 0.01 && tm < b.rw[1] - 0.005;
    if (k >= 7 && k <= 9 && tm > sideG0 && tm < sideG1 && Math.abs(tm - pillarB) > 0.012 && Math.abs(tm - pillarC) > 0.012) return 'glass';
    if (k >= 9 && ((tm > b.ws[0] + 0.004 && tm < b.ws[1] - 0.004) || (tm > b.rw[0] + 0.004 && tm < b.rw[1] - 0.006))) return 'glass';
    if (inCabin && (k === 6 || (k >= 7 && k <= 8))) return 'trim'; // joints et montants noirs
    if ((tm < 0.05 || tm > 0.95) && k <= 3) return 'trim';
    return 'paint';
  };
  for (let i = 0; i < S - 1; i++) {
    const tm = (sections[i].t + sections[i + 1].t) / 2;
    const gh = sections[i].gh && sections[i + 1].gh;
    const arch = sections[i].inArch || sections[i + 1].inArch;
    for (let side = 0; side < 2; side++) {
      for (let k = 0; k < PH - 1; k++) {
        const a = i * ringN + side * PH + k, c = (i + 1) * ringN + side * PH + k;
        const tri = side === 0 ? [a, a + 1, c, a + 1, c + 1, c] : [a, c, a + 1, a + 1, c, c + 1];
        groups[matFor(tm, k, gh, arch)].push(...tri);
      }
    }
  }
  // bouchons avant/arrière
  const capStart = pos.length / 3;
  for (const [si, dir] of [[0, -1], [S - 1, 1]]) {
    const s = sections[si];
    const base = pos.length / 3;
    let cy = 0;
    for (const p of s.pts) cy += p[1];
    cy /= s.pts.length;
    pos.push(0, cy, s.z); uvs.push(s.t, 0.5);
    for (let k = 0; k < PH; k++) { pos.push(s.pts[k][0], s.pts[k][1], s.z); uvs.push(s.t, k / PH); }
    for (let k = 0; k < PH; k++) { pos.push(-s.pts[k][0], s.pts[k][1], s.z); uvs.push(s.t, k / PH); }
    for (let k = 0; k < PH - 1; k++) {
      const r0 = base + 1 + k, r1 = base + 2 + k, l0 = base + 1 + PH + k, l1 = base + 2 + PH + k;
      if (dir < 0) { groups.paint.push(base, r0, r1, base, l1, l0); } else { groups.paint.push(base, r1, r0, base, l0, l1); }
    }
  }
  void capStart;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  const all = [...groups.paint, ...groups.glass, ...groups.trim];
  geo.setIndex(all);
  geo.addGroup(0, groups.paint.length, 0);
  geo.addGroup(groups.paint.length, groups.glass.length, 1);
  geo.addGroup(groups.paint.length + groups.glass.length, groups.trim.length, 2);
  geo.computeVertexNormals();
  const shell = new THREE.Mesh(geo, [paint, glass, mats.trim]);
  shell.castShadow = true;
  shell.receiveShadow = !lowDetail;
  body.add(shell);

  const yAt = (t) => topF(t);
  const hwAt = (t) => (W / 2) * widF(t);
  const add = (geo, mat, x, y, z, rx = 0, ry = 0, rz = 0, shadow = false) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z); m.rotation.set(rx, ry, rz);
    m.castShadow = shadow;
    body.add(m);
    return m;
  };

  // optiques
  const lightMats = {
    head: new THREE.MeshStandardMaterial({ color: 0xdfe6ee, emissive: 0xfff4e0, emissiveIntensity: 0.15, roughness: 0.1, metalness: 0.4 }),
    tail: new THREE.MeshStandardMaterial({ color: 0x5a0508, emissive: 0xff1010, emissiveIntensity: 0.25, roughness: 0.3 }),
    reverse: new THREE.MeshStandardMaterial({ color: 0x888888, emissive: 0xffffff, emissiveIntensity: 0 }),
  };
  const tH = 0.025;
  const yHead = botF(0.02) + (yAt(tH) - botF(0.02)) * 0.68;
  const slopeF = Math.atan2(yAt(0.06) - yAt(0.0), 0.06 * L);
  const headW = Math.min(0.38, hwAt(0.03) * 0.42);
  for (const sd of [-1, 1]) {
    add(new THREE.BoxGeometry(headW, 0.11, 0.08), lightMats.head, sd * hwAt(0.03) * 0.62, yHead, -L / 2 + 0.035 + Math.max(0, (yHead - yAt(0.0)) / Math.tan(Math.max(0.2, slopeF + 0.01))) * 0, -slopeF * 0.5);
    add(new THREE.BoxGeometry(Math.min(0.42, hwAt(0.98) * 0.5), 0.1, 0.06), lightMats.tail, sd * hwAt(0.98) * 0.6, botF(0.98) + (yAt(0.975) - botF(0.98)) * 0.72, L / 2 - 0.02);
    add(new THREE.BoxGeometry(0.12, 0.06, 0.04), lightMats.reverse, sd * hwAt(0.98) * 0.32, botF(0.98) + (yAt(0.975) - botF(0.98)) * 0.55, L / 2 - 0.01);
  }
  // calandre
  add(new THREE.BoxGeometry(hwAt(0.02) * 0.75, Math.max(0.08, (yHead - botF(0.02)) * 0.55), 0.06), mats.grille, 0, botF(0.02) + (yHead - botF(0.02)) * 0.45, -L / 2 + 0.02);
  // plaques
  if (!lowDetail) {
    const ptex = plateTexture(cfg.plate || '12345 116');
    const pmat = new THREE.MeshStandardMaterial({ map: ptex, roughness: 0.4 });
    const plateGeo = new THREE.PlaneGeometry(0.52, 0.115);
    add(plateGeo, pmat, 0, botF(0.01) + 0.12, -L / 2 - 0.012, 0, Math.PI, 0);
    add(plateGeo, pmat, 0, botF(0.99) + 0.16, L / 2 + 0.012, 0, 0, 0);
  }
  // rétroviseurs
  if (!b.noGlass) {
    const tm = b.ws[0] + (b.ws[1] - b.ws[0]) * 0.35;
    for (const sd of [-1, 1]) {
      const mx = sd * (hwAt(tm) + 0.07);
      add(new THREE.BoxGeometry(0.16, 0.1, 0.12), paint, mx, b.belt + 0.08, -L / 2 + tm * L + 0.05, 0, 0, 0, true);
      add(new THREE.BoxGeometry(0.1, 0.03, 0.04), mats.trim, sd * (hwAt(tm) - 0.0), b.belt + 0.05, -L / 2 + tm * L + 0.08);
    }
  }

  // ------------------------------------------------ accessoires
  const ex = new Set(car.extras);
  const cyl = (r, h, seg = 12) => new THREE.CylinderGeometry(r, r, h, seg);
  const exhaust = (xs) => { for (const x of xs) add(cyl(0.045, 0.2).rotateX(Math.PI / 2), mats.chrome, x, botF(0.99) + 0.08, L / 2 + 0.02); };
  if (ex.has('dualExhaust')) exhaust([-hwAt(1) * 0.55, hwAt(1) * 0.55]);
  if (ex.has('quadExhaust')) exhaust([-hwAt(1) * 0.6, -hwAt(1) * 0.45, hwAt(1) * 0.45, hwAt(1) * 0.6]);
  if (ex.has('centerExhaust')) exhaust([-0.07, 0.07]);
  if (!ex.has('dualExhaust') && !ex.has('quadExhaust') && !ex.has('centerExhaust') && !ex.has('engineOpen')) exhaust([hwAt(1) * 0.5]);
  if (ex.has('spoilerSmall')) add(new THREE.BoxGeometry(hwAt(0.97) * 1.7, 0.04, 0.22), paint, 0, yAt(0.97) + 0.04, L / 2 - 0.12, 0.12, 0, 0, true);
  if (ex.has('lipSpoiler')) add(new THREE.BoxGeometry(hwAt(0.97) * 1.6, 0.03, 0.12), mats.trim, 0, yAt(0.985) + 0.02, L / 2 - 0.06, 0.2);
  if (ex.has('wingBig')) {
    const zw = L / 2 - 0.25, yw = yAt(0.93) + 0.32;
    add(new THREE.BoxGeometry(W * 0.92, 0.04, 0.34), car.id === 'rally' ? paint : mats.trim, 0, yw, zw, -0.08, 0, 0, true);
    for (const sd of [-1, 1]) {
      add(new THREE.BoxGeometry(0.03, 0.3, 0.36), mats.trim, sd * W * 0.46, yw, zw);
      add(new THREE.BoxGeometry(0.04, 0.32, 0.08), mats.trim, sd * W * 0.25, yw - 0.16, zw + 0.04);
    }
  }
  if (ex.has('hoodScoop')) add(new THREE.BoxGeometry(0.5, 0.08, 0.6), mats.trim, 0, yAt(0.2) + 0.03, -L / 2 + 0.2 * L, -0.05);
  if (ex.has('roofScoop')) add(new THREE.BoxGeometry(0.34, 0.1, 0.4), paint, 0, yAt(0.5) + 0.06, -L / 2 + 0.47 * L);
  if (ex.has('sideIntakes')) for (const sd of [-1, 1]) add(new THREE.BoxGeometry(0.06, 0.18, 0.55), mats.trim, sd * (hwAt(0.6) - 0.01), b.belt - 0.22, -L / 2 + 0.6 * L);
  if (ex.has('diffuser')) for (let k = -3; k <= 3; k++) add(new THREE.BoxGeometry(0.02, 0.14, 0.4), mats.trim, k * 0.2, botF(0.98) + 0.05, L / 2 - 0.15);
  if (ex.has('finSpine')) add(new THREE.BoxGeometry(0.03, 0.22, L * 0.28), paint, 0, yAt(0.75) + 0.1, -L / 2 + 0.78 * L);
  if (ex.has('taxi')) {
    const tm = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffd000, emissiveIntensity: 0.5 });
    add(new THREE.BoxGeometry(0.62, 0.16, 0.22), tm, 0, yAt(0.52) + 0.1, -L / 2 + 0.52 * L);
  }
  let lightbar = null;
  if (ex.has('lightbar') || ex.has('lightbarRoof')) {
    const isPolice = ex.has('lightbar');
    const g = new THREE.Group();
    const base = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.07, 0.26), mats.trim);
    g.add(base);
    const red = new THREE.MeshStandardMaterial({ color: isPolice ? 0x400000 : 0x333333, emissive: isPolice ? 0xff1030 : 0xffffff, emissiveIntensity: 0.2 });
    const blue = new THREE.MeshStandardMaterial({ color: isPolice ? 0x000a40 : 0x333333, emissive: isPolice ? 0x1040ff : 0xffffff, emissiveIntensity: 0.2 });
    const l = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.1, 0.24), red); l.position.set(-0.28, 0.06, 0);
    const r = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.1, 0.24), blue); r.position.set(0.28, 0.06, 0);
    g.add(l, r);
    const tm = isPolice ? 0.52 : 0.31;
    g.position.set(0, (isPolice ? yAt(tm) + 0.06 : 1.7), -L / 2 + tm * L);
    body.add(g);
    lightbar = { red, blue, police: isPolice };
  }
  if (ex.has('pushbar')) {
    add(new THREE.BoxGeometry(W * 0.5, 0.32, 0.06), mats.trim, 0, botF(0.01) + 0.25, -L / 2 - 0.1);
    for (const sd of [-1, 1]) add(new THREE.BoxGeometry(0.06, 0.4, 0.14), mats.trim, sd * W * 0.22, botF(0.01) + 0.25, -L / 2 - 0.05);
  }
  if (ex.has('bullbar')) {
    const tube = (x0, y0, x1, y1) => {
      const len = Math.hypot(x1 - x0, y1 - y0);
      const m = add(cyl(0.035, len, 8), mats.metal, (x0 + x1) / 2, (y0 + y1) / 2, -L / 2 - 0.12);
      m.rotation.z = Math.atan2(x1 - x0, y1 - y0) * -1;
    };
    const y0 = botF(0.01) + 0.05, y1 = yAt(0.02) + 0.05;
    tube(-W * 0.38, y0, -W * 0.38, y1); tube(W * 0.38, y0, W * 0.38, y1);
    const bar = add(cyl(0.035, W * 0.76, 8), mats.metal, 0, y1, -L / 2 - 0.12); bar.rotation.z = Math.PI / 2;
    const bar2 = add(cyl(0.03, W * 0.76, 8), mats.metal, 0, (y0 + y1) / 2, -L / 2 - 0.14); bar2.rotation.z = Math.PI / 2;
  }
  if (ex.has('snorkel')) {
    const tm = b.ws[0] + 0.01;
    add(cyl(0.05, b.top.reduce((m, k) => Math.max(m, k[1]), 0) - b.belt + 0.25, 8), mats.trim, hwAt(tm) + 0.06, (b.belt + yAt(b.ws[1])) / 2 + 0.1, -L / 2 + tm * L);
  }
  if (ex.has('roofrack')) {
    const t0 = b.ws[1] + 0.02, t1 = b.rw[0] - 0.02;
    const yr = yAt((t0 + t1) / 2) + 0.12;
    const len = (t1 - t0) * L;
    for (const sd of [-1, 1]) add(new THREE.BoxGeometry(0.05, 0.05, len), mats.trim, sd * hwAt(0.5) * b.tumble * 0.85, yr, -L / 2 + ((t0 + t1) / 2) * L);
    for (let k = 0; k < 5; k++) add(new THREE.BoxGeometry(hwAt(0.5) * b.tumble * 1.7, 0.04, 0.05), mats.trim, 0, yr, -L / 2 + (t0 + ((t1 - t0) * k) / 4) * L);
    for (let k = 0; k < 4; k++) add(new THREE.BoxGeometry(0.5, 0.3, 0.4), new THREE.MeshStandardMaterial({ color: [0x3b4a2a, 0x6b4a2a, 0x2a2a2a, 0x5a5040][k], roughness: 0.9 }), (k % 2 ? 0.3 : -0.3), yr + 0.17, -L / 2 + (t0 + 0.08 + k * 0.08) * L);
  }
  if (ex.has('spare')) {
    const g = wheelGeometries(b.R * 0.95, b.RW, 'steel');
    const sp = new THREE.Mesh(g.tireGeo, mats.rubber);
    sp.rotation.y = Math.PI / 2;
    sp.position.set(0, (botF(1) + yAt(0.99)) / 2 + 0.05, L / 2 + b.RW / 2 + 0.02);
    body.add(sp);
  }
  if (ex.has('mudflaps')) for (const zw of [zf, zr]) for (const sd of [-1, 1]) add(new THREE.BoxGeometry(b.RW * 0.9, 0.3, 0.02), mats.trim, sd * (hwAt(0.5) - b.RW / 2), 0.2, zw + archR + 0.05);
  if (ex.has('hoodLights')) {
    const lm = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff6d0, emissiveIntensity: 0.2 });
    for (let k = 0; k < 4; k++) add(cyl(0.08, 0.06, 14).rotateX(Math.PI / 2), lm, -0.36 + k * 0.24, yAt(0.06) + 0.1, -L / 2 + 0.08 * L);
  }
  if (ex.has('bed')) {
    const t0 = 0.565, t1 = 0.98;
    add(new THREE.BoxGeometry(hwAt(0.8) * 1.86, 0.02, (t1 - t0) * L), mats.trim, 0, yAt(0.8) + 0.012, -L / 2 + ((t0 + t1) / 2) * L);
    // arceau
    add(new THREE.BoxGeometry(hwAt(0.6) * 1.9, 0.05, 0.05), mats.metal, 0, yAt(0.6) + 0.42, -L / 2 + 0.585 * L);
    for (const sd of [-1, 1]) add(new THREE.BoxGeometry(0.05, 0.42, 0.05), mats.metal, sd * hwAt(0.6) * 0.92, yAt(0.6) + 0.21, -L / 2 + 0.585 * L);
  }
  if (ex.has('cage')) {
    const yTop = 1.62;
    const tube = (a, c) => {
      const va = new THREE.Vector3(...a), vc = new THREE.Vector3(...c);
      const len = va.distanceTo(vc);
      const m = new THREE.Mesh(cyl(0.035, len, 8), mats.metal);
      m.position.copy(va).add(vc).multiplyScalar(0.5);
      m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), vc.clone().sub(va).normalize());
      m.castShadow = true;
      body.add(m);
    };
    const zA = -L / 2 + 0.28 * L, zB = -L / 2 + 0.66 * L, xw = W * 0.4, base = 0.92;
    for (const sd of [-1, 1]) {
      tube([sd * xw, base, zA - 0.3], [sd * xw * 0.85, yTop, zA + 0.15]);
      tube([sd * xw, base, zB], [sd * xw * 0.85, yTop, zB - 0.1]);
      tube([sd * xw * 0.85, yTop, zA + 0.15], [sd * xw * 0.85, yTop, zB - 0.1]);
      tube([sd * xw, base, zB], [sd * xw * 0.6, base + 0.2, L / 2 - 0.1]);
    }
    tube([-xw * 0.85, yTop, zA + 0.15], [xw * 0.85, yTop, zA + 0.15]);
    tube([-xw * 0.85, yTop, zB - 0.1], [xw * 0.85, yTop, zB - 0.1]);
    // sièges baquets
    for (const sd of [-1, 1]) {
      add(new THREE.BoxGeometry(0.46, 0.55, 0.12), mats.trim, sd * 0.3, 1.15, zB - 0.25, -0.15);
      add(new THREE.BoxGeometry(0.46, 0.1, 0.45), mats.trim, sd * 0.3, 0.93, zB - 0.5);
    }
    add(new THREE.TorusGeometry(0.17, 0.025, 6, 16), mats.trim, -0.3, 1.18, zA + 0.35, -0.9);
  }
  if (ex.has('engineOpen')) {
    add(new THREE.BoxGeometry(0.6, 0.35, 0.5), mats.metal, 0, 1.0, L / 2 - 0.55);
    for (const sd of [-1, 1]) add(cyl(0.05, 0.6, 8).rotateX(Math.PI / 2 - 0.4), mats.chrome, sd * 0.2, 1.1, L / 2 - 0.15);
  }

  // livrées
  const liv = cfg.livery || 'none';
  if (liv === 'stripes' || ex.has('stripes') && liv === 'none') {
    const sm = new THREE.MeshStandardMaterial({ color: 0xf4f4f4, roughness: 0.35, metalness: 0.1, polygonOffset: true, polygonOffsetFactor: -2 });
    for (const off of [-0.2, 0.2]) {
      const pts = [];
      for (let i = 0; i <= 60; i++) {
        const t = i / 60;
        if ((t > b.ws[0] && t < b.ws[1]) || (t > b.rw[0] && t < b.rw[1])) { pts.push(null); continue; }
        pts.push([t, yAt(t) + 0.018 * hwAt(t) + 0.004]);
      }
      let run = [];
      const flush = () => {
        if (run.length > 1) {
          const p = [], idx = [];
          run.forEach(([t, y], i) => {
            const z = -L / 2 + t * L;
            p.push(off - 0.09, y, z, off + 0.09, y, z);
            if (i) idx.push((i - 1) * 2, i * 2, (i - 1) * 2 + 1, (i - 1) * 2 + 1, i * 2, i * 2 + 1);
          });
          const g = new THREE.BufferGeometry();
          g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
          g.setIndex(idx); g.computeVertexNormals();
          body.add(new THREE.Mesh(g, sm));
        }
        run = [];
      };
      for (const p of pts) { if (p) run.push(p); else flush(); }
      flush();
    }
  }
  const sideLiv = ex.has('policeLivery') && liv === 'none' ? 'police' : liv;
  if (['dz', 'side', 'police', 'rally'].includes(sideLiv) && !lowDetail) {
    const tex = sideDecalTexture(sideLiv, cfg.color);
    const dm = new THREE.MeshStandardMaterial({ map: tex, transparent: true, roughness: 0.4, metalness: 0.1, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    const t0 = 0.12, t1 = 0.9;
    for (const sd of [-1, 1]) {
      const p = [], uv = [], idx = [];
      const M = 40;
      for (let i = 0; i <= M; i++) {
        const t = t0 + ((t1 - t0) * i) / M;
        const sec = sections.reduce((best, s) => (Math.abs(s.t - t) < Math.abs(best.t - t) ? s : best), sections[0]);
        const y0 = sec.pts[4][1], y1 = sec.pts[6][1];
        const x = (sec.pts[5][0] + 0.006) * sd;
        const z = -L / 2 + t * L;
        p.push(x, y0, z, x, y1, z);
        const u = sd > 0 ? (i / M) : 1 - i / M;
        uv.push(u, 0, u, 1);
        if (i) idx.push(...(sd > 0 ? [(i - 1) * 2, (i - 1) * 2 + 1, i * 2, (i - 1) * 2 + 1, i * 2 + 1, i * 2] : [(i - 1) * 2, i * 2, (i - 1) * 2 + 1, (i - 1) * 2 + 1, i * 2, i * 2 + 1]));
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      g.setIndex(idx); g.computeVertexNormals();
      body.add(new THREE.Mesh(g, dm));
    }
  }

  // néons
  let neon = null;
  const nn = NEONS.find((n) => n.id === cfg.neon);
  if (nn && nn.c && !lowDetail) {
    const nm = new THREE.MeshBasicMaterial({ color: nn.c, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false });
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(W * 1.25, L * 1.05), nm);
    plane.rotation.x = -Math.PI / 2;
    plane.position.y = 0.03;
    body.add(plane);
    neon = plane;
  }

  // roues
  const rimC = RIM_COLORS.find((r) => r.id === cfg.rimColor);
  const rimMat = new THREE.MeshStandardMaterial({ color: rimC ? rimC.c : '#c8ccd2', metalness: cfg.rimColor === 'black' ? 0.5 : 0.95, roughness: cfg.rimColor === 'chrome' ? 0.05 : 0.25 });
  const calMat = new THREE.MeshStandardMaterial({ color: cfg.caliper || '#c0262d', roughness: 0.4, metalness: 0.3 });
  const wheels = [];
  for (let i = 0; i < 4; i++) {
    const front = i < 2, left = i % 2 === 0;
    const w = makeWheel(b.R, b.RW, cfg.rim, rimMat, calMat, mats);
    if (left) w.rotation.y = Math.PI;
    const holder = new THREE.Group();
    holder.add(w);
    root.add(holder);
    wheels.push({ holder, pivot: w, spin: w.userData.spin, left, front });
  }

  return { root, body, wheels, lightMats, lightbar, neon, paint, glass, zf, zr };
}
