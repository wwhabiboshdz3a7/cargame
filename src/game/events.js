// Épreuves : courses (sprint, circuit, contre-la-montre, drag, rallye), défis (stunt, saut, drift).
import * as THREE from 'three';
import { Path, AIDriver } from './ai.js';
import { Vehicle } from '../vehicle/vehicle.js';
import { CARS, defaultConfig, PAINTS, carStats } from '../vehicle/carDefs.js';
import { cityNode } from '../world/layout.js';
import { NODES } from '../world/roadsData.js';
import { STUNT_PARK, PORT_QUAYS, MEGA_RAMP_AREA } from '../world/layout.js';

export const EVENTS = [
  { id: 'sprint_a1', type: 'sprint', name: "Sprint de l'Autoroute Est-Ouest", region: 'Autoroute A1', nodes: ['J_A1_W', 'J_ALGER', 'J_RN1', 'J_AIRPORT'], opponents: 3, reward: [900000, 400000, 180000], desc: '17 km à fond sur l\'A1, de Miliana jusqu\'à l\'aéroport.' },
  { id: 'alger_circuit', type: 'circuit', name: "Grand Prix d'Alger", region: 'Alger Centre', loop: [cityNode(9, 1), cityNode(24, 1), cityNode(24, 6), cityNode(18, 6), cityNode(18, 10), cityNode(9, 10)], laps: 2, opponents: 3, reward: [1100000, 500000, 220000], desc: 'Circuit urbain sur le front de mer et les grands boulevards. 2 tours.' },
  { id: 'chiffa', type: 'sprint', name: 'Gorges de la Chiffa', region: 'Atlas Tellien', nodes: ['BLIDA', 'J_STEPPE'], opponents: 3, reward: [1300000, 600000, 250000], desc: 'Traversée de l\'Atlas par la RN1 : virages, cols et précipices.' },
  { id: 'chrea_hill', type: 'timetrial', name: 'Montée de Chréa', region: 'Forêt de Chréa', nodes: ['BLIDA', 'CHREA'], reward: [800000, 400000, 200000], pace: [30, 25, 20], desc: 'Contre-la-montre dans la forêt de cèdres jusqu\'au belvédère.' },
  { id: 'corniche', type: 'sprint', name: 'Corniche de Tipaza', region: 'Corniche', nodes: [cityNode(0, 1), 'CORN_W'], opponents: 3, reward: [800000, 380000, 160000], desc: 'Course le long de la Méditerranée, d\'Alger vers Tipaza.' },
  { id: 'transsaharienne', type: 'sprint', name: 'La Transsaharienne', region: 'Hauts Plateaux', nodes: ['J_STEPPE', 'GHARDAIA'], opponents: 3, reward: [1600000, 700000, 300000], desc: 'Des Hauts Plateaux jusqu\'à Ghardaïa : 7 km de ligne droite dans le Sahara.' },
  { id: 'tassili', type: 'sprint', name: 'Piste du Tassili', region: "Tassili n'Ajjer", nodes: ['GHARDAIA', 'TASSILI'], opponents: 3, reward: [1400000, 650000, 280000], desc: 'Course sur piste entre les canyons de grès rouge.' },
  { id: 'erg_rally', type: 'rally', name: 'Rallye du Grand Erg', region: 'Grand Erg Occidental', points: [[-4300, 10800], [-6200, 10300], [-8500, 9800], [-9800, 11200], [-8200, 12800], [-5800, 12400], [-4300, 11400]], opponents: 3, reward: [1500000, 700000, 300000], desc: 'Rallye hors-piste à travers les dunes. Suivez les balises !' },
  { id: 'drag_airport', type: 'drag', name: "Drag de l'aéroport", region: "Aéroport d'Alger", reward: [600000, 0, 0], desc: '1000 mètres en ligne droite sur la piste. Un seul adversaire, aucune pitié.' },
  { id: 'stunt_park', type: 'stunt', name: 'Défi Stunt Park', region: 'Stunt Park', duration: 90, targets: [25000, 12000, 5000], reward: [1000000, 500000, 200000], desc: '90 secondes pour marquer un maximum de points : looping, half-pipe, méga-rampe…' },
  { id: 'long_jump', type: 'longjump', name: 'Méga Saut du Grand Erg', region: 'Grand Erg Occidental', duration: 120, targets: [170, 120, 80], reward: [900000, 450000, 200000], desc: 'Le plus long saut possible depuis le méga tremplin des dunes.' },
  { id: 'drift_port', type: 'drift', name: 'Drift du Port', region: "Port d'Alger", duration: 75, targets: [9000, 5000, 2000], reward: [700000, 350000, 150000], desc: 'Dérapez entre les conteneurs du port d\'Alger.' },
];

const MEDALS = ['Or', 'Argent', 'Bronze'];

export class Events {
  constructor(game) {
    this.game = game;
    this.active = null;
    this.racing = false;
    this.markers = [];
    this.routes = {};
    this.group = new THREE.Group();
    game.scene.add(this.group);
    this.cpGroup = new THREE.Group();
    game.scene.add(this.cpGroup);
    this._buildMarkers();
    this._buildCheckpointMesh();
  }

  // ------------------------------------------------------------ itinéraires
  graphPath(names) {
    const w = this.game.world, G = w.graph;
    const edgesSeq = [];
    for (let k = 0; k < names.length - 1; k++) {
      const a = G.byName[names[k]], b = G.byName[names[k + 1]];
      if (a === undefined || b === undefined) { console.warn('noeud inconnu', names[k], names[k + 1]); continue; }
      const dist = new Map([[a, 0]]), prev = new Map();
      const open = [a];
      const done = new Set();
      while (open.length) {
        let bi = 0;
        for (let i = 1; i < open.length; i++) if (dist.get(open[i]) < dist.get(open[bi])) bi = i;
        const u = open.splice(bi, 1)[0];
        if (u === b) break;
        if (done.has(u)) continue;
        done.add(u);
        for (const eid of G.nodes[u].edges) {
          const e = G.edges[eid];
          const v = e.a === u ? e.b : e.a;
          const nd = dist.get(u) + e.len;
          if (nd < (dist.get(v) ?? Infinity)) { dist.set(v, nd); prev.set(v, [u, eid]); open.push(v); }
        }
      }
      const seq = [];
      let cur = b;
      while (cur !== a && prev.has(cur)) { const [u, eid] = prev.get(cur); seq.unshift({ eid, from: u }); cur = u; }
      edgesSeq.push(...seq);
    }
    const pts = [];
    for (const { eid, from } of edgesSeq) {
      const e = G.edges[eid];
      const r = w.roads[e.road];
      const fwd = e.a === from;
      const idx = [];
      for (let i = e.i0; i <= e.i1; i++) idx.push(i);
      if (!fwd) idx.reverse();
      for (const i of idx) {
        const last = pts[pts.length - 1];
        if (last && Math.hypot(last[0] - r.xs[i], last[1] - r.zs[i]) < 1) continue;
        pts.push([r.xs[i], r.zs[i], r.ys[i]]);
      }
    }
    return pts;
  }

  buildRoute(ev) {
    if (this.routes[ev.id]) return this.routes[ev.id];
    const w = this.game.world;
    let pts, closed = false;
    if (ev.nodes) pts = this.graphPath(ev.nodes);
    else if (ev.loop) { pts = this.graphPath([...ev.loop, ev.loop[0]]); closed = true; pts.pop(); }
    else if (ev.points) {
      pts = [];
      for (let k = 0; k < ev.points.length - 1; k++) {
        const [ax, az] = ev.points[k], [bx, bz] = ev.points[k + 1];
        const n = Math.ceil(Math.hypot(bx - ax, bz - az) / 10);
        for (let i = 0; i < n; i++) { const x = ax + (bx - ax) * i / n, z = az + (bz - az) * i / n; pts.push([x, z, w.height(x, z)]); }
      }
      const [lx, lz] = ev.points[ev.points.length - 1];
      pts.push([lx, lz, w.height(lx, lz)]);
    } else if (ev.type === 'drag') {
      pts = [];
      for (let x = 3650; x <= 4900; x += 10) pts.push([x, -9380 + 12, 0]);
    } else return null;
    // lissage des points (petits zigzags)
    const path = new Path(pts, closed);
    this.routes[ev.id] = path;
    return path;
  }

  startPos(ev) {
    if (ev.type === 'stunt') return { x: (STUNT_PARK.x0 + STUNT_PARK.x1) / 2, z: STUNT_PARK.z0 + 60, yaw: Math.PI };
    if (ev.type === 'longjump') return { x: MEGA_RAMP_AREA.x1 + 150, z: (MEGA_RAMP_AREA.z0 + MEGA_RAMP_AREA.z1) / 2, yaw: Math.PI / 2 };
    if (ev.type === 'drift') { const q = PORT_QUAYS.find((p) => p.id === 'TC'); return { x: q.x0 + 60, z: -10030, yaw: -Math.PI / 2 }; }
    const path = this.buildRoute(ev);
    const pt = path.pointAt(15, {});
    return { x: pt.x, z: pt.z, yaw: Math.atan2(-pt.tx, -pt.tz) };
  }

  // ------------------------------------------------------------ marqueurs dans le monde
  _buildMarkers() {
    const colors = { sprint: 0xffb703, circuit: 0xffb703, timetrial: 0x3a86ff, rally: 0xfb5607, drag: 0xff006e, stunt: 0x8338ec, longjump: 0x8338ec, drift: 0x06d6a0 };
    for (const ev of EVENTS) {
      const sp = this.startPos(ev);
      const col = colors[ev.type] || 0xffffff;
      const g = new THREE.Group();
      const beam = new THREE.Mesh(new THREE.CylinderGeometry(3.5, 3.5, 60, 24, 1, true), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
      beam.position.y = 30;
      const ring = new THREE.Mesh(new THREE.TorusGeometry(6, 0.25, 8, 40).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false }));
      ring.position.y = 0.3;
      g.add(beam, ring);
      const fx = sp.x + Math.sin(sp.yaw) * 0, fz = sp.z;
      g.position.set(fx, this.game.world.height(fx, fz), fz);
      this.group.add(g);
      this.markers.push({ ev, g, x: fx, z: fz, ring, beam, sp });
    }
  }

  _buildCheckpointMesh() {
    const mk = (opacity) => {
      const g = new THREE.Group();
      const m = new THREE.MeshBasicMaterial({ color: 0xffd23f, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
      const ring = new THREE.Mesh(new THREE.TorusGeometry(1, 0.035, 8, 48), m);
      g.add(ring);
      for (const sd of [-1, 1]) {
        const p = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 40, 10, 1, true), m);
        p.position.set(sd, 18, 0);
        p.scale.set(1 / 1, 1, 1);
        g.add(p);
      }
      g.userData.mat = m;
      g.visible = false;
      this.cpGroup.add(g);
      return g;
    };
    this.cpNext = mk(0.75);
    this.cpAfter = mk(0.25);
    const fm = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.6, side: THREE.DoubleSide });
    this.finishBanner = new THREE.Mesh(new THREE.PlaneGeometry(1, 1.5), fm);
    this.finishBanner.visible = false;
    this.cpGroup.add(this.finishBanner);
  }

  placeCheckpoint(g, cp, path) {
    if (!cp) { g.visible = false; return; }
    const pt = path.pointAt(cp.s, {});
    const w = this.game.world;
    const r = cp.r;
    g.visible = true;
    g.position.set(pt.x, Math.max(w.height(pt.x, pt.z), pt.y) + r * 0.55, pt.z);
    g.rotation.set(0, Math.atan2(pt.tx, pt.tz), 0);
    g.children[0].scale.set(r, r * 0.6, r);
    g.children[1].position.set(-r, 18 - r * 0.55, 0);
    g.children[2].position.set(r, 18 - r * 0.55, 0);
  }

  // ------------------------------------------------------------ interaction
  nearbyEvent() {
    if (this.active) return null;
    const p = this.game.player.phys.pos;
    for (const m of this.markers) if (Math.hypot(p.x - m.x, p.z - m.z) < 14) return m.ev;
    return null;
  }

  interact() {
    const ev = this.nearbyEvent();
    if (ev && this.game.player.phys.speed < 14) this.game.menus.showEventIntro(ev);
  }

  controlsFrozen() { return this.active && this.phase === 'countdown'; }
  carsFrozen() { return false; }

  // ------------------------------------------------------------ déroulement
  start(id) {
    const g = this.game;
    const ev = EVENTS.find((e) => e.id === id);
    if (!ev) return;
    this.abort(true);
    this.active = ev;
    this.phase = 'countdown';
    this.timer = 3.5;
    this.elapsed = 0;
    this.score = 0;
    this.best = 0;
    this.racers = [];
    this.aiVehicles = [];
    g.traffic.clear();
    g.traffic.enabled = false;
    g.stunts.cancel();
    const sp = this.startPos(ev);
    const isRace = ['sprint', 'circuit', 'timetrial', 'rally', 'drag'].includes(ev.type);
    if (isRace) {
      const path = this.buildRoute(ev);
      this.path = path;
      const total = path.length * (ev.laps || 1);
      // points de passage
      const spacing = ev.type === 'circuit' ? 220 : ev.type === 'rally' ? 0 : 380;
      this.cps = [];
      if (ev.type === 'rally') {
        for (let k = 1; k < ev.points.length; k++) {
          const pr = path.project(ev.points[k][0], ev.points[k][1]);
          this.cps.push({ s: pr.s, r: 22 });
        }
      } else {
        for (let lap = 0; lap < (ev.laps || 1); lap++) {
          for (let s = spacing; s < path.length - 40; s += spacing) this.cps.push({ s: s + lap * path.length, r: this.cpRadius(path, s) });
          this.cps.push({ s: path.length * (lap + 1) - (path.closed ? 0 : 5), r: this.cpRadius(path, path.length - 5) });
        }
        if (ev.type === 'drag') this.cps = [{ s: 1000 + 20, r: 40 }];
      }
      this.cpIndex = 0;
      this.total = total;
      // grille de départ
      const grid = ev.type === 'drag' ? [[20, -3.5], [20, 3.5]] : [[34, -2.6], [34, 2.6], [22, -2.6], [22, 2.6]];
      const n = ev.type === 'timetrial' ? 1 : ev.type === 'drag' ? 2 : Math.min(grid.length, (ev.opponents || 0) + 1);
      const playerSlot = n - 1;
      const pool = this.pickOpponents(n - 1);
      for (let k = 0; k < n; k++) {
        const [s0, lat] = grid[k];
        const pt = path.pointAt(s0, {});
        const yaw = Math.atan2(-pt.tx, -pt.tz);
        const x = pt.x + Math.cos(yaw) * lat, z = pt.z - Math.sin(yaw) * lat;
        const h = g.world.height(x, z);
        if (k === playerSlot) {
          g.player.place(x, h + 0.2, z, yaw);
          this.racers.push({ name: 'Vous', player: true, v: g.player, progress: 0, finished: false, idx: -1, lap: 0, prevS: 0 });
        } else {
          const car = pool[k];
          const cfg = { ...defaultConfig(car), color: PAINTS[(k * 5 + 3) % PAINTS.length], tires: car.phys.tires || (ev.type === 'rally' ? 'rally' : 'sport'), upgrades: { ...defaultConfig(car).upgrades, nitro: 1 } };
          const v = new Vehicle(g, car, cfg, { lowDetail: false, name: car.name });
          v.uid = g.newUid();
          v.place(x, h + 0.2, z, yaw);
          v.ai = new AIDriver(g, v, path, { skill: 0.93 + Math.random() * 0.08, lane: lat * 0.4, laps: ev.laps || 1 });
          v.ai.updateProgress();
          g.vehicles.push(v);
          this.aiVehicles.push(v);
          const names = ['Yacine', 'Amine', 'Sofiane', 'Karim', 'Nassim', 'Riyad', 'Lyna', 'Imane', 'Walid', 'Meriem'];
          this.racers.push({ name: names[(k * 3 + Math.floor(Math.random() * 7)) % names.length], car: car.name, v, ai: v.ai, finished: false });
        }
      }
      for (const v of [g.player, ...this.aiVehicles]) v.phys.frozen = true;
      g.cameraRig.reset();
      this.placeCheckpoint(this.cpNext, this.cps[0], path);
      this.placeCheckpoint(this.cpAfter, this.cps[1], path);
    } else {
      this.path = null;
      g.teleport(sp.x, sp.z, sp.yaw, false);
      g.player.phys.frozen = true;
      if (ev.type === 'stunt' || ev.type === 'longjump' || ev.type === 'drift') {
        this.unsub = g.stunts.onScore((pts, label, data) => this.onStunt(pts, label, data));
      }
    }
    this.racing = isRace;
    g.hud.eventStart(ev);
    g.audio.beep(440, 0.2);
  }

  cpRadius(path, s) {
    const pt = path.pointAt(s, {});
    const w = this.game.world;
    w.queryRoad(pt.x, pt.z);
    return w.rroad >= 0 ? Math.max(9, w.rhw + 5) : 14;
  }

  pickOpponents(n) {
    const g = this.game;
    const st = carStats(g.player.car, g.player.cfg);
    const score = (c) => { const s = carStats(c, defaultConfig(c)); return s.speed + s.accel; };
    const mine = st.speed + st.accel;
    const sorted = [...CARS].filter((c) => c.id !== 'buggy' || this.active.type === 'rally').sort((a, b) => Math.abs(score(a) - mine) - Math.abs(score(b) - mine));
    const pick = sorted.slice(0, Math.max(n + 1, 4));
    const res = [];
    for (let k = 0; k < n; k++) res.push(pick[(k + 1) % pick.length]);
    return [...res, null];
  }

  onStunt(pts, label, data) {
    const ev = this.active;
    if (!ev || this.phase !== 'running') return;
    if (ev.type === 'stunt') this.score += pts;
    if (ev.type === 'drift' && label === 'drift') this.score += Math.round(data.pts);
    if (ev.type === 'longjump' && label === 'jump') {
      if (data.dist > this.best) { this.best = data.dist; this.game.hud.notify(`Meilleur saut : ${data.dist.toFixed(1)} m`); }
      this.score = Math.round(this.best);
    }
  }

  preStep(dt) {
    if (!this.active) return;
    const g = this.game;
    if (this.phase === 'countdown') {
      const before = Math.ceil(this.timer);
      this.timer -= dt;
      const now = Math.ceil(this.timer);
      if (now !== before && now > 0 && now <= 3) { g.audio.beep(660, 0.15); g.hud.countdown(now); }
      if (this.timer <= 0) {
        this.phase = 'running';
        g.hud.countdown('GO !');
        g.audio.beep(1320, 0.4);
        for (const v of [g.player, ...this.aiVehicles]) v.phys.frozen = false;
      }
    }
  }

  update(dt) {
    const g = this.game;
    // marqueurs : animation + invite
    const p = g.player.phys.pos;
    for (const m of this.markers) {
      const d = Math.hypot(p.x - m.x, p.z - m.z);
      m.g.visible = !this.active && d < 2500;
      m.ring.rotation.z += dt;
      m.beam.material.opacity = 0.12 + 0.1 * Math.sin(g.time * 3);
    }
    const near = this.nearbyEvent();
    g.hud.prompt(near ? `${g.input.label('interact')} : ${near.name}` : null);
    if (!this.active || this.phase !== 'running') { if (this.active) this.updateHud(); return; }
    const ev = this.active;
    this.elapsed += dt;
    if (this.racing) {
      // progression du joueur
      const me = this.racers.find((r) => r.player);
      const pr = this.path.project(p.x, p.z, me.idx);
      me.idx = pr.i;
      if (this.path.closed) {
        const L = this.path.length;
        if (me.prevS > L * 0.8 && pr.s < L * 0.2) me.lap++;
        else if (me.prevS < L * 0.2 && pr.s > L * 0.8) me.lap--;
        me.prevS = pr.s;
      }
      me.progress = me.lap * this.path.length + pr.s;
      me.offRoute = pr.dist;
      // point de passage
      const cp = this.cps[this.cpIndex];
      if (cp) {
        const pt = this.path.pointAt(cp.s, {});
        if (Math.hypot(p.x - pt.x, p.z - pt.z) < cp.r + 3 || me.progress > cp.s + 20) {
          this.cpIndex++;
          this.lastCp = { x: pt.x, z: pt.z, yaw: Math.atan2(-pt.tx, -pt.tz), s: cp.s };
          g.audio.checkpoint();
          if (this.cpIndex >= this.cps.length) return this.finishRace();
          this.placeCheckpoint(this.cpNext, this.cps[this.cpIndex], this.path);
          this.placeCheckpoint(this.cpAfter, this.cps[this.cpIndex + 1], this.path);
        }
      }
      // IA : arrivée + élastique
      for (const r of this.racers) {
        if (!r.ai) continue;
        if (!r.finished && r.ai.progress >= this.total - 5) { r.finished = true; r.ai.finished = true; r.time = this.elapsed; }
        const gap = me.progress - r.ai.progress;
        r.v.phys.boost = Math.max(0.85, Math.min(1.3, 1 + gap / 900 * 0.3));
        r.progress = r.ai.progress;
      }
      if (ev.type === 'timetrial') {
        const gold = this.total / ev.pace[0];
        if (this.elapsed > gold * 2.2) this.finishRace(true);
      }
    } else {
      this.timer = ev.duration - this.elapsed;
      if (ev.type === 'drift') {
        const inPort = p.z < -9950 && p.x > -5400 && p.x < -1600;
        if (!inPort && this.elapsed > 3) g.hud.notify('Restez dans le port !');
      }
      if (this.timer <= 0) this.finishChallenge();
    }
    this.updateHud();
  }

  updateHud() {
    const g = this.game;
    const ev = this.active;
    if (!ev) return;
    if (this.racing) {
      const sorted = [...this.racers].sort((a, b) => (b.finished - a.finished) || (a.finished && b.finished ? a.time - b.time : b.progress - a.progress));
      const pos = sorted.findIndex((r) => r.player) + 1;
      g.hud.raceInfo({
        name: ev.name, pos, count: this.racers.length, time: this.elapsed,
        lap: ev.laps ? Math.min(ev.laps, Math.floor((this.racers.find((r) => r.player).progress) / this.path.length) + 1) : null, laps: ev.laps,
        cp: this.cpIndex, cps: this.cps.length, standings: sorted.map((r) => r.name),
      });
    } else {
      g.hud.challengeInfo({ name: ev.name, time: Math.max(0, this.phase === 'countdown' ? ev.duration : this.timer), score: this.score, targets: ev.targets, unit: ev.type === 'longjump' ? 'm' : 'pts' });
    }
  }

  // réinitialisation pendant une course : retour au dernier point de passage
  handleReset() {
    if (!this.racing || !this.lastCp) return false;
    const g = this.game;
    const c = this.lastCp;
    g.player.place(c.x, g.world.height(c.x, c.z) + 0.3, c.z, c.yaw);
    return true;
  }

  finishRace(timeout = false) {
    const g = this.game;
    const ev = this.active;
    const me = this.racers.find((r) => r.player);
    me.finished = !timeout;
    me.time = this.elapsed;
    // estimation pour l'IA non arrivée
    for (const r of this.racers) {
      if (r.ai && !r.finished) {
        const avg = Math.max(8, r.ai.progress / Math.max(1, this.elapsed));
        r.time = this.elapsed + (this.total - r.ai.progress) / avg;
      }
    }
    const sorted = [...this.racers].sort((a, b) => a.time - b.time);
    let pos = sorted.indexOf(me) + 1;
    let medal = null, reward = 0;
    if (ev.type === 'timetrial') {
      const t = me.time;
      const goals = ev.pace.map((v) => this.total / v);
      const m = timeout ? -1 : goals.findIndex((gl) => t <= gl);
      medal = m >= 0 ? m : null;
      reward = medal !== null ? ev.reward[medal] : 0;
      pos = medal !== null ? medal + 1 : 0;
    } else if (!timeout) {
      reward = pos <= 3 ? (ev.reward[pos - 1] || 0) : 0;
      medal = pos <= 3 && reward ? pos - 1 : null;
    }
    const prevBest = g.save.data.records[ev.id];
    const newRecord = !timeout && (!prevBest || me.time < prevBest);
    if (newRecord) g.save.data.records[ev.id] = me.time;
    if (medal !== null) {
      const prev = g.save.data.medals[ev.id];
      if (prev === undefined || medal < prev) g.save.data.medals[ev.id] = medal;
    }
    g.save.data.stats.races++;
    if (pos === 1) g.save.data.stats.wins++;
    if (reward) g.save.addMoney(reward);
    g.save.persist();
    if (reward) g.audio.success(); else g.audio.fail();
    const result = {
      ev, pos, medal: medal !== null ? MEDALS[medal] : null, reward, time: me.time, newRecord, best: g.save.data.records[ev.id],
      standings: sorted.map((r) => ({ name: r.name, car: r.player ? g.player.car.name : r.car, time: r.time, player: !!r.player })),
      goals: ev.type === 'timetrial' ? ev.pace.map((v) => this.total / v) : null,
    };
    this.end();
    g.menus.showResults(result);
  }

  finishChallenge() {
    const g = this.game;
    const ev = this.active;
    const m = ev.targets.findIndex((t) => this.score >= t);
    const medal = m >= 0 ? m : null;
    const reward = medal !== null ? ev.reward[medal] : 0;
    const prev = g.save.data.records[ev.id] || 0;
    const newRecord = this.score > prev;
    if (newRecord) g.save.data.records[ev.id] = this.score;
    if (medal !== null) {
      const pm = g.save.data.medals[ev.id];
      if (pm === undefined || medal < pm) g.save.data.medals[ev.id] = medal;
    }
    if (reward) { g.save.addMoney(reward); g.audio.success(); } else g.audio.fail();
    g.save.persist();
    const result = { ev, score: this.score, unit: ev.type === 'longjump' ? 'm' : 'pts', medal: medal !== null ? MEDALS[medal] : null, reward, newRecord, best: g.save.data.records[ev.id], targets: ev.targets };
    this.end();
    g.menus.showResults(result);
  }

  end() {
    const g = this.game;
    for (const v of this.aiVehicles) { v.dispose(); }
    g.vehicles = g.vehicles.filter((v) => !this.aiVehicles.includes(v));
    this.aiVehicles = [];
    this.racers = [];
    this.active = null;
    this.racing = false;
    this.phase = null;
    this.cpNext.visible = false;
    this.cpAfter.visible = false;
    if (this.unsub) { this.unsub(); this.unsub = null; }
    g.player.phys.frozen = false;
    g.player.phys.boost = 1;
    g.traffic.enabled = true;
    g.hud.eventEnd();
  }

  abort(silent = false) {
    if (!this.active) return;
    this.end();
    if (!silent) this.game.hud.notify('Épreuve abandonnée');
  }
}

export { NODES };
