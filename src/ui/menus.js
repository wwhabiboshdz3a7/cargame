// Menus navigables (souris, clavier, manette) : principal, pause, épreuves, résultats, paramètres, commandes, carte.
import { EVENTS } from '../game/events.js';
import { POIS, WORLD_HALF } from '../world/layout.js';
import { FENNEC_COUNT } from '../game/activities.js';
import { fmtTime } from './hud.js';
import { POI_ICON } from './minimap.js';

const TYPE_NAMES = { sprint: 'Sprint', circuit: 'Circuit', timetrial: 'Contre-la-montre', rally: 'Rallye', drag: 'Drag', stunt: 'Cascades', longjump: 'Saut', drift: 'Drift' };
const QUALITIES = [['auto', 'Auto'], ['low', 'Faible'], ['medium', 'Moyenne'], ['high', 'Haute'], ['ultra', 'Ultra']];

function h(tag, attrs = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (k === 'class') el.className = v;
    else if (k === 'html') el.innerHTML = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (v !== undefined && v !== null && v !== false) el.setAttribute(k, v);
  }
  for (const c of kids.flat()) if (c !== null && c !== undefined && c !== false) el.append(c.nodeType ? c : document.createTextNode(c));
  return el;
}
export { h };

export class Menus {
  constructor(game) {
    this.game = game;
    this.root = document.getElementById('ui');
    this.current = null;
    this.focus = null;
    this.root.addEventListener('mousemove', (e) => {
      const n = e.target.closest?.('.nav');
      if (n && n !== this.focus) this.setFocus(n, false);
    });
  }

  // ------------------------------------------------------------ infrastructure
  open(el, { onBack = null, cls = '' } = {}) {
    this.close();
    const scr = h('div', { class: 'screen ' + cls }, el);
    this.root.appendChild(scr);
    this.current = { el: scr, onBack };
    const first = scr.querySelector('.nav.default') || scr.querySelector('.nav');
    if (first) this.setFocus(first, false);
    return scr;
  }

  close() {
    if (this.current) this.current.el.remove();
    this.current = null;
    this.focus = null;
  }

  setFocus(el, scroll = true) {
    if (this.focus) this.focus.classList.remove('focus');
    this.focus = el;
    if (el) {
      el.classList.add('focus');
      if (scroll) el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }

  move(dir) {
    const scr = this.current?.el || this.extraRoot;
    if (!scr) return;
    const items = [...scr.querySelectorAll('.nav')].filter((e) => e.offsetParent !== null);
    if (!items.length) return;
    if (!this.focus || !items.includes(this.focus)) { this.setFocus(items[0]); return; }
    const r0 = this.focus.getBoundingClientRect();
    const c0 = [r0.left + r0.width / 2, r0.top + r0.height / 2];
    let best = null, bd = Infinity;
    for (const e of items) {
      if (e === this.focus) continue;
      const r = e.getBoundingClientRect();
      const c = [r.left + r.width / 2, r.top + r.height / 2];
      const dx = c[0] - c0[0], dy = c[1] - c0[1];
      let ok = false, d = 0;
      if (dir === 'down') { ok = dy > 4; d = dy + Math.abs(dx) * 2.5; }
      if (dir === 'up') { ok = dy < -4; d = -dy + Math.abs(dx) * 2.5; }
      if (dir === 'right') { ok = dx > 4; d = dx + Math.abs(dy) * 2.5; }
      if (dir === 'left') { ok = dx < -4; d = -dx + Math.abs(dy) * 2.5; }
      if (ok && d < bd) { bd = d; best = e; }
    }
    if (best) { this.setFocus(best); this.game.audio.click(); }
  }

  update(dt) {
    const g = this.game;
    if (this.mapState) this.updateMap(dt);
    if (!this.current && !this.extraRoot) return;
    const nav = g.input.nav();
    if (nav.dir) {
      const f = this.focus;
      const opt = f?.querySelector?.('.opt') || (f?.classList.contains('opt') ? f : null);
      const range = f?.querySelector?.('input[type=range]');
      if ((nav.dir === 'left' || nav.dir === 'right') && opt) { opt.querySelector(nav.dir === 'left' ? '.prev' : '.next').click(); }
      else if ((nav.dir === 'left' || nav.dir === 'right') && range) {
        const step = (+range.max - +range.min) / 20;
        range.value = +range.value + (nav.dir === 'left' ? -step : step);
        range.dispatchEvent(new Event('input'));
      } else if (!this.mapState) this.move(nav.dir);
    }
    if (nav.ok && this.focus && !this.mapState) {
      g.audio.init();
      this.focus.click();
    }
    if (nav.back && !this.mapState) {
      const cb = this.current?.onBack;
      if (cb) { g.audio.click(); cb(); }
    }
    if (this.extraRoot && this.extraUpdate) this.extraUpdate(nav);
  }

  btn(label, onclick, cls = '') {
    return h('button', { class: 'btn nav ' + cls, onclick: () => { this.game.audio.init(); this.game.audio.click(); onclick(); } }, label);
  }

  toast(text) {
    const t = h('div', { class: 'toast' }, text);
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 2600);
  }

  // ------------------------------------------------------------ menu principal
  showMain() {
    const g = this.game;
    g.state = 'menu';
    g.hud.show(false);
    const d = g.save.data;
    const side = h('div', { class: 'menu-side' },
      h('div', { class: 'menu-title', html: '<span class="dz">DZ</span> DRIVE' }),
      h('div', { class: 'menu-sub', html: 'Algérie · Monde ouvert · <span class="ar">الجزائر</span>' }),
      this.btn('▶  Rouler — monde ouvert', () => { this.close(); g.startPlaying(); }, 'primary default'),
      this.btn('🔧  Garage', () => g.garage.open('main')),
      this.btn('🏁  Épreuves & défis', () => this.showEvents('main')),
      this.btn('🗺  Carte du monde', () => this.showMap('main')),
      this.btn('⚙  Paramètres', () => this.showSettings('main')),
      this.btn('🎮  Commandes', () => this.showControls('main')),
      h('div', { style: 'margin-top:auto;padding-top:24px' },
        h('div', { class: 'money' }, `${d.money.toLocaleString('fr-FR')} DA`),
        h('div', { class: 'muted', style: 'font-size:16px;margin-top:4px' },
          `${g.player.car.name} · Fennecs dorés ${d.collected.length}/${FENNEC_COUNT} · Victoires ${d.stats.wins} · ${(d.stats.distance / 1000).toFixed(0)} km parcourus`)),
    );
    this.open(side);
    this.current.el.appendChild(h('div', { class: 'footer-hint' }, 'Manette ou clavier · Entrée/Ⓐ valider · Échap/Ⓑ retour'));
  }

  // ------------------------------------------------------------ pause
  showPause() {
    const g = this.game;
    g.state = 'pause';
    g.audio.silenceAmbience();
    const resume = () => { this.close(); g.state = 'play'; g.last = performance.now(); };
    const ev = g.events.active;
    const side = h('div', { class: 'menu-side' },
      h('div', { class: 'menu-title', style: 'font-size:56px' }, 'PAUSE'),
      h('div', { class: 'menu-sub' }, g.location()),
      this.btn('▶  Reprendre', resume, 'primary default'),
      ev ? this.btn('↻  Recommencer l\'épreuve', () => { const id = ev.id; this.close(); g.state = 'play'; g.events.start(id); }) : null,
      ev ? this.btn('✕  Abandonner l\'épreuve', () => { g.events.abort(); resume(); }, 'danger') : null,
      !ev ? this.btn('🔧  Garage', () => g.garage.open('pause')) : null,
      !ev ? this.btn('🏁  Épreuves & défis', () => this.showEvents('pause')) : null,
      this.btn('🗺  Carte du monde', () => this.showMap('pause')),
      this.btn('⚙  Paramètres', () => this.showSettings('pause')),
      this.btn('🎮  Commandes', () => this.showControls('pause')),
      this.btn('⌂  Menu principal', () => { g.events.abort(true); this.showMain(); }),
    );
    this.open(side, { onBack: resume, cls: 'dim' });
  }

  back(from) {
    if (from === 'main') this.showMain();
    else if (from === 'pause') this.showPause();
    else { this.close(); this.game.state = 'play'; }
  }

  // ------------------------------------------------------------ épreuves
  showEvents(from) {
    const g = this.game;
    const d = g.save.data;
    const cards = EVENTS.map((ev) => {
      const medal = d.medals[ev.id];
      const rec = d.records[ev.id];
      const recTxt = rec === undefined ? '' : ['stunt', 'drift'].includes(ev.type) ? `Record : ${Math.round(rec).toLocaleString('fr-FR')} pts` : ev.type === 'longjump' ? `Record : ${Math.round(rec)} m` : `Record : ${fmtTime(rec)}`;
      return h('div', { class: 'card nav', onclick: () => this.showEventIntro(ev, from) },
        h('div', {}, h('span', { class: 'tag' }, TYPE_NAMES[ev.type]), h('span', { class: 'tag' }, ev.region)),
        h('div', { class: 't', style: 'margin-top:6px' }, ev.name),
        h('div', { class: 'd' }, ev.desc),
        h('div', { class: 'd' }, `Gain : jusqu'à ${ev.reward[0].toLocaleString('fr-FR')} DA`),
        h('div', { class: 'd' }, medal !== undefined ? h('span', { class: 'medal medal-' + medal }, `🏅 ${['Or', 'Argent', 'Bronze'][medal]}`) : 'Pas encore de médaille', recTxt ? ` · ${recTxt}` : ''));
    });
    const wrap = h('div', { class: 'center-wrap panel' },
      h('div', { class: 'h2' }, 'Épreuves & défis'),
      h('div', { class: 'muted' }, 'Rendez-vous aux balises lumineuses sur la carte, ou lancez directement une épreuve.'),
      h('div', { class: 'grid' }, cards),
      h('div', { style: 'margin-top:14px' }, this.btn('← Retour', () => this.back(from), 'small')));
    this.open(wrap, { onBack: () => this.back(from), cls: 'dim' });
  }

  showEventIntro(ev, from = null) {
    const g = this.game;
    if (g.state === 'play') g.state = 'pause';
    const isChallenge = ['stunt', 'longjump', 'drift'].includes(ev.type);
    const rules = {
      sprint: 'Atteignez l\'arrivée en premier en passant par tous les points de passage.',
      circuit: `Bouclez ${ev.laps} tours du circuit avant vos adversaires.`,
      timetrial: 'Seul contre le chrono : battez les temps de référence.',
      rally: 'Hors-piste à travers les dunes : passez chaque balise.',
      drag: '1000 m en ligne droite. Astuce : passez les vitesses vous-même (Paramètres → Boîte manuelle).',
      stunt: 'Enchaînez sauts, loopings, flips et dérapages : les combos multiplient les points.',
      longjump: 'Prenez le maximum de vitesse et décollez du méga tremplin. Seul le meilleur saut compte.',
      drift: 'Les dérapages longs et rapides rapportent le plus. Ne touchez rien !',
    }[ev.type];
    const rewards = ev.reward.map((r, i) => h('div', {}, h('span', { class: 'medal-' + i }, isChallenge || ev.type === 'timetrial' ? ['Or', 'Argent', 'Bronze'][i] : `${i + 1}${i ? 'e' : 'er'}`), ` — ${r ? r.toLocaleString('fr-FR') + ' DA' : '—'}${ev.targets ? ` (${ev.targets[i].toLocaleString('fr-FR')} ${ev.type === 'longjump' ? 'm' : 'pts'})` : ''}`));
    const start = () => { this.close(); g.state = 'play'; g.audio.init(); g.hud.show(true); g.events.start(ev.id); g.last = performance.now(); };
    const cancel = () => { if (from) this.back(from); else { this.close(); g.state = 'play'; } };
    const wrap = h('div', { class: 'center-wrap panel', style: 'width:min(640px,94vw)' },
      h('div', { class: 'muted', style: 'letter-spacing:2px;text-transform:uppercase' }, `${TYPE_NAMES[ev.type]} · ${ev.region}`),
      h('div', { class: 'h2' }, ev.name),
      h('p', { style: 'font-size:19px;line-height:1.4' }, ev.desc),
      h('p', { class: 'muted', style: 'font-size:17px' }, rules),
      h('div', { class: 'kv', style: 'margin:12px 0' }, h('div', {}, 'Véhicule'), h('div', {}, g.player.car.name), h('div', {}, 'Adversaires'), h('div', {}, String(ev.opponents ?? (ev.type === 'drag' ? 1 : 0)))),
      h('div', { style: 'font-size:18px;line-height:1.6;margin:10px 0' }, rewards),
      h('div', { style: 'display:flex;gap:10px;margin-top:16px' }, this.btn('▶ Commencer', start, 'primary small default'), this.btn('Annuler', cancel, 'small')));
    this.open(wrap, { onBack: cancel, cls: 'dim' });
  }

  showResults(r) {
    const g = this.game;
    g.state = 'pause';
    const ev = r.ev;
    let title;
    if (r.standings) title = r.pos === 1 ? 'VICTOIRE !' : r.pos ? `${r.pos}${r.pos > 1 ? 'e' : 'er'} place` : 'Hors délai';
    else title = r.medal ? `Médaille ${r.medal.toLowerCase() === 'or' ? 'd\'or' : 'd\'' + r.medal.toLowerCase()} !` : 'Terminé';
    if (ev.type === 'timetrial') title = r.medal ? `Médaille ${r.medal === 'Or' ? 'd\'or' : 'd\'' + r.medal.toLowerCase()} !` : 'Temps dépassé';
    const body = [];
    if (r.standings) {
      body.push(h('table', { class: 'res' }, r.standings.map((s, i) => h('tr', { class: s.player ? 'me' : '' }, h('td', {}, `${i + 1}.`), h('td', {}, s.name), h('td', { class: 'muted' }, s.car || ''), h('td', { style: 'text-align:right' }, fmtTime(s.time))))));
      if (r.goals) body.push(h('div', { class: 'muted', style: 'margin-top:8px' }, `Or ${fmtTime(r.goals[0])} · Argent ${fmtTime(r.goals[1])} · Bronze ${fmtTime(r.goals[2])}`));
    } else {
      body.push(h('div', { style: 'font-size:52px;font-weight:700' }, `${Math.round(r.score).toLocaleString('fr-FR')} ${r.unit}`));
      body.push(h('div', { class: 'muted' }, r.targets.map((t, i) => `${['Or', 'Argent', 'Bronze'][i]} ${t.toLocaleString('fr-FR')}`).join(' · ')));
    }
    const replay = () => { this.close(); g.state = 'play'; g.events.start(ev.id); g.last = performance.now(); };
    const cont = () => { this.close(); g.state = 'play'; g.last = performance.now(); };
    const wrap = h('div', { class: 'center-wrap panel', style: 'width:min(640px,94vw)' },
      h('div', { class: 'muted', style: 'letter-spacing:2px;text-transform:uppercase' }, ev.name),
      h('div', { class: 'h2', style: `font-size:48px;color:${r.reward ? '#ffd23f' : '#fff'}` }, title),
      ...body,
      r.newRecord ? h('div', { style: 'color:#7CFC00;font-weight:700;margin-top:8px;font-size:20px' }, '★ Nouveau record personnel !') : null,
      h('div', { class: 'money', style: 'margin-top:12px' }, r.reward ? `+ ${r.reward.toLocaleString('fr-FR')} DA` : 'Aucune récompense'),
      h('div', { style: 'display:flex;gap:10px;margin-top:18px' }, this.btn('↻ Rejouer', replay, 'small'), this.btn('Continuer ▶', cont, 'primary small default')));
    this.open(wrap, { onBack: cont, cls: 'dim' });
  }

  // ------------------------------------------------------------ paramètres
  opt(label, values, get, set) {
    let i = Math.max(0, values.findIndex(([v]) => v === get()));
    const span = h('span', {}, values[i][1]);
    const apply = (d) => { i = (i + d + values.length) % values.length; span.textContent = values[i][1]; set(values[i][0]); this.game.audio.click(); };
    return h('div', { class: 'setting nav', onclick: (e) => { if (e.target.tagName !== 'BUTTON') apply(1); } }, h('span', {}, label),
      h('div', { class: 'opt' }, h('button', { class: 'prev', onclick: () => apply(-1) }, '◀'), span, h('button', { class: 'next', onclick: () => apply(1) }, '▶')));
  }

  slider(label, min, max, step, get, set, fmt = (v) => v) {
    const out = h('span', { style: 'min-width:60px;text-align:right' }, fmt(get()));
    const inp = h('input', { type: 'range', min, max, step, value: get(), oninput: (e) => { set(+e.target.value); out.textContent = fmt(+e.target.value); } });
    return h('div', { class: 'setting nav' }, h('span', {}, label), h('div', { style: 'display:flex;gap:10px;align-items:center' }, inp, out));
  }

  showSettings(from) {
    const g = this.game;
    const s = g.settings;
    const onoff = [[true, 'Activé'], [false, 'Désactivé']];
    const save = () => g.save.persist();
    const items = [
      h('div', { class: 'muted', style: 'margin:8px 0 2px;letter-spacing:2px' }, 'GRAPHISMES'),
      this.opt('Qualité graphique', QUALITIES, () => s.quality, (v) => { s.quality = v; g.applyQuality(g.resolveQuality()); save(); this.toast(`Qualité : ${QUALITIES.find((q) => q[0] === v)[1]} (${g.quality})`); }),
      this.opt('Cycle jour / nuit', onoff, () => s.timeCycle, (v) => { s.timeCycle = v; g.atmosphere.cycle = v; save(); }),
      this.slider('Heure de la journée', 0, 23.5, 0.5, () => g.atmosphere.time, (v) => { g.atmosphere.time = v; g.atmosphere.lastEnvTime = -100; s.startHour = v; save(); }, (v) => `${Math.floor(v)}h${v % 1 ? '30' : '00'}`),
      this.opt('Compteur d\'images (FPS)', onoff, () => s.fpsCounter, (v) => { s.fpsCounter = v; save(); }),
      h('div', { class: 'muted', style: 'margin:14px 0 2px;letter-spacing:2px' }, 'SON'),
      this.slider('Volume général', 0, 1, 0.05, () => s.volume, (v) => { s.volume = v; g.audio.setVolumes({ master: v }); save(); }, (v) => `${Math.round(v * 100)}%`),
      this.slider('Effets', 0, 1, 0.05, () => s.sfx, (v) => { s.sfx = v; g.audio.setVolumes({ sfx: v }); save(); }, (v) => `${Math.round(v * 100)}%`),
      this.slider('Musique (radio)', 0, 1, 0.05, () => s.music, (v) => { s.music = v; g.audio.setVolumes({ music: v }); save(); }, (v) => `${Math.round(v * 100)}%`),
      this.opt('Radio', [[0, 'Éteinte'], [1, 'Raï FM (darbouka)'], [2, 'Chaâbi Drive']], () => g.audio.radioStation, (v) => { g.audio.init(); g.audio.setRadio(v); }),
      h('div', { class: 'muted', style: 'margin:14px 0 2px;letter-spacing:2px' }, 'CONDUITE'),
      this.opt('Boîte de vitesses', [[false, 'Automatique'], [true, 'Manuelle']], () => s.manual, (v) => { s.manual = v; g.applyAssists(); save(); }),
      this.opt('ABS', onoff, () => s.abs, (v) => { s.abs = v; g.applyAssists(); save(); }),
      this.opt('Antipatinage (TCS)', onoff, () => s.tcs, (v) => { s.tcs = v; g.applyAssists(); save(); }),
      this.opt('Contrôle de stabilité (ESP)', onoff, () => s.esc, (v) => { s.esc = v; g.applyAssists(); save(); }),
      this.opt('Aide au contre-braquage', onoff, () => s.steerAssist, (v) => { s.steerAssist = v; g.applyAssists(); save(); }),
      this.opt('Caméra par défaut', [[0, 'Poursuite'], [1, 'Poursuite proche'], [2, 'Capot'], [3, 'Pare-chocs'], [4, 'Cinématique'], [5, 'Drone']], () => s.camera, (v) => { s.camera = v; g.cameraRig.mode = v; save(); }),
      h('div', { class: 'muted', style: 'margin:14px 0 2px;letter-spacing:2px' }, 'MONDE'),
      this.opt('Densité du trafic', [['off', 'Aucun'], ['low', 'Faible'], ['medium', 'Moyenne'], ['high', 'Élevée']], () => s.traffic, (v) => { s.traffic = v; g.traffic.setDensity(v, g.quality); save(); }),
      this.opt('Mini-carte', onoff, () => s.minimap, (v) => { s.minimap = v; save(); }),
      this.opt('Mode libre (tout débloqué)', onoff, () => s.unlockAll, (v) => { s.unlockAll = v; save(); }),
      this.btn('⚠ Réinitialiser la progression', () => {
        if (this._confirmReset) { g.save.reset(); this.toast('Progression réinitialisée'); location.reload(); }
        else { this._confirmReset = true; this.toast('Appuyez encore pour confirmer'); setTimeout(() => { this._confirmReset = false; }, 3000); }
      }, 'danger small'),
    ];
    const wrap = h('div', { class: 'center-wrap panel', style: 'width:min(720px,94vw)' }, h('div', { class: 'h2' }, 'Paramètres'), ...items,
      h('div', { style: 'margin-top:14px' }, this.btn('← Retour', () => this.back(from), 'small')));
    this.open(wrap, { onBack: () => this.back(from), cls: 'dim' });
  }

  showControls(from) {
    const i = this.game.input;
    const k = (c) => `<span class="key">${i.keyLabel(c)}</span>`;
    const rows = [
      ['Accélérer', `${k('KeyW')} / ${k('ArrowUp')}`, 'RT'], ['Freiner / marche arrière', `${k('KeyS')} / ${k('ArrowDown')}`, 'LT'],
      ['Diriger', `${k('KeyA')} ${k('KeyD')} / ${k('ArrowLeft')} ${k('ArrowRight')}`, 'Stick gauche'], ['Frein à main', k('Space'), 'Ⓐ'],
      ['Nitro', k('ShiftLeft'), 'Ⓑ'], ['Interagir / lancer une épreuve', k('KeyF'), 'Ⓧ'], ['Changer de caméra', k('KeyC'), 'Ⓨ'],
      ['Regarder autour', 'Souris (clic droit)', 'Stick droit'], ['Regarder derrière', k('KeyB'), 'R3'],
      ['Rapport + / − (boîte manuelle)', `${k('KeyE')} / ${k('KeyQ')}`, 'RB / LB'], ['Replacer la voiture', k('KeyR'), 'Croix ↓'],
      ['Phares', k('KeyL'), 'Croix ↑'], ['Sirène (Patrouille)', k('KeyK'), 'Croix ←'], ['Changer l\'heure', k('KeyN'), 'Croix →'],
      ['Klaxon', k('KeyH'), 'L3'], ['Carte', k('KeyM'), 'View'], ['Pause', `${k('Escape')} / ${k('KeyP')}`, 'Menu'],
      ['En l\'air : rotation', 'Avancer/reculer + diriger (+ Espace = tonneau)', 'Stick gauche (+ Ⓐ = tonneau)'],
    ];
    const table = h('table', { class: 'res' }, h('tr', {}, h('td', { class: 'muted' }, 'Action'), h('td', { class: 'muted' }, 'Clavier'), h('td', { class: 'muted' }, 'Manette')),
      rows.map(([a, kb, pad]) => h('tr', {}, h('td', {}, a), h('td', { html: kb }), h('td', {}, pad))));
    const wrap = h('div', { class: 'center-wrap panel', style: 'width:min(820px,94vw)' }, h('div', { class: 'h2' }, 'Commandes'),
      h('div', { class: 'muted' }, 'Les touches suivent la position physique : sur un clavier AZERTY, conduisez avec Z Q S D.'), table,
      h('div', { style: 'margin-top:14px' }, this.btn('← Retour', () => this.back(from), 'small default')));
    this.open(wrap, { onBack: () => this.back(from), cls: 'dim' });
  }

  // ------------------------------------------------------------ carte plein écran
  showMap(from = null) {
    const g = this.game;
    const prevState = g.state;
    if (g.state === 'play') g.state = 'pause';
    const canvas = h('canvas', {});
    const info = h('div', { class: 'map-info panel' });
    const legend = h('div', { class: 'map-legend', html: 'Molette / gâchettes : zoom · Glisser / stick : déplacer · Clic / Ⓐ : sélectionner<br>🏁 épreuves · 🟡 fennecs dorés · 📍 destination GPS · ✕ / Ⓑ fermer' });
    const scr = h('div', { class: 'map-screen' }, canvas, info, legend);
    const close = () => {
      this.mapState = null;
      if (from === 'main') this.showMain();
      else if (from === 'pause') this.showPause();
      else { this.close(); g.state = prevState === 'play' ? 'play' : g.state; if (g.state !== 'menu') g.state = 'play'; g.last = performance.now(); }
    };
    this.open(scr, { onBack: close });
    const p = g.player.phys.pos;
    const ms = { canvas, info, cx: p.x, cz: p.z, scale: 0.06, sel: null, drag: null, cursor: null, close, from, hover: null };
    this.mapState = ms;
    const resize = () => { canvas.width = innerWidth * Math.min(2, devicePixelRatio || 1); canvas.height = innerHeight * Math.min(2, devicePixelRatio || 1); };
    resize();
    canvas.addEventListener('wheel', (e) => { ms.scale = Math.max(0.025, Math.min(2.5, ms.scale * (e.deltaY < 0 ? 1.2 : 1 / 1.2))); e.preventDefault(); }, { passive: false });
    canvas.addEventListener('mousedown', (e) => { ms.drag = { x: e.clientX, y: e.clientY, cx: ms.cx, cz: ms.cz, moved: false }; });
    canvas.addEventListener('mousemove', (e) => {
      if (ms.drag) {
        const dpr = canvas.width / innerWidth;
        const dx = e.clientX - ms.drag.x, dy = e.clientY - ms.drag.y;
        if (Math.abs(dx) + Math.abs(dy) > 4) ms.drag.moved = true;
        ms.cx = ms.drag.cx - (dx * dpr) / ms.scale; ms.cz = ms.drag.cz - (dy * dpr) / ms.scale;
      }
    });
    canvas.addEventListener('mouseup', (e) => {
      const moved = ms.drag?.moved;
      ms.drag = null;
      if (moved) return;
      const dpr = canvas.width / innerWidth;
      const wx = ms.cx + ((e.clientX * dpr) - canvas.width / 2) / ms.scale, wz = ms.cz + ((e.clientY * dpr) - canvas.height / 2) / ms.scale;
      this.mapSelect(wx, wz);
    });
    this.mapInfo();
  }

  mapSelect(wx, wz) {
    const ms = this.mapState;
    const g = this.game;
    const tol = 40 / ms.scale;
    let best = null, bd = tol;
    for (const p of POIS) { const d = Math.hypot(p.x - wx, p.z - wz); if (d < bd) { bd = d; best = { kind: 'poi', name: p.name, ar: p.ar, x: p.x, z: p.z, icon: POI_ICON[p.icon] }; } }
    for (const m of g.events.markers) { const d = Math.hypot(m.x - wx, m.z - wz); if (d < bd) { bd = d; best = { kind: 'event', name: m.ev.name, ev: m.ev, x: m.x, z: m.z, yaw: m.sp.yaw }; } }
    if (!best) best = { kind: 'point', name: 'Point sélectionné', x: wx, z: wz };
    ms.sel = best;
    this.mapInfo();
  }

  mapInfo() {
    const ms = this.mapState;
    const g = this.game;
    const d = g.save.data;
    ms.info.innerHTML = '';
    const racing = !!g.events.active;
    if (!ms.sel) {
      ms.info.append(h('div', { class: 'h2', style: 'font-size:26px' }, 'Algérie — 1024 km²'),
        h('div', { class: 'muted', style: 'font-size:16px;line-height:1.5' }, `Lieux découverts : ${d.discovered.length}/${POIS.length}`, h('br'), `Fennecs dorés : ${d.collected.length}/${FENNEC_COUNT}`, h('br'), 'Sélectionnez un lieu ou une épreuve.'),
        h('div', { style: 'margin-top:10px' }, this.btn('✕ Fermer', ms.close, 'small default')));
    } else {
      const s = ms.sel;
      const dist = Math.hypot(s.x - g.player.phys.pos.x, s.z - g.player.phys.pos.z);
      ms.info.append(h('div', { class: 'h2', style: 'font-size:26px' }, `${s.icon || (s.kind === 'event' ? '🏁' : '📍')} ${s.name}`),
        s.ar ? h('div', { class: 'ar', style: 'font-size:20px' }, s.ar) : null,
        h('div', { class: 'muted' }, `À ${(dist / 1000).toFixed(1)} km`),
        s.ev ? h('div', { class: 'muted', style: 'font-size:15px;margin-top:4px' }, s.ev.desc) : null,
        h('div', { style: 'display:flex;flex-direction:column;gap:2px;margin-top:10px' },
          !racing ? this.btn('⚡ Voyage rapide', () => this.fastTravel(s), 'small primary default') : h('div', { class: 'muted' }, 'Voyage rapide indisponible pendant une épreuve'),
          this.btn('📍 Itinéraire GPS', () => { g.minimap.setDestination(s.x, s.z, s.name); this.toast(`GPS : ${s.name}`); ms.close(); }, 'small'),
          g.minimap.gps ? this.btn('Effacer le GPS', () => { g.minimap.clearGps(); this.mapInfo(); }, 'small') : null,
          this.btn('✕ Fermer', ms.close, 'small')));
    }
    const first = ms.info.querySelector('.nav.default') || ms.info.querySelector('.nav');
    if (first) this.setFocus(first, false);
  }

  fastTravel(s) {
    const g = this.game;
    const ms = this.mapState;
    this.mapState = null;
    g.hud.fade();
    if (s.kind === 'event') g.teleport(s.x - Math.sin(s.yaw) * -0, s.z, s.yaw, false);
    else g.teleport(s.x, s.z, null, true);
    g.stunts.cancel();
    this.close();
    if (ms.from === 'main') { g.state = 'menu'; this.showMain(); }
    else { g.state = 'play'; g.hud.show(true); g.last = performance.now(); }
  }

  updateMap(dt) {
    const ms = this.mapState;
    const g = this.game;
    const inp = g.input;
    const c = ms.canvas;
    // manette : stick gauche = déplacement, gâchettes/stick droit = zoom
    const ax = inp.padAxes[0], ay = inp.padAxes[1];
    if (Math.abs(ax) > 0.05 || Math.abs(ay) > 0.05) { ms.cx += ax * dt * 900 / ms.scale * 0.6; ms.cz += ay * dt * 900 / ms.scale * 0.6; ms.cursor = true; }
    const zoom = (inp.padButtons[7] || 0) - (inp.padButtons[6] || 0) - inp.padAxes[3];
    if (Math.abs(zoom) > 0.05) ms.scale = Math.max(0.025, Math.min(2.5, ms.scale * (1 + zoom * dt * 2)));
    if (inp.keys.has('Equal') || inp.keys.has('NumpadAdd')) ms.scale = Math.min(2.5, ms.scale * (1 + dt * 2));
    if (inp.keys.has('Minus') || inp.keys.has('NumpadSubtract')) ms.scale = Math.max(0.025, ms.scale * (1 - dt * 2));
    ms.cx = Math.max(-WORLD_HALF, Math.min(WORLD_HALF, ms.cx));
    ms.cz = Math.max(-WORLD_HALF, Math.min(WORLD_HALF, ms.cz));
    const nav = inp.nav();
    if (ms.cursor && inp.padPressed(0)) { ms.cursor = false; this.mapSelect(ms.cx, ms.cz); return; }
    if (nav.ok && this.focus) this.focus.click();
    if (nav.back || inp.pressed('map')) { ms.close(); return; }
    if (nav.dir === 'up' || nav.dir === 'down') this.move(nav.dir);
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#0a1520'; ctx.fillRect(0, 0, c.width, c.height);
    g.minimap.drawWorld(ctx, { cx: ms.cx, cz: ms.cz, scale: ms.scale, rot: 0, w: c.width, h: c.height }, { big: true, labels: ms.scale > 0.035, showFennecs: true });
    if (ms.cursor) {
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(c.width / 2, c.height / 2, 18, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(c.width / 2 - 28, c.height / 2); ctx.lineTo(c.width / 2 + 28, c.height / 2); ctx.moveTo(c.width / 2, c.height / 2 - 28); ctx.lineTo(c.width / 2, c.height / 2 + 28); ctx.stroke();
    }
    if (ms.sel) {
      const sx = c.width / 2 + (ms.sel.x - ms.cx) * ms.scale, sy = c.height / 2 + (ms.sel.z - ms.cz) * ms.scale;
      ctx.strokeStyle = '#ffd23f'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(sx, sy, 24 + Math.sin(g.time * 5) * 3, 0, Math.PI * 2); ctx.stroke();
    }
    // échelle
    ctx.fillStyle = '#fff'; ctx.font = '600 22px Rajdhani, sans-serif';
    const km = ms.scale > 0.3 ? 0.5 : ms.scale > 0.1 ? 1 : ms.scale > 0.04 ? 2 : 5;
    const px = km * 1000 * ms.scale;
    ctx.fillRect(c.width - px - 40, c.height - 40, px, 4);
    ctx.textAlign = 'center'; ctx.fillText(`${km} km`, c.width - px / 2 - 40, c.height - 55);
  }

  // fermeture du garage → retour
  afterGarage(from) {
    if (from === 'main') this.showMain();
    else this.showPause();
  }
}
