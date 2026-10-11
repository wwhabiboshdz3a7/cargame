// Caméras : poursuite (2 distances), capot, pare-chocs, cinématique, drone.
import * as THREE from 'three';

export const CAM_MODES = ['Poursuite', 'Poursuite proche', 'Capot', 'Pare-chocs', 'Cinématique', 'Drone'];
const _v = new THREE.Vector3(), _t = new THREE.Vector3(), _f = new THREE.Vector3();

export class CameraRig {
  constructor(camera, world) {
    this.cam = camera;
    this.world = world;
    this.mode = 0;
    this.yaw = 0;
    this.pitch = 0.18;
    this.orbitYaw = 0;
    this.orbitPitch = 0;
    this.orbitTimer = 0;
    this.pos = new THREE.Vector3();
    this.look = new THREE.Vector3();
    this.shake = 0;
    this.baseFov = 65;
    this.cine = null;
    this.initialized = false;
  }

  next() { this.mode = (this.mode + 1) % CAM_MODES.length; this.cine = null; return CAM_MODES[this.mode]; }

  addShake(a) { this.shake = Math.min(1.5, this.shake + a); }

  reset() { this.initialized = false; }

  update(dt, veh, input, lookBack = false) {
    const p = veh.phys;
    const root = veh.root;
    const carPos = root.position;
    const q = root.quaternion;
    const fwd = _f.set(0, 0, -1).applyQuaternion(q);
    const speed = p.speed;
    const L = veh.car.body.L;
    // orbite libre (souris / stick droit)
    const d = input.drive();
    const mdx = input.mouse.dx * 0.004, mdy = input.mouse.dy * 0.003;
    if (Math.abs(d.lookX) > 0.05 || Math.abs(d.lookY) > 0.05 || mdx || mdy) {
      this.orbitYaw -= (d.lookX * 2.6 * dt + mdx);
      this.orbitPitch = Math.max(-0.25, Math.min(1.1, this.orbitPitch + d.lookY * 1.6 * dt + mdy));
      this.orbitTimer = 1.5;
    } else {
      this.orbitTimer -= dt;
      if (this.orbitTimer < 0) { this.orbitYaw *= 1 - Math.min(1, dt * 2.5); this.orbitPitch *= 1 - Math.min(1, dt * 2.5); }
    }
    let fov = this.baseFov + Math.min(20, speed * 0.16) + (p.nitroActive ? 7 : 0);

    if (this.mode <= 1) {
      const far = this.mode === 0;
      const dist = (far ? 5.2 : 3.6) + L * (far ? 0.75 : 0.55);
      const height = far ? 2.0 : 1.35;
      // cap désiré : vers la vitesse si rapide (dérive), sinon le cap de la voiture
      let heading = Math.atan2(-fwd.x, -fwd.z);
      if (speed > 6 && p.groundedWheels > 0) {
        const vh = Math.atan2(-p.vel.x, -p.vel.z);
        const fwdSpeed = p.vel.dot(fwd);
        if (fwdSpeed > 0) heading = lerpAngle(heading, vh, 0.35);
      }
      if (p.groundedWheels === 0 && this.initialized) heading = this.yaw; // pas de rotation brutale en l'air
      if (!this.initialized) { this.yaw = heading; }
      this.yaw = lerpAngle(this.yaw, heading, 1 - Math.exp(-dt * (p.groundedWheels ? 5 : 1.2)));
      const yaw = this.yaw + this.orbitYaw + (lookBack ? Math.PI : 0);
      const pitch = 0.16 + this.orbitPitch;
      _t.set(carPos.x + Math.sin(yaw) * dist * Math.cos(pitch), carPos.y + height + Math.sin(pitch) * dist, carPos.z + Math.cos(yaw) * dist * Math.cos(pitch));
      if (!this.initialized) { this.pos.copy(_t); this.initialized = true; }
      const k = 1 - Math.exp(-dt * 10);
      this.pos.lerp(_t, k);
      // contrainte de distance stricte (évite le retard à haute vitesse)
      _v.subVectors(this.pos, carPos);
      const len = _v.length();
      if (len > dist * 1.25) this.pos.copy(carPos).addScaledVector(_v, (dist * 1.25) / len);
      const gh = this.world.height(this.pos.x, this.pos.z);
      if (this.pos.y < gh + 0.6) this.pos.y = gh + 0.6;
      this.look.set(carPos.x, carPos.y + 0.9, carPos.z).addScaledVector(fwd, lookBack ? -2 : 2);
      this.cam.position.copy(this.pos);
      this.cam.up.set(0, 1, 0);
      this.cam.lookAt(this.look);
    } else if (this.mode === 2 || this.mode === 3) {
      const b = veh.car.body;
      const hood = this.mode === 2;
      const local = hood
        ? new THREE.Vector3(0, Math.max(...b.top.map((t) => t[1])) * 0.82 + p.modelOffsetY + 0.08, -L / 2 + L * (b.ws[0] + 0.02))
        : new THREE.Vector3(0, 0.45 + p.modelOffsetY, -L / 2 - 0.05);
      this.cam.position.copy(local).applyQuaternion(q).add(carPos);
      const dir = new THREE.Vector3(0, -0.03, lookBack ? 1 : -1).applyQuaternion(q);
      dir.applyAxisAngle(new THREE.Vector3(0, 1, 0).applyQuaternion(q), this.orbitYaw);
      this.cam.up.set(0, 1, 0).applyQuaternion(q);
      this.cam.lookAt(_v.copy(this.cam.position).add(dir));
      fov += 5;
      this.initialized = false;
    } else if (this.mode === 4) {
      // cinématique : caméras fixes au bord de la route
      const v = p.vel.lengthSq() > 4 ? p.vel.clone().normalize() : fwd.clone();
      if (!this.cine || this.cine.distanceTo(carPos) > 90) {
        const side = Math.random() < 0.5 ? -1 : 1;
        const ahead = 45 + Math.random() * 30;
        this.cine = new THREE.Vector3(carPos.x + v.x * ahead + -v.z * side * (8 + Math.random() * 8), 0, carPos.z + v.z * ahead + v.x * side * (8 + Math.random() * 8));
        this.cine.y = Math.max(0.5, this.world.height(this.cine.x, this.cine.z)) + 1.5 + Math.random() * 3;
      }
      this.cam.position.copy(this.cine);
      this.cam.up.set(0, 1, 0);
      this.cam.lookAt(carPos.x, carPos.y + 0.6, carPos.z);
      fov = Math.max(18, Math.min(60, 1400 / Math.max(10, this.cine.distanceTo(carPos))));
      this.initialized = false;
    } else {
      // drone
      const yaw = this.yaw + this.orbitYaw;
      this.yaw = lerpAngle(this.yaw, Math.atan2(-fwd.x, -fwd.z), 1 - Math.exp(-dt * 2));
      _t.set(carPos.x + Math.sin(yaw) * 34, carPos.y + 16 + this.orbitPitch * 20, carPos.z + Math.cos(yaw) * 34);
      if (!this.initialized || this.pos.distanceTo(_t) > 200) { this.pos.copy(_t); this.initialized = true; }
      this.pos.lerp(_t, 1 - Math.exp(-dt * 4));
      this.cam.position.copy(this.pos);
      this.cam.up.set(0, 1, 0);
      this.cam.lookAt(carPos.x, carPos.y + 2, carPos.z);
      fov = 58;
    }
    // secousses
    if (this.shake > 0.001) {
      const s = this.shake * 0.25;
      this.cam.position.x += (Math.random() - 0.5) * s;
      this.cam.position.y += (Math.random() - 0.5) * s;
      this.cam.position.z += (Math.random() - 0.5) * s;
      this.shake *= Math.exp(-dt * 6);
    }
    // vibration à très haute vitesse
    if (speed > 50 && this.mode <= 1) this.cam.position.y += (Math.random() - 0.5) * 0.012 * (speed - 50) / 20;
    this.cam.fov += (fov - this.cam.fov) * Math.min(1, dt * 4);
    this.cam.updateProjectionMatrix();
  }

  // Caméra orbitale lente (menus)
  orbit(dt, target, radius = 9, height = 2.6) {
    this.menuAngle = (this.menuAngle || 0) + dt * 0.12;
    this.cam.position.set(target.x + Math.sin(this.menuAngle) * radius, target.y + height, target.z + Math.cos(this.menuAngle) * radius);
    this.cam.up.set(0, 1, 0);
    this.cam.lookAt(target.x, target.y + 0.6, target.z);
    this.cam.fov = 50;
    this.cam.updateProjectionMatrix();
    this.initialized = false;
  }
}

export function lerpAngle(a, b, t) {
  let d = ((b - a + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
  return a + d * t;
}
