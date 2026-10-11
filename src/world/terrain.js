// Gestion du terrain : quadtree LOD, pool de workers, matériau à mélange de textures.
import * as THREE from 'three';
import { WORLD_HALF } from './layout.js';
import { buildChunk, buildIndex, buildMapImage, SEG } from './terrainBuild.js';
import { terrainTextures } from './textures.js';

const MAX_LEVEL = 7; // 32000 / 2^7 = 250 m

export class WorkerPool {
  constructor(world) {
    this.world = world;
    this.workers = [];
    this.queue = [];
    this.busy = new Map();
    this.handlers = new Map();
    this.ready = false;
    const n = Math.max(1, Math.min(4, (navigator.hardwareConcurrency || 4) - 1));
    try {
      const data = world.serialize();
      for (let i = 0; i < n; i++) {
        const w = new Worker(new URL('./terrainWorker.js', import.meta.url), { type: 'module' });
        w.onmessage = (e) => this._onMessage(w, e.data);
        w.onerror = (err) => { console.warn('Worker terrain en erreur, bascule sur le thread principal', err); this._fallback(); };
        w.postMessage({ type: 'init', data });
        w.idle = false;
        this.workers.push(w);
      }
      // sécurité : si aucun worker ne répond, génération sur le thread principal
      setTimeout(() => { if (!this.ready && !this.mainThread) { console.warn('Workers muets : bascule sur le thread principal'); this._fallback(); } }, 5000);
    } catch (err) {
      console.warn('Workers indisponibles', err);
      this._fallback();
    }
  }

  _fallback() {
    for (const w of this.workers) w.terminate();
    this.workers = [];
    this.mainThread = true;
    // remet en file les tâches en cours
    for (const job of this.busy.values()) this.queue.push(job);
    this.busy.clear();
  }

  _onMessage(w, m) {
    if (m.type === 'ready') { w.idle = true; this.ready = true; this.pump(); return; }
    const job = this.busy.get(w);
    this.busy.delete(w);
    w.idle = true;
    if (job && job.cb) job.cb(m);
    this.pump();
  }

  submit(job) { this.queue.push(job); this.pump(); }

  cancel(pred) { this.queue = this.queue.filter((j) => !pred(j)); }

  pump() {
    if (this.mainThread) return;
    for (const w of this.workers) {
      if (!w.idle || !this.queue.length) continue;
      // priorité la plus haute (valeur la plus petite)
      let bi = 0;
      for (let i = 1; i < this.queue.length; i++) if (this.queue[i].prio < this.queue[bi].prio) bi = i;
      const job = this.queue.splice(bi, 1)[0];
      w.idle = false;
      this.busy.set(w, job);
      w.postMessage(job.msg);
    }
  }

  // Exécution sur le thread principal (secours), avec budget de temps
  tickMain(budgetMs = 8) {
    if (!this.mainThread) return;
    const t0 = performance.now();
    while (this.queue.length && performance.now() - t0 < budgetMs) {
      let bi = 0;
      for (let i = 1; i < this.queue.length; i++) if (this.queue[i].prio < this.queue[bi].prio) bi = i;
      const job = this.queue.splice(bi, 1)[0];
      const m = job.msg;
      if (m.type === 'chunk') job.cb({ type: 'chunk', key: m.key, ...buildChunk(this.world, m.x0, m.z0, m.size) });
      else if (m.type === 'map') job.cb({ type: 'map', key: m.key, N: m.N, img: buildMapImage(this.world, m.N, m.x0, m.z0, m.x1, m.z1) });
    }
  }

  get pending() { return this.queue.length + this.busy.size; }
}

export function createTerrainMaterial() {
  const tex = terrainTextures();
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.96, metalness: 0, envMapIntensity: 0.3 });
  mat.userData.uniforms = {
    tGrass: { value: tex.grass }, tRock: { value: tex.rock }, tSand: { value: tex.sand }, tDirt: { value: tex.dirt },
    uTime: { value: 0 },
  };
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, mat.userData.uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
attribute vec4 splat;
varying vec4 vSplat;
varying vec3 vWPos;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
vSplat = splat;
vWPos = (modelMatrix * vec4(position, 1.0)).xyz;`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
uniform sampler2D tGrass, tRock, tSand, tDirt;
uniform float uTime;
varying vec4 vSplat;
varying vec3 vWPos;
float th21(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
vec3 srgb2lin(vec3 c) { return pow(c, vec3(2.2)); }
vec3 fieldColor(vec2 p, out float stripeMask) {
  float a = 0.35;
  vec2 q = mat2(cos(a), -sin(a), sin(a), cos(a)) * p;
  vec2 cell = vec2(170.0, 115.0);
  float row = floor(q.y / cell.y);
  q.x += th21(vec2(row, 3.1)) * 120.0;
  vec2 id = floor(q / cell);
  vec2 f = fract(q / cell);
  float h = th21(id);
  vec3 c;
  float st = 0.0;
  if (h < 0.28) { c = vec3(0.80, 0.66, 0.33); st = 0.6; }
  else if (h < 0.52) { c = vec3(0.33, 0.48, 0.17); st = 1.0; }
  else if (h < 0.70) { c = vec3(0.45, 0.33, 0.22); st = 1.0; }
  else if (h < 0.86) { c = vec3(0.55, 0.58, 0.27); st = 0.5; }
  else { c = vec3(0.30, 0.40, 0.18); st = 0.0; }
  float dir = th21(id + 7.0) > 0.5 ? f.x * cell.x : f.y * cell.y;
  stripeMask = st;
  c *= 1.0 - st * 0.12 * (0.5 + 0.5 * sin(dir * 1.4));
  float edge = min(min(f.x, 1.0 - f.x) * cell.x, min(f.y, 1.0 - f.y) * cell.y);
  c = mix(vec3(0.22, 0.30, 0.14), c, smoothstep(0.8, 2.5, edge));
  return srgb2lin(c);
}`)
      .replace('#include <color_fragment>', `
vec2 wuv = vWPos.xz;
float camDist = length(vWPos - cameraPosition);
float far = smoothstep(150.0, 900.0, camDist);
vec3 g = mix(texture2D(tGrass, wuv * 0.12).rgb, texture2D(tGrass, wuv * 0.017).rgb, 0.35 + 0.4 * far);
vec3 r = mix(texture2D(tRock, wuv * 0.06).rgb, texture2D(tRock, wuv * 0.009).rgb, 0.3 + 0.4 * far);
vec3 s = mix(texture2D(tSand, wuv * 0.09).rgb, texture2D(tSand, wuv * 0.011).rgb, 0.3 + 0.5 * far);
vec3 d = mix(texture2D(tDirt, wuv * 0.1).rgb, texture2D(tDirt, wuv * 0.014).rgb, 0.3 + 0.4 * far);
float macro = texture2D(tGrass, wuv * 0.0011).r;
vec3 tint = vColor.rgb;
vec4 w = vSplat / max(0.001, vSplat.x + vSplat.y + vSplat.z + vSplat.w);
float desert = smoothstep(7000.0, 9200.0, vWPos.z);
vec3 rockTint = mix(vec3(1.0), vec3(1.30, 0.80, 0.55), desert);
vec3 col = g * tint * 1.55 * w.x + r * rockTint * 0.75 * w.y + s * tint * 1.0 * w.z + d * 0.62 * w.w;
float stripe;
vec3 fc = fieldColor(vWPos.xz, stripe) * (0.6 + 0.35 * g.g);
col = mix(col, fc, vColor.a * (1.0 - w.y));
col *= 0.82 + 0.36 * macro;
// sable mouillé / écume près du rivage
float wet = 1.0 - smoothstep(-0.3, 0.9, vWPos.y);
col *= 1.0 - 0.35 * wet;
float foam = smoothstep(0.25, 0.0, abs(vWPos.y - 0.05 - 0.12 * sin(uTime * 0.9 + vWPos.x * 0.05)));
col = mix(col, vec3(0.9), foam * 0.55);
diffuseColor.rgb = col;
`);
  };
  return mat;
}

export class Terrain {
  constructor(scene, world, pool, quality) {
    this.scene = scene;
    this.world = world;
    this.pool = pool;
    this.material = createTerrainMaterial();
    this.index = new THREE.BufferAttribute(buildIndex(), 1);
    this.nodes = new Map(); // key -> {level, ix, iz, mesh, state, used}
    this.group = new THREE.Group();
    this.group.name = 'terrain';
    scene.add(this.group);
    this.splitFactor = 1.4;
    this.visible = new Set();
    this.frame = 0;
    this.lastCam = new THREE.Vector3(1e9, 0, 0);
    this.setQuality(quality);
    this.shadows = false;
  }

  setQuality(q) {
    this.splitFactor = q === 'low' ? 1.05 : q === 'medium' ? 1.35 : q === 'high' ? 1.7 : 2.1;
    this.lastCam.set(1e9, 0, 0);
  }

  static key(level, ix, iz) { return level * 100000000 + ix * 10000 + iz; }

  nodeInfo(level, ix, iz) {
    const size = (WORLD_HALF * 2) / (1 << level);
    return { size, x0: -WORLD_HALF + ix * size, z0: -WORLD_HALF + iz * size };
  }

  request(level, ix, iz, prio) {
    const key = Terrain.key(level, ix, iz);
    let n = this.nodes.get(key);
    if (n) { n.used = this.frame; if (n.state === 'queued') n.job.prio = prio; return n; }
    const { size, x0, z0 } = this.nodeInfo(level, ix, iz);
    n = { key, level, ix, iz, size, x0, z0, state: 'queued', used: this.frame, mesh: null };
    const job = {
      prio, key,
      msg: { type: 'chunk', key, x0, z0, size },
      cb: (m) => this._onChunk(n, m),
    };
    n.job = job;
    this.nodes.set(key, n);
    this.pool.submit(job);
    return n;
  }

  _onChunk(n, m) {
    if (n.state === 'disposed') return;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(m.pos, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(m.nor, 3, true));
    geo.setAttribute('splat', new THREE.BufferAttribute(m.spl, 4, true));
    geo.setAttribute('color', new THREE.BufferAttribute(m.col, 4, true));
    geo.setIndex(this.index);
    const cx = n.x0 + n.size / 2, cz = n.z0 + n.size / 2;
    geo.boundingBox = new THREE.Box3(new THREE.Vector3(n.x0, m.minY, n.z0), new THREE.Vector3(n.x0 + n.size, m.maxY, n.z0 + n.size));
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(cx, (m.minY + m.maxY) / 2, cz),
      Math.hypot(n.size / 2, n.size / 2, (m.maxY - m.minY) / 2));
    const mesh = new THREE.Mesh(geo, this.material);
    mesh.matrixAutoUpdate = false;
    mesh.receiveShadow = true;
    mesh.visible = false;
    n.mesh = mesh;
    n.state = 'ready';
    n.minY = m.minY; n.maxY = m.maxY;
    this.group.add(mesh);
    this.dirty = true;
  }

  update(cam, groundY = 0) {
    this.frame++;
    this.material.userData.uniforms.uTime.value = performance.now() / 1000;
    const moved = cam.distanceToSquared(this.lastCam) > 16 * 16;
    if (!moved && !this.dirty && this.frame % 30 !== 0) return;
    this.dirty = false;
    if (moved) this.lastCam.copy(cam);
    const desired = [];
    const height = Math.max(0, cam.y - groundY);
    const sel = (level, ix, iz) => {
      const { size, x0, z0 } = this.nodeInfo(level, ix, iz);
      const dx = Math.max(x0 - cam.x, 0, cam.x - (x0 + size));
      const dz = Math.max(z0 - cam.z, 0, cam.z - (z0 + size));
      const d = Math.sqrt(dx * dx + dz * dz + height * height * 0.5);
      if (level < MAX_LEVEL && d < size * this.splitFactor) {
        for (let a = 0; a < 2; a++) for (let b = 0; b < 2; b++) sel(level + 1, ix * 2 + a, iz * 2 + b);
      } else {
        desired.push({ level, ix, iz, d });
      }
    };
    sel(0, 0, 0);
    // toujours garder les niveaux grossiers chargés (secours)
    for (let l = 0; l <= 2; l++) {
      const c = 1 << l;
      for (let a = 0; a < c; a++) for (let b = 0; b < c; b++) this.request(l, a, b, -100 + l);
    }
    const renderSet = new Set();
    for (const dn of desired) {
      const n = this.request(dn.level, dn.ix, dn.iz, dn.d / 1000 - dn.level * 0.5);
      if (n.state === 'ready') { renderSet.add(n); continue; }
      // ancêtre prêt le plus proche
      let l = dn.level, ix = dn.ix, iz = dn.iz;
      while (l > 0) {
        l--; ix >>= 1; iz >>= 1;
        const a = this.nodes.get(Terrain.key(l, ix, iz));
        if (a && a.state === 'ready') { a.used = this.frame; renderSet.add(a); break; }
      }
    }
    // supprime les noeuds dont un ancêtre est déjà rendu
    const final = new Set();
    for (const n of renderSet) {
      let l = n.level, ix = n.ix, iz = n.iz, covered = false;
      while (l > 0) {
        l--; ix >>= 1; iz >>= 1;
        const a = this.nodes.get(Terrain.key(l, ix, iz));
        if (a && renderSet.has(a)) { covered = true; break; }
      }
      if (!covered) final.add(n);
    }
    for (const n of this.visible) if (!final.has(n) && n.mesh) n.mesh.visible = false;
    for (const n of final) n.mesh.visible = true;
    this.visible = final;
    // annule les tâches devenues inutiles
    const keep = new Set(desired.map((d) => Terrain.key(d.level, d.ix, d.iz)));
    this.pool.cancel((j) => j.msg.type === 'chunk' && !keep.has(j.key) && Math.floor(j.key / 100000000) > 2 && this._dropQueued(j.key));
    // purge LRU
    if (this.nodes.size > 900) {
      const arr = [...this.nodes.values()].filter((n) => n.state === 'ready' && n.level > 2 && !final.has(n));
      arr.sort((a, b) => a.used - b.used);
      for (let i = 0; i < arr.length - 500; i++) this._dispose(arr[i]);
    }
  }

  _dropQueued(key) {
    const n = this.nodes.get(key);
    if (n && n.state === 'queued') { this.nodes.delete(key); return true; }
    return false;
  }

  _dispose(n) {
    if (n.mesh) { this.group.remove(n.mesh); n.mesh.geometry.dispose(); }
    n.state = 'disposed';
    this.nodes.delete(n.key);
  }

  // Tous les noeuds proches sont-ils chargés ?
  isSettled() {
    for (const n of this.nodes.values()) if (n.state === 'queued' && n.level >= 5) return false;
    return true;
  }
}
