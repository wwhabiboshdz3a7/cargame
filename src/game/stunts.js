// Détection et score des cascades : sauts, flips, tonneaux, 360, dérapages, deux roues, frôlements, combos.
import * as THREE from 'three';

const TAU = Math.PI * 2;
export const DA_PER_POINT = 20;

export class Stunts {
  constructor(game) {
    this.game = game;
    this.listeners = [];
    this.reset();
  }

  reset() {
    this.air = null;
    this.drift = null;
    this.twoWheels = 0;
    this.combo = { items: [], timer: 0, total: 0, mult: 1 };
    this.highSpeed = 0;
  }

  cancel() { this.air = null; this.drift = null; this.combo = { items: [], timer: 0, total: 0, mult: 1 }; this.game.hud.combo(null); }

  onScore(fn) { this.listeners.push(fn); return () => { this.listeners = this.listeners.filter((f) => f !== fn); }; }

  add(points, label, sub = '', color = '#ffd23f') {
    points = Math.round(points);
    if (points <= 0) return;
    const c = this.combo;
    c.items.push({ points, label });
    c.total += points;
    c.mult = Math.min(5, 1 + (c.items.length - 1) * 0.5);
    c.timer = 4;
    this.game.hud.popup(label, `+${points.toLocaleString('fr-FR')}${sub ? ' · ' + sub : ''}`, color);
    this.game.hud.combo(c);
    for (const f of this.listeners) f(points, label);
    if (this.game.player.phys.nitro !== undefined) this.game.player.phys.nitro = Math.min(1, this.game.player.phys.nitro + Math.min(0.3, points / 4000));
  }

  bank() {
    const c = this.combo;
    if (!c.items.length) return;
    const pts = Math.round(c.total * c.mult);
    const money = pts * DA_PER_POINT;
    this.game.save.addMoney(money);
    this.game.save.data.stats.stuntPoints += pts;
    if (c.items.length > 1) this.game.hud.popup(`COMBO x${c.mult.toFixed(1)}`, `${pts.toLocaleString('fr-FR')} pts · +${money.toLocaleString('fr-FR')} DA`, '#7CFC00');
    else this.game.hud.notify(`+${money.toLocaleString('fr-FR')} DA`);
    this.game.audio.cash();
    this.combo = { items: [], timer: 0, total: 0, mult: 1 };
    this.game.hud.combo(null);
  }

  onCrash(impact) {
    if (impact > 9 && (this.combo.items.length || this.drift)) {
      this.drift = null;
      if (this.combo.items.length) {
        this.game.hud.popup('COMBO PERDU', 'Collision !', '#ff4d4d');
        this.game.audio.fail();
      }
      this.combo = { items: [], timer: 0, total: 0, mult: 1 };
      this.game.hud.combo(null);
    } else if (impact > 4 && this.drift) {
      this.drift = null;
    }
  }

  nearMiss(speed) {
    if (speed < 15) return;
    this.add(150 + speed * 3, 'FRÔLEMENT', '', '#5ad1ff');
  }

  update(dt, veh) {
    const p = veh.phys;
    const g = this.game;
    const st = g.save.data.stats;
    const grounded = p.groundedWheels;
    const speed = p.speed;

    // ---------------- sauts
    if (grounded === 0 && !p.frozen) {
      if (!this.air) this.air = { t: 0, start: p.pos.clone(), maxH: 0, pitch: 0, roll: 0, yaw: 0 };
      const a = this.air;
      a.t += dt;
      a.pitch += p.angVel.dot(p.right) * dt;
      a.yaw += p.angVel.dot(p.up) * dt;
      a.roll += p.angVel.dot(p.fwd) * dt;
      const h = p.pos.y - Math.max(0, g.world.height(p.pos.x, p.pos.z));
      a.maxH = Math.max(a.maxH, h);
      if (a.t > 1.2) g.hud.airTime(a.t, a.maxH);
    } else if (this.air && grounded >= 2) {
      const a = this.air;
      this.air = null;
      g.hud.airTime(null);
      if (a.t > 0.75) {
        const dist = Math.hypot(p.pos.x - a.start.x, p.pos.z - a.start.z);
        const upright = p.up.y > 0.45;
        if (!upright) {
          g.hud.popup('ATTERRISSAGE RATÉ', `${dist.toFixed(0)} m`, '#ff4d4d');
          this.combo = { items: [], timer: 0, total: 0, mult: 1 };
          g.hud.combo(null);
        } else {
          const flips = Math.floor((Math.abs(a.pitch) + 0.9) / TAU);
          const rolls = Math.floor((Math.abs(a.roll) + 0.9) / TAU);
          const spins = Math.floor((Math.abs(a.yaw) + 0.7) / TAU);
          let pts = a.t * 140 + dist * 2.5 + a.maxH * 12;
          const parts = [];
          if (flips) { pts += flips * 900; parts.push(`${flips > 1 ? flips + 'x ' : ''}FLIP ${a.pitch < 0 ? 'AVANT' : 'ARRIÈRE'}`); st.flips += flips; }
          if (rolls) { pts += rolls * 800; parts.push(`${rolls > 1 ? rolls + 'x ' : ''}TONNEAU`); }
          if (spins) { pts += spins * 450; parts.push(`${spins * 360}°`); }
          let label = a.t > 3 ? 'MÉGA SAUT' : a.t > 1.8 ? 'GRAND SAUT' : 'SAUT';
          if (parts.length) label = parts.join(' + ');
          const perfect = p.up.y > 0.96;
          if (perfect) pts *= 1.2;
          this.add(pts, label, `${dist.toFixed(0)} m · ${a.t.toFixed(1)} s${perfect ? ' · Réception parfaite' : ''}`);
          if (dist > st.bestJump) { st.bestJump = dist; if (dist > 40) g.hud.notify(`Nouveau record de saut : ${dist.toFixed(1)} m !`); }
          this.lastJump = { dist, t: a.t, h: a.maxH };
          for (const f of this.listeners) f(0, 'jump', this.lastJump);
          g.cameraRig.addShake(Math.min(0.8, a.maxH / 12));
        }
      }
    }

    // ---------------- dérapage
    const beta = Math.abs(p.beta || 0);
    if (grounded >= 3 && speed > 9 && beta > 0.26 && p.vel.dot(p.fwd) > 0) {
      if (!this.drift) this.drift = { t: 0, pts: 0, calm: 0, maxB: 0 };
      const d = this.drift;
      d.t += dt;
      d.calm = 0;
      d.maxB = Math.max(d.maxB, beta);
      d.pts += speed * Math.min(1.2, beta) * dt * 9;
      g.hud.drift(d.pts, beta);
    } else if (this.drift) {
      const d = this.drift;
      d.calm += dt;
      if (d.calm > 0.55 || speed < 6 || grounded < 2) {
        this.drift = null;
        g.hud.drift(null);
        if (d.pts > 120 && d.t > 1) {
          this.add(d.pts, d.t > 4 ? 'DÉRAPAGE ÉPIQUE' : d.t > 2.2 ? 'GRAND DÉRAPAGE' : 'DÉRAPAGE', `${d.t.toFixed(1)} s · ${(d.maxB * 57.3).toFixed(0)}°`, '#ff9f1c');
          st.bestDrift = Math.max(st.bestDrift, d.pts);
          for (const f of this.listeners) f(0, 'drift', d);
        }
      }
    }

    // ---------------- deux roues
    const w = p.wheels;
    const leftOn = w[0].contact || w[2].contact, rightOn = w[1].contact || w[3].contact;
    const leftOff = !w[0].contact && !w[2].contact, rightOff = !w[1].contact && !w[3].contact;
    if (speed > 4 && ((leftOn && rightOff) || (rightOn && leftOff)) && Math.abs(p.up.y) > 0.3) {
      this.twoWheels += dt;
      if (this.twoWheels > 0.9) g.hud.drift(this.twoWheels * 100, 0, 'SUR DEUX ROUES');
    } else if (this.twoWheels > 0) {
      if (this.twoWheels > 1.2) this.add(this.twoWheels * 260, 'SUR DEUX ROUES', `${this.twoWheels.toFixed(1)} s`, '#c77dff');
      if (!this.drift) g.hud.drift(null);
      this.twoWheels = 0;
    }

    // ---------------- looping et wall ride (roues au contact, voiture inclinée / à l'envers)
    if (grounded >= 2 && p.up.y < -0.75) this.inverted = true;
    if (this.inverted && grounded >= 3 && p.up.y > 0.85) {
      this.inverted = false;
      this.add(2500 + speed * 10, 'LOOPING !', `${(speed * 3.6).toFixed(0)} km/h`, '#ff5ac8');
    }
    if (grounded === 0 && this.inverted && !this.air) this.inverted = false;
    if (grounded >= 3 && p.up.y < 0.45 && p.up.y > -0.6 && speed > 12) {
      this.wall = (this.wall || 0) + dt;
      if (this.wall > 0.8) g.hud.drift(this.wall * 300, 0, 'WALL RIDE');
    } else if (this.wall) {
      if (this.wall > 1.2 && !this.inverted) this.add(this.wall * 380, 'WALL RIDE', `${this.wall.toFixed(1)} s`, '#4cc9f0');
      if (!this.drift) g.hud.drift(null);
      this.wall = 0;
    }

    // ---------------- grande vitesse
    if (speed * 3.6 > 220 && grounded >= 3) {
      this.highSpeed += dt;
      if (this.highSpeed > 3) { this.add(speed * 4, 'VITESSE EXTRÊME', `${(speed * 3.6).toFixed(0)} km/h`, '#00e5ff'); this.highSpeed = -6; }
    } else if (this.highSpeed > 0) this.highSpeed = 0;
    else if (this.highSpeed < 0) this.highSpeed = Math.min(0, this.highSpeed + dt);

    // ---------------- combo
    const c = this.combo;
    if (c.items.length && !this.air && !this.drift) {
      c.timer -= dt;
      g.hud.comboTimer(c.timer / 4);
      if (c.timer <= 0) this.bank();
    }
  }
}

export { THREE };
