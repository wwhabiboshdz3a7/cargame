// Physique de véhicule : corps rigide + 4 roues à suspension par lancer de rayon, modèle de pneu
// (courbe de dérive type Pacejka + cercle de friction), moteur, boîte, aérodynamique, collisions.
import * as THREE from 'three';
import { SURF } from '../world/worldgen.js';
import { Colliders } from '../world/colliders.js';

const G = 9.81;
const _v1 = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3(), _v4 = new THREE.Vector3();
const _n = new THREE.Vector3();
const _m3 = new THREE.Matrix3();
const _q = new THREE.Quaternion();

const SURF_GRIP_KEY = ['asphalt', 'dirt', 'grass', 'sand', 'dirt', 'asphalt', 'asphalt', 'sand'];
const SURF_ROLL = [1, 2.2, 2.8, 5.5, 1.2, 1, 1.6, 8];

function pacejka(a) {
  // a en radians, renvoie [-~1, ~1]
  return Math.sin(1.35 * Math.atan(14 * a));
}

export class VehiclePhysics {
  constructor(p, world, colliders) {
    this.p = p; // paramètres dérivés (derivePhysics)
    this.world = world;
    this.colliders = colliders;
    const b = p.body;
    this.dims = { L: b.L, W: b.W, H: Math.max(...b.top.map((t) => t[1])) };
    this.pos = new THREE.Vector3();
    this.quat = new THREE.Quaternion();
    this.vel = new THREE.Vector3();
    this.angVel = new THREE.Vector3();
    this.force = new THREE.Vector3();
    this.torque = new THREE.Vector3();
    this.rot = new THREE.Matrix3();
    this.up = new THREE.Vector3(0, 1, 0);
    this.fwd = new THREE.Vector3(0, 0, -1);
    this.right = new THREE.Vector3(1, 0, 0);
    this.controls = { throttle: 0, brake: 0, steer: 0, handbrake: 0, nitro: 0, airPitch: 0, airYaw: 0, airRoll: 0 };
    this.manual = false;
    this.assist = { abs: true, tcs: true, esc: false, steer: true };
    this.gear = 1;
    this.rpm = 900;
    this.shiftTimer = 0;
    this.reverseTimer = 0;
    this.steerAngle = 0;
    this.nitro = p.nitroCap > 0 ? 1 : 0;
    this.nitroActive = false;
    this.speed = 0;
    this.groundedWheels = 0;
    this.airTime = 0;
    this.impact = 0; // intensité du dernier choc
    this.scrape = 0;
    this.inWater = 0;
    this.frozen = false;
    this.surfaceUnder = SURF.ASPHALT;
    this.boost = 1; // multiplicateur de couple (IA)
    this.setup();
  }

  setup() {
    const p = this.p, b = p.body;
    this.mass = p.mass;
    this.invMass = 1 / p.mass;
    const L = b.L, W = b.W, H = this.dims.H * 0.8;
    const k = 1.15;
    this.inertia = new THREE.Vector3(p.mass / 12 * (H * H + L * L) * k, p.mass / 12 * (W * W + L * L) * k, p.mass / 12 * (W * W + H * H) * k);
    this.invInertia = new THREE.Vector3(1 / this.inertia.x, 1 / this.inertia.y, 1 / this.inertia.z);
    // suspension
    const s = p.susp;
    const mc = p.mass / 4;
    this.k = mc * (2 * Math.PI * s.hz) ** 2;
    this.c = 2 * s.zeta * Math.sqrt(this.k * mc);
    const sag = (mc * G) / this.k;
    // hauteur du CG dans le repère du modèle (sol = 0 à hauteur de caisse nominale)
    const cgModel = b.R + 0.2 + Math.max(0, b.bottom[1][1] - 0.2) * 0.6;
    const mountModel = b.R + s.rest - sag;
    this.rest = s.rest + s.height;
    this.travel = s.travel;
    this.cgHeight = cgModel + s.height;
    const mountY = mountModel - cgModel;
    const trackF = b.W - b.RW * 0.95, trackR = b.W - b.RW * 0.95;
    const zf = -(b.L / 2 - b.front);
    const zr = zf + b.WB;
    this.axleZ = [zf, zr];
    this.wheels = [];
    const driveFront = p.drive !== 'RWD', driveRear = p.drive !== 'FWD';
    for (let i = 0; i < 4; i++) {
      const front = i < 2, left = i % 2 === 0;
      this.wheels.push({
        i, front, left,
        local: new THREE.Vector3((left ? -1 : 1) * (front ? trackF : trackR) / 2, mountY, front ? zf : zr),
        R: b.R, width: b.RW,
        driven: front ? driveFront : driveRear,
        len: this.rest, comp: 0, prevComp: 0, contact: false, normal: new THREE.Vector3(0, 1, 0),
        point: new THREE.Vector3(), surf: SURF.ASPHALT, load: 0, spin: 0, angle: 0,
        slip: 0, slipLat: 0, spinning: false, locked: false, fx: 0, fy: 0, steer: 0, skid: 0,
        driveT: 0,
      });
    }
    // modèle géométrique (pour visuel) : distance du point d'ancrage au bas de la caisse
    this.modelOffsetY = -cgModel;
    // points de collision de la caisse (repère local, origine = CG)
    const hp = [];
    const yb = (b.bottom[1][1] + 0.04) + this.modelOffsetY;
    const beltY = Math.min(b.belt, this.dims.H - 0.1) + this.modelOffsetY;
    const topY = this.dims.H + this.modelOffsetY;
    const hl = b.L / 2 - 0.05, hw = b.W / 2 - 0.04;
    for (const z of [-hl, -hl * 0.5, 0, hl * 0.5, hl]) for (const x of [-hw, hw]) { hp.push([x, yb, z]); hp.push([x, beltY, z]); }
    const roofZ0 = -b.L / 2 + b.L * ((b.ws[0] + b.ws[1]) / 2), roofZ1 = -b.L / 2 + b.L * ((b.rw[0] + b.rw[1]) / 2);
    for (const z of [roofZ0, (roofZ0 + roofZ1) / 2, roofZ1]) for (const x of [-hw * b.tumble, hw * b.tumble]) hp.push([x, topY - 0.05, z]);
    hp.push([0, yb, -hl - 0.03], [0, yb, hl + 0.03], [0, beltY - 0.15, -hl - 0.03], [0, beltY - 0.15, hl + 0.03]);
    this.hull = hp.map((a) => new THREE.Vector3(...a));
    this.hullH = { yb, topY, hl, hw };
  }

  place(x, y, z, yaw) {
    this.pos.set(x, y + this.cgHeight + 0.15, z);
    this.quat.setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
    this.vel.set(0, 0, 0);
    this.angVel.set(0, 0, 0);
    for (const w of this.wheels) { w.comp = w.prevComp = 0; w.spin = 0; }
    this.gear = 1;
    this.airTime = 0;
    this.inWater = 0;
    this.updateFrame();
  }

  updateFrame() {
    this.rot.setFromMatrix4(new THREE.Matrix4().makeRotationFromQuaternion(this.quat));
    const e = this.rot.elements;
    this.right.set(e[0], e[1], e[2]);
    this.up.set(e[3], e[4], e[5]);
    this.fwd.set(-e[6], -e[7], -e[8]);
  }

  toWorld(local, out) { return out.copy(local).applyMatrix3(this.rot).add(this.pos); }

  applyForceAt(F, p) {
    this.force.add(F);
    _v4.subVectors(p, this.pos).cross(F);
    this.torque.add(_v4);
  }

  // inverse de l'inertie en repère monde appliquée à un vecteur
  invIWorld(v, out) {
    // R * diag(invI) * R^T * v
    const e = this.rot.elements;
    const lx = e[0] * v.x + e[1] * v.y + e[2] * v.z;
    const ly = e[3] * v.x + e[4] * v.y + e[5] * v.z;
    const lz = e[6] * v.x + e[7] * v.y + e[8] * v.z;
    const ax = lx * this.invInertia.x, ay = ly * this.invInertia.y, az = lz * this.invInertia.z;
    out.set(e[0] * ax + e[3] * ay + e[6] * az, e[1] * ax + e[4] * ay + e[7] * az, e[2] * ax + e[5] * ay + e[8] * az);
    return out;
  }

  velocityAt(p, out) {
    _v4.subVectors(p, this.pos);
    return out.crossVectors(this.angVel, _v4).add(this.vel);
  }

  applyImpulse(J, p) {
    this.vel.addScaledVector(J, this.invMass);
    _v4.subVectors(p, this.pos).cross(J);
    this.invIWorld(_v4, _v4);
    this.angVel.add(_v4);
  }

  // Lancer de rayon contre le sol (terrain + boîtes). Renvoie la distance (ou -1)
  castGround(o, d, maxT, outN) {
    const w = this.world;
    let tHit = -1;
    const f = (t) => (o.y + d.y * t) - w.height(o.x + d.x * t, o.z + d.z * t);
    const f0 = f(0);
    if (f0 <= 0) tHit = 0;
    else {
      const f1 = f(maxT);
      if (f1 <= 0) {
        let a = 0, b = maxT;
        for (let k = 0; k < 7; k++) { const m = (a + b) / 2; if (f(m) > 0) a = m; else b = m; }
        tHit = (a + b) / 2;
      }
    }
    let surf = SURF.GRASS;
    if (tHit >= 0) {
      const hx = o.x + d.x * tHit, hz = o.z + d.z * tHit;
      w.normal(hx, hz, outN, 0.5);
      w.ground(hx, hz);
      surf = w.surf;
    }
    const tb = this.colliders.raycast(o.x, o.y, o.z, d.x, d.y, d.z, tHit >= 0 ? tHit : maxT, _n);
    if (tb < Infinity) {
      outN.copy(_n); this.hitSurf = this.colliders.hitSurf;
      const gd = this.colliders.hitBox?.data?.guide;
      if (gd) this.guide = gd;
      return tb;
    }
    this.hitSurf = surf;
    return tHit;
  }

  step(dt, others = null) {
    if (this.frozen) { this.vel.set(0, 0, 0); this.angVel.set(0, 0, 0); return; }
    const p = this.p;
    this.updateFrame();
    this.force.set(0, -G * this.mass, 0);
    this.torque.set(0, 0, 0);
    const ctl = this.controls;
    const fwdSpeed = this.vel.dot(this.fwd);
    const speed = this.vel.length();
    this.speed = speed;

    // ---------------- direction
    const steerLock = 0.62 * p.steerSens;
    const latV = this.vel.dot(this.right);
    const beta = speed > 3 ? Math.atan2(latV, Math.abs(fwdSpeed)) : 0;
    let maxSteer = Math.atan((p.grip * G * p.body.WB) / Math.max(1, speed * speed)) * 2.4 + 0.035;
    maxSteer = Math.min(steerLock, maxSteer + Math.abs(beta) * 0.9);
    let target = ctl.steer * maxSteer;
    if (this.assist.steer && speed > 5 && this.groundedWheels >= 3) {
      // contre-braquage automatique léger
      if (Math.abs(ctl.steer) < 0.5) target += Math.max(-0.35, Math.min(0.35, -beta * 0.5)) * Math.sign(fwdSpeed || 1);
    }
    this.beta = beta;
    const rate = (Math.abs(target) < Math.abs(this.steerAngle) ? 4.5 : 2.8) * steerLock;
    this.steerAngle += Math.max(-rate * dt, Math.min(rate * dt, target - this.steerAngle));

    // ---------------- boîte de vitesses
    const gears = p.gears;
    this.shiftTimer = Math.max(0, this.shiftTimer - dt);
    let throttle = ctl.throttle, brake = ctl.brake;
    if (!this.manual) {
      if (this.gear > 0) {
        if (Math.abs(fwdSpeed) < 1.2 && ctl.brake > 0.1 && ctl.throttle < 0.1) {
          this.reverseTimer += dt;
          if (this.reverseTimer > 0.25) { this.gear = -1; this.reverseTimer = 0; }
        } else this.reverseTimer = 0;
      } else if (this.gear === -1) {
        if (ctl.throttle > 0.1 && fwdSpeed > -1.2) { this.gear = 1; }
        throttle = ctl.brake; brake = ctl.throttle;
      }
    } else {
      if (this.gear === -1) { /* en manuel, frein = frein */ }
    }
    if (this.gear === 0) throttle = 0;

    // ---------------- moteur
    const R = p.body.R;
    let drivenSpeed = 0, nd = 0;
    for (const w of this.wheels) if (w.driven) { drivenSpeed += Math.abs(w.spin) * R; nd++; }
    drivenSpeed = nd ? drivenSpeed / nd : 0;
    const ratio = this.gear === -1 ? 3.2 : this.gear === 0 ? 0 : gears[this.gear - 1];
    let rpmWheels = (drivenSpeed / R) * ratio * p.finalDrive * 60 / (2 * Math.PI);
    const launch = p.idle + throttle * (p.redline * 0.55 - p.idle);
    let rpm = this.gear === 0 ? p.idle + throttle * (p.redline - p.idle) : Math.max(rpmWheels, (this.gear === 1 || this.gear === -1) ? launch * Math.max(0, 1 - drivenSpeed / 8) : 0, p.idle);
    rpm = Math.min(rpm, p.redline * 1.02);
    this.rpm += (rpm - this.rpm) * Math.min(1, dt * 18);
    if (!this.manual && this.gear > 0 && this.shiftTimer <= 0 && this.groundedWheels >= 2) {
      if (this.rpm > p.redline * 0.93 && this.gear < gears.length && throttle > 0.2) { this.gear++; this.shiftTimer = 0.28; }
      else if (this.gear > 1 && this.rpm < p.redline * (throttle > 0.5 ? 0.55 : 0.42)) { this.gear--; this.shiftTimer = 0.18; }
    }
    const rr = this.rpm / p.redline;
    const curve = rr < 0.2 ? 0.55 + rr * 1.5 : rr < 0.7 ? 0.85 + (rr - 0.2) * 0.3 : 1.0 - (rr - 0.7) * 0.55;
    const limiter = this.rpm >= p.redline * 0.995 && rpmWheels >= p.redline * 0.99;
    let engT = (limiter || this.shiftTimer > 0.1) ? 0 : p.maxTorque * curve * throttle * this.boost;
    // nitro
    this.nitroActive = false;
    if (ctl.nitro && this.nitro > 0 && throttle > 0.1 && this.gear > 0) {
      this.nitroActive = true;
      this.nitro = Math.max(0, this.nitro - dt / (4.5 * p.nitroCap));
      engT *= 1.45;
    }
    let wheelT = engT * ratio * p.finalDrive * 0.88 * (this.gear === -1 ? -1 : 1);
    // frein moteur
    const engineBrake = throttle < 0.05 && this.gear !== 0 ? 0.5 * this.mass * Math.sign(fwdSpeed) * Math.min(1, Math.abs(fwdSpeed) / 3) : 0;
    // répartition
    const split = p.drive === 'AWD' ? p.split : p.drive === 'FWD' ? 1 : 0;
    for (const w of this.wheels) {
      w.driveT = 0;
      if (!w.driven) continue;
      const axleShare = w.front ? split : 1 - split;
      w.driveT = wheelT * axleShare * 0.5;
    }

    // ---------------- roues
    this.groundedWheels = 0;
    this.guide = null;
    const down = _v1.copy(this.up).negate();
    const mount = _v2;
    const maxLen = this.rest + R;
    let surfCount = new Array(8).fill(0);
    for (const w of this.wheels) {
      this.toWorld(w.local, mount);
      const t = this.castGround(mount, down, maxLen, w.normal);
      w.prevComp = w.comp;
      w.steer = w.front ? this.steerAngle * (w.left === (this.steerAngle > 0) ? 1.08 : 0.94) : 0;
      if (t < 0) {
        w.contact = false; w.comp = 0; w.len = this.rest; w.load = 0; w.slip = 0; w.skid = 0; w.slipLat = 0;
        w.spin += (w.driveT / (R * 25)) * dt - w.spin * dt * 0.5;
        if (ctl.handbrake && !w.front) w.spin = 0;
        continue;
      }
      w.contact = true;
      this.groundedWheels++;
      w.surf = this.hitSurf;
      surfCount[w.surf]++;
      w.len = Math.max(this.rest - this.travel, t - R);
      w.comp = this.rest - (t - R);
      w.point.copy(mount).addScaledVector(down, t);
      const compVel = (w.comp - w.prevComp) / dt;
      let Fs = this.k * w.comp + this.c * compVel;
      if (w.comp > this.travel) Fs += this.k * 30 * (w.comp - this.travel) + this.c * 4 * Math.max(0, compVel);
      w.Fs = Math.max(0, Fs);
    }
    // barres anti-roulis
    for (let a = 0; a < 2; a++) {
      const L = this.wheels[a * 2], Rr = this.wheels[a * 2 + 1];
      const arb = this.k * 0.55 * (L.comp - Rr.comp);
      if (L.contact) L.Fs = Math.max(0, L.Fs + arb);
      if (Rr.contact) Rr.Fs = Math.max(0, Rr.Fs - arb);
    }
    let dom = 0;
    for (let s = 1; s < 8; s++) if (surfCount[s] > surfCount[dom]) dom = s;
    this.surfaceUnder = this.groundedWheels ? dom : this.surfaceUnder;

    const mc = this.mass / 4;
    const brakeMax = this.mass * G * 1.25 * p.brakeMult;
    for (const w of this.wheels) {
      if (!w.contact) continue;
      const n = w.normal;
      // force de suspension le long de la normale du corps (vers le haut)
      const Fs = w.Fs;
      _v3.copy(this.up).multiplyScalar(Fs);
      this.applyForceAt(_v3, w.point);
      // repère du pneu
      const cs = Math.cos(w.steer), sn = Math.sin(w.steer);
      const fx = this.fwd.x * cs - this.right.x * sn, fy = this.fwd.y * cs - this.right.y * sn, fz = this.fwd.z * cs - this.right.z * sn;
      const dn = fx * n.x + fy * n.y + fz * n.z;
      const f = _v3.set(fx - n.x * dn, fy - n.y * dn, fz - n.z * dn).normalize();
      const sdir = _v4.crossVectors(f, n).normalize();
      const sx = sdir.x, sy = sdir.y, sz = sdir.z;
      const vC = this.velocityAt(w.point, new THREE.Vector3());
      const vLong = vC.dot(f);
      const vLat = vC.x * sx + vC.y * sy + vC.z * sz;
      const surfKey = SURF_GRIP_KEY[w.surf] || 'asphalt';
      let mu = p.grip / (p.tireGrip.asphalt || 1) * (p.tireGrip[surfKey] ?? 1);
      if (w.surf === SURF.SALT) mu *= 0.85;
      if (w.surf === SURF.ROCK) mu *= 0.95;
      const load = Math.min(Fs, mc * G * 3.5);
      w.load = load;
      const maxF = mu * load * (1.05 - 0.05 * load / (mc * G));
      // longitudinal
      let Fx = w.driveT / R;
      // contrôle de traction
      if (this.assist.tcs && Math.abs(Fx) > maxF * 0.95) Fx = Math.sign(Fx) * maxF * 0.95;
      let brakeF = 0;
      const hb = ctl.handbrake && !w.front;
      if (brake > 0) brakeF += brake * brakeMax * (w.front ? p.brakeBias : 1 - p.brakeBias) * 0.5;
      if (hb) brakeF += brakeMax * 0.6;
      if (this.assist.abs && !hb && brakeF > maxF * 0.98) brakeF = maxF * 0.98;
      const stopF = Math.abs(vLong) * mc / dt;
      const bF = Math.min(brakeF, stopF);
      Fx -= Math.sign(vLong) * bF;
      // résistance au roulement + frein moteur
      const roll = 0.012 * SURF_ROLL[w.surf] * (p.offroad && w.surf === SURF.SAND ? 0.45 : 1) * load;
      Fx -= Math.sign(vLong) * Math.min(roll, stopF);
      if (w.driven && this.gear !== 0) Fx -= Math.min(Math.abs(engineBrake) / nd, stopF) * Math.sign(vLong);
      // à l'arrêt sans gaz : maintien
      if (Math.abs(vLong) < 0.4 && throttle < 0.05 && Math.abs(w.driveT) < 1) Fx = -vLong * mc / dt * 0.5;
      // latéral
      const slipA = Math.atan2(vLat, Math.abs(vLong) + 0.8);
      w.slipLat = slipA;
      let FyCurve = -maxF * pacejka(slipA);
      const FyLin = -vLat * mc / dt * 0.9;
      let Fy = Math.abs(FyLin) < Math.abs(FyCurve) ? FyLin : FyCurve;
      // cercle de friction
      let spinning = false, locked = false;
      const lim = hb ? maxF * 0.8 : maxF;
      if (Math.abs(Fx) > lim) {
        if (Math.sign(Fx) === Math.sign(vLong) || Math.abs(vLong) < 1) spinning = w.driveT !== 0; else locked = true;
        Fx = Math.sign(Fx) * lim * 0.92;
      }
      const latCap = Math.sqrt(Math.max(0, lim * lim - Fx * Fx)) * (hb ? 0.42 : spinning || locked ? 0.6 : 1);
      if (Math.abs(Fy) > latCap) Fy = Math.sign(Fy) * latCap;
      if (hb) locked = Math.abs(vLong) > 0.5;
      w.fx = Fx; w.fy = Fy;
      w.spinning = spinning; w.locked = locked;
      const latSkid = Math.max(0, Math.abs(slipA) - 0.14) * 3.2 * Math.min(1, Math.abs(vC.length()) / 6);
      w.skid = Math.min(1, (spinning ? 0.8 : 0) + (locked && Math.abs(vLong) > 2 ? 0.9 : 0) + latSkid);
      w.slip = w.skid;
      // point d'application relevé (réduit le roulis)
      const ap = _v2.copy(w.point).addScaledVector(this.up, (this.pos.clone().sub(w.point).dot(this.up)) * 0.45);
      const F = new THREE.Vector3(f.x * Fx + sx * Fy, f.y * Fx + sy * Fy, f.z * Fx + sz * Fy);
      this.applyForceAt(F, ap);
      // rotation visuelle de la roue
      let targetSpin = vLong / R;
      if (spinning) targetSpin = Math.sign(w.driveT) * Math.max(Math.abs(targetSpin), Math.abs(targetSpin) + 25);
      if (locked) targetSpin = 0;
      w.spin += (targetSpin - w.spin) * Math.min(1, dt * 20);
    }
    for (const w of this.wheels) w.angle = (w.angle + w.spin * dt) % (Math.PI * 2);

    // ---------------- guidage latéral (looping)
    if (this.guide) {
      const gd = this.guide;
      const ex = this.pos.x - gd.x, ey = this.pos.y - gd.y, ez = this.pos.z - gd.z;
      const e = ex * gd.l[0] + ey * gd.l[1] + ez * gd.l[2];
      const de = this.prevGuideE !== undefined ? (e - this.prevGuideE) / dt : 0;
      this.prevGuideE = e;
      const f = (-e * 14 - de * 5) * this.mass;
      this.force.x += gd.l[0] * f; this.force.y += gd.l[1] * f; this.force.z += gd.l[2] * f;
    } else this.prevGuideE = undefined;

    // ---------------- aérodynamique
    const rho = 1.225;
    if (speed > 0.1) {
      _v3.copy(this.vel).multiplyScalar(-0.5 * rho * p.CdA * speed);
      this.force.add(_v3);
      const df = 0.5 * rho * p.downforce * fwdSpeed * fwdSpeed * (this.groundedWheels > 0 ? 1 : 0.2);
      this.force.addScaledVector(this.up, -df);
    }
    if (this.nitroActive) this.force.addScaledVector(this.fwd, this.mass * 2.2);

    // ---------------- contrôle en l'air
    if (this.groundedWheels === 0) {
      this.airTime += dt;
      const k = 2.6;
      _v3.set(0, 0, 0)
        .addScaledVector(this.right, ctl.airPitch * this.inertia.x * k)
        .addScaledVector(this.up, ctl.airYaw * this.inertia.y * k)
        .addScaledVector(this.fwd, -ctl.airRoll * this.inertia.z * k);
      this.torque.add(_v3);
      this.angVel.multiplyScalar(1 - dt * 0.15);
      // aide à la réception : remet la voiture à plat si le joueur ne fait pas de figure
      const airInput = Math.abs(ctl.airPitch) > 0.1 || Math.abs(ctl.airYaw) > 0.1 || Math.abs(ctl.airRoll) > 0.1;
      if (this.assist.steer && !airInput && this.airTime > 0.25 && this.up.y > 0.2) {
        const sp = this.vel.length() || 1;
        const pitchErr = this.fwd.y - this.vel.y / sp * 0.6;
        const kR = 5, kD = 2.2;
        const wr = this.angVel.dot(this.right), wf = this.angVel.dot(this.fwd);
        this.torque.addScaledVector(this.fwd, (this.right.y * kR - wf * kD) * this.inertia.z);
        this.torque.addScaledVector(this.right, (-pitchErr * kR - wr * kD) * this.inertia.x);
      }
    } else {
      this.airTime = 0;
      // stabilité (ESC simplifiée)
      if (this.assist.esc && speed > 8) {
        const yawRate = this.angVel.dot(this.up);
        const desired = (fwdSpeed * Math.tan(this.steerAngle)) / p.body.WB;
        const err = yawRate - desired;
        if (Math.abs(err) > 0.25) this.torque.addScaledVector(this.up, -err * this.inertia.y * 2.5);
      }
    }

    // ---------------- intégration
    this.vel.addScaledVector(this.force, this.invMass * dt);
    this.invIWorld(this.torque, _v3);
    this.angVel.addScaledVector(_v3, dt);
    this.angVel.multiplyScalar(1 - dt * 0.05);
    const maxAng = 14;
    if (this.angVel.lengthSq() > maxAng * maxAng) this.angVel.setLength(maxAng);
    this.pos.addScaledVector(this.vel, dt);
    _q.set(this.angVel.x * dt * 0.5, this.angVel.y * dt * 0.5, this.angVel.z * dt * 0.5, 0).multiply(this.quat);
    this.quat.x += _q.x; this.quat.y += _q.y; this.quat.z += _q.z; this.quat.w += _q.w;
    this.quat.normalize();
    this.updateFrame();

    // ---------------- collisions de la caisse
    this.impact = 0;
    this.scrape = 0;
    this.collide(dt, others);

    // ---------------- eau
    const wy = this.pos.y + this.modelOffsetY + 0.3;
    if (wy < 0) {
      const sub = Math.min(1, -wy / 1.2);
      this.vel.y += G * 1.25 * sub * dt;
      this.vel.multiplyScalar(1 - Math.min(0.9, 2.2 * sub * dt));
      this.angVel.multiplyScalar(1 - Math.min(0.9, 2 * sub * dt));
      this.inWater += dt;
    } else this.inWater = 0;

    // limites du monde
    const lim = 15960;
    for (const ax of ['x', 'z']) {
      if (Math.abs(this.pos[ax]) > lim) {
        this.pos[ax] = Math.sign(this.pos[ax]) * lim;
        if (this.vel[ax] * Math.sign(this.pos[ax]) > 0) { this.impact = Math.max(this.impact, Math.abs(this.vel[ax])); this.vel[ax] *= -0.3; }
      }
    }
  }

  collide(dt, others) {
    const w = this.world;
    const groundC = w.height(this.pos.x, this.pos.z);
    const pw = _v1;
    const n = new THREE.Vector3();
    const pushed = new THREE.Vector3();
    const contacts = [];
    const r = Math.max(this.dims.L, this.dims.W) * 0.6 + 1;
    const boxes = [];
    this.colliders.queryBoxes(this.pos.x - r, this.pos.z - r, this.pos.x + r, this.pos.z + r, (b) => {
      if (b.max[1] > this.pos.y - 4 && b.min[1] < this.pos.y + 4) boxes.push(b);
    });
    for (const lp of this.hull) {
      this.toWorld(lp, pw);
      if (pw.y < groundC + 6) {
        const h = w.height(pw.x, pw.z);
        if (pw.y < h) {
          w.normal(pw.x, pw.z, n, 0.6);
          const depth = (h - pw.y) * n.y;
          contacts.push({ p: pw.clone(), n: n.clone(), d: depth, mu: 0.3 });
        }
      }
      for (const b of boxes) {
        const ramp = b.kind === 'ramp';
        const d = ramp ? Colliders.pointInRamp(b, pw.x, pw.y, pw.z, n) : Colliders.pointInBox(b, pw.x, pw.y, pw.z, n);
        if (d > 0) contacts.push({ p: pw.clone(), n: n.clone(), d, mu: ramp ? 0.04 : 0.4, box: b, ramp });
      }
    }
    // cylindres (arbres, poteaux) contre le rectangle de la caisse
    const hl = this.hullH.hl, hw = this.hullH.hw;
    this.colliders.queryCyls(this.pos.x - r, this.pos.z - r, this.pos.x + r, this.pos.z + r, (c) => {
      if (this.pos.y + this.hullH.yb > c.y1 || this.pos.y + this.hullH.topY < c.y0) return;
      const dx = c.x - this.pos.x, dz = c.z - this.pos.z;
      const lx = dx * this.right.x + dz * this.right.z;
      const lz = -(dx * this.fwd.x + dz * this.fwd.z);
      const cx = Math.max(-hw, Math.min(hw, lx)), cz = Math.max(-hl, Math.min(hl, lz));
      let ex = lx - cx, ez = lz - cz;
      let dist = Math.hypot(ex, ez);
      let depth, nlx, nlz;
      if (dist > 1e-4) {
        if (dist >= c.r) return;
        depth = c.r - dist; nlx = -ex / dist; nlz = -ez / dist;
      } else {
        const px = hw - Math.abs(lx), pz = hl - Math.abs(lz);
        if (px < pz) { depth = px + c.r; nlx = -Math.sign(lx); nlz = 0; } else { depth = pz + c.r; nlx = 0; nlz = -Math.sign(lz); }
      }
      // normale en monde (de l'obstacle vers la voiture)
      const nx = nlx * this.right.x - nlz * this.fwd.x, nz = nlx * this.right.z - nlz * this.fwd.z;
      const L = Math.hypot(nx, nz) || 1;
      const cpLocalX = cx, cpLocalZ = cz;
      const p = new THREE.Vector3(this.pos.x + cpLocalX * this.right.x - cpLocalZ * this.fwd.x, this.pos.y, this.pos.z + cpLocalX * this.right.z - cpLocalZ * this.fwd.z);
      contacts.push({ p, n: new THREE.Vector3(nx / L, 0, nz / L), d: depth, mu: 0.3, cyl: c });
    });
    // autres véhicules
    if (others) {
      for (const o of others) {
        if (o === this || o.frozen) continue;
        const dx = o.pos.x - this.pos.x, dz = o.pos.z - this.pos.z;
        if (dx * dx + dz * dz > 64 || Math.abs(o.pos.y - this.pos.y) > 4) continue;
        this.collideVehicle(o, contacts);
      }
    }
    for (let it = 0; it < 2; it++) {
      for (const c of contacts) {
        if (c.other) { this.resolveDynamic(c, it === 0); continue; }
        const vp = this.velocityAt(c.p, _v2);
        const vn = vp.dot(c.n);
        if (vn < 0) {
          if (it === 0 && !c.ramp) this.impact = Math.max(this.impact, -vn);
          const rxn = _v3.subVectors(c.p, this.pos).cross(c.n);
          this.invIWorld(rxn, _v4);
          const k = this.invMass + _v4.cross(_v3.subVectors(c.p, this.pos)).dot(c.n);
          const e = c.ramp ? 0 : -vn > 3 ? 0.18 : 0;
          const jn = (-(1 + e) * vn) / k;
          const J = c.n.clone().multiplyScalar(jn);
          // frottement
          const vt = vp.clone().addScaledVector(c.n, -vn);
          const vtl = vt.length();
          if (vtl > 1e-3) {
            const jt = Math.min(c.mu * jn, vtl / k);
            J.addScaledVector(vt, -jt / vtl);
            if (vtl > 3) this.scrape = Math.max(this.scrape, vtl);
          }
          this.applyImpulse(J, c.p);
        }
      }
    }
    // correction de position
    for (const c of contacts) {
      if (c.other) continue;
      const need = c.d - pushed.dot(c.n);
      if (need > 0) {
        const k = Math.min(need, 0.5) * 0.8;
        this.pos.addScaledVector(c.n, k);
        pushed.addScaledVector(c.n, k);
      }
    }
    this.contacts = contacts.length;
  }

  // Collision véhicule/véhicule : points de la caisse dans la boîte de l'autre (et inversement)
  collideVehicle(o, contacts) {
    const n = new THREE.Vector3();
    const boxOf = (v) => ({
      cx: v.pos.x, cy: v.pos.y + (v.hullH.yb + v.hullH.topY) / 2, cz: v.pos.z,
      hx: v.hullH.hw + 0.05, hy: (v.hullH.topY - v.hullH.yb) / 2, hz: v.hullH.hl + 0.05,
      ax: [v.right.x, v.right.y, v.right.z], ay: [v.up.x, v.up.y, v.up.z], az: [-v.fwd.x, -v.fwd.y, -v.fwd.z],
    });
    const bo = boxOf(o), bs = boxOf(this);
    const pw = new THREE.Vector3();
    for (const lp of this.hull) {
      this.toWorld(lp, pw);
      const d = Colliders.pointInBox(bo, pw.x, pw.y, pw.z, n);
      if (d > 0) contacts.push({ p: pw.clone(), n: n.clone(), d, other: o });
    }
    for (const lp of o.hull) {
      o.toWorld(lp, pw);
      const d = Colliders.pointInBox(bs, pw.x, pw.y, pw.z, n);
      if (d > 0) contacts.push({ p: pw.clone(), n: n.clone().negate(), d, other: o });
    }
  }

  resolveDynamic(c, first) {
    const o = c.other;
    const va = this.velocityAt(c.p, new THREE.Vector3());
    const vb = o.velocityAt(c.p, new THREE.Vector3());
    const rel = va.sub(vb);
    const vn = rel.dot(c.n);
    if (vn < 0) {
      const ra = new THREE.Vector3().subVectors(c.p, this.pos), rb = new THREE.Vector3().subVectors(c.p, o.pos);
      const ta = this.invIWorld(ra.clone().cross(c.n), new THREE.Vector3()).cross(ra);
      const tb = o.invIWorld(rb.clone().cross(c.n), new THREE.Vector3()).cross(rb);
      const k = this.invMass + o.invMass + c.n.dot(ta.add(tb));
      const jn = (-(1.15) * vn) / k;
      const J = c.n.clone().multiplyScalar(jn);
      const vt = rel.clone().addScaledVector(c.n, -vn);
      const vtl = vt.length();
      if (vtl > 1e-3) J.addScaledVector(vt, -Math.min(0.3 * jn, vtl / k) / vtl);
      this.applyImpulse(J, c.p);
      o.applyImpulse(J.negate(), c.p);
      if (first) { this.impact = Math.max(this.impact, -vn); o.impact = Math.max(o.impact || 0, -vn); this.hitVehicle = o; }
    }
    if (first) {
      const k = Math.min(c.d, 0.3) * 0.5;
      const ratio = o.invMass / (this.invMass + o.invMass);
      this.pos.addScaledVector(c.n, k * ratio);
      o.pos.addScaledVector(c.n, -k * (1 - ratio));
    }
  }

  // Remet la voiture sur ses roues
  recover() {
    const yaw = Math.atan2(-this.fwd.x, -this.fwd.z);
    const h = this.world.height(this.pos.x, this.pos.z);
    this.place(this.pos.x, Math.max(h, 0.5), this.pos.z, yaw);
  }

  get kmh() { return this.vel.dot(this.fwd) * 3.6; }
}
