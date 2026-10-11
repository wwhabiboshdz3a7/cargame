// Activités libres : fennecs dorés à collectionner, radars de vitesse, découverte des lieux.
import * as THREE from 'three';
import { POIS } from '../world/layout.js';
import { mulberry32 } from '../world/noise.js';

export const FENNEC_COUNT = 30;

export class Activities {
  constructor(game) {
    this.game = game;
    const w = game.world;
    const rand = mulberry32(31337);
    // fennecs dorés : près des lieux d'intérêt et le long des routes
    this.fennecs = [];
    const add = (x, z) => this.fennecs.push({ id: this.fennecs.length, x, z, y: Math.max(0.5, w.height(x, z)) });
    for (const p of POIS) {
      const a = rand() * Math.PI * 2, r = 40 + rand() * 120;
      add(p.x + Math.cos(a) * r, p.z + Math.sin(a) * r);
    }
    const roads = w.roads.filter((r) => r.type !== 'city');
    while (this.fennecs.length < FENNEC_COUNT) {
      const r = roads[Math.floor(rand() * roads.length)];
      const i = Math.floor(rand() * r.n);
      const side = rand() < 0.5 ? -1 : 1;
      const j = Math.min(r.n - 1, i + 1);
      const tx = r.xs[j] - r.xs[i], tz = r.zs[j] - r.zs[i];
      const L = Math.hypot(tx, tz) || 1;
      const off = r.hw + 20 + rand() * 60;
      const x = r.xs[i] + (-tz / L) * off * side, z = r.zs[i] + (tx / L) * off * side;
      if (w.height(x, z) < 1) continue;
      add(x, z);
    }
    // modèle : tête de fennec stylisée dorée + faisceau
    const gold = new THREE.MeshStandardMaterial({ color: 0xffc533, metalness: 1, roughness: 0.25, emissive: 0x553300, emissiveIntensity: 0.6 });
    const head = new THREE.Group();
    const face = new THREE.Mesh(new THREE.ConeGeometry(0.55, 1.1, 8).rotateX(Math.PI / 2), gold);
    const skull = new THREE.Mesh(new THREE.SphereGeometry(0.55, 12, 10), gold);
    skull.position.z = -0.35;
    for (const sd of [-1, 1]) {
      const ear = new THREE.Mesh(new THREE.ConeGeometry(0.32, 1.3, 6), gold);
      ear.position.set(sd * 0.38, 0.85, -0.45); ear.rotation.z = -sd * 0.35;
      head.add(ear);
    }
    face.position.z = 0.4;
    head.add(face, skull);
    const beamMat = new THREE.MeshBasicMaterial({ color: 0xffd34d, transparent: true, opacity: 0.18, blending: THREE.AdditiveBlending, depthWrite: false });
    this.group = new THREE.Group();
    game.scene.add(this.group);
    const collected = new Set(game.save.data.collected);
    for (const f of this.fennecs) {
      const g = head.clone();
      g.position.set(f.x, f.y + 1.6, f.z);
      const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, 120, 8, 1, true), beamMat);
      beam.position.y = 58;
      g.add(beam);
      f.mesh = g;
      f.taken = collected.has(f.id);
      g.visible = !f.taken;
      this.group.add(g);
    }
    // radars
    const radarSpots = [['A1', 0.25], ['A1', 0.62], ['A1', 0.85], ['RN1', 0.82], ['RN1', 0.55], ['CORNICHE_E', 0.5], ['STEPPE', 0.4], ['PISTE_TASSILI', 0.5]];
    this.radars = [];
    const poleMat = new THREE.MeshStandardMaterial({ color: 0x9aa0a6, metalness: 0.7, roughness: 0.4 });
    const boxMat = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.5 });
    const flashMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0 });
    for (const [rid, f] of radarSpots) {
      const r = w.roads.find((q) => q.id === rid);
      if (!r) continue;
      const i = Math.floor(r.n * f);
      const j = Math.min(r.n - 1, i + 1);
      const tx = r.xs[j] - r.xs[i], tz = r.zs[j] - r.zs[i];
      const L = Math.hypot(tx, tz) || 1;
      const x = r.xs[i] + (-tz / L) * (r.hw + 2.5), z = r.zs[i] + (tx / L) * (r.hw + 2.5);
      const y = w.height(x, z);
      const g = new THREE.Group();
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 4.5, 8), poleMat); pole.position.y = 2.25;
      const box = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.6, 0.9), boxMat); box.position.y = 4.6;
      const flash = new THREE.Mesh(new THREE.SphereGeometry(0.8, 8, 6), flashMat.clone()); flash.position.y = 4.6;
      g.add(pole, box, flash);
      g.position.set(x, y, z);
      g.rotation.y = Math.atan2(tx, tz);
      game.scene.add(g);
      game.colliders.addCylinder(x, z, 0.2, y, y + 5, 5);
      this.radars.push({ x: r.xs[i], z: r.zs[i], flash, cool: 0, name: r.name });
    }
    this.discovered = new Set(game.save.data.discovered);
    this.lastLoc = null;
  }

  update(dt) {
    const g = this.game;
    const p = g.player.phys;
    const pos = p.pos;
    const t = g.time;
    for (const f of this.fennecs) {
      if (f.taken) continue;
      const d = Math.hypot(pos.x - f.x, pos.z - f.z);
      f.mesh.visible = d < 1500;
      if (!f.mesh.visible) continue;
      f.mesh.rotation.y = t * 1.5;
      f.mesh.position.y = f.y + 1.6 + Math.sin(t * 2 + f.id) * 0.25;
      if (d < 4.5 && Math.abs(pos.y - f.y) < 6) {
        f.taken = true;
        f.mesh.visible = false;
        g.save.data.collected.push(f.id);
        const n = g.save.data.collected.length;
        const reward = n === FENNEC_COUNT ? 5000000 : 250000;
        g.save.addMoney(reward);
        g.audio.success();
        g.hud.popup('FENNEC DORÉ', `${n} / ${FENNEC_COUNT} · +${reward.toLocaleString('fr-FR')} DA`, '#ffd23f');
      }
    }
    for (const r of this.radars) {
      r.cool -= dt;
      r.flash.material.opacity = Math.max(0, r.flash.material.opacity - dt * 3);
      const d = Math.hypot(pos.x - r.x, pos.z - r.z);
      if (d < 16 && r.cool <= 0 && p.speed > 16) {
        r.cool = 6;
        r.flash.material.opacity = 1;
        const kmh = Math.round(p.speed * 3.6);
        const key = 'radar_' + r.name;
        const best = g.save.data.records[key] || 0;
        const rec = kmh > best;
        if (rec) g.save.data.records[key] = kmh;
        const reward = Math.max(0, (kmh - 100) * 800);
        if (reward) g.save.addMoney(reward);
        g.audio.beep(2000, 0.08, 'sine', 0.2);
        g.hud.popup(`RADAR : ${kmh} km/h`, rec ? `Nouveau record ! ${reward ? '+' + reward.toLocaleString('fr-FR') + ' DA' : ''}` : `Record : ${best} km/h`, '#ffffff');
      }
    }
    // découverte des lieux
    for (const poi of POIS) {
      if (this.discovered.has(poi.id)) continue;
      if (Math.hypot(pos.x - poi.x, pos.z - poi.z) < 350) {
        this.discovered.add(poi.id);
        g.save.data.discovered.push(poi.id);
        g.save.addMoney(50000);
        g.hud.popup('LIEU DÉCOUVERT', `${poi.name} · ${poi.ar} · +50 000 DA`, '#9bf6ff');
      }
    }
    const loc = g.location();
    if (loc !== this.lastLoc) { this.lastLoc = loc; g.hud.location(loc); }
  }
}
