// Trafic : véhicules cinématiques suivant les voies du graphe routier, basculant en physique près du joueur.
import * as THREE from 'three';
import { Vehicle } from '../vehicle/vehicle.js';
import { CAR_BY_ID, defaultConfig } from '../vehicle/carDefs.js';
import { ROAD_TYPES } from '../world/roadsData.js';

const TRAFFIC_CARS = ['atlas', 'atlas', 'taxi', 'kasbah', 'hoggar', 'cruiser', 'atlas', 'taxi', 'police', 'gt'];
const COLORS = ['#f5f6f8', '#c9ccd1', '#6b7076', '#111214', '#8a1020', '#1d4fa0', '#d9c49a', '#2f3a33', '#f5f6f8', '#39a7d6'];
const UP = new THREE.Vector3(0, 1, 0);

export class Traffic {
  constructor(game) {
    this.game = game;
    this.cars = [];
    this.pool = [];
    this.enabled = true;
    this.max = 18;
    const w = game.world;
    // arêtes utilisables
    this.edges = w.graph.edges.filter((e) => { const t = w.roads[e.road].type; return t !== 'piste'; });
    this.edgeSet = new Set(this.edges);
    // points d'ancrage tous les ~60 m (grille spatiale de 250 m)
    this.anchors = new Map();
    for (const e of this.edges) {
      const r = w.roads[e.road];
      for (let s = 10; s < e.len - 10; s += 60) {
        const sAbs = r.ss[e.i0] + s;
        let i = e.i0;
        while (i < e.i1 && r.ss[i + 1] < sAbs) i++;
        const x = r.xs[i], z = r.zs[i];
        const k = Math.floor(x / 250) * 1000 + Math.floor(z / 250);
        if (!this.anchors.has(k)) this.anchors.set(k, []);
        this.anchors.get(k).push({ e, s, x, z });
      }
    }
    this.timer = 0;
  }

  setDensity(level, quality) {
    const base = { off: 0, low: 8, medium: 18, high: 30 }[level] ?? 18;
    this.max = Math.round(base * (quality === 'low' ? 0.6 : 1));
    while (this.cars.length > this.max) this.despawn(this.cars[this.cars.length - 1]);
  }

  clear() { for (const c of [...this.cars]) this.despawn(c); }

  getVehicle() {
    let v = this.pool.pop();
    if (!v) {
      const id = TRAFFIC_CARS[Math.floor(Math.random() * TRAFFIC_CARS.length)];
      const car = CAR_BY_ID[id];
      const cfg = { ...defaultConfig(car), color: id === 'taxi' ? car.color : COLORS[Math.floor(Math.random() * COLORS.length)] };
      v = new Vehicle(this.game, car, cfg, { lowDetail: true });
      v.uid = this.game.newUid();
      v.traffic = true;
    } else this.game.scene.add(v.root);
    v.root.visible = true;
    return v;
  }

  laneOffset(road, lane) {
    const t = ROAD_TYPES[road.type];
    return t.medianHalf + t.laneWidth * (lane + 0.5);
  }

  // position sur une arête : s mesuré dans le sens de circulation
  edgePose(c, out) {
    const w = this.game.world;
    const e = c.edge, r = w.roads[e.road];
    const L = e.len;
    const sAbs = c.dir > 0 ? r.ss[e.i0] + c.s : r.ss[e.i1] - c.s;
    let lo = e.i0, hi = e.i1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (r.ss[m] <= sAbs) lo = m; else hi = m; }
    const seg = r.ss[hi] - r.ss[lo] || 1;
    const t = Math.min(1, Math.max(0, (sAbs - r.ss[lo]) / seg));
    let tx = (r.xs[hi] - r.xs[lo]) / seg, tz = (r.zs[hi] - r.zs[lo]) / seg;
    if (c.dir < 0) { tx = -tx; tz = -tz; }
    const off = this.laneOffset(r, c.lane);
    out.x = r.xs[lo] + (r.xs[hi] - r.xs[lo]) * t + -tz * off;
    out.z = r.zs[lo] + (r.zs[hi] - r.zs[lo]) * t + tx * off;
    out.y = r.ys[lo] + (r.ys[hi] - r.ys[lo]) * t;
    out.tx = tx; out.tz = tz;
    out.L = L;
    return out;
  }

  spawn() {
    const g = this.game;
    const p = g.player.phys.pos;
    const cx = Math.floor(p.x / 250), cz = Math.floor(p.z / 250);
    const cand = [];
    for (let dz = -3; dz <= 3; dz++) for (let dx = -3; dx <= 3; dx++) {
      const list = this.anchors.get((cx + dx) * 1000 + (cz + dz));
      if (!list) continue;
      for (const a of list) {
        const d = Math.hypot(a.x - p.x, a.z - p.z);
        if (d > 170 && d < 720) cand.push(a);
      }
    }
    for (let tries = 0; tries < 6 && cand.length; tries++) {
      const a = cand[Math.floor(Math.random() * cand.length)];
      const e = a.e;
      const r = g.world.roads[e.road];
      const lanes = ROAD_TYPES[r.type].lanes;
      const dir = Math.random() < 0.5 ? 1 : -1;
      const c = { edge: e, dir, lane: Math.floor(Math.random() * lanes), s: dir > 0 ? a.s : e.len - a.s, speed: 0, mode: 'kin', pose: {} };
      this.edgePose(c, c.pose);
      if (this.cars.some((o) => o.edge === e && o.dir === c.dir && o.lane === c.lane && Math.abs(o.s - c.s) < 30)) continue;
      const vmax = ROAD_TYPES[r.type].speed;
      c.v0 = vmax * (0.8 + Math.random() * 0.3);
      c.speed = c.v0 * 0.8;
      c.v = this.getVehicle();
      c.v.lightsOn = g.atmosphere.night > 0.5;
      this.cars.push(c);
      this.placeKinematic(c);
      return;
    }
  }

  despawn(c) {
    const g = this.game;
    if (c.mode !== 'kin') g.vehicles = g.vehicles.filter((v) => v !== c.v);
    c.v.root.visible = false;
    g.scene.remove(c.v.root);
    c.v.ai = null;
    this.pool.push(c.v);
    this.cars = this.cars.filter((o) => o !== c);
  }

  nextEdge(c) {
    const w = this.game.world;
    const G = w.graph;
    const e = c.edge;
    const nodeId = c.dir > 0 ? e.b : e.a;
    const node = G.nodes[nodeId];
    const options = node.edges.map((id) => G.edges[id]).filter((o) => o !== e && this.edgeSet.has(o));
    if (!options.length) { // demi-tour
      c.dir = -c.dir; c.s = 0;
      return;
    }
    // préfère continuer sur la même route
    let next = options.find((o) => o.road === e.road && Math.random() < 0.7) || options[Math.floor(Math.random() * options.length)];
    c.edge = next;
    c.dir = next.a === nodeId ? 1 : -1;
    const lanes = ROAD_TYPES[w.roads[next.road].type].lanes;
    c.lane = Math.min(c.lane, lanes - 1);
    c.s = 0;
  }

  placeKinematic(c) {
    const v = c.v;
    const pose = c.pose;
    const yaw = Math.atan2(-pose.tx, -pose.tz);
    v.root.position.set(pose.x, pose.y + v.phys.cgHeight, pose.z);
    v.root.quaternion.setFromAxisAngle(UP, yaw);
    v.phys.pos.copy(v.root.position);
    v.phys.quat.copy(v.root.quaternion);
    v.phys.updateFrame();
    v.phys.vel.set(-Math.sin(yaw) * c.speed, 0, -Math.cos(yaw) * c.speed);
    for (let i = 0; i < 4; i++) {
      const w = v.phys.wheels[i], m = v.model.wheels[i];
      w.angle = (w.angle + c.speed / w.R * 0.016) % (Math.PI * 2);
      m.holder.position.set(w.local.x, w.local.y - (v.phys.rest - 0.06), w.local.z);
      m.holder.rotation.y = 0;
      m.spin.rotation.x = m.left ? w.angle : -w.angle;
    }
    v.model.lightMats.tail.emissiveIntensity = c.braking ? 2.5 : v.lightsOn ? 0.8 : 0.1;
    v.model.lightMats.head.emissiveIntensity = v.lightsOn ? 2.5 : 0.1;
  }

  // bascule en mode physique (contact possible avec le joueur)
  toPhysics(c) {
    const g = this.game;
    c.mode = 'phys';
    const v = c.v;
    v.phys.angVel.set(0, 0, 0);
    v.phys.frozen = false;
    v.prevPos.copy(v.phys.pos); v.prevQuat.copy(v.phys.quat);
    for (const w of v.phys.wheels) { w.comp = w.prevComp = 0.05; }
    v.ai = { control: (dt) => this.physControl(c, dt) };
    g.vehicles.push(v);
    c.crashT = 0;
  }

  physControl(c, dt) {
    const v = c.v, p = v.phys, ctl = p.controls;
    if (c.crashed) { ctl.throttle = 0; ctl.brake = 0.8; ctl.steer = 0; return; }
    if (p.impact > 2.5 || p.up.y < 0.7) { c.crashed = true; return; }
    // suivi de voie
    c.s += Math.max(0, p.vel.x * c.pose.tx + p.vel.z * c.pose.tz) * dt;
    if (c.s >= c.edge.len) { c.s -= c.edge.len; this.nextEdge(c); }
    this.edgePose(c, c.pose);
    const pr = c.pose;
    const look = 8 + p.speed * 0.5;
    const tx = pr.x + pr.tx * look, tz = pr.z + pr.tz * look;
    const dx = tx - p.pos.x, dz = tz - p.pos.z;
    const ang = Math.atan2(dx * p.right.x + dz * p.right.z, dx * p.fwd.x + dz * p.fwd.z);
    ctl.steer = Math.max(-1, Math.min(1, -ang * 2));
    const target = c.blocked ? 0 : c.v0;
    ctl.throttle = p.speed < target - 1 ? 0.7 : 0;
    ctl.brake = p.speed > target + 2 || c.blocked ? 0.6 : 0;
    ctl.handbrake = 0; ctl.nitro = 0;
  }

  step() { /* le mouvement est géré dans update() ; la physique via game.vehicles */ }

  update(dt) {
    const g = this.game;
    if (!this.enabled || this.max === 0) { if (this.cars.length) this.clear(); return; }
    const pp = g.player.phys.pos;
    const pv = g.player.phys.vel;
    this.timer -= dt;
    if (this.timer <= 0 && this.cars.length < this.max) { this.spawn(); this.timer = 0.15; }
    const pose = {};
    for (const c of [...this.cars]) {
      const d = Math.hypot(c.v.phys.pos.x - pp.x, c.v.phys.pos.z - pp.z);
      if (d > 950 || (c.crashed && d > 120)) { this.despawn(c); continue; }
      if (c.mode === 'kin') {
        // leader : voiture devant sur la même voie
        let gap = 1e9, leadV = 0;
        for (const o of this.cars) {
          if (o === c || o.edge !== c.edge || o.dir !== c.dir || o.lane !== c.lane) continue;
          const ds = o.s - c.s;
          if (ds > 0 && ds < gap) { gap = ds; leadV = o.speed; }
        }
        // le joueur comme obstacle
        const fx = c.pose.tx, fz = c.pose.tz;
        const rx = pp.x - c.pose.x, rz = pp.z - c.pose.z;
        const along = rx * fx + rz * fz, lat = Math.abs(-rx * fz + rz * fx);
        if (along > 0 && along < 45 && lat < 2.8) { if (along < gap) { gap = along; leadV = Math.max(0, pv.x * fx + pv.z * fz); } }
        let target = c.v0;
        if (gap < 1e8) target = Math.min(target, Math.max(0, (gap - 9) / 1.3 + leadV * 0.3));
        const a = target > c.speed ? 2.2 : -7;
        c.braking = target < c.speed - 0.5;
        c.speed = Math.max(0, c.speed + Math.sign(target - c.speed) * Math.min(Math.abs(target - c.speed), Math.abs(a) * dt));
        c.s += c.speed * dt;
        if (c.s >= c.edge.len) { c.s -= c.edge.len; this.nextEdge(c); }
        this.edgePose(c, c.pose);
        this.placeKinematic(c);
        // frôlement
        if (d < 3.6 && !c.nearMiss && g.player.phys.speed > 18) {
          c.nearMiss = true;
          c.nmCheck = 0.4;
        }
        if (c.nmCheck !== undefined) {
          c.nmCheck -= dt;
          if (c.nmCheck <= 0) { if (!c.touched) g.stunts.nearMiss(Math.abs(g.player.phys.speed - c.speed * 0.5)); c.nmCheck = undefined; }
        }
        if (d > 25) { c.nearMiss = false; c.touched = false; }
        if (d < 9.5) this.toPhysics(c);
      } else {
        // en mode physique : contact ?
        if (c.v.phys.impact > 1.5) c.touched = true;
        c.blocked = false;
        const rx = pp.x - c.v.phys.pos.x, rz = pp.z - c.v.phys.pos.z;
        const along = rx * c.v.phys.fwd.x + rz * c.v.phys.fwd.z;
        if (along > 0 && along < 14 && Math.abs(rx * c.v.phys.right.x + rz * c.v.phys.right.z) < 2.6) c.blocked = true;
        // retour en cinématique si loin et intact
        if (!c.crashed && d > 30) {
          const pr = g.world.nearestRoadPoint(c.v.phys.pos.x, c.v.phys.pos.z, 30);
          g.vehicles = g.vehicles.filter((v) => v !== c.v);
          c.mode = 'kin';
          c.v.ai = null;
          c.speed = Math.max(4, c.v.phys.speed);
          if (!pr) { this.despawn(c); continue; }
        }
        if (c.crashed) {
          c.crashT += dt;
          // feux de détresse
          const on = Math.floor(g.time * 2) % 2 === 0;
          c.v.model.lightMats.tail.emissiveIntensity = on ? 3 : 0.1;
        }
      }
    }
  }
}
