// Ciel physique, soleil/lune, cycle jour-nuit, brouillard et environnement (reflets).
import * as THREE from 'three';
import { Sky } from 'three/examples/jsm/objects/Sky.js';
import { smoothstep, lerp } from './noise.js';

export class Atmosphere {
  constructor(renderer, scene) {
    this.renderer = renderer;
    this.scene = scene;
    this.time = 10.5; // heure de la journée
    this.cycle = true;
    this.dayLengthMin = 24; // minutes réelles pour 24 h de jeu

    this.sky = new Sky();
    this.sky.scale.setScalar(30000);
    this.sky.material.uniforms.turbidity.value = 4;
    this.sky.material.uniforms.rayleigh.value = 1.4;
    this.sky.material.uniforms.mieCoefficient.value = 0.004;
    this.sky.material.uniforms.mieDirectionalG.value = 0.82;
    this.sky.frustumCulled = false;
    scene.add(this.sky);

    this.sun = new THREE.DirectionalLight(0xffffff, 3);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const sc = this.sun.shadow.camera;
    sc.left = -70; sc.right = 70; sc.top = 70; sc.bottom = -70; sc.near = 1; sc.far = 600;
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.6;
    scene.add(this.sun);
    scene.add(this.sun.target);

    this.hemi = new THREE.HemisphereLight(0xbfd8ff, 0x6b5a40, 0.6);
    scene.add(this.hemi);

    this.fog = new THREE.FogExp2(0xbfd0de, 0.00009);
    scene.fog = this.fog;

    // étoiles
    const starGeo = new THREE.BufferGeometry();
    const sp = [];
    for (let i = 0; i < 2500; i++) {
      const u = Math.random() * 2 - 1, t = Math.random() * Math.PI * 2;
      const r = Math.sqrt(1 - u * u);
      if (u < 0.02) continue;
      sp.push(r * Math.cos(t) * 14000, u * 14000, r * Math.sin(t) * 14000);
    }
    starGeo.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3));
    this.stars = new THREE.Points(starGeo, new THREE.PointsMaterial({ color: 0xffffff, size: 2.2, sizeAttenuation: false, transparent: true, opacity: 0, fog: false, depthWrite: false }));
    this.stars.frustumCulled = false;
    scene.add(this.stars);

    // lune
    this.moon = new THREE.Mesh(new THREE.SphereGeometry(260, 24, 16), new THREE.MeshBasicMaterial({ color: 0xf2f0e6, fog: false }));
    scene.add(this.moon);

    this.pmrem = new THREE.PMREMGenerator(renderer);
    this.envScene = new THREE.Scene();
    this.envSky = new Sky();
    this.envSky.scale.setScalar(1000);
    this.envSky.material.uniforms.turbidity.value = 4;
    this.envSky.material.uniforms.rayleigh.value = 1.4;
    this.envScene.add(this.envSky);
    this.envRT = null;
    this.lastEnvTime = -100;

    this.sunDir = new THREE.Vector3();
    this.night = 0;
    this.desertHaze = 0;
    this.fogBase = 0.00009;
    this.update(0, new THREE.Vector3());
  }

  setQuality(q) {
    const sizes = { low: 0, medium: 1024, high: 2048, ultra: 4096 };
    const s = sizes[q] ?? 2048;
    this.sun.castShadow = s > 0;
    if (s > 0 && this.sun.shadow.mapSize.x !== s) {
      this.sun.shadow.mapSize.set(s, s);
      if (this.sun.shadow.map) { this.sun.shadow.map.dispose(); this.sun.shadow.map = null; }
    }
    const ext = q === 'ultra' ? 110 : q === 'high' ? 80 : 60;
    const sc = this.sun.shadow.camera;
    sc.left = -ext; sc.right = ext; sc.top = ext; sc.bottom = -ext;
    sc.updateProjectionMatrix();
    this.fogBase = q === 'low' ? 0.00016 : q === 'medium' ? 0.00011 : 0.00008;
  }

  update(dt, focus, regionZ = 0) {
    if (this.cycle) this.time = (this.time + dt * (24 / (this.dayLengthMin * 60))) % 24;
    const t = this.time;
    // trajectoire solaire : lever 6h (est), coucher 19h (ouest)
    const dayFrac = (t - 6.5) / 12.5;
    const ang = dayFrac * Math.PI;
    const elev = Math.sin(ang) * 1.15; // rad
    const elevC = Math.max(-0.5, Math.min(1.2, elev));
    const az = Math.PI * (1 - dayFrac);
    this.sunDir.set(Math.cos(az) * Math.cos(elevC), Math.sin(elevC), 0.35 * Math.cos(elevC) - 0.15).normalize();
    const day = smoothstep(-0.12, 0.15, this.sunDir.y);
    this.night = 1 - day;
    const golden = smoothstep(0.45, 0.05, this.sunDir.y) * day;

    const u = this.sky.material.uniforms;
    u.sunPosition.value.copy(this.sunDir).multiplyScalar(10000);
    u.rayleigh.value = lerp(1.2, 2.6, golden);
    u.turbidity.value = lerp(3.5, 8, Math.max(golden, this.desertHaze * 0.7));
    this.sky.position.copy(focus);
    this.stars.position.copy(focus);
    this.stars.material.opacity = smoothstep(0.3, 0.9, this.night);
    this.stars.rotation.y = t * 0.05;
    const moonDir = this.sunDir.clone().negate();
    moonDir.y = Math.abs(moonDir.y) * 0.8 + 0.15;
    moonDir.normalize();
    this.moon.position.copy(focus).addScaledVector(moonDir, 13000);
    this.moon.visible = this.night > 0.2;

    // lumières
    const lightDir = day > 0.02 ? this.sunDir : moonDir;
    this.sun.position.copy(focus).addScaledVector(lightDir, 300);
    this.sun.target.position.copy(focus);
    // stabilise l'ombre (alignement sur les texels)
    const sunColor = new THREE.Color().setRGB(1, lerp(0.97, 0.62, golden), lerp(0.92, 0.38, golden));
    const moonColor = new THREE.Color(0.55, 0.65, 0.95);
    this.sun.color.copy(sunColor).lerp(moonColor, this.night);
    this.sun.intensity = lerp(0.2, lerp(2.4, 1.6, golden), day);
    this.hemi.intensity = lerp(0.12, 0.32, day);
    this.hemi.color.setRGB(lerp(0.25, 0.75, day), lerp(0.3, 0.83, day), lerp(0.5, 1.0, day));
    this.hemi.groundColor.setRGB(lerp(0.08, 0.45, day), lerp(0.08, 0.38, day), lerp(0.1, 0.28, day));

    // brouillard
    const fogDay = new THREE.Color(0.74, 0.82, 0.9);
    const fogGold = new THREE.Color(0.95, 0.68, 0.45);
    const fogNight = new THREE.Color(0.03, 0.05, 0.09);
    const fogDesert = new THREE.Color(0.9, 0.78, 0.6);
    const fc = fogDay.clone().lerp(fogDesert, this.desertHaze).lerp(fogGold, golden * 0.8).lerp(fogNight, this.night);
    this.fog.color.copy(fc);
    this.fog.density = this.fogBase * (1 + this.desertHaze * 0.6 + this.night * 0.3);

    this.renderer.toneMappingExposure = lerp(0.45, 0.62, day);

    // environnement (reflets) recalculé périodiquement
    const dtEnv = Math.abs(t - this.lastEnvTime);
    if (dtEnv > 0.25 || !this.envRT) {
      this.lastEnvTime = t;
      const eu = this.envSky.material.uniforms;
      eu.sunPosition.value.copy(this.sunDir).multiplyScalar(1000);
      eu.rayleigh.value = u.rayleigh.value;
      eu.turbidity.value = u.turbidity.value;
      eu.mieCoefficient.value = 0.003;
      if (this.envRT) this.envRT.dispose();
      this.envRT = this.pmrem.fromScene(this.envScene, 0.02);
      this.scene.environment = this.envRT.texture;
      this.scene.environmentIntensity = lerp(0.08, 0.55, day);
    }
  }
}
