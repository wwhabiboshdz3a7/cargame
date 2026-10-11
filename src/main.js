// DZ DRIVE — point d'entrée : construction du monde, boucle de jeu, états.
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import './ui/styles.css';
import { WorldGen } from './world/worldgen.js';
import { Terrain, WorkerPool } from './world/terrain.js';
import { Atmosphere } from './world/sky.js';
import { createSea } from './world/water.js';
import { buildRoads } from './world/roadMesh.js';
import { Colliders } from './world/colliders.js';
import { buildCity } from './world/city.js';
import { buildLandmarks } from './world/landmarks.js';
import { Vegetation } from './world/vegetation.js';
import { terrainTextures } from './world/textures.js';
import { locationName, POIS, WORLD_HALF } from './world/layout.js';
import { Input } from './core/input.js';
import { AudioEngine } from './core/audio.js';
import { Save } from './core/save.js';
import { CAR_BY_ID } from './vehicle/carDefs.js';
import { Vehicle } from './vehicle/vehicle.js';
import { SkidMarks, Particles } from './vehicle/effects.js';
import { CameraRig, CAM_MODES } from './game/camera.js';
import { Stunts } from './game/stunts.js';
import { Events } from './game/events.js';
import { Traffic } from './game/traffic.js';
import { Activities } from './game/activities.js';
import { HUD } from './ui/hud.js';
import { Minimap } from './ui/minimap.js';
import { Menus } from './ui/menus.js';
import { Garage } from './ui/garage.js';

const STEP = 1 / 120;
const nextFrame = () => new Promise((r) => requestAnimationFrame(() => r()));

export const SPAWN = { x: -3560, z: -9900, yaw: -Math.PI / 2 };

class Game {
  constructor() {
    this.save = new Save();
    this.settings = this.save.settings;
    this.input = new Input();
    this.audio = new AudioEngine();
    this.audio.setVolumes({ master: this.settings.volume, music: this.settings.music, sfx: this.settings.sfx });
    this.state = 'loading';
    this.time = 0;
    this.acc = 0;
    this.vehicles = []; // véhicules dynamiques (joueur, IA, épaves)
    this.fxScale = 1;
    this.uidCounter = 0;
    this.paused = false;
  }

  resolveQuality() {
    let q = new URLSearchParams(location.search).get('q') || this.settings.quality;
    if (q === 'auto') {
      const mobile = /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent);
      q = mobile ? 'low' : (navigator.hardwareConcurrency || 4) >= 8 ? 'high' : 'medium';
    }
    return q;
  }

  async init() {
    const ui = document.getElementById('loading');
    const bar = document.getElementById('loadBar');
    const label = document.getElementById('loadLabel');
    const step = async (pct, txt) => { bar.style.width = pct + '%'; label.textContent = txt; await nextFrame(); };

    this.quality = this.resolveQuality();
    await step(3, 'Préparation du moteur graphique…');
    const renderer = new THREE.WebGLRenderer({ antialias: this.quality !== 'low', powerPreference: 'high-performance', stencil: false });
    renderer.setSize(innerWidth, innerHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    document.getElementById('app').appendChild(renderer.domElement);
    this.renderer = renderer;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(65, innerWidth / innerHeight, 0.4, 42000);
    this.scene.add(this.camera);
    window.addEventListener('resize', () => this.onResize());

    await step(8, 'Génération des textures…');
    terrainTextures();
    await step(14, 'Génération du relief algérien (1024 km²)…');
    this.world = new WorldGen();
    this.colliders = new Colliders();
    await step(24, 'Tracé des autoroutes et des routes nationales…');
    this.pool = new WorkerPool(this.world);
    this.terrain = new Terrain(this.scene, this.world, this.pool, this.quality);
    this.atmosphere = new Atmosphere(renderer, this.scene);
    this.atmosphere.time = this.settings.startHour;
    this.atmosphere.cycle = this.settings.timeCycle;
    this.sea = createSea(this.scene);
    this.roads = buildRoads(this.scene, this.world, this.colliders, this.quality);
    await step(36, 'Construction d\'Alger…');
    this.city = buildCity(this.scene, this.world, this.colliders, this.quality);
    await step(50, 'Port, aéroport, Maqam Echahid, Stunt Park…');
    this.landmarks = buildLandmarks(this.scene, this.world, this.colliders, this.quality, this.city);
    await step(60, 'Plantation des forêts et palmeraies…');
    this.vegetation = new Vegetation(this.scene, this.world, this.colliders, this.quality, {
      palm: [...this.city.palms, ...this.landmarks.palms],
      olive: this.city.trees,
      orange: this.landmarks.olives,
    });
    this.skids = new SkidMarks(this.scene);
    this.particles = new Particles(this.scene);
    this.cameraRig = new CameraRig(this.camera, this.world);
    this.cameraRig.mode = this.settings.camera || 0;

    await step(66, 'Interface…');
    this.hud = new HUD(this);
    this.minimap = new Minimap(this);
    this.stunts = new Stunts(this);
    this.events = new Events(this);
    this.traffic = new Traffic(this);
    this.activities = new Activities(this);
    this.menus = new Menus(this);
    this.garage = new Garage(this);
    this.applyQuality(this.quality);

    await step(72, 'Préparation de votre voiture…');
    this.spawnPlayer(this.save.data.selected);
    const lp = this.save.data.lastPos;
    const sp = lp && Math.abs(lp.x) < WORLD_HALF && Math.abs(lp.z) < WORLD_HALF ? lp : SPAWN;
    this.teleport(sp.x, sp.z, sp.yaw, false);

    // carte du monde (worker)
    this.minimap.requestMap();
    // attend le terrain proche
    const t0 = performance.now();
    while (performance.now() - t0 < 25000) {
      this.pool.tickMain(30);
      this.terrain.update(this.camera.position, this.player.phys.pos.y - 2);
      this.vegetation.update(this.player.phys.pos, 0, 30);
      const pending = this.pool.pending;
      const pct = 72 + Math.min(26, 26 * (1 - pending / 120));
      await step(pct, `Chargement du terrain… (${pending} zones)`);
      if (this.terrain.isSettled() && pending === 0) break;
    }
    // stabilise la voiture au sol
    this.teleport(sp.x, sp.z, sp.yaw, false);
    await step(100, 'Prêt !');
    ui.classList.add('hidden');
    this.state = 'menu';
    this.menus.showMain();
    this.last = performance.now();
    renderer.setAnimationLoop((t) => this.loop(t));
    window.__game = this;
    this.debugParams();
    window.__status = () => ({ state: this.state, pending: this.pool.pending, pos: this.player.phys.pos.toArray().map((v) => +v.toFixed(1)), kmh: +(this.player.phys.speed * 3.6).toFixed(1), calls: this.renderer.info.render.calls, tris: this.renderer.info.render.triangles });
  }

  applyQuality(q) {
    this.quality = q;
    const r = this.renderer;
    const dpr = window.devicePixelRatio || 1;
    r.setPixelRatio(q === 'low' ? Math.min(dpr, 0.8) : q === 'medium' ? Math.min(dpr, 1) : q === 'high' ? Math.min(dpr, 1.5) : Math.min(dpr, 2));
    r.shadowMap.enabled = q !== 'low';
    this.atmosphere.setQuality(q);
    this.terrain.setQuality(q);
    this.vegetation.setQuality(q);
    this.viewDist = q === 'low' ? 2500 : q === 'medium' ? 4500 : q === 'high' ? 7000 : 10000;
    this.fxScale = q === 'low' ? 0.4 : q === 'medium' ? 0.7 : 1;
    this.composer = null;
    if (q === 'ultra') {
      const rt = new THREE.WebGLRenderTarget(innerWidth, innerHeight, { type: THREE.HalfFloatType, samples: 4 });
      const comp = new EffectComposer(r, rt);
      comp.addPass(new RenderPass(this.scene, this.camera));
      this.bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.35, 0.6, 0.9);
      comp.addPass(this.bloom);
      comp.addPass(new OutputPass());
      this.composer = comp;
    }
    this.traffic?.setDensity(this.settings.traffic, q);
    this.onResize();
  }

  onResize() {
    if (!this.renderer) return;
    this.camera.aspect = innerWidth / innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(innerWidth, innerHeight);
    if (this.composer) this.composer.setSize(innerWidth, innerHeight);
    this.garage?.onResize();
  }

  newUid() { return ++this.uidCounter; }

  spawnPlayer(carId) {
    const car = CAR_BY_ID[carId] || CAR_BY_ID.atlas;
    let pos = null;
    if (this.player) {
      pos = { x: this.player.phys.pos.x, z: this.player.phys.pos.z, yaw: Math.atan2(-this.player.phys.fwd.x, -this.player.phys.fwd.z) };
      this.player.dispose();
      this.vehicles = this.vehicles.filter((v) => v !== this.player);
      this.engineSound?.stop();
      this.engineSound = null;
    }
    const cfg = this.save.carState(car.id).cfg;
    this.player = new Vehicle(this, car, cfg, { isPlayer: true });
    this.player.uid = this.newUid();
    this.applyAssists();
    this.vehicles.unshift(this.player);
    this.save.data.selected = car.id;
    if (pos) this.teleport(pos.x, pos.z, pos.yaw, false);
    if (this.audio.ctx) this.engineSound = this.audio.createEngine(this.player.params.sound);
  }

  applyAssists() {
    const s = this.settings;
    const p = this.player.phys;
    p.manual = !!s.manual;
    p.assist = { abs: s.abs, tcs: s.tcs, esc: s.esc, steer: s.steerAssist };
  }

  // Place le joueur sur la route la plus proche (ou au point exact)
  teleport(x, z, yaw = null, snapRoad = true) {
    let px = x, pz = z, pyaw = yaw ?? 0;
    if (snapRoad) {
      const rp = this.world.nearestRoadPoint(x, z, 600);
      if (rp) {
        px = rp.x; pz = rp.z;
        if (yaw === null) pyaw = Math.atan2(-rp.tx, -rp.tz);
        // décale sur la voie de droite
        const r = this.world.roads[rp.road];
        const off = r.type === 'highway' ? 1.3 + 3.6 * 1.5 : r.type === 'city' ? 3.4 : 1.8;
        px += -Math.cos(pyaw) * 0 + Math.cos(pyaw) * off;
        pz += -Math.sin(pyaw) * off;
      }
    }
    const h = Math.max(this.world.height(px, pz), 0.5);
    this.player.place(px, h + 0.3, pz, pyaw);
    this.cameraRig.reset();
    this.camera.position.set(px, h + 5, pz + 8);
    this.skids.clear?.();
  }

  respawnOnRoad() {
    const p = this.player.phys.pos;
    this.hud.fade();
    this.teleport(p.x, p.z, null, true);
    this.stunts.cancel();
  }

  // ------------------------------------------------------------ boucle
  loop(t) {
    let dt = Math.min(0.05, (t - this.last) / 1000);
    this.last = t;
    this.time += dt;
    this.input.poll();
    if (this.state === 'garage') {
      this.garage.update(dt);
      this.menus.update(dt);
      this.input.endFrame();
      return;
    }
    const playing = this.state === 'play';
    if (playing) this.updatePlay(dt);
    else this.updateIdle(dt);
    this.updateWorld(dt);
    this.menus.update(dt);
    if (this.composer) this.composer.render(); else this.renderer.render(this.scene, this.camera);
    this.input.endFrame();
    this.save.tick(dt);
    this.hud.fps(dt);
  }

  updateIdle(dt) {
    // menu / pause : caméra orbitale autour de la voiture
    if (this.state === 'menu') this.cameraRig.orbit(dt, this.player.root.position, 8.5, 2.2);
    this.audio.silenceAmbience();
    this.engineSound?.update(this.player.params.idle, 0, this.player.params.redline, false, dt);
  }

  updatePlay(dt) {
    const inp = this.input;
    const P = this.player;
    // actions
    if (inp.pressed('pause')) { this.menus.showPause(); return; }
    if (inp.pressed('map')) { this.menus.showMap(); return; }
    if (inp.pressed('camera')) { const n = this.cameraRig.next(); this.settings.camera = this.cameraRig.mode; this.hud.notify('Caméra : ' + n); }
    if (inp.pressed('lights')) { P.lightsOn = !P.lightsOn; this.audio.click(); }
    if (inp.pressed('siren') && P.params.siren) { P.sirenOn = !P.sirenOn; }
    if (inp.pressed('time')) { this.atmosphere.time = (Math.floor(this.atmosphere.time / 3) * 3 + 3) % 24; this.atmosphere.lastEnvTime = -100; this.hud.notify(`Heure : ${Math.floor(this.atmosphere.time)}h`); }
    if (inp.pressed('reset')) {
      if (this.events.handleReset()) { this.hud.notify('Retour au dernier point de passage'); this.cameraRig.reset(); }
      else if (P.phys.speed < 6 || P.phys.up.y < 0.5) { P.phys.recover(); this.stunts.cancel(); this.hud.notify('Véhicule remis sur ses roues'); }
      else this.respawnOnRoad();
    }
    if (inp.pressed('interact')) this.events.interact();
    if (P.phys.manual) {
      if (inp.pressed('gearUp') && P.phys.gear < P.params.gears.length) { P.phys.gear = P.phys.gear === -1 ? 0 : P.phys.gear + 1; P.phys.shiftTimer = 0.15; }
      if (inp.pressed('gearDown') && P.phys.gear > -1) { P.phys.gear = P.phys.gear - 1; P.phys.shiftTimer = 0.15; if (Math.random() < 0.5) this.audio.backfire(); }
    }
    if (inp.pressed('radio')) { /* réservé */ }

    // commandes du joueur
    const d = inp.drive();
    const ctl = P.phys.controls;
    const frozen = this.events.controlsFrozen();
    ctl.throttle = frozen ? 0 : d.throttle;
    ctl.brake = frozen ? 0 : d.brake;
    // lissage du volant au clavier
    const target = d.steer * (this.save.carState(P.car.id).cfg.steerSens || 1);
    ctl.steer += d.analog ? (target - ctl.steer) : Math.max(-dt * 4.5, Math.min(dt * 4.5, target - ctl.steer));
    ctl.handbrake = frozen ? 1 : d.handbrake;
    ctl.nitro = d.nitro;
    ctl.airPitch = d.airPitch; ctl.airYaw = d.airYaw; ctl.airRoll = d.airRoll;
    P.phys.frozen = this.events.carsFrozen();

    // physique à pas fixe
    this.events.preStep(dt);
    this.acc += dt;
    let steps = 0;
    const dyn = this.vehicles.map((v) => v.phys);
    while (this.acc >= STEP && steps < 8) {
      for (const v of this.vehicles) v.beginStep();
      for (const v of this.vehicles) {
        if (v.ai) v.ai.control(STEP);
        v.phys.step(STEP, dyn);
      }
      this.traffic.step(STEP);
      this.acc -= STEP;
      steps++;
    }
    if (steps >= 8) this.acc = 0;
    const alpha = this.acc / STEP;
    for (const v of this.vehicles) { v.sync(alpha, dt); v.effects(dt); }

    // chocs
    const ph = P.phys;
    if (ph.impact > 3) {
      this.audio.impact(ph.impact);
      this.cameraRig.addShake(Math.min(1, ph.impact / 12));
      inp.rumble(Math.min(1, ph.impact / 15), 0.5, 200);
      this.stunts.onCrash(ph.impact);
    }
    // eau
    if (ph.inWater > 0.05 && !this._splashed) { this.audio.splash(); this._splashed = true; }
    if (ph.inWater === 0) this._splashed = false;
    if (ph.inWater > 2.5) { this.hud.notify('Véhicule à l\'eau ! Retour sur la route.'); this.respawnOnRoad(); }

    this.stunts.update(dt, P);
    this.events.update(dt);
    this.traffic.update(dt);
    this.activities.update(dt);

    // caméra
    this.cameraRig.update(dt, P, inp, inp.held('lookBack'));

    // audio
    if (!this.engineSound && this.audio.ctx) this.engineSound = this.audio.createEngine(P.params.sound);
    this.engineSound?.update(ph.rpm, ph.controls.throttle * (ph.gear === -1 ? 0 : 1) || (ph.gear === -1 ? ph.controls.brake : 0), P.params.redline, P.params.turbo, dt);
    let skid = 0, gravel = 0;
    for (const w of ph.wheels) {
      if (!w.contact) continue;
      const soft = w.surf === 1 || w.surf === 2 || w.surf === 3 || w.surf === 4 || w.surf === 6;
      if (soft) gravel += 0.25; else skid = Math.max(skid, w.skid);
    }
    this.audio.updateAmbience({ skid, gravel, speed: ph.speed, water: ph.inWater > 0 ? 1 : 0, nitro: ph.nitroActive, horn: inp.held('horn'), siren: P.sirenOn, sirenT: this.time });
    if (ph.speed > 3) inp.rumble(0, Math.min(0.4, skid * 0.4 + gravel * ph.speed / 200), 60);

    // statistiques
    const st = this.save.data.stats;
    st.distance += ph.speed * dt;
    st.topSpeed = Math.max(st.topSpeed, ph.speed * 3.6);
    this.save.data.lastPos = { x: ph.pos.x, z: ph.pos.z, yaw: Math.atan2(-ph.fwd.x, -ph.fwd.z) };

    this.hud.update(dt);
  }

  updateWorld(dt) {
    const camPos = this.camera.position;
    const P = this.player;
    const pp = P.phys.pos;
    // brume du désert selon la position
    this.atmosphere.desertHaze = Math.min(1, Math.max(0, (pp.z - 7000) / 2500));
    this.atmosphere.update(this.state === 'play' ? dt : dt * 0.3, camPos);
    const night = this.atmosphere.night;
    if (night > 0.5 && !this._autoLights) { P.lightsOn = true; this._autoLights = true; }
    if (night < 0.3 && this._autoLights) { P.lightsOn = false; this._autoLights = false; }
    this.city.setNight(night);
    this.landmarks.update(this.time, night);
    this.roads.lamps.headMat && (this.roads.lamps.headMat.emissiveIntensity = night * 3);
    this.sea.update(this.time);
    this.pool.tickMain(6);
    this.terrain.update(camPos, this.world.height(camPos.x, camPos.z));
    this.roads.update(camPos, this.viewDist);
    this.vegetation.tick(camPos);
    this.vegetation.update(camPos, dt, 3);
    this.skids.update();
    this.particles.update(dt, this.scene);
    // ombre : suit la caméra / voiture
    this.atmosphere.sun.target.updateMatrixWorld();
  }

  // paramètres d'URL de test : ?car=gt&at=x,z,yaw&play&garage&t=18&cam=1&ev=stunt_park
  debugParams() {
    const q = new URLSearchParams(location.search);
    if (q.has('t')) { this.atmosphere.time = +q.get('t'); this.atmosphere.cycle = false; this.atmosphere.lastEnvTime = -100; }
    if (q.has('car')) this.spawnPlayer(q.get('car'));
    if (q.has('at')) { const [x, z, yaw] = q.get('at').split(',').map(Number); this.teleport(x, z, isNaN(yaw) ? null : yaw, isNaN(yaw)); }
    if (q.has('cam')) this.cameraRig.mode = +q.get('cam');
    if (q.has('garage')) this.garage.open('main');
    else if (q.has('play') || q.has('ev')) { this.menus.close(); this.startPlaying(); }
    if (q.has('ev')) this.events.start(q.get('ev'));
    if (q.has('map')) this.menus.showMap('main');
  }

  location() { return locationName(this.player.phys.pos.x, this.player.phys.pos.z); }

  startPlaying() {
    this.audio.init();
    if (!this.engineSound && this.audio.ctx) this.engineSound = this.audio.createEngine(this.player.params.sound);
    this.audio.setRadio(this.audio.radioStation);
    this.state = 'play';
    this.cameraRig.reset();
    this.hud.show(true);
    this.last = performance.now();
  }
}

const game = new Game();
game.init().catch((e) => {
  console.error(e);
  const l = document.getElementById('loadLabel');
  if (l) l.textContent = 'Erreur de chargement : ' + e.message;
});
export { game, POIS, CAM_MODES };
