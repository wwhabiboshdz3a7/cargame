// Sauvegarde locale (localStorage) : argent, garage, records, paramètres.
import { CARS, defaultConfig } from '../vehicle/carDefs.js';

const KEY = 'dzdrive_save_v1';

export const DEFAULT_SETTINGS = {
  quality: 'auto', volume: 0.8, music: 0.5, sfx: 0.9, camera: 0, manual: false,
  abs: true, tcs: true, esc: false, steerAssist: true, minimap: true, timeCycle: true, startHour: 10.5,
  traffic: 'medium', unlockAll: false, units: 'kmh', fpsCounter: false, motionFx: true,
};

function fresh() {
  const cars = {};
  for (const c of CARS) cars[c.id] = { owned: c.price === 0, cfg: defaultConfig(c) };
  return {
    version: 1, money: 1500000, selected: 'atlas', cars, records: {}, medals: {}, collected: [], discovered: [],
    stats: { distance: 0, bestJump: 0, bestDrift: 0, topSpeed: 0, flips: 0, races: 0, wins: 0, stuntPoints: 0 },
    settings: { ...DEFAULT_SETTINGS }, lastPos: null,
  };
}

export class Save {
  constructor() {
    this.data = fresh();
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const d = JSON.parse(raw);
        this.data = { ...fresh(), ...d, settings: { ...DEFAULT_SETTINGS, ...(d.settings || {}) }, stats: { ...fresh().stats, ...(d.stats || {}) } };
        for (const c of CARS) {
          if (!this.data.cars[c.id]) this.data.cars[c.id] = { owned: c.price === 0, cfg: defaultConfig(c) };
          const def = defaultConfig(c);
          this.data.cars[c.id].cfg = { ...def, ...this.data.cars[c.id].cfg, upgrades: { ...def.upgrades, ...(this.data.cars[c.id].cfg.upgrades || {}) }, owned: { ...def.owned, ...(this.data.cars[c.id].cfg.owned || {}) } };
        }
      }
    } catch (e) { console.warn('Sauvegarde illisible, réinitialisation', e); }
    this._t = 0;
  }

  get settings() { return this.data.settings; }
  carState(id) { return this.data.cars[id]; }
  isOwned(id) { return this.data.settings.unlockAll || this.data.cars[id]?.owned; }

  addMoney(v) { this.data.money = Math.max(0, Math.round(this.data.money + v)); this.persist(); }

  persist() {
    try { localStorage.setItem(KEY, JSON.stringify(this.data)); } catch { /* stockage indisponible */ }
  }

  // sauvegarde différée (au plus toutes les 5 s)
  tick(dt) { this._t += dt; if (this._t > 5) { this._t = 0; this.persist(); } }

  reset() { this.data = fresh(); this.persist(); }
}
