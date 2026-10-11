// Trajectoires de course + pilote IA.
import * as THREE from 'three';

export class Path {
  constructor(points, closed = false) {
    // points : [[x, z, y], ...] densifiés
    const n = points.length;
    this.n = n;
    this.closed = closed;
    this.x = new Float64Array(n); this.z = new Float64Array(n); this.y = new Float64Array(n); this.s = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      this.x[i] = points[i][0]; this.z[i] = points[i][1]; this.y[i] = points[i][2] ?? 0;
      if (i) this.s[i] = this.s[i - 1] + Math.hypot(this.x[i] - this.x[i - 1], this.z[i] - this.z[i - 1]);
    }
    this.length = this.s[n - 1] + (closed ? Math.hypot(this.x[0] - this.x[n - 1], this.z[0] - this.z[n - 1]) : 0);
    // courbure (variation de cap par mètre, lissée sur ±15 m)
    this.k = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const a = this.indexAt(this.s[i] - 15), b = this.indexAt(this.s[i] + 15);
      const h1 = Math.atan2(this.x[i] - this.x[a], this.z[i] - this.z[a]);
      const h2 = Math.atan2(this.x[b] - this.x[i], this.z[b] - this.z[i]);
      let d = h2 - h1;
      d = ((d + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
      this.k[i] = Math.abs(d) / 30;
    }
  }

  wrap(s) { return this.closed ? ((s % this.length) + this.length) % this.length : Math.max(0, Math.min(this.s[this.n - 1], s)); }

  indexAt(s) {
    s = this.wrap(s);
    let lo = 0, hi = this.n - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (this.s[m] <= s) lo = m; else hi = m; }
    return lo;
  }

  pointAt(s, out = {}) {
    s = this.wrap(s);
    const i = this.indexAt(s);
    const j = i + 1 < this.n ? i + 1 : (this.closed ? 0 : i);
    const seg = (j > i ? this.s[j] : this.length) - this.s[i] || 1;
    const t = Math.min(1, Math.max(0, (s - this.s[i]) / seg));
    out.x = this.x[i] + (this.x[j] - this.x[i]) * t;
    out.z = this.z[i] + (this.z[j] - this.z[i]) * t;
    out.y = this.y[i] + (this.y[j] - this.y[i]) * t;
    const dx = this.x[j] - this.x[i], dz = this.z[j] - this.z[i];
    const L = Math.hypot(dx, dz) || 1;
    out.tx = dx / L; out.tz = dz / L;
    out.i = i;
    return out;
  }

  curvatureAt(s) { return this.k[this.indexAt(s)]; }

  // projection d'un point (recherche locale autour de hint)
  project(x, z, hint = -1, win = 60) {
    let best = -1, bd = Infinity, bt = 0;
    const scan = (i0, i1) => {
      for (let k = i0; k <= i1; k++) {
        const i = this.closed ? ((k % this.n) + this.n) % this.n : k;
        if (i < 0 || i >= this.n - (this.closed ? 0 : 1)) continue;
        const j = i + 1 < this.n ? i + 1 : 0;
        const ax = this.x[i], az = this.z[i], dx = this.x[j] - ax, dz = this.z[j] - az;
        const L2 = dx * dx + dz * dz || 1;
        let t = ((x - ax) * dx + (z - az) * dz) / L2;
        t = Math.max(0, Math.min(1, t));
        const ex = ax + dx * t - x, ez = az + dz * t - z;
        const d = ex * ex + ez * ez;
        if (d < bd) { bd = d; best = i; bt = t; }
      }
    };
    if (hint >= 0) scan(hint - 5, hint + win);
    if (hint < 0 || bd > 80 * 80) scan(0, this.n - 1);
    const j = best + 1 < this.n ? best + 1 : 0;
    const segLen = (j > best ? this.s[j] : this.length) - this.s[best];
    return { i: best, s: this.s[best] + segLen * bt, dist: Math.sqrt(bd) };
  }
}

const _p = {};
export class AIDriver {
  constructor(game, vehicle, path, { skill = 1, lane = 0, laps = 1 } = {}) {
    this.game = game;
    this.v = vehicle;
    this.path = path;
    this.skill = skill;
    this.lane = lane;
    this.laps = laps;
    this.idx = -1;
    this.s = 0;
    this.lap = 0;
    this.progress = 0;
    this.stuck = 0;
    this.reverse = 0;
    this.flipT = 0;
    this.offT = 0;
    this.finished = false;
    this.finishTime = null;
    this.prevS = 0;
    this.nitroT = Math.random() * 5;
  }

  updateProgress() {
    const p = this.v.phys;
    const pr = this.path.project(p.pos.x, p.pos.z, this.idx);
    this.idx = pr.i;
    if (this.path.closed) {
      const L = this.path.length;
      if (this.prevS > L * 0.8 && pr.s < L * 0.2) this.lap++;
      else if (this.prevS < L * 0.2 && pr.s > L * 0.8) this.lap--;
    }
    this.prevS = pr.s;
    this.s = pr.s;
    this.dist = pr.dist;
    this.progress = this.lap * this.path.length + pr.s;
  }

  control(dt) {
    const p = this.v.phys;
    const c = p.controls;
    if (this.finished) { c.throttle = 0; c.brake = 0.6; c.steer = 0; c.handbrake = 0; c.nitro = 0; return; }
    this.updateProgress();
    const speed = p.speed;
    const look = 6 + speed * 0.5;
    const tgt = this.path.pointAt(this.s + look, _p);
    const k = this.path.curvatureAt(this.s + look * 0.5);
    const laneOff = this.lane * Math.max(0, 1 - k * 60);
    const tx = tgt.x + -tgt.tz * laneOff * -1, tz = tgt.z + tgt.tx * laneOff * -1;
    const dx = tx - p.pos.x, dz = tz - p.pos.z;
    const lx = dx * p.right.x + dz * p.right.z;
    const lf = dx * p.fwd.x + dz * p.fwd.z;
    const ang = Math.atan2(lx, lf);
    let steer = Math.max(-1, Math.min(1, -ang * 2.4));
    // vitesse cible selon la courbure à venir
    const mu = 9.81 * p.p.grip * 0.92 * this.skill;
    let vmax = p.p.topSpeed * 1.1;
    const brakeDist = speed * speed / (2 * 7) + 20;
    for (let d = 5; d < brakeDist; d += 8) {
      const kk = this.path.curvatureAt(this.s + d);
      if (kk < 0.0008) continue;
      const vc = Math.sqrt(mu / kk);
      const va = Math.sqrt(vc * vc + 2 * 7.5 * Math.max(0, d - 6));
      if (va < vmax) vmax = va;
    }
    let throttle = 0, brake = 0;
    if (speed < vmax - 1) throttle = 1;
    else if (speed > vmax + 1.5) brake = Math.min(1, (speed - vmax) / 6);
    else throttle = 0.4;
    // nitro en ligne droite
    this.nitroT -= dt;
    c.nitro = this.nitroT < 0 && k < 0.002 && speed > 20 && p.nitro > 0.2 ? 1 : 0;
    if (this.nitroT < -2.5) this.nitroT = 6 + Math.random() * 8;
    // blocage
    if (this.reverse > 0) {
      this.reverse -= dt;
      throttle = 0; brake = 1; steer = -steer;
    } else if (speed < 1.5 && this.game.events.racing) {
      this.stuck += dt;
      if (this.stuck > 2.2) { this.reverse = 1.4; this.stuck = 0; }
    } else this.stuck = 0;
    // retournée ou trop loin : replacement sur la trajectoire
    if (p.up.y < 0.35) this.flipT += dt; else this.flipT = 0;
    if (this.dist > 45) this.offT += dt; else this.offT = 0;
    if (this.flipT > 2 || this.offT > 6) this.resetOnPath();
    c.throttle = throttle;
    c.brake = brake;
    c.steer = steer;
    c.handbrake = 0;
    c.airPitch = 0; c.airYaw = 0; c.airRoll = 0;
  }

  resetOnPath() {
    const pt = this.path.pointAt(this.s, {});
    const yaw = Math.atan2(-pt.tx, -pt.tz);
    const h = this.game.world.height(pt.x, pt.z);
    this.v.place(pt.x, Math.max(h, 0.5), pt.z, yaw);
    this.flipT = 0; this.offT = 0; this.stuck = 0;
  }
}

export { THREE };
