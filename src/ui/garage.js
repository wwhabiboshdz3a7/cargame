// Garage : showroom 3D, achat de voitures, personnalisation et améliorations.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { CARS, CAR_BY_ID, PAINTS, FINISHES, RIMS, RIM_COLORS, LIVERIES, NEONS, TIRES, SUSPENSIONS, UPGRADES, upgradeCost, tireCost, suspCost, carStats, defaultConfig } from '../vehicle/carDefs.js';
import { buildCarModel } from '../vehicle/carModel.js';
import { h } from './menus.js';

const TABS = [['perf', 'Performances'], ['paint', 'Peinture'], ['wheels', 'Jantes'], ['style', 'Style'], ['tune', 'Réglages']];

export class Garage {
  constructor(game) {
    this.game = game;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(38, innerWidth / innerHeight, 0.1, 200);
    this.tab = 'perf';
    this.angle = 0.6;
    this.built = false;
  }

  _build() {
    const r = this.game.renderer;
    const pm = new THREE.PMREMGenerator(r);
    this.env = pm.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environment = this.env;
    this.scene.background = new THREE.Color(0x0b0f13);
    this.scene.fog = new THREE.Fog(0x0b0f13, 18, 45);
    const floor = new THREE.Mesh(new THREE.CircleGeometry(30, 64).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x15191d, roughness: 0.35, metalness: 0.4 }));
    floor.receiveShadow = true;
    this.scene.add(floor);
    const tt = new THREE.Mesh(new THREE.CylinderGeometry(4.2, 4.3, 0.12, 64), new THREE.MeshStandardMaterial({ color: 0x23292e, roughness: 0.3, metalness: 0.7 }));
    tt.position.y = 0.06; tt.receiveShadow = true;
    this.scene.add(tt);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(4.25, 0.03, 8, 96).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x00a859 }));
    ring.position.y = 0.12;
    this.scene.add(ring);
    // lignes lumineuses au plafond
    for (let k = -2; k <= 2; k++) {
      const bar = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.05, 12), new THREE.MeshBasicMaterial({ color: 0xffffff }));
      bar.position.set(k * 2.2, 7, 0);
      this.scene.add(bar);
    }
    const key = new THREE.SpotLight(0xffffff, 300, 40, 0.6, 0.5, 1.5);
    key.position.set(4, 9, 5); key.castShadow = true; key.shadow.mapSize.set(2048, 2048);
    this.scene.add(key);
    const rim = new THREE.SpotLight(0x9fd8ff, 160, 40, 0.7, 0.6, 1.5);
    rim.position.set(-6, 6, -6);
    this.scene.add(rim);
    this.scene.add(new THREE.HemisphereLight(0xcfe3ff, 0x1a1a1a, 0.5));
    // mur avec drapeau
    const c = document.createElement('canvas'); c.width = 512; c.height = 128;
    const x = c.getContext('2d');
    x.fillStyle = '#0b0f13'; x.fillRect(0, 0, 512, 128);
    x.font = 'italic bold 84px Rajdhani, Arial'; x.fillStyle = '#00a859'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('DZ', 175, 66);
    x.fillStyle = '#f4f4f0'; x.fillText('DRIVE', 330, 66);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(8, 2), new THREE.MeshBasicMaterial({ map: t, transparent: true }));
    sign.position.set(0, 4.5, -12);
    this.scene.add(sign);
    this.turn = new THREE.Group();
    this.scene.add(this.turn);
    this.built = true;
  }

  open(from) {
    const g = this.game;
    if (!this.built) this._build();
    this.from = from;
    this.prevState = g.state;
    g.state = 'garage';
    g.hud.show(false);
    g.audio.silenceAmbience();
    this.viewId = g.player.car.id;
    this.renderModel();
    this.renderUI();
  }

  close() {
    const g = this.game;
    this.game.menus.extraRoot = null;
    this.ui?.remove();
    this.ui = null;
    g.state = this.from === 'main' ? 'menu' : 'pause';
    g.menus.afterGarage(this.from);
  }

  cfgFor(id) {
    const st = this.game.save.carState(id);
    return st.cfg;
  }

  renderModel() {
    const car = CAR_BY_ID[this.viewId];
    const cfg = this.cfgFor(car.id);
    if (this.model) this.turn.remove(this.model.root);
    this.model = buildCarModel(car, cfg, {});
    this.model.root.traverse((o) => { if (o.isMesh) { o.castShadow = true; } });
    // roues posées au sol
    const zf = this.model.zf, zr = this.model.zr;
    this.model.wheels.forEach((w, i) => {
      const front = i < 2, left = i % 2 === 0;
      const tw = car.body.W - car.body.RW * 0.95;
      w.holder.position.set((left ? -1 : 1) * tw / 2, car.body.R, front ? zf : zr);
      if (front) w.holder.rotation.y = 0.32;
    });
    this.model.root.position.y = 0.12;
    this.turn.add(this.model.root);
    this.model.lightMats.head.emissiveIntensity = 2;
    this.model.lightMats.tail.emissiveIntensity = 1;
  }

  onResize() {
    this.camera.aspect = innerWidth / innerHeight;
    this.camera.updateProjectionMatrix();
  }

  update(dt) {
    const g = this.game;
    const inp = g.input;
    if (inp.mouse.down && !this._uiHover) this.angle += inp.mouse.dx * 0.008;
    this.angle += dt * 0.15 + inp.padAxes[2] * dt * 2;
    this.turn.rotation.y = this.angle;
    const car = CAR_BY_ID[this.viewId];
    const dist = 6.2 + car.body.L * 0.55;
    this.camera.position.set(Math.sin(0.5) * dist, 1.9 + inp.padAxes[3] * 0.5, Math.cos(0.5) * dist);
    this.camera.lookAt(0, 0.7, 0);
    if (this.model?.neon) this.model.neon.material.opacity = 0.45 + 0.15 * Math.sin(g.time * 3);
    const r = g.renderer;
    const prevExp = r.toneMappingExposure;
    r.toneMappingExposure = 0.95;
    r.render(this.scene, this.camera);
    r.toneMappingExposure = prevExp;

  }

  // ------------------------------------------------------------ interface
  renderUI() {
    const g = this.game;
    const save = g.save;
    const money = save.data.money;
    const car = CAR_BY_ID[this.viewId];
    const owned = save.isOwned(car.id);
    const cfg = this.cfgFor(car.id);
    const focusKey = g.menus.focus?.dataset?.key;
    if (this.ui) this.ui.remove();

    const list = CARS.map((c) => {
      const own = save.isOwned(c.id);
      return h('div', { class: `car-item nav ${c.id === this.viewId ? 'sel' : ''}`, 'data-key': 'car_' + c.id, onclick: () => { this.viewId = c.id; this.renderModel(); this.renderUI(); g.audio.click(); } },
        h('div', {}, c.name, h('small', {}, c.cat)),
        own ? (c.id === g.player.car.id ? h('span', { class: 'price' }, '✔ En route') : h('span', { class: 'lock' }, 'Possédée')) : h('span', { class: 'price' }, `${c.price.toLocaleString('fr-FR')} DA`));
    });
    const left = h('div', { class: 'g-left' },
      h('div', { class: 'garage-title' }, 'Garage'),
      h('div', { class: 'money', style: 'margin:4px 0 10px' }, `${money.toLocaleString('fr-FR')} DA`),
      ...list);

    // statistiques
    const base = carStats(car, defaultConfig(car));
    const cur = carStats(car, cfg);
    const stat = (k, label) => h('div', { class: 'stat' }, h('div', { class: 'n' }, h('span', {}, label), h('span', {}, '')),
      h('div', { class: 'b' }, h('i', { class: cur[k] > base[k] + 0.005 ? 'up' : '', style: `width:${Math.max(3, Math.min(1, cur[k]) * 100)}%` })));
    const right = h('div', { class: 'g-right' },
      h('div', { class: 'garage-title' }, car.name),
      h('div', { class: 'muted' }, `${car.cat} · ${car.phys.drive === 'AWD' ? 'Intégrale' : car.phys.drive === 'RWD' ? 'Propulsion' : 'Traction'}`),
      h('div', { style: 'font-size:16px;margin:6px 0 10px' }, car.desc),
      h('div', { class: 'kv' }, h('div', {}, 'Puissance'), h('div', {}, `${cur.hp} ch`), h('div', {}, 'Vitesse max'), h('div', {}, `${cur.topKmh} km/h`), h('div', {}, 'Masse'), h('div', {}, `${cur.mass} kg`)),
      stat('speed', 'Vitesse'), stat('accel', 'Accélération'), stat('handling', 'Tenue de route'), stat('braking', 'Freinage'), stat('offroad', 'Tout-terrain'),
      h('div', { class: 'tabs' }, TABS.map(([id, label]) => h('div', { class: `tab nav ${this.tab === id ? 'on' : ''}`, 'data-key': 'tab_' + id, onclick: () => { this.tab = id; this.renderUI(); } }, label))),
      owned ? this.tabContent(car, cfg) : h('div', { class: 'muted', style: 'font-size:17px' }, 'Achetez ce véhicule pour le personnaliser.'));

    const bottom = h('div', { class: 'g-bottom' },
      h('button', { class: 'btn small nav', 'data-key': 'back', onclick: () => this.close() }, '← Retour'),
      owned
        ? h('button', { class: 'btn small primary nav default', 'data-key': 'drive', onclick: () => { g.spawnPlayer(car.id); g.save.persist(); this.close(); } }, car.id === g.player.car.id ? '✔ Appliquer & rouler' : '▶ Conduire cette voiture')
        : h('button', { class: 'btn small primary nav default', 'data-key': 'buy', disabled: money < car.price ? 'true' : null, onclick: () => this.buyCar(car) }, money < car.price ? `Il manque ${(car.price - money).toLocaleString('fr-FR')} DA` : `Acheter — ${car.price.toLocaleString('fr-FR')} DA`));

    const root = h('div', { class: 'screen garage' }, left, right, bottom);
    root.addEventListener('mouseenter', () => {});
    for (const p of [left, right, bottom]) { p.addEventListener('mouseenter', () => { this._uiHover = true; }); p.addEventListener('mouseleave', () => { this._uiHover = false; }); }
    document.getElementById('ui').appendChild(root);
    this.ui = root;
    const m = g.menus;
    m.close();
    m.extraRoot = root;
    m.current = { el: root, onBack: () => this.close() };
    m.skipFrames = 1;
    const again = focusKey && root.querySelector(`[data-key="${focusKey}"]`);
    m.setFocus(again || root.querySelector('.car-item.sel') || root.querySelector('.nav'), false);
  }

  tabContent(car, cfg) {
    const g = this.game;
    const save = g.save;
    const set = (k, v, rebuild = true) => { cfg[k] = v; save.persist(); if (rebuild) this.renderModel(); this.renderUI(); };
    const pay = (cost, fn) => {
      if (save.data.settings.unlockAll) { fn(); return; }
      if (save.data.money < cost) { g.menus.toast('Fonds insuffisants'); g.audio.fail(); return; }
      save.addMoney(-cost); g.audio.cash(); fn();
    };
    if (this.tab === 'paint') {
      return h('div', {},
        h('div', { class: 'muted' }, 'Couleur'),
        h('div', { class: 'swatches' }, PAINTS.map((c) => h('div', { class: `sw nav ${cfg.color === c ? 'on' : ''}`, 'data-key': 'paint_' + c, style: `background:${c}`, onclick: () => set('color', c) }))),
        h('div', { class: 'setting', style: 'padding:4px 0' }, h('span', {}, 'Couleur personnalisée'), h('input', { type: 'color', value: cfg.color, onchange: (e) => set('color', e.target.value) })),
        h('div', { class: 'muted', style: 'margin-top:8px' }, 'Finition'),
        h('div', { class: 'tabs' }, FINISHES.map((f) => h('div', { class: `tab nav ${cfg.finish === f.id ? 'on' : ''}`, 'data-key': 'fin_' + f.id, onclick: () => set('finish', f.id) }, f.name))),
        h('div', { class: 'muted', style: 'margin-top:8px' }, 'Teinte des vitres'),
        h('div', { class: 'tabs' }, ['Claire', 'Légère', 'Foncée', 'Limousine'].map((n, i) => h('div', { class: `tab nav ${cfg.tint === i ? 'on' : ''}`, 'data-key': 'tint_' + i, onclick: () => set('tint', i) }, n))));
    }
    if (this.tab === 'wheels') {
      return h('div', {},
        h('div', { class: 'muted' }, 'Modèle de jantes'),
        h('div', { class: 'tabs' }, RIMS.map((r) => h('div', { class: `tab nav ${cfg.rim === r.id ? 'on' : ''}`, 'data-key': 'rim_' + r.id, onclick: () => set('rim', r.id) }, r.name))),
        h('div', { class: 'muted', style: 'margin-top:8px' }, 'Couleur des jantes'),
        h('div', { class: 'tabs' }, RIM_COLORS.map((r) => h('div', { class: `tab nav ${cfg.rimColor === r.id ? 'on' : ''}`, 'data-key': 'rimc_' + r.id, onclick: () => set('rimColor', r.id) }, r.name))),
        h('div', { class: 'muted', style: 'margin-top:8px' }, 'Étriers de frein'),
        h('div', { class: 'swatches' }, ['#c0262d', '#f2c40f', '#1d4fa0', '#1f8a4c', '#111214', '#f5f6f8', '#ff7f11', '#6a2c91'].map((c) => h('div', { class: `sw nav ${cfg.caliper === c ? 'on' : ''}`, 'data-key': 'cal_' + c, style: `background:${c}`, onclick: () => set('caliper', c) }))));
    }
    if (this.tab === 'style') {
      return h('div', {},
        h('div', { class: 'muted' }, 'Livrée'),
        h('div', { class: 'tabs' }, LIVERIES.map((l) => h('div', { class: `tab nav ${cfg.livery === l.id ? 'on' : ''}`, 'data-key': 'liv_' + l.id, onclick: () => set('livery', l.id) }, l.name))),
        h('div', { class: 'muted', style: 'margin-top:8px' }, 'Néons sous caisse'),
        h('div', { class: 'tabs' }, NEONS.map((n) => h('div', { class: `tab nav ${cfg.neon === n.id ? 'on' : ''}`, 'data-key': 'neon_' + n.id, onclick: () => set('neon', n.id) }, n.name))),
        h('div', { class: 'muted', style: 'margin-top:8px' }, `Plaque : ${cfg.plate} 16`),
        h('button', { class: 'btn small nav', 'data-key': 'plate', onclick: () => { set('plate', `${Math.floor(10000 + Math.random() * 89999)} ${100 + Math.floor(Math.random() * 25)}`); } }, '🎲 Nouvelle plaque'));
    }
    if (this.tab === 'perf') {
      const rows = [];
      for (const [key, U] of Object.entries(UPGRADES)) {
        const lv = cfg.upgrades[key] || 0;
        const ownedLv = cfg.owned.upgrades[key] || 0;
        const next = lv + 1;
        const max = U.levels.length - 1;
        const cost = next <= max ? upgradeCost(car, key, next) : 0;
        rows.push(h('div', { class: 'upg nav', 'data-key': 'upg_' + key, onclick: () => {
          if (next > max) { cfg.upgrades[key] = 0; save.persist(); this.renderUI(); return; }
          if (next <= ownedLv) { cfg.upgrades[key] = next; save.persist(); this.renderUI(); return; }
          pay(cost, () => { cfg.upgrades[key] = next; cfg.owned.upgrades[key] = next; save.persist(); this.renderUI(); });
        } },
        h('span', {}, U.name, ' ', h('span', { class: 'lv' }, U.levels[lv])),
        next <= max ? h('span', { class: 'cost' }, next <= ownedLv ? `→ ${U.levels[next]} (acquis)` : `→ ${U.levels[next]} · ${cost.toLocaleString('fr-FR')} DA`) : h('span', { class: 'muted' }, 'Max (clic : réinitialiser)')));
      }
      const tireRows = TIRES.map((t) => {
        const own = cfg.owned.tires.includes(t.id);
        const cost = tireCost(car, t.id);
        return h('div', { class: `tab nav ${cfg.tires === t.id ? 'on' : ''}`, 'data-key': 'tire_' + t.id, onclick: () => {
          if (own) set('tires', t.id, false); else pay(cost, () => { cfg.owned.tires.push(t.id); set('tires', t.id, false); });
        } }, `${t.name}${own ? '' : ` · ${(cost / 1000).toFixed(0)}k`}`);
      });
      const suspRows = SUSPENSIONS.map((sp) => {
        const own = cfg.owned.susp.includes(sp.id);
        const cost = suspCost(car, sp.id);
        return h('div', { class: `tab nav ${cfg.susp === sp.id ? 'on' : ''}`, 'data-key': 'susp_' + sp.id, onclick: () => {
          if (own) set('susp', sp.id, false); else pay(cost, () => { cfg.owned.susp.push(sp.id); set('susp', sp.id, false); });
        } }, `${sp.name}${own ? '' : ` · ${(cost / 1000).toFixed(0)}k`}`);
      });
      return h('div', {}, ...rows,
        h('div', { class: 'muted', style: 'margin-top:8px' }, 'Pneumatiques'), h('div', { class: 'tabs' }, tireRows),
        h('div', { class: 'muted', style: 'margin-top:6px' }, 'Suspensions'), h('div', { class: 'tabs' }, suspRows));
    }
    if (this.tab === 'tune') {
      const sl = (label, key, min, max, step, fmt) => h('div', { class: 'setting nav', 'data-key': 'tune_' + key, style: 'font-size:16px;padding:6px' }, h('span', {}, label),
        h('div', { style: 'display:flex;gap:8px;align-items:center' }, h('input', { type: 'range', min, max, step, value: cfg[key], style: 'width:140px', oninput: (e) => { cfg[key] = +e.target.value; e.target.nextSibling.textContent = fmt(+e.target.value); save.persist(); }, onchange: () => { this.renderModel(); } }), h('span', { style: 'min-width:54px' }, fmt(cfg[key]))));
      return h('div', {},
        sl('Hauteur de caisse', 'rideHeight', -0.06, 0.1, 0.01, (v) => `${v > 0 ? '+' : ''}${Math.round(v * 100)} cm`),
        sl('Répartition de freinage (avant)', 'brakeBias', 0.45, 0.8, 0.01, (v) => `${Math.round(v * 100)} %`),
        sl('Sensibilité de direction', 'steerSens', 0.6, 1.4, 0.05, (v) => `${Math.round(v * 100)} %`),
        car.phys.drive === 'AWD' ? sl('Couple vers l\'avant (4x4)', 'split', 0.1, 0.7, 0.05, (v) => `${Math.round(v * 100)} %`) : null,
        h('div', { class: 'muted', style: 'font-size:15px;margin-top:8px' }, 'Les réglages s\'appliquent en cliquant sur « Appliquer & rouler ».'));
    }
    return h('div');
  }

  buyCar(car) {
    const g = this.game;
    if (g.save.data.money < car.price) { g.audio.fail(); return; }
    g.save.addMoney(-car.price);
    g.save.carState(car.id).owned = true;
    g.save.persist();
    g.audio.success();
    g.menus.toast(`${car.name} achetée !`);
    this.renderUI();
  }
}
