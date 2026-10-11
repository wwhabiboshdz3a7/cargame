// Véhicule complet : physique + modèle 3D + éclairage + effets.
import * as THREE from 'three';
import { VehiclePhysics } from './physics.js';
import { buildCarModel } from './carModel.js';
import { derivePhysics } from './carDefs.js';
import { SURF } from '../world/worldgen.js';

const _v = new THREE.Vector3(), _s = new THREE.Vector3();
const DUST = {
  [SURF.SAND]: [0.86, 0.7, 0.5], [SURF.DIRT]: [0.66, 0.55, 0.42], [SURF.GRASS]: [0.5, 0.48, 0.36],
  [SURF.SALT]: [0.95, 0.94, 0.9], [SURF.ROCK]: [0.6, 0.45, 0.35],
};

export class Vehicle {
  constructor(game, car, cfg, opts = {}) {
    this.game = game;
    this.car = car;
    this.cfg = cfg;
    this.isPlayer = !!opts.isPlayer;
    this.lowDetail = !!opts.lowDetail;
    this.params = derivePhysics(car, cfg);
    this.phys = new VehiclePhysics(this.params, game.world, game.colliders);
    this.model = buildCarModel(car, cfg, { lowDetail: this.lowDetail });
    this.root = this.model.root;
    this.model.body.position.y = this.phys.modelOffsetY;
    game.scene.add(this.root);
    this.prevPos = new THREE.Vector3();
    this.prevQuat = new THREE.Quaternion();
    this.lightsOn = false;
    this.sirenOn = false;
    this.flashT = 0;
    this.braking = false;
    this.name = opts.name || car.name;
    if (this.isPlayer) this._makeHeadlights();
    this._makeFlames();
    this.root.traverse((o) => { if (o.isMesh && this.lowDetail) o.castShadow = false; });
  }

  _makeHeadlights() {
    const b = this.car.body;
    this.spots = [];
    for (const sd of [-1, 1]) {
      const s = new THREE.SpotLight(0xfff1dc, 0, 120, 0.42, 0.45, 1.2);
      s.position.set(sd * b.W * 0.32, 0.65 + this.phys.modelOffsetY, -b.L / 2);
      s.target.position.set(sd * b.W * 0.2, -0.6 + this.phys.modelOffsetY, -b.L / 2 - 25);
      s.castShadow = false;
      this.root.add(s, s.target);
      this.spots.push(s);
    }
  }

  _makeFlames() {
    const b = this.car.body;
    const geo = new THREE.ConeGeometry(0.09, 0.7, 10, 1, true).rotateX(-Math.PI / 2).translate(0, 0, 0.35);
    this.flameMat = new THREE.MeshBasicMaterial({ color: 0x66aaff, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false });
    this.flames = [];
    for (const sd of [-1, 1]) {
      const f = new THREE.Mesh(geo, this.flameMat);
      f.position.set(sd * b.W * 0.25, 0.28 + this.phys.modelOffsetY, b.L / 2 + 0.08);
      f.visible = false;
      this.root.add(f);
      this.flames.push(f);
    }
  }

  rebuild(cfg) {
    // reconstruction visuelle + paramètres (après garage)
    this.cfg = cfg;
    const { pos, quat, vel, angVel } = this.phys;
    const keep = { pos: pos.clone(), quat: quat.clone(), vel: vel.clone(), ang: angVel.clone(), gear: this.phys.gear };
    this.game.scene.remove(this.root);
    this.params = derivePhysics(this.car, cfg);
    const old = this.phys;
    this.phys = new VehiclePhysics(this.params, this.game.world, this.game.colliders);
    this.phys.manual = old.manual; this.phys.assist = old.assist;
    this.phys.pos.copy(keep.pos); this.phys.quat.copy(keep.quat); this.phys.vel.copy(keep.vel); this.phys.angVel.copy(keep.ang);
    this.phys.updateFrame();
    this.model = buildCarModel(this.car, cfg, { lowDetail: this.lowDetail });
    this.root = this.model.root;
    this.model.body.position.y = this.phys.modelOffsetY;
    this.game.scene.add(this.root);
    if (this.isPlayer) this._makeHeadlights();
    this._makeFlames();
  }

  place(x, y, z, yaw) {
    this.phys.place(x, y, z, yaw);
    this.prevPos.copy(this.phys.pos);
    this.prevQuat.copy(this.phys.quat);
    this.sync(1);
    if (this.game.skids) for (let i = 0; i < 4; i++) this.game.skids.cut(this.uid + '_' + i);
  }

  beginStep() {
    this.prevPos.copy(this.phys.pos);
    this.prevQuat.copy(this.phys.quat);
  }

  // Mise à jour visuelle (alpha = interpolation entre deux pas physiques)
  sync(alpha, dt = 0) {
    const p = this.phys;
    this.root.position.lerpVectors(this.prevPos, p.pos, alpha);
    this.root.quaternion.slerpQuaternions(this.prevQuat, p.quat, alpha);
    for (let i = 0; i < 4; i++) {
      const w = p.wheels[i], m = this.model.wheels[i];
      m.holder.position.set(w.local.x, w.local.y - w.len, w.local.z);
      m.holder.rotation.y = w.steer;
      m.spin.rotation.x = m.left ? w.angle : -w.angle;
    }
    // feux
    const braking = p.controls.brake > 0.1 && p.gear !== -1 || (p.gear === -1 && p.controls.throttle > 0.1);
    this.braking = braking;
    const lm = this.model.lightMats;
    lm.tail.emissiveIntensity = braking ? 3 : this.lightsOn ? 0.9 : 0.12;
    lm.head.emissiveIntensity = this.lightsOn ? 3.5 : 0.15;
    lm.reverse.emissiveIntensity = p.gear === -1 ? 2 : 0;
    if (this.spots) for (const s of this.spots) s.intensity = this.lightsOn ? 60 : 0;
    // nitro
    const nitro = p.nitroActive;
    for (const f of this.flames) {
      f.visible = nitro;
      if (nitro) f.scale.set(1, 1, 0.7 + Math.random() * 0.7);
    }
    // gyrophares
    const lb = this.model.lightbar;
    if (lb) {
      this.flashT += dt;
      const on = lb.police ? this.sirenOn : this.lightsOn;
      const ph = Math.floor(this.flashT * 6) % 2;
      lb.red.emissiveIntensity = on ? (ph ? 6 : 0.2) : 0.2;
      lb.blue.emissiveIntensity = on ? (ph ? 0.2 : 6) : 0.2;
      if (!lb.police && on) { lb.red.emissiveIntensity = lb.blue.emissiveIntensity = 4; }
    }
  }

  // Effets (fumée, poussière, traces)
  effects(dt) {
    const g = this.game;
    const p = this.phys;
    const speed = p.speed;
    for (let i = 0; i < 4; i++) {
      const w = p.wheels[i];
      const key = this.uid + '_' + i;
      if (!w.contact) { g.skids.cut(key); continue; }
      const onSoft = w.surf === SURF.SAND || w.surf === SURF.DIRT || w.surf === SURF.GRASS || w.surf === SURF.SALT || w.surf === SURF.ROCK;
      _s.set(-p.fwd.z, 0, p.fwd.x).normalize();
      if (w.skid > 0.25 && !onSoft) {
        _v.copy(w.point); _v.y += 0.03;
        g.skids.add(key, _v, _s, w.width * 0.9, Math.min(1, w.skid));
        if (Math.random() < w.skid * dt * 40 * g.fxScale) {
          g.particles.emit(_v, { x: p.vel.x * 0.2 + (Math.random() - 0.5), y: 0.6 + Math.random(), z: p.vel.z * 0.2 + (Math.random() - 0.5) },
            { size: 1.2, grow: 2.6, life: 1.8 + Math.random(), color: [0.82, 0.82, 0.84], alpha: 0.35 * Math.min(1, w.skid) });
        }
      } else g.skids.cut(key);
      if (onSoft && speed > 4 && Math.random() < Math.min(1, speed / 25) * dt * 30 * g.fxScale) {
        const c = DUST[w.surf] || [0.7, 0.6, 0.5];
        _v.copy(w.point); _v.y += 0.2;
        g.particles.emit(_v, { x: -p.vel.x * 0.1 + (Math.random() - 0.5) * 2, y: 0.8 + Math.random(), z: -p.vel.z * 0.1 + (Math.random() - 0.5) * 2 },
          { size: 1.4, grow: 3 + speed * 0.05, life: 2.2, color: c, alpha: Math.min(0.5, 0.12 + speed / 120 + w.skid * 0.3) });
      }
    }
    // étincelles en frottement
    if (p.scrape > 3 && p.contacts > 0 && Math.random() < 0.8) {
      for (let k = 0; k < 3; k++) {
        _v.copy(p.pos); _v.y += p.modelOffsetY + 0.2;
        g.particles.emit(_v, { x: p.vel.x * 0.4 + (Math.random() - 0.5) * 6, y: Math.random() * 4, z: p.vel.z * 0.4 + (Math.random() - 0.5) * 6 },
          { size: 0.12, life: 0.5, color: [1, 0.7, 0.3], alpha: 1, spark: true });
      }
    }
    // fumée d'échappement nitro
    if (p.nitroActive && Math.random() < 0.6) {
      this.flames[0].getWorldPosition(_v);
      g.particles.emit(_v, { x: p.vel.x * 0.5, y: 0.3, z: p.vel.z * 0.5 }, { size: 0.5, grow: 1.5, life: 0.6, color: [0.6, 0.75, 1], alpha: 0.25 });
    }
  }

  dispose() {
    this.game.scene.remove(this.root);
  }
}
