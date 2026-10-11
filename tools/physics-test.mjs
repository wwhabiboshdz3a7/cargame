import { WorldGen } from '../src/world/worldgen.js';
import { Colliders } from '../src/world/colliders.js';
import { VehiclePhysics } from '../src/vehicle/physics.js';
import { CAR_BY_ID, derivePhysics } from '../src/vehicle/carDefs.js';

const world = new WorldGen();
const col = new Colliders();
const id = process.argv[2] || 'atlas';
const car = CAR_BY_ID[id];
const v = new VehiclePhysics(derivePhysics(car), world, col);
// A1 près de J_RN1, direction est
const x = 0, z = -6480;
world.queryRoad(x, z);
const yaw = Math.atan2(-world.rtx, -world.rtz);
v.place(x, world.height(x, z), z, yaw);
const dt = 1 / 120;
const log = (t) => console.log(`t=${t.toFixed(1)} v=${(v.speed * 3.6).toFixed(1)}km/h gear=${v.gear} rpm=${v.rpm.toFixed(0)} y=${(v.pos.y - world.height(v.pos.x, v.pos.z)).toFixed(2)} up=${v.up.y.toFixed(3)} gw=${v.groundedWheels} comp=${v.wheels.map((w) => w.comp.toFixed(3)).join(',')}`);
let t = 0, t100 = null;
for (let i = 0; i < 120 * 2; i++) { v.step(dt); t += dt; }
log(t);
v.controls.throttle = 1;
for (let i = 0; i < 120 * 30; i++) {
  v.step(dt); t += dt;
  if (!t100 && v.speed * 3.6 >= 100) t100 = t - 2;
  if (i % 600 === 0) log(t);
}
console.log('0-100 km/h:', t100?.toFixed(2), 's  vmax after 30s:', (v.speed * 3.6).toFixed(0));
v.controls.throttle = 0; v.controls.brake = 1;
let tb = 0; const v0 = v.speed;
while (v.speed > 0.5 && tb < 20) { v.step(dt); tb += dt; }
console.log('braking from', (v0 * 3.6).toFixed(0), 'in', tb.toFixed(2), 's');
log(t);
// virage
v.controls.brake = 0; v.controls.throttle = 0.6;
for (let i = 0; i < 120 * 6; i++) { v.step(dt); }
v.controls.steer = 1;
for (let i = 0; i < 120 * 4; i++) { v.step(dt); if (i % 120 === 0) log(i / 120); }
console.log('nan?', isNaN(v.pos.x));
