import { WorldGen } from '../src/world/worldgen.js';
import { Colliders } from '../src/world/colliders.js';
import { VehiclePhysics } from '../src/vehicle/physics.js';
import { CARS, derivePhysics } from '../src/vehicle/carDefs.js';
const world = new WorldGen();
const col = new Colliders();
for (const car of CARS) {
  const v = new VehiclePhysics(derivePhysics(car), world, col);
  v.place(3700, world.height(3700, -9380), -9380, -Math.PI / 2); // piste de l'aéroport vers l'est
  const dt = 1 / 120;
  for (let i = 0; i < 240; i++) v.step(dt);
  v.controls.throttle = 1;
  let t = 0, t100 = null, t200 = null, dist = 0;
  const x0 = v.pos.x;
  while (t < 60 && v.pos.x < 7650) {
    v.step(dt); t += dt;
    if (!t100 && v.speed * 3.6 >= 100) t100 = t;
    if (!t200 && v.speed * 3.6 >= 200) t200 = t;
  }
  console.log(car.id.padEnd(8), '0-100', t100?.toFixed(1), '0-200', t200?.toFixed(1) ?? '-', 'v@end', (v.speed * 3.6).toFixed(0), 'km/h', 'dist', (v.pos.x - x0).toFixed(0), 'up', v.up.y.toFixed(2), 'lat', v.pos.z.toFixed(1));
}
