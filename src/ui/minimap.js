// Carte du monde, mini-carte et GPS.
import { WORLD_HALF, POIS, CITY } from '../world/layout.js';
import { Path } from '../game/ai.js';

const ROAD_STYLE = {
  highway: { w: 7, c: '#ffb347', o: '#5a3a10' }, national: { w: 4.5, c: '#ffe066', o: '#4a4010' },
  mountain: { w: 3.5, c: '#ffd9a0', o: '#4a3a20' }, piste: { w: 3, c: '#c8946a', o: null, dash: [6, 5] }, city: { w: 2.6, c: '#d8dde0', o: null },
};
export const POI_ICON = { city: '🏙', port: '⚓', landmark: '★', airport: '✈', stunt: '🏁', highway: '🛣', mountain: '⛰', forest: '🌲', lake: '◈', steppe: '🌾', desert: '🏜', ruins: '🏛', beach: '🏖' };

export class Minimap {
  constructor(game) {
    this.game = game;
    this.mapCanvas = document.createElement('canvas');
    this.mapCanvas.width = this.mapCanvas.height = 1024;
    const c = this.mapCanvas.getContext('2d');
    c.fillStyle = '#2a4a5a'; c.fillRect(0, 0, 1024, 1024);
    this.ready = false;
    this.gps = null;
    // découpage des routes pour l'élimination rapide
    this.chunks = [];
    for (const r of game.world.roads) {
      for (let i0 = 0; i0 < r.n - 1; i0 += 40) {
        const i1 = Math.min(r.n - 1, i0 + 40);
        let x0 = 1e9, z0 = 1e9, x1 = -1e9, z1 = -1e9;
        for (let i = i0; i <= i1; i++) { x0 = Math.min(x0, r.xs[i]); x1 = Math.max(x1, r.xs[i]); z0 = Math.min(z0, r.zs[i]); z1 = Math.max(z1, r.zs[i]); }
        this.chunks.push({ r, i0, i1, x0, z0, x1, z1, style: ROAD_STYLE[r.type] });
      }
    }
    this.chunks.sort((a, b) => order(a.r.type) - order(b.r.type));
  }

  requestMap() {
    const pool = this.game.pool;
    const N = pool.mainThread ? 512 : 1024;
    pool.submit({
      prio: 5, key: -1,
      msg: { type: 'map', key: -1, N, x0: -WORLD_HALF, z0: -WORLD_HALF, x1: WORLD_HALF, z1: WORLD_HALF },
      cb: (m) => {
        const tmp = document.createElement('canvas');
        tmp.width = tmp.height = m.N;
        tmp.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(m.img.buffer), m.N, m.N), 0, 0);
        const c = this.mapCanvas.getContext('2d');
        c.imageSmoothingEnabled = true;
        c.drawImage(tmp, 0, 0, 1024, 1024);
        // ville
        c.fillStyle = 'rgba(200,200,195,0.55)';
        const s = 1024 / (WORLD_HALF * 2);
        c.fillRect((CITY.x0 + WORLD_HALF) * s, (CITY.z0 + WORLD_HALF) * s, (CITY.x1 - CITY.x0) * s, (CITY.z1 - CITY.z0) * s);
        this.ready = true;
      },
    });
  }

  // -------------------------------------------------------------- GPS
  setDestination(x, z, name) {
    const w = this.game.world;
    const G = w.graph;
    const p = this.game.player.phys.pos;
    const nearest = (px, pz) => {
      let best = -1, bd = Infinity;
      for (const n of G.nodes) { const d = (n.x - px) ** 2 + (n.z - pz) ** 2; if (d < bd) { bd = d; best = n.id; } }
      return best;
    };
    const a = nearest(p.x, p.z), b = nearest(x, z);
    if (a < 0 || b < 0) return;
    const names = [G.nodes[a].name, G.nodes[b].name];
    const pts = a === b ? [[G.nodes[a].x, G.nodes[a].z, 0]] : this.game.events.graphPath(names);
    pts.push([x, z, 0]);
    this.gps = { x, z, name, pts, path: pts.length > 1 ? new Path(pts) : null, remaining: 0, t: 0 };
    this.updateGps(0, true);
  }

  clearGps() { this.gps = null; }

  updateGps(dt, force = false) {
    const g = this.gps;
    if (!g) return;
    g.t += dt;
    if (g.t < 0.5 && !force) return;
    g.t = 0;
    const p = this.game.player.phys.pos;
    if (Math.hypot(p.x - g.x, p.z - g.z) < 60) { this.game.hud.notify(`Arrivé : ${g.name}`); this.gps = null; return; }
    if (g.path) {
      const pr = g.path.project(p.x, p.z, g.idx ?? -1);
      g.idx = pr.i;
      g.remaining = g.path.length - pr.s;
      if (pr.dist > 120 && !force) { this.setDestination(g.x, g.z, g.name); }
    } else g.remaining = Math.hypot(p.x - g.x, p.z - g.z);
  }

  // -------------------------------------------------------------- dessin générique
  // view : { cx, cz, scale (px/m), rot (rad), w, h }
  drawWorld(ctx, view, opts = {}) {
    const g = this.game;
    const { cx, cz, scale, rot, w, h } = view;
    ctx.save();
    ctx.translate(w / 2, h / 2);
    ctx.rotate(rot);
    ctx.scale(scale, scale);
    ctx.translate(-cx, -cz);
    // fond
    const ms = (WORLD_HALF * 2) / 1024;
    ctx.imageSmoothingEnabled = true;
    ctx.fillStyle = '#1d4f6e';
    const ext = (Math.hypot(w, h) / scale) * 0.6;
    ctx.fillRect(cx - ext, cz - ext, ext * 2, ext * 2);
    ctx.drawImage(this.mapCanvas, -WORLD_HALF, -WORLD_HALF, 1024 * ms, 1024 * ms);
    // routes
    const x0 = cx - ext, x1 = cx + ext, z0 = cz - ext, z1 = cz + ext;
    const minPx = 1 / scale;
    for (const pass of [0, 1]) {
      for (const ch of this.chunks) {
        if (ch.x1 < x0 || ch.x0 > x1 || ch.z1 < z0 || ch.z0 > z1) continue;
        const st = ch.style;
        if (ch.r.type === 'city' && scale < 0.05) continue;
        if (pass === 0 && !st.o) continue;
        ctx.beginPath();
        const step = scale < 0.05 ? 4 : scale < 0.2 ? 2 : 1;
        ctx.moveTo(ch.r.xs[ch.i0], ch.r.zs[ch.i0]);
        for (let i = ch.i0 + step; i <= ch.i1; i += step) ctx.lineTo(ch.r.xs[i], ch.r.zs[i]);
        ctx.lineTo(ch.r.xs[ch.i1], ch.r.zs[ch.i1]);
        const wpx = Math.max(st.w * (opts.big ? 0.6 : 1), 1.2);
        ctx.lineWidth = (pass === 0 ? wpx + 2.5 : wpx) * minPx;
        ctx.strokeStyle = pass === 0 ? st.o : st.c;
        ctx.setLineDash(st.dash && pass === 1 ? st.dash.map((d) => d * minPx) : []);
        ctx.lineJoin = 'round';
        ctx.stroke();
      }
    }
    ctx.setLineDash([]);
    // itinéraire de course
    const ev = g.events;
    if (ev.active && ev.path) this.strokePath(ctx, ev.path, '#ffd23f', 5 * minPx, ev.path.closed);
    // GPS
    if (this.gps) this.strokePts(ctx, this.gps.pts, '#36e0ff', 5 * minPx);
    // point de passage suivant
    if (ev.active && ev.cps && ev.cps[ev.cpIndex]) {
      const pt = ev.path.pointAt(ev.cps[ev.cpIndex].s, {});
      ctx.beginPath(); ctx.arc(pt.x, pt.z, 9 * minPx * (1 + 0.2 * Math.sin(g.time * 6)), 0, Math.PI * 2);
      ctx.fillStyle = '#ffd23f'; ctx.fill(); ctx.lineWidth = 2 * minPx; ctx.strokeStyle = '#000'; ctx.stroke();
    }
    ctx.restore();
    // icônes (non tournées)
    const toScreen = (x, z) => {
      const dx = (x - cx) * scale, dz = (z - cz) * scale;
      const c = Math.cos(rot), s = Math.sin(rot);
      return [w / 2 + dx * c - dz * s, h / 2 + dx * s + dz * c];
    };
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const inView = ([sx, sy], m = 10) => sx > -m && sy > -m && sx < w + m && sy < h + m;
    if (opts.pois !== false) {
      ctx.font = `${opts.big ? 22 : 26}px sans-serif`;
      for (const p of POIS) {
        const sp = toScreen(p.x, p.z);
        if (!inView(sp)) continue;
        ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.beginPath(); ctx.arc(sp[0], sp[1], opts.big ? 15 : 17, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#fff'; ctx.fillText(POI_ICON[p.icon] || '•', sp[0], sp[1] + 1);
        if (opts.labels) {
          ctx.font = '600 15px Rajdhani, sans-serif'; ctx.fillStyle = '#fff'; ctx.strokeStyle = 'rgba(0,0,0,0.8)'; ctx.lineWidth = 3;
          ctx.strokeText(p.name, sp[0], sp[1] + 26); ctx.fillText(p.name, sp[0], sp[1] + 26);
          ctx.font = `${opts.big ? 22 : 26}px sans-serif`;
        }
      }
    }
    // épreuves
    const colors = { sprint: '#ffb703', circuit: '#ffb703', timetrial: '#3a86ff', rally: '#fb5607', drag: '#ff006e', stunt: '#8338ec', longjump: '#8338ec', drift: '#06d6a0' };
    for (const m of ev.markers) {
      const sp = toScreen(m.x, m.z);
      if (!inView(sp)) continue;
      ctx.beginPath(); ctx.arc(sp[0], sp[1], opts.big ? 9 : 12, 0, Math.PI * 2);
      ctx.fillStyle = colors[m.ev.type] || '#fff'; ctx.fill(); ctx.lineWidth = 2.5; ctx.strokeStyle = '#000'; ctx.stroke();
      ctx.fillStyle = '#000'; ctx.font = `bold ${opts.big ? 11 : 14}px sans-serif`; ctx.fillText('🏁', sp[0], sp[1] + 1);
      if (opts.labels) { ctx.font = '600 14px Rajdhani, sans-serif'; ctx.fillStyle = '#ffd'; ctx.fillText(m.ev.name, sp[0], sp[1] - 18); }
    }
    // fennecs (proches seulement sur la mini-carte)
    const act = g.activities;
    for (const f of act.fennecs) {
      if (f.taken) continue;
      if (!opts.big && Math.hypot(f.x - g.player.phys.pos.x, f.z - g.player.phys.pos.z) > 600) continue;
      if (opts.big && !opts.showFennecs) continue;
      const sp = toScreen(f.x, f.z);
      if (!inView(sp)) continue;
      ctx.beginPath(); ctx.arc(sp[0], sp[1], 6, 0, Math.PI * 2); ctx.fillStyle = '#ffd23f'; ctx.fill();
      ctx.lineWidth = 2; ctx.strokeStyle = '#6b4b00'; ctx.stroke();
    }
    // concurrents
    for (const v of g.vehicles) {
      if (v === g.player || !v.ai || v.traffic) continue;
      const sp = toScreen(v.phys.pos.x, v.phys.pos.z);
      if (!inView(sp)) continue;
      ctx.beginPath(); ctx.arc(sp[0], sp[1], 6, 0, Math.PI * 2); ctx.fillStyle = '#ff4d4d'; ctx.fill(); ctx.strokeStyle = '#000'; ctx.lineWidth = 2; ctx.stroke();
    }
    // destination GPS
    if (this.gps) {
      const sp = toScreen(this.gps.x, this.gps.z);
      ctx.font = '26px sans-serif'; ctx.fillText('📍', sp[0], sp[1] - 10);
    }
    // joueur
    const p = g.player.phys;
    const heading = Math.atan2(p.fwd.x, -p.fwd.z);
    const sp = toScreen(p.pos.x, p.pos.z);
    ctx.save();
    ctx.translate(sp[0], sp[1]);
    ctx.rotate(heading + rot);
    ctx.beginPath(); ctx.moveTo(0, -15); ctx.lineTo(10, 11); ctx.lineTo(0, 5); ctx.lineTo(-10, 11); ctx.closePath();
    ctx.fillStyle = '#ffffff'; ctx.fill(); ctx.lineWidth = 3; ctx.strokeStyle = '#d21034'; ctx.stroke();
    ctx.restore();
    return toScreen;
  }

  strokePath(ctx, path, color, width, closed) {
    ctx.beginPath();
    ctx.moveTo(path.x[0], path.z[0]);
    for (let i = 1; i < path.n; i += 2) ctx.lineTo(path.x[i], path.z[i]);
    if (closed) ctx.closePath();
    ctx.lineWidth = width; ctx.strokeStyle = color; ctx.globalAlpha = 0.85; ctx.stroke(); ctx.globalAlpha = 1;
  }

  strokePts(ctx, pts, color, width) {
    if (pts.length < 2) return;
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    ctx.lineWidth = width; ctx.strokeStyle = color; ctx.globalAlpha = 0.9; ctx.lineJoin = 'round'; ctx.stroke(); ctx.globalAlpha = 1;
  }

  // -------------------------------------------------------------- mini-carte
  draw(canvas) {
    const g = this.game;
    this.updateGps(1 / 30);
    if (!g.settings.minimap) return;
    this._frame = (this._frame || 0) + 1;
    if (this._frame % 2) return; // 30 Hz
    const ctx = canvas.getContext('2d');
    const W = canvas.width;
    const p = g.player.phys;
    const radius = 300 + Math.min(500, p.speed * 9);
    this._radius = this._radius ? this._radius + (radius - this._radius) * 0.05 : radius;
    const scale = W / 2 / this._radius;
    const heading = Math.atan2(p.fwd.x, -p.fwd.z);
    ctx.clearRect(0, 0, W, W);
    ctx.save();
    ctx.beginPath(); ctx.arc(W / 2, W / 2, W / 2, 0, Math.PI * 2); ctx.clip();
    this.drawWorld(ctx, { cx: p.pos.x, cz: p.pos.z, scale, rot: -heading, w: W, h: W }, { big: false });
    ctx.restore();
    // nord
    const nx = W / 2 + Math.sin(-heading) * (W / 2 - 18), ny = W / 2 - Math.cos(-heading) * (W / 2 - 18);
    ctx.beginPath(); ctx.arc(nx, ny, 15, 0, Math.PI * 2); ctx.fillStyle = 'rgba(0,0,0,0.7)'; ctx.fill();
    ctx.fillStyle = '#ff5a5a'; ctx.font = 'bold 20px Rajdhani, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('N', nx, ny + 1);
  }
}

function order(t) { return { city: 0, piste: 1, mountain: 2, national: 3, highway: 4 }[t] ?? 0; }
