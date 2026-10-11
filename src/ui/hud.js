// Affichage tête haute : compteur, mini-carte, lieux, argent, cascades, courses, invites.
import { POIS } from '../world/layout.js';

const fmtTime = (t) => {
  if (t == null || !isFinite(t)) return '--:--.--';
  const m = Math.floor(t / 60), s = t - m * 60;
  return `${m}:${s.toFixed(2).padStart(5, '0')}`;
};
export { fmtTime };

export class HUD {
  constructor(game) {
    this.game = game;
    const root = document.getElementById('hud');
    this.root = root;
    root.innerHTML = `
      <div class="hud-tl">
        <div class="hud-loc" id="hLoc">—</div>
        <div class="hud-money" id="hMoney"></div>
        <div id="hPanel"></div>
      </div>
      <canvas class="hud-minimap" id="hMini" width="420" height="420"></canvas>
      <div class="hud-gps" id="hGps"></div>
      <canvas class="hud-speedo" id="hSpeedo" width="480" height="480"></canvas>
      <div class="hud-popups" id="hPopups"></div>
      <div class="hud-notif" id="hNotif"></div>
      <div class="hud-count hidden" id="hCount"></div>
      <div class="hud-meter hidden" id="hMeter"><div class="lbl" id="hMeterL"></div><div class="val" id="hMeterV"></div><div class="bar"><i id="hMeterB"></i></div></div>
      <div class="hud-prompt hidden" id="hPrompt"></div>
      <div class="hud-hint hidden" id="hHint"></div>
      <div class="hud-fps hidden" id="hFps"></div>
      <div class="hud-fade" id="hFade"></div>`;
    const $ = (id) => document.getElementById(id);
    this.el = { loc: $('hLoc'), money: $('hMoney'), panel: $('hPanel'), mini: $('hMini'), speedo: $('hSpeedo'), popups: $('hPopups'), notif: $('hNotif'), count: $('hCount'), meter: $('hMeter'), meterL: $('hMeterL'), meterV: $('hMeterV'), meterB: $('hMeterB'), prompt: $('hPrompt'), hint: $('hHint'), fps: $('hFps'), fade: $('hFade'), gps: $('hGps') };
    this.sctx = this.el.speedo.getContext('2d');
    this.t = 0;
    this.popupQ = [];
    this.lastPopup = 0;
    this.fpsAcc = 0; this.fpsN = 0;
    this.meterMode = null;
  }

  show(on) {
    this.root.classList.toggle('hidden', !on);
    if (on && !this.hintShown) {
      this.hintShown = true;
      const i = this.game.input;
      const k = (a) => `<span class="key">${i.label(a)}</span>`;
      this.el.hint.innerHTML = i.lastDevice === 'gamepad'
        ? `${k('throttle')} accélérer · ${k('brake')} freiner/reculer<br>${k('handbrake')} frein à main · ${k('nitro')} nitro · ${k('camera')} caméra<br>${k('reset')} replacer · ${k('map')} carte · ${k('pause')} menu`
        : `${i.keyLabel('KeyW')}${i.keyLabel('KeyA')}${i.keyLabel('KeyS')}${i.keyLabel('KeyD')} / flèches : conduire<br>${k('handbrake')} frein à main · ${k('nitro')} nitro · ${k('camera')} caméra<br>${k('reset')} replacer · ${k('map')} carte · ${k('lights')} phares · ${k('pause')} menu`;
      this.el.hint.classList.remove('hidden');
      setTimeout(() => this.el.hint.classList.add('hidden'), 14000);
    }
  }

  location(name) {
    const poi = POIS.find((p) => name.startsWith(p.name.split(' —')[0]));
    this.el.loc.innerHTML = `${name}${poi ? `<small class="ar">${poi.ar}</small>` : ''}`;
  }

  popup(title, sub = '', color = '#ffd23f') {
    this.popupQ.push({ title, sub, color });
  }

  notify(text) {
    const d = document.createElement('div');
    d.className = 'notif';
    d.textContent = text;
    this.el.notif.appendChild(d);
    setTimeout(() => d.remove(), 3300);
    while (this.el.notif.children.length > 4) this.el.notif.firstChild.remove();
  }

  countdown(v) {
    const c = this.el.count;
    c.textContent = v;
    c.classList.remove('hidden', 'anim');
    void c.offsetWidth;
    c.classList.add('anim');
    clearTimeout(this._ct);
    this._ct = setTimeout(() => c.classList.add('hidden'), 900);
  }

  prompt(text) {
    if (text === this._prompt) return;
    this._prompt = text;
    this.el.prompt.classList.toggle('hidden', !text);
    if (text) {
      const [k, ...rest] = text.split(' : ');
      this.el.prompt.innerHTML = `<span class="key">${k}</span> ${rest.join(' : ')}`;
    }
  }

  fade() {
    this.el.fade.classList.add('on');
    setTimeout(() => this.el.fade.classList.remove('on'), 380);
  }

  // jauges centrales (dérapage, combo, temps de vol)
  drift(pts, beta, label = 'DÉRAPAGE') {
    if (pts === null) { if (this.meterMode === 'drift') this._meter(null); return; }
    this.meterMode = 'drift';
    this._meter(label, Math.round(pts).toLocaleString('fr-FR'), Math.min(1, beta / 0.9));
  }
  airTime(t, h) {
    if (t === null) { if (this.meterMode === 'air') this._meter(null); return; }
    this.meterMode = 'air';
    this._meter('EN L\'AIR', `${t.toFixed(1)} s`, Math.min(1, h / 30));
  }
  combo(c) { this._combo = c; this._renderCombo(); }
  comboTimer(f) { this._comboT = f; this._renderCombo(); }
  _renderCombo() {
    const c = this._combo;
    if (!c || !c.items.length) { if (this.meterMode === 'combo') this._meter(null); return; }
    if (this.meterMode === 'drift' || this.meterMode === 'air') return;
    this.meterMode = 'combo';
    this._meter(`COMBO x${c.mult.toFixed(1)}`, `${Math.round(c.total * c.mult).toLocaleString('fr-FR')} pts`, Math.max(0, this._comboT ?? 1));
  }
  _meter(label, val, bar) {
    if (label === null) { this.el.meter.classList.add('hidden'); this.meterMode = null; return; }
    this.el.meter.classList.remove('hidden');
    this.el.meterL.textContent = label;
    this.el.meterV.textContent = val;
    this.el.meterB.style.width = `${(bar ?? 0) * 100}%`;
  }

  eventStart(ev) { this.popup(ev.name, 'Préparez-vous…', '#ffffff'); }
  eventEnd() { this.el.panel.innerHTML = ''; }

  raceInfo(r) {
    const st = r.standings.slice(0, 4).map((n) => `<li class="${n === 'Vous' ? 'me' : ''}">${n}</li>`).join('');
    this.el.panel.innerHTML = `<div class="hud-panel"><div class="row"><span>${r.name}</span></div>
      <div class="big">${r.pos}<span style="font-size:22px">/${r.count}</span></div>
      <div class="row"><span>Temps</span><b>${fmtTime(r.time)}</b></div>
      ${r.laps ? `<div class="row"><span>Tour</span><b>${r.lap} / ${r.laps}</b></div>` : ''}
      <div class="row"><span>Points de passage</span><b>${r.cp} / ${r.cps}</b></div>
      ${r.count > 1 ? `<ol>${st}</ol>` : ''}</div>`;
  }

  challengeInfo(c) {
    const t = c.targets.map((v, i) => `<div class="row"><span class="medal-${i}">${['Or', 'Argent', 'Bronze'][i]}</span><b>${v.toLocaleString('fr-FR')} ${c.unit}</b></div>`).join('');
    this.el.panel.innerHTML = `<div class="hud-panel"><div class="row"><span>${c.name}</span></div>
      <div class="big">${Math.round(c.score).toLocaleString('fr-FR')} <span style="font-size:20px">${c.unit}</span></div>
      <div class="row"><span>Temps restant</span><b>${Math.ceil(c.time)} s</b></div>${t}</div>`;
  }

  fps(dt) {
    if (!this.game.settings.fpsCounter) { this.el.fps.classList.add('hidden'); return; }
    this.fpsAcc += dt; this.fpsN++;
    if (this.fpsAcc > 0.5) {
      this.el.fps.classList.remove('hidden');
      const info = this.game.renderer.info.render;
      this.el.fps.textContent = `${Math.round(this.fpsN / this.fpsAcc)} FPS · ${info.calls} draw · ${(info.triangles / 1000).toFixed(0)}k tri`;
      this.fpsAcc = 0; this.fpsN = 0;
    }
  }

  update(dt) {
    const g = this.game;
    this.t += dt;
    // popups (un à la fois, espacés)
    if (this.popupQ.length && this.t - this.lastPopup > 0.55) {
      const p = this.popupQ.shift();
      this.lastPopup = this.t;
      const d = document.createElement('div');
      d.className = 'popup';
      d.style.color = p.color;
      d.innerHTML = `${p.title}${p.sub ? `<small>${p.sub}</small>` : ''}`;
      this.el.popups.appendChild(d);
      setTimeout(() => d.remove(), 2450);
      while (this.el.popups.children.length > 3) this.el.popups.firstChild.remove();
    }
    if (Math.floor(this.t * 10) !== Math.floor((this.t - dt) * 10)) {
      this.el.money.textContent = `${g.save.data.money.toLocaleString('fr-FR')} DA`;
    }
    this.drawSpeedo();
    g.minimap.draw(this.el.mini);
    const gps = g.minimap.gps;
    this.el.gps.textContent = gps ? `GPS : ${gps.name} · ${(gps.remaining / 1000).toFixed(1)} km` : '';
    this.el.mini.classList.toggle('hidden', !g.settings.minimap);
  }

  drawSpeedo() {
    const g = this.game;
    const p = g.player.phys;
    const c = this.sctx;
    const W = 480, cx = W / 2, cy = W / 2, R = 200;
    c.clearRect(0, 0, W, W);
    const params = g.player.params;
    const kmh = Math.abs(p.vel.dot(p.fwd)) * 3.6;
    const maxKmh = Math.ceil(params.topSpeed * 3.6 / 40) * 40 + 20;
    const a0 = Math.PI * 0.75, a1 = Math.PI * 2.25;
    // fond
    c.beginPath(); c.arc(cx, cy, R + 14, 0, Math.PI * 2); c.fillStyle = 'rgba(8,12,16,0.62)'; c.fill();
    // compte-tours (arc intérieur)
    const rn = Math.min(1, p.rpm / params.redline);
    c.lineWidth = 16; c.lineCap = 'butt';
    c.beginPath(); c.arc(cx, cy, R - 30, a0, a1); c.strokeStyle = 'rgba(255,255,255,0.08)'; c.stroke();
    c.beginPath(); c.arc(cx, cy, R - 30, a0 + (a1 - a0) * 0.85, a1); c.strokeStyle = 'rgba(210,16,52,0.45)'; c.stroke();
    c.beginPath(); c.arc(cx, cy, R - 30, a0, a0 + (a1 - a0) * rn);
    c.strokeStyle = rn > 0.9 ? '#ff3b3b' : rn > 0.75 ? '#ffd23f' : '#00d26a'; c.stroke();
    // graduations vitesse
    c.font = '600 22px Rajdhani, sans-serif'; c.fillStyle = '#cfd8dc'; c.textAlign = 'center'; c.textBaseline = 'middle';
    for (let v = 0; v <= maxKmh; v += 20) {
      const a = a0 + (a1 - a0) * (v / maxKmh);
      const major = v % 40 === 0;
      c.beginPath();
      c.moveTo(cx + Math.cos(a) * (R - (major ? 12 : 6)), cy + Math.sin(a) * (R - (major ? 12 : 6)));
      c.lineTo(cx + Math.cos(a) * R, cy + Math.sin(a) * R);
      c.lineWidth = major ? 4 : 2; c.strokeStyle = '#e8eef0'; c.stroke();
      if (major && maxKmh <= 280 || v % 80 === 0) c.fillText(v, cx + Math.cos(a) * (R - 58), cy + Math.sin(a) * (R - 58));
    }
    // aiguille
    const an = a0 + (a1 - a0) * Math.min(1.02, kmh / maxKmh);
    c.beginPath(); c.moveTo(cx - Math.cos(an) * 20, cy - Math.sin(an) * 20); c.lineTo(cx + Math.cos(an) * (R - 8), cy + Math.sin(an) * (R - 8));
    c.lineWidth = 6; c.strokeStyle = '#ff2d2d'; c.lineCap = 'round'; c.stroke();
    c.beginPath(); c.arc(cx, cy, 16, 0, Math.PI * 2); c.fillStyle = '#222'; c.fill();
    // vitesse numérique + rapport
    c.fillStyle = '#ffffff'; c.font = 'bold 84px Rajdhani, sans-serif';
    c.fillText(Math.round(kmh), cx, cy + 78);
    c.font = '600 22px Rajdhani, sans-serif'; c.fillStyle = '#9aa7b0'; c.fillText('KM/H', cx, cy + 122);
    const gear = p.gear === -1 ? 'R' : p.gear === 0 ? 'N' : String(p.gear);
    c.font = 'bold 46px Rajdhani, sans-serif'; c.fillStyle = p.gear === -1 ? '#ff6b6b' : '#ffd23f';
    c.fillText(gear, cx, cy - 64);
    c.font = '600 18px Rajdhani, sans-serif'; c.fillStyle = '#9aa7b0'; c.fillText(p.manual ? 'MANUELLE' : 'AUTO', cx, cy - 30);
    // nitro
    if (params.nitroCap > 0) {
      c.lineWidth = 9; c.lineCap = 'round';
      c.beginPath(); c.arc(cx, cy, R + 4, Math.PI * 0.82, Math.PI * 0.82 + Math.PI * 0.36 * 1); c.strokeStyle = 'rgba(255,255,255,0.1)'; c.stroke();
      c.beginPath(); c.arc(cx, cy, R + 4, Math.PI * 0.82 + Math.PI * 0.36 * (1 - p.nitro), Math.PI * 0.82 + Math.PI * 0.36);
      c.strokeStyle = p.nitroActive ? '#7ff6ff' : '#3aa7ff'; c.stroke();
      c.font = 'bold 16px Rajdhani, sans-serif'; c.fillStyle = '#3aa7ff'; c.fillText('N₂O', cx - R * 0.95, cy + R * 0.62);
    }
    // voyants
    if (g.player.lightsOn) { c.fillStyle = '#4ea8ff'; c.font = 'bold 18px Rajdhani'; c.fillText('PHARES', cx + R * 0.6, cy + R * 0.82); }
  }
}
