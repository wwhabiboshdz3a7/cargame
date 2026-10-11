// Lieux emblématiques : port, aéroport, Maqam Echahid, Djamaa El Djazaïr, Stunt Park, tremplins,
// Ghardaïa, Blida, Tipaza, Chréa, stations-service, drapeaux.
import * as THREE from 'three';
import { Kit } from './kit.js';
import { mulberry32 } from './noise.js';
import { CITY, PORT_QUAYS, AIRPORT, STUNT_PARK, MONUMENT, OASIS, MEGA_RAMP_AREA, BLIDA, POIS, coastZ } from './layout.js';
import { concreteTexture, facadeTextures, runwayTexture, chevronTexture, roofTexture, textTexture } from './textures.js';
import { NODES } from './roadsData.js';

const UP = new THREE.Vector3(0, 1, 0);

function regionY(world, id) { return world.regions.find((r) => r.id === id).y; }

function makeMats() {
  const conc = concreteTexture(5, [1, 1, 1], 8);
  const tex = (t, rx, ry) => { const c = t.clone(); c.repeat.set(rx, ry); c.needsUpdate = true; return c; };
  const fac = (s) => { const t = facadeTextures(s); return new THREE.MeshStandardMaterial({ map: t.map, emissiveMap: t.emissive, emissive: 0xffffff, emissiveIntensity: 0, roughness: 0.85 }); };
  const ct = document.createElement('canvas'); ct.width = 64; ct.height = 256;
  const cx = ct.getContext('2d'); cx.fillStyle = '#ddd'; cx.fillRect(0, 0, 64, 256);
  for (let y = 0; y < 256; y += 16) { cx.fillStyle = '#aaa'; cx.fillRect(0, y, 64, 6); }
  const corr = new THREE.CanvasTexture(ct); corr.wrapS = corr.wrapT = THREE.RepeatWrapping; corr.colorSpace = THREE.SRGBColorSpace;
  return {
    concrete: new THREE.MeshStandardMaterial({ map: conc, roughness: 0.88 }),
    concreteDark: new THREE.MeshStandardMaterial({ map: conc, color: 0x9a9a96, roughness: 0.9 }),
    chevron: new THREE.MeshStandardMaterial({ map: tex(chevronTexture(), 1, 1), roughness: 0.6 }),
    white: new THREE.MeshStandardMaterial({ color: 0xf2f0ea, roughness: 0.6 }),
    whiteMarble: new THREE.MeshStandardMaterial({ map: conc, color: 0xf6f2ea, roughness: 0.35 }),
    metal: new THREE.MeshStandardMaterial({ color: 0x9aa0a6, metalness: 0.8, roughness: 0.4 }),
    craneRed: new THREE.MeshStandardMaterial({ color: 0xc8402a, metalness: 0.4, roughness: 0.55 }),
    craneBlue: new THREE.MeshStandardMaterial({ color: 0x1f5fa8, metalness: 0.4, roughness: 0.55 }),
    hull: new THREE.MeshStandardMaterial({ color: 0x23324a, roughness: 0.6, metalness: 0.3 }),
    hullRed: new THREE.MeshStandardMaterial({ color: 0x8c1d18, roughness: 0.6 }),
    glass: new THREE.MeshStandardMaterial({ color: 0x3a6585, roughness: 0.08, metalness: 0.8 }),
    mosque: fac('mosque'), haussmann: fac('haussmann'), hlm: fac('hlm'), mzab: fac('mzab'), casbah: fac('casbah'), warehouse: fac('warehouse'), shop: fac('shop'),
    roof: new THREE.MeshStandardMaterial({ map: roofTexture('grey'), roughness: 0.95 }),
    roofOchre: new THREE.MeshStandardMaterial({ map: roofTexture('ochre'), roughness: 0.95 }),
    dome: new THREE.MeshStandardMaterial({ color: 0xf4f1e8, roughness: 0.3, metalness: 0.1 }),
    domeGreen: new THREE.MeshStandardMaterial({ color: 0x2f7d5a, roughness: 0.35, metalness: 0.3 }),
    rock: new THREE.MeshStandardMaterial({ color: 0x8a5a3c, roughness: 0.95 }),
    stone: new THREE.MeshStandardMaterial({ map: conc, color: 0xd8c8a8, roughness: 0.9 }),
    planeBody: new THREE.MeshStandardMaterial({ color: 0xf4f6f8, roughness: 0.3, metalness: 0.3 }),
    planeTail: new THREE.MeshStandardMaterial({ color: 0xc8102e, roughness: 0.4 }),
    planeGreen: new THREE.MeshStandardMaterial({ color: 0x0b6e3a, roughness: 0.4 }),
    tire: new THREE.MeshStandardMaterial({ color: 0x151515, roughness: 0.9 }),
    busGreen: new THREE.MeshStandardMaterial({ color: 0x1f8a4c, roughness: 0.5 }),
    busWin: new THREE.MeshStandardMaterial({ color: 0x1a2a33, roughness: 0.1, metalness: 0.6 }),
    asphalt: new THREE.MeshStandardMaterial({ color: 0x3b3b3d, roughness: 0.9 }),
    runway: new THREE.MeshStandardMaterial({ map: runwayTexture(), roughness: 0.85, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 }),
    tarmac: new THREE.MeshStandardMaterial({ map: conc, color: 0x8f8f8c, roughness: 0.9, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 }),
    paint: new THREE.MeshStandardMaterial({ color: 0xf5f5f0, roughness: 0.6, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -6 }),
    yellowPaint: new THREE.MeshStandardMaterial({ color: 0xf2c500, roughness: 0.6, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -6 }),
    corrugated: new THREE.MeshStandardMaterial({ map: corr, roughness: 0.6, metalness: 0.5 }),
    lightOrange: new THREE.MeshStandardMaterial({ color: 0x552200, emissive: 0xff8800, emissiveIntensity: 2 }),
    lampW: new THREE.MeshStandardMaterial({ color: 0x777777, emissive: 0xfff2c0, emissiveIntensity: 0 }),
    water: new THREE.MeshStandardMaterial({ color: 0x2a7fa8, roughness: 0.05, metalness: 0.2 }),
    flame: new THREE.MeshBasicMaterial({ color: 0xff8a20, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false }),
    green: new THREE.MeshStandardMaterial({ color: 0x4f7a32, roughness: 1, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 }),
  };
}

export function buildLandmarks(scene, world, colliders, quality, cityInfo) {
  const group = new THREE.Group();
  group.name = 'landmarks';
  scene.add(group);
  const mats = makeMats();
  const kit = new Kit(colliders);
  const rand = mulberry32(99);
  const palms = [], olives = [], extras = { flags: [], lights: [], animated: [] };
  const H = (x, z) => world.height(x, z);
  const clearOfRoads = (x, z, m = 6) => !world.queryRoad(x, z) || world.rd > world.rhw + m;

  // =========================================================== PORT
  const PY = 4;
  for (const q of PORT_QUAYS) {
    const w = q.x1 - q.x0, l = q.z1 - q.z0;
    const g = new THREE.PlaneGeometry(w, l).rotateX(-Math.PI / 2);
    const uv = g.attributes.uv;
    for (let k = 0; k < uv.count; k++) uv.setXY(k, uv.getX(k) * w / 8, uv.getY(k) * l / 8);
    kit.mesh('tarmac', g, (q.x0 + q.x1) / 2, PY + 0.02, (q.z0 + q.z1) / 2);
    // murs de quai
    const wall = (x, z, sx, sz) => kit.box('concreteDark', x, -8, z, sx, PY + 8, sz, 0, { collide: false });
    wall((q.x0 + q.x1) / 2, q.z0, w, 1.2);
    wall(q.x0, (q.z0 + q.z1) / 2, 1.2, l);
    wall(q.x1, (q.z0 + q.z1) / 2, 1.2, l);
    // bordure / bollards
    for (let x = q.x0 + 5; x < q.x1 - 4; x += 18) kit.box('metal', x, PY, q.z0 + 1.2, 0.5, 0.6, 0.5, 0, { collide: false });
  }
  // conteneurs (terminal TC et Q4)
  const contColors = [0xc0392b, 0x2471a3, 0x229954, 0xd68910, 0x7d3c98, 0x839192, 0xe67e22, 0x1abc9c, 0xb03a2e, 0xf1c40f];
  const conts = [];
  const tc = PORT_QUAYS.find((q) => q.id === 'TC');
  for (let row = 0; row < 7; row++) {
    for (let col = 0; col < 14; col++) {
      if (rand() < 0.15) continue;
      const x = tc.x0 + 80 + col * 85, z = tc.z0 + 140 + row * 60;
      const stack = 1 + Math.floor(rand() * 4);
      for (let bay = 0; bay < 6; bay++) {
        const h = Math.max(1, stack - (bay % 3 === 2 ? 1 : 0));
        for (let s = 0; s < h; s++) conts.push([x + bay * 12.5, PY + s * 2.6, z, 0]);
        colliders.addBox({ c: [x + bay * 12.5, PY + h * 1.3, z], h: [6.1, h * 1.3, 1.22 * 2 + 0.1], surf: 5 });
      }
    }
  }
  // portiques (grues STS) au bord du terminal
  for (let k = 0; k < 4; k++) {
    const x = tc.x0 + 150 + k * 330, z = tc.z0 + 25;
    const m = k % 2 ? 'craneBlue' : 'craneRed';
    for (const dx of [-9, 9]) for (const dz of [-8, 8]) kit.box(m, x + dx, PY, z + dz, 1.6, 48, 1.6);
    kit.box(m, x, PY + 44, z, 22, 2.5, 18, 0, { collide: false });
    kit.box(m, x, PY + 46, z - 30, 6, 3, 110, 0, { collide: false });
    kit.box(m, x, PY + 52, z + 6, 3, 10, 3, 0, { collide: false });
    kit.box('white', x + 3, PY + 38, z + 6, 6, 4, 5, 0, { collide: false });
  }
  // navires à quai
  const ship = (x, z, len, yaw, color) => {
    const beam = len * 0.15;
    const shape = new THREE.Shape();
    shape.moveTo(-beam / 2, -len / 2); shape.lineTo(beam / 2, -len / 2); shape.lineTo(beam / 2, len * 0.32);
    shape.quadraticCurveTo(beam * 0.45, len * 0.48, 0, len / 2); shape.quadraticCurveTo(-beam * 0.45, len * 0.48, -beam / 2, len * 0.32);
    shape.closePath();
    const hullH = 14;
    const g = new THREE.ExtrudeGeometry(shape, { depth: hullH, bevelEnabled: false }).rotateX(Math.PI / 2).translate(0, hullH - 6, 0);
    kit.mesh(color, g, x, 0, z, yaw);
    const dx = Math.sin(yaw), dz = Math.cos(yaw);
    colliders.addBox({ c: [x, 1, z], h: [beam / 2, 7, len / 2], yaw, surf: 5 });
    // château + conteneurs sur le pont
    kit.box('white', x - dx * len * 0.38, hullH - 6, z - dz * len * 0.38, beam * 0.9, 16, 14, yaw);
    kit.box('busWin', x - dx * len * 0.38, hullH + 7, z - dz * len * 0.38, beam * 0.92, 2, 14.2, yaw, { collide: false });
    for (let s = -0.25; s < 0.36; s += 0.07) for (let c = -2; c <= 2; c++) {
      const h = 1 + Math.floor(rand() * 3);
      for (let t = 0; t < h; t++) conts.push([x + dx * len * s + Math.cos(yaw) * c * 2.5, hullH - 6 + t * 2.6, z + dz * len * s - Math.sin(yaw) * c * 2.5, yaw + Math.PI / 2]);
    }
  };
  ship(tc.x0 + 400, tc.z0 - 30, 210, Math.PI / 2, 'hull');
  ship(tc.x0 + 1050, tc.z0 - 30, 180, Math.PI / 2, 'hullRed');
  // ferry au quai Q1
  const q1 = PORT_QUAYS.find((q) => q.id === 'Q1');
  kit.box('white', q1.x1 + 22, -6, (q1.z0 + q1.z1) / 2 - 60, 26, 22, 150);
  kit.box('busWin', q1.x1 + 22, 12, (q1.z0 + q1.z1) / 2 - 60, 26.4, 2, 120, 0, { collide: false });
  kit.box('hull', q1.x1 + 22, -6, (q1.z0 + q1.z1) / 2 - 60, 26.2, 9, 150.2, 0, { collide: false });
  // phare de la jetée
  const jet = PORT_QUAYS.find((q) => q.id === 'JETEE');
  const lhx = jet.x0 + 30, lhz = (jet.z0 + jet.z1) / 2;
  kit.mesh('white', new THREE.CylinderGeometry(2.4, 3.8, 32, 16), lhx, PY + 16, lhz);
  kit.mesh('craneRed', new THREE.CylinderGeometry(2.5, 2.5, 3, 16), lhx, PY + 26, lhz);
  kit.mesh('glass', new THREE.CylinderGeometry(2, 2, 3, 12), lhx, PY + 33.5, lhz);
  kit.mesh('craneRed', new THREE.ConeGeometry(2.6, 2.5, 12), lhx, PY + 36.2, lhz);
  colliders.addCylinder(lhx, lhz, 3.8, PY, PY + 36, 5);
  const beacon = new THREE.Mesh(new THREE.ConeGeometry(14, 260, 16, 1, true).translate(0, 130, 0).rotateZ(Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xfff2c0, transparent: true, opacity: 0.12, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
  beacon.position.set(lhx, PY + 33.5, lhz);
  group.add(beacon);
  extras.beacon = beacon;
  // hangars du port
  for (let k = 0; k < 3; k++) kit.box('warehouse', -4200 + k * 210, PY, -9965, 120, 14, 36);
  // tremplin du port : bout du quai Q2 vers le nord, saut vers la jetée
  const q2 = PORT_QUAYS.find((q) => q.id === 'Q2');
  const rx = (q2.x0 + q2.x1) / 2;
  const kick = [];
  for (let i = 0; i <= 10; i++) { const a = (i / 10) * 0.36; kick.push([28 * Math.sin(a), 28 * (1 - Math.cos(a))]); }
  kit.ramp(rx, PY, q2.z0 + 34, Math.PI, 14, kick.map(([s, h]) => [s, h + 0]), {});
  kit.ramp(rx, PY, jet.z1 - 2, Math.PI, 18, [[0, 0], [6, 4.5], [36, 0]], { lipMat: null });
  extras.portRamp = { x: rx, z: q2.z0 + 34 - 9, yaw: Math.PI };

  // =========================================================== AÉROPORT
  const AY = regionY(world, 'airport');
  const R = AIRPORT.runway, T = AIRPORT.taxiway, A = AIRPORT.apron;
  {
    const len = R.x1 - R.x0;
    const g = new THREE.PlaneGeometry(len, R.w).rotateX(-Math.PI / 2);
    const uv = g.attributes.uv;
    for (let k = 0; k < uv.count; k++) { const u = uv.getX(k), v = uv.getY(k); uv.setXY(k, v, u * len / 120); }
    kit.mesh('runway', g, (R.x0 + R.x1) / 2, AY + 0.04, R.z);
    // bandes "piano" aux extrémités
    for (const xe of [R.x0 + 20, R.x1 - 20]) for (let k = -7; k <= 7; k++) if (k) kit.mesh('paint', new THREE.PlaneGeometry(30, 1.8).rotateX(-Math.PI / 2), xe, AY + 0.06, R.z + k * 3.6);
    // numéros
    for (const [xe, txt, ry] of [[R.x0 + 70, '09', -Math.PI / 2], [R.x1 - 70, '27', Math.PI / 2]]) {
      const t = textTexture(txt, { w: 256, h: 256, font: 'bold 200px Arial', color: '#f5f5f0' });
      const m = new THREE.Mesh(new THREE.PlaneGeometry(18, 18).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: t, transparent: true, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -6 }));
      m.rotation.y = ry; m.position.set(xe, AY + 0.07, R.z);
      group.add(m);
    }
    const tg = new THREE.PlaneGeometry(T.x1 - T.x0, T.w).rotateX(-Math.PI / 2);
    kit.mesh('tarmac', tg, (T.x0 + T.x1) / 2, AY + 0.03, T.z);
    kit.mesh('yellowPaint', new THREE.PlaneGeometry(T.x1 - T.x0, 0.4).rotateX(-Math.PI / 2), (T.x0 + T.x1) / 2, AY + 0.05, T.z);
    for (const x of [T.x0 + 100, (T.x0 + T.x1) / 2, T.x1 - 100]) kit.mesh('tarmac', new THREE.PlaneGeometry(T.w, T.z - R.z).rotateX(-Math.PI / 2), x, AY + 0.03, (T.z + R.z) / 2);
    kit.mesh('tarmac', new THREE.PlaneGeometry(A.x1 - A.x0, A.z1 - A.z0).rotateX(-Math.PI / 2), (A.x0 + A.x1) / 2, AY + 0.03, (A.z0 + A.z1) / 2);
    kit.mesh('tarmac', new THREE.PlaneGeometry(40, A.z0 - T.z).rotateX(-Math.PI / 2), (A.x0 + A.x1) / 2, AY + 0.03, (A.z0 + T.z) / 2);
    // feux de bord de piste
    for (let x = R.x0; x <= R.x1; x += 60) for (const sd of [-1, 1]) extras.lights.push([x, AY + 0.3, R.z + sd * (R.w / 2 + 1)]);
  }
  // terminal
  const TM = AIRPORT.terminal;
  {
    const cx = (TM.x0 + TM.x1) / 2, cz = (TM.z0 + TM.z1) / 2;
    kit.box('glass', cx, AY, cz, TM.x1 - TM.x0, 18, TM.z1 - TM.z0);
    const roof = new THREE.CylinderGeometry(120, 120, TM.x1 - TM.x0 + 20, 32, 1, false, -0.55, 1.1).rotateZ(Math.PI / 2);
    kit.mesh('white', roof, cx, AY + 18 - 120 * Math.cos(0.55) + 0.5, cz);
    kit.box('white', cx, AY + 18, cz, TM.x1 - TM.x0 + 20, 0.6, TM.z1 - TM.z0 + 30, 0, { collide: false });
    // passerelles
    for (let k = 0; k < 6; k++) kit.box('metal', TM.x0 + 120 + k * 220, AY + 5, TM.z0 - 25, 4, 3.5, 50, 0, { collide: false });
    const sign = textTexture('AÉROPORT D\'ALGER  مطار الجزائر', { w: 2048, h: 160, font: 'bold 110px Arial', color: '#ffffff', bg: '#0b6e3a' });
    const sm = new THREE.Mesh(new THREE.PlaneGeometry(160, 12.5), new THREE.MeshStandardMaterial({ map: sign, emissive: 0xffffff, emissiveMap: sign, emissiveIntensity: 0.3 }));
    sm.position.set(cx, AY + 22, TM.z1 + 15.5);
    group.add(sm);
  }
  // tour de contrôle
  {
    const { x, z } = AIRPORT.tower;
    kit.mesh('white', new THREE.CylinderGeometry(4, 5.5, 48, 16), x, AY + 24, z);
    kit.mesh('glass', new THREE.CylinderGeometry(9, 7, 6, 16), x, AY + 51, z);
    kit.mesh('white', new THREE.CylinderGeometry(10, 9, 2, 16), x, AY + 55, z);
    kit.mesh('metal', new THREE.CylinderGeometry(0.3, 0.3, 10, 6), x, AY + 61, z);
    colliders.addCylinder(x, z, 5.5, AY, AY + 56, 5);
  }
  // hangars
  for (let k = 0; k < 3; k++) {
    const x = 3500 + k * 260, z = -8700;
    const g = new THREE.CylinderGeometry(35, 35, 90, 24, 1, false, -Math.PI / 2, Math.PI).rotateX(Math.PI / 2).rotateY(Math.PI / 2);
    kit.mesh('corrugated', g, x, AY, z);
    colliders.addBox({ c: [x, AY + 15, z], h: [45, 15, 30], surf: 5 });
  }
  // avions
  const plane = (x, z, yaw, s = 1) => {
    const f = new THREE.CylinderGeometry(2.1 * s, 2.1 * s, 34 * s, 16).rotateX(Math.PI / 2);
    const nose = new THREE.SphereGeometry(2.1 * s, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2).rotateX(-Math.PI / 2).scale(1, 1, 1.8).translate(0, 0, -17 * s);
    const tail = new THREE.ConeGeometry(2.1 * s, 9 * s, 16).rotateX(Math.PI / 2).translate(0, 0.6 * s, 21.5 * s);
    const wing = new THREE.BoxGeometry(36 * s, 0.5 * s, 6 * s);
    const fin = new THREE.BoxGeometry(0.5 * s, 8 * s, 5 * s).translate(0, 5.5 * s, 22 * s);
    const stab = new THREE.BoxGeometry(13 * s, 0.4 * s, 3.5 * s).translate(0, 1.4 * s, 23 * s);
    const yA = 4.2 * s;
    for (const [g, m] of [[f, 'planeBody'], [nose, 'planeBody'], [tail, 'planeBody'], [wing, 'planeBody'], [stab, 'planeBody'], [fin, 'planeTail']]) kit.mesh(m, g, x, AY + yA, z, yaw);
    kit.mesh('planeGreen', new THREE.CylinderGeometry(2.13 * s, 2.13 * s, 30 * s, 16, 1, true, Math.PI * 0.42, Math.PI * 0.16).rotateX(Math.PI / 2), x, AY + yA, z, yaw);
    for (const sd of [-1, 1]) {
      const ex = Math.cos(yaw) * sd * 8 * s, ez = -Math.sin(yaw) * sd * 8 * s;
      kit.mesh('metal', new THREE.CylinderGeometry(1.2 * s, 1.1 * s, 4.5 * s, 12).rotateX(Math.PI / 2), x + ex, AY + yA - 1.4 * s, z + ez, yaw);
    }
    for (const [lx, lz] of [[0, -12], [-3, 2], [3, 2]]) {
      const wx = x + Math.cos(yaw) * lx * s + Math.sin(yaw) * lz * s, wz = z - Math.sin(yaw) * lx * s + Math.cos(yaw) * lz * s;
      kit.mesh('tire', new THREE.CylinderGeometry(0.6, 0.6, 0.5, 10).rotateZ(Math.PI / 2), wx, AY + 0.6, wz, yaw);
      kit.mesh('metal', new THREE.CylinderGeometry(0.15, 0.15, yA - 1.5, 6), wx, AY + (yA - 1.5) / 2 + 0.6, wz);
    }
    colliders.addBox({ c: [x, AY + yA, z], h: [2.1 * s, 2.1 * s, 21 * s], yaw, surf: 5 });
    colliders.addBox({ c: [x, AY + yA, z], h: [18 * s, 0.4 * s, 3 * s], yaw, surf: 5 });
  };
  for (let k = 0; k < 4; k++) plane(A.x0 + 260 + k * 380, A.z0 + 60, Math.PI, 1);
  plane(5200, T.z, -Math.PI / 2, 1);
  // tremplin de l'aéroport : bout de piste est, saut par-dessus un avion
  const kick2 = [];
  for (let i = 0; i <= 12; i++) { const a = (i / 12) * 0.38; kick2.push([34 * Math.sin(a), 34 * (1 - Math.cos(a))]); }
  kit.ramp(R.x1 - 140, AY, R.z, Math.PI / 2, 16, kick2, {});
  plane(R.x1 - 60, R.z, 0, 0.9);
  kit.ramp(R.x1 + 30, AY, R.z, Math.PI / 2, 22, [[0, 0], [8, 5.2], [14, 5.2], [50, 0]], { lipMat: null });
  extras.airportRamp = { x: R.x1 - 140, z: R.z, yaw: Math.PI / 2 };

  // =========================================================== MAQAM ECHAHID
  {
    const my = regionY(world, 'monument');
    const { x: cx, z: cz } = MONUMENT;
    const plaza = new THREE.CircleGeometry(125, 48).rotateX(-Math.PI / 2);
    const uv = plaza.attributes.uv;
    for (let k = 0; k < uv.count; k++) uv.setXY(k, uv.getX(k) * 30, uv.getY(k) * 30);
    kit.mesh('tarmac', plaza, cx, my + 0.05, cz);
    kit.mesh('whiteMarble', new THREE.CylinderGeometry(34, 36, 3, 48), cx, my + 1.5, cz);
    colliders.addBox({ c: [cx, my + 1.4, cz], h: [30, 1.5, 30], surf: 5 });
    // trois palmes
    const leafStations = 26;
    for (let k = 0; k < 3; k++) {
      const ang = (k / 3) * Math.PI * 2 + 0.3;
      const rdir = new THREE.Vector3(Math.cos(ang), 0, Math.sin(ang));
      const tdir = new THREE.Vector3(-Math.sin(ang), 0, Math.cos(ang));
      const pos = [], idx = [];
      for (let i = 0; i <= leafStations; i++) {
        const u = i / leafStations;
        const y = my + 3 + u * 89;
        const r = 14 * (1 - smooth(0, 0.7, u)) + 3.4 + Math.max(0, u - 0.78) * 14;
        const w = (6.5 * (1 - u * 0.55) + 2.5 * Math.sin(Math.PI * u)) / 2;
        const th = 1.1 + (1 - u) * 0.8;
        const c = new THREE.Vector3(cx, y, cz).addScaledVector(rdir, r);
        const corners = [[-w, -th], [w, -th], [w, th], [-w, th]];
        for (const [a, b] of corners) { const p = c.clone().addScaledVector(tdir, a).addScaledVector(rdir, b); pos.push(p.x, p.y, p.z); }
        if (i) for (let e = 0; e < 4; e++) {
          const a0 = (i - 1) * 4 + e, a1 = (i - 1) * 4 + ((e + 1) % 4), b0 = i * 4 + e, b1 = i * 4 + ((e + 1) % 4);
          idx.push(a0, b0, a1, a1, b0, b1);
        }
      }
      const top = leafStations * 4;
      idx.push(top, top + 1, top + 2, top, top + 2, top + 3);
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setIndex(idx);
      g.computeVertexNormals();
      kit.add('whiteMarble', g);
      colliders.addCylinder(cx + rdir.x * 16, cz + rdir.z * 16, 4, my, my + 30, 5);
    }
    // turban
    kit.mesh('whiteMarble', new THREE.CylinderGeometry(6.5, 6.5, 7, 24), cx, my + 3 + 0.7 * 89, cz);
    kit.mesh('whiteMarble', new THREE.TorusGeometry(6.6, 0.8, 8, 24).rotateX(Math.PI / 2), cx, my + 3 + 0.7 * 89 + 3, cz);
    // flamme éternelle
    const flame = new THREE.Mesh(new THREE.ConeGeometry(0.8, 2.6, 10, 1, true), mats.flame);
    flame.position.set(cx, my + 4.4, cz);
    group.add(flame);
    extras.animated.push((t) => { flame.scale.set(1 + Math.sin(t * 13) * 0.08, 1 + Math.sin(t * 9.3) * 0.15, 1 + Math.cos(t * 11) * 0.08); });
    kit.mesh('metal', new THREE.CylinderGeometry(1.4, 1.6, 1.2, 16), cx, my + 3.6, cz);
    extras.flags.push([cx + 60, my, cz + 40], [cx - 60, my, cz + 40]);
  }

  // =========================================================== DJAMAA EL DJAZAÏR
  {
    const bx = (i) => CITY.x0 + i * CITY.pitch + CITY.street / 2;
    const bz = (j) => CITY.z0 + j * CITY.pitch + CITY.street / 2;
    const Y = CITY.y + 0.16;
    // minaret (265 m)
    const mx = bx(34) + 50, mz = bz(1) + 50;
    kit.box('mosque', mx, Y, mz, 26, 230, 26);
    kit.box('mosque', mx, Y + 230, mz, 20, 22, 20);
    kit.mesh('dome', new THREE.SphereGeometry(8, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), mx, Y + 252, mz);
    kit.mesh('metal', new THREE.CylinderGeometry(0.4, 0.8, 12, 8), mx, Y + 265, mz);
    extras.minaretTop = new THREE.Vector3(mx, Y + 271, mz);
    // salle de prière + coupole
    const hx = bx(32) + 50, hz = bz(2) + 50;
    kit.box('mosque', hx, Y, hz, 88, 26, 88);
    kit.mesh('dome', new THREE.CylinderGeometry(24, 24, 8, 32), hx, Y + 30, hz);
    kit.mesh('dome', new THREE.SphereGeometry(24, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2), hx, Y + 34, hz);
    kit.mesh('metal', new THREE.CylinderGeometry(0.4, 0.4, 8, 6), hx, Y + 62, hz);
    // cours à arcades
    for (const i of [31, 33]) {
      const x = bx(i) + 50, z = bz(2) + 50;
      kit.box('mosque', x, Y, z - 40, 88, 12, 8); kit.box('mosque', x, Y, z + 40, 88, 12, 8);
    }
    for (const [i, j] of [[31, 1], [32, 1], [33, 1], [31, 3], [32, 3], [33, 3], [34, 2], [34, 3]]) {
      for (let k = 0; k < 6; k++) palms.push([bx(i) + 10 + k * 16, bz(j) + 50]);
    }
  }
  // Grande Poste, fontaine, coupole
  for (const lm of cityInfo.landmarks) {
    const Y = CITY.y + 0.16;
    if (lm.type === 'poste') {
      const cx = (lm.x0 + lm.x1) / 2, cz = (lm.z0 + lm.z1) / 2;
      kit.box('mosque', cx, Y, cz, lm.x1 - lm.x0, 22, lm.z1 - lm.z0, 0, { collide: false });
      for (const dx of [-20, 0, 20]) kit.mesh('dome', new THREE.SphereGeometry(dx ? 5 : 8, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), cx + dx, Y + 22, cz);
    } else if (lm.type === 'fountain') {
      kit.mesh('whiteMarble', new THREE.TorusGeometry(9, 0.8, 8, 32).rotateX(Math.PI / 2), lm.x, Y + 0.6, lm.z);
      kit.mesh('water', new THREE.CircleGeometry(9, 32).rotateX(-Math.PI / 2), lm.x, Y + 0.5, lm.z);
      kit.mesh('whiteMarble', new THREE.CylinderGeometry(0.8, 1.2, 4, 12), lm.x, Y + 2, lm.z);
      colliders.addCylinder(lm.x, lm.z, 9.5, Y, Y + 1.2, 5);
    } else if (lm.type === 'stadium') {
      kit.mesh('white', new THREE.CylinderGeometry(42, 44, 16, 40), lm.x - 60, Y + 8, lm.z - 60);
      kit.mesh('dome', new THREE.SphereGeometry(44, 40, 12, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.35, 1), lm.x - 60, Y + 16, lm.z - 60);
      colliders.addCylinder(lm.x - 60, lm.z - 60, 44, Y, Y + 30, 5);
    }
  }

  // =========================================================== STUNT PARK
  const SY = regionY(world, 'stunt');
  {
    const SP = STUNT_PARK;
    const g = new THREE.PlaneGeometry(SP.x1 - SP.x0, SP.z1 - SP.z0).rotateX(-Math.PI / 2);
    const uv = g.attributes.uv;
    for (let k = 0; k < uv.count; k++) uv.setXY(k, uv.getX(k) * (SP.x1 - SP.x0) / 10, uv.getY(k) * (SP.z1 - SP.z0) / 10);
    kit.mesh('tarmac', g, (SP.x0 + SP.x1) / 2, SY + 0.04, (SP.z0 + SP.z1) / 2);
    // looping (entrée inclinée de 6°)
    // plan de la boucle orienté nord ; l'approche est inclinée de 6° (hélice) pour sortir à côté de l'entrée
    const beta = 0.17;
    kit.loop(9800, SY, -4700, Math.PI, 12, 9, 56, 2 * Math.PI * 12 * Math.tan(beta));
    extras.loop = { x: 9800, z: -4700, yaw: beta };
    for (let k = 1; k < 10; k++) kit.mesh('yellowPaint', new THREE.PlaneGeometry(0.5, 6).rotateX(-Math.PI / 2), 9800 + Math.sin(beta) * k * 18, SY + 0.06, -4700 + Math.cos(beta) * k * 18, -beta);
    // kickers (petit, moyen, grand) + réceptions
    const kicker = (x, z, yaw, R, ang, w, gap, landH) => {
      const prof = [];
      for (let i = 0; i <= 10; i++) { const a = (i / 10) * ang; prof.push([R * Math.sin(a), R * (1 - Math.cos(a))]); }
      kit.ramp(x, SY, z, yaw, w, prof, {});
      const L0 = R * Math.sin(ang) + gap;
      const lx = x + Math.sin(yaw) * L0, lz = z + Math.cos(yaw) * L0;
      kit.ramp(lx, SY, lz, yaw, w + 4, [[0, landH], [12, landH], [12 + landH * 3.2, 0]], { lipMat: null });
    };
    kicker(10700, -5650, 0, 18, 0.42, 8, 24, 2.5);
    kicker(10900, -5650, 0, 26, 0.5, 9, 42, 4.5);
    kicker(11150, -5700, 0, 34, 0.56, 11, 70, 7);
    extras.kickers = [[10700, -5650], [10900, -5650], [11150, -5700]];
    // saut de bus
    const bz0 = -4950;
    const prof = [];
    for (let i = 0; i <= 10; i++) { const a = (i / 10) * 0.44; prof.push([30 * Math.sin(a), 30 * (1 - Math.cos(a))]); }
    kit.ramp(9500, SY, bz0, Math.PI / 2, 10, prof, {});
    for (let k = 0; k < 8; k++) {
      const x = 9540 + k * 2.9;
      kit.box('busGreen', x, SY + 0.4, bz0, 2.55, 2.9, 12);
      kit.box('busWin', x, SY + 2.0, bz0, 2.6, 1.0, 11.4, 0, { collide: false });
      kit.box('tire', x, SY, bz0 - 4, 2.6, 0.9, 1, 0, { collide: false });
      kit.box('tire', x, SY, bz0 + 4, 2.6, 0.9, 1, 0, { collide: false });
    }
    kit.ramp(9575, SY, bz0, Math.PI / 2, 14, [[0, 3.8], [8, 3.8], [22, 0]], { lipMat: null });
    // half-pipe
    const hp = [];
    for (let i = 0; i <= 12; i++) { const a = (i / 12) * 1.45; hp.push([9 * Math.sin(a), 9 * (1 - Math.cos(a))]); }
    kit.ramp(10350, SY, -4450, 0, 40, hp, { mat: 'concrete', lipMat: 'metal' });
    kit.ramp(10350, SY, -4530, Math.PI, 40, hp, { mat: 'concrete', lipMat: 'metal' });
    // mur de rotation (banked ring)
    kit.bankRing(10950, SY, -4800, 55, 0.95, 12, 72);
    // méga-rampe : montée d'accès, plate-forme, descente, kicker, réception
    const MY = 32;
    kit.ramp(9420, SY, -5550, Math.PI / 2, 12, [[0, 0], [320, MY]], { thick: 1.2, lipMat: null });
    const platX = 9740, platZ = -5525;
    kit.obb('concrete', new THREE.Vector3(platX + 25, SY + MY - 0.6, platZ), new THREE.Vector3(25, 0.6, 50), new THREE.Vector3(1, 0, 0), UP.clone(), new THREE.Vector3(0, 0, 1));
    for (let i = 0; i < 4; i++) kit.box('concreteDark', platX + 5 + i * 13, SY, platZ - 40 + (i % 2) * 80, 3, MY - 1.2, 3);
    for (let s = 20; s < 320; s += 40) kit.box('concreteDark', 9420 + s, SY, -5550, 2, s * MY / 320 - 1.2, 2, 0, { collide: false });
    // descente vers l'ouest (z = -5480)
    const dz = -5490;
    const drop = [];
    const Ld = 95;
    for (let i = 0; i <= 14; i++) { const s = (i / 14) * Ld; drop.push([s, MY * (1 - smooth(0, Ld, s))]); }
    drop.push([Ld + 40, 0]);
    for (let i = 1; i <= 10; i++) { const a = (i / 10) * 0.55; drop.push([Ld + 40 + 30 * Math.sin(a), 30 * (1 - Math.cos(a))]); }
    kit.ramp(platX, SY, dz, -Math.PI / 2, 12, drop, { thick: 1.4 });
    for (let s = 10; s < Ld - 10; s += 14) kit.box('concreteDark', platX - s, SY, dz, 2, Math.max(0.5, MY * (1 - smooth(0, Ld, s)) - 1.5), 2, 0, { collide: false });
    const kx = platX - (Ld + 40 + 30 * Math.sin(0.55));
    kit.ramp(kx - 45, SY, dz, -Math.PI / 2, 22, [[0, 6], [25, 6], [60, 0]], { lipMat: null });
    extras.megaPark = { x: 9420, z: -5550, yaw: Math.PI / 2 };
    // conteneurs décoratifs
    for (let k = 0; k < 18; k++) conts.push([11300 + (k % 3) * 2.6, SY + Math.floor(k / 9) * 2.6, -5000 + (k % 9) * 13, Math.PI / 2]);
    for (let k = 0; k < 3; k++) colliders.addBox({ c: [11300 + k * 2.6, SY + 2.6, -5000 + 52], h: [1.25, 2.6, 58], surf: 5 });
    // tribunes + drapeaux
    kit.box('concreteDark', 10400, SY, -5840, 180, 6, 14, 0);
    extras.flags.push([10300, SY, -5880], [10500, SY, -5880]);
  }

  // =========================================================== MÉGA TREMPLIN DU DÉSERT
  {
    const A2 = MEGA_RAMP_AREA;
    const x = A2.x0 + 700, z = (A2.z0 + A2.z1) / 2;
    const my = world.height(x, z);
    const prof = [[-40, 0]];
    for (let i = 0; i <= 14; i++) { const a = (i / 14) * 0.52; prof.push([60 * Math.sin(a), 60 * (1 - Math.cos(a))]); }
    kit.ramp(x, my, z, -Math.PI / 2, 18, prof, { mat: 'stone' });
    for (let k = 1; k <= 12; k++) {
      const px = x - 31 - k * 25;
      kit.box('craneRed', px, my, z - 14, 0.4, 3, 0.4, 0, { collide: false });
      kit.box('craneRed', px, my, z + 14, 0.4, 3, 0.4, 0, { collide: false });
      const t = textTexture(`${k * 25} m`, { w: 256, h: 96, font: 'bold 64px Arial', color: '#fff', bg: '#c8402a' });
      const sm = new THREE.Mesh(new THREE.PlaneGeometry(3, 1.1), new THREE.MeshStandardMaterial({ map: t, side: THREE.DoubleSide }));
      sm.position.set(px, my + 3.4, z + 14); sm.rotation.y = Math.PI / 2;
      group.add(sm);
    }
    extras.megaRamp = { x: x + 600, z, yaw: -Math.PI / 2, lipX: x - 30.8, y: my };
    extras.flags.push([x + 50, my, z - 25], [x + 50, my, z + 25]);
  }

  // =========================================================== GHARDAÏA (vallée du M'Zab)
  {
    const oy = regionY(world, 'oasis');
    const { x: cx, z: cz } = OASIS;
    // ksar : maisons ocre en cercles concentriques (colline artificielle)
    for (let ring = 0; ring < 9; ring++) {
      const r = 40 + ring * 22;
      const n = Math.floor((2 * Math.PI * r) / 14);
      for (let k = 0; k < n; k++) {
        const a = (k / n) * Math.PI * 2 + ring * 0.3;
        const x = cx + 180 + Math.cos(a) * r, z = cz - 120 + Math.sin(a) * r;
        if (!clearOfRoads(x, z, 10)) continue;
        if (rand() < 0.12) continue;
        const base = oy + Math.max(0, (8 - ring)) * 3.2;
        const w = 8 + rand() * 5, l = 8 + rand() * 5, h = 5 + rand() * 4;
        kit.box('mzab', x, oy, z, w, base - oy + h, l, a);
        kit.box('roofOchre', x, base + h, z, w, 0.3, l, a, { collide: false });
      }
    }
    // minaret de Ghardaïa (tronc pyramidal)
    const mx = cx + 180, mz = cz - 120, mb = oy + 8 * 3.2 + 5;
    kit.mesh('mzab', new THREE.CylinderGeometry(1.8, 3.6, 24, 4).rotateY(Math.PI / 4), mx, mb + 12, mz);
    for (let k = 0; k < 4; k++) {
      const a = k * Math.PI / 2;
      kit.mesh('mzab', new THREE.ConeGeometry(0.6, 2.5, 4), mx + Math.cos(a) * 1.4, mb + 25, mz + Math.sin(a) * 1.4);
    }
    colliders.addBox({ c: [cx + 180, oy + 15, cz - 120], h: [30, 15, 30], surf: 5 });
    // palmeraie
    for (let k = 0; k < 900; k++) {
      const a = rand() * Math.PI * 2, r = 250 + rand() * 520;
      const x = cx + Math.cos(a) * r - 120, z = cz + Math.sin(a) * r + 120;
      if (clearOfRoads(x, z, 5)) palms.push([x, z]);
    }
    // station-service
    station(kit, colliders, cx - 60, H(cx - 60, cz + 330), cz + 330, 0);
  }

  // =========================================================== BLIDA
  {
    const by = regionY(world, 'blida');
    for (let k = 0; k < 140; k++) {
      const x = BLIDA.x0 + 20 + rand() * (BLIDA.x1 - BLIDA.x0 - 40), z = BLIDA.z0 + 20 + rand() * (BLIDA.z1 - BLIDA.z0 - 40);
      if (!clearOfRoads(x, z, 9)) continue;
      const w = 10 + rand() * 10, l = 10 + rand() * 8, h = 6 + Math.floor(rand() * 3) * 3;
      kit.box(rand() < 0.6 ? 'casbah' : 'hlm', x, by, z, w, h, l, Math.floor(rand() * 2) * Math.PI / 2);
      kit.box('roof', x, by + h, z, w, 0.2, l, Math.floor(rand() * 2) * Math.PI / 2, { collide: false });
    }
    const mx = 520, mz = -4700;
    if (clearOfRoads(mx, mz, 12)) {
      kit.box('mosque', mx, by, mz, 6, 32, 6);
      kit.mesh('domeGreen', new THREE.SphereGeometry(3, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), mx, by + 32, mz);
      kit.box('mosque', mx + 20, by, mz, 24, 10, 24);
      kit.mesh('domeGreen', new THREE.SphereGeometry(8, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), mx + 20, by + 10, mz);
    }
    for (let k = 0; k < 400; k++) {
      const x = BLIDA.x0 - 300 + rand() * 1500, z = BLIDA.z0 - 300 + rand() * 1300;
      if (x > BLIDA.x0 && x < BLIDA.x1 && z > BLIDA.z0 && z < BLIDA.z1) continue;
      if (clearOfRoads(x, z, 6)) olives.push([x, z, 1]); // orangers
    }
    station(kit, colliders, 120, H(120, -4300), -4300, Math.PI / 2);
  }

  // =========================================================== TIPAZA (ruines romaines)
  {
    const p = POIS.find((q) => q.id === 'tipaza');
    for (let row = 0; row < 3; row++) for (let k = 0; k < 9; k++) {
      const x = p.x - 60 + k * 14, z = p.z - 20 + row * 22;
      const y = H(x, z);
      const h = rand() < 0.35 ? 2 + rand() * 3 : 7 + rand() * 2;
      kit.mesh('stone', new THREE.CylinderGeometry(0.7, 0.8, h, 10), x, y + h / 2, z);
      colliders.addCylinder(x, z, 0.8, y, y + h, 6);
    }
    for (let k = 0; k < 8; k++) {
      const x = p.x - 80 + rand() * 160, z = p.z - 50 + rand() * 100;
      kit.box('stone', x, H(x, z) - 0.5, z, 6 + rand() * 10, 1 + rand() * 2.5, 1.2, rand() * 3);
    }
  }

  // =========================================================== CHRÉA : belvédère
  {
    const [x, z] = NODES.CHREA;
    const y = H(x, z);
    kit.box('casbah', x + 30, y - 1, z - 10, 18, 7, 12);
    kit.box('roofOchre', x + 30, y + 6, z - 10, 19, 0.5, 13, 0, { collide: false });
    extras.flags.push([x - 20, y, z]);
  }

  // =========================================================== TASSILI : arches rocheuses
  for (let k = 0; k < 6; k++) {
    const x = 8200 + k * 900 + rand() * 300, z = 11000 + rand() * 1800;
    if (!clearOfRoads(x, z, 30)) continue;
    const y = H(x, z);
    const R = 18 + rand() * 14;
    const arch = new THREE.TorusGeometry(R, 4 + rand() * 2, 8, 20, Math.PI);
    kit.mesh('rock', arch, x, y - 2, z, rand() * 3);
    colliders.addCylinder(x + R * Math.cos(0), z, 5, y - 2, y + 12, 6);
  }

  // =========================================================== conteneurs instanciés
  const contGeo = new THREE.BoxGeometry(12.2, 2.6, 2.44).translate(0, 1.3, 0);
  const contMesh = new THREE.InstancedMesh(contGeo, mats.corrugated.clone(), conts.length);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion();
  conts.forEach(([x, y, z, yaw], k) => {
    q.setFromAxisAngle(UP, yaw);
    m4.compose(new THREE.Vector3(x, y, z), q, new THREE.Vector3(1, 1, 1));
    contMesh.setMatrixAt(k, m4);
    contMesh.setColorAt(k, new THREE.Color(contColors[k % contColors.length]));
  });
  contMesh.castShadow = true; contMesh.receiveShadow = true;
  group.add(contMesh);

  // feux de piste
  if (extras.lights.length) {
    const lm = new THREE.InstancedMesh(new THREE.BoxGeometry(0.4, 0.4, 0.4), mats.lampW, extras.lights.length);
    extras.lights.forEach(([x, y, z], k) => { m4.makeTranslation(x, y, z); lm.setMatrixAt(k, m4); });
    group.add(lm);
  }

  // drapeaux algériens
  const flagMat = makeFlagMaterial();
  for (const [x, y0, z] of extras.flags) {
    const y = y0 ?? H(x, z);
    kit.mesh('metal', new THREE.CylinderGeometry(0.12, 0.16, 14, 8), x, y + 7, z);
    const f = new THREE.Mesh(new THREE.PlaneGeometry(6, 4, 16, 6).translate(3, 0, 0), flagMat);
    f.position.set(x, y + 12, z);
    f.rotation.y = 0.6;
    group.add(f);
    colliders.addCylinder(x, z, 0.2, y, y + 14, 5);
  }

  kit.build(group, mats, { castShadow: quality !== 'low' });
  return {
    group, palms, olives, extras, mats, flagMat,
    update(t, night) {
      flagMat.uniforms.uTime.value = t;
      for (const f of extras.animated) f(t);
      if (extras.beacon) { extras.beacon.rotation.y = t * 0.8; extras.beacon.visible = night > 0.3; }
      mats.lampW.emissiveIntensity = night * 4;
      for (const k of ['mosque', 'haussmann', 'hlm', 'mzab', 'casbah', 'shop']) mats[k].emissiveIntensity = night * 1.4;
    },
  };
}

function smooth(a, b, x) { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); }

function station(kit, colliders, x, y, z, yaw) {
  kit.box('white', x, y + 5, z, 26, 0.8, 16, yaw, { collide: false });
  for (const dx of [-10, 10]) for (const dz of [-6, 6]) {
    const px = x + Math.cos(yaw) * dx + Math.sin(yaw) * dz, pz = z - Math.sin(yaw) * dx + Math.cos(yaw) * dz;
    kit.box('metal', px, y, pz, 0.5, 5, 0.5, yaw, { collide: false });
    colliders.addCylinder(px, pz, 0.35, y, y + 5, 5);
  }
  for (const dx of [-5, 5]) {
    const px = x + Math.cos(yaw) * dx, pz = z - Math.sin(yaw) * dx;
    kit.box('busGreen', px, y, pz, 1, 1.8, 0.6, yaw);
  }
  kit.box('glass', x + Math.sin(yaw) * 20, y, z + Math.cos(yaw) * 20, 14, 4, 9, yaw);
}

function makeFlagMaterial() {
  const c = document.createElement('canvas');
  c.width = 300; c.height = 200;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#006233'; ctx.fillRect(0, 0, 150, 200);
  ctx.fillStyle = '#ffffff'; ctx.fillRect(150, 0, 150, 200);
  ctx.fillStyle = '#d21034'; ctx.beginPath(); ctx.arc(150, 100, 50, 0, Math.PI * 2); ctx.fill();
  ctx.save(); ctx.beginPath(); ctx.rect(0, 0, 150, 200); ctx.clip(); ctx.fillStyle = '#006233'; ctx.beginPath(); ctx.arc(163, 100, 41, 0, Math.PI * 2); ctx.fill(); ctx.restore();
  ctx.save(); ctx.beginPath(); ctx.rect(150, 0, 150, 200); ctx.clip(); ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(163, 100, 41, 0, Math.PI * 2); ctx.fill(); ctx.restore();
  ctx.fillStyle = '#d21034'; ctx.beginPath();
  for (let k = 0; k < 10; k++) { const r = k % 2 ? 11 : 27, a = -Math.PI / 2 + (k * Math.PI) / 5 + Math.PI / 10; ctx.lineTo(178 + Math.cos(a) * r, 100 + Math.sin(a) * r); }
  ctx.fill();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return new THREE.ShaderMaterial({
    side: THREE.DoubleSide,
    uniforms: { map: { value: t }, uTime: { value: 0 } },
    vertexShader: `uniform float uTime; varying vec2 vUv; varying float vS;
      void main(){ vUv = uv; vec3 p = position; float k = p.x / 6.0;
        p.z += sin(p.x * 1.3 - uTime * 5.0) * 0.45 * k + sin(p.y * 2.0 + uTime * 3.0) * 0.1 * k;
        vS = 0.75 + 0.25 * cos(p.x * 1.3 - uTime * 5.0);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0); }`,
    fragmentShader: `uniform sampler2D map; varying vec2 vUv; varying float vS;
      void main(){ vec4 c = texture2D(map, vUv); gl_FragColor = vec4(c.rgb * vS, 1.0);
      #include <colorspace_fragment>
      }`,
  });
}

export { coastZ };
